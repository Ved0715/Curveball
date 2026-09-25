"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { ease, spring, useReducedMotion } from "@/lib/motion";
import type { Progress } from "@/lib/schemas";
import { parseDay } from "./learn";

/** Monotone cubic (Fritsch–Carlson) path: smooth, and never dips below the data. */
function monotonePath(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = [m[0], ...m.slice(1).map((mi, i) => (mi * m[i] <= 0 ? 0 : (mi + m[i]) / 2)), m[n - 2]];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

/**
 * The learning curve: cumulative topics learned across the calendar window,
 * with the ball sitting where you are today.
 */
export function CurveChart({ calendar, total }: { calendar: Progress["calendar"]; total: number }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 220;
  const pad = { l: 8, r: 28, t: 24, b: 30 };

  const series = useMemo(() => {
    const start = total - calendar.filter((d) => d.learned).length;
    return calendar.reduce<{ date: string; value: number; learned: boolean }[]>((out, d) => {
      const prev = out.at(-1)?.value ?? start;
      out.push({ date: d.date, value: prev + (d.learned ? 1 : 0), learned: d.learned });
      return out;
    }, []);
  }, [calendar, total]);

  const max = Math.max(4, ...series.map((s) => s.value));
  const min = Math.min(...series.map((s) => s.value));
  const x = (i: number) => pad.l + (i / Math.max(1, series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / Math.max(1, max - min)) * (H - pad.t - pad.b);
  const pts = series.map((s, i) => [x(i), y(s.value)] as [number, number]);
  const line = monotonePath(pts);
  const area = `${line} L${x(series.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const last = pts[pts.length - 1];
  const gained = series.length ? series[series.length - 1].value - series[0].value : 0;

  // Month ticks along the bottom.
  const ticks = series
    .map((s, i) => ({ i, d: parseDay(s.date) }))
    .filter(({ d, i }) => i === 0 || d.getDate() === 1)
    .map(({ i, d }) => ({ x: x(i), label: d.toLocaleDateString(undefined, { month: "short" }) }));

  const h = hover !== null ? series[hover] : null;

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y overflow-visible"
        role="img"
        aria-label={`Learning curve: ${total} topics learned in total, ${gained} in the last ${series.length} days.`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (series.length - 1));
          setHover(Math.max(0, Math.min(series.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="curve-wash" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--pop)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--pop)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" strokeWidth="2" />
        {ticks.map((t) => (
          <text key={t.x} x={t.x} y={H - 8} className="fill-muted font-mono text-[11px]">
            {t.label}
          </text>
        ))}
        <motion.path
          d={area}
          fill="url(#curve-wash)"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        />
        <motion.path
          d={line}
          fill="none"
          stroke="var(--line)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: ease.out }}
        />
        {h && hover !== null && (
          <g aria-hidden>
            <line x1={pts[hover][0]} x2={pts[hover][0]} y1={pad.t - 8} y2={H - pad.b} stroke="var(--line-soft)" strokeWidth="2" />
            <circle cx={pts[hover][0]} cy={pts[hover][1]} r="5" fill="var(--surface)" stroke="var(--line)" strokeWidth="2.5" />
          </g>
        )}
        {last && (
          <motion.g
            initial={reduce ? false : { opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring.bouncy, delay: reduce ? 0 : 1.1 }}
            style={{ originX: `${last[0]}px`, originY: `${last[1]}px` }}
          >
            <svg x={last[0] - 13} y={last[1] - 13} width="26" height="26" viewBox="0 0 40 40" overflow="visible">
              <circle cx="20" cy="20" r="17" fill="var(--pop)" stroke="var(--line)" strokeWidth="2.6" />
              <path d="M8.5 9.5c6 4 7.5 13 3.6 20.6" fill="none" stroke="var(--pop-ink)" strokeWidth="2.3" strokeLinecap="round" />
              <path d="M31.5 9c-4.8 5.6-4.4 15.2 1.1 21.7" fill="none" stroke="var(--pop-ink)" strokeWidth="2.3" strokeLinecap="round" />
            </svg>
          </motion.g>
        )}
      </svg>
      <figcaption className="mt-2 min-h-5 text-sm text-muted" aria-live="polite">
        {h
          ? `${parseDay(h.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${h.value} topic${h.value === 1 ? "" : "s"} learned${h.learned ? " (learned one this day)" : ""}`
          : `+${gained} in the last ${Math.round(series.length / 7)} weeks. Hover to trace your curve.`}
      </figcaption>
    </figure>
  );
}
