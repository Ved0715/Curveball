"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useRadialReveal, useWorldRevealed } from "@/components/world-gate";
import { enter } from "@/lib/motion";

/** Same page behaviour as Learn: rise in, focus the heading, build outward from the door on
 * arrival. Holds until a world reveal opens. */
export default function WorkTemplate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const revealed = useWorldRevealed();
  useRadialReveal(ref);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const t = setTimeout(() => {
      const h1 = ref.current?.querySelector("h1");
      if (h1 && !ref.current?.contains(document.activeElement)) {
        h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
      }
    }, 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.div ref={ref} variants={enter} initial="hidden" animate={revealed ? "show" : "hidden"}>
      {children}
    </motion.div>
  );
}
