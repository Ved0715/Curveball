"use client";

import { ArrowUpRight, CalendarCheck2, ChartNoAxesColumn, Flame, LogOut, Mic, Search, Settings } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { getToday } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { WORK_BRAND } from "@/lib/brand";
import { cn } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { AnimatedNumber } from "./animated-number";
import { Ball } from "./brand";
import { useCommandPalette } from "./command";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme";
import { DiamondGlyph, WorldDoor } from "./world-gate";
import { Kbd } from "./ui";

/* ---------- Public site header ---------- */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/login" className="link hidden px-3 py-2 text-sm font-semibold sm:block">
            Log in
          </Link>
          <Link href="/signup" className="press neo-sm flex h-10 items-center rounded-xl bg-pop px-4 text-sm font-bold text-pop-ink">
            Start free
          </Link>
        </nav>
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

/** Keeps the streak in the chrome in sync; the Today page updates it after completion. */
function useStreak() {
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
  return streak ?? 0;
}

function StreakFlame({ on, className }: { on: boolean; className?: string }) {
  return <Flame className={cn(on ? "fill-[var(--sun)] text-[var(--track-dsa)]" : "text-muted", className)} aria-hidden />;
}

function StreakChip() {
  const n = useStreak();
  return (
    <span
      className="inline-flex h-9 items-center gap-1 rounded-full border-2 border-line bg-surface px-2.5 text-sm font-bold"
      aria-label={`${n}-day learning streak`}
      role="img"
    >
      <StreakFlame on={n > 0} className="size-4" />
      <AnimatedNumber value={n} />
    </span>
  );
}

function SearchButton({ compact = false }: { compact?: boolean }) {
  const open = useCommandPalette();
  return compact ? (
    <button
      type="button"
      onClick={open}
      aria-label="Search and jump (Ctrl K)"
      className="press neo-sm grid size-10 cursor-pointer place-items-center rounded-xl bg-surface"
    >
      <Search className="size-[18px]" />
    </button>
  ) : (
    <button
      type="button"
      onClick={open}
      className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border-2 border-line-soft px-3 text-sm text-muted transition hover:border-line hover:text-ink"
    >
      <Search className="size-4" aria-hidden />
      <span className="flex-1 text-left">Jump to…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, logout } = useAuth();
  const streak = useStreak();

  return (
    <div id="world" className="min-h-dvh origin-center lg:grid lg:grid-cols-[252px_1fr]">
      {/* Desktop sidebar: type-led, the ball marks where you are */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r-2 border-line px-5 py-6 lg:flex">
        <Logo href="/today" />
        <div className="mt-8">
          <SearchButton />
        </div>
        <nav aria-label="Main" className="mt-6 flex flex-col">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl py-2.5 pr-3 pl-10 text-[1.05rem] font-semibold transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {active && (
                  <motion.span layoutId="nav-ball" className="absolute left-1.5" transition={spring.snappy}>
                    <motion.span
                      className="block"
                      key={n.href}
                      initial={{ rotate: -140 }}
                      animate={{ rotate: 0 }}
                      transition={spring.gentle}
                    >
                      <Ball size={20} />
                    </motion.span>
                  </motion.span>
                )}
                <n.icon className="size-[18px] transition-transform group-hover:-rotate-6" aria-hidden />
                <span className="transition-transform group-hover:translate-x-0.5">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* The door to the Work world: a place change, so it looks like a door, not a link. */}
        <WorldDoor
          href="/bullpen"
          world="work"
          className="group mt-8 flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-[#0a0d14] p-3 text-left text-[#eef3ff] shadow-[4px_4px_0_var(--shadow-color)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dfe8ff]/20 bg-[#121724] transition-transform group-hover:rotate-45">
            <DiamondGlyph size={26} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-tight font-extrabold">{WORK_BRAND}</span>
            <span className="block text-xs text-[#9ba7c0]">Ship real work with agents</span>
          </span>
          <ArrowUpRight className="size-4 text-[#c8f23c] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
        </WorldDoor>

        <div className="mt-auto">
          <div className="rule-soft pt-5">
            <p className="text-label text-muted">Streak</p>
            <p className="mt-1 flex items-center gap-2" role="img" aria-label={`${streak}-day learning streak`}>
              <StreakFlame on={streak > 0} className="size-7" />
              <AnimatedNumber value={streak} className="text-display leading-none" />
              <span className="self-end pb-1 text-sm text-muted">{streak === 1 ? "day" : "days"}</span>
            </p>
          </div>
          <div className="rule-soft mt-5 flex items-center gap-3 pt-4">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-line bg-pop font-display font-extrabold text-pop-ink"
              aria-hidden
            >
              {user?.name.slice(0, 1).toUpperCase() ?? "·"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name ?? " "}</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
              >
                <LogOut className="size-3" aria-hidden /> Log out
              </button>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-2 border-line bg-bg/85 px-4 backdrop-blur-md lg:hidden">
          <Logo href="/today" />
          <div className="flex items-center gap-2">
            <StreakChip />
            <WorldDoor
              href="/bullpen"
              world="work"
              aria-label={`Enter ${WORK_BRAND}`}
              className="grid size-10 cursor-pointer place-items-center rounded-xl border-2 border-line bg-[#0a0d14] shadow-[2px_2px_0_var(--shadow-color)]"
            >
              <DiamondGlyph size={22} />
            </WorldDoor>
            <SearchButton compact />
            <ThemeToggle />
          </div>
        </header>

        {children}

        {/* Mobile bottom tabs */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-2 border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[0.7rem] font-bold",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <span className="relative grid h-8 w-14 place-items-center">
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      className="absolute inset-0 rounded-full border-2 border-line bg-pop"
                      transition={spring.snappy}
                    />
                  )}
                  <motion.span
                    className="relative"
                    animate={{ y: active ? -1 : 0, scale: active ? 1.08 : 1 }}
                    transition={spring.press}
                  >
                    <n.icon className={cn("size-5", active && "text-pop-ink")} aria-hidden />
                  </motion.span>
                </span>
                {n.label}
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
  { href: "/practice", label: "Set up" },
  { href: "/practice/brief", label: "Brief" },
  { href: "/practice/interview", label: "Interview" },
  { href: "/practice/report", label: "Report" },
] as const;

