"use client";

import { Check, Eye, EyeOff, GripVertical, Lightbulb, Plus, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react";
import { useRef, useState } from "react";
import { addToQueue, removeFromQueue, reorderQueue } from "@/lib/api";
import { TRACKS, track, trackColor } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/format";
import { ease, enter, spring, stagger } from "@/lib/motion";
import type { Lesson, Progress, QueueItem } from "@/lib/schemas";
import { AnimatedNumber } from "./animated-number";
import { TrackGlyph, TrackTag } from "./brand";
import { useToast } from "./toast";
import { inputClass } from "./ui";

/** Kept for existing call sites: a track label with its glyph. */
export function TrackSticker({ id, className }: { id: string; className?: string }) {
  return <TrackTag id={id} className={className} />;
}

/* ---------- Level / XP ---------- */

export function LevelBar({ level }: { level: Progress["level"] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold">
          Level {level.level} <span className="font-medium text-muted">· {level.title}</span>
        </p>
        <p className="font-mono text-xs text-muted">
          <AnimatedNumber value={level.xp} /> / {level.next_level} XP
        </p>
      </div>
      <div
        className="mt-2 h-3 overflow-hidden rounded-full border-2 border-line bg-surface"
        role="progressbar"
        aria-label={`Level ${level.level} progress`}
        aria-valuemin={level.level_start}
        aria-valuemax={level.next_level}
        aria-valuenow={level.xp}
      >
        <motion.div
          className="h-full origin-left rounded-full bg-pop"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(0.03, level.progress) }}
          transition={spring.gentle}
        />
      </div>
    </div>
  );
}

/* ---------- Week strip (last 7 days) ---------- */

const DAY = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });

