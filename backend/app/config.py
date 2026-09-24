"""App settings, read from environment variables (or backend/.env locally).

All model names live here and nowhere else. Tiers follow docs/PRODUCT_SPEC.md §3:
fast = low latency (interviewer turns, hints), balanced = prep brief, capable = report.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Secrets: server-only. Never sent to the browser.
    anthropic_api_key: str | None = None

    # When true, every AI call returns canned responses. Lets you click through the
    # whole app with no API key, and keeps end-to-end tests free and deterministic.
    ai_mock: bool = False

    # Comma-separated list of frontend origins allowed to call this API.
    cors_origins: str = "http://localhost:3000"

    # Postgres connection string (Neon). Schema is managed by Alembic migrations.
    database_url: str | None = None
    # Only for throwaway SQLite databases in tests / e2e: create tables at startup.
    db_auto_create: bool = False

    model_fast: str = "claude-haiku-4-5"
    model_balanced: str = "claude-sonnet-5"
    model_capable: str = "claude-opus-5"

    # Per-user daily cap on AI calls (cost control). A full 10-question interview is ~25 calls.
    max_ai_calls_per_day: int = 150

    # Output caps per call, to bound cost and latency.
    max_tokens_brief: int = 8000
    max_tokens_turn: int = 600
    max_tokens_hint: int = 400
    max_tokens_report: int = 16000

    # Input caps (characters) for user-supplied text, matching the prototype.
    max_chars_jd: int = 9000
    max_chars_resume: int = 9000
    max_chars_transcript: int = 40000
    max_upload_bytes: int = 5 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
