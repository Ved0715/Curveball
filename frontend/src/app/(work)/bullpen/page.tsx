"use client";

import { ArrowRight, Cable, FolderGit2, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Stamp } from "@/components/brand";
import { Sheet } from "@/components/sheet";
import { Skel } from "@/components/skeleton";
import { ErrorPanel } from "@/components/status";
import { Button, Field, inputClass, Segmented } from "@/components/ui";
import { ProgressBar } from "@/components/work/status";
import { DiamondGlyph } from "@/components/world-gate";
import { createWorkSession, listWorkSessions } from "@/lib/api";
import { WORK_BRAND } from "@/lib/brand";
import { friendlyError, toApiError, type ApiError } from "@/lib/errors";
import { cn, timeAgo } from "@/lib/format";
import { spring, stagger } from "@/lib/motion";
import type { WorkSession } from "@/lib/schemas";

type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; sessions: WorkSession[] };

function NewSession({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Sheet open={open} onClose={onClose} title="New session" description="One big task. Your agent breaks it down.">
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(undefined);
          try {
            const s = await createWorkSession({
              title: String(f.get("title") ?? ""),
              prompt: String(f.get("prompt") ?? ""),
              repo: String(f.get("repo") ?? ""),
            });
            router.push(`/bullpen/${s.id}`);
          } catch (err) {
            setError(friendlyError(err));
            setBusy(false);
          }
        }}
      >
        <Field label="What's the task?" htmlFor="ws-title">
          <input
            id="ws-title"
            name="title"
            required
            maxLength={200}
            data-autofocus
            className={inputClass}
            placeholder="e.g. Fix the flaky checkout tests"
          />
        </Field>
        <Field label="Details" hint="Optional: the full brief, as you'd tell a teammate" htmlFor="ws-prompt">
          <textarea id="ws-prompt" name="prompt" rows={5} maxLength={20000} className={cn(inputClass, "resize-y")} />
        </Field>
        <Field label="Repository" hint="Optional" htmlFor="ws-repo">
          <input id="ws-repo" name="repo" maxLength={300} className={cn(inputClass, "font-mono text-sm")} placeholder="acme/checkout" />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={busy}>
          Create session <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>
    </Sheet>
  );
}

function SessionRow({ s }: { s: WorkSession }) {
  const p = s.progress;
  return (
    <Link
      href={`/bullpen/${s.id}`}
      className="group sheet block rounded-2xl p-5 transition-transform hover:-translate-y-0.5 active:translate-y-0 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-title decoration-pop decoration-4 underline-offset-8 group-hover:underline">{s.title}</h2>
            {s.status === "resolved" && <Stamp className="text-xs">Shipped</Stamp>}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {s.repo && (
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                <FolderGit2 className="size-3.5" aria-hidden />
                {s.repo}
              </span>
            )}
            <span>updated {timeAgo(s.updated_at)}</span>
          </p>
        </div>
        <ArrowRight className="mt-2 size-5 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-pop" aria-hidden />
      </div>
      {p && (
        <div className="mt-5">
          <ProgressBar done={p.done} active={p.in_progress} stuck={p.decision_needed + p.blocked} total={p.leaves} />
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
            <span>
              <b className="text-ink">{p.done}</b>/{p.leaves} leaves resolved
            </span>
            {p.in_progress > 0 && <span className="text-sky">{p.in_progress} in progress</span>}
            {p.decision_needed > 0 && <span className="text-pink">{p.decision_needed} need you</span>}
            {p.blocked > 0 && <span className="text-bad">{p.blocked} blocked</span>}
          </p>
        </div>
      )}
    </Link>
  );
}

function FirstRun({ onNew }: { onNew: () => void }) {
  const steps = [
    { n: "01", t: "Connect your agent", b: "Make a token, paste one line into Claude Code, Cursor or any MCP client." },
    { n: "02", t: "Hand it the big task", b: "“Use Bullpen to plan and fix the flaky checkout tests.” It breaks the work into a tree." },
    { n: "03", t: "Watch it fill in", b: "Leaves go from open to done live. Anything that needs you lights up pink." },
  ];
  return (
    <div className="sheet rounded-3xl p-6 sm:p-10">
      <DiamondGlyph size={48} />
      <h2 className="mt-5 text-display">Nothing on the board yet</h2>
      <ol className="mt-8 grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="rule pt-4">
            <span className="font-mono text-sm text-accent">{s.n}</span>
            <p className="mt-1 text-headline">{s.t}</p>
            <p className="mt-1 text-sm text-muted">{s.b}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/bullpen/connect" className="press neo-sm inline-flex h-12 items-center gap-2 rounded-xl bg-pop px-5 font-bold text-pop-ink">
          <Cable className="size-4" aria-hidden /> Connect an agent
        </Link>
        <Button variant="ghost" size="lg" className="h-12" onClick={onNew}>
          <Plus className="size-4" aria-hidden /> Start one by hand
        </Button>
      </div>
    </div>
  );
}

export default function BullpenHome() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [view, setView] = useState<"Active" | "Archived">("Active");
  const [creating, setCreating] = useState(false);

  const fetchSessions = useCallback(
    () =>
      listWorkSessions(view === "Archived")
        .then((all) => setLoad({ status: "ready", sessions: view === "Archived" ? all.filter((s) => s.status === "archived") : all }))
        .catch((err: unknown) => setLoad({ status: "error", error: toApiError(err) })),
    [view],
  );
  useEffect(() => {
    void fetchSessions();
    // Sessions change while agents work: refresh quietly while the page is visible.
    const t = setInterval(() => document.visibilityState === "visible" && void fetchSessions(), 8000);
    return () => clearInterval(t);
  }, [fetchSessions]);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-12">
      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-label text-muted">{WORK_BRAND} · night shift</p>
          <h1 className="mt-3 text-hero">
            Ship it,
            <br />
            <span className="text-pop">one leaf</span> at a time
          </h1>
        </div>
        <Button size="lg" className="shrink-0" onClick={() => setCreating(true)}>
          <Plus className="size-5" aria-hidden /> New session
        </Button>
      </header>

      <div className="mb-6 w-60">
        <Segmented label="Show" hideLabel options={["Active", "Archived"] as const} value={view} onChange={setView} />
      </div>

      {load.status === "loading" ? (
        <div className="grid gap-4" aria-busy>
          <Skel className="h-32 rounded-2xl" />
          <Skel className="h-32 rounded-2xl" />
        </div>
      ) : load.status === "error" ? (
        <ErrorPanel message={friendlyError(load.error)} onRetry={() => void fetchSessions()} />
      ) : load.sessions.length === 0 ? (
        view === "Active" ? (
          <FirstRun onNew={() => setCreating(true)} />
        ) : (
          <p className="text-muted">Nothing archived.</p>
        )
      ) : (
        <motion.ul className="grid gap-4" variants={stagger(0.05)} initial="hidden" animate="show">
          <AnimatePresence initial={false}>
            {load.sessions.map((s) => (
              <motion.li
                key={s.id}
                layout
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                exit={{ opacity: 0 }}
                transition={spring.gentle}
                className={cn(s.status === "archived" && "opacity-70")}
              >
                <SessionRow s={s} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <NewSession open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
