"""App settings, read from environment variables (or backend/.env locally).

All model names live here and nowhere else. Tiers follow docs/PRODUCT_SPEC.md §3:
fast = low latency (interviewer turns, hints, resume reading), balanced = prep brief,
capable = report. Gemini tiers are ordered fallback lists (first = preferred).
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Which AI provider serves every call.
    ai_provider: Literal["gemini", "anthropic"] = "gemini"

    # Secrets: server-only. Never sent to the browser.
    gemini_api_key: str | None = None
    anthropic_api_key: str | None = None

    # When true, every AI call returns canned responses. Lets you click through the
    # whole app with no API key, and keeps end-to-end tests free and deterministic.
    ai_mock: bool = False

    # Comma-separated frontend origins. Also the allow-list for the Origin check on
    # state-changing requests (CSRF defence alongside SameSite cookies).
    cors_origins: str = "http://localhost:3000"

    # Public address of the web app (the Next.js origin). Google sends people back to
    # APP_URL + /api/auth/google/callback, which must be listed in the Google console.
    app_url: str = "http://localhost:3000"
    # Sign in with Google (OAuth client of type "Web application"). Unset = button hidden.
    google_client_id: str | None = None
    google_client_secret: str | None = None

    # Session cookie: set COOKIE_SECURE=true in production (HTTPS only).
    cookie_secure: bool = False
    # Abuse limits per client IP. Generous on purpose: a campus or office may share one IP.
    signup_limit_per_hour: int = 20
    login_limit_per_15min: int = 10
    # Shared secret for scheduled jobs calling /internal/*. Unset = internal routes disabled.
    internal_token: str | None = None

    # Postgres connection string (Neon). Schema is managed by Alembic migrations.
    database_url: str | None = None
    # Only for throwaway SQLite databases in tests / e2e: create tables at startup.
    db_auto_create: bool = False

    # Gemini: comma-separated models per tier, tried in order when one is overloaded or
    # out of quota. Chosen from live latency probes and the eval (backend/evals).
    gemini_models_fast: str = "gemini-3.5-flash-lite,gemini-3.1-flash-lite"
    gemini_models_balanced: str = "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash"
    gemini_models_capable: str = "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash"
    # Thinking depth per tier (minimal | low | medium | high). More = better, slower.
    gemini_thinking_fast: str = "minimal"
    gemini_thinking_balanced: str = "medium"
    gemini_thinking_capable: str = "high"

    # Anthropic models, used when AI_PROVIDER=anthropic.
    model_fast: str = "claude-haiku-4-5"
    model_balanced: str = "claude-sonnet-5"
    model_capable: str = "claude-opus-5"

    # Per-user daily cap on AI calls (cost control). A full 10-question interview is ~25 calls.
    max_ai_calls_per_day: int = 150

    # Output caps per call, to bound cost and latency.
    max_tokens_resume: int = 4000
    max_tokens_brief: int = 8000
    max_tokens_lesson: int = 6000
    max_tokens_turn: int = 1024  # includes any thinking tokens
    max_tokens_hint: int = 400
    max_tokens_report: int = 16000

    # Input caps (characters) for user-supplied text, matching the prototype.
    max_chars_jd: int = 9000
    max_chars_resume: int = 9000
    max_chars_transcript: int = 40000
    max_upload_bytes: int = 5 * 1024 * 1024

    @property
    def ai_key_present(self) -> bool:
        return bool(self.gemini_api_key if self.ai_provider == "gemini" else self.anthropic_api_key)

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def google_redirect_uri(self) -> str:
        return self.app_url.rstrip("/") + "/api/auth/google/callback"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
