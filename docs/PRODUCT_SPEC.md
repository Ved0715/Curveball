# Mock Room — Product spec

## 1. Goal
The best interview practice tool for job seekers: it feels like a real interview, is tailored to the exact job and the candidate's real resume, and gives feedback honest enough to actually improve.

Primary users: students, freshers and working professionals (India first, global later) preparing for tech, product, analyst and general corporate interviews.

## 2. User flow (from the prototype)
1. **Set up** — role, company (optional), experience level, round type, interviewer style (Friendly / Neutral / Tough), length (4 / 7 / 10 questions), job description, resume (paste or upload PDF/DOCX/TXT).
2. **Prep brief** — company overview + what they value, competencies this round judges, strengths (with resume evidence), likely concerns + how to address them, 8 likely questions with "what they're testing" and "your angle", 4 stories to prepare, 4 questions to ask the interviewer.
3. **Mock interview** — named AI interviewer, one question at a time, optional single follow-up per main question, voice or typed answers, read-aloud option, per-answer timer, "I'm stuck" hint (a nudge, never the answer), end early at any time.
4. **Report** — overall score 0–100, verdict (Strong hire / Hire / Borderline / Not yet), summary, five sub-scores (Content, Structure, Specificity, Communication, Role fit), 3 strengths, top 3 fixes, per-answer score + what worked + what was missing + a stronger model answer in the candidate's voice, 3 practice drills.
5. **History** — every session saved, score trend chart, open any past report.

Round types: Mixed, Behavioral, Technical concepts, Coding (talk-through), System design, HR / culture fit, Product sense / case.

## 3. AI calls (server-side)
Copy the four prompts from `prototype/mock-room.html` as the starting point and keep them in `src/lib/prompts/`, one file each, with a Zod schema for each output.

| Call | When | Model tier | Output |
|---|---|---|---|
| Brief | user clicks "Build my prep brief" | balanced | JSON brief (see prototype `buildBrief`) |
| Interviewer turn | after each answer | fast (low latency matters) | `{kind: question \| followup \| clarify \| closing, say}` |
| Hint | "I'm stuck" | fast | 2–3 lines plain text |
| Report | interview ends | most capable | JSON report (see prototype `makeReport`) |

State machine for the interview lives in our code, not the model: track `mainQuestionsAsked`, `followupUsedForCurrent`, `done`. Enforce: max one follow-up per main question; after the last main question, allow at most one follow-up then force closing.

Stream interviewer text and report progress to the client (Server-Sent Events or the AI SDK streaming helpers).

## 4. Improvements over the prototype
- **Real company research**: use the Anthropic web search tool on the server to pull the company's recent news, products, values and known interview process, with sources shown in the brief. Cache per company for 7 days.
- **Better resume parsing**: parse PDF/DOCX on the server, then have the model extract structured data (experience, projects, skills, metrics) once and reuse it in every prompt.
- **Voice**: MVP uses the browser Web Speech API. Later: server speech-to-text for accuracy across accents, plus natural text-to-speech for the interviewer. Also report filler words and speaking pace.
- **Coding round**: add a code editor panel (Monaco) so users can write code while talking.
- **Spaced practice**: "Retry weak questions" mode that re-asks the lowest-scored questions from past sessions.
- **Answer bank**: save your best answers per story theme.

## 5. Data model (starting point)
- `users` — id, email, name, created_at
- `profiles` — user_id, resume_text, resume_structured (jsonb), updated_at
- `sessions` — id, user_id, role, company, level, round, style, question_count, jd_text, status (setup / brief / live / done), created_at
- `briefs` — session_id, content (jsonb), sources (jsonb)
- `turns` — id, session_id, index, speaker (interviewer / candidate), kind, text, created_at, answer_seconds
- `reports` — session_id, overall, verdict, content (jsonb)
- `usage` — user_id, date, tokens_in, tokens_out, calls (for limits and billing)

Row-level security: users can only read and write their own rows. Provide "delete my data".

## 6. Build phases
**Phase 0 — Setup**: scaffold Next.js + TS + Tailwind, lint, typecheck, tests, `.env.example`, deploy an empty app to Vercel.
**Phase 1 — Core flow without accounts**: port setup → brief → interview → report using server API routes and the prototype prompts. Zod validation, streaming, stop and retry. Store in memory / local storage for now.
**Phase 2 — Accounts and persistence**: Supabase auth (Google + email), database tables above, history page with trend chart, delete-my-data.
**Phase 3 — Quality**: web-search company research, structured resume extraction, prompt tuning with a small eval set of sample transcripts (good, average, weak answers) to check scores are consistent and honest.
**Phase 4 — Launch readiness**: rate limits, usage caps, error monitoring (Sentry), analytics, privacy policy and terms, landing page, mobile polish, accessibility pass.
**Phase 5 — Monetization (optional)**: free tier (e.g. 3 interviews / month) + paid plan via Razorpay (India) or Stripe.

## 7. Quality bar
- Works well on mobile (most users will practice on phones).
- First interviewer question appears within a few seconds.
- Never shows raw errors; every failure explains what happened and offers retry.
- Honest scoring: a weak, vague answer must never score above 5/10.
- Accessible: keyboard navigation, visible focus, good contrast, respects reduced motion, light and dark mode.
