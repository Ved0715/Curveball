/** Product identity: change the name here and it changes everywhere. */
export const BRAND = "Curveball";
export const TAGLINE = "Learn something every day. Handle any curveball.";

export type TrackId = "dsa" | "system-design" | "lang-depth" | "fundamentals" | "real-world" | "custom";

export const TRACKS: { id: TrackId; label: string; short: string }[] = [
  { id: "dsa", label: "Data Structures & Algorithms", short: "DSA" },
  { id: "system-design", label: "System Design", short: "System design" },
  { id: "lang-depth", label: "Language & Runtime Depth", short: "Language depth" },
  { id: "fundamentals", label: "CS Fundamentals", short: "Fundamentals" },
  { id: "real-world", label: "Real-World & Situational", short: "Real-world" },
];

export const CUSTOM_TRACK = { id: "custom" as const, label: "Your pick", short: "Your pick" };

export function track(id: string) {
  return TRACKS.find((t) => t.id === id) ?? CUSTOM_TRACK;
}

/** CSS colour for a track (validated palette in globals.css, light and dark). */
export function trackColor(id: string) {
  const known = TRACKS.some((t) => t.id === id);
  return `var(--track-${known ? id : "custom"})`;
}
