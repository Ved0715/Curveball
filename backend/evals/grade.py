"""Case loading and programmatic graders for the evals. No model calls here.

Report scoring metrics (per case, per rep):
  honest        every answer's score is inside its expected band (e.g. vague ≤ 5)   [headline]
  overall_band  overall score and verdict inside the expected range
  answer_count  exactly one entry per main question (follow-ups folded in)
  grounded      every "stronger answer" mentions something real from the resume
  overall       the raw overall score (0-100), for reading spread across reps

Resume extraction metrics:
  precision     share of the model's raw items that are really in the resume (1.0 = invented nothing)
  recall        share of must-find items present in the final profile
"""

import json
import re
import statistics
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.prompts.resume import ResumeProfile
from app.schemas import Setup, Turn

CASES_DIR = Path(__file__).parent / "cases"


# ---------- Report scoring cases ----------


@dataclass
class ReportCase:
    id: str
    why: str
    tags: list[str]
    setup: Setup
    transcript: list[Turn]
    expect: dict[str, Any]

    @property
    def main_questions(self) -> int:
        return sum(1 for t in self.transcript if t.kind == "question")


def _turns(raw: list[dict[str, str]]) -> list[Turn]:
    kinds = {
        "q": ("interviewer", "question"),
        "f": ("interviewer", "followup"),
        "close": ("interviewer", "closing"),
    }
    out: list[Turn] = []
    for item in raw:
        ((key, text),) = item.items()
        if key == "a":
            out.append(Turn(speaker="candidate", text=text))
        else:
            speaker, kind = kinds[key]
            out.append(Turn.model_validate({"speaker": speaker, "text": text, "kind": kind}))
    return out


def load_report_cases(
    path: Path = CASES_DIR / "report_scoring.json",
) -> tuple[list[ReportCase], dict[str, Any]]:
    data = json.loads(path.read_text())
    personas = data["personas"]
    raw_transcripts = {c["id"]: c["transcript"] for c in data["cases"] if isinstance(c["transcript"], list)}
    cases = []
    for c in data["cases"]:
        persona = personas[c["persona"]]
        t = c["transcript"]
        if isinstance(t, str) and t.startswith("same-as:"):
            t = raw_transcripts[t.removeprefix("same-as:")]
        setup = Setup.model_validate(
            {**c["setup"], "question_count": 4, "jd": persona["jd"], "resume": persona["resume"]}
        )
        cases.append(ReportCase(c["id"], c["why"], c["tags"], setup, _turns(t), c["expect"]))
    return cases, {"cross_checks": data.get("cross_checks", []), "consistency": data.get("consistency", {})}


@dataclass
class Grade:
    scores: dict[str, float] = field(default_factory=dict)
    explanation: dict[str, str] = field(default_factory=dict)

    def set(self, metric: str, ok: bool | float, why: str = "") -> None:
        self.scores[metric] = float(ok)
        if why:
            self.explanation[metric] = why


def grade_report(case: ReportCase, report: dict[str, Any]) -> Grade:
    g = Grade()
    exp = case.expect
    answers: list[dict[str, Any]] = report.get("answers", [])
    overall = int(report.get("overall", -1))
    verdict = str(report.get("verdict", ""))

    # honest: per-answer bands, matched by position (one entry per main question, in order)
    bands: list[dict[str, int]] = exp.get("answers", [])
    misses = []
    for i, band in enumerate(bands):
        if i >= len(answers):
            misses.append(f"Q{i + 1}: missing")
            continue
        sc = int(answers[i].get("score", 0))
        if "max" in band and sc > band["max"]:
            misses.append(f"Q{i + 1}: {sc} > max {band['max']}")
        if "min" in band and sc < band["min"]:
            misses.append(f"Q{i + 1}: {sc} < min {band['min']}")
    g.set("honest", not misses, "; ".join(misses))

    lo, hi = exp["overall"]
    band_problems = []
    if not lo <= overall <= hi:
        band_problems.append(f"overall {overall} not in [{lo}, {hi}]")
    if verdict not in exp["verdict_in"]:
        band_problems.append(f"verdict '{verdict}' not in {exp['verdict_in']}")
    g.set("overall_band", not band_problems, "; ".join(band_problems))

    want = case.main_questions
    g.set(
        "answer_count",
        len(answers) == want,
        "" if len(answers) == want else f"{len(answers)} entries, {want} main questions",
    )

    anchors = [a.lower() for a in exp.get("anchors", [])]
    ungrounded = [
        f"Q{i + 1}"
        for i, a in enumerate(answers)
        if anchors and not any(x in a.get("better", "").lower() for x in anchors)
    ]
    g.set("grounded", not ungrounded, ("no resume detail in: " + ", ".join(ungrounded)) if ungrounded else "")

    g.scores["overall"] = float(overall)
    return g


