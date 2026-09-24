# Mock Room API (FastAPI)

```bash
uv sync
cp .env.example .env               # then edit
uv run alembic upgrade head        # apply migrations
uv run uvicorn app.main:app --reload --port 8000
```

API docs while running: http://localhost:8000/docs

## Layout

```
app/
  main.py          app factory: CORS, request id, error handlers, routers
  config.py        settings from env (.env); all model names live here
  db.py            async engine + sessions (Neon Postgres via psycopg 3)
  models.py        SQLAlchemy tables
  repo.py          every database read/write
  deps.py          current user (X-Client-Id), DB session, daily AI quota
  errors.py        one error shape: {"detail": {"code": "..."}}
  routers/         sessions, history, me, resume, health
  streaming.py     SSE helpers, validate + retry-once for structured output
  llm.py           the only module that calls Anthropic
  interview.py     interview state machine (rules enforced in code)
  prompts/         the four prompts + their output schemas
  mock.py          canned AI responses for AI_MOCK=true
migrations/        Alembic
tests/             pytest (in-memory SQLite, mock AI)
```

## Changing the schema

1. Edit `app/models.py`
2. `uv run alembic revision --autogenerate -m "describe the change"`
3. Read the generated file in `migrations/versions/`
4. `uv run alembic upgrade head`
