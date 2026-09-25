"use client";

import { Braces, Cpu, Layers, Network, Siren, Sparkle, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { track, trackColor } from "@/lib/brand";
import { cn } from "@/lib/format";
import { ease, spring, useReducedMotion } from "@/lib/motion";

/* ---------- The ball: the product's character ---------- */

export function Ball({
  size = 24,
  state = "rest",
  className,
}: {
  size?: number;
  state?: "rest" | "bounce" | "spin";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const animate =
    reduce || state === "rest"
      ? undefined
      : state === "bounce"
        ? { y: [0, -size * 0.45, 0], scaleY: [1, 1.04, 0.92, 1] }
        : { rotate: 360 };
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className={cn("shrink-0 overflow-visible", className)}
      animate={animate}
      transition={
        state === "spin"
          ? { duration: 1.4, repeat: Infinity, ease: "linear" }
          : { duration: 0.7, repeat: Infinity, ease: ease.inOut }
      }
      style={{ originY: 1 }}
    >
      <circle cx="20" cy="20" r="17" fill="var(--pop)" stroke="var(--line)" strokeWidth="2.6" />
      <path d="M8.5 9.5c6 4 7.5 13 3.6 20.6" fill="none" stroke="var(--pop-ink)" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M31.5 9c-4.8 5.6-4.4 15.2 1.1 21.7" fill="none" stroke="var(--pop-ink)" strokeWidth="2.3" strokeLinecap="round" />
    </motion.svg>
  );
}

/** Loading signature: the ball bouncing along a curve, with a squashing shadow. */
export function BallLoader({ label, className }: { label?: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative h-20 w-28" aria-hidden>
        <svg viewBox="0 0 112 80" className="absolute inset-0">
          <motion.path
            d="M6 70 C 34 70, 40 22, 60 22 S 90 58, 106 58"
            fill="none"
            stroke="var(--line)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="3 6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: ease.out }}
          />
        </svg>
        <motion.span
          className="absolute bottom-1 left-1/2 h-1.5 w-7 -translate-x-1/2 rounded-full bg-ink/15"
          animate={reduce ? undefined : { scaleX: [1, 0.55, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: ease.inOut }}
        />
        <motion.div
          className="absolute bottom-2 left-1/2 -translate-x-1/2"
          animate={reduce ? undefined : { y: [0, -34, 0], rotate: [0, 180, 360] }}
          transition={{ duration: 0.7, repeat: Infinity, ease: ease.inOut }}
        >
          <Ball size={26} />
        </motion.div>
      </div>
      {label && <p className="text-sm font-semibold text-muted">{label}</p>}
    </div>
  );
}

/* ---------- The curve: an ink underline that draws itself ---------- */

export function CurveUnderline({ children, delay = 0.35, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <span className={cn("relative inline-block", className)}>
      <span className="relative z-10">{children}</span>
      <svg
        viewBox="0 0 300 24"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute -bottom-[0.12em] left-0 z-0 h-[0.42em] w-full overflow-visible"
      >
        <motion.path
          d="M4 16 C 60 4, 120 22, 170 12 S 262 6, 296 14"
          fill="none"
          stroke="var(--pop)"
          strokeWidth="11"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay, ease: ease.out }}
        />
      </svg>
    </span>
  );
}

/* ---------- Tracks: SVG glyph + label (never emoji, never colour alone) ---------- */

const GLYPHS: Record<string, LucideIcon> = {
  dsa: Braces,
  "system-design": Network,
  "lang-depth": Cpu,
  fundamentals: Layers,
  "real-world": Siren,
  custom: Sparkle,
};

export function TrackGlyph({ id, size = 16, className }: { id: string; size?: number; className?: string }) {
  const Icon = GLYPHS[id] ?? Sparkle;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-[7px] border-2 border-line text-white", className)}
      style={{ background: trackColor(id), width: size + 12, height: size + 12 }}
      aria-hidden
    >
      <Icon style={{ width: size, height: size }} strokeWidth={2.2} />
    </span>
  );
}

export function TrackTag({ id, className, size = 14 }: { id: string; className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-label text-ink", className)}>
      <TrackGlyph id={id} size={size} />
      {track(id).short}
    </span>
  );
}

/* ---------- A small stamp for completed things ---------- */

export function Stamp({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={reduce ? false : { scale: 2.2, rotate: -18, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={spring.bouncy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border-[3px] border-good px-3 py-1 font-mono text-sm font-bold tracking-widest text-good uppercase",
        className,
      )}
      style={style}
    >
      {children}
    </motion.span>
  );
}
