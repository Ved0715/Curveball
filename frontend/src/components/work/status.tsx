"use client";

import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleSlash,
  MessageCircleQuestion,
  OctagonAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/format";
import type { WorkStatus } from "@/lib/schemas";

/** One vocabulary for work status everywhere: label, colour and a shape (never colour alone). */
export const STATUS: Record<WorkStatus, { label: string; color: string; icon: LucideIcon }> = {
  open: { label: "Open", color: "var(--muted)", icon: Circle },
  in_progress: { label: "In progress", color: "var(--sky)", icon: CircleDot },
  partial: { label: "Partial", color: "var(--sun)", icon: CircleDashed },
  decision_needed: { label: "Needs you", color: "var(--pink)", icon: MessageCircleQuestion },
  blocked: { label: "Blocked", color: "var(--bad)", icon: OctagonAlert },
  done: { label: "Done", color: "var(--pop)", icon: CircleCheck },
  not_an_issue: { label: "Not an issue", color: "var(--muted)", icon: CircleSlash },
};

export const RESOLVED: ReadonlySet<WorkStatus> = new Set(["done", "not_an_issue"]);

export function StatusMark({ status, size = 16, className }: { status: WorkStatus; size?: number; className?: string }) {
  const s = STATUS[status];
  return (
    <s.icon
      className={cn("shrink-0", className)}
      style={{ color: s.color, width: size, height: size }}
      strokeWidth={2.4}
      aria-label={s.label}
    />
  );
}

export function StatusPill({ status }: { status: WorkStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold"
      style={{ borderColor: s.color, color: s.color }}
    >
      <s.icon className="size-3.5" strokeWidth={2.6} aria-hidden />
      {s.label}
    </span>
  );
}

/** Leaves done out of total, as a segmented bar: one segment per status group. */
export function ProgressBar({
  done,
  active,
  stuck,
  total,
  className,
}: {
  done: number;
  active: number;
  stuck: number;
  total: number;
  className?: string;
}) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div
      className={cn("flex h-2.5 w-full overflow-hidden rounded-full border-2 border-line bg-surface", className)}
      role="img"
      aria-label={`${done} of ${total} leaves resolved`}
    >
      <span className="h-full bg-pop transition-[width] duration-500" style={{ width: pct(done) }} />
      <span className="h-full bg-sky transition-[width] duration-500" style={{ width: pct(active) }} />
      <span className="h-full bg-pink transition-[width] duration-500" style={{ width: pct(stuck) }} />
    </div>
  );
}
