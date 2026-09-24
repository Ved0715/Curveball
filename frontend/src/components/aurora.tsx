"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect } from "react";
import { useReducedMotion } from "@/lib/motion";

/** Slow drifting colour blobs, a faint grid and a soft spotlight that follows the cursor. */
export function Aurora({ intensity = 1 }: { intensity?: number }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(-1000);
  const my = useMotionValue(-1000);
  const x = useSpring(mx, { stiffness: 80, damping: 20 });
  const y = useSpring(my, { stiffness: 80, damping: 20 });

  useEffect(() => {
    if (reduce) return;
    const move = (e: PointerEvent) => {
      mx.set(e.clientX - 300);
      my.set(e.clientY - 300);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [mx, my, reduce]);

  const blob = "absolute rounded-full blur-[110px] mix-blend-normal dark:mix-blend-screen";
  const drift = (dx: number, dy: number, d: number) =>
    reduce ? {} : { animate: { x: [0, dx, 0], y: [0, dy, 0] }, transition: { duration: d, repeat: Infinity, ease: "easeInOut" as const } };

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="grid-lines absolute inset-0 opacity-60" />
      <div style={{ opacity: 0.55 * intensity }} className="absolute inset-0">
        <motion.div
          {...drift(80, 40, 22)}
          className={`${blob} -top-40 left-[8%] size-[520px] bg-accent/40`}
        />
        <motion.div
          {...drift(-60, 70, 26)}
          className={`${blob} top-[-10%] right-[5%] size-[460px] bg-accent-2/30`}
        />
        <motion.div
          {...drift(40, -50, 30)}
          className={`${blob} top-[35%] left-[35%] size-[560px] bg-accent-3/25`}
        />
      </div>
      {!reduce && (
        <motion.div
          style={{ x, y }}
          className="absolute size-[600px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_18%,transparent)_0%,transparent_60%)]"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}
