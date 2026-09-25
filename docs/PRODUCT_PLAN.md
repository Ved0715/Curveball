# Curveball — product plan

*Learn something every day. Handle any curveball.*

Curveball merges two products into one learning ecosystem:

- **Learning Log** (`docs/Learning Log PRD.md`): a daily topic across five tracks, streaks, calendar, stats.
- **Mock Room** (`docs/PRODUCT_SPEC.md`): AI mock interviews with an honest scored report.

## The two loops

```
          ┌──────────── Learn (daily, 5–10 min) ────────────┐
          │ today's topic → Teach me (AI lesson + check)     │
          │ → reflect → mark learned → streak + XP           │
          └──────────────▲───────────────────────┬──────────┘
      weak spots become  │                       │ what you learned
      queued topics      │                       ▼ shows up in answers
          ┌──────────────┴──── Practice (weekly) ──────────┐
          │ mock interview → scored report → "add to queue" │
          └─────────────────────────────────────────────────┘
                              ▼
                 Progress: streak, heatmap, balance, trend, level
```

## Users

- **Primary:** early-career engineers (SDE 1 to mid) who want a system, not motivation: a daily habit plus realistic interview practice. First user: Vedant.
- **Jobs to be done:** "Tell me what to learn today", "Make skipping cost something", "Show me I'm improving", "Get me interview-ready and tell me honestly what to fix".

## Information architecture

| Area | Routes | Purpose |
|---|---|---|
| Public | `/`, `/login`, `/signup` | Landing, auth |
| Today | `/today` | Daily topic, lesson, reflection, streak, queue peek, practice nudge |
| Practice | `/practice`, `/practice/brief`, `/practice/interview`, `/practice/report` | Mock interview flow |
| Progress | `/progress`, `/progress/interviews/[id]` | Stats, heatmap, balance, history, interview reports |
| Settings | `/settings` | Profile, timezone, focus areas, queue, delete account |

## Principles

1. **Three taps to done.** Open → read → mark learned. Everything else is optional depth.
2. **Loss is visible.** The streak is always on screen; a missed day visibly resets it.
3. **Derived, never stored, stats.** Streaks, XP, balance and calendar are computed from history.
4. **Honest AI.** Grounded resume facts, capped scores for vague answers, no fabricated links.
5. **Funky but calm.** Loud colours and chunky shapes, but one primary action per screen and generous space.
6. **Accessible by default.** Keyboard, focus rings, contrast, reduced motion, 375px layouts, colour never alone.

## Architecture

- **Auth:** email + password (argon2), server-side sessions in an httpOnly `SameSite=Lax` cookie; Origin check on unsafe requests; login rate limit. The browser talks to FastAPI through Next.js rewrites on the same origin. Google sign-in later (needs OAuth credentials).
- **Learning engine:** one shared `assign_today()` used by `GET /api/learn/today` (lazy) and `POST /internal/assign-daily` (cron, token-protected). Every job run is logged in `job_runs`.
- **Selection rules (PRD §8):** queue first → enabled focus areas → not used in 60 days (else least recently used) → avoid same track as yesterday → real-world at least every 4 days.
- **Time:** each user has a timezone; "today" and streaks use the user's local date.
- **XP / level (derived):** learned topic 10, reflection 5, lesson check 5, finished interview 20 + score/10.

## Data model additions

`users` (+ password_hash, name, timezone), `auth_sessions`, `topics`, `assignments` (unique user + date; denormalised title/blurb/category; note; lesson), `learn_preferences`, `queue_items` (source: manual | interview), `job_runs`.

## Later

Google sign-in, password reset email (needs an email provider), push/email reminders, streak freeze, spaced repetition, live content sources, weekly digest, PWA.
