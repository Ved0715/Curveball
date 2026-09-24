import type { z } from "zod";
import { ApiError, isErrorCode, toApiError } from "./errors";
import {
  BriefSchema,
  HintResultSchema,
  HistoryItemSchema,
  ReportSchema,
  SessionSchema,
  TurnResultSchema,
  type Brief,
  type HistoryItem,
  type Report,
  type Session,
  type Setup,
  type TurnResult,
} from "./schemas";
import { readSSE } from "./sse";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/* ---------- Identity ---------- */

const CLIENT_KEY = "mockroom.client";

/** A random id this browser generates once. Until sign-in exists, it's who you are to the server. */
export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): an id for this page view only.
    return (globalThis as { __mrClient?: string }).__mrClient ??= crypto.randomUUID();
  }
}

export function forgetClientId() {
  try {
    localStorage.removeItem(CLIENT_KEY);
  } catch {
    /* nothing to forget */
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return { "X-Client-Id": getClientId(), ...extra };
}

/* ---------- Transport ---------- */

async function errorFromResponse(res: Response): Promise<ApiError> {
  try {
    const body: unknown = await res.json();
    const code = (body as { detail?: { code?: unknown } })?.detail?.code;
    if (isErrorCode(code)) return new ApiError(code, res.status === 429 || res.status >= 500);
  } catch {
    /* not JSON */
  }
  if (res.status === 422) return new ApiError("bad_request", false);
  if (res.status === 429) return new ApiError("rate_limited", true);
  return new ApiError("upstream", true);
}

async function requestJSON<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: headers(init.body ? { "Content-Type": "application/json" } : undefined),
    });
    if (!res.ok) throw await errorFromResponse(res);
    const check = schema.safeParse(await res.json());
    if (!check.success) throw new ApiError("invalid_output", true);
    return check.data;
  } catch (err) {
    throw toApiError(err);
  }
}

async function requestEmpty(path: string, init: RequestInit): Promise<void> {
  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, headers: headers() });
    if (!res.ok) throw await errorFromResponse(res);
  } catch (err) {
    throw toApiError(err);
  }
}

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
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Accept: "text/event-stream" }),
      body: JSON.stringify(body ?? {}),
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

/* ---------- Sessions ---------- */

const s = (id: string) => `/api/sessions/${encodeURIComponent(id)}`;

export const createSession = (setup: Setup) =>
  requestJSON<Session>("/api/sessions", { method: "POST", body: JSON.stringify(setup) }, SessionSchema);

export const getSession = (id: string) => requestJSON<Session>(s(id), { method: "GET" }, SessionSchema);

export const deleteSession = (id: string) => requestEmpty(s(id), { method: "DELETE" });

export const endSession = (id: string) => requestJSON<Session>(`${s(id)}/end`, { method: "POST" }, SessionSchema);

/** Progress callbacks for long AI tasks: characters written so far, and the current step. */
export type TaskProgress = { progress: (chars: number) => void; stage: (stage: string) => void };

const progressHandlers = (on: TaskProgress): Handlers => ({
  progress: (d) => on.progress((d as { chars: number }).chars),
  stage: (d) => on.stage((d as { stage: string }).stage),
});

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

/* ---------- History & account ---------- */

export const listHistory = () =>
  requestJSON<HistoryItem[]>("/api/history", { method: "GET" }, HistoryItemSchema.array());

/** Delete everything the server holds for this browser: sessions, transcripts, reports, resume. */
export const deleteMyData = () => requestEmpty("/api/me", { method: "DELETE" });

/* ---------- Misc ---------- */

export async function uploadResume(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(`${API_URL}/api/resume`, { method: "POST", body: form, headers: headers() });
    if (!res.ok) throw await errorFromResponse(res);
    const body = (await res.json()) as { text: string };
    return body.text;
  } catch (err) {
    throw toApiError(err);
  }
}

export type Health = { ok: boolean; mock: boolean; ai_configured: boolean; db: boolean };

export async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}
