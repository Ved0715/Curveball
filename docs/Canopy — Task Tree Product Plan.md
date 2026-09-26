# Canopy — Product Plan

Sep 26, 2026 · @Vedant Narwade

Canopy is an MCP-native task-decomposition and visibility layer for coding agents: hand it one big, messy prompt, and it recursively breaks the work into a tree down to atomic, independently-solvable issues — then gives every agent and human working on it a live, game-like view of the whole effort, so nothing gets lost once the task gets big. (Working name — swap it for whatever fits.)

## How it works

1. **Prompt** — you give one big, underspecified task to any MCP-connected agent (Claude Code, Antigravity, Cursor, whatever you're driving).
2. **Decompose** — the agent reads the codebase and calls `create_tree`, then recursively calls `decompose_node` on itself until a node passes the leaf test below. No fixed depth — a section can be one level deep or six.
3. **Visualize** — the tree opens automatically in a board/tree view, reading live off the same store the agent just wrote to.
4. **Execute** — any agent, or you, calls `list_open_leaves`, `claim_node`, and `get_context_bundle` to pull *only* that leaf's problem statement, root cause, code area and relevant files into a fresh context — never the whole tree.
5. **Report back** — the agent fills in `solution_description`, links a PR or commit, and sets status.
6. **Roll up** — a category auto-resolves once every child under it is done or not-an-issue, and that propagates up the whole tree without anyone touching a parent node by hand.
7. **Re-decompose on demand** — if a leaf turns out bigger than expected mid-work, the agent calls `decompose_node` on it again and it becomes a branch. The tree grows and shrinks as understanding improves, instead of being fixed upfront.

**Leaf test** (default, overridable): a node counts as a leaf once it can be stated in one paragraph, touches a bounded and known set of files, doesn't require a sibling to finish first except through an explicit dependency edge, and could be handed to an agent with a *fresh* context window and shipped in one sitting.

## Node data model

| Field | Purpose |
| --- | --- |
| `id` | Stable identifier used by every tool call |
| `title` | One-line summary |
| `problem_statement` | What's wrong, from the user's point of view |
| `root_cause` | Why it happens, technically |
| `code_description` | Files, functions, modules involved |
| `solution_description` | Proposed approach, then the final write-up once solved |
| `status` | open / in\_progress / partial / decision\_needed / done / not\_an\_issue / blocked |
| `is_leaf` | Whether it's independently solvable or still a branch |
| `depends_on` | Other leaf ids that must resolve first |
| `owner` | Agent, session, or human currently claiming it |
| `tags` | Free-form labels, e.g. "concurrency", "frontend" |
| `confidence` / `risk` | Agent's self-rated certainty and blast risk |
| `acceptance_criteria` | Tests or conditions that define "done" |
| `artifacts` | PR link, commit SHA, test report |
| `history` | Full audit trail of status and field changes |
| `cost` | Tokens and wall-clock time spent on this node |

This is the same shape as the fields you already asked for — problem statement, root cause, code description, solution description — plus what's needed to make the tree self-scheduling and auditable.

## MCP tool surface

This is the whole point of "connect it to Claude, Antigravity, or any agent via MCP" — one server, one tool set, any client that speaks MCP.

| Tool | What it does |
| --- | --- |
| `create_tree(prompt, repo_path)` | Starts a new session/workspace and the root node |
| `decompose_node(id, children)` | Proposes and inserts child nodes under a node |
| `add_node(parent_id, fields)` | Manually adds an issue — the human or an agent |
| `update_node(id, fields)` | Edits any field, including `solution_description` |
| `set_status(id, status)` | Changes status; triggers a rollup recompute up the tree |
| `claim_node(id, agent_id)` / `release_node(id)` | Locks a leaf to one agent at a time |
| `list_open_leaves(filters)` | Returns leaves that are ready to work, dependencies already satisfied |
| `get_context_bundle(id)` | Minimal scoped context for a fresh agent session on that leaf alone |
| `add_dependency(id, depends_on_id)` | Declares execution order between two leaves |
| `mark_leaf(id, bool)` | Flips a node between branch and leaf |
| `attach_artifact(id, {pr, commit, tests})` | Links the shipped evidence to the node that produced it |
| `generate_rollup_summary(id)` | LLM-written summary of a solved subtree |
| `search_tree(query)` | Full-text or semantic search across the whole tree |
| `get_events(since)` | Activity feed the visualization layer subscribes to for live updates |

## Architecture

- **Canopy Core** — the source of truth: a local, git-friendly store (file-based JSON/Markdown per node, or SQLite) that every tool call reads and writes. Because it's just files, the tree itself is version-controlled and diffable alongside the code it describes.
- **MCP Server** — the single attach point. Any MCP-capable agent (Claude Code, Antigravity, Cursor, Windsurf, Cline, or a custom one) adds one config entry and gets the full tool surface above — no per-agent integration work.
- **Viz Server** — a small local web app, the board/tree prototype generalized, that reads the same store and live-updates via file-watch or a websocket. Nothing separate to run to use Canopy solo.
- **CLI** — `canopy init` scaffolds `.canopy/` in a repo, `canopy open` launches the viz, `canopy status` prints a summary for scripting or CI.
- **Optional cloud sync** — for teams: pushes the tree to a hosted service for multiplayer presence, notifications, and dashboards spanning multiple repos. Entirely optional; the local-first path never needs it.

## Visualization ideas

- **Tree / board** (already prototyped) — the hierarchy plus a drag-and-drop Kanban across statuses.
- **Dependency graph** — a force-directed view of `depends_on` edges across leaves, separate from the categorical tree, showing the *true* execution order.
- **Blast-radius heatmap** — overlays which files each open leaf touches, and flags when two claimed leaves overlap before the agents actually collide.
- **Live agent presence** — Figma-style avatars showing which agent or person is on which node right now.
- **Focus / zen mode** — zoom into one subtree and grey out everything else; the direct answer to losing the plot once a task gets big.
- **Time-travel replay** — scrub back through how the tree grew and resolved over the life of the project.
- **Rollup briefing** — one click composes a stakeholder-readable summary from every `solution_description` in a subtree.
- **Galaxy view** (playful) — categories as planets, leaves as moons that light up on resolve; same data as the tree, different frame.

## Multi-agent orchestration and safety

- **Claim / release locks** — only one agent owns a leaf at a time; a stale claim, one whose agent has gone quiet past a timeout, auto-releases.
- **Dependency-aware scheduling** — `list_open_leaves` only surfaces leaves whose `depends_on` are already resolved, so parallel agents never start on blocked work.
- **Git worktree per leaf** (optional) — each claimed leaf can get its own worktree or branch, so two agents never touch the same working copy at once.
- **Supervisor agent** — a periodic pass over the tree that flags duplicate leaves, leaves that grew too large and are candidates to re-decompose, leaves that turned out not independent and need a dependency edge or a merge, and stale claims.
- **Human approval gates** — any node tagged high-risk or `decision_needed` blocks agent execution until a person signs off.

## Feature backlog

| Category | Feature | Why it matters |
| --- | --- | --- |
| Visualization | Blast-radius heatmap | Flags file-level collisions between agents before they happen |
| Visualization | Dependency graph view | Shows true execution order, not just category hierarchy |
| Visualization | Time-travel replay | Scrub through how the tree evolved — useful for retros |
| Visualization | Voice briefing | "Read me the state of the tree" spoken summary for stand-ups |
| Collaboration | Multiplayer presence | Live cursors and avatars, like Figma, across humans and agents |
| Collaboration | Comment threads per node | Discuss one issue without cluttering the tree itself |
| Collaboration | Slack/Discord digest | Daily "here's what moved" summary posted automatically |
| Collaboration | @mention on decision | Pings a specific person the moment a node needs a human call |
| Intelligence | Auto dependency inference | The agent proposes `depends_on` edges by reading what each leaf's diff implies |
| Intelligence | Duplicate/overlap detector | Flags two leaves quietly describing the same fix |
| Intelligence | Self-scoring "abstractness" check | A node re-asks itself "can this ship alone?" before accepting leaf status |
| Intelligence | Root-cause clustering | Groups leaves by root cause to surface architecture debt — "6 issues, 1 cause" |
| Intelligence | Risk/confidence scoring | Each leaf gets an agent-estimated risk score, surfaced as a heatmap |
| Intelligence | Auto re-decomposition | Oversized leaves split automatically instead of waiting on a human to notice |
| Intelligence | Changelog generator | Rolls every `solution_description` into release notes on ship |
| Ops/Safety | Sandboxed execution | Each leaf can run in an isolated environment before merge |
| Ops/Safety | Auto-revert on test failure | A regression post-merge reopens the leaf with the failure attached |
| Ops/Safety | Cost tracker | Tokens and wall-clock per node, rolled up per category and per session |
| Integrations | Any MCP agent | Claude Code, Antigravity, Cursor, Windsurf, Cline, or a custom agent — one config entry each |
| Integrations | GitHub/GitLab | PRs and commits attach directly to the node that produced them |
| Integrations | CI linkage | Test runs attach to the node; status reflects pass/fail automatically |
| Integrations | Linear/Jira two-way sync | Canopy leaves mirror into existing ticket trackers for stakeholders who live there |
| Gamification | XP and levels | Already prototyped — carries over directly |
| Gamification | Category trophies | Auto-awarded on rollup, already prototyped |
| Gamification | Streaks | Consecutive days with a shipped leaf |
| Gamification | "Boss fight" framing | The root node is styled as the big fight; leaves are the mobs along the way |
| Gamification | Team leaderboard | Across repos, for teams that want the game layer to be social |
| Clients & access | IDE panels (VS Code, JetBrains) | Thin viewers that embed the tree in the editor, without making the editor the core |
| Clients & access | Browser extension | Overlays a GitHub PR or issue with the Canopy node it maps to |
| Clients & access | Mobile app / mobile web | Check status and approve decision-needed nodes from your phone, with push notifications |
| Clients & access | API & webhooks | Custom automation and third-party dashboards hook in without touching the MCP surface |
| Data & import | Import existing backlog | Point at GitHub Issues or a Jira board and auto-build the initial tree from it |
| Data & import | Cross-repo / monorepo trees | One tree spans several repositories for work that cuts across services |
| Data & import | Reusable issue templates | Save a node's shape and acceptance-criteria pattern, reuse it across projects |
| Data & import | Snapshot & rollback | Checkpoint the whole tree state and roll back if a bad decomposition batch happens |
| Analytics | Cycle-time dashboard | Average time from open to done per leaf and per category, flags bottlenecks |
| Analytics | "Next best task" recommender | Suggests which open leaf an agent or person should claim next, based on history |
| Analytics | Portfolio view | See every active Canopy session across all your projects in one place |
| Trust & privacy | Local-only / no-API-key mode | Runs against a local model for sensitive codebases; nothing leaves the machine |
| Trust & privacy | Compliance/audit export | Who touched what and when, for regulated environments |
| Trust & privacy | Node comments as agent memory | Comments left on a node are read back in when an agent resumes it, so context survives a session restart |

## Roadmap

| Phase | Focus | Key deliverables |
| --- | --- | --- |
| v0 (built) | Prototype | Local visual tracker: hierarchical tree, board, drag-and-drop, gamified XP and trophies — shipped as the artifact earlier in this conversation |
| v1 | MCP core | MCP server, local file store, `decompose`/`claim`/`update` tools, Claude Code integration, viz reading live off the same store |
| v2 | Multi-agent | Claim/lock, dependency-aware scheduling, git worktree per leaf, live agent presence |
| v3 | Intelligence | Auto dependency inference, risk scoring, duplicate detection, supervisor agent, auto re-decomposition |
| v4 | Team and cloud | Hosted sync, multiplayer, Slack/Jira integrations, dashboards across repos |

## Open questions

- Where the leaf-test LLM call actually runs, and how to cap what it costs per decomposition on a large repo.
- Storage trade-off: git-tracked JSON/Markdown is diffable and human-readable but conflict-prone under concurrent writes; SQLite is faster and safer to write concurrently but less diffable. A hybrid — SQLite as the live store, periodic JSON export for git — is the likely answer.
- How to keep the MCP tool schema vendor-neutral, so it behaves the same for Claude Code, Antigravity, and anything else, instead of assuming one agent's conventions.
- What a per-agent permission model looks like once a shared tree has both humans and several agents writing to it at once.

## Problems this should solve

| Problem people hit | Feature that answers it |
| --- | --- |
| The tree balloons and nobody prunes it | Auto-archive resolved subtrees into a collapsed "done" view so the live tree stays small |
| The agent decomposes wrong — too fine or too coarse — and you're stuck with it | Manual override: merge two leaves back together, or flatten a branch, without re-running decomposition |
| Nobody remembers why a call was made a few weeks later | A required one-line rationale whenever a `decision_needed` node resolves or a status flips, kept in history |
| Two agents unknowingly touch the same file with no declared dependency between them | A soft warning at claim time: another open or claimed leaf already touches this file |
| You step away for two days and don't know what happened | A "what changed since you last looked" digest on open, not raw history |
| Decomposition runs away and produces hundreds of nodes for a small task | A depth/node budget with a warning and a stop, instead of trusting the LLM's judgment unchecked |
| The root-level decomposition is wrong and you only find out after the whole tree is built | A preview step: show the first level or two, approve before the rest persists |
| You don't actually trust an agent's "done" | A real gate — status can't flip to done until a linked test/build/lint actually passes |
| "Fixed it" is a useless solution description six weeks later | Minimum content required in `solution_description` / `root_cause` before a node can close |
| A new person joining a big in-flight tree has no way in | A "catch me up" summary for a first-time reader, separate from the ongoing change digest |
| You need to update a non-technical stakeholder | A plain-language rollup export, stripped of code and jargon |
| An agent gets interrupted mid-leaf and the next attempt starts from zero | Partial-progress notes saved on release, not discarded with the claim |

## Sessions

A **session** is one working unit: a root task plus everything it decomposes into. It's the thing a user actually creates and switches between — not the repo, and not the MCP server itself.

**Session vs. project vs. agent**

- A **project** (repo) can hold several sessions at once — "fix the auth bugs" and "performance audit" can run as two independent trees in the same repo, never touching each other's nodes.
- A **session** owns exactly one tree, one store directory (`.canopy/sessions/<id>/`), and optionally one git branch it works against.
- An **agent connection** doesn't own a session. It attaches to one, and every tool call it makes afterward is scoped to that session's tree — never to "whatever's open elsewhere."

**How an agent finds its session**

1. `list_sessions(repo_path)` — what's already running here, open or archived.
2. `create_session(repo_path, prompt)` — starts a brand-new tree, returns a `session_id`. This is the "new project" moment.
3. `use_session(session_id)` — attaches this agent connection to an existing session; every following call in that connection defaults to it, the way `cd`-ing into a directory sets your working context.
4. Every tool call still *accepts* an explicit `session_id` even after `use_session`, because several agents can be attached to the same session at once (the normal multi-agent case), and one server may be juggling several sessions across several connections at the same time. The implicit "current session" is a convenience default, never the source of truth.

**What's shared vs. scoped inside a session**

- The tree is shared — every agent attached to a session sees the same nodes, statuses, and rollups, live.
- Context is not shared — `get_context_bundle(session_id, node_id)` hands a freshly attached agent only that one leaf's problem statement, root cause, code area, and files. It never loads the whole session's tree, no matter how large the session has grown. That's what keeps a 200-node session just as usable for a fresh agent as a 5-node one.
- Claims are node-level, not session-level. Ten agents can be attached to one session at once, each holding a different leaf; the session itself is never locked.

**Lifecycle**

| Stage | What happens |
| --- | --- |
| Created | `create_session` opens the root node and the store; the viz picks it up as soon as it exists |
| Active | Agents attach, claim leaves, decompose, resolve; the tree grows and shrinks as work proceeds |
| Idle | No open claims, but open leaves remain — shown as "waiting," not archived |
| Resolved | Every node is done or not-an-issue; the root itself rolls up, same trophy mechanic as a category, one level higher |
| Archived | Collapsed into the done view; still searchable, out of the active list |

**Multiple sessions, one view** — the portfolio view above is exactly this: every session across every project in one list, so switching "projects" in the UI is just switching which session's tree you're looking at. A later version could let one session's leaf depend on another session's leaf, for work that spans two trees — not in v1, but `depends_on` is already shaped to take an id from anywhere, not only a sibling.
