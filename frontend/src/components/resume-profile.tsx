"use client";

import { ChevronDown, FileText, GraduationCap, ScanSearch, ShieldCheck, TrendingUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useId, useState } from "react";
import type { ResumeProfile } from "@/lib/schemas";
import { Reveal } from "./reveal";
import { Card, Chip, Eyebrow } from "./ui";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** One-line summary of what was found, e.g. "2 roles · 3 projects · 12 skills · 5 numbers". */
function summaryLine(p: ResumeProfile) {
  return [
    p.experience.length && plural(p.experience.length, "role"),
    p.projects.length && plural(p.projects.length, "project"),
    p.skills.length && plural(p.skills.length, "skill"),
    p.metrics.length && plural(p.metrics.length, "number"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h3 className="mb-3 font-mono text-[0.72rem] uppercase tracking-[0.16em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

function ProfileDetail({ p }: { p: ResumeProfile }) {
  return (
    <div className="border-t border-line px-6 pt-7 pb-6 sm:px-8">
      {p.metrics.length > 0 && (
        <Section title="Numbers you can cite">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {p.metrics.map((m, i) => (
              <li key={`${m.value}-${i}`} className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-gradient font-display text-3xl leading-none">{m.value}</p>
                <p className="mt-2 text-xs text-muted">{m.context}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.experience.length > 0 && (
        <Section title="Experience">
          <ol className="relative ml-1.5 border-l border-line">
            {p.experience.map((r, i) => (
              <li key={`${r.company}-${i}`} className="relative pb-6 pl-6 last:pb-0">
                <span className="bg-gradient-brand absolute top-1.5 -left-[5px] size-2.5 rounded-full" aria-hidden />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold">
                    {r.title} <span className="font-normal text-muted">· {r.company}</span>
                  </p>
                  {r.period && <p className="font-mono text-xs text-muted">{r.period}</p>}
                </div>
                {r.highlights.length > 0 && (
                  <ul className="mt-2 grid gap-1 text-sm text-muted">
                    {r.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <span aria-hidden>–</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {p.projects.length > 0 && (
        <Section title="Projects">
          <ul className="grid gap-3 sm:grid-cols-2">
            {p.projects.map((pr) => (
              <li key={pr.name} className="rounded-2xl border border-line bg-surface p-4">
                <p className="font-semibold">{pr.name}</p>
                <p className="mt-1 text-sm text-muted">{pr.summary}</p>
                {pr.impact && (
                  <p className="mt-2 flex items-start gap-1.5 text-sm">
                    <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden />
                    {pr.impact}
                  </p>
                )}
                {pr.tech.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {pr.tech.map((t) => (
                      <span key={t} className="rounded-md bg-surface-strong px-2 py-0.5 font-mono text-[0.7rem]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {p.skills.length > 0 && (
        <Section title="Skills">
          <div className="flex flex-wrap gap-2">
            {p.skills.map((sk) => (
              <Chip key={sk} className="py-0.5 text-[0.82rem]">
                {sk}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {p.education.length > 0 && (
        <Section title="Education">
          <ul className="grid gap-1.5 text-sm">
            {p.education.map((e) => (
              <li key={e} className="flex items-center gap-2">
                <GraduationCap className="size-4 text-muted" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="mt-8 flex items-start gap-2 rounded-2xl bg-good/[0.07] p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
        <span>
          Everything here was found in your resume; anything we couldn&apos;t verify was left out. Missing something
          important?{" "}
          <Link href="/practice" className="font-semibold underline underline-offset-4">
            Update your resume
          </Link>{" "}
          and start a new interview.
        </span>
      </p>
    </div>
  );
}

/**
 * Shows the candidate what the AI understood from their resume, so they can trust (or fix)
 * what every question and model answer will be built on. Collapsed by default: the brief
 * is the main content; this is supporting evidence.
 */
export function ResumeProfileCard({ profile, hasResume }: { profile: ResumeProfile | null; hasResume: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!hasResume)
    return (
      <Reveal>
        <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex gap-3">
            <FileText className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
            <div>
              <p className="font-semibold">No resume added</p>
              <p className="text-sm text-muted">
                Questions and model answers will be generic. Add your resume for answers built from your real work.
              </p>
            </div>
          </div>
          <Link
            href="/practice"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold transition hover:bg-surface-strong"
          >
            Add resume
          </Link>
        </Card>
      </Reveal>
    );

  if (!profile)
    return (
      <Reveal>
        <Card className="flex gap-3 p-6 sm:p-7">
          <ScanSearch className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="font-semibold">Using your resume as written</p>
            <p className="text-sm text-muted">
              We couldn&apos;t break it down into roles and projects this time, so questions use the full text instead.
            </p>
          </div>
        </Card>
      </Reveal>
    );

  const summary = summaryLine(profile);
  return (
    <Reveal>
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full cursor-pointer items-center gap-4 p-6 text-left transition hover:bg-surface sm:p-7"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-surface-strong">
            <ScanSearch className="size-5 text-accent" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <Eyebrow>What we read from your resume</Eyebrow>
            <span className="mt-1 block truncate font-display text-2xl leading-tight">{profile.headline}</span>
            {summary && <span className="mt-1 block text-sm text-muted">{summary}</span>}
          </span>
          <ChevronDown
            className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={panelId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <ProfileDetail p={profile} />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </Reveal>
  );
}
