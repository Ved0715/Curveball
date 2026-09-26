"use client";

import { Check, Copy, CornerDownRight, ExternalLink, GraduationCap, Plus, Send, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Button, inputClass } from "@/components/ui";
import { addWorkNode, addWorkNote, deleteWorkNode, learnFromNode, patchWorkNode, setWorkStatus, type NodeFields } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { cn, timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { WorkEvent, WorkNode, WorkStatus, WorkTree } from "@/lib/schemas";
import { RESOLVED, STATUS, StatusMark, StatusPill } from "./status";

/* ---------- Inspector: one node, editable ---------- */

const NEEDS_REASON: ReadonlySet<WorkStatus> = new Set(["not_an_issue", "decision_needed", "blocked"]);
const LEAF_STATUSES: WorkStatus[] = ["open", "in_progress", "decision_needed", "blocked", "done", "not_an_issue"];

function AutoField({
  id,
  label,
  value,
  rows = 3,
  mono = false,
  placeholder,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  rows?: number;
  mono?: boolean;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const [prev, setPrev] = useState(value);
  // Adopt server changes (an agent edited it) unless the person is mid-edit.
  if (value !== prev) {
    setPrev(value);
    setDraft(value);
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-label text-muted">
          {label}
        </label>
        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-good"
            >
              <Check className="size-3.5" strokeWidth={3} aria-hidden /> Saved
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <textarea
        id={id}
        rows={rows}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          if (draft === value) return;
          await onSave(draft);
          setSaved(true);
          setTimeout(() => setSaved(false), 1400);
        }}
        className={cn(inputClass, "resize-y py-2.5 text-sm leading-relaxed", mono && "font-mono text-[0.8rem]")}
      />
    </div>
  );
}

