export type Tone = "good" | "warn" | "bad";

/** Same thresholds as the prototype: ≥75% good, ≥50% ok, else needs work. */
export function toneFor(value: number, max: number): Tone {
  const p = value / max;
  return p >= 0.75 ? "good" : p >= 0.5 ? "warn" : "bad";
}

export const TONE_VAR: Record<Tone, string> = {
  good: "var(--good)",
  warn: "var(--warn)",
  bad: "var(--bad)",
};

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Rough progress for a streamed JSON document of a known typical size. */
export function streamPercent(chars: number, typicalChars: number) {
  return Math.min(97, Math.round((chars / typicalChars) * 100));
}

export function shortRound(round: string) {
  return round.replace(/\s*\(.*\)$/, "");
}

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
