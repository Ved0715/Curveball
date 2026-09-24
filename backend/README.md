# Mock Room API (FastAPI)

```bash
uv sync                 # install
cp .env.example .env    # then edit
uv run uvicorn app.main:app --reload --port 8000
```

Checks: `uv run ruff check . && uv run mypy && uv run pytest`

With `AI_MOCK=true` every AI endpoint returns canned data, so the whole app works with no API key.
