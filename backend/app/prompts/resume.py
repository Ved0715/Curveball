"""Resume understanding: extract a structured profile once, reuse it in every prompt.

The model extracts; our code then *grounds* the result: any company, project or number
that doesn't literally appear in the resume text is dropped. A profile may be incomplete,
but it never contains facts the candidate didn't write.
"""

import re

from pydantic import BaseModel, Field

from app.prompts.context import clip


class Role(BaseModel):
    company: str = Field(description="employer name exactly as written")
    title: str = Field(description="job title exactly as written")
    period: str = Field(description="dates as written, e.g. 'Jan 2022 – Present'; empty if not given")
    highlights: list[str] = Field(
        description="up to 4 achievements, each one line, close to the original wording"
    )


class Project(BaseModel):
    name: str = Field(description="project name exactly as written")
    summary: str = Field(description="one line: what it is and what the candidate did")
    tech: list[str] = Field(description="technologies named for this project")
    impact: str = Field(description="the measurable result if one is written, else empty")


class Metric(BaseModel):
    value: str = Field(description="the number exactly as written, e.g. '40%', '2M', '₹3 crore', '120 ms'")
    context: str = Field(description="what it measures, in a few words")


class ResumeProfile(BaseModel):
    headline: str = Field(
        description="one line: who this candidate is, e.g. 'Backend engineer, 3 years, payments'"
    )
    years_experience: float | None = Field(
        description="total professional years if it can be worked out, else null"
    )
    experience: list[Role]
    projects: list[Project]
    skills: list[str] = Field(description="skills, tools and languages named in the resume")
    metrics: list[Metric] = Field(description="every concrete number that shows impact or scale")
    education: list[str] = Field(description="one line per degree or course, as written")


def resume_prompt(resume: str, max_chars: int) -> str:
    return f"""Extract a structured profile from this resume.

Rules:
- Use ONLY facts written in the resume. Never infer, embellish or add anything.
- Copy company names, project names and numbers exactly as written.
- If something isn't in the resume, leave the list empty or the field empty/null.
- Keep every line short. At most 6 roles, 6 projects, 30 skills, 12 metrics.

RESUME:
{clip(resume, max_chars)}"""


# ---------- Grounding ----------


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().replace("–", "-").replace("—", "-")).strip()


def _digits(text: str) -> str:
    return "".join(ch for ch in text if ch.isdigit())


def _in_text(fragment: str, haystack: str) -> bool:
    f = _norm(fragment)
    return bool(f) and f in haystack


def _number_in_text(value: str, haystack: str, haystack_digits_runs: set[str]) -> bool:
    """A metric is grounded if its text appears verbatim, or its digits match a number in the resume."""
    if _in_text(value, haystack):
        return True
    d = _digits(value)
    return bool(d) and d in haystack_digits_runs


def ground(profile: ResumeProfile, resume: str) -> tuple[ResumeProfile, int]:
    """Drop anything not literally in the resume. Returns the grounded profile and how many items were dropped."""
    hay = _norm(resume)
    runs = {r.replace(",", "").replace(".", "") for r in re.findall(r"\d[\d,.]*", resume)}
    runs |= {re.sub(r"\D", "", r) for r in runs}
    dropped = 0

    roles = []
    for r in profile.experience:
        if _in_text(r.company, hay):
            roles.append(r)
        else:
            dropped += 1
    projects = []
    for p in profile.projects:
        if _in_text(p.name, hay):
            projects.append(p)
        else:
            dropped += 1
    metrics = []
    for m in profile.metrics:
        if _number_in_text(m.value, hay, runs):
            metrics.append(m)
        else:
            dropped += 1
    skills = [s for s in profile.skills if _in_text(s, hay)]
    dropped += len(profile.skills) - len(skills)

    grounded = profile.model_copy(
        update={"experience": roles, "projects": projects, "metrics": metrics, "skills": skills}
    )
    return grounded, dropped


def profile_text(p: ResumeProfile) -> str:
    """Compact, stable text form for prompts (identical input → identical text, so it caches)."""
    lines = [f"Headline: {p.headline}"]
    if p.years_experience is not None:
        lines.append(f"Years of experience: {p.years_experience:g}")
    if p.experience:
        lines.append("Experience:")
        for r in p.experience:
            lines.append(f"- {r.title}, {r.company}" + (f" ({r.period})" if r.period else ""))
            lines.extend(f"    • {h}" for h in r.highlights)
    if p.projects:
        lines.append("Projects:")
        for pr in p.projects:
            tech = f" [{', '.join(pr.tech)}]" if pr.tech else ""
            impact = f" Result: {pr.impact}" if pr.impact else ""
            lines.append(f"- {pr.name}: {pr.summary}{tech}{impact}")
    if p.metrics:
        lines.append("Numbers they can cite: " + "; ".join(f"{m.value} ({m.context})" for m in p.metrics))
    if p.skills:
        lines.append("Skills: " + ", ".join(p.skills))
    if p.education:
        lines.append("Education: " + "; ".join(p.education))
    return "\n".join(lines)
