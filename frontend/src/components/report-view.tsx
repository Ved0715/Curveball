"use client";

import { ChevronDown, CircleCheck, Dumbbell, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { shortRound, TONE_VAR, toneFor } from "@/lib/format";
import { SCORE_KEYS, type Report } from "@/lib/schemas";
import { ScoreBars, ScorePill, ScoreRing } from "./charts";
import { Confetti } from "./confetti";
import { Reveal } from "./reveal";
import { Card, Eyebrow } from "./ui";

function AnswerItem({ a, open: initial }: { a: Report["answers"][number]; open: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <li className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="grid w-full cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-3 py-5 text-left"
      >
        <span className="font-display text-xl leading-snug">{a.question}</span>
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
                <div className="rounded-2xl bg-good/[0.07] p-4">
                  <p className="mb-1 font-semibold">What worked</p>
                  <p className="text-muted">{a.worked}</p>
                </div>
                <div className="rounded-2xl bg-bad/[0.06] p-4">
                  <p className="mb-1 font-semibold">What was missing</p>
                  <p className="text-muted">{a.missing}</p>
                </div>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-line p-5">
                <div className="bg-gradient-brand absolute inset-y-0 left-0 w-1" aria-hidden />
                <Eyebrow className="mb-2">A stronger answer</Eyebrow>
                <p className="font-display text-[1.2rem] leading-relaxed">{a.better}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function ReportView({
  report,
  role,
  company,
  round,
  celebrate = false,
  actions,
}: {
  report: Report;
  role: string;
  company: string;
  round: string;
  celebrate?: boolean;
  actions?: ReactNode;
}) {
  const tone = toneFor(report.overall, 100);
  return (
    <div className="grid gap-5">
      <Confetti fire={celebrate && report.overall >= 75} />
      <Card className="relative overflow-hidden p-6 sm:p-10">
        <div
          className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full opacity-20 blur-3xl"
          style={{ background: TONE_VAR[tone] }}
        />
        <div className="relative grid items-center gap-10 md:grid-cols-[auto_1fr]">
          <div className="mx-auto">
            <ScoreRing value={report.overall} />
          </div>
          <div>
            <Eyebrow>
              {role}
              {company ? ` · ${company}` : ""} · {shortRound(round)}
            </Eyebrow>
            <p
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-bold"
              style={{ color: TONE_VAR[tone], background: `color-mix(in oklab, ${TONE_VAR[tone]} 14%, transparent)` }}
            >
              {report.verdict}
            </p>
            <p className="mt-4 font-display text-2xl leading-snug sm:text-[1.7rem]">{report.summary}</p>
          </div>
        </div>
        <div className="relative mt-10 max-w-2xl">
          <ScoreBars scores={SCORE_KEYS.map((k) => [k, report.scores[k]] as [string, number])} />
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Reveal>
          <Card className="h-full p-6 sm:p-8">
            <h2 className="font-display text-3xl tracking-tight">What worked</h2>
            <ul className="mt-5 grid gap-4">
              {report.strengths.map((s) => (
                <li key={s} className="flex gap-3">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
        <Reveal delay={0.06}>
          <Card className="h-full p-6 sm:p-8">
            <h2 className="font-display text-3xl tracking-tight">Fix these first</h2>
            <ol className="mt-5 grid gap-4">
              {report.fixes.map((f, i) => (
                <li key={f.issue} className="flex gap-3">
                  <span className="text-gradient font-display text-2xl leading-none">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{f.issue}</p>
                    <p className="text-sm text-muted">{f.how}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </Reveal>
      </div>

      <Reveal>
        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Wrench className="size-5 text-accent" aria-hidden />
            <h2 className="font-display text-3xl tracking-tight">Answer by answer</h2>
          </div>
          {report.answers.length ? (
            <ul className="mt-3">
              {report.answers.map((a, i) => (
                <AnswerItem key={`${i}-${a.question}`} a={a} open={i === 0} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted">No answers were scored.</p>
          )}
        </Card>
      </Reveal>

      <Reveal>
        <Card className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Dumbbell className="size-5 text-accent" aria-hidden />
            <h2 className="font-display text-3xl tracking-tight">Practise before next time</h2>
          </div>
          <ul className="mt-5 grid gap-3 md:grid-cols-3">
            {report.drills.map((d, i) => (
              <li key={d} className="rounded-2xl bg-surface p-4 text-sm">
                <span className="font-mono text-xs text-muted">Drill {i + 1}</span>
                <p className="mt-1">{d}</p>
              </li>
            ))}
          </ul>
        </Card>
      </Reveal>

      {actions && <div className="mt-4 flex flex-col gap-3 sm:flex-row">{actions}</div>}
    </div>
  );
}
