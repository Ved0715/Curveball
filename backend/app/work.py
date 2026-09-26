"""Bullpen: task trees that coding agents decompose and work through (docs/BULLPEN_PLAN.md).

Every rule lives here, and both the web API (routers/work.py) and the MCP server
(mcp_server.py) call these functions, so a human in the browser and an agent over MCP
can never see different behaviour.

A session's tree is small by construction (node_budget, default 150), so after every
change we reload it and recompute the roll-up in memory: simple and always consistent.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import learning
from app.models import QueueItem, WorkEvent, WorkNode, WorkSession

STATUSES = ("open", "in_progress", "partial", "decision_needed", "blocked", "done", "not_an_issue")
RESOLVED = frozenset({"done", "not_an_issue"})
READY = frozenset({"open", "partial"})  # a leaf in one of these can be picked up
LEVELS = ("low", "medium", "high")
STALE_CLAIM = timedelta(minutes=30)
MAX_CHILDREN = 12
MIN_SOLUTION_CHARS = 20
MIN_RATIONALE_CHARS = 5
MAX_ACTIVE_SESSIONS = 50
QUEUE_LIMIT = 50  # same cap as the learning queue itself

# Fields a person or an agent may edit directly (status, tree shape and claims have their own calls).
EDITABLE = (
    "title",
    "problem_statement",
    "root_cause",
    "code_description",
    "solution_description",
    "files",
    "tags",
    "risk",
    "confidence",
    "acceptance_criteria",
)
TEXT_LIMITS = {
    "title": 200,
    "problem_statement": 4000,
    "root_cause": 4000,
    "code_description": 4000,
    "solution_description": 6000,
}


class WorkError(Exception):
    """A rule was broken. `message` is written for whoever is on the other end - a person in
    the web UI or an agent over MCP - and says how to fix it."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime | None) -> datetime | None:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=UTC)


def _iso(dt: datetime | None) -> str | None:
    dt = _aware(dt)
    return dt.isoformat() if dt else None


# ---------- Loading ----------


async def get_session(db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID | str) -> WorkSession:
    try:
        sid = session_id if isinstance(session_id, uuid.UUID) else uuid.UUID(str(session_id))
    except ValueError as e:
        raise WorkError(404, "not_found", f"No session with id {session_id!r}.") from e
    s = await db.get(WorkSession, sid)
    if s is None or s.user_id != user_id:
        raise WorkError(
            404, "not_found", f"No session with id {session_id}. Call list_sessions to see yours."
        )
    return s


async def load_nodes(db: AsyncSession, session_id: uuid.UUID) -> list[WorkNode]:
    rows = await db.scalars(select(WorkNode).where(WorkNode.session_id == session_id))
    return list(rows)


def find(nodes: list[WorkNode], node_id: uuid.UUID | str) -> WorkNode:
    for n in nodes:
        if str(n.id) == str(node_id):
            return n
    raise WorkError(404, "not_found", f"No node with id {node_id} in this session. Call get_tree to see ids.")


def root_of(nodes: list[WorkNode]) -> WorkNode:
    return next(n for n in nodes if n.parent_id is None)


def _children(nodes: list[WorkNode]) -> dict[uuid.UUID | None, list[WorkNode]]:
    by_parent: dict[uuid.UUID | None, list[WorkNode]] = defaultdict(list)
    for n in nodes:
        by_parent[n.parent_id].append(n)
    for kids in by_parent.values():
        kids.sort(key=lambda k: (k.position, _aware(k.created_at) or _now()))
    return by_parent


def tree_order(nodes: list[WorkNode]) -> list[WorkNode]:
    """Depth-first, siblings by position: the order a person reads the tree in."""
    kids = _children(nodes)
    out: list[WorkNode] = []
    stack = list(reversed(kids[None]))
    while stack:
        n = stack.pop()
        out.append(n)
        stack.extend(reversed(kids[n.id]))
    return out


