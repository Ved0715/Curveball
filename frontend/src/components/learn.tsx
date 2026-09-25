"use client";

import { Check, Eye, Lightbulb, ListPlus, Plus, Sparkles, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TRACKS, track, trackColor } from "@/lib/brand";
import { cn } from "@/lib/format";
import type { Lesson, Progress, QueueItem } from "@/lib/schemas";
import { Button, inputClass } from "./ui";

/* ---------- Track sticker: colour + emoji + label (never colour alone) ---------- */

export function TrackSticker({ id, className }: { id: string; className?: string }) {
  const t = track(id);
  return (
    <span
      className={cn("sticker bg-surface text-xs uppercase tracking-wider", className)}
      style={{ boxShadow: `3px 3px 0 ${trackColor(id)}` }}
    >
      <span aria-hidden>{t.emoji}</span>
      {t.short}
    </span>
  );
}

/* ---------- Level / XP ---------- */

export function LevelBar({ level }: { level: Progress["level"] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold">
          Level {level.level} · <span className="text-muted">{level.title}</span>
        </span>
        <span className="font-mono text-xs text-muted tabular-nums">
          {level.xp} / {level.next_level} XP
        </span>
      </div>
      <div
        className="mt-2 h-4 overflow-hidden rounded-full border-2 border-line bg-surface"
        role="progressbar"
        aria-label={`Level ${level.level} progress`}
        aria-valuemin={level.level_start}
        aria-valuemax={level.next_level}
        aria-valuenow={level.xp}
      >
        <motion.div
          className="h-full border-r-2 border-line bg-pop"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(3, level.progress * 100)}%` }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

/* ---------- Week strip (last 7 days) ---------- */

const DAY = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });

function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function WeekStrip({ calendar, today }: { calendar: Progress["calendar"]; today: string }) {
  const week = calendar.slice(-7);
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
      {week.map((d) => {
        const isToday = d.date === today;
        return (
          <li key={d.date} className="flex flex-col items-center gap-1">
            <span className={cn("text-[0.7rem] font-bold", isToday ? "text-ink" : "text-muted")}>
              {DAY.format(parseDay(d.date))}
            </span>
            <span
              className={cn(
                "grid size-8 place-items-center rounded-lg border-2 text-xs",
                d.learned ? "border-line" : isToday ? "border-line border-dashed" : "border-line-soft",
              )}
              style={d.learned ? { background: trackColor(d.category ?? "custom") } : undefined}
              aria-label={`${parseDay(d.date).toDateString()}: ${d.learned ? `learned ${d.title}` : "not learned"}`}
            >
              {d.learned && <Check className="size-4 text-white" strokeWidth={3} aria-hidden />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- 12-week heatmap ---------- */

export function Heatmap({ calendar, today }: { calendar: Progress["calendar"]; today: string }) {
  const [hover, setHover] = useState<Progress["calendar"][number] | null>(null);
  // Columns are weeks (oldest → newest), rows are days; pad so today sits in the last column.
  const pad = (7 - (calendar.length % 7)) % 7;
  const cells: (Progress["calendar"][number] | null)[] = [...Array(pad).fill(null), ...calendar];
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  return (
    <div>
      <div
        className="grid max-w-[36rem] gap-1.5"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Learning calendar, last 12 weeks"
      >
        {weeks.map((week, w) => (
          <div key={w} className="grid gap-1.5" role="row">
            {week.map((d, i) =>
              d ? (
                <span
                  key={d.date}
                  role="gridcell"
                  tabIndex={0}
                  onMouseEnter={() => setHover(d)}
                  onFocus={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                  aria-label={`${d.date}: ${d.learned ? `learned ${d.title}` : "no topic learned"}${d.interviews ? `, ${d.interviews} interview` : ""}`}
                  className={cn(
                    "relative aspect-square rounded-[6px] border-2 outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    d.learned ? "border-line" : "border-line-soft bg-surface",
                    d.date === today && "ring-2 ring-ink ring-offset-2 ring-offset-bg",
                  )}
                  style={d.learned ? { background: trackColor(d.category ?? "custom") } : undefined}
                >
                  {d.interviews > 0 && (
                    <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-line bg-pink" />
                  )}
                </span>
              ) : (
                <span key={`pad-${i}`} className="aspect-square" aria-hidden />
              ),
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 min-h-5 text-sm text-muted" aria-live="polite">
        {hover
          ? `${parseDay(hover.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${
              hover.learned ? hover.title : "nothing learned"
            }${hover.interviews ? " · mock interview" : ""}`
          : "Hover a day for details. Pink dot = mock interview."}
      </p>
    </div>
  );
}

/* ---------- Track balance ---------- */

export function BalanceBar({ counts }: { counts: Record<string, number> }) {
  const entries = [...TRACKS.map((t) => t.id), "custom"]
    .map((id) => [id, counts[id] ?? 0] as const)
    .filter(([, n]) => n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) return <p className="text-sm text-muted">Finish a topic to see your balance across tracks.</p>;
  return (
    <div>
      <div className="flex h-6 gap-[3px] overflow-hidden rounded-full border-2 border-line bg-line p-[2px]" aria-hidden>
        {entries.map(([id, n]) => (
          <motion.span
            key={id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: trackColor(id) }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: n }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {entries.map(([id, n]) => (
          <li key={id} className="flex items-center gap-2">
            <span className="size-3 rounded-sm border-2 border-line" style={{ background: trackColor(id) }} aria-hidden />
            {track(id).short} <span className="font-mono font-semibold tabular-nums">{n}</span>
            <span className="text-muted">({Math.round((n / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Lesson ---------- */

function CheckCard({ q, a, n }: { q: string; a: string; n: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="neo-sm rounded-2xl bg-surface p-4">
      <p className="font-semibold">
        <span className="mr-2 font-mono text-muted">Q{n}</span>
        {q}
      </p>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-2 overflow-hidden text-sm text-muted"
          >
            {a}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 inline-flex cursor-pointer items-center gap-1 text-sm font-bold text-accent"
      >
        <Eye className="size-3.5" aria-hidden /> {open ? "Hide answer" : "Think first, then reveal"}
      </button>
    </li>
  );
}

export function LessonView({
  lesson,
  checkDone,
  onCheckDone,
}: {
  lesson: Lesson;
  checkDone: boolean;
  onCheckDone?: () => void;
}) {
  return (
    <div className="grid gap-6">
      <p className="rounded-2xl border-2 border-line bg-sun/80 p-4 font-display text-xl font-bold text-[#16131a]">
        <Sparkles className="mr-2 inline size-5" aria-hidden />
        {lesson.tldr}
      </p>
      <div className="grid gap-3 leading-relaxed">
        {lesson.explanation.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div>
        <h3 className="mb-2 font-display text-lg font-bold">Key points</h3>
        <ul className="grid gap-2">
          {lesson.key_points.map((k) => (
            <li key={k} className="flex gap-2">
              <Check className="mt-1 size-4 shrink-0 text-good" strokeWidth={3} aria-hidden />
              {k}
            </li>
          ))}
        </ul>
      </div>
      <div className="neo-sm rounded-2xl bg-surface-strong p-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">Example</p>
        <h3 className="mt-1 font-display text-lg font-bold">{lesson.example.title}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{lesson.example.body}</p>
      </div>
      <div>
        <h3 className="mb-2 font-display text-lg font-bold">Watch out for</h3>
        <ul className="grid gap-2">
          {lesson.pitfalls.map((k) => (
            <li key={k} className="flex gap-2">
              <TriangleAlert className="mt-1 size-4 shrink-0 text-warn" aria-hidden />
              {k}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Lightbulb className="size-5" aria-hidden /> Quick check
        </h3>
        <ol className="grid gap-3">
          {lesson.check.map((c, i) => (
            <CheckCard key={c.question} q={c.question} a={c.answer} n={i + 1} />
          ))}
        </ol>
        {onCheckDone && (
          <div className="mt-4">
            {checkDone ? (
              <p className="inline-flex items-center gap-2 font-semibold text-good">
                <Check className="size-4" strokeWidth={3} aria-hidden /> Check done · +5 XP
              </p>
            ) : (
              <Button variant="ghost" onClick={onCheckDone}>
                <Check className="size-4" aria-hidden /> I answered all three · +5 XP
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Queue ---------- */

export function QueuePanel({
  items,
  onAdd,
  onRemove,
  compact = false,
}: {
  items: QueueItem[];
  onAdd: (title: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  compact?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const shown = compact ? items.slice(0, 3) : items;
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const t = title.trim();
          if (!t) return;
          setBusy(true);
          try {
            await onAdd(t);
            setTitle("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="queue-add" className="sr-only">
          Add a topic to your queue
        </label>
        <input
          id="queue-add"
          className={cn(inputClass, "py-2.5")}
          placeholder="e.g. Learn Redis pub/sub"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" variant="ghost" loading={busy} aria-label="Add to queue">
          <Plus className="size-4" aria-hidden />
        </Button>
      </form>
      {shown.length > 0 ? (
        <ol className="mt-3 grid gap-2">
          {shown.map((q, i) => (
            <li key={q.id} className="flex items-center gap-3 rounded-xl border-2 border-line-soft bg-surface px-3 py-2">
              <span className="font-mono text-xs text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.title}</span>
              {q.source === "interview" && (
                <span className="rounded-full border-2 border-line bg-pink/30 px-2 text-[0.65rem] font-bold uppercase">
                  from interview
                </span>
              )}
              <button
                type="button"
                onClick={() => void onRemove(q.id)}
                aria-label={`Remove ${q.title} from queue`}
                className="cursor-pointer text-muted hover:text-bad"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <ListPlus className="size-4" aria-hidden /> Queued topics jump ahead of the daily rotation.
        </p>
      )}
      {compact && items.length > 3 && <p className="mt-2 text-xs text-muted">+{items.length - 3} more in Settings</p>}
    </div>
  );
}
