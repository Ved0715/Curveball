"""Bullpen web API (cookie auth). A thin layer over app/work.py, which holds every rule."""

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field

from app import tokens, work
from app.deps import CurrentUser, Db
from app.errors import AppError
from app.models import WorkNode
from app.repo import iso

router = APIRouter(prefix="/api/work", tags=["work"])


def _actor(user: Any) -> str:
    return str(user.name)[:120]


# ---------- Sessions ----------


class SessionIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    prompt: str = Field(default="", max_length=20000)
    repo: str = Field(default="", max_length=300)


class SessionPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: Literal["active", "archived"] | None = None


@router.get("/sessions")
async def list_sessions(db: Db, user: CurrentUser, archived: bool = False) -> list[dict[str, Any]]:
    return [work.session_dict(s, nodes) for s, nodes in await work.list_sessions(db, user.id, archived)]


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(body: SessionIn, db: Db, user: CurrentUser) -> dict[str, Any]:
    s, root = await work.create_session(db, user.id, body.title, body.prompt, body.repo, _actor(user))
    return work.session_dict(s, [root])


@router.get("/sessions/{session_id}")
async def get_session(session_id: uuid.UUID, db: Db, user: CurrentUser) -> dict[str, Any]:
    s = await work.get_session(db, user.id, session_id)
    nodes = await work.load_nodes(db, s.id)
    return {
        "session": work.session_dict(s, nodes),
        "nodes": [work.node_dict(n) for n in work.tree_order(nodes)],
        "ready": [str(n.id) for n in work.open_leaves(nodes)],
        "last_event_id": await work.last_event_id(db, s),
    }


@router.patch("/sessions/{session_id}")
async def patch_session(
    session_id: uuid.UUID, body: SessionPatch, db: Db, user: CurrentUser
) -> dict[str, Any]:
    s = await work.get_session(db, user.id, session_id)
    await work.update_session(db, s, _actor(user), body.title, body.status)
    return work.session_dict(s, await work.load_nodes(db, s.id))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: uuid.UUID, db: Db, user: CurrentUser) -> Response:
    s = await work.get_session(db, user.id, session_id)
    await work.delete_session(db, s)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions/{session_id}/events")
async def events(
    session_id: uuid.UUID, db: Db, user: CurrentUser, since: int = Query(0, ge=0)
) -> list[dict[str, Any]]:
    s = await work.get_session(db, user.id, session_id)
    return await work.events_since(db, s, since)


# ---------- Nodes ----------


class NodeIn(BaseModel):
    parent_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    problem_statement: str = Field(default="", max_length=4000)
    root_cause: str = Field(default="", max_length=4000)
    code_description: str = Field(default="", max_length=4000)
    files: list[str] = Field(default_factory=list, max_length=50)
    tags: list[str] = Field(default_factory=list, max_length=20)
    acceptance_criteria: list[str] = Field(default_factory=list, max_length=20)


class NodePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    problem_statement: str | None = Field(default=None, max_length=4000)
    root_cause: str | None = Field(default=None, max_length=4000)
    code_description: str | None = Field(default=None, max_length=4000)
    solution_description: str | None = Field(default=None, max_length=6000)
    files: list[str] | None = Field(default=None, max_length=50)
    tags: list[str] | None = Field(default=None, max_length=20)
    acceptance_criteria: list[str] | None = Field(default=None, max_length=20)
    risk: Literal["low", "medium", "high"] | None = None
    confidence: Literal["low", "medium", "high"] | None = None
    depends_on: list[str] | None = Field(default=None, max_length=30)
    artifacts: dict[str, str] | None = None


class StatusIn(BaseModel):
    status: Literal["open", "in_progress", "partial", "decision_needed", "blocked", "done", "not_an_issue"]
    rationale: str | None = Field(default=None, max_length=1000)


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class LearnIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)


async def _owned_node(db: Db, user: Any, node_id: uuid.UUID) -> tuple[Any, Any]:
    """The node and its session, only if the session is the user's."""
    n = await db.get(WorkNode, node_id)
    if n is None:
        raise AppError(404, "not_found")
    s = await work.get_session(db, user.id, n.session_id)
    return s, n