def ancestors(nodes: list[WorkNode], node: WorkNode) -> list[WorkNode]:
    by_id = {n.id: n for n in nodes}
    chain: list[WorkNode] = []
    cur = node
    while cur.parent_id is not None:
        cur = by_id[cur.parent_id]
        chain.append(cur)
    return list(reversed(chain))


def descendants(nodes: list[WorkNode], node: WorkNode) -> list[WorkNode]:
    kids = _children(nodes)
    out: list[WorkNode] = []
    stack = list(kids[node.id])
    while stack:
        n = stack.pop()
        out.append(n)
        stack.extend(kids[n.id])
    return out


def claim_is_live(node: WorkNode, now: datetime | None = None) -> bool:
    claimed = _aware(node.claimed_at)
    return bool(node.owner) and claimed is not None and (now or _now()) - claimed < STALE_CLAIM


# ---------- Serialising ----------


def node_dict(n: WorkNode) -> dict[str, Any]:
    return {
        "id": str(n.id),
        "parent_id": str(n.parent_id) if n.parent_id else None,
        "position": n.position,
        "depth": n.depth,
        "title": n.title,
        "problem_statement": n.problem_statement,
        "root_cause": n.root_cause,
        "code_description": n.code_description,
        "solution_description": n.solution_description,
        "files": list(n.files or []),
        "status": n.status,
        "is_leaf": n.is_leaf,
        "depends_on": list(n.depends_on or []),
        "owner": n.owner if claim_is_live(n) else None,
        "claimed_at": _iso(n.claimed_at) if claim_is_live(n) else None,
        "tags": list(n.tags or []),
        "risk": n.risk,
        "confidence": n.confidence,
        "acceptance_criteria": list(n.acceptance_criteria or []),
        "artifacts": dict(n.artifacts or {}),
        "notes": list(n.notes or []),
        "created_at": _iso(n.created_at),
        "updated_at": _iso(n.updated_at),
        "resolved_at": _iso(n.resolved_at),
    }


@dataclass(frozen=True)
class Progress:
    leaves: int
    done: int
    in_progress: int
    blocked: int
    decision_needed: int
    nodes: int

    def as_dict(self) -> dict[str, int]:
        return self.__dict__.copy()


def progress(nodes: list[WorkNode]) -> Progress:
    leaves = [n for n in nodes if n.is_leaf]
    return Progress(
        leaves=len(leaves),
        done=sum(n.status in RESOLVED for n in leaves),
        in_progress=sum(n.status in ("in_progress", "partial") for n in leaves),
        blocked=sum(n.status == "blocked" for n in leaves),
        decision_needed=sum(n.status == "decision_needed" for n in leaves),
        nodes=len(nodes),
    )


def session_dict(s: WorkSession, nodes: list[WorkNode] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(s.id),
        "title": s.title,
        "prompt": s.prompt,
        "repo": s.repo,
        "status": s.status,
        "node_budget": s.node_budget,
        "max_depth": s.max_depth,
        "created_at": _iso(s.created_at),
        "updated_at": _iso(s.updated_at),
        "resolved_at": _iso(s.resolved_at),
    }
    if nodes is not None:
        out["progress"] = progress(nodes).as_dict()
    return out


def outline(nodes: list[WorkNode]) -> str:
    """Token-cheap text view of the whole tree, for agents."""
    lines = []
    for n in tree_order(nodes):
        kind = "leaf" if n.is_leaf else "branch"
        owner = f" @{n.owner}" if claim_is_live(n) else ""
        deps = f" after:{','.join(d[:8] for d in n.depends_on)}" if n.depends_on else ""
        lines.append(f"{'  ' * n.depth}- [{n.status}] {n.title} ({kind} {n.id}){owner}{deps}")
    return "\n".join(lines)


# ---------- Events and roll-up ----------


