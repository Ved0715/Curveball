# Curveball

*Learn something every day. Handle any curveball.*

A learning ecosystem for engineers with two loops that feed each other:

- **Learn (daily):** one topic a day across five tracks (DSA, system design, language depth, fundamentals, real-world), a 5-minute AI lesson with a self-check, a one-line reflection, streaks and XP.
- **Practice (weekly):** AI mock interviews tailored to the job and your resume, with an honest scored report. Any weak spot can be added to your learning queue as a future daily topic.
- **Progress:** streaks, a 12-week heatmap, track balance, interview score trend, level. All derived from history.

Product plan: `docs/PRODUCT_PLAN.md` · Learning spec: `docs/Learning Log PRD.md` · Interview spec: `docs/PRODUCT_SPEC.md`

```
frontend/   Next.js 16 app (UI). Calls /api/* on its own origin; Next forwards to the backend.
backend/    FastAPI (accounts, learning engine, AI calls, interview rules, Postgres)
docs/       Specs and plan
```

## Run it locally

**Backend** (needs [uv](https://docs.astral.sh/uv/))

```bash
cd backend
uv sync
cp .env.example .env          # DATABASE_URL (Neon), GEMINI_API_KEY, AI_MOCK=false
uv run alembic upgrade head   # create/update tables
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local    # BACKEND_URL=http://localhost:8000
npm run dev                   # http://localhost:3000
```

With `AI_MOCK=true` every AI feature returns sample content, so the whole app works without an API key.

## Operations

- **Daily topics:** assigned lazily when a user opens Today. For morning notifications later, schedule
  `POST /internal/assign-daily` with header `X-Internal-Token: $INTERNAL_TOKEN` (~06:30). Runs are logged in `job_runs`.
- **Bring over a Learning Log history:** sign up in the app, then
  `cd backend && uv run python -m app.cli import-learning-log --email you@example.com --dir .imports`
- **AI provider:** `AI_PROVIDER=gemini` (default) or `anthropic`. Models per tier live in `backend/app/config.py`.
- **Production:** set `COOKIE_SECURE=true`, `CORS_ORIGINS=<your frontend origin>`, `INTERNAL_TOKEN`, and `BACKEND_URL` on the frontend.

## Checks

```bash
cd backend  && uv run ruff check . && uv run mypy && uv run pytest
cd frontend && npm run typecheck && npm run lint && npm test && npm run test:e2e
```
