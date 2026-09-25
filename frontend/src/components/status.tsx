"use client";

import { CircleAlert, CircleCheck, RotateCcw, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { spring } from "@/lib/motion";
import { Ball, BallLoader } from "./brand";
import { Button } from "./ui";

/** Rotates through status lines so long waits feel alive. */
function useCycling(lines: string[], ms = 2600) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), ms);
    return () => clearInterval(t);
  }, [lines.length, ms]);
  return lines[i];
}

export type Step = { key: string; label: string; active: string };

/** Discrete steps: done, current (the ball sits on it), or not started. Real progress, not a guess. */
function StepList({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3" aria-label="Progress">
      {steps.map((st, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={st.key} className="flex items-center gap-2 text-sm" aria-current={state === "current" ? "step" : undefined}>
            {i > 0 && <span className={cn("hidden h-0.5 w-6 sm:block", state === "todo" ? "bg-line-soft" : "bg-line")} aria-hidden />}
            <span className="grid size-5 place-items-center">
              {state === "done" ? (
                <CircleCheck className="size-4 text-good" aria-hidden />
              ) : state === "current" ? (
                <motion.span layoutId="stream-step" transition={spring.snappy}>
                  <Ball size={16} state="spin" />
                </motion.span>
              ) : (
                <span className="size-2.5 rounded-full border-2 border-line-soft" aria-hidden />
              )}
            </span>
            <span className={state === "todo" ? "text-muted/60" : state === "current" ? "font-semibold" : "text-muted"}>
              {st.label}
              <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (in progress)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StreamingPanel({
  title,
  lede,
  lines,
  percent,
  steps,
  stage,
  onStop,
}: {
  title: string;
  lede: string;
  /** Rotating status lines while the final step writes. */
  lines: string[];
  percent: number | null;
  /** Optional named steps; `stage` is the key the server reported last. */
  steps?: Step[];
  stage?: string | null;
  onStop: () => void;
}) {
  const line = useCycling(lines);
  const current = steps ? Math.max(0, steps.findIndex((st) => st.key === stage)) : 0;
  const onLastStep = !steps || current === steps.length - 1;
  const status = !onLastStep
    ? steps![current].active
    : percent && percent > 5
      ? `Writing… ${percent}%`
      : line;
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-6 text-center sm:py-12">
      <BallLoader />
      <h1 className="mt-8 text-display">{title}</h1>
      <p className="mt-3 max-w-md text-muted">{lede}</p>
      {steps && (
        <div className="mt-8">
          <StepList steps={steps} current={current} />
        </div>
      )}
      <div className="mt-6 h-6" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.p
            key={status.startsWith("Writing…") ? "writing" : status}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="shimmer-text text-sm font-medium"
          >
            {status}
          </motion.p>
        </AnimatePresence>
      </div>
      <div
        className="mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full border-2 border-line bg-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={onLastStep ? (percent ?? undefined) : undefined}
        aria-label="Progress"
      >
        <motion.div
          className="h-full origin-left bg-pop"
          initial={{ scaleX: 0.02 }}
          animate={{ scaleX: Math.max(4, onLastStep ? (percent ?? 4) : 4) / 100 }}
          transition={spring.gentle}
        />
      </div>
      <Button variant="ghost" size="sm" className="mt-8" onClick={onStop}>
        <Square className="size-3.5 fill-current" aria-hidden /> Stop
      </Button>
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
  children,
}: {
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="flex flex-col gap-4 rounded-2xl border-2 border-bad bg-surface p-5 shadow-[4px_4px_0_var(--bad)] sm:flex-row sm:items-center"
    >
      <CircleAlert className="size-5 shrink-0 text-bad" aria-hidden />
      <p className="flex-1 text-sm">{message}</p>
      <div className="flex gap-2">
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            <RotateCcw className="size-3.5" aria-hidden /> Try again
          </Button>
        )}
        {children}
      </div>
    </motion.div>
  );
}
