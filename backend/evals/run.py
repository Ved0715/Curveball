"""Run an eval through the real pipeline and grade it.

    uv run python -m evals.run report              # report scoring, 3 reps  (paid: Opus + Haiku)
    uv run python -m evals.run resume              # resume extraction, 2 reps (paid: Haiku)
    uv run python -m evals.run report --list       # show the cases, no calls
    uv run python -m evals.run report --mock       # wiring check with canned AI, free

Options: --reps N  --cases id1,id2  --variant baseline  --concurrency 3  --timeout-s 300

Results go to .claude/hillclimb/<flow>/<variant>/ (results.jsonl, traces/, errors.jsonl,
checks.json); mock runs go to .claude/hillclimb/<flow>-mock/. Re-running resumes: finished (case, rep) pairs are skipped. Failed attempts
(timeouts, API errors, invalid output) go to errors.jsonl and are never scored as zeros.
"""

import argparse
import asyncio
import json
import math
import random
import sys
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

from app import llm, mock, resume_profile
from app.config import get_settings
from app.llm import AIError
from app.prompts.report import Report, report_prompt
from app.prompts.resume import ResumeProfile, profile_text, resume_prompt
from app.routers.sessions import SYSTEM_COACH
from app.schemas import ReportRequest
from app.streaming import Tally, structured
from evals.grade import (
    Grade,
    ReportCase,
    ResumeCase,
    cross_checks,
    grade_report,
    grade_resume,
    load_report_cases,
    load_resume_cases,
)

ROOT = Path(__file__).resolve().parents[2]
FLOWS = {"report": "report-scoring", "resume": "resume-extraction"}
METRICS: dict[str, list[dict[str, Any]]] = {
    "report": [
        {"id": "honest", "label": "Honest bands", "kind": "binary"},
        {"id": "overall_band", "label": "Overall band", "kind": "binary"},
        {"id": "answer_count", "label": "1 per question", "kind": "binary"},
        {"id": "grounded", "label": "Uses resume", "kind": "binary"},
        {"id": "overall", "label": "Overall score", "kind": "float", "scale": 100},
    ],
    "resume": [
        {"id": "precision", "label": "No invention", "kind": "float", "scale": 1},
        {"id": "recall", "label": "Found facts", "kind": "float", "scale": 1},
    ],
}
PERF: list[dict[str, str]] = [
    {"id": "latency_s", "label": "Latency", "unit": "s"},
    {"id": "in_tokens", "label": "In tok"},
    {"id": "out_tokens", "label": "Out tok"},
]
# First-party $ per million tokens (input, output), for the printed estimate only.
PRICES = {"claude-opus-5": (5.0, 25.0), "claude-sonnet-5": (2.0, 10.0), "claude-haiku-4-5": (1.0, 5.0)}
RETRYABLE = {"rate_limited", "overloaded", "upstream"}


@dataclass
class Outcome:
    grade: Grade
    trace: list[dict[str, Any]]
    tally: Tally
    requested_model: str
    prompt_summary: str


# ---------- Running one case ----------

_profile_cache: dict[str, tuple[ResumeProfile, ResumeProfile, int]] = {}
_profile_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


async def _profile_for(case_id: str, resume: str, tally: Tally) -> ResumeProfile:
    """Extract once per case and reuse across reps, as production does per resume."""
    async with _profile_locks[case_id]:
        if case_id not in _profile_cache:
            _profile_cache[case_id] = await resume_profile.extract_detailed(resume, tally)
    return _profile_cache[case_id][1]


async def run_report_case(case: ReportCase) -> Outcome:
    s = get_settings()
    tally = Tally()
    profile = await _profile_for(case.id, case.setup.resume, tally) if case.setup.resume.strip() else None
    req = ReportRequest(setup=case.setup, interviewer="Priya", transcript=case.transcript)
    prompt = report_prompt(req, profile_text(profile) if profile else None)

    def make(_attempt: int) -> Any:
        if s.ai_mock:
            return mock.mock_report(req.transcript)
        return llm.stream("capable", SYSTEM_COACH, prompt, s.max_tokens_report, schema=Report)

    result: Report | None = None
    async for item in structured(make, Report, lambda _b: None, tally):
        if isinstance(item, Report):
            result = item
    assert result is not None
    content = result.model_dump(by_alias=True)
    return Outcome(
        grade=grade_report(case, content),
        trace=[
            {"role": "system", "content": SYSTEM_COACH},
            {"role": "user", "content": prompt},
            {
                "role": "assistant",
                "content": "```json\n" + json.dumps(content, indent=2, ensure_ascii=False) + "\n```",
            },
        ],
        tally=tally,
        requested_model="mock" if s.ai_mock else llm.model_for("capable"),
        prompt_summary=f"{case.why}\n\n{case.setup.role} · {case.setup.level} · {case.setup.round}",
    )


