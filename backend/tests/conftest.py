from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import auth, llm, llm_gemini
from app import db as db_module
from app.config import get_settings
from app.main import app


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Every test: a fresh in-memory SQLite database, mock AI, clean caches and rate limits."""
    s = get_settings()
    monkeypatch.setattr(s, "database_url", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setattr(s, "db_auto_create", True)
    monkeypatch.setattr(s, "ai_mock", True)
    monkeypatch.setattr(s, "internal_token", "test-internal-token")
    # Fixed fake Google client, whatever is in backend/.env. Google itself is never called.
    monkeypatch.setattr(s, "google_client_id", "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(s, "google_client_secret", "test-secret")
    monkeypatch.setattr(s, "app_url", "http://localhost:3000")
    db_module.get_engine.cache_clear()
    db_module.get_sessionmaker.cache_clear()
    llm._client.cache_clear()
    llm_gemini._client.cache_clear()
    auth.login_limiter.reset()
    auth.signup_limiter.reset()
    yield


def signup(
    c: TestClient, email: str = "asha@example.com", password: str = "correct horse", **extra: str
) -> dict[str, str]:
    r = c.post("/api/auth/signup", json={"email": email, "password": password, "name": "Asha", **extra})
    assert r.status_code == 201, r.text
    return dict(r.json())


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A signed-in user (the session cookie lives in the client's cookie jar)."""
    with TestClient(app) as c:
        signup(c)
        yield c


@pytest.fixture
def other(client: TestClient) -> TestClient:
    """A second, separate signed-in user sharing the same database (no second lifespan)."""
    c = TestClient(app)
    signup(c, email="ravi@example.com")
    return c
