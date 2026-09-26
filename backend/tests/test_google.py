"""Sign in with Google. Google's token endpoint is replaced by a fake identity."""

import base64
import json
import time
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app import google_oauth
from app.config import get_settings
from app.main import app
from tests.conftest import signup

CLIENT_ID = "test-client.apps.googleusercontent.com"


def _b64(data: dict[str, object]) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()


def fake_token(**claims: object) -> str:
    body = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "exp": time.time() + 600,
        "sub": "google-123",
        "email": "asha@example.com",
        "email_verified": True,
        "name": "Asha Rao",
        **claims,
    }
    return f"{_b64({'alg': 'RS256'})}.{_b64(body)}.sig"


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    """Whatever identity the test puts here is what 'Google' returns for any code."""
    who: dict[str, object] = {}

    async def exchange(code: str, verifier: str) -> google_oauth.GoogleIdentity:
        assert code == "good-code" and verifier
        return google_oauth.parse_id_token(fake_token(**who), CLIENT_ID)

    monkeypatch.setattr(google_oauth, "exchange_code", exchange)
    return who


def sign_in(c: TestClient, next_path: str = "/today", tz: str = "Europe/London") -> str:
    """Runs start → (Google) → callback; returns where the browser ends up."""
    r = c.get("/api/auth/google/start", params={"next": next_path, "tz": tz}, follow_redirects=False)
    assert r.status_code == 302
    state = parse_qs(urlparse(r.headers["location"]).query)["state"][0]
    r = c.get(
        "/api/auth/google/callback", params={"code": "good-code", "state": state}, follow_redirects=False
    )
    assert r.status_code == 302
    return r.headers["location"]


def test_providers_reports_google() -> None:
    with TestClient(app) as c:
        assert c.get("/api/auth/providers").json() == {"google": True}


def test_start_redirects_to_google_with_pkce_and_state_cookie() -> None:
    with TestClient(app) as c:
        r = c.get("/api/auth/google/start", follow_redirects=False)
        assert r.status_code == 302
        url = urlparse(r.headers["location"])
        q = parse_qs(url.query)
        assert url.netloc == "accounts.google.com"
        assert q["client_id"] == [CLIENT_ID]
        assert q["redirect_uri"] == ["http://localhost:3000/api/auth/google/callback"]
        assert q["code_challenge_method"] == ["S256"] and q["scope"] == ["openid email profile"]
        assert google_oauth.STATE_COOKIE in r.cookies
        assert "test-secret" not in r.headers["location"]  # the secret never goes to the browser


def test_new_google_user_is_created_and_signed_in(google: dict[str, object]) -> None:
    with TestClient(app) as c:
        assert sign_in(c, next_path="/progress") == "/progress"
        me = c.get("/api/auth/me").json()
        assert me["email"] == "asha@example.com" and me["name"] == "Asha Rao"
        assert me["timezone"] == "Europe/London" and me["has_password"] is False
        assert c.get("/api/learn/today").status_code == 200  # preferences were set up too
        # A Google-only account can't log in with any password...
        c.post("/api/auth/logout")
        r = c.post("/api/auth/login", json={"email": "asha@example.com", "password": "anything at all"})
        assert r.status_code == 401


def test_google_links_to_existing_account_with_same_email(google: dict[str, object]) -> None:
    with TestClient(app) as c:
        original = signup(c)
        c.post("/api/auth/logout")
        assert sign_in(c) == "/today"
        assert c.get("/api/auth/me").json()["id"] == original["id"]
        # ...and the password still works afterwards.
        c.post("/api/auth/logout")
        r = c.post("/api/auth/login", json={"email": "asha@example.com", "password": "correct horse"})
        assert r.status_code == 200


def test_second_google_sign_in_finds_the_account_by_google_id(google: dict[str, object]) -> None:
    with TestClient(app) as c:
        sign_in(c)
        first = c.get("/api/auth/me").json()["id"]
        c.post("/api/auth/logout")
        google["email"] = "asha.new@example.com"  # changed their Gmail address; same Google account
        sign_in(c)
        assert c.get("/api/auth/me").json()["id"] == first


def test_unverified_google_email_is_refused(google: dict[str, object]) -> None:
    google["email_verified"] = False
    with TestClient(app) as c:
        signup(c)
        c.post("/api/auth/logout")
        assert sign_in(c) == "/login?error=google_unverified"
        assert c.get("/api/auth/me").status_code == 401  # did not take over the password account


def test_callback_with_wrong_state_is_refused(google: dict[str, object]) -> None:
    with TestClient(app) as c:
        c.get("/api/auth/google/start", follow_redirects=False)
        r = c.get(
            "/api/auth/google/callback",
            params={"code": "good-code", "state": "forged"},
            follow_redirects=False,
        )
        assert r.headers["location"] == "/login?error=google_failed"
        assert c.get("/api/auth/me").status_code == 401


def test_callback_without_start_cookie_is_refused(google: dict[str, object]) -> None:
    with TestClient(app) as c:
        r = c.get(
            "/api/auth/google/callback", params={"code": "good-code", "state": "x"}, follow_redirects=False
        )
        assert r.headers["location"] == "/login?error=google_failed"


def test_user_cancelling_at_google_returns_to_login() -> None:
    with TestClient(app) as c:
        r = c.get("/api/auth/google/callback", params={"error": "access_denied"}, follow_redirects=False)
        assert r.headers["location"] == "/login?error=google_cancelled"


def test_next_must_stay_on_this_site(google: dict[str, object]) -> None:
    with TestClient(app) as c:
        assert sign_in(c, next_path="//evil.example.com") == "/today"


def test_google_disabled_when_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "google_client_secret", None)
    with TestClient(app) as c:
        assert c.get("/api/auth/providers").json() == {"google": False}
        r = c.get("/api/auth/google/start", follow_redirects=False)
        assert r.headers["location"] == "/login?error=google_unavailable"


def test_google_only_account_can_set_a_first_password(google: dict[str, object]) -> None:
    with TestClient(app) as c:
        sign_in(c)
        assert c.post("/api/me/password", json={"new": "brand new pass"}).status_code == 204
        assert c.get("/api/auth/me").json()["has_password"] is True
        # From now on, changing it needs the current one.
        assert c.post("/api/me/password", json={"new": "another pass 2"}).status_code == 401


@pytest.mark.parametrize(
    ("claims", "why"),
    [
        ({"aud": "someone-else"}, "another app"),
        ({"iss": "https://evil.example.com"}, "issuer"),
        ({"exp": time.time() - 5}, "expired"),
        ({"email": ""}, "sub or email"),
    ],
)
def test_id_token_claims_are_checked(claims: dict[str, object], why: str) -> None:
    with pytest.raises(google_oauth.OAuthError, match=why):
        google_oauth.parse_id_token(fake_token(**claims), CLIENT_ID)
