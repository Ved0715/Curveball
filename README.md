# Mock Room

AI interview practice: a prep brief built from your resume, a live AI interviewer that asks real follow-ups, and an honest scored report.

```
frontend/   Next.js 16 app (UI)
backend/    FastAPI API (AI calls, interview rules, Postgres)
docs/       Product spec
prototype/  Original single-file prototype (source of truth for behaviour)
```

## Run it locally

**1. Backend** (needs [uv](https://docs.astral.sh/uv/))

```bash
cd backend
uv sync
cp .env.example .env          # set DATABASE_URL; ANTHROPIC_API_KEY or AI_MOCK=true
uv run alembic upgrade head   # create/update tables
uv run uvicorn app.main:app --reload --port 8000
```

**2. Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                   # http://localhost:3000
```

With `AI_MOCK=true` the AI returns sample responses, so everything works without an API key and costs nothing.

## Checks

```bash
cd backend  && uv run ruff check . && uv run mypy && uv run pytest
cd frontend && npm run typecheck && npm run lint && npm test && npm run test:e2e
```

## How it fits together

- The **database owns each interview**: transcript, question count, follow-up used, status. The browser only keeps your setup draft and which session is open, so a reload resumes exactly where you were.
- The **server enforces the interview rules** (one question at a time, at most one follow-up per question, exact question count, forced closing). The model proposes; the code decides.
- Every model response is **validated** (Pydantic on the server, Zod in the browser) and retried once if invalid. Errors reach the UI as short codes that map to friendly messages.
- AI endpoints **stream** over Server-Sent Events and never hold a database connection while the model is thinking.
- Each user has a **daily AI call cap**, and token usage is recorded per day.
- **Delete my data** (History page) removes everything stored for you.
