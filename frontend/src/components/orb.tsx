"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";

export type OrbMode = "idle" | "thinking" | "speaking" | "listening";

/**
 * The interviewer's presence: a lime token with their initial. Thinking = a dashed ring
 * orbits; speaking = it bounces with the words; listening = rings ripple out toward you.
 */
export function InterviewerOrb({ mode, initial, size = 120 }: { mode: OrbMode; initial: string; size?: number }) {
  const reduce = useReducedMotion();
  const body =
    reduce || mode === "idle"
      ? { scale: 1, y: 0 }
      : mode === "speaking"
        ? { scale: [1, 1.06, 0.98, 1.04, 1], y: [0, -2, 0, -1, 0] }
        : { scale: 1, y: 0 };

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
      {mode === "thinking" && !reduce && (
        <motion.svg
          viewBox="0 0 100 100"
          className="absolute -inset-[10%] size-[120%]"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        >
          <circle cx="50" cy="50" r="47" fill="none" stroke="var(--line)" strokeWidth="2.5" strokeDasharray="6 9" strokeLinecap="round" />
        </motion.svg>
      )}
      {mode === "listening" &&
        !reduce &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-line"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
          />
        ))}
      <motion.div
        className="relative grid size-full place-items-center rounded-full border-[2.5px] border-line bg-pop text-pop-ink shadow-[3px_3px_0_var(--shadow-color)]"
        animate={body}
        transition={
          mode === "speaking" && !reduce ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }
        }
      >
        <span className={cn("font-display leading-none font-extrabold", size > 90 ? "text-5xl" : "text-2xl")}>{initial}</span>
      </motion.div>
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
          className="w-[3px] rounded-full bg-ink"
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
