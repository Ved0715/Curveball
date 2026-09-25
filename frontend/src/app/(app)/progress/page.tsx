"use client";

import { ArrowRight, Flame, MessageSquareQuote, Mic, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ScorePill, TrendChart } from "@/components/charts";
import { BalanceBar, Heatmap, LevelBar, TrackSticker } from "@/components/learn";
import { PageShell, PageSkeleton, PageTitle } from "@/components/page-shell";
import { ErrorPanel } from "@/components/status";
import { Card, Eyebrow, Segmented } from "@/components/ui";
import { getLearnHistory, getProgress, listHistory } from "@/lib/api";
import { friendlyError, toApiError, type ApiError } from "@/lib/errors";
import { cn, shortRound } from "@/lib/format";
import type { Assignment, HistoryItem, Progress } from "@/lib/schemas";

type Data = { progress: Progress; log: Assignment[]; interviews: HistoryItem[] };
type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; data: Data };

const fmt = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card className={cn("rounded-2xl p-4", className)}>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 font-display text-4xl leading-none font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export default function ProgressPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [span, setSpan] = useState<"30 days" | "All time">("30 days");

  useEffect(() => {
    let live = true;
    Promise.all([getProgress(), getLearnHistory(100), listHistory()])
      .then(([progress, log, interviews]) => live && setLoad({ status: "ready", data: { progress, log, interviews } }))
      .catch((err: unknown) => live && setLoad({ status: "error", error: toApiError(err) }));
    return () => {
      live = false;
    };
  }, [attempt]);

  if (load.status === "loading") return <PageSkeleton />;
  if (load.status === "error")
    return (
      <PageShell>
        <ErrorPanel
          message={friendlyError(load.error)}
          onRetry={() => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      </PageShell>
    );

  const { progress: p, log, interviews } = load.data;
  const trend = [...interviews].reverse().slice(-12);

  return (
    <PageShell wide>
      <PageTitle
        title={
          <>
            Your <em className="text-gradient">curve</em>
          </>
        }
        lede="Everything here is calculated from what you actually did. Show up, and it goes up."
      />

      <div className="grid grid-cols-1 gap-6">
        <Card className="rounded-3xl p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid size-20 shrink-0 place-items-center rounded-2xl border-2 border-line bg-sun font-display text-4xl font-extrabold text-[#16131a] shadow-[4px_4px_0_var(--shadow-color)]">
              {p.level.level}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl font-extrabold">{p.level.title}</p>
              <div className="mt-2">
                <LevelBar level={p.level} />
              </div>
              <p className="mt-2 text-xs text-muted">
                XP: learned topic 10 · reflection 5 · lesson check 5 · mock interview 20 + score/10
              </p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Streak" value={String(p.streak)} sub="days in a row" />
          <Stat label="Best streak" value={String(p.longest)} sub="all time" />
          <Stat label="Learned" value={String(p.learned_total)} sub="topics" />
          <Stat label="Consistency" value={`${Math.round(p.rate_30 * 100)}%`} sub="of the last 30 days" />
          <Stat label="Interviews" value={String(p.interviews_total)} sub="mock sessions" />
          <Stat
            label="Avg score"
            value={p.avg_score === null ? "–" : String(Math.round(p.avg_score))}
            sub={p.best_score === null ? "no reports yet" : `best ${p.best_score}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="min-w-0 rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-2">
              <Flame className="size-5" aria-hidden />
              <h2 className="font-display text-2xl font-extrabold">Last 12 weeks</h2>
            </div>
            <Heatmap calendar={p.calendar} today={p.today} />
          </Card>
          <Card className="min-w-0 rounded-3xl p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-extrabold">Balance</h2>
              <div className="w-48">
                <Segmented
                  label="Time window"
                  hideLabel
                  options={["30 days", "All time"] as const}
                  value={span}
                  onChange={setSpan}
                />
              </div>
            </div>
            <BalanceBar counts={span === "30 days" ? p.balance_30 : p.balance_all} />
            <p className="mt-4 text-sm text-muted">
              Breadth beats grinding one track. The daily pick nudges you toward whatever you&apos;ve done least.
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="min-w-0 rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareQuote className="size-5" aria-hidden />
              <h2 className="font-display text-2xl font-extrabold">Learning log</h2>
            </div>
            {log.length ? (
              <ol className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1">
                {log.map((a) => (
                  <li key={a.id} className="rounded-2xl border-2 border-line-soft bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <TrackSticker id={a.category} className="rotate-0" />
                      <span className="font-mono text-xs text-muted">{fmt(a.date)}</span>
                    </div>
                    <p className="mt-2 font-semibold">{a.title}</p>
                    {a.note && <p className="mt-1 text-sm text-muted">“{a.note}”</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted">
                Nothing yet.{" "}
                <Link href="/today" className="font-bold text-accent underline underline-offset-4">
                  Today&apos;s topic
                </Link>{" "}
                is a great place to start.
              </p>
            )}
          </Card>

          <Card className="min-w-0 rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="size-5" aria-hidden />
              <h2 className="font-display text-2xl font-extrabold">Interviews</h2>
            </div>
            {trend.length > 1 && (
              <div className="mb-4">
                <TrendChart points={trend.map((h) => ({ score: h.overall, label: `${h.role} · ${fmt(h.date)}` }))} />
              </div>
            )}
            {interviews.length ? (
              <ul className="grid gap-2">
                {interviews.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/progress/interviews/${h.id}`}
                      className="flex items-center gap-3 rounded-2xl border-2 border-line-soft bg-surface p-3 transition hover:border-line"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {h.role}
                          {h.company ? ` at ${h.company}` : ""}
                        </p>
                        <p className="text-sm text-muted">
                          {shortRound(h.round)} · {fmt(h.date)} · {h.verdict}
                        </p>
                      </div>
                      <ScorePill value={h.overall} max={100} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Link href="/practice" className="inline-flex items-center gap-2 font-bold text-accent">
                <Mic className="size-4" aria-hidden /> Do your first mock interview <ArrowRight className="size-4" />
              </Link>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
