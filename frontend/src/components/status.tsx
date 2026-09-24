"use client";

import { Circle, CircleAlert, CircleCheck, LoaderCircle, RotateCcw, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card } from "./ui";
import { useReducedMotion } from "@/lib/motion";

/** Three orbiting dots around a glowing core. */
export function OrbitLoader({ size = 64 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden>
      <div className="bg-gradient-brand absolute inset-[30%] rounded-full blur-md" />
      <div className="bg-gradient-brand absolute inset-[36%] rounded-full" />
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 2.4 + i * 0.7, repeat: Infinity, ease: "linear" }}
          style={{ rotate: i * 120 }}
        >
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-ink/80" />
        </motion.div>
      ))}
    </div>
  );
}

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

/** Discrete steps: done ✓, current (spinning), or not started. Shows real progress, not a guess. */
function StepList({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3" aria-label="Progress">
      {steps.map((st, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={st.key} className="flex items-center gap-2 text-sm" aria-current={state === "current" ? "step" : undefined}>
            {i > 0 && <span className="hidden h-px w-6 bg-line-strong sm:block" aria-hidden />}
            {state === "done" ? (
              <CircleCheck className="size-4 text-good" aria-hidden />
            ) : state === "current" ? (
              <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden />
            ) : (
              <Circle className="size-4 text-muted/50" aria-hidden />
            )}
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
    <Card className="mx-auto max-w-2xl p-8 sm:p-12">
      <div className="flex flex-col items-center text-center">
        <OrbitLoader size={84} />
        <h1 className="mt-8 font-display text-4xl tracking-tight sm:text-5xl">{title}</h1>
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
          className="mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-strong"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={onLastStep ? (percent ?? undefined) : undefined}
          aria-label="Progress"
        >
          <motion.div
            className="bg-gradient-brand h-full rounded-full"
            initial={{ width: "2%" }}
            animate={{ width: `${Math.max(4, onLastStep ? (percent ?? 4) : 4)}%` }}
            transition={{ ease: "easeOut", duration: 0.6 }}
          />
        </div>
        <Button variant="ghost" size="sm" className="mt-8" onClick={onStop}>
          <Square className="size-3.5 fill-current" aria-hidden /> Stop
        </Button>
      </div>
    </Card>
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
      className="flex flex-col gap-4 rounded-2xl border border-bad/30 bg-bad/[0.07] p-5 sm:flex-row sm:items-center"
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
