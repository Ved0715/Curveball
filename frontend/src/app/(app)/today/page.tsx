"use client";

import { ArrowRight, BookOpenText, Check, Flame, Mic, PartyPopper, Search, Shuffle, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Confetti } from "@/components/confetti";
import { LessonView, LevelBar, QueuePanel, TrackSticker, WeekStrip } from "@/components/learn";
import { PageShell, PageSkeleton } from "@/components/page-shell";
import { ErrorPanel, StreamingPanel } from "@/components/status";
import { Button, Card, Eyebrow, inputClass } from "@/components/ui";
import {
  addToQueue,
  completeToday,
  getProgress,
  getQueue,
  getToday,
  markCheckDone,
  removeFromQueue,
  saveNote,
  streamLesson,
  swapToday,
} from "@/lib/api";
import { greeting, useAuth } from "@/lib/auth";
import { friendlyError, toApiError, type ApiError } from "@/lib/errors";
import { streamPercent } from "@/lib/format";
import type { Assignment, Progress, QueueItem, Today } from "@/lib/schemas";
import { useStore } from "@/lib/store";
import { useStreamTask } from "@/lib/use-task";

type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready" };

function useTodayData() {
  const setStreak = useStore((s) => s.setStreak);
  const [today, setToday] = useState<Today | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const [t, p, q] = await Promise.all([getToday(), getProgress(), getQueue()]);
      setToday(t);
      setProgress(p);
      setQueue(q);
      setStreak(t.streak);
      setLoad({ status: "ready" });
    } catch (err) {
      setLoad({ status: "error", error: toApiError(err) });
    }
  }, [setStreak]);

  useEffect(() => {
    let live = true;
    Promise.all([getToday(), getProgress(), getQueue()])
      .then(([t, p, q]) => {
        if (!live) return;
        setToday(t);
        setProgress(p);
        setQueue(q);
        setStreak(t.streak);
        setLoad({ status: "ready" });
      })
      .catch((err: unknown) => live && setLoad({ status: "error", error: toApiError(err) }));
    return () => {
      live = false;
    };
  }, [setStreak]);

  return { today, setToday, progress, queue, setQueue, load, refresh };
}

