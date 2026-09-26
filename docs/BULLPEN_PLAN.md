# Bullpen: implementation plan

Bullpen is Curveball's **Work** world: the hosted version of the Canopy plan
(`docs/Canopy — Task Tree Product Plan.md`). An AI coding agent breaks a big task
into a tree of small, independently shippable leaves through MCP; you and your
agents work the leaves; finished work feeds back into what you learn.

**The story of the product becomes Learn → Practice → Ship.**

- **Learn** (Today) teaches a topic a day.
- **Practice** (mock interviews) stress-tests it.
- **Ship** (Bullpen) is real work.

The root causes you fix at work can become tomorrow's topics, and shipped leaves
count toward your curve.

"Bullpen" is a working name. It lives in `frontend/src/lib/brand.ts` (`WORK_BRAND`),
so renaming it touches one line.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Local tool or hosted? | **Hosted inside Curveball** | Accounts, database, design system and deploy already exist. Agents connect to one URL with a personal token. |
| Where the tree lives | **Postgres (Neon) tables** | Answers Canopy's "SQLite vs JSON" question: many agents can write at once, and there are no merge conflicts. |
| MCP transport | **Streamable HTTP at `/api/mcp`**, stateless, JSON responses | Works through the existing Next.js `/api/*` proxy. Clients connect to it the same way as the rest of the app. |
| MCP auth | **Personal access tokens** (`cbk_…`), created in the UI, stored as SHA-256 hashes, shown once, revocable | Every MCP client supports a static `Authorization: Bearer` header. Full OAuth can come later. |
| Who decomposes? | **The agent**, through `decompose_node` | Costs us no AI calls. The agent already has the codebase in context. |
| Current session | **Explicit `session_id` on every call** | The server is stateless and several agents share a session. There's no hidden "current session" to drift. |
| Live updates in the UI | **Polling an events feed** (`?since=<id>` every 2.5 s) | Robust through proxies and serverless hosting. It can be upgraded to SSE later without changing the event model. |

## Data model (new tables; all cascade from `users`)

**`work_sessions`**: one task tree.

| Field | Meaning |
| --- | --- |
| `id`, `user_id` | Identity and owner |
| `title`, `prompt`, `repo` | What the task is |
| `status` | `active` · `resolved` · `archived` |
| `node_budget` (default 150), `max_depth` (default 6) | Runaway guard |
| `created_at`, `updated_at`, `resolved_at` | Timestamps |

**`work_nodes`**: a branch or a leaf.

| Field | Meaning |
| --- | --- |
| `session_id`, `parent_id`, `position`, `depth` | Tree shape |
| `title`, `problem_statement`, `root_cause`, `code_description`, `solution_description` | The fields from the Canopy plan |
| `files` (list) | The bounded set of files a leaf touches (feeds collision warnings) |
| `status` | `open` · `in_progress` · `partial` · `decision_needed` · `blocked` · `done` · `not_an_issue` |
| `is_leaf` | Leaf or branch |
| `depends_on` (leaf ids) | Execution order |
| `owner`, `claimed_at` | Claim lock (goes stale after 30 min without activity) |
| `tags`, `risk`, `confidence` | `risk` and `confidence` are `low`/`medium`/`high` |
| `acceptance_criteria` (list) | What "done" means |
| `artifacts` | PR, commit and test links |
| `notes` | `[{at, actor, text}]`: partial progress and comments. Read back into the context bundle, so memory survives a restart. |
| `created_at`, `updated_at`, `resolved_at` | Timestamps |

**`work_events`**: an append-only audit trail plus the live feed. Fields: autoincrement `id`, `session_id`, `node_id`, `actor`, `kind`, `detail`, `created_at`.

**`api_tokens`**: fields `user_id`, `name`, `token_hash`, `prefix`, `created_at`, `last_used_at`, `revoked_at`.

## Rules (enforced by the server, not the prompt)

- **Roll-up.** A branch's status is always derived from its children:
  - all children resolved (`done`/`not_an_issue`) → `done`;
  - otherwise, any progress below → `in_progress`;
  - otherwise → `open`.

  Recomputed up the ancestors on every change. When the root resolves, the session resolves.
- **Runaway guard.** `decompose_node` refuses to go past `node_budget` total nodes, past `max_depth`, or over 12 children per call.
- **Done gate.**
  - Only leaves can be set `done`.
  - `done` needs a `solution_description` of at least 20 characters.
  - `not_an_issue` needs a one-line rationale.
  - Setting a *branch* to `not_an_issue` closes its unresolved descendants.
- **Claims.**
  - One owner per leaf.
  - A claim goes stale after 30 minutes without activity, and anyone can then take it.
  - Claiming warns if another claimed leaf touches the same files.
  - Releasing with a note keeps the progress, and the status becomes `partial`.
