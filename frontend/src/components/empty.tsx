"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { ease, spring, useReducedMotion } from "@/lib/motion";

/** The ball resting at the end of a dotted trail: "nothing here yet, but it's on its way". */
function RestingBall() {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 160 70" className="h-16 w-36" aria-hidden>
      <motion.path
        d="M6 52 C 40 52, 52 16, 80 16 S 118 52, 150 52"
        fill="none"
        stroke="var(--line-soft)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="2 7"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: ease.out }}
      />
      <line x1="118" y1="63" x2="154" y2="63" stroke="var(--line)" strokeWidth="2.5" strokeLinecap="round" />
      <motion.g
        initial={reduce ? false : { x: -60, y: -30, rotate: -180 }}
        animate={{ x: 0, y: 0, rotate: 0 }}
        transition={{ ...spring.bouncy, delay: 0.25 }}
      >
        <svg x="124" y="37" width="26" height="26" viewBox="0 0 40 40" overflow="visible">
          <circle cx="20" cy="20" r="17" fill="var(--pop)" stroke="var(--line)" strokeWidth="2.6" />
          <path d="M8.5 9.5c6 4 7.5 13 3.6 20.6" fill="none" stroke="var(--pop-ink)" strokeWidth="2.3" strokeLinecap="round" />
          <path d="M31.5 9c-4.8 5.6-4.4 15.2 1.1 21.7" fill="none" stroke="var(--pop-ink)" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      </motion.g>
    </svg>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-2", className)}>
      <RestingBall />
      <div>
        <p className="text-headline">{title}</p>
        {body && <p className="mt-1 max-w-md text-muted">{body}</p>}
      </div>
      {action}
    </div>
  );
}