def cross_checks(overall_by_case: dict[str, list[float]], meta: dict[str, Any]) -> list[dict[str, Any]]:
    """Checks across cases and reps: level calibration and scoring consistency."""
    out = []
    for chk in meta.get("cross_checks", []):
        hi, lo = overall_by_case.get(chk["higher"], []), overall_by_case.get(chk["lower"], [])
        if not hi or not lo:
            out.append({"id": chk["id"], "pass": None, "detail": "missing results"})
            continue
        gap = statistics.mean(hi) - statistics.mean(lo)
        out.append(
            {
                "id": chk["id"],
                "pass": gap >= chk["min_gap"],
                "detail": f"gap {gap:.1f} (need ≥ {chk['min_gap']})",
            }
        )
    max_sd = meta.get("consistency", {}).get("max_overall_sd")
    if max_sd is not None:
        spreads = {cid: statistics.pstdev(v) for cid, v in overall_by_case.items() if len(v) > 1}
        worst = max(spreads.items(), key=lambda kv: kv[1], default=None)
        out.append(
            {
                "id": "consistency",
                "pass": None if worst is None else worst[1] <= max_sd,
                "detail": "needs ≥ 2 reps"
                if worst is None
                else f"worst sd {worst[1]:.1f} on {worst[0]} (need ≤ {max_sd})",
            }
        )
    return out


# ---------- Resume extraction cases ----------


@dataclass
class ResumeCase:
    id: str
    why: str
    tags: list[str]
    resume: str
    must_find: dict[str, list[str]]


def load_resume_cases(path: Path = CASES_DIR / "resume_extraction.json") -> list[ResumeCase]:
    data = json.loads(path.read_text())
    personas = json.loads((CASES_DIR / "report_scoring.json").read_text())["personas"]
    return [
        ResumeCase(
            c["id"],
            c["why"],
            c["tags"],
            c.get("resume") or personas[c["resume_from_persona"]]["resume"],
            c["must_find"],
        )
        for c in data["cases"]
    ]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


def _num_key(s: str) -> str:
    return re.sub(r"[^0-9a-z%.]", "", s.lower())


def grade_resume(case: ResumeCase, raw: ResumeProfile, grounded: ResumeProfile, dropped: int) -> Grade:
    g = Grade()
    raw_items = len(raw.experience) + len(raw.projects) + len(raw.metrics) + len(raw.skills)
    precision = 1.0 if raw_items == 0 else (raw_items - dropped) / raw_items
    g.set(
        "precision", precision, f"{dropped} of {raw_items} items not found in the resume" if dropped else ""
    )

    found_companies = [_norm(r.company) for r in grounded.experience]
    found_projects = [_norm(p.name) for p in grounded.projects]
    found_metrics = [_num_key(m.value) + " " + _num_key(m.context) for m in grounded.metrics]
    found_skills = [_norm(s) for s in grounded.skills]

    def hit(want: str, pool: list[str], key: Any = _norm) -> bool:
        w = key(want)
        return any(w in p or p in w for p in pool if p)

    missing: list[str] = []
    total = 0
    for kind, label, pool, key in (
        ("companies", "company", found_companies, _norm),
        ("projects", "project", found_projects, _norm),
        ("metrics", "metric", found_metrics, _num_key),
        ("skills", "skill", found_skills, _norm),
    ):
        for want in case.must_find.get(kind, []):
            total += 1
            if not hit(want, pool, key):
                missing.append(f"{label} '{want}'")
    recall = 1.0 if total == 0 else (total - len(missing)) / total
    g.set("recall", recall, ("missing " + ", ".join(missing)) if missing else "")
    return g
