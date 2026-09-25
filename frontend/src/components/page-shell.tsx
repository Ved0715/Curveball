"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { PageSkeletonBlock } from "./skeleton";
import { Eyebrow } from "./ui";

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("mx-auto px-4 pt-8 pb-12 sm:px-6 lg:pt-12", wide ? "max-w-6xl" : "max-w-4xl")}>
      {children}
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
        <h1 className="mt-3 text-display">{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-muted">{lede}</p>}
      </div>
      {children}
    </div>
  );
}

export function PageSkeleton() {
  return <PageSkeletonBlock />;
}
