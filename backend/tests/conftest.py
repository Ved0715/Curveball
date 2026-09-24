from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import db as db_module
from app import llm
from app.config import get_settings
from app.main import app


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Every test: a fresh in-memory SQLite database, mock AI, and a clean client cache."""
    s = get_settings()
    monkeypatch.setattr(s, "database_url", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setattr(s, "db_auto_create", True)
    monkeypatch.setattr(s, "ai_mock", True)
    db_module.get_engine.cache_clear()
    db_module.get_sessionmaker.cache_clear()
    llm._client.cache_clear()
    yield
    db_module.get_engine.cache_clear()
    db_module.get_sessionmaker.cache_clear()
    llm._client.cache_clear()


CLIENT_A = "client-aaaaaaaaaaaaaaaa"
CLIENT_B = "client-bbbbbbbbbbbbbbbb"


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app, headers={"X-Client-Id": CLIENT_A}) as c:
        yield c
