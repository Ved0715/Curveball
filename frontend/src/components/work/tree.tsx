"use client";

import { ChevronRight, Link2, MessageSquare } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { cn } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { WorkNode, WorkStatus } from "@/lib/schemas";
import { RESOLVED, StatusMark } from "./status";

export type Filter = "all" | "needs_you" | "in_progress" | "blocked" | "open" | "resolved";

export const FILTERS: { id: Filter; label: string; match: (s: WorkStatus) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "needs_you", label: "Needs you", match: (s) => s === "decision_needed" },
  { id: "in_progress", label: "In progress", match: (s) => s === "in_progress" || s === "partial" },
  { id: "blocked", label: "Blocked", match: (s) => s === "blocked" },
  { id: "open", label: "Open", match: (s) => s === "open" },
  { id: "resolved", label: "Resolved", match: (s) => RESOLVED.has(s) },
];

type Index = {
  kids: Map<string | null, WorkNode[]>;
  leafCount: Map<string, { done: number; total: number }>;
  byId: Map<string, WorkNode>;
};

export function indexTree(nodes: WorkNode[]): Index {
  const kids = new Map<string | null, WorkNode[]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position);
  const leafCount = new Map<string, { done: number; total: number }>();
  const count = (n: WorkNode): { done: number; total: number } => {
    const children = kids.get(n.id) ?? [];
    const c = children.length
      ? children.map(count).reduce((a, b) => ({ done: a.done + b.done, total: a.total + b.total }), { done: 0, total: 0 })
      : { done: RESOLVED.has(n.status) ? 1 : 0, total: 1 };
    leafCount.set(n.id, c);
    return c;
  };
  for (const r of kids.get(null) ?? []) count(r);
  return { kids, leafCount, byId };
}

/** The tree: nested, collapsible, with guide lines. Rows flash when an agent touches them. */
export function TreeView({
  nodes,
  selected,
  onSelect,
  collapsed,
  onToggle,
  filter,
  changed,
}: {
  nodes: WorkNode[];
  selected: string | null;
  onSelect: (id: string) => void;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  filter: Filter;
  changed: ReadonlySet<string>;
}) {
  const idx = useMemo(() => indexTree(nodes), [nodes]);

  // A branch stays bright if anything under it matches, so the structure keeps its meaning.
  const lit = useMemo(() => {
    const match = FILTERS.find((f) => f.id === filter)?.match ?? (() => true);
    const out = new Set<string>();
    const visit = (n: WorkNode): boolean => {
      const kidsLit = (idx.kids.get(n.id) ?? []).map(visit).some(Boolean);
      const on = filter === "all" || match(n.status) || kidsLit;
      if (on) out.add(n.id);
      return on;
    };
    (idx.kids.get(null) ?? []).forEach(visit);
    return out;
  }, [idx, filter]);

  const render = (n: WorkNode): React.ReactNode => {
    const children = idx.kids.get(n.id) ?? [];
    const isOpen = !collapsed.has(n.id);
    const count = idx.leafCount.get(n.id);
    return (
      <li key={n.id}>
        <Row
          node={n}
          hasKids={children.length > 0}
          open={isOpen}
          count={children.length ? count : undefined}
          selected={selected === n.id}
          dim={!lit.has(n.id)}
          flash={changed.has(n.id)}
          onSelect={() => onSelect(n.id)}
          onToggle={() => onToggle(n.id)}
        />
        <AnimatePresence initial={false}>
          {children.length > 0 && isOpen && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
              transition={spring.gentle}
              className="ml-[15px] overflow-hidden border-l-2 border-line-soft pl-3"
            >
              {children.map(render)}
            </motion.ul>
          )}
        </AnimatePresence>
      </li>
    );
  };

  return <ul aria-label="Task tree">{(idx.kids.get(null) ?? []).map(render)}</ul>;
}

function Row({
  node: n,
  hasKids,
  open,
  count,
  selected,
  dim,
  flash,
  onSelect,
  onToggle,
}: {
  node: WorkNode;
  hasKids: boolean;
  open: boolean;
  count?: { done: number; total: number };
  selected: boolean;
  dim: boolean;
  flash: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const resolved = RESOLVED.has(n.status);
  return (
    <motion.div
      layout="position"
      animate={flash ? { backgroundColor: ["rgba(200,242,60,0.28)", "rgba(200,242,60,0)"] } : undefined}
      transition={{ duration: 1.6, ease: "easeOut" }}
      className={cn(
        "group relative my-0.5 flex items-center gap-1 rounded-xl pr-2 transition-opacity",
        selected && "bg-surface-strong",
        dim && "opacity-35",
      )}
    >
      {selected && <motion.span layoutId="tree-sel" className="absolute top-2 bottom-2 -left-1 w-1 rounded-full bg-pop" />}
      {hasKids ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${n.title}`}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
        </button>
      ) : (
        <span className="size-8 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
      >
        <StatusMark status={n.status} />
        <span
          className={cn(
            "line-clamp-2 min-w-0 flex-1 break-words",
            hasKids ? "font-display font-bold" : "font-medium",
            n.depth === 0 && "text-lg",
            resolved && !hasKids && "text-muted line-through decoration-muted/60",
          )}
        >
          {n.title}
        </span>
        {n.owner && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-sky/50 px-2 py-0.5 font-mono text-[0.7rem] text-sky sm:inline-flex">
            <span className="size-1.5 animate-pulse rounded-full bg-sky" aria-hidden />
            {n.owner}
          </span>
        )}
        {n.depends_on.length > 0 && !resolved && (
          <span className="hidden shrink-0 items-center gap-1 font-mono text-[0.7rem] text-muted sm:inline-flex" title="Waits on other leaves">
            <Link2 className="size-3" aria-hidden />
            {n.depends_on.length}
          </span>
        )}
        {n.notes.length > 0 && (
          <span className="hidden shrink-0 items-center gap-1 font-mono text-[0.7rem] text-muted md:inline-flex">
            <MessageSquare className="size-3" aria-hidden />
            {n.notes.length}
          </span>
        )}
        {count && (
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-muted">
            <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-line-soft sm:block" aria-hidden>
              <span className="block h-full bg-pop" style={{ width: `${(count.done / count.total) * 100}%` }} />
            </span>
            {count.done}/{count.total}
          </span>
        )}
      </button>
    </motion.div>
  );
}