/** Where you are in the interview flow: a track with the ball at your step. */
export function PracticeSteps() {
  const path = usePathname();
  const session = useStore((s) => s.session);
  const enabled: Record<string, boolean> = {
    "/practice": true,
    "/practice/brief": !!session?.brief,
    "/practice/interview": !!session && !session.state.done,
    "/practice/report": !!session?.state.done,
  };
  const current = Math.max(
    0,
    STEPS.findIndex((s) => s.href === path),
  );
  return (
    <nav aria-label="Practice steps" className="mx-auto max-w-4xl px-4 pt-6 sm:px-6">
      <ol className="relative grid grid-cols-4">
        <span className="absolute top-[11px] right-[12.5%] left-[12.5%] h-0.5 bg-line-soft" aria-hidden />
        <motion.span
          className="absolute top-[11px] left-[12.5%] h-0.5 w-3/4 origin-left bg-line"
          initial={false}
          animate={{ scaleX: current / 3 }}
          transition={spring.gentle}
          aria-hidden
        />
        {STEPS.map((s, i) => {
          const active = i === current;
          const done = i < current;
          const on = enabled[s.href];
          const dot = (
            <span className="relative grid size-6 place-items-center">
              {active ? (
                <motion.span layoutId="step-ball" transition={spring.snappy}>
                  <Ball size={24} />
                </motion.span>
              ) : (
                <span className={cn("size-3 rounded-full border-2", done ? "border-line bg-line" : "border-line-soft bg-bg")} />
              )}
            </span>
          );
          const label = <span className={cn("text-xs font-semibold", active ? "text-ink" : "text-muted")}>{s.label}</span>;
          return (
            <li key={s.href} className="relative flex flex-col items-center">
              {on && !active ? (
                <Link href={s.href} className="group flex flex-col items-center gap-1.5">
                  {dot}
                  <span className="text-xs font-semibold text-muted group-hover:text-ink">{s.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={active ? "step" : undefined}
                  aria-disabled={!on || undefined}
                  className="flex flex-col items-center gap-1.5"
                >
                  {dot}
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