/** Render with `key={node.id}` so local state (reason prompt, drafts) resets per node. */
export function Inspector({
  node,
  tree,
  onChanged,
  onSelect,
  onClose,
}: {
  node: WorkNode;
  tree: WorkTree;
  onChanged: () => Promise<unknown>;
  onSelect: (id: string) => void;
  onClose?: () => void;
}) {
  const toast = useToast();
  const [reasonFor, setReasonFor] = useState<WorkStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [note, setNote] = useState("");
  const solutionRef = useRef<HTMLDivElement>(null);
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const kids = tree.nodes.filter((n) => n.parent_id === node.id);
  const resolved = RESOLVED.has(node.status);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      await onChanged();
      if (success) toast({ title: success, tone: "success" });
      return true;
    } catch (err) {
      toast({ title: "That didn't work", description: friendlyError(err), tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = (fields: NodeFields) => run(() => patchWorkNode(node.id, fields)).then(() => undefined);
  const list = (v: string) =>
    v
      .split(/\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);

  async function changeStatus(status: WorkStatus) {
    if (status === node.status) return;
    if (status === "done" && node.solution_description.trim().length < 20) {
      toast({ title: "Say what changed first", description: "Write the solution below, then mark it done." });
      solutionRef.current?.querySelector("textarea")?.focus();
      return;
    }
    if (NEEDS_REASON.has(status)) {
      setReasonFor(status);
      return;
    }
    await run(() => setWorkStatus(node.id, status));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <StatusPill status={node.status} />
          <span className="text-label text-muted">{node.is_leaf ? "Leaf" : `Branch · ${kids.length} children`}</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="-m-1 grid size-9 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div>
        <label htmlFor={`title-${node.id}`} className="sr-only">
          Title
        </label>
        <textarea
          key={node.id + node.title}
          id={`title-${node.id}`}
          defaultValue={node.title}
          maxLength={200}
          rows={1}
          onBlur={(e) => {
            const v = e.target.value.replace(/\s+/g, " ").trim();
            if (v && v !== node.title) void save({ title: v });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="field-sizing-content w-full resize-none rounded-lg bg-transparent font-display text-2xl leading-tight font-extrabold outline-none focus:bg-surface focus:px-2"
        />
        {node.owner && (
          <p className="mt-2 inline-flex items-center gap-2 text-sm text-sky">
            <span className="size-2 animate-pulse rounded-full bg-sky" aria-hidden />
            <span className="font-mono">{node.owner}</span> is on it · {timeAgo(node.claimed_at)}
          </p>
        )}
      </div>

      {/* Status */}
      {node.is_leaf ? (
        <fieldset>
          <legend className="mb-2 text-label text-muted">Status</legend>
          <div className="flex flex-wrap gap-1.5">
            {LEAF_STATUSES.map((st) => {
              const on = node.status === st || (st === "in_progress" && node.status === "partial");
              const S = STATUS[st];
              return (
                <button
                  key={st}
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  onClick={() => void changeStatus(st)}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-2 px-2.5 text-xs font-bold transition disabled:opacity-50",
                    on ? "text-bg" : "border-line-soft text-muted hover:border-line hover:text-ink",
                  )}
                  style={on ? { background: S.color, borderColor: S.color } : undefined}
                >
                  <S.icon className="size-3.5" strokeWidth={2.6} aria-hidden />
                  {S.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-line-soft p-4 text-sm text-muted">
          A branch&apos;s status follows its {kids.length} children.{" "}
          {!resolved && (
            <button
              type="button"
              className="link cursor-pointer font-semibold text-ink"
              onClick={() => setReasonFor("not_an_issue")}
            >
              Close the whole branch as not an issue
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {reasonFor && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.gentle}
            className="overflow-hidden"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => setWorkStatus(node.id, reasonFor, reason));
              if (ok) setReasonFor(null);
            }}
          >
            <label htmlFor={`reason-${node.id}`} className="mb-1.5 block text-sm font-semibold">
              {reasonFor === "not_an_issue"
                ? "Why isn't this an issue?"
                : reasonFor === "decision_needed"
                  ? "What needs deciding?"
                  : "What's it blocked on?"}
            </label>
            <div className="flex gap-2">
              <input
                id={`reason-${node.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required={reasonFor === "not_an_issue"}
                minLength={reasonFor === "not_an_issue" ? 5 : 0}
                maxLength={1000}
                autoFocus
                className={cn(inputClass, "py-2 text-sm")}
              />
              <Button type="submit" size="sm" className="h-auto" loading={busy}>
                Save
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* The fields that make a leaf shippable */}
      <div className="grid gap-4">
        <AutoField
          id={`ps-${node.id}`}
          label="Problem"
          value={node.problem_statement}
          placeholder="What's wrong, from the user's point of view"
          onSave={(v) => save({ problem_statement: v })}
        />
        <AutoField
          id={`rc-${node.id}`}
          label="Root cause"
          value={node.root_cause}
          placeholder="Why it happens, technically"
          onSave={(v) => save({ root_cause: v })}
        />
        <AutoField
          id={`cd-${node.id}`}
          label="Where in the code"
          value={node.code_description}
          rows={2}
          onSave={(v) => save({ code_description: v })}
        />
        <div ref={solutionRef}>
          <AutoField
            id={`sd-${node.id}`}
            label="Solution"
            value={node.solution_description}
            rows={4}
            placeholder="What changed and why. Needed before it can be marked done."
            onSave={(v) => save({ solution_description: v })}
          />
        </div>
        {node.is_leaf && (
          <AutoField
            id={`fl-${node.id}`}
            label="Files"
            value={node.files.join("\n")}
            rows={2}
            mono
            placeholder="One per line"
            onSave={(v) => save({ files: list(v) })}
          />
        )}
        <AutoField
          id={`ac-${node.id}`}
          label="Done means"
          value={node.acceptance_criteria.join("\n")}
          rows={2}
          placeholder="One check per line"
          onSave={(v) => save({ acceptance_criteria: v.split("\n").map((x) => x.trim()).filter(Boolean) })}
        />
      </div>

      {node.depends_on.length > 0 && (
        <section>
          <h3 className="mb-2 text-label text-muted">Waits on</h3>
          <ul className="grid gap-1">
            {node.depends_on.map((d) => {
              const dep = byId.get(d);
              return dep ? (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => onSelect(d)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface"
                  >
                    <StatusMark status={dep.status} size={14} />
                    <span className="truncate">{dep.title}</span>
                  </button>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}

      {Object.keys(node.artifacts).length > 0 && (
        <section>
          <h3 className="mb-2 text-label text-muted">Shipped as</h3>
          <ul className="grid gap-1 text-sm">
            {Object.entries(node.artifacts).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2">
                <span className="w-14 shrink-0 font-mono text-xs text-muted uppercase">{k}</span>
                {/^https?:\/\//.test(v) ? (
                  <a href={v} target="_blank" rel="noreferrer noopener" className="link inline-flex min-w-0 items-center gap-1 truncate text-accent">
                    <span className="truncate">{v.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <code className="truncate font-mono text-xs">{v}</code>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Notes: progress, findings, memory that survives a session restart */}
      <section>
        <h3 className="mb-2 text-label text-muted">Notes</h3>
        {node.notes.length > 0 && (
          <ol className="mb-3 grid gap-2">
            {[...node.notes].reverse().map((n, i) => (
              <li key={`${n.at}-${i}`} className="rounded-xl border-2 border-line-soft p-3 text-sm">
                <p className="mb-1 font-mono text-[0.7rem] text-muted">
                  {n.actor} · {timeAgo(n.at)}
                </p>
                <p className="whitespace-pre-wrap">{n.text}</p>
              </li>
            ))}
          </ol>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!note.trim()) return;
            if (await run(() => addWorkNote(node.id, note))) setNote("");
          }}
        >
          <label htmlFor={`note-${node.id}`} className="sr-only">
            Add a note
          </label>
          <input
            id={`note-${node.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Add a note for whoever picks this up"
            className={cn(inputClass, "py-2 text-sm")}
          />
          <Button type="submit" variant="ghost" size="sm" className="h-auto" aria-label="Add note" disabled={!note.trim()}>
            <Send className="size-4" aria-hidden />
          </Button>
        </form>
      </section>

      {/* Tree shape */}
      {!resolved && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const title = childTitle.trim();
            if (!title) return;
            if (await run(() => addWorkNode(tree.session.id, { parent_id: node.id, title }))) setChildTitle("");
          }}
        >
          <label htmlFor={`child-${node.id}`} className="sr-only">
            Add a child task
          </label>
          <div className="relative flex-1">
            <CornerDownRight className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id={`child-${node.id}`}
              value={childTitle}
              onChange={(e) => setChildTitle(e.target.value)}
              maxLength={200}
              placeholder={node.is_leaf ? "Split it: add a smaller task" : "Add a task under this"}
              className={cn(inputClass, "py-2 pl-9 text-sm")}
            />
          </div>
          <Button type="submit" variant="ghost" size="sm" className="h-auto" aria-label="Add child task" disabled={!childTitle.trim()}>
            <Plus className="size-4" aria-hidden />
          </Button>
        </form>
      )}

      <div className="rule-soft flex flex-wrap gap-2 pt-4">
        {node.is_leaf && resolved && (
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            onClick={() =>
              void run(async () => {
                const t = await learnFromNode(node.id);
                toast({ title: "Queued in Learn", description: t.title, tone: "success" });
              })
            }
          >
            <GraduationCap className="size-4" aria-hidden /> Learn the concept behind this
          </Button>
        )}
        {node.parent_id && (
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={kids.length ? "Delete this branch?" : "Delete this task?"}
        body={kids.length ? `This removes it and everything under it (${kids.length} children).` : "It's removed from the tree."}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={async () => {
          const parent = node.parent_id;
          if (await run(() => deleteWorkNode(node.id))) {
            setConfirmDelete(false);
            if (parent) onSelect(parent);
          }
        }}
      />
    </div>
  );
}

/* ---------- Ready now ---------- */

export function ReadyList({ tree, onSelect }: { tree: WorkTree; onSelect: (id: string) => void }) {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const ready = tree.ready.map((id) => byId.get(id)).filter((n): n is WorkNode => !!n);
  return (
    <section>
      <h2 className="mb-3 flex items-center justify-between">
        <span className="text-headline">Ready now</span>
        <span className="font-mono text-xs text-muted">{ready.length}</span>
      </h2>
      {ready.length ? (
        <ul className="grid gap-1">
          {ready.slice(0, 8).map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left text-sm hover:bg-surface"
              >
                <StatusMark status={n.status} size={14} />
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing waiting. Everything open is claimed or blocked by a dependency.</p>
      )}
    </section>
  );
}

/* ---------- Live activity ---------- */

function describe(e: WorkEvent, titleOf: (id: string | null) => string): string {
  const t = `“${titleOf(e.node_id) || String(e.detail.title ?? "a task")}”`;
  const d = e.detail as Record<string, unknown>;
  switch (e.kind) {
    case "session_created":
      return "started the session";
    case "decomposed": {
      const n = Array.isArray(d.children) ? d.children.length : 0;
      return `split ${t} into ${n}`;
    }
    case "node_added":
      return `added ${Array.isArray(d.children) && d.children[0] ? `“${String((d.children[0] as { title?: string }).title)}”` : "a task"}`;
    case "node_updated":
      return `edited ${t}`;
    case "status_changed":
      return `marked ${t} ${STATUS[(d.status as WorkStatus) ?? "open"]?.label.toLowerCase() ?? d.status}`;
    case "claimed":
      return `picked up ${t}`;
    case "released":
      return `put down ${t}`;
    case "note_added":
      return `noted on ${t}`;
    case "dependency_added":
      return `ordered ${t}`;
    case "node_deleted":
      return `deleted “${String(d.title ?? "a task")}”`;
    case "rolled_up":
      return `${t} rolled up: all done`;
    case "session_resolved":
      return "shipped the whole session";
    case "session_reopened":
      return "reopened the session";
    case "queued_to_learn":
      return `sent “${String(d.title)}” to Learn`;
    default:
      return e.kind.replace(/_/g, " ");
  }
}

export function ActivityFeed({
  events,
  tree,
  onSelect,
}: {
  events: WorkEvent[];
  tree: WorkTree;
  onSelect: (id: string) => void;
}) {
  const { user } = useAuth();
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const titleOf = (id: string | null) => (id ? (byId.get(id)?.title ?? "") : "");
  return (
    <section aria-live="polite">
      <h2 className="mb-3 flex items-center gap-2 text-headline">
        Live
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-good" />
        </span>
      </h2>
      <ol className="grid gap-0.5">
        <AnimatePresence initial={false}>
          {events.slice(0, 25).map((e) => {
            const you = user?.name === e.actor;
            const node = e.node_id ? byId.get(e.node_id) : undefined;
            return (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.gentle}
              >
                <button
                  type="button"
                  disabled={!node}
                  onClick={() => node && onSelect(node.id)}
                  className="w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm enabled:hover:bg-surface disabled:cursor-default"
                >
                  <span className={cn("font-mono text-xs font-semibold", you ? "text-pop" : "text-sky")}>{you ? "you" : e.actor}</span>{" "}
                  <span className="text-ink">{describe(e, titleOf)}</span>{" "}
                  <span className="font-mono text-[0.7rem] text-muted">{timeAgo(e.created_at)}</span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </section>
  );
}

/* ---------- Hand it to an agent ---------- */

export function AgentPrompt({ tree }: { tree: WorkTree }) {
  const [copied, setCopied] = useState(false);
  const text = `Use the Bullpen MCP server. Work on session ${tree.session.id} ("${tree.session.title}"): read the codebase, decompose the root into leaves that pass the leaf test, then claim and ship the ready leaves one by one.`;
  return (
    <section className="rounded-2xl border-2 border-dashed border-pop/60 p-4">
      <h2 className="text-headline">Hand it to your agent</h2>
      <p className="mt-1 text-sm text-muted">Paste this into Claude Code, Cursor or any MCP client connected to Bullpen.</p>
      <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-bg p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">{text}</pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <Link href="/bullpen/connect" className="press neo-sm inline-flex h-9 items-center rounded-xl bg-surface px-3.5 text-sm font-semibold">
          Not connected yet?
        </Link>
      </div>
    </section>
  );
}
