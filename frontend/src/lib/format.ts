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

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
