"use client";

import { ArrowUpRight, Mic, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { CurveUnderline, TrackGlyph } from "@/components/brand";
import { ScorePill, TrendChart } from "@/components/charts";
import { CurveChart } from "@/components/curve-chart";
import { EmptyState } from "@/components/empty";
import { BalanceBar, Heatmap, LevelBar } from "@/components/learn";
import { ProgressSkeleton } from "@/components/skeleton";
import { ErrorPanel } from "@/components/status";
import { inputClass, Segmented } from "@/components/ui";
import { getLearnHistory, getProgress, listHistory } from "@/lib/api";
import { TRACKS, track } from "@/lib/brand";
import { friendlyError, toApiError, type ApiError } from "@/lib/errors";
import { cn, shortRound } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { Assignment, HistoryItem, Progress } from "@/lib/schemas";

type Data = { progress: Progress; log: Assignment[]; interviews: HistoryItem[] };
type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; data: Data };

const fmt = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Unknown categories (your own queued topics) all file under "custom". */
const trackOf = (category: string) => (TRACKS.some((t) => t.id === category) ? category : "custom");

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rule min-w-0 pt-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-headline">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const cta = "press neo-sm inline-flex h-11 items-center gap-2 rounded-xl bg-pop px-4 font-bold text-pop-ink";

