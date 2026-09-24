"use client";

import { ArrowRight, ShieldCheck, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ScorePill, TrendChart } from "@/components/charts";
import { ConfirmDialog } from "@/components/dialog";
import { PageShell, PageSkeleton, PageTitle } from "@/components/page-shell";
import { ErrorPanel } from "@/components/status";
import { Button, Card, Eyebrow } from "@/components/ui";
import { deleteMyData, deleteSession, forgetClientId, listHistory } from "@/lib/api";
import { friendlyError, toApiError, type ApiError } from "@/lib/errors";
import { shortRound } from "@/lib/format";
import type { HistoryItem } from "@/lib/schemas";
import { useStore } from "@/lib/store";

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; items: HistoryItem[] };

export default function HistoryPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wipe, setWipe] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [rowError, setRowError] = useState<string>();
  const sessionId = useStore((s) => s.sessionId);
  const closeSession = useStore((s) => s.closeSession);
  const resetStore = useStore((s) => s.reset);

  const fetchHistory = useCallback(async () => {
    try {
      setLoad({ status: "ready", items: await listHistory() });
    } catch (err) {
      setLoad({ status: "error", error: toApiError(err) });
    }
  }, []);

  useEffect(() => {
    let live = true;
    listHistory()
      .then((items) => live && setLoad({ status: "ready", items }))
      .catch((err: unknown) => live && setLoad({ status: "error", error: toApiError(err) }));
    return () => {
      live = false;
    };
  }, []);

  async function removeOne(id: string) {
    setRowError(undefined);
    try {
      await deleteSession(id);
      if (id === sessionId) closeSession();
      setLoad((l) => (l.status === "ready" ? { ...l, items: l.items.filter((h) => h.id !== id) } : l));
    } catch (err) {
      setRowError(friendlyError(err));
    }
  }

  async function wipeEverything() {
    setWipe({ busy: true });
    try {
      await deleteMyData();
      forgetClientId();
      resetStore();
      setConfirmWipe(false);
      setWipe({ busy: false });
      setLoad({ status: "ready", items: [] });
    } catch (err) {
      setWipe({ busy: false, error: friendlyError(err) });
    }
  }

  if (load.status === "loading") return <PageSkeleton />;

  const items = load.status === "ready" ? load.items : [];
  const recent = items.slice(0, 12).reverse();
  const best = items.reduce((m, h) => Math.max(m, h.overall), 0);
  const avg = items.length ? Math.round(items.reduce((s, h) => s + h.overall, 0) / items.length) : 0;
  const delta = recent.length > 1 ? recent[recent.length - 1].overall - recent[0].overall : null;

  return (
    <PageShell>
      <PageTitle
        title={
          <>
            Your practice <em className="text-gradient">history</em>
          </>
        }
        lede="Every scored interview is saved so you can watch your scores move."
      />

      {load.status === "error" ? (
        <ErrorPanel message={friendlyError(load.error)} onRetry={() => void fetchHistory()} />
      ) : !items.length ? (
        <Card className="p-10 text-center">
          <p className="font-display text-3xl">No interviews yet</p>
          <p className="mt-2 text-muted">Finish your first mock interview and it will show up here.</p>
          <Link
            href="/practice"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-ink px-6 font-semibold text-bg transition hover:-translate-y-0.5"
          >
            Set up your first one <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Interviews", String(items.length)],
              ["Average score", String(avg)],
              ["Best score", String(best)],
            ].map(([label, value], i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card className="p-6">
                  <Eyebrow>{label}</Eyebrow>
                  <p className="mt-2 font-display text-5xl">{value}</p>
                </Card>
              </motion.div>
            ))}
          </div>

          {recent.length > 1 && (
            <Card className="p-6 sm:p-8">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-3xl tracking-tight">Score trend</h2>
                {delta !== null && (
                  <span className="font-mono text-sm text-muted">
                    {delta >= 0 ? "+" : ""}
                    {delta} over last {recent.length}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <TrendChart
                  points={recent.map((h) => ({ score: h.overall, label: `${h.role} · ${dateLabel(h.date)}` }))}
                />
              </div>
            </Card>
          )}

          <Card className="p-2 sm:p-3">
            {rowError && (
              <p role="alert" className="px-4 pt-3 text-sm text-bad">
                {rowError}
              </p>
            )}
            <ul>
              {items.map((h) => (
                <li
                  key={h.id}
                  className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-surface sm:px-4"
                >
                  <Link href={`/history/${h.id}`} className="flex flex-1 items-center gap-4">
                    <div className="flex-1">
                      <p className="font-semibold">
                        {h.role}
                        {h.company ? ` at ${h.company}` : ""}
                      </p>
                      <p className="text-sm text-muted">
                        {shortRound(h.round)} · {dateLabel(h.date)} · {h.verdict}
                      </p>
                    </div>
                    <ScorePill value={h.overall} max={100} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void removeOne(h.id)}
                    className="grid size-9 cursor-pointer place-items-center rounded-xl text-muted opacity-60 transition hover:bg-bad/10 hover:text-bad group-hover:opacity-100"
                    aria-label={`Delete ${h.role} interview from ${dateLabel(h.date)}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card className="mt-10 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
          <div>
            <p className="font-semibold">Your data, your call</p>
            <p className="text-sm text-muted">
              Delete every interview, transcript, report and resume we hold for you. This can&apos;t be undone.
            </p>
          </div>
        </div>
        <Button variant="danger" size="sm" onClick={() => setConfirmWipe(true)} className="shrink-0">
          <Trash2 className="size-4" aria-hidden /> Delete all my data
        </Button>
      </Card>

      <ConfirmDialog
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Delete all your data?"
        body="This permanently removes every interview, transcript, report and resume stored for you."
        confirmLabel="Delete everything"
        danger
        busy={wipe.busy}
        error={wipe.error}
        onConfirm={() => void wipeEverything()}
      />
    </PageShell>
  );
}
