"use client";

import { ArrowRight, ChevronDown, CircleAlert, CircleCheck, Pencil, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PageTitle } from "@/components/page-shell";
import { SessionGate } from "@/components/session-gate";
import { ResumeProfileCard } from "@/components/resume-profile";
import { Reveal } from "@/components/reveal";
import { ErrorPanel, StreamingPanel } from "@/components/status";
import { Button, Card, Chip, Eyebrow } from "@/components/ui";
import { getSession, streamBrief } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { shortRound, streamPercent } from "@/lib/format";
import type { Brief, Session } from "@/lib/schemas";
import { useStore } from "@/lib/store";
import { useStreamTask } from "@/lib/use-task";

const CONFIDENCE = {
  high: "Based on well-known public information.",
  medium: "From general knowledge. Double-check recent news before the interview.",
  low: "Limited company info. Look up their recent news, products and values yourself.",
};

function Section({ title, eyebrow, children, delay = 0 }: { title: string; eyebrow?: string; children: ReactNode; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <Card className="p-6 sm:p-8">
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h2 className="font-display text-3xl tracking-tight">{title}</h2>
        <div className="mt-5">{children}</div>
      </Card>
    </Reveal>
  );
}

function QuestionCard({ n, q }: { n: number; q: Brief["questions"][number] }) {
  const [open, setOpen] = useState(n === 1);
  return (
    <li className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="grid w-full cursor-pointer grid-cols-[2.25rem_1fr_auto] items-start gap-3 py-4 text-left"
      >
        <span className="text-gradient font-display text-2xl leading-tight">{n}</span>
        <span className="font-display text-xl leading-snug">{q.q}</span>
        <ChevronDown className={`mt-1.5 size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 pb-5 pl-12 text-sm sm:grid-cols-2">
              <div className="rounded-2xl bg-surface p-4">
                <p className="mb-1 font-semibold">What they&apos;re testing</p>
                <p className="text-muted">{q.why}</p>
              </div>
              <div className="rounded-2xl bg-accent/[0.08] p-4">
                <p className="mb-1 font-semibold">Your angle</p>
                <p className="text-muted">{q.tip}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function BriefView({ session, brief, onStart }: { session: Session; brief: Brief; onStart: () => void }) {
  const setup = session.setup;
  return (
    <>
      <PageTitle
        step="Step 2 of 4 · Prep brief"
        title={
          <>
            Your <em className="text-gradient">prep brief</em>
          </>
        }
        lede={`${setup.role}${setup.company ? ` at ${setup.company}` : ""}, ${shortRound(setup.round).toLowerCase()} round. Read it once, then start the interview.`}
      >
        <Button size="lg" onClick={onStart} className="shrink-0">
          Start interview <ArrowRight className="size-4" aria-hidden />
        </Button>
      </PageTitle>

      <div className="grid grid-cols-1 gap-5">
        <ResumeProfileCard profile={session.resume_profile} hasResume={!!setup.resume.trim()} />
        <Section title={setup.company || "The company"} eyebrow="Company">
          <p className="max-w-3xl">{brief.company.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {brief.company.values.map((v) => (
              <Chip key={v}>{v}</Chip>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">{CONFIDENCE[brief.company.confidence]}</p>
        </Section>

        <Section title="What this round will judge" delay={0.05}>
          <div className="flex flex-wrap gap-2">
            {brief.focus.map((f, i) => (
              <motion.span
                key={f}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <Chip className="bg-surface-strong">{f}</Chip>
              </motion.span>
            ))}
          </div>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Where you're strong">
            <ul className="grid gap-4">
              {brief.strengths.map((s) => (
                <li key={s.point} className="flex gap-3">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
                  <div>
                    <p className="font-semibold">{s.point}</p>
                    <p className="text-sm text-muted">{s.evidence}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="What they may worry about" delay={0.05}>
            <ul className="grid gap-4">
              {brief.gaps.map((g) => (
                <li key={g.point} className="flex gap-3">
                  <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
                  <div>
                    <p className="font-semibold">{g.point}</p>
                    <p className="text-sm text-muted">{g.how}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title="Questions you'll likely get" eyebrow={`${brief.questions.length} questions`}>
          <ol>
            {brief.questions.map((q, i) => (
              <QuestionCard key={q.q} n={i + 1} q={q} />
            ))}
          </ol>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Stories to have ready">
            <ul className="grid gap-3">
              {brief.stories.map((s) => (
                <li key={s.theme} className="rounded-2xl bg-surface p-4">
                  <p className="font-mono text-xs uppercase tracking-wider text-accent">{s.theme}</p>
                  <p className="mt-1 text-sm">{s.use}</p>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Questions to ask them" delay={0.05}>
            <ul className="grid gap-3">
              {brief.askThem.map((q) => (
                <li key={q} className="flex gap-3 text-sm">
                  <span className="text-gradient font-display text-xl leading-none">?</span>
                  {q}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={onStart}>
          Start the mock interview <ArrowRight className="size-4" aria-hidden />
        </Button>
        <Link
          href="/practice"
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-7 font-medium transition hover:bg-surface-strong"
        >
          <Pencil className="size-4" aria-hidden /> Edit setup
        </Link>
      </div>
    </>
  );
}

function BriefFlow({ session }: { session: Session }) {
  const router = useRouter();
  const patchSession = useStore((s) => s.patchSession);
  const openSession = useStore((s) => s.openSession);
  const { state, run, stop } = useStreamTask(
    (signal, on) => streamBrief(session.id, on, signal),
    (brief) => {
      patchSession((s) => ({ ...s, brief, status: s.status === "setup" ? "brief" : s.status }));
      // The resume profile was finished on the server while the brief was written; pick it up.
      getSession(session.id).then(openSession, () => {});
    },
  );

  useEffect(() => {
    if (!session.brief && state.status === "idle") void run();
  }, [session.brief, state.status, run]);

  const begin = () => router.push("/practice/interview");

  if (session.brief) return <BriefView session={session} brief={session.brief} onStart={begin} />;

  if (state.status === "error" || state.status === "stopped")
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle step="Step 2 of 4 · Prep brief" title="Brief not ready" />
        <ErrorPanel
          message={state.status === "stopped" ? "You stopped the brief before it finished." : friendlyError(state.error)}
          onRetry={state.status === "stopped" || state.error.retryable ? run : undefined}
        >
          <Button variant="ghost" size="sm" onClick={begin}>
            Skip to interview
          </Button>
        </ErrorPanel>
        <Link href="/practice" className="mt-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
          <RotateCcw className="size-3.5" aria-hidden /> Edit setup
        </Link>
      </div>
    );

  return (
    <StreamingPanel
      title="Building your prep brief"
      lede="Reading the job description and your resume, then working out what they'll test and how you match. Usually 20–60 seconds."
      lines={[
        "Reading the job description…",
        "Matching your resume to the role…",
        "Predicting the questions…",
        "Finding your best stories…",
      ]}
      percent={state.status === "running" ? streamPercent(state.chars, 5500) : null}
      steps={
        session.setup.resume.trim()
          ? [
              { key: "resume", label: "Read your resume", active: "Reading your resume…" },
              { key: "writing", label: "Write your brief", active: "Writing your brief…" },
            ]
          : undefined
      }
      stage={state.status === "running" ? state.stage : null}
      onStop={stop}
    />
  );
}

export default function BriefPage() {
  return <SessionGate>{(session) => <BriefFlow session={session} />}</SessionGate>;
}
