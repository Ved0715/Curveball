"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { spring, useReducedMotion } from "@/lib/motion";
import { Ball } from "./brand";

/** Full-page "the ball rolled off" state, shared by the error and not-found screens. */
export function Oops({
  code,
  title,
  body,
  action,
}: {
  code: string;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-start justify-center px-4 py-16 sm:px-6">
      <div className="relative mb-8 h-24 w-56" aria-hidden>
        <svg viewBox="0 0 224 96" className="absolute inset-0 overflow-visible">
          <path d="M4 40 C 60 40, 90 40, 120 40" fill="none" stroke="var(--line)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M120 40 C 136 40, 140 88, 170 90" fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="3 6" strokeLinecap="round" />
        </svg>
        <motion.div
          className="absolute"
          initial={reduce ? { x: 150, y: 58 } : { x: 20, y: 12, rotate: 0 }}
          animate={{ x: 150, y: 58, rotate: 200 }}
          transition={{ ...spring.gentle, delay: 0.2 }}
        >
          <Ball size={30} />
        </motion.div>
      </div>
      <p className="text-label text-muted">{code}</p>
      <h1 className="mt-2 text-display">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      {action && <div className="mt-8 flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}

export const primaryLink = "press neo-sm inline-flex h-11 items-center gap-2 rounded-xl bg-pop px-4 font-bold text-pop-ink";
export const ghostLink = "press neo-sm inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 font-semibold";

export function ErrorScreen({ error, retry, home }: { error: Error & { digest?: string }; retry: () => void; home: string }) {
  return (
    <Oops
      code={error.digest ? `Error · ${error.digest}` : "Error"}
      title="That one got away"
      body="Something broke on our side while loading this page. Your streak and notes are safe."
      action={
        <>
          <button type="button" onClick={() => retry()} className={primaryLink}>
            <RotateCcw className="size-4" aria-hidden /> Try again
          </button>
          <Link href={home} className={ghostLink}>
            Go home
          </Link>
        </>
      }
    />
  );
}