- **Dependencies.** Leaves in the same session only, with no cycles. `list_open_leaves` returns only leaves whose dependencies are resolved and that aren't claimed.
- **Context bundle.** One leaf is returned plus a thin breadcrumb, never the whole tree. It contains:
  - the leaf's own fields and notes;
  - ancestors' titles and problem statements;
  - resolved dependencies' solutions;
  - file-collision warnings.

## MCP tools (v1)

| Tool | Purpose |
| --- | --- |
| `list_sessions` | Your sessions and their progress |
| `create_session(title, prompt, repo?)` | New tree with its root node |
| `get_tree(session_id)` | Compact outline: ids, titles, statuses, leaf flags |
| `decompose_node(session_id, node_id, children[])` | Split a node into children (repeatable, re-decomposes leaves) |
| `add_node(session_id, parent_id, …)` | Add one node |
| `update_node(session_id, node_id, …)` | Edit fields |
| `set_status(session_id, node_id, status, rationale?)` | Change status (runs the roll-up) |
| `claim_node` / `release_node` | Lock and unlock a leaf |
| `list_open_leaves(session_id)` | Ready work: dependencies resolved, unclaimed |
| `get_context_bundle(session_id, node_id)` | Everything needed to ship one leaf in a fresh context |
| `add_dependency(session_id, node_id, depends_on_id)` | Declare execution order |
| `add_note(session_id, node_id, text)` | Progress note or memory |

The server's `instructions` teach the workflow and the leaf test, so any MCP client behaves the same way.

## REST API for the web app (cookie auth, under `/api/work`)

| Area | Endpoints |
| --- | --- |
| Sessions | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/{id}`, `GET /sessions/{id}/events?since=` |
| Nodes | `POST /sessions/{id}/nodes`, `PATCH /nodes/{id}`, `POST /nodes/{id}/status`, `DELETE /nodes/{id}` |
| Learn link | `POST /nodes/{id}/learn` queues the leaf's root cause as a Curveball topic |
| Tokens | `GET/POST /tokens`, `DELETE /tokens/{id}` |

Web edits and MCP calls go through **one service module** (`app/work.py`), so the rules can't drift apart.

## Frontend

- **A separate world.** Route group `(work)`: `/bullpen`, `/bullpen/[id]`, `/bullpen/connect`.
  - Its own shell and a dark "night shift" theme: ink background, lime and track accents, the same type and components.
  - `proxy.ts` protects it like the rest of the app.
- **The world transition** (`WorldGate`, mounted in the root layout so it survives the layout swap):
  1. The clicked button's rectangle is measured.
  2. A fixed "portal" layer starts at exactly that rectangle and shape.
  3. It springs out to the full viewport, with position, size, radius and colour morphing together, while a circular clip reveals outward from the origin.
  4. The route changes underneath.
  5. The new world settles with a slight depth pull, and its content staggers in.
  6. "Back to Learn" plays the same move from its own button.
  - Reduced motion becomes a short crossfade. It's used only when crossing worlds; navigation inside a world stays instant. The whole move takes about 700 ms.
- **Bullpen home**:
  - Sessions as "innings" with progress (leaves done / total).
  - "New session".
  - An empty state that walks you through connecting an agent.
- **Session view**:
  - A collapsible tree with indent guides and status marks.
  - A progress count on each branch.
  - Status filters.
  - "Ready now" (open leaves).
  - An activity feed, updated live by polling.
  - A node detail sheet: edit fields, change status, notes, and "Learn this" on resolved leaves.
- **Connect page**: create, copy and revoke tokens, with copy-paste setup for Claude Code, Cursor and generic MCP clients.

## Phases (each ends green: typecheck, lint, tests, then a commit)

1. **Backend core**: tables, migration, `app/work.py` rules, REST API, tokens, tests.
2. **MCP server**: `/api/mcp`, token auth, tools, instructions, tests over real HTTP.
3. **World transition + Work shell**: `WorldGate`, the Bullpen entry in the Learn shell, "Back to Learn" in the Work shell.
4. **Bullpen UI**: sessions, tree, detail sheet, live feed, connect page.
5. **Learn link**:
   - "Learn this" queues a root cause as a topic.
   - Shipped leaves add XP (+5 each) to the level curve.
6. **Verification**:
   - e2e (create a session, drive it through the REST and MCP equivalents, see it roll up), desktop and mobile.
   - Screenshots in light and dark.
   - A real MCP connection from Claude Code.

## Later (from the Canopy backlog, deliberately not in v1)

- Preview/approve the first decomposition level.
- Dependency graph view.
- Blast-radius heatmap.
- Time-travel replay.
- Supervisor agent.
- Worktree per leaf.
- CI gate on "done".
- GitHub, Slack and Jira integrations.
- Multiplayer presence.
- OAuth for MCP.
- SSE live feed.
