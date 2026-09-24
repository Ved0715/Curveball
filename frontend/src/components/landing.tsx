"use client";

import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Brain,
  MessageSquareQuote,
  Mic,
  Target,
  TrendingUp,
} from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Aurora } from "./aurora";
import { ScoreBars, ScorePill, ScoreRing } from "./charts";
import { InterviewerOrb, Waveform, type OrbMode } from "./orb";
import { Reveal, WordReveal } from "./reveal";
import { Card, Chip, Eyebrow } from "./ui";
import { useReducedMotion } from "@/lib/motion";

const DEMO = [
  {
    q: "Walk me through the payments retry service on your resume. What did you personally own?",
    a: "I designed the idempotency layer and cut duplicate charges to zero…",
  },
  {
    q: "You said latency dropped 40%. How did you measure that, and what did it cost?",
    a: "We compared p95 over two weeks before and after, on the same traffic…",
  },
  {
    q: "Tell me about a time you pushed back on a product decision.",
    a: "Our PM wanted to ship without rate limits. I brought data from…",
  },
];

/** A tiny self-playing interview: question types in, candidate answers, repeat. */
function LivePreview() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<OrbMode>("thinking");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    if (reduce) return;
    const { q, a } = DEMO[i];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 700;
    timers.push(setTimeout(() => setPhase("speaking"), t));
    for (let c = 1; c <= q.length; c++) timers.push(setTimeout(() => setTyped(q.slice(0, c)), (t += 22)));
    timers.push(setTimeout(() => setPhase("listening"), (t += 400)));
    for (let c = 1; c <= a.length; c++) timers.push(setTimeout(() => setAnswer(a.slice(0, c)), (t += 28)));
    timers.push(
      setTimeout(() => {
        setPhase("thinking");
        setTyped("");
        setAnswer("");
        setI((n) => (n + 1) % DEMO.length);
      }, (t += 1800)),
    );
    return () => timers.forEach(clearTimeout);
  }, [i, reduce]);

  // 3D tilt that follows the pointer
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-9, 9]), { stiffness: 150, damping: 18 });

  return (
    <motion.div
      ref={ref}
      onPointerMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      className="relative"
    >
      <div className="bg-gradient-brand absolute -inset-px rounded-[28px] opacity-40 blur-xl" aria-hidden />
      <Card className="relative overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-semibold">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-bad opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-bad" />
            </span>
            LIVE · Question {i + 1} of 7
          </span>
          <span className="font-mono text-xs text-muted">Tough interviewer</span>
        </div>
        <div className="mt-6 flex items-center gap-4">
          <InterviewerOrb mode={phase} initial="M" size={56} />
          <div>
            <p className="text-sm font-semibold">Meera</p>
            <p className="text-xs text-muted">Engineering Manager · Razorpay</p>
          </div>
        </div>
        <p className="mt-5 min-h-[5.5rem] font-display text-[1.6rem] leading-snug tracking-tight">
          {reduce ? DEMO[0].q : typed}
          {!reduce && phase === "speaking" && <span className="caret" />}
        </p>
        <div className="mt-4 rounded-2xl border border-line bg-bg/50 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted">
              <Mic className="size-3.5" aria-hidden /> Your answer
            </span>
            <Waveform levels={Array.from({ length: 18 }, () => 0)} active={false} />
          </div>
          <p className="mt-2 min-h-[3rem] text-sm text-muted">
            {reduce ? DEMO[0].a : answer}
            {!reduce && phase === "listening" && <span className="caret" />}
          </p>
        </div>
        <AnimatePresence>
          {phase === "thinking" && i > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute right-6 bottom-6"
            >
              <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
                Last answer <ScorePill value={7} max={10} />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

const ROLES = [
  "Backend Engineer",
  "Product Analyst",
  "Data Scientist",
  "Product Manager",
  "SDE-1 · Fresher",
  "Frontend Engineer",
  "Business Analyst",
  "Consultant",
  "DevOps Engineer",
  "UX Designer",
  "Engineering Manager",
  "ML Engineer",
];

function Marquee() {
  return (
    <div className="relative overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused]">
        {[...ROLES, ...ROLES].map((r, i) => (
          <Chip key={i} className="text-muted">
            {r}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Card with a spotlight border that follows the cursor. */
function SpotlightCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [pos, setPos] = useState({ x: -999, y: -999 });
  return (
    <div
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onPointerLeave={() => setPos({ x: -999, y: -999 })}
      className={`group glass relative overflow-hidden rounded-3xl p-6 transition-transform duration-300 hover:-translate-y-1 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(420px circle at ${pos.x}px ${pos.y}px, color-mix(in oklab, var(--accent) 14%, transparent), transparent 45%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

const FEATURES = [
  {
    icon: MessageSquareQuote,
    title: "Follow-ups that feel real",
    body: "Vague answer? It probes for your role, the numbers and the trade-offs, exactly once, like a real panel.",
    span: "md:col-span-2",
  },
  {
    icon: Target,
    title: "Honest scoring",
    body: "Scored against your experience level. A vague answer never gets above 5/10.",
    span: "",
  },
  {
    icon: BookOpen,
    title: "Prep brief from your resume",
    body: "What they'll judge, where you're strong, what they'll worry about, and 8 likely questions with your angle.",
    span: "",
  },
  {
    icon: Brain,
    title: "Model answers in your voice",
    body: "Every answer gets a stronger version written from your real projects, not a generic template.",
    span: "md:col-span-2",
  },
  {
    icon: AudioLines,
    title: "Speak or type",
    body: "Answer out loud with live transcription, and have questions read aloud.",
    span: "",
  },
  {
    icon: TrendingUp,
    title: "Watch yourself improve",
    body: "Every session is saved with a score trend so you can see the progress.",
    span: "md:col-span-2",
  },
];

const STEPS = [
  ["Set up", "Role, company, level, round, and your resume. Upload a PDF or paste it."],
  ["Prep brief", "A focused plan built from the job description and your real experience."],
  ["Mock interview", "One question at a time, real follow-ups, a timer, and a hint if you're stuck."],
  ["Scored report", "0–100 score, five sub-scores, top fixes, and a better answer for every question."],
];

export function Landing() {
  return (
    <div className="relative">
      <Aurora />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Chip className="text-xs">
              <span className="bg-gradient-brand size-1.5 rounded-full" /> AI interview coach · free to try
            </Chip>
          </motion.div>
          <h1 className="mt-6 font-display text-[clamp(3rem,8.5vw,6.2rem)] leading-[0.95] tracking-[-0.03em]">
            <WordReveal text="Practise the interview" />
            <br />
            <em className="text-gradient pr-2 not-italic sm:italic">
              <WordReveal text="before it counts." delay={0.25} />
            </em>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55 }}
            className="mt-6 max-w-xl text-lg text-muted"
          >
            A prep brief built from your resume, a live AI interviewer that asks the follow-ups a real one would, and
            an honest report with better answers written from your own experience.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/practice"
              className="group relative inline-flex h-14 items-center gap-2.5 overflow-hidden rounded-2xl bg-ink px-7 font-semibold text-bg transition hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-8px_var(--accent)]"
            >
              <span className="bg-gradient-brand absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <span className="relative">Start a mock interview</span>
              <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <a
              href="#how"
              className="inline-flex h-14 items-center rounded-2xl border border-line bg-surface px-6 font-medium transition hover:bg-surface-strong"
            >
              How it works
            </a>
          </motion.div>
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-12 flex gap-10"
          >
            {[
              ["7", "round types"],
              ["3", "interviewer styles"],
              ["0", "sign-ups needed"],
            ].map(([n, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className="font-display text-4xl">{n}</dd>
                <dd className="text-sm text-muted">{l}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <LivePreview />
        </motion.div>
      </section>

      <Marquee />

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6">
        <Reveal>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 max-w-2xl font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">
            Four steps. <span className="text-muted">About twenty minutes.</span>
          </h2>
        </Reveal>
        <ol className="mt-14 grid gap-4 md:grid-cols-4">
          {STEPS.map(([t, b], i) => (
            <Reveal key={t} delay={i * 0.08} className="h-full">
              <li className="glass relative h-full rounded-3xl p-6">
                <span className="text-gradient font-display text-6xl leading-none">{i + 1}</span>
                <h3 className="mt-6 text-lg font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted">{b}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Features bento */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <Eyebrow>Why it works</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl">
            Feels like the real thing. <em className="text-gradient">Coaches like a mentor.</em>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.08} className={f.span}>
              <SpotlightCard className="h-full">
                <span className="grid size-11 place-items-center rounded-2xl border border-line bg-surface-strong">
                  <f.icon className="size-5 text-accent" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 max-w-md text-sm text-muted">{f.body}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Report preview */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <Card className="grid items-center gap-10 p-8 sm:p-12 lg:grid-cols-[auto_1fr]">
            <ScoreRing value={78} />
            <div>
              <Eyebrow>Sample report</Eyebrow>
              <p className="mt-2 inline-flex rounded-full bg-good/15 px-3 py-1 text-sm font-semibold text-good">Hire</p>
              <p className="mt-4 max-w-xl font-display text-2xl leading-snug">
                “Strong ownership stories and clear structure. Your answers lose points when results aren&apos;t
                quantified. Put a number on every outcome.”
              </p>
              <div className="mt-8 max-w-lg">
                <ScoreBars
                  scores={[
                    ["Content", 8],
                    ["Structure", 8],
                    ["Specificity", 6],
                    ["Communication", 9],
                    ["Role fit", 7],
                  ]}
                />
              </div>
            </div>
          </Card>
        </Reveal>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[32px] border border-line p-10 text-center sm:p-16">
            <div className="bg-gradient-brand absolute inset-0 opacity-[0.14]" aria-hidden />
            <div className="grid-lines absolute inset-0" aria-hidden />
            <h2 className="relative font-display text-5xl leading-none tracking-tight sm:text-7xl">
              Your next interview
              <br />
              <em className="text-gradient">starts here.</em>
            </h2>
            <Link
              href="/practice"
              className="relative mt-10 inline-flex h-14 items-center gap-2.5 rounded-2xl bg-ink px-8 font-semibold text-bg transition hover:-translate-y-0.5"
            >
              Start practising free <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Mock Room</p>
          <p>Your interviews are saved to your history. Delete them any time.</p>
        </div>
      </footer>
    </div>
  );
}
