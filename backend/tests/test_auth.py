from fastapi.testclient import TestClient

from app import auth
from app.main import app
from tests.conftest import signup


def test_signup_sets_http_only_cookie_and_me_works() -> None:
    with TestClient(app) as c:
        r = c.post(
            "/api/auth/signup",
            json={
                "email": "  Asha@Example.com ",
                "password": "correct horse",
                "name": "Asha",
                "timezone": "Europe/London",
            },
        )
        assert r.status_code == 201
        cookie = r.headers["set-cookie"]
        assert "cb_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
        me = c.get("/api/auth/me").json()
        assert me["email"] == "asha@example.com"  # normalised
        assert me["timezone"] == "Europe/London"
        assert "password" not in str(me)


def test_signup_validation_and_duplicates() -> None:
    with TestClient(app) as c:
        assert (
            c.post("/api/auth/signup", json={"email": "bad", "password": "x" * 8, "name": "A"}).status_code
            == 422
        )
        assert (
            c.post("/api/auth/signup", json={"email": "a@b.co", "password": "short", "name": "A"}).status_code
            == 422
        )
        signup(c, email="dup@example.com")
        r = c.post("/api/auth/signup", json={"email": "DUP@example.com", "password": "x" * 8, "name": "A"})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "email_taken"


def test_unknown_timezone_falls_back() -> None:
    with TestClient(app) as c:
        assert signup(c, timezone="Mars/Olympus")["timezone"] == "Asia/Kolkata"


def test_login_logout_and_bad_credentials() -> None:
    with TestClient(app) as c:
        signup(c)
        assert c.post("/api/auth/logout").status_code == 204
        assert c.get("/api/auth/me").status_code == 401
        bad = c.post("/api/auth/login", json={"email": "asha@example.com", "password": "wrong password"})
        assert bad.status_code == 401 and bad.json()["detail"]["code"] == "bad_credentials"
        nobody = c.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
        assert nobody.json() == bad.json()  # same answer: no account enumeration
        assert (
            c.post(
                "/api/auth/login", json={"email": "ASHA@example.com", "password": "correct horse"}
            ).status_code
            == 200
        )
        assert c.get("/api/auth/me").status_code == 200


def test_logout_revokes_the_session_server_side() -> None:
    with TestClient(app) as c:
        signup(c)
        token = c.cookies.get("cb_session")
        c.post("/api/auth/logout")
        c.cookies.set("cb_session", token or "")
        assert c.get("/api/auth/me").status_code == 401  # a copied cookie is useless after logout


def test_garbage_cookie_is_rejected() -> None:
    with TestClient(app) as c:
        c.cookies.set("cb_session", "forged")
        assert c.get("/api/auth/me").status_code == 401


def test_login_is_rate_limited() -> None:
    with TestClient(app) as c:
        signup(c)
        for _ in range(auth.login_limiter.limit):
            c.post("/api/auth/login", json={"email": "asha@example.com", "password": "wrong"})
        r = c.post("/api/auth/login", json={"email": "asha@example.com", "password": "correct horse"})
        assert r.status_code == 429 and r.json()["detail"]["code"] == "too_many_attempts"


def test_origin_check_blocks_cross_site_writes(client: TestClient) -> None:
    evil = client.post("/api/learn/queue", json={"title": "x"}, headers={"Origin": "https://evil.example"})
    assert evil.status_code == 403 and evil.json()["detail"]["code"] == "bad_origin"
    ok = client.post("/api/learn/queue", json={"title": "x"}, headers={"Origin": "http://localhost:3000"})
    assert ok.status_code == 201


def test_profile_update_and_password_change(client: TestClient) -> None:
    r = client.patch("/api/me", json={"name": "Asha R", "timezone": "America/New_York"})
    assert r.json()["name"] == "Asha R" and r.json()["timezone"] == "America/New_York"
    assert client.patch("/api/me", json={"timezone": "Not/AZone"}).status_code == 422
    assert client.post("/api/me/password", json={"current": "nope", "new": "brand new pw"}).status_code == 401
    assert (
        client.post("/api/me/password", json={"current": "correct horse", "new": "brand new pw"}).status_code
        == 204
    )
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login", json={"email": "asha@example.com", "password": "brand new pw"}
        ).status_code
        == 200
    )


def test_delete_account_signs_out(client: TestClient) -> None:
    assert client.delete("/api/me").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    r = client.post("/api/auth/login", json={"email": "asha@example.com", "password": "correct horse"})
    assert r.status_code == 401
