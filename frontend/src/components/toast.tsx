"use client";

import { Check, CircleAlert, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { duration, ease, spring } from "@/lib/motion";

type Tone = "default" | "success" | "error";
type ToastInput = { title: string; description?: string; tone?: Tone; action?: { label: string; onClick: () => void } };
type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);
const LIFETIME = 4500;

/** Transient feedback: bottom of the screen, above the mobile tab bar; never steals focus. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const arm = useCallback((id: number) => {
    timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME));
  }, [dismiss]);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      arm(id);
    },
    [arm],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: spring.gentle }}
              exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: duration.fast, ease: ease.in } }}
              onMouseEnter={() => clearTimeout(timers.current.get(t.id))}
              onMouseLeave={() => arm(t.id)}
              className="sheet pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3"
              role={t.tone === "error" ? "alert" : "status"}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border-2 border-line",
                  t.tone === "error" ? "bg-bad text-white" : t.tone === "success" ? "bg-pop text-pop-ink" : "bg-surface-strong",
                )}
                aria-hidden
              >
                {t.tone === "error" ? <CircleAlert className="size-4" /> : <Check className="size-4" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && <p className="truncate text-xs text-muted">{t.description}</p>}
              </div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold text-accent hover:bg-surface-strong"
                >
                  <Undo2 className="size-3.5" aria-hidden /> {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-strong hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
