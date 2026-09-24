"use client";

import { useReducedMotion as useMotionPreference } from "motion/react";
import { useSyncExternalStore } from "react";

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
