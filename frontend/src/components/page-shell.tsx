"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { Aurora } from "./aurora";
import { Eyebrow } from "./ui";

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative">
      <Aurora intensity={0.55} />
      <div className={cn("mx-auto px-4 pt-10 pb-24 sm:px-6 sm:pt-14", wide ? "max-w-6xl" : "max-w-4xl")}>
        {children}
      </div>
    </div>
  );
}

export function PageTitle({
  step,
  title,
  lede,
  children,
}: {
  step?: string;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {step && <Eyebrow>{step}</Eyebrow>}
        <h1 className="mt-3 font-display text-[clamp(2.6rem,6vw,4.2rem)] leading-[1] tracking-[-0.02em]">{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-muted">{lede}</p>}
      </div>
      {children}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <PageShell>
      <div className="animate-pulse space-y-4" aria-busy aria-label="Loading">
        <div className="h-4 w-32 rounded bg-surface-strong" />
        <div className="h-14 w-2/3 rounded-2xl bg-surface-strong" />
        <div className="h-72 rounded-3xl bg-surface" />
      </div>
    </PageShell>
  );
}
