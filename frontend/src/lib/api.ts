import { z } from "zod";
import { ApiError, isErrorCode, toApiError } from "./errors";
import {
  AssignmentSchema,
  BriefSchema,
  HintResultSchema,
  HistoryItemSchema,
  LessonSchema,
  PrefsSchema,
  ProgressSchema,
  QueueItemSchema,
  ReportSchema,
  SessionSchema,
  TodaySchema,
  TurnResultSchema,
  UserSchema,
  type Assignment,
  type Brief,
  type HistoryItem,
  type Lesson,
  type Progress,
  type QueueItem,
  type Report,
  type Session,
  type Setup,
  type Today,
  type TurnResult,
  type User,
} from "./schemas";
import { readSSE } from "./sse";

/**
 * All calls go to our own origin (`/api/...`); Next.js forwards them to FastAPI.
 * The session cookie is httpOnly and first-party, so there's nothing to attach by hand.
 */

/** Called on any 401 so the app can send the user to the login screen. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  let err: ApiError | null = null;
  try {
    const body: unknown = await res.json();
    const code = (body as { detail?: { code?: unknown } })?.detail?.code;
    if (isErrorCode(code)) err = new ApiError(code, res.status === 429 || res.status >= 500);
  } catch {
    /* not JSON */
  }
  if (!err) {
    if (res.status === 401) err = new ApiError("no_session", false);
    else if (res.status === 422) err = new ApiError("bad_request", false);
    else if (res.status === 429) err = new ApiError("rate_limited", true);
    else err = new ApiError("upstream", true);
  }
  if (err.code === "no_session") onUnauthorized?.();
  return err;
}

async function call<T>(path: string, init: RequestInit, schema: z.ZodType<T> | null): Promise<T> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      credentials: "same-origin",
    });
    if (!res.ok) throw await errorFromResponse(res);
    if (schema === null) return undefined as T;
    const check = schema.safeParse(await res.json());
    if (!check.success) throw new ApiError("invalid_output", true);
    return check.data;
  } catch (err) {
    throw toApiError(err);
  }
}

const get = <T>(path: string, schema: z.ZodType<T>) => call(path, { method: "GET" }, schema);
const send = <T>(method: string, path: string, body: unknown, schema: z.ZodType<T> | null) =>
  call<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }, schema);

type Handlers = Record<string, (data: unknown) => void>;

/** POST, then read the Server-Sent Events stream until a `result` or `error` event. */
async function postStream<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  handlers: Handlers,
  signal?: AbortSignal,
): Promise<T> {
  let result: T | undefined;
  let streamError: ApiError | undefined;
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body ?? {}),
      credentials: "same-origin",
      signal,
    });
    if (!res.ok || !res.body) throw await errorFromResponse(res);
    await readSSE(res.body, ({ event, data }) => {
      const parsed: unknown = JSON.parse(data);
      if (event === "result") {
        const check = schema.safeParse(parsed);
        if (check.success) result = check.data;
        else streamError = new ApiError("invalid_output", true);
      } else if (event === "error") {
        const { code, retryable } = parsed as { code?: unknown; retryable?: boolean };
        streamError = new ApiError(isErrorCode(code) ? code : "upstream", retryable ?? true);
      } else {
        handlers[event]?.(parsed);
      }
    });
  } catch (err) {
    throw toApiError(err);
  }
  if (streamError) throw streamError;
  if (result === undefined) throw new ApiError("upstream", true);
  return result;
}

/** Progress callbacks for long AI tasks: characters written so far, and the current step. */
export type TaskProgress = { progress: (chars: number) => void; stage: (stage: string) => void };

const progressHandlers = (on: TaskProgress): Handlers => ({
  progress: (d) => on.progress((d as { chars: number }).chars),
  stage: (d) => on.stage((d as { stage: string }).stage),
});

/* ---------- Accounts ---------- */

export const signup = (body: { email: string; password: string; name: string; timezone: string }) =>
  send("POST", "/api/auth/signup", body, UserSchema);
