"""Sign in with Google: OpenID Connect authorization-code flow with PKCE.

1. /api/auth/google/start makes a random `state` and PKCE verifier, keeps them in a short-lived
   httpOnly cookie, and sends the browser to Google.
2. Google sends the browser back to /api/auth/google/callback with a one-time `code`.
3. We check `state` against the cookie (stops forged callbacks), then swap the code for an
   ID token by calling Google server-to-server with our client secret.

The ID token comes straight from Google's token endpoint over TLS, so (per the OIDC spec)
we check its claims (issuer, audience, expiry) rather than its signature.
"""

import base64
import hashlib
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import get_settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 (a URL, not a secret)
ISSUERS = {"https://accounts.google.com", "accounts.google.com"}
STATE_COOKIE = "cb_oauth"
STATE_MAX_AGE = 600  # seconds to finish choosing an account


class OAuthError(Exception):
    """Anything that should end the attempt with a friendly "couldn't sign in with Google"."""


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str


@dataclass(frozen=True)
class Flow:
    state: str
    verifier: str

    @property
    def challenge(self) -> str:
        digest = hashlib.sha256(self.verifier.encode()).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def new_flow() -> Flow:
    return Flow(state=secrets.token_urlsafe(24), verifier=secrets.token_urlsafe(48))


def authorize_url(flow: Flow) -> str:
    s = get_settings()
    return (
        AUTH_URL
        + "?"
        + urlencode(
            {
                "client_id": s.google_client_id,
                "redirect_uri": s.google_redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": flow.state,
                "code_challenge": flow.challenge,
                "code_challenge_method": "S256",
                "prompt": "select_account",
            }
        )
    )


def _b64json(part: str) -> dict[str, Any]:
    raw = base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise OAuthError("id token payload is not an object")
    return data


def parse_id_token(id_token: str, client_id: str, now: float | None = None) -> GoogleIdentity:
    try:
        claims = _b64json(id_token.split(".")[1])
    except (IndexError, ValueError) as e:
        raise OAuthError("malformed id token") from e
    if claims.get("iss") not in ISSUERS:
        raise OAuthError("wrong issuer")
    if claims.get("aud") != client_id:
        raise OAuthError("token is for another app")
    if float(claims.get("exp", 0)) < (now if now is not None else time.time()):
        raise OAuthError("token expired")
    sub, email = claims.get("sub"), claims.get("email")
    if not isinstance(sub, str) or not isinstance(email, str) or not sub or not email:
        raise OAuthError("token lacks sub or email")
    return GoogleIdentity(
        sub=sub,
        email=email,
        email_verified=claims.get("email_verified") in (True, "true"),
        name=str(claims.get("name") or ""),
    )


async def exchange_code(code: str, verifier: str) -> GoogleIdentity:
    s = get_settings()
    if not s.google_client_id or not s.google_client_secret:
        raise OAuthError("google sign-in is not configured")
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.post(
                TOKEN_URL,
                data={
                    "code": code,
                    "client_id": s.google_client_id,
                    "client_secret": s.google_client_secret,
                    "redirect_uri": s.google_redirect_uri,
                    "grant_type": "authorization_code",
                    "code_verifier": verifier,
                },
            )
    except httpx.HTTPError as e:
        raise OAuthError("could not reach google") from e
    if r.status_code != 200:
        raise OAuthError(f"token exchange failed ({r.status_code})")
    id_token = r.json().get("id_token")
    if not isinstance(id_token, str):
        raise OAuthError("no id token in response")
    return parse_id_token(id_token, s.google_client_id)


def pack_state(flow: Flow, next_path: str, timezone: str) -> str:
    data = json.dumps({"s": flow.state, "v": flow.verifier, "n": next_path, "tz": timezone[:64]})
    return base64.urlsafe_b64encode(data.encode()).decode()


def unpack_state(value: str | None) -> dict[str, str]:
    if not value:
        raise OAuthError("missing state cookie")
    try:
        data = json.loads(base64.urlsafe_b64decode(value.encode()))
    except ValueError as e:
        raise OAuthError("bad state cookie") from e
    if not isinstance(data, dict) or not all(isinstance(data.get(k), str) for k in ("s", "v", "n", "tz")):
        raise OAuthError("bad state cookie")
    return {k: data[k] for k in ("s", "v", "n", "tz")}
