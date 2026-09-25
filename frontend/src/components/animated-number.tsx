"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/format";
import { spring, useReducedMotion } from "@/lib/motion";

const DIGITS = "0123456789".split("");

/** One rolling digit column (0–9 stacked, translated to the current digit). */
function Digit({ d }: { d: number }) {
  const reduce = useReducedMotion();
  return (
    // overflow-clip (not hidden) plus an invisible in-flow "0" keeps the digit on the text baseline.
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-clip text-center leading-none">
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-d * 10}%` }}
        transition={reduce ? { duration: 0 } : spring.snappy}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block h-[1em] text-center leading-none">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Odometer-style number: each digit rolls into place when the value changes. */
export function AnimatedNumber({ value, className, suffix }: { value: number; className?: string; suffix?: string }) {
  const text = String(Math.max(0, Math.round(value)));
  return (
    <span className={cn("inline-flex items-baseline tabular-nums", className)}>
      <span className="sr-only">
        {text}
        {suffix}
      </span>
      <span aria-hidden className="inline-flex items-baseline">
        {text.split("").map((c, i) => (
          // Key from the right so units stay the units column as the number grows.
          <Digit key={text.length - i} d={Number(c)} />
        ))}
        {suffix && <span>{suffix}</span>}
      </span>
    </span>
  );
}
