"use client";

import { CircleAlert, RotateCcw, Square } from "lucide-react";
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

export function StreamingPanel({
  title,
  lede,
  lines,
  percent,
  onStop,
}: {
  title: string;
  lede: string;
  lines: string[];
  percent: number | null;
  onStop: () => void;
}) {
  const line = useCycling(lines);
  return (
    <Card className="mx-auto max-w-2xl p-8 sm:p-12">
      <div className="flex flex-col items-center text-center">
        <OrbitLoader size={84} />
        <h1 className="mt-8 font-display text-4xl tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 max-w-md text-muted">{lede}</p>
        <div className="mt-8 h-6" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.p
              key={percent && percent > 5 ? "writing" : line}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="shimmer-text text-sm font-medium"
            >
              {percent && percent > 5 ? `Writing… ${percent}%` : line}
            </motion.p>
          </AnimatePresence>
        </div>
        <div
          className="mt-4 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-strong"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-label="Progress"
        >
          <motion.div
            className="bg-gradient-brand h-full rounded-full"
            initial={{ width: "2%" }}
            animate={{ width: `${Math.max(4, percent ?? 4)}%` }}
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
