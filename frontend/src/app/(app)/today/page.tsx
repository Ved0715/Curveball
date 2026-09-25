"use client";

import {
  ArrowRight,
  BookOpenText,
  Check,
  Clock3,
  Mic,
  Search,
  Shuffle,
  Sparkles,
  Square,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BallLoader,
  CurveUnderline,
  Stamp,
  TrackTag,
} from "@/components/brand";
import { Confetti } from "@/components/confetti";
import { EmptyState } from "@/components/empty";
import {
  LessonView,
  LevelBar,
  QueuePanel,
  WeekStrip,
} from "@/components/learn";
import { TodaySkeleton } from "@/components/skeleton";
import { ErrorPanel } from "@/components/status";
import { useToast } from "@/components/toast";
import { Button, inputClass, Kbd } from "@/components/ui";
import {
  completeToday,
  getProgress,
  getQueue,
  getToday,
  markCheckDone,
  saveNote,
  streamLesson,
  swapToday,
} from "@/lib/api";
import { greeting, useAuth } from "@/lib/auth";
import { friendlyError, toApiError, type ApiError } from "@/lib/errors";
import { cn, streamPercent } from "@/lib/format";
import { duration, ease, spring } from "@/lib/motion";
import type { Assignment, Progress, QueueItem, Today } from "@/lib/schemas";
import { useStore } from "@/lib/store";
import { useStreamTask } from "@/lib/use-task";

type Load =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "ready" };

const STARTERS = [
  "The key idea is ",
  "I'd use this when ",
  "What surprised me: ",
  "In an interview I'd say ",
];

/* ---------- Data ---------- */

function useTodayData() {
  const setStreak = useStore((s) => s.setStreak);
  const [today, setToday] = useState<Today | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const apply = useCallback(
    ([t, p, q]: [Today, Progress, QueueItem[]]) => {
      setToday(t);
      setProgress(p);
      setQueue(q);
      setStreak(t.streak);
      return { t, p };
    },
    [setStreak],
  );
  const fetchAll = useCallback(
    () => Promise.all([getToday(), getProgress(), getQueue()]).then(apply),
    [apply],
  );

  useEffect(() => {
    let live = true;
    fetchAll()
      .then(() => live && setLoad({ status: "ready" }))
      .catch(
        (err: unknown) =>
          live && setLoad({ status: "error", error: toApiError(err) }),
      );
    return () => {
      live = false;
    };
  }, [fetchAll]);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    fetchAll()
      .then(() => setLoad({ status: "ready" }))
      .catch((err: unknown) =>
        setLoad({ status: "error", error: toApiError(err) }),
      );
  }, [fetchAll]);

  return { today, setToday, progress, queue, setQueue, load, fetchAll, retry };
}

/** Time until the user's next local midnight, refreshed every minute. */
function useUntilTomorrow() {
  const calc = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const mins = Math.max(
      0,
      Math.round((next.getTime() - now.getTime()) / 60000),
    );
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setLeft(calc()), 60_000);
    return () => clearInterval(t);
  }, []);
  return left;
}

/* ---------- The ticket: today's topic ---------- */

