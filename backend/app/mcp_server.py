"""Bullpen over MCP: any MCP-capable coding agent (Claude Code, Cursor, Antigravity, ...)
connects to one URL, /api/mcp, with a personal access token, and gets the tools below.

Transport: Streamable HTTP, stateless, JSON responses - one POST per call, which passes
cleanly through the Next.js /api proxy and any load balancer. Every tool takes an explicit
session_id, so there's no hidden per-connection state to drift.

Auth: `Authorization: Bearer cbk_...`. The ASGI wrapper rejects anything else with 401
before the MCP layer sees it; each tool then resolves the same token to its user (cached).
All rules live in app/work.py; a broken rule becomes a ToolError whose message tells the
agent how to fix its call.
"""

import json
from collections.abc import Awaitable, Callable
from typing import Annotated, Any, Literal

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.streamable_http_manager import StreamableHTTPASGIApp, StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.types import Receive, Scope, Send

from app import auth, tokens, work
from app.db import get_sessionmaker
from app.models import User

INSTRUCTIONS = """\
Bullpen (by Curveball) keeps a big coding task from getting lost. You break it into a tree of
small, independently shippable leaves, work them one at a time, and report back, while the
user watches the tree fill in live.

Workflow:
1. list_sessions, or create_session(title, prompt, repo) for a new task. Always pass session_id
   explicitly afterwards.
2. Read the codebase enough to plan, then decompose_node(root, children). Recurse with
   decompose_node on any child that isn't a leaf yet. Use `after` to order siblings.
3. Pick work with list_open_leaves, claim_node it, then get_context_bundle for exactly that
   leaf. Work from the bundle; don't load the whole tree into your context.
4. When finished: update_node(solution_description = what changed and why, root_cause,
   artifacts = {pr, commit, tests}), then set_status(done). If it's bigger than you thought,
   decompose_node it. If you must stop, release_node with a note of where you got to.

Leaf test - a node is a leaf only when it can be stated in one paragraph, touches a bounded,
known set of files (list them in `files`), needs no sibling to finish first except through an
explicit dependency, and can be shipped by an agent with a fresh context in one sitting.

Pass a stable `agent` name (for example "claude-code-1") on every call that changes things,
so the user can see who did what.
"""

server: MCPServer = MCPServer(
    name="curveball-bullpen",
    title="Curveball Bullpen",
    description="Decompose big coding tasks into a live tree of shippable leaves.",
    instructions=INSTRUCTIONS,
    version="1.0.0",
)

Agent = Annotated[str, Field(description="Stable name for this agent, e.g. 'claude-code-1'.", max_length=120)]
SessionId = Annotated[str, Field(description="The session's id (from list_sessions or create_session).")]
NodeId = Annotated[str, Field(description="A node id (from get_tree or list_open_leaves).")]


class Child(BaseModel):
    """One child in decompose_node."""

    title: str = Field(min_length=1, max_length=200, description="One-line summary.")
    problem_statement: str = Field(
        default="", max_length=4000, description="What's wrong, from the user's view."
    )
    root_cause: str = Field(default="", max_length=4000, description="Why it happens, if known.")
    code_description: str = Field(default="", max_length=4000, description="Modules and functions involved.")
    files: list[str] = Field(default_factory=list, max_length=50, description="Files this leaf touches.")
    acceptance_criteria: list[str] = Field(
        default_factory=list, max_length=20, description="What 'done' means."
    )
    tags: list[str] = Field(default_factory=list, max_length=20)
    risk: Literal["low", "medium", "high"] | None = None
    confidence: Literal["low", "medium", "high"] | None = None
    is_leaf: bool = Field(default=True, description="False if you will decompose it further.")
    after: list[int] = Field(
        default_factory=list,
        description="0-based indexes of siblings in this same call that must finish first.",
    )


# ---------- plumbing ----------


async def _user(ctx: Context[Any, Any], db: AsyncSession) -> User:
    header = (ctx.headers or {}).get("authorization", "")
    raw = header[7:].strip() if header.lower().startswith("bearer ") else ""
    user = await tokens.user_for(db, raw)
    if user is None:
        raise ToolError("Not authorised. Create a token in Curveball > Bullpen > Connect.")
    return user


async def _run[T](ctx: Context[Any, Any], fn: Callable[[AsyncSession, User], Awaitable[T]]) -> T:
    async with get_sessionmaker()() as db:
        user = await _user(ctx, db)
        try:
            return await fn(db, user)
        except work.WorkError as e:
            raise ToolError(e.message) from e


