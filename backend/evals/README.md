# Evals

Two checks that the AI coaching is honest and accurate, run through the **real pipeline**
(same prompts, schemas, retries and resume grounding as production) and graded by code.

| Flow | What it checks | Cases | Model | Default reps |
|---|---|---|---|---|
| `report` | Scores are honest and consistent | 11 sample interviews | Opus 5 (+ Haiku for the resume) | 3 |
| `resume` | Resume reading finds the facts and invents nothing | 4 resumes | Haiku 4.5 | 2 |

## Report scoring: metrics

- **honest** (headline): every answer's score is inside its expected band. A vague or evasive answer must score **≤ 5/10**; strong answers must score high.
- **overall_band**: the overall score and verdict fall in the expected range.
- **answer_count**: one entry per main question (follow-ups folded in).
- **grounded**: every "stronger answer" uses something real from the candidate's resume.
- Cross-case: **level calibration** (identical answers score ≥ 8 points higher against a fresher bar than a senior bar) and **consistency** (overall score SD ≤ 8 across reps).

The cases live in `cases/report_scoring.json`: strong senior, average mid-level, vague, evasive, long-but-empty, mixed, a calibration pair, strong fresher, follow-up folding, and confidently wrong. List them with `--list`.

## Resume extraction: metrics

- **precision**: share of the model's raw items (roles, projects, numbers, skills) that really appear in the resume. 1.0 means nothing invented. (The app drops anything ungrounded anyway; this measures the model before that safety net.)
- **recall**: share of the must-find facts present in the final profile.

## Running

```bash
cd backend
uv run python -m evals.run report --list          # read the cases (free)
uv run python -m evals.run report --mock          # wiring check with canned AI (free)
uv run python -m evals.run report --cases strong-senior,weak-vague --reps 1   # pilot (paid)
uv run python -m evals.run report                 # full run (paid)
uv run python -m evals.run resume                 # resume extraction (paid, cheap)
```

Results: `.claude/hillclimb/<flow>/baseline/` (`results.jsonl`, `traces/`, `errors.jsonl`, `checks.json`).
Runs resume where they stopped. Failed attempts are recorded in `errors.jsonl` and never scored as zeros.
Exit code is 0 only if every check passes.

HTML report: `node <claude-api skill>/shared/evals/report/build-report-lite.mjs .claude/hillclimb/report-scoring/`

## Cost

Estimated before measuring (to be replaced by pilot numbers): about 2.5k input and 4k output tokens per report call
on Opus 5 ($5 / $25 per million tokens), so about $0.11 per call. The full report run is 11 cases × 3 reps ≈ **$3–5**.
The resume run is 4 × 2 calls on Haiku ≈ **$0.05**.