@router.post("/sessions/{session_id}/nodes", status_code=status.HTTP_201_CREATED)
async def add_node(session_id: uuid.UUID, body: NodeIn, db: Db, user: CurrentUser) -> dict[str, Any]:
    s = await work.get_session(db, user.id, session_id)
    spec = body.model_dump(exclude={"parent_id"})
    [n] = await work.add_children(db, s, body.parent_id, [spec], _actor(user))
    return work.node_dict(n)


@router.patch("/nodes/{node_id}")
async def patch_node(node_id: uuid.UUID, body: NodePatch, db: Db, user: CurrentUser) -> dict[str, Any]:
    s, n = await _owned_node(db, user, node_id)
    fields = body.model_dump(exclude_unset=True)
    return work.node_dict(await work.update_node(db, s, n.id, fields, _actor(user)))


@router.post("/nodes/{node_id}/status")
async def node_status(node_id: uuid.UUID, body: StatusIn, db: Db, user: CurrentUser) -> dict[str, Any]:
    s, n = await _owned_node(db, user, node_id)
    return work.node_dict(await work.set_status(db, s, n.id, body.status, _actor(user), body.rationale))


@router.post("/nodes/{node_id}/notes")
async def node_note(node_id: uuid.UUID, body: NoteIn, db: Db, user: CurrentUser) -> dict[str, Any]:
    s, n = await _owned_node(db, user, node_id)
    return work.node_dict(await work.add_note(db, s, n.id, _actor(user), body.text))


@router.post("/nodes/{node_id}/claim")
async def node_claim(node_id: uuid.UUID, db: Db, user: CurrentUser) -> dict[str, Any]:
    s, n = await _owned_node(db, user, node_id)
    node, warnings = await work.claim(db, s, n.id, _actor(user))
    return {"node": work.node_dict(node), "warnings": warnings}


@router.post("/nodes/{node_id}/release")
async def node_release(node_id: uuid.UUID, body: NoteIn | None, db: Db, user: CurrentUser) -> dict[str, Any]:
    s, n = await _owned_node(db, user, node_id)
    return work.node_dict(await work.release(db, s, n.id, _actor(user), body.text if body else None))


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(node_id: uuid.UUID, db: Db, user: CurrentUser) -> Response:
    s, n = await _owned_node(db, user, node_id)
    await work.delete_node(db, s, n.id, _actor(user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/nodes/{node_id}/learn", status_code=status.HTTP_201_CREATED)
async def node_learn(node_id: uuid.UUID, body: LearnIn, db: Db, user: CurrentUser) -> dict[str, Any]:
    """Queue the concept behind this fix as a future daily topic: Ship feeds Learn."""
    s, n = await _owned_node(db, user, node_id)
    item = await work.queue_topic(db, user.id, s, n.id, body.title, _actor(user))
    return {"id": str(item.id), "title": item.title}


# ---------- Tokens for MCP clients ----------


class TokenIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


def _token_out(t: Any) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "name": t.name,
        "prefix": t.prefix,
        "created_at": iso(t.created_at),
        "last_used_at": iso(t.last_used_at) if t.last_used_at else None,
    }


@router.get("/tokens")
async def list_tokens(db: Db, user: CurrentUser) -> list[dict[str, Any]]:
    return [_token_out(t) for t in await tokens.list_for(db, user.id)]


@router.post("/tokens", status_code=status.HTTP_201_CREATED)
async def create_token(body: TokenIn, db: Db, user: CurrentUser) -> dict[str, Any]:
    if len(await tokens.list_for(db, user.id)) >= tokens.MAX_TOKENS:
        raise AppError(409, "too_many_tokens")
    row, raw = await tokens.create(db, user.id, body.name)
    return {**_token_out(row), "token": raw}  # the only time the raw token is ever returned


@router.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(token_id: uuid.UUID, db: Db, user: CurrentUser) -> Response:
    if not await tokens.revoke(db, user.id, token_id):
        raise AppError(404, "not_found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
