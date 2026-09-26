"use client";

import { Cable, LayoutList } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { BRAND, WORK_BRAND } from "@/lib/brand";
import { cn } from "@/lib/format";
import { spring } from "@/lib/motion";
import { Ball } from "../brand";
import { DiamondGlyph, WorldDoor } from "../world-gate";

const NAV = [
  { href: "/bullpen", label: "Sessions", icon: LayoutList },
  { href: "/bullpen/connect", label: "Connect an agent", icon: Cable },
] as const;

function isActive(path: string, href: string) {
  return href === "/bullpen" ? path === "/bullpen" || /^\/bullpen\/(?!connect)/.test(path) : path.startsWith(href);
}

/** The Work world's chrome: a top bar, not Learn's sidebar - a different place, same family. */
export function WorkShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user } = useAuth();

  // The world lives on <html> so portals (sheets, toasts) are night-shift too.
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.world = "work";
    return () => {
      delete html.dataset.world;
    };
  }, []);

  const back = (
    <WorldDoor
      href="/today"
      world="learn"
      className="group flex h-10 cursor-pointer items-center gap-2 rounded-xl border-2 border-[#16131a] bg-[#fff7ea] px-3 text-sm font-bold text-[#16131a] shadow-[3px_3px_0_var(--shadow-color)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
      aria-label={`Back to ${BRAND}: learn and practice`}
    >
      <span className="transition-transform group-hover:-rotate-45">
        <Ball size={20} />
      </span>
      <span className="hidden sm:inline">Back to Learn</span>
    </WorldDoor>
  );

  return (
    <div id="world" className="min-h-dvh origin-center">
      <header className="sticky top-0 z-40 border-b-2 border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/bullpen" className="group flex items-center gap-2.5" aria-label={`${WORK_BRAND} home`}>
            <span className="transition-transform duration-300 group-hover:rotate-90">
              <DiamondGlyph size={30} />
            </span>
            <span className="font-display text-xl leading-none font-extrabold">{WORK_BRAND}</span>
          </Link>
          <nav aria-label="Bullpen" className="ml-3 hidden items-center gap-1 sm:flex">
            {NAV.map((n) => {
              const active = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="work-nav"
                      className="absolute inset-x-2 -bottom-[13px] h-[3px] rounded-full bg-pop"
                      transition={spring.snappy}
                    />
                  )}
                  <n.icon className="size-4" aria-hidden />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {back}
            <span
              className="hidden size-9 place-items-center rounded-full border-2 border-line bg-surface font-display font-extrabold sm:grid"
              title={user?.name}
              aria-hidden
            >
              {user?.name.slice(0, 1).toUpperCase() ?? "·"}
            </span>
          </div>
        </div>
        <nav aria-label="Bullpen" className="flex border-t-2 border-line-soft sm:hidden">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold",
                  active ? "text-ink" : "text-muted",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="work-nav-m"
                    className="absolute inset-x-6 bottom-0 h-[3px] rounded-full bg-pop"
                    transition={spring.snappy}
                  />
                )}
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main id="main" className="pb-16">
        {children}
      </main>
    </div>
  );
}
