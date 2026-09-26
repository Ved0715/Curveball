"""Bullpen's MCP server, spoken to over real HTTP exactly as an agent would (JSON-RPC)."""

import json
from itertools import count
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import tokens
from tests.conftest import signup

PROTOCOL = "2025-06-18"
_ids = count(1)


@pytest.fixture(autouse=True)
def fresh_token_cache() -> None:
    tokens.clear_cache()


def token(c: TestClient, name: str = "agent") -> str:
    r = c.post("/api/work/tokens", json={"name": name})
    assert r.status_code == 201, r.text
    return str(r.json()["token"])


def rpc(c: TestClient, tok: str | None, method: str, params: dict[str, Any] | None = None) -> Any:
    headers = {"Accept": "application/json, text/event-stream", "mcp-protocol-version": PROTOCOL}
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    body: dict[str, Any] = {"jsonrpc": "2.0", "id": next(_ids), "method": method}
    if params is not None:
        body["params"] = params
    return c.post("/api/mcp", json=body, headers=headers)


def call(c: TestClient, tok: str, tool: str, **args: Any) -> Any:
    """Call a tool; return its parsed result, or raise with the tool's error text."""
    r = rpc(c, tok, "tools/call", {"name": tool, "arguments": args})
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    text = result["content"][0]["text"] if result["content"] else ""
    if result.get("isError"):
        raise ToolFailed(text)
    structured = result.get("structuredContent")
    if structured is not None:
        return structured.get("result", structured)
    try:
        return json.loads(text)
    except ValueError:
        return text


class ToolFailed(Exception):
    pass


def test_requires_a_valid_token(client: TestClient) -> None:
    assert rpc(client, None, "tools/list").status_code == 401
    assert rpc(client, "cbk_" + "x" * 40, "tools/list").status_code == 401
    r = rpc(client, None, "tools/list")
    assert r.headers["www-authenticate"].startswith("Bearer")


def test_handshake_teaches_the_workflow(client: TestClient) -> None:
    tok = token(client)
    r = rpc(
        client,
        tok,
        "initialize",
        {"protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "pytest", "version": "1"}},
    )
    assert r.status_code == 200
    assert "Leaf test" in r.json()["result"]["instructions"]
    names = {t["name"] for t in rpc(client, tok, "tools/list").json()["result"]["tools"]}
    assert {
        "create_session",
        "decompose_node",
        "list_open_leaves",
        "claim_node",
        "get_context_bundle",
        "update_node",
        "set_status",
        "release_node",
    } <= names


def test_an_agent_can_drive_a_task_to_done(client: TestClient) -> None:
    tok = token(client, "Claude Code")
    made = call(
        client, tok, "create_session", title="Cut p95 latency", prompt="Checkout is slow.", agent="claude-1"
    )
    sid, root = made["session"]["id"], made["root_id"]

    kids = call(
        client,
        tok,
        "decompose_node",
        session_id=sid,
        node_id=root,
        agent="claude-1",
        children=[
            {"title": "Profile checkout", "files": ["checkout.py"]},
            {"title": "Cache price lookups", "files": ["pricing.py"], "after": [0]},
        ],
    )
    profile, cache = kids[0]["id"], kids[1]["id"]
    assert [leaf["id"] for leaf in call(client, tok, "list_open_leaves", session_id=sid)] == [profile]

    call(client, tok, "claim_node", session_id=sid, node_id=profile, agent="claude-1")
    bundle = call(client, tok, "get_context_bundle", session_id=sid, node_id=profile)
    assert (
        bundle["node"]["title"] == "Profile checkout"
        and bundle["breadcrumb"][0]["title"] == "Cut p95 latency"
    )

    # The done gate speaks to the agent in words it can act on.
    with pytest.raises(ToolFailed, match="solution_description"):
        call(client, tok, "set_status", session_id=sid, node_id=profile, status="done", agent="claude-1")
    call(
        client,
        tok,
        "update_node",
        session_id=sid,
        node_id=profile,
        agent="claude-1",
        root_cause="N+1 queries: prices were fetched per line item.",
        artifacts={"pr": "https://github.com/acme/shop/pull/7"},
    )
    out = call(
        client,
        tok,
        "set_status",
        session_id=sid,
        node_id=profile,
        status="done",
        solution_description="Found an N+1 on price lookups; flame graph attached to the PR.",
        agent="claude-1",
    )
    assert out["progress"]["done"] == 1

    assert [leaf["id"] for leaf in call(client, tok, "list_open_leaves", session_id=sid)] == [cache]
    out = call(
        client,
        tok,
        "set_status",
        session_id=sid,
        node_id=cache,
        status="done",
        solution_description="Batched price lookups into one query per cart.",
        agent="cursor-1",
    )
    assert out["session_status"] == "resolved"

    outline = call(client, tok, "get_tree", session_id=sid)
    assert "[done] Cut p95 latency" in outline and "2/2 leaves resolved" in outline

    # The web view sees the same tree, with who did what.
    events = client.get(f"/api/work/sessions/{sid}/events").json()
    assert {"claude-1", "cursor-1"} <= {e["actor"] for e in events}


def test_rule_errors_come_back_as_readable_tool_errors(client: TestClient) -> None:
    tok = token(client)
    made = call(client, tok, "create_session", title="T")
    with pytest.raises(ToolFailed, match="get_tree"):
        call(client, tok, "claim_node", session_id=made["session"]["id"], node_id="not-a-node", agent="a")
    with pytest.raises(ToolFailed, match="list_sessions"):
        call(client, tok, "get_tree", session_id="00000000-0000-0000-0000-000000000000")


def test_tokens_only_see_their_own_users_sessions(client: TestClient) -> None:
    mine = token(client)
    sid = call(client, mine, "create_session", title="Private")["session"]["id"]
    with TestClient(client.app) as other:
        signup(other, email="ravi@example.com")
        theirs = token(other)
        assert call(other, theirs, "list_sessions") == []
        with pytest.raises(ToolFailed):
            call(other, theirs, "get_tree", session_id=sid)


def test_revoked_token_stops_working(client: TestClient) -> None:
    tok = token(client)
    assert rpc(client, tok, "tools/list").status_code == 200
    [row] = client.get("/api/work/tokens").json()
    client.delete(f"/api/work/tokens/{row['id']}")
    assert rpc(client, tok, "tools/list").status_code == 401
