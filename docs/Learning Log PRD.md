# Learning Log — Product Requirements Document

Sep 25, 2026 · @Vedant Narwade

## 1. Overview

Learning Log is a personal continuous-learning system built for Vedant, an SDE 1 who wants to grow faster than a typical junior engineer by treating daily learning as a structured habit instead of something that only happens when there's spare time.

It exists today as a Claude Artifact — a single HTML page backed by a small shared database that Claude maintains directly, with a scheduled task picking a new topic every morning. This document specifies the same product as a standalone application, so it can be rebuilt independently (e.g. with Claude Code) and extended well past what the Artifact runtime supports — real content sources, notifications, spaced repetition, and more.

**The problem.** Junior engineers rarely plateau from lack of intelligence — they plateau from lack of a system. Nobody hands them a daily curriculum, tracks whether they actually showed up, or deliberately pushes them past pure theory into the situational judgment calls senior engineers make under pressure (an ambiguous ticket, a production incident, a risky code review). Learning Log is that system: an always-on assistant that decides what to study each morning, makes skipping visibly cost a streak, and deliberately mixes four kinds of growth instead of just one.

## 2. Goals & success metrics

**Primary goal.** Vedant opens the app most mornings, learns one concrete thing, and can look back months later and see that he actually did it, consistently, across a real breadth of topics.

**Supporting goals**

- Habit formation — build and protect a daily streak; a missed day should feel like a real, visible loss.
- Breadth over depth-in-one-lane — touch all learning tracks (DSA, system design, language/runtime depth, fundamentals, real-world judgment) over any rolling 30-day window, not just the easiest one.
- Judgment, not just trivia — a meaningful share of topics should be situational ("what do you do when X happens") rather than pure recall.
- Zero maintenance — the daily topic is fully automated; Vedant never has to curate or refill the queue himself.
- Extensible content — new topics can be added (by Vedant or by Claude) without redeploying the app.

**Success metrics**

| Metric | What it tells us |
| --- | --- |
| Current streak / longest streak | Is the habit sticking? |
| 7-day and 30-day completion rate | % of days with a topic marked learned |
| Category coverage (rolling 30 days) | Is the mix actually balanced, or gaming one easy track? |
| Topics completed per week | Raw throughput |
| Time from "topic assigned" to "opened" | Morning friction — is it actually a morning habit? |
| Curriculum exhaustion rate | How soon the seed content needs topping up |
| Self-reported usefulness (periodic prompt) | Qualitative check that it isn't just streak theater |

## 3. User

**Primary user — Vedant.** Sole user of the product (v1 is explicitly single-user, not multi-tenant). An SDE 1, checks the dashboard most mornings from phone or desktop, wants very low friction (open, read, mark done, move on with the day), and is motivated by visible progress — streaks, a growing history, a widening spread across categories. Occasionally has a genuinely busy or off day and needs the system to tolerate that gracefully rather than punish it harshly (see streak-freeze in Future Features).

**Secondary "user" — the automation itself.** The daily topic-assignment engine (a scheduled job, today a Claude scheduled task) acts as a curriculum author. It needs a well-defined data contract — what a topic looks like, what "already used" means, how preferences are expressed — so it can pick well without a human in the loop. Treat its needs as first-class requirements, not an implementation detail, because the whole product depends on it running correctly, unattended, every single day.

## 4. Scope: MVP vs. later phases

**MVP — rebuild of what already works today.** Today's-topic card with mark-as-learned and swap, streak calculation, a 12-week contribution calendar, running stats, a history log, a 5-track curriculum (\~50+ seeded topics), focus-area toggles, a custom topic queue, and a fully automated daily assignment job. Single user, database-backed, no auth beyond "it's Vedant's app."

**Phase 2 — depth and retention.** Push/email notifications when a new topic drops; real content sourcing (pull actual articles from RSS/an API instead of only search-style pointers); spaced repetition / periodic review of past topics; a short reflection note per completed topic; difficulty and time-estimate tags; a streak-freeze / vacation mode; a weekly digest email; offline-friendly PWA.

