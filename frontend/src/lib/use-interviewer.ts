"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamTurn } from "./api";
import { toApiError, type ApiError } from "./errors";
import { useStore } from "./store";
import { useAbortOnUnmount } from "./use-task";

type Answer = { answer: string; answer_seconds: number };

/**
 * Sends the candidate's answer and streams the interviewer's next turn.
 * The answer shows in the transcript immediately. If the request fails, a retry resends
 * it; the server stores an answer only once, so retries are always safe.
 */
export function useInterviewerTurn(sessionId: string, onTurn: (say: string, done: boolean) => void) {
  const patchSession = useStore((s) => s.patchSession);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const pending = useRef<Answer | null>(null);
  const onTurnRef = useRef(onTurn);
  useEffect(() => {
    onTurnRef.current = onTurn;
  });
  useAbortOnUnmount(ctl);

  const ask = useCallback(async () => {
    if (ctl.current) return;
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setError(null);
    setLive("");
    try {
      const r = await streamTurn(
        sessionId,
        pending.current,
        { say: setLive, reset: () => setLive("") },
        c.signal,
      );
      pending.current = null;
      patchSession((s) => ({
        ...s,
        status: r.state.done ? "done" : "live",
        state: r.state,
        turns: [...s.turns, { speaker: "interviewer", text: r.say, kind: r.kind }],
      }));
      onTurnRef.current(r.say, r.state.done);
    } catch (err) {
      // A stop shows as an error with "Try again", so the room pauses instead of re-asking.
      setError(toApiError(err));
    } finally {
      ctl.current = null;
      setBusy(false);
      setLive("");
    }
  }, [sessionId, patchSession]);

  /** Show the answer right away, then ask for the next turn. */
  const answer = useCallback(
    (a: Answer) => {
      pending.current = a;
      patchSession((s) => ({
        ...s,
        turns: [...s.turns, { speaker: "candidate", text: a.answer, answer_seconds: a.answer_seconds }],
      }));
      void ask();
    },
    [ask, patchSession],
  );

  const stop = useCallback(() => ctl.current?.abort(), []);

  return { live, busy, error, ask, answer, stop };
}

/** Seconds since `since`, ticking once a second while `running`. */
export function useElapsed(since: number, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return Math.max(0, Math.floor((now - since) / 1000));
}
