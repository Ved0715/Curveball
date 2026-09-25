"use client";

import {
  CalendarCheck2,
  ChartNoAxesColumn,
  CornerDownLeft,
  ListPlus,
  LogOut,
  Mic,
  Moon,
  Search,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { addToQueue } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/format";
import { spring } from "@/lib/motion";
import { Sheet } from "./sheet";
import { cycleTheme } from "./theme";
import { Kbd } from "./ui";
import { useToast } from "./toast";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void | Promise<void>;
};

const PaletteContext = createContext<() => void>(() => {});
export const useCommandPalette = () => useContext(PaletteContext);

function matches(c: Command, q: string) {
  const hay = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** ⌘K / Ctrl+K from anywhere in the app. Typing something new offers to queue it as a topic. */
export function CommandPalette({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setActive(0);
  }, []);
  const show = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const base: Command[] = useMemo(
    () => [
      {
        id: "today",
        label: "Today",
        hint: "Go",
        icon: CalendarCheck2,
        keywords: "home topic daily",
        run: () => router.push("/today"),
      },
      {
        id: "lesson",
        label: "Teach me today's topic",
        hint: "5 min",
        icon: Sparkles,
        keywords: "lesson learn",
        run: () => router.push("/today?lesson=1"),
      },
      {
        id: "practice",
        label: "Start a mock interview",
        hint: "Practice",
        icon: Mic,
        keywords: "interview practice mock",
        run: () => router.push("/practice"),
      },
      {
        id: "progress",
        label: "Progress",
        hint: "Go",
        icon: ChartNoAxesColumn,
        keywords: "stats streak curve history",
        run: () => router.push("/progress"),
      },
      {
        id: "settings",
        label: "Settings",
        hint: "Go",
        icon: Settings,
        keywords: "focus queue profile password",
        run: () => router.push("/settings"),
      },
      {
        id: "theme",
        label: "Switch theme",
        hint: "System → light → dark",
        icon: Moon,
        keywords: "dark light mode",
        run: () => void cycleTheme(),
      },
      {
        id: "logout",
        label: "Log out",
        icon: LogOut,
        keywords: "sign out",
        run: () => void logout(),
      },
    ],
    [router, logout],
  );

  const list = useMemo(() => {
    const found = q.trim() ? base.filter((c) => matches(c, q)) : base;
    const title = q.trim();
    if (title.length >= 3) {
      return [
        ...found,
        {
          id: "queue",
          label: `Add “${title}” to my learning queue`,
          hint: "Queue",
          icon: ListPlus,
          run: async () => {
            try {
              await addToQueue({ title });
              toast({
                title: "Queued for a future day",
                description: title,
                tone: "success",
              });
            } catch (err) {
              toast({
                title: "Couldn't add that",
                description: friendlyError(err),
                tone: "error",
              });
            }
          },
        },
      ];
    }
    return found;
  }, [q, base, toast]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    void c.run();
  };

  return (
    <PaletteContext.Provider value={show}>
      {children}
      <Sheet
        open={open}
        onClose={close}
        title="Jump to…"
        placement="top"
        className="sm:max-w-xl"
      >
        <div className="-mt-1 flex items-center gap-3 rounded-2xl border-2 border-line bg-bg px-4">
          <Search className="size-5 text-muted" aria-hidden />
          <input
            data-autofocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(list.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(list[active]);
              }
            }}
            placeholder="Search, or type a topic to queue it"
            aria-label="Command"
            aria-controls="cmd-list"
            aria-activedescendant={
              list[active] ? `cmd-${list[active].id}` : undefined
            }
            className="h-13 w-full bg-transparent py-3.5 text-base outline-none placeholder:text-muted/70"
          />
        </div>
        <ul
          id="cmd-list"
          role="listbox"
          aria-label="Commands"
          className="mt-3 grid gap-0.5"
        >
          <AnimatePresence initial={false}>
            {list.map((c, i) => (
              <motion.li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === active}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onMouseMove={() => setActive(i)}
                onClick={() => run(c)}
                className="relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5"
              >
                {i === active && (
                  <motion.span
                    layoutId="cmd-active"
                    className="absolute inset-0 rounded-xl bg-pop"
                    transition={spring.snappy}
                  />
                )}
                <c.icon
                  className={cn(
                    "relative size-[18px]",
                    i === active ? "text-pop-ink" : "text-muted",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "relative flex-1 truncate font-medium",
                    i === active && "text-pop-ink",
                  )}
                >
                  {c.label}
                </span>
                {c.hint && (
                  <span
                    className={cn(
                      "relative text-xs",
                      i === active ? "text-pop-ink/70" : "text-muted",
                    )}
                  >
                    {c.hint}
                  </span>
                )}
                {i === active && (
                  <CornerDownLeft
                    className="relative size-4 text-pop-ink"
                    aria-hidden
                  />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
          {!list.length && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              Nothing matches. Type 3+ letters to queue a topic.
            </li>
          )}
        </ul>
        <p className="mt-4 hidden items-center gap-2 text-xs text-muted sm:flex">
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> move · <Kbd>Enter</Kbd> run · <Kbd>Esc</Kbd>{" "}
          close
        </p>
      </Sheet>
    </PaletteContext.Provider>
  );
}