async def run_resume_case(case: ResumeCase) -> Outcome:
    s = get_settings()
    tally = Tally()
    raw, grounded, dropped = await resume_profile.extract_detailed(case.resume, tally)
    return Outcome(
        grade=grade_resume(case, raw, grounded, dropped),
        trace=[
            {"role": "user", "content": resume_prompt(case.resume, s.max_chars_resume)},
            {
                "role": "assistant",
                "content": "Model output:\n```json\n" + raw.model_dump_json(indent=2) + "\n```\n\n"
                f"After grounding ({dropped} item(s) dropped):\n```json\n"
                + grounded.model_dump_json(indent=2)
                + "\n```",
            },
        ],
        tally=tally,
        requested_model="mock" if s.ai_mock else llm.model_for("fast"),
        prompt_summary=case.why,
    )


# ---------- Harness ----------


def _jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def _append(path: Path, row: dict[str, Any]) -> None:
    with path.open("a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _classify(e: BaseException) -> str:
    if isinstance(e, TimeoutError):
        return "timeout"
    if isinstance(e, AIError):
        return {"refused": "refusal", "invalid_output": "invalid_output"}.get(e.code, f"api_{e.code}")
    return "harness_error"


async def run_one(
    case_id: str,
    tags: list[str],
    rep: int,
    runner: Callable[[], Awaitable[Outcome]],
    vdir: Path,
    timeout_s: float,
) -> dict[str, Any] | None:
    attempts = 0
    while True:
        attempts += 1
        t0 = time.monotonic()
        try:
            out = await asyncio.wait_for(runner(), timeout_s)
            break
        except Exception as e:
            cls = _classify(e)
            retry = isinstance(e, AIError) and e.code in RETRYABLE and attempts < 4
            _append(
                vdir / "errors.jsonl",
                {"prompt_id": case_id, "rep": rep, "class": cls, "attempt": attempts, "detail": str(e)[:300]},
            )
            if not retry:
                print(f"  ✗ {case_id} rep {rep}: {cls}")
                return None
            await asyncio.sleep(min(60, 2**attempts) * (0.5 + random.random()))
    latency = time.monotonic() - t0
    mismatch = bool(out.tally.model) and not out.tally.model.startswith(out.requested_model)
    if mismatch:
        print(f"  ⚠ {case_id} rep {rep}: served by {out.tally.model}, requested {out.requested_model}")
    row = {
        "prompt_id": case_id,
        "rep": rep,
        "prompt": out.prompt_summary,
        "tags": tags,
        "status": "ok",
        "grade": out.grade.scores,
        "explanation": out.grade.explanation,
        "model": out.tally.model or out.requested_model,
        "usage": {"input_tokens": out.tally.tokens_in, "output_tokens": out.tally.tokens_out},
        "latency_s": round(latency, 2),
        "in_tokens": out.tally.tokens_in,
        "out_tokens": out.tally.tokens_out,
        "meta": {"requested_model": out.requested_model, "attempts": attempts, "model_mismatch": mismatch},
    }
    (vdir / "traces").mkdir(exist_ok=True)
    (vdir / "traces" / f"{case_id}_rep{rep}.json").write_text(
        json.dumps(out.trace, indent=2, ensure_ascii=False)
    )
    _append(vdir / "results.jsonl", row)
    fails = [m for m, v in out.grade.scores.items() if v == 0.0 and m != "overall"]
    mark = "✓" if not fails else "✗"
    print(f"  {mark} {case_id} rep {rep}  " + " ".join(f"{m}={v:g}" for m, v in out.grade.scores.items()))
    return row


def wilson(passes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = passes / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def summarize(flow: str, vdir: Path, meta: dict[str, Any]) -> bool:
    rows = [r for r in _jsonl(vdir / "results.jsonl") if r.get("status") == "ok"]
    errors = _jsonl(vdir / "errors.jsonl")
    ok_keys = {(r["prompt_id"], r["rep"]) for r in rows}
    unresolved = {(e["prompt_id"], e["rep"]) for e in errors} - ok_keys
    print(f"\n{len(rows)} scored rows, {len(unresolved)} unscored (see errors.jsonl)")
    all_ok = not unresolved
    for m in METRICS[flow]:
        mid = str(m["id"])
        vals = [float(r["grade"][mid]) for r in rows if mid in r["grade"]]
        if not vals:
            continue
        if m["kind"] == "binary":
            passes = int(sum(vals))
            lo, hi = wilson(passes, len(vals))
            print(
                f"  {m['label']:<15} {passes}/{len(vals)} = {passes / len(vals):.0%}  (95% CI {lo:.0%}–{hi:.0%})"
            )
            all_ok &= passes == len(vals)
        else:
            mean = sum(vals) / len(vals)
            print(f"  {m['label']:<15} mean {mean:.2f}  (min {min(vals):.2f})")
            if flow == "resume" and m["id"] == "precision":
                all_ok &= min(vals) == 1.0
    checks: list[dict[str, Any]] = []
    if flow == "report":
        by_case: dict[str, list[float]] = defaultdict(list)
        for r in rows:
            by_case[r["prompt_id"]].append(r["grade"]["overall"])
        checks = cross_checks(by_case, meta)
        for c in checks:
            mark = "✓" if c["pass"] else ("·" if c["pass"] is None else "✗")
            print(f"  {mark} {c['id']}: {c['detail']}")
            all_ok &= c["pass"] is not False
    (vdir / "checks.json").write_text(json.dumps(checks, indent=2))

    tin = sum(r["usage"]["input_tokens"] for r in rows)
    tout = sum(r["usage"]["output_tokens"] for r in rows)
    cost = 0.0
    for r in rows:
        pin, pout = next((v for k, v in PRICES.items() if str(r["model"]).startswith(k)), (0.0, 0.0))
        cost += r["usage"]["input_tokens"] / 1e6 * pin + r["usage"]["output_tokens"] / 1e6 * pout
    print(f"  tokens in {tin:,} / out {tout:,}  ≈ ${cost:.2f} (scored rows; list prices)")
    return all_ok


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("flow", choices=sorted(FLOWS))
    ap.add_argument("--reps", type=int)
    ap.add_argument("--cases", help="comma-separated case ids")
    ap.add_argument("--variant", default="baseline")
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--timeout-s", type=float, default=300)
    ap.add_argument("--mock", action="store_true", help="canned AI responses: free wiring check")
    ap.add_argument("--list", action="store_true", help="print the cases and exit")
    args = ap.parse_args()

    settings = get_settings()
    settings.ai_mock = args.mock
    if not args.mock and not args.list and not settings.anthropic_api_key:
        print("ANTHROPIC_API_KEY is not set in backend/.env. Use --mock for a free wiring check.")
        return 2

    meta: dict[str, Any] = {}
    jobs: list[tuple[str, list[str], Callable[[], Awaitable[Outcome]]]] = []
    if args.flow == "report":
        cases, meta = load_report_cases()
        wanted = set(args.cases.split(",")) if args.cases else None
        for rc in cases:
            if wanted is None or rc.id in wanted:
                jobs.append((rc.id, rc.tags, partial(run_report_case, rc)))
        if args.list:
            for rc in cases:
                print(f"{rc.id:<28} {', '.join(rc.tags):<22} {rc.why}")
            return 0
    else:
        rcases = load_resume_cases()
        wanted = set(args.cases.split(",")) if args.cases else None
        for sc in rcases:
            if wanted is None or sc.id in wanted:
                jobs.append((sc.id, sc.tags, partial(run_resume_case, sc)))
        if args.list:
            for sc in rcases:
                print(f"{sc.id:<20} {', '.join(sc.tags):<22} {sc.why}")
            return 0

    reps = args.reps or (3 if args.flow == "report" else 2)
    variant = args.variant
    # Mock runs live in their own flow dir so they can never mix with real results.
    flow_dir = ROOT / ".claude" / "hillclimb" / (FLOWS[args.flow] + ("-mock" if args.mock else ""))
    vdir = flow_dir / variant
    vdir.mkdir(parents=True, exist_ok=True)
    state = flow_dir / "_state.json"
    if not state.exists():
        state.write_text(json.dumps({"metrics": METRICS[args.flow], "perf_fields": PERF}, indent=2))

    done = {(r["prompt_id"], r["rep"]) for r in _jsonl(vdir / "results.jsonl")}
    todo = [(cid, tags, rep, fn) for cid, tags, fn in jobs for rep in range(reps) if (cid, rep) not in done]
    print(
        f"{FLOWS[args.flow]} / {variant}: {len(todo)} to run ({len(done)} already done), concurrency {args.concurrency}"
    )

    sem = asyncio.Semaphore(args.concurrency)

    async def bounded(cid: str, tags: list[str], rep: int, fn: Callable[[], Awaitable[Outcome]]) -> None:
        async with sem:
            await run_one(cid, tags, rep, fn, vdir, args.timeout_s)

    t0 = time.monotonic()
    await asyncio.gather(*(bounded(*job) for job in todo))
    print(f"wall-clock {time.monotonic() - t0:.0f}s → {vdir.relative_to(ROOT)}")
    return 0 if summarize(args.flow, vdir, meta) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