def _brief(n: Any) -> dict[str, Any]:
    d = work.node_dict(n)
    return {k: d[k] for k in ("id", "title", "status", "is_leaf", "owner", "depends_on", "files")}


# ---------- tools ----------


@server.tool(description="Your Bullpen sessions with progress. Start here.")
async def list_sessions(ctx: Context[Any, Any], include_archived: bool = False) -> list[dict[str, Any]]:
    async def go(db: AsyncSession, user: User) -> list[dict[str, Any]]:
        return [
            work.session_dict(s, nodes)
            for s, nodes in await work.list_sessions(db, user.id, include_archived)
        ]

    return await _run(ctx, go)


@server.tool(description="Start a new task tree. Returns the session and its root node id.")
async def create_session(
    ctx: Context[Any, Any],
    title: Annotated[str, Field(min_length=1, max_length=200)],
    prompt: Annotated[str, Field(max_length=20000, description="The full task as the user gave it.")] = "",
    repo: Annotated[str, Field(max_length=300, description="Repository name or path.")] = "",
    agent: Agent = "agent",
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s, root = await work.create_session(db, user.id, title, prompt, repo, agent)
        return {"session": work.session_dict(s, [root]), "root_id": str(root.id)}

    return await _run(ctx, go)


@server.tool(description="Compact outline of a session's whole tree: ids, statuses, leaf/branch, owners.")
async def get_tree(ctx: Context[Any, Any], session_id: SessionId) -> str:
    async def go(db: AsyncSession, user: User) -> str:
        s = await work.get_session(db, user.id, session_id)
        nodes = await work.load_nodes(db, s.id)
        p = work.progress(nodes)
        head = (
            f"{s.title} [{s.status}] - {p.done}/{p.leaves} leaves resolved, {p.nodes}/{s.node_budget} nodes"
        )
        return head + "\n" + work.outline(nodes)

    return await _run(ctx, go)


@server.tool(
    description="Split a node into children (up to 12 per call). Works on leaves too, turning them into branches."
)
async def decompose_node(
    ctx: Context[Any, Any],
    session_id: SessionId,
    node_id: NodeId,
    children: list[Child],
    agent: Agent = "agent",
) -> list[dict[str, Any]]:
    async def go(db: AsyncSession, user: User) -> list[dict[str, Any]]:
        s = await work.get_session(db, user.id, session_id)
        created = await work.add_children(db, s, node_id, [c.model_dump() for c in children], agent)
        return [_brief(n) for n in created]

    return await _run(ctx, go)


@server.tool(description="Add one node under a parent.")
async def add_node(
    ctx: Context[Any, Any], session_id: SessionId, parent_id: NodeId, node: Child, agent: Agent = "agent"
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        spec = node.model_dump(exclude={"after"})
        [n] = await work.add_children(db, s, parent_id, [spec], agent)
        return _brief(n)

    return await _run(ctx, go)


@server.tool(
    description=(
        "Edit a node's fields. `artifacts` merges links such as {'pr': url, 'commit': sha, 'tests': url}. "
        "`depends_on` replaces the node's dependencies."
    )
)
async def update_node(
    ctx: Context[Any, Any],
    session_id: SessionId,
    node_id: NodeId,
    title: str | None = None,
    problem_statement: str | None = None,
    root_cause: str | None = None,
    code_description: str | None = None,
    solution_description: str | None = None,
    files: list[str] | None = None,
    acceptance_criteria: list[str] | None = None,
    tags: list[str] | None = None,
    risk: Literal["low", "medium", "high"] | None = None,
    confidence: Literal["low", "medium", "high"] | None = None,
    artifacts: dict[str, str] | None = None,
    depends_on: list[str] | None = None,
    agent: Agent = "agent",
) -> dict[str, Any]:
    fields = {
        k: v
        for k, v in {
            "title": title,
            "problem_statement": problem_statement,
            "root_cause": root_cause,
            "code_description": code_description,
            "solution_description": solution_description,
            "files": files,
            "acceptance_criteria": acceptance_criteria,
            "tags": tags,
            "risk": risk,
            "confidence": confidence,
            "artifacts": artifacts,
            "depends_on": depends_on,
        }.items()
        if v is not None
    }

    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        return work.node_dict(await work.update_node(db, s, node_id, fields, agent))

    return await _run(ctx, go)


@server.tool(
    description=(
        "Change a node's status. done needs solution_description (pass it here or via update_node); "
        "not_an_issue needs a rationale. Branch status follows its children automatically."
    )
)
async def set_status(
    ctx: Context[Any, Any],
    session_id: SessionId,
    node_id: NodeId,
    status: Literal["open", "in_progress", "partial", "decision_needed", "blocked", "done", "not_an_issue"],
    rationale: str | None = None,
    solution_description: str | None = None,
    agent: Agent = "agent",
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        n = await work.set_status(db, s, node_id, status, agent, rationale, solution_description)
        nodes = await work.load_nodes(db, s.id)
        return {"node": _brief(n), "session_status": s.status, "progress": work.progress(nodes).as_dict()}

    return await _run(ctx, go)


@server.tool(
    description="Lock a leaf to you before working on it. Warns when another claimed leaf shares files."
)
async def claim_node(
    ctx: Context[Any, Any], session_id: SessionId, node_id: NodeId, agent: Agent
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        n, warnings = await work.claim(db, s, node_id, agent)
        return {"node": _brief(n), "warnings": warnings}

    return await _run(ctx, go)


@server.tool(
    description="Give a leaf back. Add a note of where you got to; it's kept for whoever picks it up next."
)
async def release_node(
    ctx: Context[Any, Any], session_id: SessionId, node_id: NodeId, agent: Agent, note: str | None = None
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        return _brief(await work.release(db, s, node_id, agent, note))

    return await _run(ctx, go)


@server.tool(
    description="Leaves ready to work now: open or partial, unclaimed, dependencies resolved. In tree order."
)
async def list_open_leaves(
    ctx: Context[Any, Any], session_id: SessionId, tag: str | None = None, limit: int = 20
) -> list[dict[str, Any]]:
    async def go(db: AsyncSession, user: User) -> list[dict[str, Any]]:
        s = await work.get_session(db, user.id, session_id)
        nodes = await work.load_nodes(db, s.id)
        return [_brief(n) for n in work.open_leaves(nodes, tag)[: max(1, min(limit, 100))]]

    return await _run(ctx, go)


@server.tool(
    description=(
        "Everything needed to ship one leaf in a fresh context: its fields and notes, a thin breadcrumb of its "
        "ancestors, what its dependencies did, and file-collision warnings. Never the whole tree."
    )
)
async def get_context_bundle(
    ctx: Context[Any, Any], session_id: SessionId, node_id: NodeId
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        nodes = await work.load_nodes(db, s.id)
        return work.context_bundle(s, nodes, work.find(nodes, node_id))

    return await _run(ctx, go)


@server.tool(description="Declare that node_id can only start after depends_on_id is resolved.")
async def add_dependency(
    ctx: Context[Any, Any],
    session_id: SessionId,
    node_id: NodeId,
    depends_on_id: NodeId,
    agent: Agent = "agent",
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        return _brief(await work.add_dependency(db, s, node_id, depends_on_id, agent))

    return await _run(ctx, go)


@server.tool(description="Attach a note to a node: progress, a finding, or memory for the next session.")
async def add_note(
    ctx: Context[Any, Any], session_id: SessionId, node_id: NodeId, text: str, agent: Agent = "agent"
) -> dict[str, Any]:
    async def go(db: AsyncSession, user: User) -> dict[str, Any]:
        s = await work.get_session(db, user.id, session_id)
        return _brief(await work.add_note(db, s, node_id, agent, text))

    return await _run(ctx, go)


# ---------- HTTP mounting ----------

# Generous: an agent working a big tree makes many small calls. Per token, sliding window.
_limiter = auth.RateLimiter(limit=600, window_s=10 * 60)


def build_http_app() -> tuple[
    Callable[[Scope, Receive, Send], Awaitable[None]], StreamableHTTPSessionManager
]:
    """A fresh transport per app lifespan (a session manager can only run once)."""
    server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        # Every request needs a secret token, so DNS-rebinding protection (meant for
        # unauthenticated local servers) adds nothing, and it would reject our public host.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    manager = server.session_manager
    inner = StreamableHTTPASGIApp(manager)

    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        header = headers.get("authorization", "")
        raw = header[7:].strip() if header.lower().startswith("bearer ") else ""
        async with get_sessionmaker()() as db:
            user = await tokens.user_for(db, raw) if raw else None
        if user is None:
            return await _reply(
                send, 401, {"error": "unauthorized", "hint": "Send Authorization: Bearer cbk_..."}
            )
        if not _limiter.allow(raw[:24]):
            return await _reply(send, 429, {"error": "rate_limited"})
        await inner(scope, receive, send)

    return app, manager


async def _reply(send: Send, status: int, body: dict[str, Any]) -> None:
    payload = json.dumps(body).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]
    if status == 401:
        headers.append((b"www-authenticate", b'Bearer realm="curveball"'))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": payload})