/** Search + track filter; rows slide into place as the list narrows. */
function LearningLog({ log }: { log: Assignment[] }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<string | null>(null);
  const used = useMemo(() => {
    const present = new Set(log.map((a) => trackOf(a.category)));
    return [...TRACKS.map((t) => t.id as string), "custom"].filter((id) => present.has(id));
  }, [log]);

  if (!log.length)
    return (
      <EmptyState
        title="Your log starts today"
        body="Every topic you finish lands here with your note, so you can see what you actually learned."
        action={
          <Link href="/today" className={cta}>
            Open today&apos;s topic
          </Link>
        }
      />
    );

  const needle = q.trim().toLowerCase();
  const shown = log.filter(
    (a) => (!only || trackOf(a.category) === only) && (!needle || `${a.title} ${a.note ?? ""}`.toLowerCase().includes(needle)),
  );

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <label htmlFor="log-search" className="sr-only">
          Search your learning log
        </label>
        <input
          id="log-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles and notes"
          className={cn(inputClass, "pl-10")}
        />
      </div>
      {used.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Filter by track">
          {[null, ...used].map((id) => {
            const on = only === id;
            return (
              <button
                key={id ?? "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setOnly(id)}
                className={cn(
                  "relative inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
                  on ? "text-pop-ink" : "text-muted hover:text-ink",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="log-filter"
                    className="absolute inset-0 rounded-full border-2 border-line bg-pop"
                    transition={spring.snappy}
                  />
                )}
                {id && <TrackGlyph id={id} size={10} className="relative" />}
                <span className="relative">{id ? track(id).short : "All"}</span>
              </button>
            );
          })}
        </div>
      )}

      <ol className="mt-4">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((a) => (
            <motion.li
              key={a.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={spring.gentle}
              className="rule-soft grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3.5 first:border-t-0"
            >
              <TrackGlyph id={a.category} size={12} className="mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold">{a.title}</p>
                {a.note && <p className="mt-0.5 text-sm text-muted">“{a.note}”</p>}
              </div>
              <span className="pt-0.5 font-mono text-xs whitespace-nowrap text-muted">{fmt(a.date)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {!shown.length && (
        <p className="py-6 text-sm text-muted" role="status">
          Nothing matches{q ? ` “${q.trim()}”` : ""}.{" "}
          <button
            type="button"
            className="link cursor-pointer font-semibold text-ink"
            onClick={() => {
              setQ("");
              setOnly(null);
            }}
          >
            Clear filters
          </button>
        </p>
      )}
    </div>
  );
}

function StatLine({ p }: { p: Progress }) {
  const n = (v: number, suffix?: string) => (
    <b className="font-bold text-ink">
      <AnimatedNumber value={v} suffix={suffix} />
    </b>
  );
  return (
    <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted sm:text-xl">
      {n(p.learned_total)} {p.learned_total === 1 ? "topic" : "topics"} learned · {n(p.streak)}-day streak
      {p.longest > p.streak ? ` (best ${p.longest})` : ""} · showed up {n(Math.round(p.rate_30 * 100), "%")} of the last 30
      days
      {p.interviews_total > 0 && (
        <>
          {" "}
          · {n(p.interviews_total)} mock {p.interviews_total === 1 ? "interview" : "interviews"}
          {p.avg_score !== null && <>, averaging {n(Math.round(p.avg_score))}</>}
        </>
      )}
      .
    </p>
  );
}

export default function ProgressPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [span, setSpan] = useState<"30 days" | "All time">("30 days");

  useEffect(() => {
    let live = true;
    Promise.all([getProgress(), getLearnHistory(200), listHistory()])
      .then(([progress, log, interviews]) => live && setLoad({ status: "ready", data: { progress, log, interviews } }))
      .catch((err: unknown) => live && setLoad({ status: "error", error: toApiError(err) }));
    return () => {
      live = false;
    };
  }, [attempt]);

  if (load.status === "loading") return <ProgressSkeleton />;
  if (load.status === "error")
    return (
      <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
        <ErrorPanel
          message={friendlyError(load.error)}
          onRetry={() => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );

  const { progress: p, log, interviews } = load.data;
  const trend = [...interviews].reverse().slice(-12);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6 lg:pt-12">
      <header className="mb-10">
        <p className="text-label text-muted">Progress</p>
        <h1 className="mt-3 text-hero">
          Your <CurveUnderline>curve</CurveUnderline>
        </h1>
        <StatLine p={p} />
      </header>

      <div className="grid grid-cols-1 gap-14">
        <section aria-label="Learning curve" className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px] lg:items-end">
          <div className="min-w-0">
            <CurveChart calendar={p.calendar} total={p.learned_total} />
          </div>
          <div className="rule-soft pt-5">
            <p className="text-label text-muted">Level</p>
            <div className="mt-3 flex items-center gap-4">
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...spring.bouncy, delay: 0.3 }}
                className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-line bg-pop font-display text-3xl font-extrabold text-pop-ink shadow-[3px_3px_0_var(--shadow-color)]"
              >
                {p.level.level}
              </motion.span>
              <p className="text-headline">{p.level.title}</p>
            </div>
            <div className="mt-4">
              <LevelBar level={p.level} />
            </div>
            <p className="mt-3 text-xs text-muted">XP: topic 10 · note 5 · quick check 5 · interview 20 + score/10</p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
          <Section title="Last 12 weeks">
            <Heatmap calendar={p.calendar} today={p.today} />
          </Section>
          <Section
            title="Balance"
            aside={
              <div className="w-44">
                <Segmented label="Time window" hideLabel options={["30 days", "All time"] as const} value={span} onChange={setSpan} />
              </div>
            }
          >
            <BalanceBar counts={span === "30 days" ? p.balance_30 : p.balance_all} />
            <p className="mt-5 text-sm text-muted">
              Breadth beats grinding one track. The daily pick leans toward whatever you&apos;ve done least.
            </p>
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-14 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
          <Section title="Learning log" aside={<span className="font-mono text-xs text-muted">
                {log.length} {log.length === 1 ? "entry" : "entries"}
              </span>}>
            <LearningLog log={log} />
          </Section>

          <Section title="Interviews">
            {interviews.length ? (
              <>
                {trend.length > 1 && (
                  <div className="mb-5">
                    <TrendChart points={trend.map((h) => ({ score: h.overall, label: `${h.role} · ${fmt(h.date)}` }))} />
                  </div>
                )}
                <ul>
                  {interviews.map((h) => (
                    <li key={h.id} className="rule-soft first:border-t-0">
                      <Link href={`/progress/interviews/${h.id}`} className="group flex items-center gap-3 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold decoration-2 underline-offset-4 group-hover:underline">
                            {h.role}
                            {h.company ? ` at ${h.company}` : ""}
                          </p>
                          <p className="text-sm text-muted">
                            {shortRound(h.round)} · {fmt(h.date)} · {h.verdict}
                          </p>
                        </div>
                        <ScorePill value={h.overall} max={100} />
                        <ArrowUpRight
                          className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                title="No interviews yet"
                body="A mock interview shows how your learning holds up under pressure. Weak spots come back as daily topics."
                action={
                  <Link href="/practice" className={cta}>
                    <Mic className="size-4" aria-hidden /> Do your first mock interview
                  </Link>
                }
              />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
