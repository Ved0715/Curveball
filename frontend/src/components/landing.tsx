"use client";

import {
  ArrowDown,
  ArrowRight,
  BookOpenText,
  Check,
  Flame,
  ListPlus,
  Mic,
  Search,
  Shuffle,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import { ScorePill } from "./charts";
import { LogoMark } from "./logo";
import { InterviewerOrb, type OrbMode } from "./orb";
import { Reveal, WordReveal } from "./reveal";
import { Eyebrow } from "./ui";

/* ---------- Hero visuals ---------- */

function TodayCardMock() {
  return (
    <div className="neo bg-surface relative rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <span
          className="sticker bg-surface text-xs uppercase tracking-wider"
          style={{ boxShadow: "3px 3px 0 var(--track-system-design)" }}
        >
          🏗️ System design
        </span>
        <span className="flex items-center gap-1 font-bold">
          <Flame className="size-5 fill-[var(--sun)] text-[var(--track-dsa)]" aria-hidden /> 12
        </span>
      </div>
      <p className="mt-4 font-display text-3xl leading-tight font-extrabold">CAP theorem, in practice</p>
      <p className="mt-2 text-sm text-muted">
        Consistency, availability, partition tolerance, understood through real examples instead of memorising the
        triangle.
      </p>
      <p className="mt-4 flex items-start gap-2 text-sm">
        <Search className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden /> Match 3 databases you know to where they
        sit on CAP
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="neo-sm inline-flex items-center gap-1.5 rounded-xl bg-pop px-3.5 py-2 text-sm font-bold text-pop-ink">
          <Check className="size-4" strokeWidth={3} aria-hidden /> Mark as learned
        </span>
        <span className="neo-sm inline-flex items-center gap-1.5 rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold">
          <Sparkles className="size-4" aria-hidden /> Teach me in 5 min
        </span>
      </div>
    </div>
  );
}

const DEMO = [
  "Walk me through the payments retry service on your resume. What did you personally own?",
  "You said latency dropped 40%. How did you measure that, and what did it cost?",
  "Tell me about a time you pushed back on a product decision.",
];

function InterviewMock() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<OrbMode>("thinking");
  useEffect(() => {
    if (reduce) return;
    const q = DEMO[i];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 600;
    timers.push(setTimeout(() => setPhase("speaking"), t));
    for (let c = 1; c <= q.length; c++) timers.push(setTimeout(() => setTyped(q.slice(0, c)), (t += 24)));
    timers.push(setTimeout(() => setPhase("listening"), (t += 300)));
    timers.push(
      setTimeout(() => {
        setPhase("thinking");
        setTyped("");
        setI((n) => (n + 1) % DEMO.length);
      }, (t += 2600)),
    );
    return () => timers.forEach(clearTimeout);
  }, [i, reduce]);
  return (
    <div className="neo rounded-3xl bg-violet-deep p-5 text-white">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#ff5f7a]" /> LIVE · Question {i + 1} of 4
        </span>
        <span className="opacity-80">Tough interviewer</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <InterviewerOrb mode={phase} initial="M" size={44} />
        <div>
          <p className="text-sm font-bold">Meera</p>
          <p className="text-xs opacity-80">Engineering Manager</p>
        </div>
      </div>
      <p className="mt-3 min-h-[4.5rem] font-display text-lg leading-snug font-bold">
        {reduce ? DEMO[0] : typed}
        {!reduce && phase === "speaking" && <span className="caret bg-white" />}
      </p>
    </div>
  );
}

function Floaty({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={cn("sticker absolute z-20 text-sm", className)}
      animate={reduce ? undefined : { y: [0, -8, 0], rotate: [-4, 2, -4] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.span>
  );
}

function HeroVisual() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-8, 8]), { stiffness: 150, damping: 18 });
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
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
      className="relative mx-auto w-full max-w-md py-8"
    >
      <Floaty className="-top-1 left-2 bg-sun text-[#16131a]">
        <Flame className="size-4" aria-hidden /> 12-day streak
      </Floaty>
      <Floaty className="top-40 -right-2 bg-pop text-pop-ink" delay={1.2}>
        +15 XP
      </Floaty>
      <Floaty className="-bottom-2 left-6 bg-surface" delay={2.1}>
        Hire · <ScorePill value={78} max={100} className="!px-2 !py-0" />
      </Floaty>
      <div className="relative z-10 -rotate-2">
        <TodayCardMock />
      </div>
      <div className="relative z-0 mt-[-1.5rem] ml-8 rotate-3">
        <InterviewMock />
      </div>
    </motion.div>
  );
}

