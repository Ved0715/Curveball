"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getSession } from "./api";
import { toApiError, type ApiError } from "./errors";
import { DEFAULT_SETUP, type Session, type Setup, type Turn } from "./schemas";

/**
 * Client state. The server (Postgres) owns interviews; the browser only keeps
 * the setup draft, which session is open, and preferences.
 */
type Store = {
  setup: Setup;
  sessionId: string | null;
  /** In-memory copy of the open session, refreshed from the server. Not persisted. */
  session: Session | null;
  speakAloud: boolean;

  updateSetup: (patch: Partial<Setup>) => void;
  openSession: (session: Session) => void;
  patchSession: (fn: (s: Session) => Session) => void;
  closeSession: () => void;
  setSpeakAloud: (on: boolean) => void;
  reset: () => void;
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      setup: DEFAULT_SETUP,
      sessionId: null,
      session: null,
      speakAloud: false,

      updateSetup: (patch) => set((s) => ({ setup: { ...s.setup, ...patch } })),
      openSession: (session) => set({ session, sessionId: session.id }),
      patchSession: (fn) => set((s) => (s.session ? { session: fn(s.session) } : {})),
      closeSession: () => set({ session: null, sessionId: null }),
      setSpeakAloud: (on) => set({ speakAloud: on }),
      reset: () => set({ setup: DEFAULT_SETUP, sessionId: null, session: null }),
    }),
    {
      name: "mockroom.v2",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ setup: s.setup, sessionId: s.sessionId, speakAloud: s.speakAloud }),
    },
  ),
);

/** True once saved state has loaded from localStorage (avoids flashing empty screens). */
export function useHydrated() {
  return useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}

export type SessionLoad =
  | { status: "loading" }
  | { status: "none" }
  | { status: "error"; error: ApiError; retry: () => void }
  | { status: "ready"; session: Session };

/** The open session, loaded from the server when needed. */
export function useCurrentSession(): SessionLoad {
  const hydrated = useHydrated();
  const sessionId = useStore((s) => s.sessionId);
  const session = useStore((s) => s.session);
  const openSession = useStore((s) => s.openSession);
  const closeSession = useStore((s) => s.closeSession);
  const [error, setError] = useState<{ id: string; error: ApiError } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const needsFetch = hydrated && !!sessionId && session?.id !== sessionId;
  useEffect(() => {
    if (!needsFetch || !sessionId) return;
    let live = true;
    getSession(sessionId)
      .then((s) => live && openSession(s))
      .catch((err: unknown) => {
        if (!live) return;
        const e = toApiError(err);
        if (e.code === "not_found") closeSession();
        else setError({ id: sessionId, error: e });
      });
    return () => {
      live = false;
    };
  }, [needsFetch, sessionId, attempt, openSession, closeSession]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  if (!hydrated) return { status: "loading" };
  if (!sessionId) return { status: "none" };
  if (session?.id === sessionId) return { status: "ready", session };
  if (error?.id === sessionId) return { status: "error", error: error.error, retry };
  return { status: "loading" };
}

export function answeredCount(turns: Turn[]) {
  return turns.filter((t) => t.speaker === "candidate").length;
}