**Phase 3 — ambition.** An AI co-pilot chat scoped to the day's topic; LLM-generated topics sourced from real-time developer news/trends; a personalized curriculum that adapts to what Vedant struggles with or skips; light gamification (levels, badges, milestones); optional multi-user support with a leaderboard, if this ever stops being just Vedant's tool; integrations (GitHub activity feed, a calendar block for "learning hour," delivery via Slack/Discord); an analytics dashboard; and an admin UI for editing the curriculum without touching the database directly.

Everything in this document is written at MVP-plus-notes level; Phase 2/3 items are intentionally listed in full in §15 (Future / Stretch Features) so nothing gets lost, but they are **not** required for v1.

## 5. Core feature requirements — the daily loop

### 5.1 Today's Topic card

- Shows the topic assigned for the current calendar day (in the user's local timezone): category tag, title, a short blurb (1–2 sentences), and 2–3 "Explore" pointers (search suggestions, reading pointers, or concrete exercises — never a fabricated URL).
- Two primary actions while the topic is open: **Mark as learned** and **Swap topic** (pick a different one from the same eligible pool, discarding the current assignment for today).
- Once marked learned, the card switches to a completed state (checkmark, completion timestamp, "Swap" no longer available) and stays that way for the rest of the day.
- If no topic exists yet for today when the page loads (e.g. the daily job hasn't run, or this is the very first day), the client assigns one itself on the spot using the same selection rule as the server job (§8), so the page is never empty. Acceptance: opening the app on a brand-new day, before the scheduled job has run, still shows a real topic within one page load, with no visible "empty" or error state.

### 5.2 Streaks

- **Current streak** = consecutive calendar days, ending today or yesterday, with a topic marked learned. If today isn't done yet but yesterday was, the streak still shows as active (matches habit-tracker conventions like Duolingo) rather than resetting at midnight before the user has had a chance to act.
- **Longest streak** = the best run ever achieved, computed from full history, never decreasing.
- Streak math must be timezone-consistent: computed against the user's local date, not UTC, both client-side and in the daily job.
- Acceptance: skip a day entirely (no completion) → current streak resets to 0 the next time the app is opened; complete two consecutive days → current streak reads 2.

### 5.3 Calendar view

- A 12-week (84-day) grid ending today, one cell per day, visually distinguishing: learned, today (not yet learned), today (learned), and no entry. Hovering/tapping a cell shows the date and, if applicable, the topic title.

## 6. Personalization

### 6.1 Focus areas

- Five toggleable tracks: **DSA & coding interviews**, **System design**, **Language & runtime depth**, **CS fundamentals**, **Real-world & situational**. At least one must always stay enabled (the UI blocks disabling the last one).
- The daily assignment engine only draws from enabled tracks. Disabling a track does not delete or hide its history — past completions in that category still count toward stats and streaks.
- Acceptance: disabling "DSA" and re-generating today's topic never returns a DSA topic; toggling everything off except one track leaves that one on and refuses the last toggle.

### 6.2 Custom topic queue

- Vedant can type in his own topic ("Learn Redis pub/sub") to add to a personal queue. Optionally attach a short note/blurb.
- Custom queue items take priority over the curriculum: if the queue is non-empty when a day's topic is being assigned, the oldest queued item is used instead of picking from the curriculum, then removed from the queue.
- Queue items are visible and individually removable before they're consumed.
- Acceptance: adding a custom topic, then triggering the next day's assignment, results in that exact topic appearing (not a curriculum pick), and the queue is one item shorter afterward.

## 7. History, stats & category breakdown

- **History list**: every completed topic, reverse-chronological, showing date, category, and title. Should scale to years of data without becoming slow to load (paginate or lazy-load past some threshold, e.g. 60–100 most recent shown by default).
- **Stat tiles**: current streak, total topics learned (all-time), longest streak ever.
- **Category breakdown**: a proportional bar (and/or list) showing the share of completed topics per track, all-time or over a selectable window (e.g. last 30 days) — this is what makes an imbalance ("I've done 40 DSA topics and 2 real-world ones") visible at a glance, which directly supports the "breadth" goal in §2.
- All of the above must be derivable purely from the `days`/assignment records (§10) — no separately-maintained counters that can drift out of sync with the underlying data.

## 8. Automation: the daily topic-assignment engine

This is the heart of the product — everything else is a UI on top of what this engine decides. It must run unattended, once per day, with no human review.

**Trigger.** A scheduled job (cron, \~06:30–06:45 local time, a few minutes off the hour to avoid herd-scheduling collisions) runs once daily. It must be idempotent: if it runs twice, or the app itself lazily assigns a topic before the job fires, the second attempt is a no-op.

**Selection algorithm, in order:**

1. If today already has an assigned topic, stop — do nothing.
2. If the custom queue (§6.2) is non-empty, take its oldest item as today's topic (category `custom`) and pop it off the queue.
3. Otherwise, build the eligible pool: curriculum topics whose category is in the user's enabled focus areas (§6.1).
4. Prefer topics whose id has not appeared in assignment history within a lookback window (e.g. the last 60 days). If the eligible-and-unused set is empty, fall back to the least-recently-used topic in the eligible pool (allow repeats rather than ever failing to assign something).
5. Where possible, avoid assigning the same category two days in a row, and periodically ensure the `real-world` track appears even if it isn't the top of a naive rotation — the point of that track (§1) is defeated if it's easy for the rotation to skip it for weeks.
6. Write the assignment: date, topic id, title, category, blurb, explore pointers, `completed: false`, `assignedAt` timestamp, `source` (`auto` | `custom`).

**Failure handling.** If the job fails (network error, empty curriculum, etc.), it should not crash silently forever — log the failure and either retry once or leave the app's own client-side lazy-assign (§5.1) as the safety net so the user is never blocked. A monitoring/alerting hook (even just a log line Vedant can grep) is worth having so an unattended failure is discoverable.

**Where the intelligence can live.** In the current Artifact-based build, an LLM (Claude, via a scheduled task) *is* the assignment engine — it reads state and reasons about which topic to pick. In a standalone rebuild, this can be a deterministic function (simplest, cheapest, fully testable) or still call an LLM for the more editorial choices (e.g. picking which real-world scenario best fits current events) — see §15 for the more ambitious "LLM-generated topics" direction. The MVP should ship with the deterministic version; treat the LLM version as an upgrade path, not a hard requirement.

## 9. Content model & curriculum

**Five tracks**, each with a stable id, display label, and accent color for UI tagging:

| id | Label | What it covers |
| --- | --- | --- |
| `dsa` | Data Structures & Algorithms | Classic interview-style patterns (two pointers, sliding window, DP, graphs, heaps, etc.) |
| `system-design` | System Design | Caching, load balancing, indexing, API design, scaling, CAP, observability |
| `lang-depth` | Language & Runtime Depth | Event loop, closures, memory model, concurrency, type systems, error handling |
| `fundamentals` | CS Fundamentals | Git internals, HTTP, TCP/UDP, processes vs threads, ACID, DNS, testing, code reading |
| `real-world` | Real-World & Situational | Postmortem reading, trend-watching, and situational judgment scenarios (production incidents, ambiguous tickets, risky reviews, blown estimates) |

**Topic shape** (one curriculum entry):

```
{
  id: string,          // stable, unique, e.g. "dsa-01"
  category: TrackId,
  title: string,
  blurb: string,        // 1-2 sentences, why this matters
  explore: string[]     // 0-3 pointers: search terms, exercises, or named (not fabricated-URL) resources
}
```

**Seed content.** The MVP ships with the \~52-topic curriculum already built for the Artifact version (12 DSA, 12 system design, 10 language depth, 10 fundamentals, 12 real-world) as the initial seed — see §17 Appendix for the full list to import verbatim. Curriculum entries should be easy to add to going forward (a seed script, an admin form, or direct DB inserts are all acceptable for v1; a full CMS is a Phase 3 nice-to-have, §15).

**Content honesty rule.** "Explore" pointers must never fabricate a specific article URL or claim a specific real webpage exists. They should be search-style prompts ("search: \[company\] engineering blog architecture") or named real, general resources (a well-known blog or publication by name), never an invented link presented as real.

## 10. Data model

Four entities cover the whole product. Shown here as a relational-ish schema; maps equally well onto a document store.

**`topics`** (the curriculum — mostly static, occasionally appended to)

```
id            text PRIMARY KEY
category      text   -- one of the 5 track ids
title         text
blurb         text
explore       jsonb  -- string[]
created_at    timestamptz
```

**`assignments`** (one row per calendar day — this is the product's core fact table)

```
date          date PRIMARY KEY        -- user-local calendar date
topic_id      text REFERENCES topics(id) NULL  -- null if source = 'custom'
category      text                    -- denormalized at assignment time
title         text                    -- denormalized (custom topics have no topics row)
blurb         text
explore       jsonb
completed     boolean DEFAULT false
assigned_at   timestamptz
completed_at  timestamptz NULL
source        text  -- 'auto' | 'custom'
```

*Denormalizing title/blurb/category onto the assignment is deliberate: it freezes what the user actually saw that day even if the curriculum entry is edited or removed later, and it's what every streak/stat/history calculation reads from — see §7.*

**`preferences`** (single row in v1; keyed by user id if multi-user ever happens)

```
user_id        text PRIMARY KEY
focus_areas    jsonb   -- string[], subset of the 5 track ids, never empty
updated_at     timestamptz
```

**`custom_queue`** (ordered; FIFO)

```
id           uuid PRIMARY KEY
user_id      text
title        text
blurb        text NULL
position     integer   -- or just use created_at for FIFO ordering
created_at   timestamptz
```

All streaks, stats, and the calendar (§5.2, §5.3, §7) are pure derived reads over `assignments` — no separately stored counters, so there is nothing that can drift out of sync.

## 11. System architecture

```
┌────────────────────┐      ┌────────────────────────┐      ┌───────────────────┐
│   Web client      │◄──►│   API server        │◄──►│    Database       │
│  (dashboard UI)   │      │  (REST or RPC)      │      │  (topics,         │
└────────────────────┘      └──────┬────────────┘      │  assignments,     │
                                     │                    │  preferences,     │
                                     │                    │  custom_queue)    │
                        ┌─────────┴─────────┐      └───────────────────┘
                        │  Daily assignment   │
                        │  job (cron, ~06:30) │
                        └───────────────────┘
```

- **Web client**: a single-page dashboard (today's topic, calendar, stats, history, settings). Should work well on mobile since morning checks are likely on a phone. No auth complexity needed for v1 (single user); a Phase 2 concern if this ever becomes multi-user.
- **API server**: thin CRUD + the selection algorithm (§8) as a callable function, used both by the cron job and, as a fallback, by the client on first load of a day with no assignment yet.
- **Database**: any relational or document store works (Postgres recommended for the query patterns in §10); SQLite is fine too given the scale (single user, low write volume).
- **Scheduler**: a real cron (system cron, a hosted scheduler like GitHub Actions/Vercel Cron/a serverless cron trigger) calling the same selection function the API exposes — do not duplicate the algorithm between the job and the API.
- **Notifications** (Phase 2): a push/email provider triggered by the same job right after it assigns the day's topic.

## 12. API design

A minimal REST surface (RPC/tRPC/GraphQL equivalents are fine — this is the contract, not the protocol):

| Method & path | Purpose |
| --- | --- |
| `GET /api/today` | Returns today's assignment; if none exists yet, runs the selection algorithm (§8) and creates it, then returns it. This is what the client calls on load — it's the lazy-assign fallback from §5.1. |
| `POST /api/today/complete` | Marks today's assignment `completed: true`, sets `completed_at`. 409 if already completed. |
| `POST /api/today/swap` | Re-runs selection excluding the current topic, overwrites today's assignment. 409 if already completed (can't swap a finished day). |
| `GET /api/history?limit=&before=` | Paginated completed assignments, newest first. |
| `GET /api/calendar?days=84` | Assignment presence/completion per day for the requested trailing window — powers §5.3. |
| `GET /api/stats` | Current streak, longest streak, total completed, category breakdown (optionally windowed). |
| `GET /api/preferences` / `PUT /api/preferences` | Read/update focus areas. `PUT` rejects an empty `focus_areas` array. |
| `GET /api/queue` / `POST /api/queue` / `DELETE /api/queue/:id` | List, add, and remove custom-queue items. |
| `POST /internal/assign-daily` | The endpoint the cron job calls. Same selection algorithm as `GET /api/today`'s fallback path — both must call one shared function, never two copies of the logic. Should be idempotent and, ideally, not publicly exposed (internal/service-auth only). |

All endpoints operate on "today" as the caller's local calendar date; the server should either accept a client-supplied timezone/date or assume a fixed configured timezone (Asia/Calcutta) given this is single-user — the fixed-timezone approach is simpler and sufficient for v1.

## 13. Recommended tech stack

Optimized for "one person builds and maintains this with Claude Code's help," not for scale:

- **Frontend**: React + TypeScript (Next.js or Vite) — reuse the visual design already validated in the Artifact version (component structure, color tokens, calendar/stat-tile layout) rather than redesigning from scratch. Tailwind or plain CSS both work.
- **Backend**: Next.js API routes, or a small Node/Express (or Python/FastAPI) service — whichever the rest of Vedant's stack already favors, since consistency with his other projects matters more than any specific framework here.
- **Database**: Postgres (via Supabase, Neon, or self-hosted) for a real deployment; SQLite is a perfectly good starting point for local-only use.
- **Scheduler**: platform-native cron if deploying to Vercel/Railway/Render/Fly.io; otherwise a simple system cron or GitHub Actions scheduled workflow calling `POST /internal/assign-daily`.
- **Auth**: none required for v1 (single user, private deployment); if ever deployed somewhere publicly reachable, put it behind basic auth or a single hardcoded access token at minimum.
- **Notifications (Phase 2)**: a transactional email provider (Resend, Postmark) and/or Web Push.

## 14. Non-functional requirements

- **Reliability of the daily job matters more than anything else in this product** — if it silently stops firing, the whole habit collapses within days. Log every run (success, no-op, failure) somewhere durable and checkable.
- **Timezone correctness.** Every date comparison (streaks, "today," the calendar) must consistently use one timezone (Asia/Calcutta) end to end — mixing UTC and local dates is the single most likely subtle bug in this whole system.
- **Performance.** Trivial at this scale (one user, low tens of writes per day) — no particular optimization needed beyond not doing anything pathological (e.g. don't recompute the whole history on every keystroke).
- **Data durability.** This is a personal record of months/years of learning — back up the database; treat data loss as a severe bug, not a minor one.
- **Mobile-first responsiveness.** Morning checks are likely to happen on a phone; the layout must work well down to \~375px width.
- **Content integrity.** Never present a fabricated resource link as real (§9); "Explore" content is guidance, not guaranteed citations.
- **Privacy.** Single-user, no need for multi-tenant data isolation in v1, but don't expose the API publicly without at least a shared-secret/token check if it's ever deployed somewhere reachable from the open internet.

## 15. Future / stretch features — the full idea backlog

Everything below is explicitly out of scope for v1 but worth keeping on record so nothing gets lost. Roughly ordered by expected value-to-effort.

**Retention & habit mechanics**

- Streak freeze / vacation days — a small number of "grace" days per month that protect the streak without requiring a completion.
- Push notification the moment a new topic is assigned each morning; a gentle reminder nudge if it's late afternoon and today isn't done.
- Weekly digest email/summary: topics covered, streak status, category balance, one highlight.
- Light gamification: XP/levels, milestone badges ("10-day streak," "finished the whole DSA track"), a visible "mastery" meter per track.

**Learning quality**

- Spaced repetition: periodically resurface a past topic for a quick review instead of only ever introducing new ones.
- A short reflection/notes field per completed topic ("what did you actually learn / find hard") — turns the log into a real journal, not just checkboxes.
- Difficulty and time-estimate tags per topic, so the day's pick can match available time/energy.
- Follow-up questions: after marking a topic done, a couple of quick self-check questions (LLM-generated) to reinforce it.

**Content sourcing**

- Pull real, current articles via RSS/APIs (e.g. real engineering-blog feeds, Hacker News API, Dev.to API) instead of only search-style pointers — turns §9's "real-world" track from static prompts into live, dated content.
- LLM-generated topics that react to actual current events in tech (a real outage in the news, a new framework release) rather than a fixed static pool.
- A personalized curriculum that adapts based on what Vedant skips, swaps often, or completes fastest — basic recommendation logic over time.

**Interaction & delivery**

- An AI co-pilot chat scoped to the day's topic — ask follow-up questions, get quizzed, get a worked example, without leaving the app.
- Delivery via Slack or Discord DM instead of (or in addition to) the web dashboard.
- A CLI or terminal widget for a "check today's topic" one-liner.
- Browser extension / new-tab-page integration so the topic is unavoidable each morning.

**Integrations**

- GitHub activity feed cross-reference — loosely correlate learning topics with what Vedant actually shipped that week.
- Calendar integration — auto-block a daily "learning hour."
- Export history (CSV/Markdown) for a resume, performance review, or portfolio.

**Platform**

- Multi-user support with an optional leaderboard/shared view, if this ever becomes a team or public tool rather than Vedant's personal one.
- An admin UI/CMS for editing the curriculum without touching the database.
- An analytics dashboard beyond §7's stats — trends over time, best/worst days of the week, correlation between streak length and topics-per-week.
- A native mobile app / installable PWA with offline caching of today's topic.

## 16. Open questions & decisions needed

These need a decision before or during MVP build — flagged rather than pre-decided since they're genuinely the user's call:

- **Where does this get deployed?** A local-only tool (SQLite, runs on Vedant's machine) vs. a small hosted deployment (Vercel/Railway + hosted Postgres) — changes the scheduler and auth answer in §11/§13.
- **Selection engine: deterministic or LLM-backed?** §8 recommends deterministic for v1 simplicity/testability, but if the "editorial judgment" of picking real-world scenarios matters a lot, an LLM call in the daily job may be worth the extra complexity from day one.
- **How aggressively should the real-world/situational track be weighted?** §1's whole thesis is that this track matters more than typical learning trackers — should it be weighted higher than an even 1-in-5 rotation?
- **Notification channel priority for Phase 2** — push, email, Slack/Discord, or none until it's proven the core loop works without one?
- **Keep the existing Claude Artifact running in parallel during rebuild**, or treat this rebuild as the eventual replacement? If parallel, decide how/whether their histories merge.

## 17. Milestones & rollout plan

1. **Schema & seed** — stand up the database (§10), import the curriculum (Appendix below), set default preferences.
2. **Core API** — `/today`, `/today/complete`, `/today/swap`, the shared selection function (§8, §12).
3. **Dashboard UI** — today's-topic card, mark-done/swap, basic history list. Ship this alone first — it's already a usable product end to end.
4. **Streaks, calendar, stats** — §5.2, §5.3, §7, all as derived reads.
5. **Personalization** — focus-area toggles and the custom queue (§6).
6. **Automation** — wire up the real cron job calling the shared selection function; verify it survives a full week unattended before calling MVP done.
7. **Cutover** — once the rebuild has run reliably for a week or two, decide (per §16) whether/how to retire the Artifact version and migrate its history into the new database so the streak doesn't visibly reset.
8. **Phase 2 backlog** — pull from §15 in priority order once the core loop has proven itself daily for at least a few weeks.
