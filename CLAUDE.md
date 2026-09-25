# Curveball: learn daily, interview ready

## What this is
Curveball is a learning ecosystem for engineers. It merges two products:
- **Learning Log** (`docs/Learning Log PRD.md`): a daily topic across five tracks, streaks, calendar, stats, focus areas, custom queue.
- **Mock Room** (`docs/PRODUCT_SPEC.md`): AI mock interviews with a prep brief and an honest scored report.
They are connected: interview weak spots can be queued as future daily topics. See `docs/PRODUCT_PLAN.md` for the product plan, IA and principles.

Brand name and tracks live in `frontend/src/lib/brand.ts`. Design tokens (funky neo-brutalist, light + dark, validated track palette) live in `frontend/src/app/globals.css`.

- Interview prototype: `prototype/mock-room.html`

## The prototype is the source of truth for behavior
Read `prototype/mock-room.html` before building anything. Keep its user flow, its four prompts (brief, interviewer turn, hint, report) and their JSON output shapes. Improve them, but don't lose what works:
- Interviewer asks ONE question at a time, max one follow-up per main question, never coaches mid-interview.
- The page (not the model) controls question count and when the interview ends.
- Report is honest, scored against experience level, with per-answer model answers using the candidate's real resume.

## Critical difference from the prototype
The prototype calls `window.claude.use("sample")`, which only exists inside claude.ai. In the product, ALL model calls go through our own server using the Anthropic API. The API key lives only in server environment variables and never reaches the browser.

## Stack (confirm with me before changing)
- Frontend: `frontend/` — Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS 4, Motion for animation, Zod for validation, Zustand for small client state
- Backend: `backend/` — FastAPI (Python 3.13, managed with `uv`); AI via Gemini (google-genai, default) or Anthropic, switched by `AI_PROVIDER`; streaming to the client over Server-Sent Events
- Auth: email + password (argon2), server-side sessions in an httpOnly SameSite=Lax cookie; the browser calls `/api/*` on the Next origin and Next rewrites to FastAPI
- Database: Postgres on Neon, via SQLAlchemy 2 (async, psycopg 3); schema changes only through Alembic migrations
- Deploy: frontend on Vercel; backend host to be decided
- Tests: pytest (backend, in-memory SQLite), Vitest (frontend logic), Playwright (main flow, desktop + mobile, mock AI + throwaway SQLite)

Model names live only in `backend/app/config.py` (Gemini: ordered fallback lists per tier; Anthropic: Haiku 4.5 / Sonnet 5 / Opus 5). Look up current names in the provider's docs before changing them.

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
- Evals (see `backend/evals/README.md`): `uv run python -m evals.run report|resume` (paid; `--mock` is free, `--list` shows cases). Run the report eval after any prompt or model change.

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
