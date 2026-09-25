"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { enter } from "@/lib/motion";

/**
 * Re-mounts on every navigation: each page rises in gently, and focus moves to the new
 * page's heading so screen readers announce where you are.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
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
    <motion.div ref={ref} variants={enter} initial="hidden" animate="show" className="[&_h1:focus]:outline-none">
      {children}
    </motion.div>
  );
}