def _event(
    db: AsyncSession, s: WorkSession, actor: str, kind: str, node: WorkNode | None = None, **detail: Any
) -> None:
    db.add(
        WorkEvent(
            session_id=s.id, node_id=node.id if node else None, actor=actor[:120], kind=kind, detail=detail
        )
    )


def _derived_status(children: list[WorkNode]) -> str:
    statuses = [c.status for c in children]
    if all(st in RESOLVED for st in statuses):
        return "not_an_issue" if all(st == "not_an_issue" for st in statuses) else "done"
    if any(st in ("in_progress", "partial") or st in RESOLVED for st in statuses):
        return "in_progress"
    if "decision_needed" in statuses:
        return "decision_needed"
    if "blocked" in statuses:
        return "blocked"
    return "open"


def _rollup(db: AsyncSession, s: WorkSession, nodes: list[WorkNode], actor: str) -> None:
    """Derive every branch's status from its children, deepest first; resolve the session
    when its root resolves. Pure in-memory work plus events for what changed."""
    kids = _children(nodes)
    now = _now()
    for n in sorted(nodes, key=lambda x: -x.depth):
        if n.is_leaf or not kids[n.id]:
            continue
        new = _derived_status(kids[n.id])
        if new != n.status:
            was = n.status
            n.status = new
            n.resolved_at = now if new in RESOLVED else None
            if new in RESOLVED:
                _event(db, s, actor, "rolled_up", n, status=new, was=was)
    root = root_of(nodes)
    if root.status in RESOLVED and s.status == "active":
        s.status, s.resolved_at = "resolved", now
        _event(db, s, actor, "session_resolved", root)
    elif root.status not in RESOLVED and s.status == "resolved":
        s.status, s.resolved_at = "active", None
        _event(db, s, actor, "session_reopened", root)
    s.updated_at = now


async def _commit(db: AsyncSession, s: WorkSession, nodes: list[WorkNode], actor: str) -> None:
    _rollup(db, s, nodes, actor)
    await db.commit()


# ---------- Sessions ----------


async def list_sessions(
    db: AsyncSession, user_id: uuid.UUID, include_archived: bool = False
) -> list[tuple[WorkSession, list[WorkNode]]]:
    q = select(WorkSession).where(WorkSession.user_id == user_id)
    if not include_archived:
        q = q.where(WorkSession.status != "archived")
    sessions = list(await db.scalars(q.order_by(WorkSession.updated_at.desc())))
    if not sessions:
        return []
    rows = await db.scalars(select(WorkNode).where(WorkNode.session_id.in_([s.id for s in sessions])))
    by_session: dict[uuid.UUID, list[WorkNode]] = defaultdict(list)
    for n in rows:
        by_session[n.session_id].append(n)
    return [(s, by_session[s.id]) for s in sessions]


async def create_session(
    db: AsyncSession, user_id: uuid.UUID, title: str, prompt: str, repo: str, actor: str
) -> tuple[WorkSession, WorkNode]:
    title = _text("title", title)
    if not title:
        raise WorkError(422, "bad_request", "A session needs a title.")
    active = await db.scalar(
        select(func.count())
        .select_from(WorkSession)
        .where(WorkSession.user_id == user_id, WorkSession.status == "active")
    )
    if (active or 0) >= MAX_ACTIVE_SESSIONS:
        raise WorkError(409, "too_many_sessions", "Too many active sessions. Archive or delete some first.")
    s = WorkSession(
        user_id=user_id, title=title, prompt=(prompt or "").strip()[:20000], repo=(repo or "").strip()[:300]
    )
    db.add(s)
    await db.flush()
    root = WorkNode(
        session_id=s.id,
        parent_id=None,
        depth=0,
        position=0,
        title=title,
        problem_statement=(prompt or "").strip()[:4000],
        files=[],
        tags=[],
        depends_on=[],
        acceptance_criteria=[],
        artifacts={},
        notes=[],
    )
    db.add(root)
    await db.flush()
    _event(db, s, actor, "session_created", root, title=title)
    await db.commit()
    return s, root


