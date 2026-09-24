"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";

export type OrbMode = "idle" | "thinking" | "speaking" | "listening";

/** The interviewer's presence: a glowing orb that breathes, spins or pulses by mode. */
export function InterviewerOrb({ mode, initial, size = 120 }: { mode: OrbMode; initial: string; size?: number }) {
  const reduce = useReducedMotion();
  const pulse =
    reduce || mode === "idle"
      ? {}
      : mode === "speaking"
        ? { scale: [1, 1.08, 0.98, 1.05, 1] }
        : mode === "listening"
          ? { scale: [1, 1.03, 1] }
          : { rotate: 360 };
  const duration = mode === "thinking" ? 3 : mode === "speaking" ? 0.9 : 2.2;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      <motion.div
        className="bg-gradient-brand absolute inset-0 rounded-full opacity-60 blur-2xl"
        animate={reduce ? undefined : { opacity: mode === "idle" ? 0.35 : [0.45, 0.8, 0.45] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      {mode === "thinking" && !reduce && (
        <motion.div
          className="absolute inset-[-6px] rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--accent)", borderRightColor: "var(--accent-2)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
      )}
      <motion.div
        className="relative grid size-full place-items-center overflow-hidden rounded-full"
        animate={pulse}
        transition={{ duration, repeat: mode === "idle" ? 0 : Infinity, ease: mode === "thinking" ? "linear" : "easeInOut" }}
        style={{
          background:
            "conic-gradient(from 180deg at 50% 50%, var(--accent), var(--accent-2), var(--accent-3), var(--accent))",
        }}
      >
        <div className="absolute inset-[3px] rounded-full bg-bg/85 backdrop-blur" />
        <div className="absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_30%_25%,color-mix(in_oklab,var(--accent)_35%,transparent),transparent_60%)]" />
      </motion.div>
      <span className={cn("absolute font-display leading-none", size > 90 ? "text-5xl" : "text-2xl")}>{initial}</span>
    </div>
  );
}

/** Mic level bars; falls back to a gentle idle wave when no levels are available. */
export function Waveform({ levels, active }: { levels: number[]; active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-8 items-center gap-[3px]" aria-hidden>
      {levels.map((l, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-accent"
          animate={{ height: active ? Math.max(4, l * 32) : reduce ? 4 : [4, 8 + ((i * 7) % 10), 4] }}
          transition={
            active ? { duration: 0.08 } : { duration: 1.4, repeat: reduce ? 0 : Infinity, delay: i * 0.05 }
          }
          style={{ opacity: active ? 0.5 + l / 2 : 0.35 }}
        />
      ))}
    </div>
  );
}
