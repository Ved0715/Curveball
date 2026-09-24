# Mock Room — AI interview practice

## What this is
Mock Room is an AI interview coach. A user enters a role, company, job description and resume, gets a prep brief, does a live mock interview with an AI interviewer that asks real follow-ups, and receives an honest scored report with stronger model answers written from their own experience.

We are turning a working single-file prototype into a real, multi-user web product.

- Working prototype: `prototype/mock-room.html` (open it in a browser to read the flow; AI calls only work inside claude.ai)
- Full product spec, prompts and data model: @docs/PRODUCT_SPEC.md

## The prototype is the source of truth for behavior
Read `prototype/mock-room.html` before building anything. Keep its user flow, its four prompts (brief, interviewer turn, hint, report) and their JSON output shapes. Improve them, but don't lose what works:
- Interviewer asks ONE question at a time, max one follow-up per main question, never coaches mid-interview.
- The page (not the model) controls question count and when the interview ends.
- Report is honest, scored against experience level, with per-answer model answers using the candidate's real resume.

## Critical difference from the prototype
The prototype calls `window.claude.use("sample")`, which only exists inside claude.ai. In the product, ALL model calls go through our own server using the Anthropic API. The API key lives only in server environment variables and never reaches the browser.

## Stack (confirm with me before changing)
- Frontend: `frontend/` — Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS 4, Motion for animation, Zod for validation, Zustand for small client state
- Backend: `backend/` — FastAPI (Python 3.13, managed with `uv`) + Anthropic Python SDK, streaming to the client over Server-Sent Events
- Database: Postgres on Neon, via SQLAlchemy 2 (async, psycopg 3); schema changes only through Alembic migrations
- Identity (until auth lands): an anonymous per-browser id sent as `X-Client-Id`
- Deploy: frontend on Vercel; backend host to be decided
- Tests: pytest (backend, in-memory SQLite), Vitest (frontend logic), Playwright (main flow, desktop + mobile, mock AI + throwaway SQLite)

Model names live only in `backend/app/config.py` (fast = Haiku 4.5, balanced = Sonnet 5, capable = Opus 5). Look up current names in the official docs before changing them.

## How to work with me
- I'm learning, so explain what you're doing in plain language and why, briefly.
- Work in the phases listed in docs/PRODUCT_SPEC.md. Finish and verify one phase before starting the next.
- Before a big decision (new dependency, schema change, paid service), ask me first.
- After each change: run typecheck, lint and tests. Fix failures before saying you're done.
- Commit small, working steps with clear messages.

## Commands
Backend (run in `backend/`):
- Dev: `uv run uvicorn app.main:app --reload --port 8000`
- Typecheck: `uv run mypy`
- Lint: `uv run ruff check . && uv run ruff format --check .`
- Test: `uv run pytest`
- Migrations: `uv run alembic revision --autogenerate -m "..."`, then `uv run alembic upgrade head`; `uv run alembic check` detects drift

Frontend (run in `frontend/`):
- Dev: `npm run dev`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`, end-to-end: `npm run test:e2e`

## Rules
- Never commit secrets. Use `.env.local` and keep `.env.example` updated.
- Validate every model JSON response with Zod; on failure retry once, then show a clear error.
- Treat resumes and transcripts as personal data: users can delete everything they own.
- Rate-limit AI endpoints per user and cap tokens per request to control cost.
- Every AI screen needs loading, streaming, stop, error and retry states.
