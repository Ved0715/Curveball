"use client";

import { useReducedMotion as useMotionPreference, type Transition, type Variants } from "motion/react";
import { useSyncExternalStore } from "react";

/* ---------- Motion tokens: one rhythm for the whole product ----------
   Rules: animate transform/opacity only; enter with ease-out, exit ~65% faster;
   springs for anything the user moves or triggers; celebrations are the only bouncy thing. */

export const ease = {
  out: [0.16, 1, 0.3, 1] as const, // entering, expanding
  in: [0.7, 0, 0.84, 0] as const, // leaving
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const duration = { fast: 0.15, base: 0.24, slow: 0.4 };

export const spring = {
  /** Buttons and toggles: quick and firm. */
  press: { type: "spring", stiffness: 700, damping: 32, mass: 0.6 } satisfies Transition,
  /** Indicators and tabs sliding between positions. */
  snappy: { type: "spring", stiffness: 520, damping: 40 } satisfies Transition,
  /** Panels, sheets, cards settling into place. */
  gentle: { type: "spring", stiffness: 260, damping: 30 } satisfies Transition,
  /** Celebrations and the ball. Use sparingly. */
  bouncy: { type: "spring", stiffness: 420, damping: 14 } satisfies Transition,
};

/** Content entering a page or a container. */
export const enter: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } },
  exit: { opacity: 0, y: -6, transition: { duration: duration.fast, ease: ease.in } },
};

/** Parent that staggers its children (30–50ms per item). */
export const stagger = (step = 0.04, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

const noop = () => () => {};

/**
 * The user's reduced-motion preference, but only after hydration. The server can't know
 * the preference, so the first client render must match it (reporting "no preference");
 * React then re-renders with the real value. Using motion's hook directly causes
 * hydration mismatches for people who turned reduced motion on.
 */
export function useReducedMotion(): boolean {
  const pref = useMotionPreference();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return hydrated && !!pref;
}
