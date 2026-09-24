"use client";

import { History } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";
import { useHydrated, useStore } from "@/lib/store";
import { ThemeToggle } from "./theme";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)} aria-label="Mock Room home">
      <span className="relative grid size-8 place-items-center">
        <span className="bg-gradient-brand absolute inset-0 rounded-[10px] opacity-90 transition group-hover:rotate-12" />
        <span className="relative size-2.5 rounded-full bg-bg shadow-[0_0_0_3px_color-mix(in_oklab,var(--bg)_40%,transparent)]" />
      </span>
      <span className="font-display text-[1.45rem] leading-none tracking-tight">Mock Room</span>
    </Link>
  );
}

const STEPS = [
  { href: "/practice", label: "Set up", n: 1 },
  { href: "/practice/brief", label: "Brief", n: 2 },
  { href: "/practice/interview", label: "Interview", n: 3 },
  { href: "/practice/report", label: "Report", n: 4 },
] as const;

export function SiteHeader() {
  const path = usePathname();
  const hydrated = useHydrated();
  const session = useStore((s) => s.session);
  const inFlow = path.startsWith("/practice");

  const enabled: Record<string, boolean> = {
    "/practice": true,
    "/practice/brief": hydrated && !!session?.brief,
    "/practice/interview": hydrated && !!session && !session.state.done,
    "/practice/report": hydrated && !!session?.state.done,
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        {inFlow && (
          <nav aria-label="Practice steps" className="hidden items-center gap-1 rounded-2xl border border-line bg-surface p-1 md:flex">
            {STEPS.map((s) => {
              const active = path === s.href;
              const on = enabled[s.href];
              return on ? (
                <Link
                  key={s.href}
                  href={s.href}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="step-pill"
                      className="absolute inset-0 rounded-xl bg-surface-strong ring-1 ring-line"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span className="relative">
                    <span className="mr-1.5 font-mono text-xs text-muted">{s.n}</span>
                    {s.label}
                  </span>
                </Link>
              ) : (
                <span key={s.href} className="px-3.5 py-1.5 text-sm font-medium text-muted/40" aria-disabled>
                  <span className="mr-1.5 font-mono text-xs">{s.n}</span>
                  {s.label}
                </span>
              );
            })}
          </nav>
        )}
        <div className="flex items-center gap-2">
          <Link
            href="/history"
            aria-label="History"
            className={cn(
              "flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium transition hover:text-ink",
              path === "/history" ? "text-ink" : "text-muted",
            )}
          >
            <History className="size-4" aria-hidden />
            <span className="hidden sm:inline">History</span>
          </Link>
          <ThemeToggle />
          {!inFlow && (
            <Link
              href="/practice"
              className="hidden h-10 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-bg transition hover:-translate-y-px sm:flex"
            >
              Start practising
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