async def update_session(
    db: AsyncSession, s: WorkSession, actor: str, title: str | None, status: str | None
) -> None:
    if title is not None:
        s.title = _text("title", title) or s.title
    if status is not None:
        if status not in ("active", "archived"):
            raise WorkError(422, "bad_request", "A session can only be set to active or archived.")
        if status == "archived":
            s.status = "archived"
        else:
            nodes = await load_nodes(db, s.id)
            s.status = "resolved" if root_of(nodes).status in RESOLVED else "active"
        _event(db, s, actor, "session_" + status)
    s.updated_at = _now()
    await db.commit()


async def delete_session(db: AsyncSession, s: WorkSession) -> None:
    await db.delete(s)
    await db.commit()


# ---------- Validation helpers ----------


def _text(field: str, value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise WorkError(422, "bad_request", f"{field} must be text.")
    return value.strip()[: TEXT_LIMITS.get(field, 4000)]


def _str_list(field: str, value: Any, limit: int = 50, each: int = 300) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise WorkError(422, "bad_request", f"{field} must be a list of strings.")
    return [v.strip()[:each] for v in value if v.strip()][:limit]


def _level(field: str, value: Any) -> str | None:
    if value in (None, ""):
        return None
    if value not in LEVELS:
        raise WorkError(422, "bad_request", f"{field} must be one of low, medium, high.")
    return str(value)


def _apply_fields(n: WorkNode, fields: dict[str, Any]) -> list[str]:
    changed: list[str] = []
    for key, value in fields.items():
        if key not in EDITABLE:
            continue
        if key in TEXT_LIMITS:
            new: Any = _text(key, value)
            if key == "title" and not new:
                raise WorkError(422, "bad_request", "A node needs a title.")
        elif key in ("files", "tags", "acceptance_criteria"):
            new = _str_list(key, value, each=120 if key == "tags" else 300)
        else:
            new = _level(key, value)
        if getattr(n, key) != new:
            setattr(n, key, new)
            changed.append(key)
    return changed


def _heartbeat(n: WorkNode, actor: str) -> None:
    """Any write by the claim's owner keeps the claim alive."""
    if n.owner and n.owner == actor:
        n.claimed_at = _now()


# ---------- Tree shape ----------


def _new_node(s: WorkSession, parent: WorkNode, position: int, spec: dict[str, Any]) -> WorkNode:
    if not isinstance(spec, dict):
        raise WorkError(422, "bad_request", "Each child must be an object with at least a title.")
    n = WorkNode(
        id=uuid.uuid4(),
        session_id=s.id,
        parent_id=parent.id,
        depth=parent.depth + 1,
        position=position,
        title="",
        files=[],
        tags=[],
        depends_on=[],
        acceptance_criteria=[],
        artifacts={},
        notes=[],
        status="open",
        is_leaf=True,
    )
    _apply_fields(n, {k: v for k, v in spec.items() if k in EDITABLE and k != "solution_description"})
    if not n.title:
        raise WorkError(422, "bad_request", "Each child needs a title.")
    if "is_leaf" in spec:
        n.is_leaf = bool(spec["is_leaf"])
    return n


async def add_children(
    db: AsyncSession, s: WorkSession, parent_id: uuid.UUID | str, specs: list[dict[str, Any]], actor: str
) -> list[WorkNode]:
    """decompose_node and add_node both land here. Children may declare order among
    themselves with `after: [index, ...]` (0-based positions in this same list)."""
    if s.status == "archived":
        raise WorkError(409, "archived", "This session is archived. Unarchive it to change the tree.")
    nodes = await load_nodes(db, s.id)
    parent = find(nodes, parent_id)
    if not isinstance(specs, list) or not specs:
        raise WorkError(422, "bad_request", "Give at least one child.")
    if len(specs) > MAX_CHILDREN:
        raise WorkError(
            422,
            "too_many_children",
            f"At most {MAX_CHILDREN} children per call. Group related work under intermediate branches.",
        )
    if parent.status in RESOLVED:
        raise WorkError(
            409, "resolved_node", "That node is already resolved. Reopen it before adding work under it."
        )
    if parent.depth + 1 > s.max_depth:
        raise WorkError(
            409,
            "too_deep",
            f"The tree is limited to depth {s.max_depth}. Treat this node as a leaf and solve it directly.",
        )
    if len(nodes) + len(specs) > s.node_budget:
        raise WorkError(
            409,
            "budget_exceeded",
            f"This session is limited to {s.node_budget} nodes ({len(nodes)} used). "
            "Prefer coarser leaves, or ask the user to raise the budget.",
        )
    start = max((n.position for n in nodes if n.parent_id == parent.id), default=-1) + 1
    created = [_new_node(s, parent, start + i, spec) for i, spec in enumerate(specs)]
    for i, spec in enumerate(specs):
        after = spec.get("after") or []
        if not isinstance(after, list) or not all(
            isinstance(a, int) and 0 <= a < len(specs) and a != i for a in after
        ):
            raise WorkError(
                422, "bad_request", "`after` must list indexes of other children in this same call."
            )
        created[i].depends_on = [str(created[a].id) for a in after]
    was_leaf = parent.is_leaf
    parent.is_leaf = False
    parent.owner, parent.claimed_at = None, None  # a branch can't be claimed
    for n in created:
        db.add(n)
    nodes.extend(created)
    _check_acyclic(nodes)
    _event(
        db,
        s,
        actor,
        "decomposed" if was_leaf or len(created) > 1 else "node_added",
        parent,
        children=[{"id": str(n.id), "title": n.title} for n in created],
    )
    await _commit(db, s, nodes, actor)
    return created


async def delete_node(db: AsyncSession, s: WorkSession, node_id: uuid.UUID | str, actor: str) -> None:
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    if n.parent_id is None:
        raise WorkError(409, "root_node", "The root can't be deleted. Delete the session instead.")
    gone = {n.id, *(d.id for d in descendants(nodes, n))}
    gone_str = {str(g) for g in gone}
    for other in nodes:
        if other.id not in gone and set(other.depends_on or []) & gone_str:
            other.depends_on = [d for d in other.depends_on if d not in gone_str]
    parent = find(nodes, n.parent_id)
    _event(db, s, actor, "node_deleted", n, title=n.title, removed=len(gone))
    await db.delete(n)  # children go with it (ON DELETE CASCADE)
    remaining = [x for x in nodes if x.id not in gone]
    if not any(x.parent_id == parent.id for x in remaining):
        parent.is_leaf, parent.status, parent.resolved_at = True, "open", None
    await db.flush()
    await _commit(db, s, remaining, actor)


# ---------- Fields, status, claims ----------


async def update_node(
    db: AsyncSession, s: WorkSession, node_id: uuid.UUID | str, fields: dict[str, Any], actor: str
) -> WorkNode:
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    changed = _apply_fields(n, fields)
    if "artifacts" in fields:
        art = fields["artifacts"]
        if not isinstance(art, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in art.items()
        ):
            raise WorkError(
                422, "bad_request", "artifacts must map names (pr, commit, tests) to links or ids."
            )
        merged = {
            **(n.artifacts or {}),
            **{k.strip()[:40]: v.strip()[:500] for k, v in art.items() if v.strip()},
        }
        if merged != n.artifacts:
            n.artifacts = merged
            changed.append("artifacts")
    if "depends_on" in fields:
        _set_dependencies(nodes, n, fields["depends_on"])
        changed.append("depends_on")
    if "is_leaf" in fields and bool(fields["is_leaf"]) != n.is_leaf:
        if not fields["is_leaf"]:
            raise WorkError(422, "bad_request", "To turn a leaf into a branch, decompose it into children.")
        if any(x.parent_id == n.id for x in nodes):
            raise WorkError(409, "has_children", "Delete this branch's children before marking it a leaf.")
        n.is_leaf = True
        changed.append("is_leaf")
    _heartbeat(n, actor)
    if changed:
        _event(db, s, actor, "node_updated", n, fields=changed)
    await _commit(db, s, nodes, actor)
    return n


async def set_status(
    db: AsyncSession,
    s: WorkSession,
    node_id: uuid.UUID | str,
    status: str,
    actor: str,
    rationale: str | None = None,
    solution_description: str | None = None,
) -> WorkNode:
    if status not in STATUSES:
        raise WorkError(422, "bad_request", f"status must be one of: {', '.join(STATUSES)}.")
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    rationale = (rationale or "").strip()[:1000]
    if solution_description is not None:
        _apply_fields(n, {"solution_description": solution_description})
    if not n.is_leaf:
        if status != "not_an_issue":
            raise WorkError(
                409,
                "branch_status_derived",
                "A branch's status follows its children. Change the leaves, or close the whole branch as not_an_issue.",
            )
        if len(rationale) < MIN_RATIONALE_CHARS:
            raise WorkError(422, "needs_rationale", "Say in one line why this isn't an issue.")
        for d in descendants(nodes, n):
            if d.is_leaf and d.status not in RESOLVED:
                d.status, d.resolved_at, d.owner, d.claimed_at = "not_an_issue", _now(), None, None
        _note(n, actor, f"Closed as not an issue: {rationale}")
        _event(db, s, actor, "status_changed", n, status=status, rationale=rationale)
        await _commit(db, s, nodes, actor)
        return n

    if status == "done" and len(n.solution_description.strip()) < MIN_SOLUTION_CHARS:
        raise WorkError(
            422,
            "needs_solution",
            f"Before marking done, describe what you changed and why in solution_description "
            f"(at least {MIN_SOLUTION_CHARS} characters).",
        )
    if status == "not_an_issue" and len(rationale) < MIN_RATIONALE_CHARS:
        raise WorkError(422, "needs_rationale", "Say in one line why this isn't an issue.")
    was = n.status
    n.status = status
    now = _now()
    n.resolved_at = now if status in RESOLVED else None
    if status in RESOLVED or status == "open":
        n.owner, n.claimed_at = None, None
    elif status == "in_progress" and not claim_is_live(n):
        n.owner, n.claimed_at = actor[:120], now
    else:
        _heartbeat(n, actor)
    if rationale:
        _note(n, actor, rationale)
    _event(db, s, actor, "status_changed", n, status=status, was=was, rationale=rationale or None)
    await _commit(db, s, nodes, actor)
    return n


async def claim(
    db: AsyncSession, s: WorkSession, node_id: uuid.UUID | str, actor: str
) -> tuple[WorkNode, list[str]]:
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    if not n.is_leaf:
        raise WorkError(409, "not_a_leaf", "Only leaves can be claimed. Pick one from list_open_leaves.")
    if n.status in RESOLVED:
        raise WorkError(409, "resolved_node", "That leaf is already resolved.")
    if claim_is_live(n) and n.owner != actor:
        raise WorkError(
            409, "already_claimed", f"{n.owner} is working on this leaf. Pick another from list_open_leaves."
        )
    unresolved = _unresolved_deps(nodes, n)
    if unresolved:
        raise WorkError(
            409,
            "blocked_by_dependency",
            "This leaf waits on: " + "; ".join(f"{d.title} ({d.id}, {d.status})" for d in unresolved),
        )
    n.owner, n.claimed_at = actor[:120], _now()
    if n.status in READY or n.status == "blocked":
        n.status = "in_progress"
    warnings = [
        f"{other.title} ({other.id}), claimed by {other.owner}, also touches: {', '.join(shared)}"
        for other, shared in _collisions(nodes, n)
    ]
    _event(db, s, actor, "claimed", n, warnings=warnings or None)
    await _commit(db, s, nodes, actor)
    return n, warnings


async def release(
    db: AsyncSession, s: WorkSession, node_id: uuid.UUID | str, actor: str, note: str | None
) -> WorkNode:
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    if claim_is_live(n) and n.owner != actor:
        raise WorkError(409, "already_claimed", f"This leaf is claimed by {n.owner}, not you.")
    note = (note or "").strip()
    if note:
        _note(n, actor, note)
    n.owner, n.claimed_at = None, None
    if n.status == "in_progress":
        n.status = "partial" if note else "open"
    _event(db, s, actor, "released", n, note=note or None)
    await _commit(db, s, nodes, actor)
    return n


def _note(n: WorkNode, actor: str, text: str) -> None:
    n.notes = [
        *(n.notes or []),
        {"at": _now().isoformat(), "actor": actor[:120], "text": text.strip()[:2000]},
    ][-50:]


async def add_note(
    db: AsyncSession, s: WorkSession, node_id: uuid.UUID | str, actor: str, text: str
) -> WorkNode:
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    if not (text or "").strip():
        raise WorkError(422, "bad_request", "A note needs some text.")
    _note(n, actor, text)
    _heartbeat(n, actor)
    _event(db, s, actor, "note_added", n, text=text.strip()[:200])
    await _commit(db, s, nodes, actor)
    return n


# ---------- Dependencies ----------


def _check_acyclic(nodes: list[WorkNode]) -> None:
    graph = {str(n.id): list(n.depends_on or []) for n in nodes}
    state: dict[str, int] = {}  # 1 = visiting, 2 = done

    def visit(v: str) -> None:
        state[v] = 1
        for w in graph.get(v, []):
            if state.get(w) == 1:
                raise WorkError(409, "dependency_cycle", "That would create a dependency cycle.")
            if w in graph and state.get(w) != 2:
                visit(w)
        state[v] = 2

    for v in graph:
        if v not in state:
            visit(v)


def _set_dependencies(nodes: list[WorkNode], n: WorkNode, ids: Any) -> None:
    deps = _str_list("depends_on", ids, limit=30, each=40)
    for d in deps:
        other = find(nodes, d)
        if other.id == n.id:
            raise WorkError(409, "dependency_cycle", "A node can't depend on itself.")
        if other.id in {a.id for a in ancestors(nodes, n)} or n.id in {a.id for a in ancestors(nodes, other)}:
            raise WorkError(409, "bad_request", "A node can't depend on its own ancestor or descendant.")
    n.depends_on = [str(find(nodes, d).id) for d in dict.fromkeys(deps)]
    _check_acyclic(nodes)


async def add_dependency(
    db: AsyncSession, s: WorkSession, node_id: uuid.UUID | str, depends_on_id: uuid.UUID | str, actor: str
) -> WorkNode:
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    _set_dependencies(nodes, n, [*(n.depends_on or []), str(depends_on_id)])
    _event(db, s, actor, "dependency_added", n, depends_on=str(depends_on_id))
    await _commit(db, s, nodes, actor)
    return n


def _unresolved_deps(nodes: list[WorkNode], n: WorkNode) -> list[WorkNode]:
    by_id = {str(x.id): x for x in nodes}
    return [by_id[d] for d in (n.depends_on or []) if d in by_id and by_id[d].status not in RESOLVED]


def _collisions(nodes: list[WorkNode], n: WorkNode) -> list[tuple[WorkNode, list[str]]]:
    mine = set(n.files or [])
    if not mine:
        return []
    out = []
    for other in nodes:
        if other.id == n.id or not other.is_leaf or not claim_is_live(other):
            continue
        shared = sorted(mine & set(other.files or []))
        if shared:
            out.append((other, shared))
    return out


# ---------- Reading for agents ----------


def open_leaves(nodes: list[WorkNode], tag: str | None = None) -> list[WorkNode]:
    """Leaves ready to pick up: waiting (open/partial), unclaimed or stale, dependencies resolved."""
    return [
        n
        for n in tree_order(nodes)
        if n.is_leaf
        and n.status in READY
        and not claim_is_live(n)
        and not _unresolved_deps(nodes, n)
        and (tag is None or tag in (n.tags or []))
    ]


def context_bundle(s: WorkSession, nodes: list[WorkNode], n: WorkNode) -> dict[str, Any]:
    """Everything a fresh agent needs to ship this one leaf - and nothing more."""
    by_id = {str(x.id): x for x in nodes}
    return {
        "session": {"id": str(s.id), "title": s.title, "repo": s.repo},
        "node": node_dict(n),
        "breadcrumb": [
            {"id": str(a.id), "title": a.title, "problem_statement": a.problem_statement[:400]}
            for a in ancestors(nodes, n)
        ],
        "dependencies": [
            {
                "id": d,
                "title": by_id[d].title,
                "status": by_id[d].status,
                "solution_description": by_id[d].solution_description[:1500],
            }
            for d in (n.depends_on or [])
            if d in by_id
        ],
        "collisions": [
            {"id": str(o.id), "title": o.title, "owner": o.owner, "shared_files": shared}
            for o, shared in _collisions(nodes, n)
        ],
        "when_done": (
            "Call update_node with solution_description (what changed and why), root_cause if you found one, "
            "and artifacts (pr/commit/tests), then set_status done. If it turned out bigger than one sitting, "
            "decompose_node it instead. If you have to stop, release_node with a note of where you got to."
        ),
    }


async def events_since(
    db: AsyncSession, s: WorkSession, since: int = 0, limit: int = 200
) -> list[dict[str, Any]]:
    rows = await db.scalars(
        select(WorkEvent)
        .where(WorkEvent.session_id == s.id, WorkEvent.id > since)
        .order_by(WorkEvent.id)
        .limit(limit)
    )
    return [
        {
            "id": e.id,
            "node_id": str(e.node_id) if e.node_id else None,
            "actor": e.actor,
            "kind": e.kind,
            "detail": e.detail,
            "created_at": _iso(e.created_at),
        }
        for e in rows
    ]


async def last_event_id(db: AsyncSession, s: WorkSession) -> int:
    return int(await db.scalar(select(func.max(WorkEvent.id)).where(WorkEvent.session_id == s.id)) or 0)


# ---------- The link back to Learn ----------


def topic_for(n: WorkNode) -> tuple[str, str]:
    """A learnable topic from a resolved leaf: the concept behind the fix, not the ticket."""
    cause = n.root_cause.strip()
    first = cause.split(". ")[0].strip().rstrip(".") if cause else ""
    title = (first if 12 <= len(first) <= 120 else n.title)[:200]
    blurb = (cause or n.problem_statement or n.solution_description)[:600]
    return title, blurb


async def queue_topic(
    db: AsyncSession,
    user_id: uuid.UUID,
    s: WorkSession,
    node_id: uuid.UUID | str,
    title: str | None,
    actor: str,
) -> QueueItem:
    nodes = await load_nodes(db, s.id)
    n = find(nodes, node_id)
    default_title, blurb = topic_for(n)
    title = (title or default_title).strip()[:200]
    if not title:
        raise WorkError(422, "bad_request", "The topic needs a title.")
    dup = await db.scalar(
        select(QueueItem).where(QueueItem.user_id == user_id, func.lower(QueueItem.title) == title.lower())
    )
    if dup is not None:
        return dup
    count = await db.scalar(select(func.count()).select_from(QueueItem).where(QueueItem.user_id == user_id))
    if (count or 0) >= QUEUE_LIMIT:
        raise WorkError(409, "queue_full", "Your learning queue is full. Learn or remove a few topics first.")
    item = QueueItem(
        user_id=user_id,
        title=title,
        blurb=blurb,
        source="work",
        position=await learning.next_queue_position(db, user_id),
    )
    db.add(item)
    _event(db, s, actor, "queued_to_learn", n, title=title)
    await db.commit()
    return item
