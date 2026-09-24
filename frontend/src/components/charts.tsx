"use client";

import { CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import { animate, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn, TONE_VAR, toneFor, type Tone } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";

const TONE_ICON: Record<Tone, typeof CircleCheck> = {
  good: CircleCheck,
  warn: CircleMinus,
  bad: CircleAlert,
};

/** Score pill: colour + icon + number, so it never relies on colour alone. */
export function ScorePill({ value, max, className }: { value: number; max: number; className?: string }) {
  const tone = toneFor(value, max);
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-semibold whitespace-nowrap",
        className,
      )}
      style={{ color: TONE_VAR[tone], background: `color-mix(in oklab, ${TONE_VAR[tone]} 13%, transparent)` }}
    >
      <Icon className="size-3.5" aria-hidden />
      {Math.round(value)}/{max}
    </span>
  );
}

export function CountUp({ to, duration = 1.4 }: { to: number; duration?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    const c = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, to, duration, reduce]);
  return <span ref={ref}>{reduce ? to : n}</span>;
}

/** Hero number inside a ring meter (single value against a 0-100 limit). */
export function ScoreRing({ value, size = 220 }: { value: number; size?: number }) {
  const reduce = useReducedMotion();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = toneFor(value, 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-strong)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_VAR[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: reduce ? 0 : 1.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 12px color-mix(in oklab, ${TONE_VAR[tone]} 45%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-7xl leading-none tracking-tight" aria-label={`Overall score ${value} out of 100`}>
          <CountUp to={value} />
        </span>
        <span className="mt-1 font-mono text-xs text-muted">out of 100</span>
      </div>
    </div>
  );
}

/** Horizontal bars for the five sub-scores (1-10). Values in text ink, bars carry the tone. */
export function ScoreBars({ scores }: { scores: [string, number][] }) {
  const reduce = useReducedMotion();
  return (
    <dl className="grid gap-3.5">
      {scores.map(([label, v], i) => {
        const tone = toneFor(v, 10);
        return (
          <div key={label} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
              <motion.div
                className="h-full rounded-full"
                style={{ background: TONE_VAR[tone] }}
                initial={{ width: 0 }}
                whileInView={{ width: `${v * 10}%` }}
                viewport={{ once: true }}
                transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.15 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            </dd>
            <dd className="text-right font-mono font-semibold">
              {v}
              <span className="sr-only"> out of 10</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Score trend (oldest → newest), single series: no legend; hover shows each point. */
export function TrendChart({ points }: { points: { score: number; label: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const h = 180;
  const pad = { x: 16, top: 20, bottom: 24 };
  const n = points.length;
  const xAt = (i: number) => pad.x + (n === 1 ? (w - 2 * pad.x) / 2 : (i / (n - 1)) * (w - 2 * pad.x));
  const yAt = (v: number) => pad.top + (1 - v / 100) * (h - pad.top - pad.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(p.score).toFixed(1)}`).join(" ");
  const area = `${line} L${xAt(n - 1)},${h - pad.bottom} L${xAt(0)},${h - pad.bottom} Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-44 w-full overflow-visible"
        role="img"
        aria-label={`Score trend across your last ${n} interviews: ${points.map((p) => p.score).join(", ")}`}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((g) => (
          <line key={g} x1={pad.x} x2={w - pad.x} y1={yAt(g)} y2={yAt(g)} stroke="var(--line)" strokeDasharray="3 5" />
        ))}
        {[50, 75].map((g) => (
          <text key={g} x={w - pad.x} y={yAt(g) - 5} textAnchor="end" className="fill-muted font-mono text-[10px]">
            {g}
          </text>
        ))}
        {n > 1 && <path d={area} fill="url(#trend-fill)" />}
        {n > 1 && (
          <motion.path
            d={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}
        {hover !== null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={h - pad.bottom} stroke="var(--line-strong)" />
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={xAt(i)}
              cy={yAt(p.score)}
              r={hover === i ? 6 : 4.5}
              fill="var(--accent)"
              stroke="var(--bg)"
              strokeWidth={2}
            />
            <rect
              x={xAt(i) - Math.max(12, (w - 2 * pad.x) / Math.max(1, n - 1) / 2)}
              width={Math.max(24, (w - 2 * pad.x) / Math.max(1, n - 1))}
              y={0}
              height={h}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div
          className="glass pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2 text-xs"
          style={{ left: `${(xAt(hover) / w) * 100}%`, top: `${(yAt(points[hover].score) / h) * 100}%` }}
        >
          <div className="font-mono font-semibold">{points[hover].score}/100</div>
          <div className="text-muted">{points[hover].label}</div>
        </div>
      )}
    </div>
  );
}
