"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";

type Pref = "system" | "light" | "dark";


function readPref(): Pref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPref() === "system") apply("system");
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
  };
}

const ORDER: Pref[] = ["system", "light", "dark"];
const ICONS = { system: Monitor, light: Sun, dark: Moon };

/** Move to the next theme preference (system → light → dark). Returns the new one. */
export function cycleTheme(): Pref {
  const next = ORDER[(ORDER.indexOf(readPref()) + 1) % ORDER.length];
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked: still switch for this page view */
  }
  apply(next);
  listeners.forEach((l) => l());
  return next;
}

export function ThemeToggle() {
  const pref = useSyncExternalStore<Pref>(subscribe, readPref, () => "system");
  const cycle = useCallback(() => void cycleTheme(), []);

  const Icon = ICONS[pref];
  return (
    <button
      type="button"
      onClick={cycle}
      className="press neo-sm grid size-10 cursor-pointer place-items-center rounded-xl bg-surface text-ink"
      aria-label={`Theme: ${pref}. Click to change.`}
      title={`Theme: ${pref}`}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
