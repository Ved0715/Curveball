"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMe, logout as apiLogout, setUnauthorizedHandler } from "./api";
import type { User } from "./schemas";
import { useStore } from "./store";

type AuthState = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Set by the login/signup form so the app shell can skip re-fetching the user it just got. */
let primed: User | null = null;
export function primeUser(u: User) {
  primed = u;
}

/** Loads the signed-in user once; any 401 from the API sends the user to the login screen. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const reset = useStore((s) => s.reset);
  const [user, setUser] = useState<User | null>(primed);
  const [loading, setLoading] = useState(!primed);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  useEffect(() => {
    if (primed) {
      primed = null;
      return;
    }
    let live = true;
    getMe()
      .then((u) => live && setUser(u))
      .catch(() => {
        /* 401 is handled by the unauthorized handler */
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const logout = useCallback(async () => {
    // Pages still on screen may get a 401 while we sign out; that's expected, not a reason
    // to bounce through /login?next=… back to where the user was.
    setUnauthorizedHandler(null);
    try {
      await apiLogout();
    } finally {
      reset();
      setUser(null);
      router.replace("/login");
    }
  }, [reset, router]);

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function greeting(name: string, now = new Date()) {
  const h = now.getHours();
  const part = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}`;
}
