"use client";

import { CalendarCheck2, ChartNoAxesColumn, Flame, LogOut, Mic, Settings } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getToday } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme";

/* ---------- Public site header ---------- */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-xl px-3 text-sm font-semibold transition hover:bg-surface sm:flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="press neo-sm flex h-10 items-center rounded-xl bg-pop px-4 text-sm font-bold text-pop-ink"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------- App shell ---------- */

const NAV = [
  { href: "/today", label: "Today", icon: CalendarCheck2 },
  { href: "/practice", label: "Practice", icon: Mic },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

function StreakChip({ compact = false }: { compact?: boolean }) {
  const streak = useStore((s) => s.streak);
  const setStreak = useStore((s) => s.setStreak);
  useEffect(() => {
    if (streak !== null) return;
    getToday()
      .then((t) => setStreak(t.streak))
      .catch(() => {
        /* the page shows its own errors */
      });
  }, [streak, setStreak]);
  const n = streak ?? 0;
  return (
    <span
      className={cn(
        "neo-sm inline-flex items-center gap-1.5 rounded-full bg-surface font-bold",
        compact ? "px-2.5 py-1 text-sm" : "px-3 py-1.5",
      )}
      title={`${n}-day learning streak`}
      aria-label={`${n}-day learning streak`}
    >
      <Flame className={cn("size-4", n > 0 ? "fill-[var(--sun)] text-[var(--track-dsa)]" : "text-muted")} aria-hidden />
      <span className="tabular-nums">{n}</span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r-2 border-line bg-bg-2/70 p-5 lg:flex">
        <Logo href="/today" />
        <nav aria-label="Main" className="mt-10 flex flex-col gap-2">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-semibold transition",
                  active ? "neo-sm bg-pop text-pop-ink" : "text-muted hover:bg-surface hover:text-ink",
                )}
              >
                <n.icon className="size-[18px]" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <StreakChip />
            <ThemeToggle />
          </div>
          {user && (
            <div className="neo bg-surface rounded-2xl p-3">
              <p className="truncate font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
              >
                <LogOut className="size-3.5" aria-hidden /> Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-2 border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
          <Logo href="/today" />
          <div className="flex items-center gap-2">
            <StreakChip compact />
            <ThemeToggle />
          </div>
        </header>

        {children}

        {/* Mobile bottom tabs */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2.5 text-[0.7rem] font-bold",
                  active ? "text-ink" : "text-muted",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-x-3 top-1.5 bottom-1.5 rounded-xl border-2 border-line bg-pop"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <n.icon className="relative size-5" aria-hidden />
                <span className={cn("relative", active && "text-pop-ink")}>{n.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ---------- Practice step bar ---------- */

const STEPS = [
  { href: "/practice", label: "Set up", n: 1 },
  { href: "/practice/brief", label: "Brief", n: 2 },
  { href: "/practice/interview", label: "Interview", n: 3 },
  { href: "/practice/report", label: "Report", n: 4 },
] as const;

export function PracticeSteps() {
  const path = usePathname();
  const session = useStore((s) => s.session);
  const enabled: Record<string, boolean> = {
    "/practice": true,
    "/practice/brief": !!session?.brief,
    "/practice/interview": !!session && !session.state.done,
    "/practice/report": !!session?.state.done,
  };
  return (
    <nav aria-label="Practice steps" className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const active = path === s.href;
          const on = enabled[s.href];
          const inner = (
            <>
              <span className="font-mono text-xs">{s.n}</span> {s.label}
            </>
          );
          return (
            <li key={s.href}>
              {on ? (
                <Link
                  href={s.href}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-semibold transition",
                    active ? "border-line bg-ink text-bg" : "border-line bg-surface hover:bg-surface-strong",
                  )}
                >
                  {inner}
                </Link>
              ) : (
                <span
                  aria-disabled
                  className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-line-soft px-3 py-1 text-sm font-semibold text-muted/60"
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