function Steps({ a, lessonSeen }: { a: Assignment; lessonSeen: boolean }) {
  const steps = [
    { label: "Read", done: true },
    { label: "Learn", done: lessonSeen || a.check_done },
    { label: "Reflect", done: !!a.note || a.completed },
  ];
  return (
    <ol className="flex items-center gap-2" aria-label="Today's steps">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          {i > 0 && (
            <span
              className={cn("h-0.5 w-4", s.done ? "bg-line" : "bg-line-soft")}
              aria-hidden
            />
          )}
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-bold",
              s.done ? "text-ink" : "text-muted",
            )}
          >
            <span
              className={cn(
                "grid size-4 place-items-center rounded-full border-2",
                s.done ? "border-line bg-pop" : "border-line-soft",
              )}
              aria-hidden
            >
              {s.done && (
                <Check className="size-2.5 text-pop-ink" strokeWidth={4} />
              )}
            </span>
            {s.label}
            <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Ticket({
  a,
  lessonOpen,
  lessonSeen,
  onLesson,
  onComplete,
  onSwap,
  onNote,
  untilTomorrow,
  nextUp,
  gainedXp,
}: {
  a: Assignment;
  lessonOpen: boolean;
  lessonSeen: boolean;
  onLesson: () => void;
  onComplete: (note: string) => Promise<void>;
  onSwap: () => Promise<void>;
  onNote: (note: string) => Promise<void>;
  untilTomorrow: string;
  nextUp: QueueItem | null;
  gainedXp: number | null;
}) {
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"done" | "swap" | null>(null);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a.note ?? "");

  async function run(kind: "done" | "swap") {
    setBusy(kind);
    setError(undefined);
    try {
      await (kind === "done" ? onComplete(note) : onSwap());
      setFinishing(false);
      setNote("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  // Keyboard: L = learned, T = teach me, S = swap (ignored while typing).
  useEffect(() => {
    if (a.completed) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        el.closest("input, textarea, select, [contenteditable], [role=dialog]")
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "l") {
        e.preventDefault();
        setFinishing(true);
      } else if (k === "t") {
        e.preventDefault();
        onLesson();
      } else if (k === "s" && !busy) {
        e.preventDefault();
        void run("swap");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <motion.article
      layout
      transition={spring.gentle}
      className="sheet relative rounded-[1.75rem] p-6 sm:p-9"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TrackTag id={a.category} />
          {a.source !== "auto" && (
            <span className="text-xs font-semibold text-muted">
              {a.source === "interview"
                ? "from your interview"
                : "from your queue"}
            </span>
          )}
        </div>
        {!a.completed && <Steps a={a} lessonSeen={lessonSeen} />}
      </div>

      <AnimatePresence>
        {a.completed && (
          <motion.div
            className="absolute top-5 right-5 sm:top-7 sm:right-8"
            exit={{ opacity: 0 }}
          >
            <Stamp>
              <Check className="size-4" strokeWidth={3.5} aria-hidden /> Learned
            </Stamp>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.h2
        layout="position"
        className={cn("mt-6 max-w-[20ch] text-display", a.completed && "pr-24")}
      >
        {a.title}
      </motion.h2>

      <AnimatePresence mode="wait" initial={false}>
        {!a.completed ? (
          <motion.div
            key="open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: duration.fast } }}
          >
            <p className="mt-4 max-w-[60ch] text-lg text-muted">{a.blurb}</p>
            {a.explore.length > 0 && (
              <ul className="mt-6 grid gap-2">
                {a.explore.map((e) => (
                  <li key={e} className="flex gap-2.5 text-sm">
                    <Search
                      className="mt-0.5 size-4 shrink-0 text-muted"
                      aria-hidden
                    />
                    {e}
                  </li>
                ))}
              </ul>
            )}

            <AnimatePresence initial={false}>
              {finishing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{
                    opacity: 1,
                    height: "auto",
                    transition: { duration: duration.slow, ease: ease.out },
                  }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    transition: { duration: duration.fast, ease: ease.in },
                  }}
                  className="overflow-hidden"
                >
                  <div className="rule-soft mt-7 pt-6">
                    <label htmlFor="note" className="text-headline">
                      What clicked today?
                    </label>
                    <p className="text-sm text-muted">
                      Optional, one line is plenty. +5 XP.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {STARTERS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setNote((n) => (n.trim() ? `${n.trim()} ${s}` : s))
                          }
                          className="cursor-pointer rounded-full border-2 border-line-soft px-3 py-1 text-sm font-medium transition hover:border-line hover:bg-surface-strong"
                        >
                          {s.trim()}…
                        </button>
                      ))}
                    </div>
                    <textarea
                      id="note"
                      rows={3}
                      maxLength={2000}
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void run("done");
                        }
                      }}
                      placeholder="Future you will thank you."
                      className={`${inputClass} mt-3 resize-y`}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <p role="alert" className="mt-4 text-sm font-medium text-bad">
                {error}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {finishing ? (
                <>
                  <Button
                    size="lg"
                    loading={busy === "done"}
                    onClick={() => void run("done")}
                  >
                    <Check className="size-5" strokeWidth={3} aria-hidden />{" "}
                    Done for today
                  </Button>
                  <Button
                    size="lg"
                    variant="soft"
                    onClick={() => setFinishing(false)}
                  >
                    Not yet
                  </Button>
                  <span className="hidden text-xs text-muted sm:inline">
                    <Kbd>⌘</Kbd> <Kbd>Enter</Kbd>
                  </span>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    onClick={() => setFinishing(true)}
                    aria-keyshortcuts="L"
                  >
                    <Check className="size-5" strokeWidth={3} aria-hidden />{" "}
                    Mark as learned
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    onClick={onLesson}
                    aria-expanded={lessonOpen}
                    aria-keyshortcuts="T"
                  >
                    <Sparkles className="size-5" aria-hidden />{" "}
                    {lessonOpen ? "Hide lesson" : "Teach me in 5 min"}
                  </Button>
                  <Button
                    size="lg"
                    variant="soft"
                    loading={busy === "swap"}
                    onClick={() => void run("swap")}
                    aria-keyshortcuts="S"
                  >
                    <Shuffle className="size-4" aria-hidden /> Swap
                  </Button>
                  <span className="hidden text-xs text-muted xl:inline">
                    <Kbd>L</Kbd> <Kbd>T</Kbd> <Kbd>S</Kbd>
                  </span>
                </>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: {
                delay: 0.15,
                duration: duration.slow,
                ease: ease.out,
              },
            }}
          >
            <div className="mt-6 border-l-4 border-pop pl-4">
              {editing ? (
                <form
                  className="grid gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await onNote(draft);
                    setEditing(false);
                  }}
                >
                  <label htmlFor="edit-note" className="text-label text-muted">
                    Your note
                  </label>
                  <textarea
                    id="edit-note"
                    rows={3}
                    maxLength={2000}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className={`${inputClass} resize-y`}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" type="submit">
                      Save note
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      type="button"
                      onClick={() => setEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <p className={cn("text-lg", !a.note && "text-muted")}>
                    {a.note || "No note yet. What clicked today?"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(a.note ?? "");
                      setEditing(true);
                    }}
                    className="link shrink-0 cursor-pointer text-sm font-bold text-accent"
                  >
                    {a.note ? "Edit" : "Add note · +5 XP"}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4" aria-hidden /> Next topic in{" "}
                {untilTomorrow}
              </span>
              {nextUp && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <ArrowRight className="size-4 shrink-0" aria-hidden /> Up
                  next: <b className="truncate text-ink">{nextUp.title}</b>
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gainedXp !== null && (
          <motion.span
            key="xp"
            className="pointer-events-none absolute bottom-10 left-10 z-10 rounded-full border-2 border-line bg-pop px-3 py-1 font-display text-lg font-extrabold text-pop-ink"
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: -70, scale: 1 }}
            transition={{
              duration: 1.6,
              ease: ease.out,
              times: [0, 0.15, 0.7, 1],
            }}
            aria-hidden
          >
            +{gainedXp} XP
          </motion.span>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/* ---------- Page ---------- */

export default function TodayPage() {
  const { user } = useAuth();
  const toast = useToast();
  const setStreak = useStore((s) => s.setStreak);
  const { today, setToday, progress, queue, setQueue, load, fetchAll, retry } =
    useTodayData();
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonSeen, setLessonSeen] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const [gainedXp, setGainedXp] = useState<number | null>(null);
  const untilTomorrow = useUntilTomorrow();

  const patch = useCallback(
    (a: Assignment) => setToday((t) => (t ? { ...t, assignment: a } : t)),
    [setToday],
  );

  const lessonTask = useStreamTask(
    (signal, on) => streamLesson(on, signal),
    (lesson) =>
      setToday((t) =>
        t?.assignment ? { ...t, assignment: { ...t.assignment, lesson } } : t,
      ),
  );
  const { run: runLesson, state: lessonState } = lessonTask;
  const hasLesson = !!today?.assignment?.lesson;

  const openLesson = useCallback(() => {
    setLessonOpen((o) => !o);
    setLessonSeen(true);
    if (!hasLesson && lessonState.status !== "running") void runLesson();
  }, [hasLesson, lessonState.status, runLesson]);

  // Deep link from the command palette: /today?lesson=1
  const ready =
    load.status === "ready" &&
    !!today?.assignment &&
    !today.assignment.completed;
  useEffect(() => {
    if (!ready) return;
    if (new URLSearchParams(window.location.search).get("lesson") !== "1")
      return;
    window.history.replaceState(null, "", "/today");
    // The URL is outside React; open on the next tick rather than mid-effect.
    const t = setTimeout(openLesson, 0);
    return () => clearTimeout(t);
  }, [ready, openLesson]);

  if (
    load.status === "loading" ||
    (load.status === "ready" && (!today || !progress))
  )
    return <TodaySkeleton />;
  if (load.status === "error" || !today || !progress)
    return (
      <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
        <ErrorPanel
          message={friendlyError(load.status === "error" ? load.error : null)}
          onRetry={retry}
        />
      </div>
    );

  const a = today.assignment;
  const first = user?.name.split(" ")[0] ?? "there";
  const hello = user ? greeting(user.name).split(",")[0] : "Hello";
  const dateLabel = new Date(`${today.today}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "long",
      day: "numeric",
      month: "long",
    },
  );
  const status = !a
    ? "No topics match your focus areas."
    : a.completed
      ? `Done for today. ${today.streak > 1 ? `That's ${today.streak} days in a row.` : "Day one of your streak."}`
      : today.streak > 0
        ? `Keep your ${today.streak}-day streak alive: about 5 minutes.`
        : "Today's topic is ready. About 5 minutes.";

  async function complete(note: string) {
    if (!a || !progress || !today) return;
    const beforeLevel = progress.level.level;
    // Optimistic: the ceremony starts now; the server confirms in the background.
    patch({
      ...a,
      completed: true,
      note: note.trim() || a.note,
      completed_at: new Date().toISOString(),
    });
    setStreak(today.streak + 1);
    setCelebrate((n) => n + 1);
    setGainedXp(10 + (note.trim() ? 5 : 0));
    setLessonOpen(false);
    setTimeout(() => setGainedXp(null), 1700);
    try {
      patch(await completeToday(note));
      const { p } = await fetchAll();
      if (p.level.level > beforeLevel) {
        toast({
          title: `Level up! Level ${p.level.level}`,
          description: `You're now a ${p.level.title}.`,
          tone: "success",
        });
        setCelebrate((n) => n + 1);
      }
    } catch (err) {
      patch(a);
      setStreak(today.streak);
      toast({
        title: "That didn't save",
        description: friendlyError(err),
        tone: "error",
      });
      throw err;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6 lg:pt-12">
      {celebrate > 0 && <Confetti fire key={celebrate} />}
      <header className="mb-10">
        <p className="text-label text-muted">{dateLabel}</p>
        <h1 className="mt-3 text-hero">
          {hello}, <CurveUnderline>{first}</CurveUnderline>
        </h1>
        <p className="mt-4 text-lg text-muted">{status}</p>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px] lg:gap-12">
        <LayoutGroup>
          <div className="grid min-w-0 content-start gap-8">
            {!a ? (
              <EmptyState
                title="Nothing to learn here… yet"
                body="Every track is switched off. Turn one back on and a topic appears right away."
                action={
                  <Link
                    href="/settings"
                    className="press neo-sm inline-flex h-11 items-center rounded-xl bg-pop px-4 font-bold text-pop-ink"
                  >
                    Choose focus areas
                  </Link>
                }
              />
            ) : (
              <Ticket
                a={a}
                lessonOpen={lessonOpen}
                lessonSeen={lessonSeen || !!a.lesson}
                onLesson={openLesson}
                onComplete={complete}
                onSwap={async () => {
                  lessonTask.stop();
                  setLessonOpen(false);
                  setLessonSeen(false);
                  patch(await swapToday());
                }}
                onNote={async (n) => {
                  patch(await saveNote(n));
                  toast({ title: "Note saved", tone: "success" });
                  void fetchAll();
                }}
                untilTomorrow={untilTomorrow}
                nextUp={queue[0] ?? null}
                gainedXp={gainedXp}
              />
            )}

            <AnimatePresence initial={false}>
              {a && lessonOpen && !a.completed && (
                <motion.section
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0, transition: spring.gentle }}
                  exit={{
                    opacity: 0,
                    y: 8,
                    transition: { duration: duration.fast },
                  }}
                  aria-label="Lesson"
                  className="px-1 sm:px-2"
                >
                  <div className="mb-6 flex items-center gap-2">
                    <BookOpenText className="size-5" aria-hidden />
                    <h2 className="text-label text-muted">
                      Your 5-minute lesson
                    </h2>
                  </div>
                  {a.lesson ? (
                    <LessonView
                      lesson={a.lesson}
                      checkDone={a.check_done}
                      onCheckDone={async () => {
                        patch({ ...a, check_done: true });
                        try {
                          patch(await markCheckDone());
                          void fetchAll();
                        } catch (err) {
                          patch(a);
                          toast({
                            title: "That didn't save",
                            description: friendlyError(err),
                            tone: "error",
                          });
                        }
                      }}
                    />
                  ) : lessonState.status === "error" ||
                    lessonState.status === "stopped" ? (
                    <ErrorPanel
                      message={
                        lessonState.status === "stopped"
                          ? "Lesson stopped."
                          : friendlyError(lessonState.error)
                      }
                      onRetry={() => void runLesson()}
                    />
                  ) : (
                    <div className="flex flex-col items-start gap-4 py-6">
                      <BallLoader
                        label={
                          lessonState.status === "running" &&
                          lessonState.chars > 200
                            ? `Writing… ${streamPercent(lessonState.chars, 3500)}%`
                            : "Finding the one idea that matters…"
                        }
                      />
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={lessonTask.stop}
                      >
                        <Square className="size-3 fill-current" aria-hidden />{" "}
                        Stop
                      </Button>
                    </div>
                  )}
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        </LayoutGroup>

        <aside
          className="grid content-start gap-8"
          aria-label="Your week and queue"
        >
          <section className="rule pt-5">
            <h2 className="text-label text-muted">This week</h2>
            <div className="mt-4">
              <WeekStrip calendar={progress.calendar} today={today.today} />
            </div>
            <div className="mt-6">
              <LevelBar level={progress.level} />
            </div>
          </section>

          <section className="rule pt-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-label text-muted">Up next</h2>
              <Link
                href="/settings#queue"
                className="link text-xs font-semibold text-muted"
              >
                Manage
              </Link>
            </div>
            <div className="mt-3">
              <QueuePanel compact items={queue} setItems={setQueue} />
            </div>
          </section>

          <Link
            href="/practice"
            className="group press neo relative overflow-hidden rounded-3xl bg-[#16131a] p-6 text-[#f7f1e3]"
          >
            <Mic className="size-6 text-[#c8f23c]" aria-hidden />
            <p className="mt-4 text-headline">Throw yourself a curveball</p>
            <p className="mt-1.5 text-sm opacity-80">
              {progress.interviews_total
                ? `${progress.interviews_total} mock interview${progress.interviews_total === 1 ? "" : "s"}${
                    progress.avg_score !== null
                      ? `, avg ${Math.round(progress.avg_score)}`
                      : ""
                  }. Weak spots become tomorrow's topics.`
                : "A 4-question mock interview. Weak spots become tomorrow's topics."}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#c8f23c]">
              Start practice{" "}
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </span>
          </Link>
        </aside>
      </div>
    </div>
  );
}