export function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function WeekStrip({ calendar, today }: { calendar: Progress["calendar"]; today: string }) {
  const week = calendar.slice(-7);
  return (
    <motion.ol className="grid grid-cols-7 gap-1.5" aria-label="This week" variants={stagger(0.035)} initial="hidden" animate="show">
      {week.map((d) => {
        const isToday = d.date === today;
        return (
          <motion.li key={d.date} variants={enter} className="flex flex-col items-center gap-1.5">
            <span className={cn("text-[0.7rem] font-bold", isToday ? "text-ink" : "text-muted")}>{DAY.format(parseDay(d.date))}</span>
            <span
              className={cn(
                "relative grid size-8 place-items-center rounded-full border-2",
                d.learned ? "border-line" : isToday ? "border-dashed border-line" : "border-line-soft",
              )}
              style={d.learned ? { background: trackColor(d.category ?? "custom") } : undefined}
              aria-label={`${parseDay(d.date).toDateString()}: ${d.learned ? `learned ${d.title}` : "not learned"}`}
            >
              <AnimatePresence>
                {d.learned && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
                    <Check className="size-4 text-white" strokeWidth={3.2} aria-hidden />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

/* ---------- 12-week heatmap ---------- */

export function Heatmap({ calendar, today }: { calendar: Progress["calendar"]; today: string }) {
  const [hover, setHover] = useState<Progress["calendar"][number] | null>(null);
  const pad = (7 - (calendar.length % 7)) % 7;
  const cells: (Progress["calendar"][number] | null)[] = [...Array(pad).fill(null), ...calendar];
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  return (
    <div>
      <div
        className="grid max-w-[40rem] gap-1.5"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        role="grid"
        aria-label="Learning calendar, last 12 weeks"
      >
        {weeks.map((week, w) => (
          <motion.div
            key={w}
            className="grid gap-1.5"
            role="row"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: w * 0.025, ease: ease.out }}
          >
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
                    "relative aspect-square rounded-[6px] border-2 transition-transform outline-none hover:scale-110 focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-focus",
                    d.learned ? "border-line" : "border-line-soft bg-surface",
                    d.date === today && "ring-2 ring-ink ring-offset-2 ring-offset-bg",
                  )}
                  style={d.learned ? { background: trackColor(d.category ?? "custom") } : undefined}
                >
                  {d.interviews > 0 && (
                    <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-line bg-ink" />
                  )}
                </span>
              ) : (
                <span key={`pad-${i}`} className="aspect-square" aria-hidden />
              ),
            )}
          </motion.div>
        ))}
      </div>
      <p className="mt-3 min-h-5 text-sm text-muted" aria-live="polite">
        {hover
          ? `${parseDay(hover.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${
              hover.learned ? hover.title : "nothing learned"
            }${hover.interviews ? " · mock interview" : ""}`
          : "Hover a day for details. Ink dot = mock interview."}
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
      <div className="flex h-5 gap-[3px] overflow-hidden rounded-full border-2 border-line bg-line p-[2px]" aria-hidden>
        {entries.map(([id, n]) => (
          <motion.span
            key={id}
            layout
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: trackColor(id) }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: n }}
            transition={spring.gentle}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {entries.map(([id, n]) => (
          <li key={id} className="flex items-center gap-2.5">
            <TrackGlyph id={id} size={12} />
            <span className="flex-1">{track(id).short}</span>
            <span className="font-mono font-semibold tabular-nums">{n}</span>
            <span className="w-10 text-right text-muted">{Math.round((n / total) * 100)}%</span>
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
    <li className="rule-soft py-4 first:border-t-0 first:pt-0">
      <p className="font-semibold">
        <span className="mr-2 font-mono text-muted">Q{n}</span>
        {q}
      </p>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto", transition: { duration: 0.28, ease: ease.out } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.16, ease: ease.in } }}
            className="overflow-hidden"
          >
            <p className="mt-2 border-l-4 border-pop pl-3 text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold text-accent"
      >
        {open ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        {open ? "Hide answer" : "Think first, then reveal"}
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
  const item = enter;
  return (
    <motion.div className="grid gap-8" variants={stagger(0.07)} initial="hidden" animate="show">
      <motion.p variants={item} className="text-title max-w-[28ch]">
        {lesson.tldr}
      </motion.p>
      <motion.div variants={item} className="grid max-w-[65ch] gap-4 text-[1.05rem] leading-relaxed">
        {lesson.explanation.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </motion.div>
      <motion.div variants={item}>
        <p className="text-label text-muted">Key points</p>
        <ul className="mt-3 grid gap-2.5">
          {lesson.key_points.map((k) => (
            <li key={k} className="flex gap-3">
              <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2 border-line bg-pop">
                <Check className="size-3 text-pop-ink" strokeWidth={3.5} aria-hidden />
              </span>
              {k}
            </li>
          ))}
        </ul>
      </motion.div>
      <motion.div variants={item} className="rounded-2xl border-2 border-line bg-bg-2 p-5">
        <p className="text-label text-muted">Example</p>
        <p className="mt-1 text-headline">{lesson.example.title}</p>
        <p className="mt-2 font-mono text-sm leading-relaxed whitespace-pre-wrap">{lesson.example.body}</p>
      </motion.div>
      <motion.div variants={item}>
        <p className="text-label text-muted">Watch out for</p>
        <ul className="mt-3 grid gap-2.5">
          {lesson.pitfalls.map((k) => (
            <li key={k} className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
              {k}
            </li>
          ))}
        </ul>
      </motion.div>
      <motion.div variants={item} className="rule pt-6">
        <p className="flex items-center gap-2 text-headline">
          <Lightbulb className="size-5" aria-hidden /> Quick check
        </p>
        <ol className="mt-4">
          {lesson.check.map((c, i) => (
            <CheckCard key={c.question} q={c.question} a={c.answer} n={i + 1} />
          ))}
        </ol>
        {onCheckDone && (
          <div className="mt-4">
            <AnimatePresence mode="wait" initial={false}>
              {checkDone ? (
                <motion.p
                  key="done"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={spring.bouncy}
                  className="inline-flex items-center gap-2 font-semibold text-good"
                >
                  <Check className="size-4" strokeWidth={3} aria-hidden /> Check done · +5 XP
                </motion.p>
              ) : (
                <motion.button
                  key="todo"
                  type="button"
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={onCheckDone}
                  className="press neo-sm inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-surface px-4 font-semibold"
                >
                  <Check className="size-4" aria-hidden /> I answered all three · +5 XP
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ---------- Queue: optimistic, undoable, reorderable ---------- */

function QueueRow({
  item,
  index,
  reorderable,
  onRemove,
  onDrop,
}: {
  item: QueueItem;
  index: number;
  reorderable: boolean;
  onRemove: () => void;
  onDrop: () => void;
}) {
  const controls = useDragControls();
  const body = (
    <>
      {reorderable ? (
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          className="-ml-1 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:text-ink active:cursor-grabbing"
          aria-label={`Drag to reorder ${item.title}`}
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="w-5 shrink-0 font-mono text-xs text-muted">{index + 1}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
        {item.source === "interview" && <span className="text-xs font-semibold text-muted">from your interview</span>}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.title} from queue`}
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-bad/10 hover:text-bad"
      >
        <X className="size-4" />
      </button>
    </>
  );
  const cls = "flex items-center gap-2 rounded-xl bg-bg py-1.5 pr-1 pl-2";
  return reorderable ? (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      className={cn(cls, "rule-soft first:border-t-0")}
      whileDrag={{ scale: 1.03, boxShadow: "4px 4px 0 var(--shadow-color)", zIndex: 10 }}
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16, transition: { duration: 0.16 } }}
    >
      {body}
    </Reorder.Item>
  ) : (
    <motion.li
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16, transition: { duration: 0.16 } }}
      className={cn(cls, "rule-soft first:border-t-0")}
    >
      {body}
    </motion.li>
  );
}

export function QueuePanel({
  items,
  setItems,
  compact = false,
}: {
  items: QueueItem[];
  setItems: (fn: (xs: QueueItem[]) => QueueItem[]) => void;
  compact?: boolean;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const shown = compact ? items.slice(0, 3) : items;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const temp: QueueItem = { id: `temp-${Date.now()}`, title: t, blurb: "", source: "manual", session_id: null, created_at: "" };
    setItems((xs) => [...xs, temp]);
    setTitle("");
    input.current?.focus();
    try {
      const saved = await addToQueue({ title: t });
      setItems((xs) => {
        const withoutTemp = xs.filter((x) => x.id !== temp.id);
        return withoutTemp.some((x) => x.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
      });
    } catch (err) {
      setItems((xs) => xs.filter((x) => x.id !== temp.id));
      toast({ title: "Couldn't queue that", description: friendlyError(err), tone: "error" });
    }
  }

  function remove(item: QueueItem) {
    const before = items;
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    const done = removeFromQueue(item.id).catch((err: unknown) => {
      setItems(() => before);
      toast({ title: "Couldn't remove that", description: friendlyError(err), tone: "error" });
      throw err;
    });
    toast({
      title: "Removed from your queue",
      description: item.title,
      action: {
        label: "Undo",
        onClick: async () => {
          await done.catch(() => undefined);
          const restored = await addToQueue({ title: item.title, blurb: item.blurb, source: item.source === "interview" ? "interview" : "manual" });
          const order = before.map((x) => (x.id === item.id ? restored.id : x.id)).filter((id) => !id.startsWith("temp-"));
          setItems(() => before.map((x) => (x.id === item.id ? restored : x)));
          await reorderQueue(order).catch(() => undefined);
        },
      },
    });
  }

  async function persistOrder() {
    const ids = items.map((x) => x.id).filter((id) => !id.startsWith("temp-"));
    try {
      await reorderQueue(ids);
    } catch (err) {
      toast({ title: "Couldn't save the new order", description: friendlyError(err), tone: "error" });
    }
  }

  return (
    <div>
      <form className="flex gap-2" onSubmit={(e) => void add(e)}>
        <label htmlFor={compact ? "queue-add-compact" : "queue-add"} className="sr-only">
          Add a topic to your queue
        </label>
        <input
          ref={input}
          id={compact ? "queue-add-compact" : "queue-add"}
          className={cn(inputClass, "py-2.5")}
          placeholder="Queue a topic, e.g. Redis pub/sub"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.92 }}
          transition={spring.press}
          aria-label="Add to queue"
          disabled={!title.trim()}
          className="neo-sm grid size-12 shrink-0 cursor-pointer place-items-center rounded-xl bg-pop text-pop-ink disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
        >
          <Plus className="size-5" strokeWidth={2.6} />
        </motion.button>
      </form>
      {shown.length ? (
        compact ? (
          <ul className="mt-3">
            <AnimatePresence initial={false}>
              {shown.map((q, i) => (
                <QueueRow key={q.id} item={q} index={i} reorderable={false} onRemove={() => remove(q)} onDrop={() => {}} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <Reorder.Group axis="y" values={items} onReorder={(xs) => setItems(() => xs)} className="mt-3" as="ul">
            <AnimatePresence initial={false}>
              {items.map((q, i) => (
                <QueueRow key={q.id} item={q} index={i} reorderable onRemove={() => remove(q)} onDrop={() => void persistOrder()} />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )
      ) : (
        <p className="mt-3 text-sm text-muted">Empty. Queued topics jump ahead of the daily rotation.</p>
      )}
      {compact && items.length > 3 && <p className="mt-2 text-xs text-muted">+{items.length - 3} more in Settings</p>}
    </div>
  );
}
