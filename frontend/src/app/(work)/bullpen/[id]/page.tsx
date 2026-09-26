"use client";

import { Archive, ArchiveRestore, ArrowLeft, FolderGit2, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Stamp } from "@/components/brand";
import { Confetti } from "@/components/confetti";
import { ConfirmDialog } from "@/components/dialog";
import { Sheet } from "@/components/sheet";
import { Skel } from "@/components/skeleton";
import { ErrorPanel } from "@/components/status";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";
import { useLiveSession, useWide } from "@/components/work/live";
import { ActivityFeed, AgentPrompt, Inspector, ReadyList } from "@/components/work/panels";
import { ProgressBar } from "@/components/work/status";
import { FILTERS, TreeView, type Filter } from "@/components/work/tree";
import { deleteWorkSession, patchWorkSession } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/format";
import { spring } from "@/lib/motion";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const wide = useWide();
  const { load, events, changed, shipped, refresh } = useLiveSession(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(
    (nid: string) =>
      setCollapsed((c) => {
        const next = new Set(c);
        if (next.has(nid)) next.delete(nid);
        else next.add(nid);
        return next;
      }),
    [],
  );

  if (load.status === "loading")
    return (
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6" aria-busy>
        <Skel className="h-6 w-40" />
        <Skel className="mt-4 h-14 w-2/3" />
        <div className="mt-10 grid gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skel key={i} className="h-11" />
          ))}
        </div>
      </div>
    );
  if (load.status === "error")
    return (
      <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
        <ErrorPanel message={friendlyError(load.error)} onRetry={() => void refresh()}>
          <Link href="/bullpen" className="press neo-sm inline-flex h-9 items-center rounded-xl bg-surface px-3.5 text-sm font-semibold">
            All sessions
          </Link>
        </ErrorPanel>
      </div>
    );

  const { tree } = load;
  const s = tree.session;
  const p = s.progress ?? { leaves: 0, done: 0, in_progress: 0, blocked: 0, decision_needed: 0, nodes: 0 };
  const node = selected ? tree.nodes.find((n) => n.id === selected) : undefined;
  const root = tree.nodes.find((n) => n.parent_id === null);
  const undecomposed = !!root && root.is_leaf;
  const counts: Record<Filter, number> = {
    all: 0,
    needs_you: p.decision_needed,
    in_progress: p.in_progress,
    blocked: p.blocked,
    open: tree.nodes.filter((n) => n.is_leaf && n.status === "open").length,
    resolved: p.done,
  };

  async function sessionAction(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    try {
      await action();
      after?.();
      await refresh();
    } catch (err) {
      toast({ title: "That didn't work", description: friendlyError(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const inspector = node ? (
    <Inspector
      key={node.id}
      node={node}
      tree={tree}
      onChanged={refresh}
      onSelect={setSelected}
      onClose={() => setSelected(null)}
    />
  ) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <Confetti fire={shipped > 0} key={shipped} />
      <Link href="/bullpen" className="group mb-5 inline-flex h-9 items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden /> All sessions
      </Link>

      <header className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-muted">
            {s.repo && (
              <span className="inline-flex items-center gap-1 normal-case">
                <FolderGit2 className="size-3.5" aria-hidden />
                <span className="font-mono">{s.repo}</span>
              </span>
            )}
            <span>{s.status}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <h1 className="text-display">{s.title}</h1>
            {s.status === "resolved" && <Stamp>Shipped</Stamp>}
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:w-80">
          <p className="flex items-baseline gap-2">
            <AnimatedNumber value={p.done} className="text-display leading-none" />
            <span className="font-mono text-sm text-muted">/ {p.leaves} leaves resolved</span>
          </p>
          <ProgressBar done={p.done} active={p.in_progress} stuck={p.decision_needed + p.blocked} total={p.leaves} />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void sessionAction(() => patchWorkSession(s.id, { status: s.status === "archived" ? "active" : "archived" }))
              }
            >
              {s.status === "archived" ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
              {s.status === "archived" ? "Unarchive" : "Archive"}
            </Button>
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </div>
        </div>
      </header>

      <div className="mb-4 flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filter the tree">
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.id)}
              className={cn(
                "relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
                on ? "text-pop-ink" : "text-muted hover:text-ink",
              )}
            >
              {on && (
                <motion.span layoutId="tree-filter" className="absolute inset-0 rounded-full border-2 border-line bg-pop" transition={spring.snappy} />
              )}
              <span className="relative">{f.label}</span>
              {f.id !== "all" && counts[f.id] > 0 && <span className="relative font-mono text-xs opacity-70">{counts[f.id]}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rule min-w-0 pt-3" aria-label="Tree">
          <TreeView
            nodes={tree.nodes}
            selected={selected}
            onSelect={setSelected}
            collapsed={collapsed}
            onToggle={toggle}
            filter={filter}
            changed={changed}
          />
        </section>

        <aside className="min-w-0">
          <div className="grid gap-8 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1">
            {wide && inspector ? (
              <div className="sheet rounded-2xl p-5">{inspector}</div>
            ) : (
              <>
                {undecomposed && <AgentPrompt tree={tree} />}
                <ReadyList tree={tree} onSelect={setSelected} />
                <ActivityFeed events={events} tree={tree} onSelect={setSelected} />
              </>
            )}
          </div>
        </aside>
      </div>

      {!wide && (
        <Sheet open={!!node} onClose={() => setSelected(null)} title="Task details">
          {node && (
            <Inspector key={node.id} node={node} tree={tree} onChanged={refresh} onSelect={setSelected} />
          )}
        </Sheet>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this session?"
        body={`The whole tree (${p.nodes} tasks) and its history go for good. Agents using it will get "not found".`}
        confirmLabel="Delete session"
        danger
        busy={busy}
        onConfirm={() => void sessionAction(() => deleteWorkSession(s.id), () => router.replace("/bullpen"))}
      />
    </div>
  );
}
