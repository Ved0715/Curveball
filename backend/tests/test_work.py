"""Bullpen rules, exercised through the web API (and the service directly where two
different actors are needed)."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import work
from app.db import get_sessionmaker
from app.models import ApiToken, WorkEvent, WorkNode, WorkSession


def new_session(c: TestClient, title: str = "Fix the auth bugs") -> tuple[str, str]:
    r = c.post(
        "/api/work/sessions",
        json={"title": title, "prompt": "Users get logged out randomly.", "repo": "acme/api"},
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    tree = c.get(f"/api/work/sessions/{sid}").json()
    return sid, tree["nodes"][0]["id"]


def decompose(sid: str, parent: str, children: list[dict[str, Any]], actor: str = "agent-a") -> list[str]:
    async def run() -> list[str]:
        async with get_sessionmaker()() as db:
            s = await db.get(WorkSession, uuid.UUID(sid))
            assert s is not None
            return [str(n.id) for n in await work.add_children(db, s, parent, children, actor)]

    return asyncio.run(run())


def tree(c: TestClient, sid: str) -> dict[str, Any]:
    return dict(c.get(f"/api/work/sessions/{sid}").json())


def node(c: TestClient, sid: str, nid: str) -> dict[str, Any]:
    return next(n for n in tree(c, sid)["nodes"] if n["id"] == nid)


def finish(c: TestClient, nid: str) -> None:
    c.patch(
        f"/api/work/nodes/{nid}",
        json={"solution_description": "Rotated the session secret and added a test."},
    )
    r = c.post(f"/api/work/nodes/{nid}/status", json={"status": "done"})
    assert r.status_code == 200, r.text


def test_create_session_makes_a_root_leaf(client: TestClient) -> None:
    sid, root = new_session(client)
    t = tree(client, sid)
    assert t["session"]["title"] == "Fix the auth bugs" and t["session"]["status"] == "active"
    assert [n["id"] for n in t["nodes"]] == [root]
    assert t["nodes"][0]["is_leaf"] and t["nodes"][0]["problem_statement"] == "Users get logged out randomly."
    assert t["session"]["progress"] == {
        "leaves": 1,
        "done": 0,
        "in_progress": 0,
        "blocked": 0,
        "decision_needed": 0,
        "nodes": 1,
    }
    assert [s["id"] for s in client.get("/api/work/sessions").json()] == [sid]


def test_decompose_orders_siblings_and_ready_list_respects_dependencies(client: TestClient) -> None:
    sid, root = new_session(client)
    a, b, c = decompose(
        sid,
        root,
        [
            {"title": "Reproduce the logout", "files": ["auth.py"]},
            {"title": "Fix token refresh", "after": [0], "files": ["auth.py", "session.py"]},
            {"title": "Add a regression test", "after": [1]},
        ],
    )
    t = tree(client, sid)
    assert [n["title"] for n in t["nodes"]] == [
        "Fix the auth bugs",
        "Reproduce the logout",
        "Fix token refresh",
        "Add a regression test",
    ]
    assert node(client, sid, root)["is_leaf"] is False
    assert t["ready"] == [a]  # b waits on a, c waits on b
    finish(client, a)
    assert tree(client, sid)["ready"] == [b]
    r = client.post(f"/api/work/nodes/{c}/claim")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "blocked_by_dependency"


def test_rollup_resolves_parents_and_the_session_then_reopens(client: TestClient) -> None:
    sid, root = new_session(client)
    [area] = decompose(sid, root, [{"title": "Session layer"}])
    x, y = decompose(sid, area, [{"title": "Cookie flags"}, {"title": "Expiry"}])
    finish(client, x)
    assert node(client, sid, area)["status"] == "in_progress"
    assert node(client, sid, root)["status"] == "in_progress"
    finish(client, y)
    t = tree(client, sid)
    assert node(client, sid, area)["status"] == "done"
    assert node(client, sid, root)["status"] == "done"
    assert t["session"]["status"] == "resolved" and t["session"]["resolved_at"]
    # Reopening a leaf reopens everything above it.
    client.post(f"/api/work/nodes/{y}/status", json={"status": "open"})
    t = tree(client, sid)
    assert node(client, sid, root)["status"] == "in_progress" and t["session"]["status"] == "active"
    kinds = [e["kind"] for e in client.get(f"/api/work/sessions/{sid}/events").json()]
    assert "rolled_up" in kinds and "session_resolved" in kinds and "session_reopened" in kinds


def test_done_needs_a_real_solution_and_not_an_issue_needs_a_reason(client: TestClient) -> None:
    sid, root = new_session(client)
    [leaf] = decompose(sid, root, [{"title": "Leaf"}])
    r = client.post(f"/api/work/nodes/{leaf}/status", json={"status": "done"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "needs_solution"
    assert "solution_description" in r.json()["detail"]["message"]
    r = client.post(f"/api/work/nodes/{leaf}/status", json={"status": "not_an_issue"})
    assert r.json()["detail"]["code"] == "needs_rationale"
    r = client.post(
        f"/api/work/nodes/{leaf}/status", json={"status": "not_an_issue", "rationale": "Expected behaviour"}
    )
    assert r.status_code == 200 and r.json()["notes"][-1]["text"] == "Expected behaviour"


def test_branch_status_is_derived_but_can_be_closed_as_not_an_issue(client: TestClient) -> None:
    sid, root = new_session(client)
    [area] = decompose(sid, root, [{"title": "Area"}])
    decompose(sid, area, [{"title": "One"}, {"title": "Two"}])
    r = client.post(f"/api/work/nodes/{area}/status", json={"status": "done"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "branch_status_derived"
    r = client.post(
        f"/api/work/nodes/{area}/status", json={"status": "not_an_issue", "rationale": "Moved to v2"}
    )
    assert r.status_code == 200
    assert {n["status"] for n in tree(client, sid)["nodes"]} == {"not_an_issue"}
    assert tree(client, sid)["session"]["status"] == "resolved"


def test_runaway_guards(client: TestClient) -> None:
    sid, root = new_session(client)
    r = client.post(f"/api/work/sessions/{sid}/nodes", json={"parent_id": root, "title": "x"})
    assert r.status_code == 201
    too_many = [{"title": f"c{i}"} for i in range(work.MAX_CHILDREN + 1)]
    try:
        decompose(sid, root, too_many)
        raise AssertionError("expected too_many_children")
    except work.WorkError as e:
        assert e.code == "too_many_children"

    async def shrink() -> None:
        async with get_sessionmaker()() as db:
            s = await db.get(WorkSession, uuid.UUID(sid))
            assert s is not None
            s.node_budget, s.max_depth = 3, 1
            await db.commit()

    asyncio.run(shrink())
    [child] = [n["id"] for n in tree(client, sid)["nodes"] if n["title"] == "x"]
    for spec, code in (
        (([{"title": "a"}, {"title": "b"}]), "budget_exceeded"),
        ([{"title": "deep"}], "too_deep"),
    ):
        try:
            decompose(sid, root if code == "budget_exceeded" else child, spec)
            raise AssertionError(f"expected {code}")
        except work.WorkError as e:
            assert e.code == code


def test_dependencies_reject_cycles_and_ancestors(client: TestClient) -> None:
    sid, root = new_session(client)
    a, b = decompose(sid, root, [{"title": "A"}, {"title": "B", "after": [0]}])
    r = client.patch(f"/api/work/nodes/{a}", json={"depends_on": [b]})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "dependency_cycle"
    r = client.patch(f"/api/work/nodes/{a}", json={"depends_on": [root]})
    assert r.status_code == 409


def test_claims_lock_leaves_and_go_stale(client: TestClient) -> None:
    sid, root = new_session(client)
    a, b = decompose(
        sid, root, [{"title": "A", "files": ["db.py"]}, {"title": "B", "files": ["db.py", "api.py"]}]
    )

    async def as_agents() -> None:
        async with get_sessionmaker()() as db:
            s = await db.get(WorkSession, uuid.UUID(sid))
            assert s is not None
            n, warns = await work.claim(db, s, a, "claude-1")
            assert n.owner == "claude-1" and n.status == "in_progress" and warns == []
            try:
                await work.claim(db, s, a, "cursor-1")
                raise AssertionError("expected already_claimed")
            except work.WorkError as e:
                assert e.code == "already_claimed" and "claude-1" in e.message
            _, warns = await work.claim(db, s, b, "cursor-1")
            assert warns and "db.py" in warns[0]  # blast-radius warning
            # claude-1 goes quiet for 31 minutes: anyone may take the leaf.
            stale = await db.get(WorkNode, uuid.UUID(a))
            assert stale is not None
            stale.claimed_at = datetime.now(UTC) - timedelta(minutes=31)
            await db.commit()
            n, _ = await work.claim(db, s, a, "cursor-2")
            assert n.owner == "cursor-2"
            n = await work.release(db, s, a, "cursor-2", "Found the race in pool checkout; fix half done.")
            assert (
                n.status == "partial" and n.owner is None and n.notes[-1]["text"].startswith("Found the race")
            )

    asyncio.run(as_agents())
    # A partial leaf is ready again, with its notes carried in the context bundle.
    assert a in tree(client, sid)["ready"]


def test_context_bundle_is_scoped_to_one_leaf(client: TestClient) -> None:
    sid, root = new_session(client)
    [area] = decompose(sid, root, [{"title": "Persistence", "problem_statement": "Writes get lost."}])
    a, b = decompose(sid, area, [{"title": "Flush on shutdown"}, {"title": "Retry writes", "after": [0]}])
    finish(client, a)

    async def bundle() -> dict[str, Any]:
        async with get_sessionmaker()() as db:
            s = await db.get(WorkSession, uuid.UUID(sid))
            assert s is not None
            nodes = await work.load_nodes(db, s.id)
            return work.context_bundle(s, nodes, work.find(nodes, b))

    got = asyncio.run(bundle())
    assert got["node"]["title"] == "Retry writes"
    assert [x["title"] for x in got["breadcrumb"]] == ["Fix the auth bugs", "Persistence"]
    assert got["dependencies"][0]["solution_description"].startswith("Rotated")
    assert "nodes" not in got  # never the whole tree


def test_delete_node_cleans_up_dependencies_and_restores_leaf(client: TestClient) -> None:
    sid, root = new_session(client)
    [area] = decompose(sid, root, [{"title": "Area"}])
    [only] = decompose(sid, area, [{"title": "Only child"}])
    [other] = decompose(sid, root, [{"title": "Other"}])
    client.patch(f"/api/work/nodes/{other}", json={"depends_on": [only]})
    assert client.delete(f"/api/work/nodes/{only}").status_code == 204
    assert node(client, sid, other)["depends_on"] == []
    assert node(client, sid, area)["is_leaf"] is True
    r = client.delete(f"/api/work/nodes/{root}")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "root_node"


def test_other_users_cannot_see_or_touch_a_session(client: TestClient, other: TestClient) -> None:
    sid, root = new_session(client)
    assert other.get(f"/api/work/sessions/{sid}").status_code == 404
    assert other.patch(f"/api/work/nodes/{root}", json={"title": "mine now"}).status_code == 404
    assert other.get("/api/work/sessions").json() == []


def test_learn_link_queues_the_root_cause_as_a_topic(client: TestClient) -> None:
    sid, root = new_session(client)
    [leaf] = decompose(sid, root, [{"title": "Fix double charge"}])
    client.patch(
        f"/api/work/nodes/{leaf}",
        json={"root_cause": "Idempotency keys were not checked on retries. The client retried on timeout."},
    )
    finish(client, leaf)
    r = client.post(f"/api/work/nodes/{leaf}/learn", json={})
    assert r.status_code == 201 and r.json()["title"] == "Idempotency keys were not checked on retries"
    queue = client.get("/api/learn/queue").json()
    assert queue[-1]["source"] == "work" and queue[-1]["title"] == r.json()["title"]
    # Twice is a no-op.
    assert client.post(f"/api/work/nodes/{leaf}/learn", json={}).json()["id"] == r.json()["id"]


def test_events_feed_supports_since(client: TestClient) -> None:
    sid, root = new_session(client)
    first = client.get(f"/api/work/sessions/{sid}/events").json()
    assert [e["kind"] for e in first] == ["session_created"]
    decompose(sid, root, [{"title": "A"}])
    newer = client.get(f"/api/work/sessions/{sid}/events", params={"since": first[-1]["id"]}).json()
    assert [e["kind"] for e in newer] == ["decomposed"] and newer[0]["actor"] == "agent-a"


def test_archive_and_delete_session(client: TestClient) -> None:
    sid, _ = new_session(client)
    assert (
        client.patch(f"/api/work/sessions/{sid}", json={"status": "archived"}).json()["status"] == "archived"
    )
    assert client.get("/api/work/sessions").json() == []
    assert len(client.get("/api/work/sessions", params={"archived": True}).json()) == 1
    assert client.delete(f"/api/work/sessions/{sid}").status_code == 204
    assert client.get(f"/api/work/sessions/{sid}").status_code == 404


def test_tokens_are_shown_once_and_revocable(client: TestClient) -> None:
    r = client.post("/api/work/tokens", json={"name": "Claude Code laptop"})
    assert r.status_code == 201
    raw = r.json()["token"]
    assert raw.startswith("cbk_") and r.json()["prefix"] == raw[:8]
    listed = client.get("/api/work/tokens").json()
    assert listed[0]["name"] == "Claude Code laptop" and "token" not in listed[0]
    assert client.delete(f"/api/work/tokens/{listed[0]['id']}").status_code == 204
    assert client.get("/api/work/tokens").json() == []


def test_deleting_the_account_removes_all_work(client: TestClient) -> None:
    sid, root = new_session(client)
    decompose(sid, root, [{"title": "A"}])
    client.post("/api/work/tokens", json={"name": "x"})
    assert client.delete("/api/me").status_code == 204

    async def counts() -> list[int]:
        async with get_sessionmaker()() as db:
            return [
                int(await db.scalar(select(func.count()).select_from(t)) or 0)
                for t in (WorkSession, WorkNode, WorkEvent, ApiToken)
            ]

    assert asyncio.run(counts()) == [0, 0, 0, 0]