export const login = (body: { email: string; password: string }) => send("POST", "/api/auth/login", body, UserSchema);
export const logout = () => send<void>("POST", "/api/auth/logout", undefined, null);
export const getMe = () => get<User>("/api/auth/me", UserSchema);
export const updateMe = (body: { name?: string; timezone?: string }) => send("PATCH", "/api/me", body, UserSchema);
export const changePassword = (body: { current: string; new: string }) =>
  send<void>("POST", "/api/me/password", body, null);
/** Delete the account and everything it owns. */
export const deleteAccount = () => send<void>("DELETE", "/api/me", undefined, null);

/* ---------- Learning ---------- */

export const getToday = () => get<Today>("/api/learn/today", TodaySchema);
export const completeToday = (note?: string) =>
  send<Assignment>("POST", "/api/learn/today/complete", { note: note || null }, AssignmentSchema);
export const swapToday = () => send<Assignment>("POST", "/api/learn/today/swap", {}, AssignmentSchema);
export const saveNote = (note: string) => send<Assignment>("PUT", "/api/learn/today/note", { note }, AssignmentSchema);
export const markCheckDone = () => send<Assignment>("POST", "/api/learn/today/check", {}, AssignmentSchema);
export const streamLesson = (on: TaskProgress, signal?: AbortSignal) =>
  postStream<Lesson>("/api/learn/today/lesson", {}, LessonSchema, progressHandlers(on), signal);
export const getLearnHistory = (limit = 60) =>
  get<Assignment[]>(`/api/learn/history?limit=${limit}`, AssignmentSchema.array());
export const getPrefs = () => get("/api/learn/preferences", PrefsSchema);
export const putPrefs = (focus_areas: string[]) => send("PUT", "/api/learn/preferences", { focus_areas }, PrefsSchema);
export const getQueue = () => get<QueueItem[]>("/api/learn/queue", QueueItemSchema.array());
export const addToQueue = (item: { title: string; blurb?: string; source?: "manual" | "interview"; session_id?: string }) =>
  send<QueueItem>("POST", "/api/learn/queue", item, QueueItemSchema);
export const removeFromQueue = (id: string) =>
  send<void>("DELETE", `/api/learn/queue/${encodeURIComponent(id)}`, undefined, null);
export const getProgress = () => get<Progress>("/api/progress", ProgressSchema);

/* ---------- Interview sessions ---------- */

const s = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;

export const createSession = (setup: Setup) => send<Session>("POST", "/api/sessions", setup, SessionSchema);
export const getSession = (id: string) => get<Session>(s(id), SessionSchema);
export const deleteSession = (id: string) => send<void>("DELETE", s(id), undefined, null);
export const endSession = (id: string) => send<Session>("POST", `${s(id)}/end`, {}, SessionSchema);

export function streamBrief(id: string, on: TaskProgress, signal?: AbortSignal) {
  return postStream<Brief>(`${s(id)}/brief`, {}, BriefSchema, progressHandlers(on), signal);
}

export function streamTurn(
  id: string,
  answer: { answer: string; answer_seconds: number } | null,
  on: { say: (text: string) => void; reset: () => void },
  signal?: AbortSignal,
): Promise<TurnResult> {
  return postStream<TurnResult>(
    `${s(id)}/turn`,
    answer ?? {},
    TurnResultSchema,
    { say: (d) => on.say((d as { text: string }).text), reset: () => on.reset() },
    signal,
  );
}

export async function streamHint(id: string, onDelta: (text: string) => void, signal?: AbortSignal) {
  const r = await postStream(
    `${s(id)}/hint`,
    {},
    HintResultSchema,
    { delta: (d) => onDelta((d as { text: string }).text) },
    signal,
  );
  return r.text;
}

export function streamReport(id: string, on: TaskProgress, signal?: AbortSignal) {
  return postStream<Report>(`${s(id)}/report`, {}, ReportSchema, progressHandlers(on), signal);
}

export const listHistory = () => get<HistoryItem[]>("/api/history", HistoryItemSchema.array());

/* ---------- Misc ---------- */

export async function uploadResume(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const r = await call("/api/resume", { method: "POST", body: form }, z.object({ text: z.string() }));
  return r.text;
}

export type Health = { ok: boolean; mock: boolean; ai_configured: boolean; provider?: string; db: boolean };

export async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}