/* ---------- Sections ---------- */

const TICKER = [
  "Arrays & the two-pointer pattern",
  "CAP theorem, in practice",
  "The event loop, for real",
  "Reading a postmortem like a senior",
  "Database indexes",
  "How HTTP caching actually works",
  "An ambiguous ticket lands on Friday",
  "Consistent hashing",
  "Git internals",
  "Sliding window problems",
];

function Ticker() {
  return (
    <div className="border-y-2 border-line bg-ink py-3 text-bg">
      <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <div className="flex w-max animate-marquee gap-8 hover:[animation-play-state:paused]">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-8 font-display text-lg font-bold whitespace-nowrap">
              {t}{" "}
              <span className="text-pop" aria-hidden>
                ✦
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoopCard({
  tag,
  title,
  steps,
  color,
  icon,
}: {
  tag: string;
  title: string;
  steps: string[];
  color: string;
  icon: ReactNode;
}) {
  return (
    <div className="neo bg-surface h-full rounded-3xl p-6" style={{ boxShadow: `6px 6px 0 ${color}` }}>
      <div className="flex items-center justify-between">
        <span className="sticker bg-surface text-xs uppercase tracking-wider" style={{ boxShadow: `3px 3px 0 ${color}` }}>
          {tag}
        </span>
        {icon}
      </div>
      <h3 className="mt-4 font-display text-3xl font-extrabold">{title}</h3>
      <ol className="mt-4 grid gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-line font-mono text-sm font-bold text-white"
              style={{ background: color }}
            >
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

const FEATURES = [
  {
    icon: Target,
    title: "A topic every morning",
    body: "Five tracks, from DSA to real incidents. Picked for breadth, never the same track twice in a row.",
    color: "var(--sun)",
  },
  {
    icon: BookOpenText,
    title: "Teach me in 5 minutes",
    body: "An AI mini-lesson with a worked example and a 3-question self-check. No fluff.",
    color: "var(--pop)",
  },
  {
    icon: Flame,
    title: "Streaks that sting",
    body: "Miss a day and it resets. Build a heatmap you're proud of.",
    color: "var(--pink)",
  },
  {
    icon: Mic,
    title: "Mock interviews",
    body: "Tailored to the job and your resume. One question at a time, real follow-ups.",
    color: "var(--sky)",
  },
  {
    icon: TrendingUp,
    title: "Honest scores",
    body: "Vague answers never score above 5/10. Stronger answers are written from your real work.",
    color: "var(--violet)",
  },
  {
    icon: ListPlus,
    title: "Weak spots → tomorrow",
    body: "One tap turns an interview fix into a future daily topic. The loop closes itself.",
    color: "var(--sun)",
  },
];

function MiniHeatmap() {
  const tracks = ["dsa", "system-design", "lang-depth", "fundamentals", "real-world"];
  const cells = Array.from({ length: 84 }, (_, i) => (i > 20 && (i * 37) % 11 > 2 ? `var(--track-${tracks[(i * 7) % 5]})` : null));
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" aria-hidden>
      {cells.map((c, i) => (
        <span
          key={i}
          className={cn("size-3.5 rounded-[4px] border-2", c ? "border-line" : "border-line-soft bg-surface")}
          style={c ? { background: c } : undefined}
        />
      ))}
    </div>
  );
}

export function Landing() {
  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 md:pt-20 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="sticker bg-surface text-sm">
            <LogoMark size={18} /> For engineers who want a system, not motivation
          </motion.span>
          <h1 className="mt-7 font-display text-[clamp(2.9rem,8vw,5.8rem)] leading-[0.95] font-extrabold tracking-[-0.04em]">
            <WordReveal text="Learn something" />
            <br />
            <WordReveal text="every day." delay={0.15} />
            <br />
            <em className="text-gradient">
              <WordReveal text="Handle any curveball." delay={0.3} />
            </em>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-7 max-w-xl text-lg text-muted"
          >
            {BRAND} gives you one topic a day across DSA, system design and real-world engineering, plus AI mock
            interviews that tell you honestly what to fix. Your weak spots become tomorrow&apos;s lessons.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Link
              href="/signup"
              className="press neo-sm group inline-flex h-14 items-center gap-2 rounded-2xl bg-pop px-7 text-lg font-bold text-pop-ink"
            >
              Start your streak
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <a
              href="#loops"
              className="press neo-sm inline-flex h-14 items-center gap-2 rounded-2xl bg-surface px-6 font-semibold"
            >
              How it works <ArrowDown className="size-4" aria-hidden />
            </a>
          </motion.div>
          <p className="mt-5 text-sm text-muted">Free. 5 minutes a day.</p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <HeroVisual />
        </motion.div>
      </section>

      <Ticker />

      {/* Two loops */}
      <section id="loops" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <Reveal>
          <Eyebrow>The system</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-[clamp(2.3rem,5vw,4rem)] leading-[1] font-extrabold tracking-tight">
            Two loops that <em className="text-gradient">feed each other.</em>
          </h2>
        </Reveal>
        <div className="mt-12 grid items-stretch gap-6 md:grid-cols-[1fr_auto_1fr]">
          <Reveal className="h-full">
            <LoopCard
              tag="Daily · 5 min"
              title="Learn"
              color="var(--track-lang-depth)"
              icon={<BookOpenText className="size-7" aria-hidden />}
              steps={["Open today's topic", "Teach me in 5 min", "Write one line you learned", "Mark it learned · streak +1"]}
            />
          </Reveal>
          <div className="flex flex-row items-center justify-center gap-3 md:flex-col" aria-hidden>
            <span className="sticker rotate-6 bg-pink text-xs text-white">weak spots →</span>
            <Shuffle className="size-8" />
            <span className="sticker -rotate-6 bg-sky text-xs text-[#16131a]">← sharper answers</span>
          </div>
          <Reveal delay={0.1} className="h-full">
            <LoopCard
              tag="Weekly · 20 min"
              title="Practice"
              color="var(--track-real-world)"
              icon={<Mic className="size-7" aria-hidden />}
              steps={[
                "Mock interview for a real job",
                "Real follow-ups, voice or text",
                "Honest scored report",
                "Add fixes to your learning queue",
              ]}
            />
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.06}>
              <div className="press neo bg-surface h-full rounded-3xl p-6">
                <span
                  className="grid size-12 place-items-center rounded-2xl border-2 border-line text-[#16131a]"
                  style={{ background: f.color }}
                >
                  <f.icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-5 font-display text-xl font-extrabold">{f.title}</h3>
                <p className="mt-2 text-muted">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Progress preview */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <div className="neo bg-surface grid items-center gap-10 rounded-[2rem] p-8 sm:p-12 lg:grid-cols-[1fr_auto]">
            <div>
              <Eyebrow>Progress you can see</Eyebrow>
              <h2 className="mt-3 font-display text-[clamp(2rem,4.5vw,3.3rem)] leading-[1] font-extrabold tracking-tight">
                Watch your <em className="text-gradient">curve</em> go up.
              </h2>
              <p className="mt-4 max-w-lg text-muted">
                Streaks, a 12-week heatmap coloured by track, balance across topics, interview score trends and levels
                from Rookie to Curveball Legend. All earned, nothing inflated.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="sticker bg-sun text-sm text-[#16131a]">Level 6 · Systems Thinker</span>
                <span className="sticker rotate-3 bg-surface text-sm">
                  <Flame className="size-4 fill-[var(--sun)] text-[var(--track-dsa)]" aria-hidden /> best 31
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <MiniHeatmap />
            </div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <Reveal>
          <div className="neo relative overflow-hidden rounded-[2rem] bg-pop p-10 text-center text-pop-ink sm:p-16">
            <h2 className="font-display text-[clamp(2.4rem,6vw,4.6rem)] leading-[0.95] font-extrabold tracking-tight">
              Day 1 starts
              <br />
              the moment you click.
            </h2>
            <Link
              href="/signup"
              className="press neo-sm mt-9 inline-flex h-14 items-center gap-2 rounded-2xl bg-[#16131a] px-8 text-lg font-bold text-[#fff7ea]"
            >
              Start free <ArrowRight className="size-5" aria-hidden />
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t-2 border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <LogoMark size={22} /> {BRAND}
          </p>
          <p>Your data is yours: delete everything any time from Settings.</p>
        </div>
      </footer>
    </div>
  );
}
