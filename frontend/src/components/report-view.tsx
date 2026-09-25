"use client";

import { Check, ChevronDown, CircleCheck, ListPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { shortRound, TONE_VAR, toneFor } from "@/lib/format";
import { SCORE_KEYS, type Report } from "@/lib/schemas";
import { ScoreBars, ScorePill, ScoreRing } from "./charts";
import { Confetti } from "./confetti";
import { Reveal } from "./reveal";
import { Stamp } from "./brand";
import { Card, Eyebrow } from "./ui";

function AnswerItem({ a, open: initial }: { a: Report["answers"][number]; open: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <li className="rule-soft first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group grid w-full cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-3 py-5 text-left"
      >
        <span className="text-lg leading-snug font-semibold decoration-2 underline-offset-4 group-hover:underline">{a.question}</span>
        <ScorePill value={a.score} max={10} />
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 pb-6 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="border-l-4 border-good pl-4">
                  <p className="mb-1 text-label text-good">What worked</p>
                  <p className="text-muted">{a.worked}</p>
                </div>
                <div className="border-l-4 border-bad pl-4">
                  <p className="mb-1 text-label text-bad">What was missing</p>
                  <p className="text-muted">{a.missing}</p>
                </div>
              </div>
              <div className="rounded-xl border-2 border-line bg-pop/15 p-5">
                <p className="mb-2 text-label">A stronger answer</p>
                <p className="text-[1.05rem] leading-relaxed">{a.better}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Turns a weak spot into a future daily topic: the loop between practice and learning. */
function QueueButton({ onQueue }: { onQueue: () => Promise<void> }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <button
      type="button"
      disabled={state === "busy" || state === "done"}
      onClick={async () => {
        setState("busy");
        try {
          await onQueue();
          setState("done");
        } catch {
          setState("error");
        }
      }}
      className={
        state === "done"
          ? "mt-2 inline-flex items-center gap-1 text-xs font-bold text-good"
          : "mt-2 inline-flex cursor-pointer items-center gap-1 rounded-full border-2 border-line bg-surface px-2.5 py-0.5 text-xs font-bold transition hover:bg-pop hover:text-pop-ink disabled:opacity-60"
      }
    >
      {state === "done" ? (
        <>
          <Check className="size-3.5" strokeWidth={3} aria-hidden /> In your learning queue
        </>
      ) : state === "error" ? (
        "Couldn't add. Try again"
      ) : (
        <>
          <ListPlus className="size-3.5" aria-hidden /> Add to my learning queue
        </>
      )}
    </button>
  );
}

export function ReportView({
  report,
  role,
  company,
  round,
  celebrate = false,
  actions,
  onQueue,
}: {
  report: Report;
  role: string;
  company: string;
  round: string;
  celebrate?: boolean;
  actions?: ReactNode;
  /** When given, weak spots get an "add to my learning queue" button. */
  onQueue?: (title: string, blurb: string) => Promise<void>;
}) {
  const tone = toneFor(report.overall, 100);
  return (
    <div className="grid grid-cols-1 gap-12">
      <Confetti fire={celebrate && report.overall >= 75} />
      <Card className="relative overflow-hidden p-6 sm:p-10">
        <div className="relative grid items-center gap-10 md:grid-cols-[auto_1fr]">
          <div className="mx-auto">
            <ScoreRing value={report.overall} />
          </div>
          <div>
            <Eyebrow>
              {role}
              {company ? ` · ${company}` : ""} · {shortRound(round)}
            </Eyebrow>
            <Stamp className="mt-4" style={{ color: TONE_VAR[tone], borderColor: TONE_VAR[tone] }}>
              {report.verdict}
            </Stamp>
            <p className="mt-5 text-title">{report.summary}</p>
          </div>
        </div>
        <div className="relative mt-10 max-w-2xl">
          <ScoreBars scores={SCORE_KEYS.map((k) => [k, report.scores[k]] as [string, number])} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-10">
        <Reveal>
          <section className="rule h-full pt-5">
            <h2 className="text-headline">What worked</h2>
            <ul className="mt-5 grid gap-4">
              {report.strengths.map((s) => (
                <li key={s} className="flex gap-3">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
        <Reveal delay={0.06}>
          <section className="rule h-full pt-5">
            <h2 className="text-headline">Fix these first</h2>
            <ol className="mt-5 grid gap-4">
              {report.fixes.map((f, i) => (
                <li key={f.issue} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-line bg-pop font-mono text-sm font-bold text-pop-ink">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{f.issue}</p>
                    <p className="text-sm text-muted">{f.how}</p>
                    {onQueue && <QueueButton onQueue={() => onQueue(f.issue, f.how)} />}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>
      </div>

      <Reveal>
        <section className="rule pt-5">
          <h2 className="text-headline">Answer by answer</h2>
          {report.answers.length ? (
            <ul className="mt-3">
              {report.answers.map((a, i) => (
                <AnswerItem key={`${i}-${a.question}`} a={a} open={i === 0} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted">No answers were scored.</p>
          )}
        </section>
      </Reveal>

      <Reveal>
        <section className="rule pt-5">
          <h2 className="text-headline">Practise before next time</h2>
          <ul className="mt-5 grid gap-3 md:grid-cols-3">
            {report.drills.map((d, i) => (
              <li key={d} className="border-l-4 border-pop pl-4 text-sm">
                <span className="text-label text-muted">Drill {i + 1}</span>
                <p className="mt-1">{d}</p>
                {onQueue && <QueueButton onQueue={() => onQueue(d.slice(0, 200), "A drill from your mock interview.")} />}
              </li>
            ))}
          </ul>
        </section>
      </Reveal>

      {actions && <div className="rule flex flex-col gap-3 pt-6 sm:flex-row">{actions}</div>}
    </div>
  );
}