function TopicCard({
  a,
  onDone,
  onSwap,
  onLesson,
  lessonOpen,
}: {
  a: Assignment;
  onDone: (note: string) => Promise<void>;
  onSwap: () => Promise<void>;
  onLesson: () => void;
  lessonOpen: boolean;
}) {
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"done" | "swap" | null>(null);
  const [error, setError] = useState<string>();

  async function run(kind: "done" | "swap") {
    setBusy(kind);
    setError(undefined);
    try {
      await (kind === "done" ? onDone(note) : onSwap());
      setFinishing(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <TrackSticker id={a.category} />
        {a.source === "interview" && <span className="sticker rotate-2 bg-pink/40 text-xs">from your interview</span>}
        {a.source === "queue" && <span className="sticker rotate-2 bg-sky/40 text-xs">from your queue</span>}
      </div>
      <h2 className="mt-5 font-display text-[clamp(1.8rem,4.4vw,2.8rem)] font-extrabold leading-[1.05] tracking-tight">
        {a.title}
      </h2>
      <p className="mt-3 max-w-2xl text-lg text-muted">{a.blurb}</p>

      {a.explore.length > 0 && (
        <div className="mt-6">
          <Eyebrow>Explore</Eyebrow>
          <ul className="mt-2 grid gap-2">
            {a.explore.map((e) => (
              <li key={e} className="flex gap-2 text-sm">
                <Search className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence initial={false}>
        {finishing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <label htmlFor="note" className="mt-6 block text-sm font-bold">
              What clicked today? <span className="font-normal text-muted">Optional · +5 XP</span>
            </label>
            <textarea
              id="note"
              rows={3}
              maxLength={2000}
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="One line is plenty. Future you will thank you."
              className={`${inputClass} mt-2 resize-y`}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-bad">
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-wrap gap-3">
        {finishing ? (
          <>
            <Button size="lg" loading={busy === "done"} onClick={() => void run("done")}>
              <Check className="size-5" strokeWidth={3} aria-hidden /> Done for today
            </Button>
            <Button size="lg" variant="soft" onClick={() => setFinishing(false)}>
              Not yet
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" onClick={() => setFinishing(true)}>
              <Check className="size-5" strokeWidth={3} aria-hidden /> Mark as learned
            </Button>
            <Button size="lg" variant="ghost" onClick={onLesson} aria-expanded={lessonOpen}>
              <Sparkles className="size-5" aria-hidden /> {lessonOpen ? "Hide lesson" : "Teach me in 5 min"}
            </Button>
            <Button size="lg" variant="soft" loading={busy === "swap"} onClick={() => void run("swap")}>
              <Shuffle className="size-4" aria-hidden /> Swap
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function DoneCard({ a, onNote }: { a: Assignment; onNote: (note: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(a.note ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <span className="sticker absolute -top-1 right-5 rotate-6 bg-pop text-sm text-pop-ink">
        <PartyPopper className="size-4" aria-hidden /> Learned
      </span>
      <TrackSticker id={a.category} />
      <h2 className="mt-5 font-display text-[clamp(1.6rem,4vw,2.4rem)] font-extrabold leading-[1.05] tracking-tight">
        {a.title}
      </h2>
      <p className="mt-3 flex items-center gap-2 font-semibold text-good">
        <Check className="size-5" strokeWidth={3} aria-hidden /> Done for today. New topic tomorrow morning.
      </p>
      <div className="mt-6 rounded-2xl border-2 border-dashed border-line-soft p-4">
        <Eyebrow>Your note</Eyebrow>
        {editing ? (
          <form
            className="mt-2 grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await onNote(note);
                setEditing(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="edit-note" className="sr-only">
              Your note
            </label>
            <textarea
              id="edit-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputClass} resize-y`}
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit" loading={busy}>
                Save note
              </Button>
              <Button size="sm" variant="soft" type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className={a.note ? "" : "text-muted"}>{a.note || "No note yet. What clicked today? (+5 XP)"}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 cursor-pointer text-sm font-bold text-accent"
            >
              {a.note ? "Edit" : "Add note"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function TodayPage() {
  const { user } = useAuth();
  const { today, setToday, progress, queue, setQueue, load, refresh } = useTodayData();
  const [lessonOpen, setLessonOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const patchAssignment = (a: Assignment) => setToday((t) => (t ? { ...t, assignment: a } : t));

  const lessonTask = useStreamTask(
    (signal, on) => streamLesson(on, signal),
    (lesson) => setToday((t) => (t?.assignment ? { ...t, assignment: { ...t.assignment, lesson } } : t)),
  );

  if (load.status === "loading" || !today || !progress) {
    if (load.status === "error")
      return (
        <PageShell>
          <ErrorPanel message={friendlyError(load.error)} onRetry={() => void refresh()} />
        </PageShell>
      );
    return <PageSkeleton />;
  }

  const a = today.assignment;
  const dateLabel = new Date(`${today.today}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function openLesson() {
    setLessonOpen((o) => !o);
    if (!a?.lesson && lessonTask.state.status !== "running") void lessonTask.run();
  }

  return (
    <PageShell wide>
      <Confetti fire={celebrate} />
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>{dateLabel}</Eyebrow>
          <h1 className="mt-2 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-extrabold leading-none tracking-tight">
            {user ? greeting(user.name) : "Hello"} <span aria-hidden>👋</span>
          </h1>
        </div>
        <div className="neo bg-surface flex items-center gap-3 self-start rounded-2xl px-4 py-3 sm:self-auto">
          <Flame
            className={today.streak ? "size-8 fill-[var(--sun)] text-[var(--track-dsa)]" : "size-8 text-muted"}
            aria-hidden
          />
          <div>
            <p className="font-display text-3xl leading-none font-extrabold tabular-nums">{today.streak}</p>
            <p className="text-xs font-semibold text-muted">
              day streak{today.longest > today.streak ? ` · best ${today.longest}` : ""}
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 content-start gap-6">
          {!a ? (
            <Card className="p-8">
              <p className="font-display text-2xl font-bold">No topics match your focus areas.</p>
              <Link href="/settings" className="mt-3 inline-block font-bold text-accent underline underline-offset-4">
                Turn on another track in Settings
              </Link>
            </Card>
          ) : a.completed ? (
            <DoneCard a={a} onNote={async (n) => patchAssignment(await saveNote(n))} />
          ) : (
            <TopicCard
              a={a}
              lessonOpen={lessonOpen}
              onLesson={openLesson}
              onDone={async (note) => {
                patchAssignment(await completeToday(note));
                setCelebrate(true);
                setLessonOpen(false);
                await refresh();
              }}
              onSwap={async () => {
                patchAssignment(await swapToday());
                setLessonOpen(false);
                lessonTask.stop();
              }}
            />
          )}

          <AnimatePresence initial={false}>
            {a && lessonOpen && !a.completed && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                aria-label="Lesson"
              >
                {a.lesson ? (
                  <Card className="rounded-3xl p-6 sm:p-8">
                    <div className="mb-6 flex items-center gap-2">
                      <BookOpenText className="size-5" aria-hidden />
                      <h2 className="font-display text-2xl font-extrabold">Your 5-minute lesson</h2>
                    </div>
                    <LessonView
                      lesson={a.lesson}
                      checkDone={a.check_done}
                      onCheckDone={async () => patchAssignment(await markCheckDone())}
                    />
                  </Card>
                ) : lessonTask.state.status === "error" || lessonTask.state.status === "stopped" ? (
                  <ErrorPanel
                    message={
                      lessonTask.state.status === "stopped" ? "Lesson stopped." : friendlyError(lessonTask.state.error)
                    }
                    onRetry={() => void lessonTask.run()}
                  />
                ) : (
                  <StreamingPanel
                    title="Writing your lesson"
                    lede="A short, focused explanation with an example and a quick self-check."
                    lines={["Finding the core idea…", "Picking a good example…", "Writing your self-check…"]}
                    percent={lessonTask.state.status === "running" ? streamPercent(lessonTask.state.chars, 3500) : null}
                    onStop={lessonTask.stop}
                  />
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <aside className="grid content-start gap-6">
          <Card className="rounded-3xl p-5">
            <Eyebrow>This week</Eyebrow>
            <div className="mt-3">
              <WeekStrip calendar={progress.calendar} today={today.today} />
            </div>
            <div className="mt-5">
              <LevelBar level={progress.level} />
            </div>
          </Card>

          <Card className="rounded-3xl p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <Eyebrow>Up next</Eyebrow>
              <span className="font-mono text-xs text-muted">{queue.length} queued</span>
            </div>
            <QueuePanel
              compact
              items={queue}
              onAdd={async (title) => {
                const item = await addToQueue({ title });
                setQueue((q) => (q.some((x) => x.id === item.id) ? q : [...q, item]));
              }}
              onRemove={async (id) => {
                await removeFromQueue(id);
                setQueue((q) => q.filter((x) => x.id !== id));
              }}
            />
          </Card>

          <Link href="/practice" className="press neo group block rounded-3xl bg-violet-deep p-5 text-white">
            <Mic className="size-6" aria-hidden />
            <p className="mt-3 font-display text-xl font-extrabold">Throw yourself a curveball</p>
            <p className="mt-1 text-sm text-white/85">
              {progress.interviews_total
                ? `${progress.interviews_total} mock interview${progress.interviews_total === 1 ? "" : "s"} so far${
                    progress.avg_score !== null ? ` · avg ${Math.round(progress.avg_score)}` : ""
                  }. Go again?`
                : "Try a 4-question mock interview. Weak spots become tomorrow's topics."}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold">
              Start practice <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
