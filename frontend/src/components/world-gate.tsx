"use client";

import {
  AnimatePresence,
  animate,
  cubicBezier,
  motion,
  useMotionValue,
  useTransform,
  type HTMLMotionProps,
} from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { cn } from "@/lib/format";
import { ease, spring, useReducedMotion } from "@/lib/motion";

/**
 * Crossing between worlds (Learn <-> Work) is a place change, not a page change.
 *
 * The wave: the destination world grows as a circle centred on the door you pressed. With
 * the View Transitions API the browser keeps both worlds on screen at once, so the circle
 * shows the *real* new page while the old one is still there outside it, receding a little.
 * Browsers without it get the same circle in the destination colour, then the swap.
 *
 * Only used between worlds; navigation inside a world stays instant. Reduced motion: an
 * instant swap.
 */

export type World = "learn" | "work";

const WORK_BG = "#0a0d14";

function destinationBg(world: World): string {
  if (world === "work") return WORK_BG;
  return document.documentElement.dataset.theme === "dark" ? "#121016" : "#fff7ea";
}

export const WAVE_MS = 720;
const WAVE_BEZIER = [0.22, 1, 0.36, 1] as const;
const WAVE_EASE = `cubic-bezier(${WAVE_BEZIER.join(", ")})`;

type Wave = {
  cx: number;
  cy: number;
  far: number;
  world: World;
  /** Set only on the no-View-Transitions fallback: a solid disc in this colour grows to
   * cover the screen (the browser can't show both documents at once, so we paint the cover
   * ourselves), then fades once the swap underneath is done. Unset on the main path, where
   * the real new page shows through the browser's own clip and this is rings only. */
  fill?: string;
};

type StartViewTransition = (update: () => Promise<void>) => {
  ready: Promise<void>;
  finished: Promise<void>;
};

function viewTransitions(): StartViewTransition | null {
  const d = document as Document & { startViewTransition?: StartViewTransition };
  return typeof d.startViewTransition === "function" ? d.startViewTransition.bind(document) : null;
}

/** Distance from the door to the farthest corner: the circle's final reach. */
function reach(cx: number, cy: number): number {
  return Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 2;
}

const WAVE_POINTS = 64;

/**
 * A rippled ring around (cx, cy): not a perfect circle but a soft, many-lobed wobble, so the
 * wave reads as water rather than a hard geometric edge. `r` scales the whole ripple, so a
 * `path()` animated from r=0 to r=far (same point count, same winding, same phase both ends)
 * interpolates cleanly in a single Web Animation - every point just moves radially.
 */
function wavyRing(cx: number, cy: number, r: number, amp = 0.028, lobes = 5, phase = 0): string {
  let d = "";
  for (let i = 0; i <= WAVE_POINTS; i++) {
    const t = (i / WAVE_POINTS) * Math.PI * 2;
    const rr = r * (1 + amp * Math.sin(t * lobes + phase) + amp * 0.5 * Math.sin(t * lobes * 2 - phase));
    d += `${i === 0 ? "M" : "L"}${(cx + Math.cos(t) * rr).toFixed(1)} ${(cy + Math.sin(t) * rr).toFixed(1)} `;
  }
  return d + "Z";
}

/**
 * A one-shot handoff from cross() to whichever template mounts next: where the wave started,
 * so that page can build its own blocks outward from that point (useRadialReveal below).
 * Module state, not context - only the very next mount cares, and it's consumed (cleared) the
 * moment that mount reads it, so an ordinary in-world navigation never sees a stale value.
 */
let pendingOrigin: { cx: number; cy: number } | null = null;

const RADIAL_SPEED = 2200; // px/s a block's own pop trails the wave front by, roughly reach()/WAVE_MS
const RADIAL_MAX_DELAY = 0.8; // s - caolps into "nothing invisible after 1.2s" with RADIAL_DURATION below
const RADIAL_DURATION = 0.36; // s

/**
 * Builds a page in from the door outward. Call once per template, after its content has
 * rendered: if this mount followed a world crossing, its header/section/aside blocks pop in
 * with a delay proportional to distance from the door (nearest first, so it reads as the wave
 * itself creating the page); an ordinary in-world navigation is a no-op here and falls through
 * to the template's own plain fade.
 */
export function useRadialReveal(containerRef: RefObject<HTMLElement | null>) {
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const origin = pendingOrigin;
    pendingOrigin = null;
    const root = containerRef.current;
    if (!origin || !root || reduce) return;
    // Every page in this app renders one wrapping div (`mx-auto max-w-... px-4 ...`); its
    // direct children are the page's real top-level blocks (header, controls, main content) -
    // a far better match than hunting for semantic tags, which not every page uses. Falling
    // back to header/section/aside, then the whole container, covers anything that doesn't.
    const wrapper = root.firstElementChild;
    const direct = wrapper ? (Array.from(wrapper.children) as HTMLElement[]) : [];
    const blocks = direct.length ? direct : Array.from(root.querySelectorAll<HTMLElement>("header, section, aside"));
    for (const el of blocks.length ? blocks : [root]) {
      const r = el.getBoundingClientRect();
      const dist = Math.hypot(r.left + r.width / 2 - origin.cx, r.top + r.height / 2 - origin.cy);
      const delay = Math.min(RADIAL_MAX_DELAY, dist / RADIAL_SPEED);
      animate(
        el,
        { opacity: [0, 1], transform: ["translateY(10px) scale(0.98)", "translateY(0px) scale(1)"] },
        { delay, duration: RADIAL_DURATION, ease: ease.out },
      );
    }
    // containerRef is a stable ref object; reduce can flip once post-hydration, at which point
    // pendingOrigin is already cleared above, so a second run here is always a safe no-op.
  }, [containerRef, reduce]);
}

const Ctx = createContext<{ cross: (href: string, world: World, origin: HTMLElement) => void; revealed: boolean }>({
  cross: () => {},
  revealed: true,
});

/** Content in a world waits for this before staggering in, so the reveal isn't wasted. */
export const useWorldRevealed = () => useContext(Ctx).revealed;

export function WorldGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(true);
  const busy = useRef(false);
  const arrived = useRef<(() => void) | null>(null);

  const front = useMotionValue(0); // the wave front's radius in px, shared by circle and rings
  const cover = useMotionValue(1); // fallback-only: the solid disc's opacity as it exits
  const [wave, setWave] = useState<Wave | null>(null);

  // Backup signal only (see swap() below): if pathname changes but the DOM stays quiet
  // (nothing for MutationObserver to see), this still lets a crossing proceed.
  const target = useRef<string | null>(null);
  useEffect(() => {
    if (!arrived.current || pathname !== target.current) return;
    const done = arrived.current;
    arrived.current = null;
    setTimeout(done, 220);
  }, [pathname]);

  /**
   * router.push, resolving once the destination has actually rendered - or after 2.5 s
   * regardless, so a crossing never hangs. Not a fixed timer: dev mode compiles a route on
   * its first visit, which can take far longer than any fixed guess, and revealing the wave
   * before the new page has painted is exactly what "frozen mid-wave, then content pops in
   * late and overlaps" looks like. A MutationObserver on #main waits for the DOM to actually
   * go quiet (no changes for 80 ms) instead of guessing how long that takes.
   */
  const swap = useCallback(
    (href: string) =>
      new Promise<void>((resolve) => {
        let settled = false;
        let quiet: ReturnType<typeof setTimeout> | undefined;
        const observer = new MutationObserver(() => {
          clearTimeout(quiet);
          quiet = setTimeout(finish, 80);
        });
        function finish() {
          if (settled) return;
          settled = true;
          clearTimeout(quiet);
          clearTimeout(ceiling);
          observer.disconnect();
          arrived.current = null;
          resolve();
        }
        const ceiling = setTimeout(finish, 2500);
        target.current = href.split("?")[0];
        arrived.current = finish;
        // document.body, not #main: a world crossing swaps the whole layout, so the old
        // world's own #main is removed from the document (and a detached node never mutates
        // again, which would silently starve this observer). <body> is the one thing that's
        // never itself replaced by any client-side navigation, in-world or crossing.
        observer.observe(document.body, { childList: true, subtree: true });
        router.push(href);
      }),
    [router],
  );

  const cross = useCallback(
    (href: string, world: World, origin: HTMLElement) => {
      if (busy.current) return;
      if (reduce) {
        router.push(href);
        return;
      }
      busy.current = true;
      const r = origin.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      pendingOrigin = { cx, cy }; // for the next template's useRadialReveal, whichever path below runs
      router.prefetch(href);

      const vt = viewTransitions();
      if (vt) {
        void (async () => {
          try {
            const html = document.documentElement;
            html.dataset.crossing = world;
            const far = reach(cx, cy);
            front.set(0);
            flushSync(() => setWave({ cx, cy, far, world }));
            const t = vt(async () => {
              await swap(href);
              setRevealed(true);
            });
            await t.ready;
            // The new world, live, inside a rippled wave growing from the door.
            const clip = html.animate(
              { clipPath: [`path("${wavyRing(cx, cy, 0)}")`, `path("${wavyRing(cx, cy, far)}")`] },
              { duration: WAVE_MS, easing: WAVE_EASE, pseudoElement: "::view-transition-new(root)" },
            );
            // The rings read the clip's own clock, so they sit exactly on its edge (two separate
            // animations drift apart by a frame, which is a big gap while the circle is fastest).
            const curve = cubicBezier(...WAVE_BEZIER);
            const follow = () => {
              const p = Math.min(1, Number(clip.currentTime ?? 0) / WAVE_MS);
              front.set(far * curve(p));
              if (p < 1 && clip.playState !== "finished") requestAnimationFrame(follow);
            };
            requestAnimationFrame(follow);
            // The old world recedes a little as it's covered.
            html.animate(
              { transform: ["none", "scale(0.96)"], filter: ["none", "brightness(0.72)"] },
              { duration: WAVE_MS, easing: WAVE_EASE, pseudoElement: "::view-transition-old(root)" },
            );
            await t.finished;
          } catch {
            /* the swap itself already happened or will; motion is optional */
          } finally {
            delete document.documentElement.dataset.crossing;
            setWave(null);
            busy.current = false;
          }
        })();
        return;
      }

      // Fallback: no View Transitions. Two documents can't show at once, so we paint the
      // cover ourselves: a solid disc in the destination colour grows to cover the screen -
      // same geometry and timing as the main path - the route swaps once it's fully covered,
      // then the disc's job is done and fades away fast; the page's own radial-build reveal
      // (Radial build leaf) takes it from there.
      const far = reach(cx, cy);
      front.set(0);
      cover.set(1);
      setRevealed(false);
      setWave({ cx, cy, far, world, fill: destinationBg(world) });

      void (async () => {
        try {
          await animate(front, far, { duration: WAVE_MS / 1000, ease: WAVE_BEZIER });
          await swap(href);
          setRevealed(true);
          await animate(cover, 0, { duration: 0.22, ease: "easeOut" });
        } finally {
          setWave(null);
          busy.current = false;
        }
      })();
    },
    [reduce, router, front, cover, swap],
  );

  return (
    <Ctx.Provider value={{ cross, revealed }}>
      {children}
      {wave && typeof document !== "undefined" && createPortal(<Rings wave={wave} front={front} cover={cover} />, document.body)}
    </Ctx.Provider>
  );
}

/**
 * Rings riding the wave: a bright one exactly on the circle's edge, fainter ripples trailing
 * inside the new world. It has its own view-transition layer (globals.css), so during a
 * crossing it paints live above both worlds instead of being frozen into a snapshot.
 *
 * When `wave.fill` is set (the no-View-Transitions fallback), a solid disc of that colour
 * grows underneath the rings and covers the screen - the cover this browser needs painted
 * by hand - then `cover` fades it out once the real swap has happened underneath.
 */
function Rings({
  wave,
  front,
  cover,
}: {
  wave: Wave;
  front: ReturnType<typeof useMotionValue<number>>;
  cover: ReturnType<typeof useMotionValue<number>>;
}) {
  const work = wave.world === "work";
  const lead = "#c8f23c";
  const trail = work ? "#5ee6ff" : "#16131a";
  // Fade the rings out over the last stretch so nothing lingers at the corners; on the
  // fallback path they fade together with the disc instead (multiplied through `cover`).
  const edge = useTransform(front, [0, wave.far * 0.7, wave.far], [1, 1, 0]);
  const opacity = useTransform([edge, cover], ([e, c]) => (e as number) * (c as number));
  // Three rippled rings, each a touch smaller and phase-shifted from the last, so together
  // they read as one wave with texture rather than three identical scaled circles.
  const d0 = useTransform(front, (r) => wavyRing(wave.cx, wave.cy, Math.max(0, r), 0.03, 5, 0));
  const d1 = useTransform(front, (r) => wavyRing(wave.cx, wave.cy, Math.max(0, r - 22), 0.03, 5, 0.6));
  const d2 = useTransform(front, (r) => wavyRing(wave.cx, wave.cy, Math.max(0, r - 52), 0.03, 5, 1.2));
  return (
    <motion.svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-101 h-full w-full [view-transition-name:world-wave]"
      style={{ opacity }}
    >
      {wave.fill && <motion.path d={d0} fill={wave.fill} />}
      <motion.path d={d2} fill="none" stroke={trail} strokeOpacity={0.22} strokeWidth={1.5} />
      <motion.path d={d1} fill="none" stroke={trail} strokeOpacity={0.45} strokeWidth={2} />
      <motion.path d={d0} fill="none" stroke={lead} strokeWidth={3} />
    </motion.svg>
  );
}

/** A baseball diamond: the Bullpen's mark. */
export function DiamondGlyph({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="10" y="10" width="28" height="28" rx="3" transform="rotate(45 24 24)" fill="none" stroke="#c8f23c" strokeWidth="3" />
      <circle cx="24" cy="24" r="4" fill="#5ee6ff" />
    </svg>
  );
}

/** A button that becomes the portal to another world: it squishes on press, and a quick
 * pulse ring hands off into the wave the moment it's tapped. */
export const WorldDoor = forwardRef<
  HTMLButtonElement,
  Omit<HTMLMotionProps<"button">, "ref" | "children"> & { href: string; world: World; children?: ReactNode }
>(function WorldDoor({ href, world, onClick, onPointerEnter, onFocus, children, className, ...rest }, ref) {
  const { cross } = useContext(Ctx);
  const router = useRouter();
  const [pulse, setPulse] = useState(0);
  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={spring.press}
      className={cn("relative", className)}
      {...rest}
      onPointerEnter={(e) => {
        router.prefetch(href);
        onPointerEnter?.(e);
      }}
      onFocus={(e) => {
        router.prefetch(href);
        onFocus?.(e);
      }}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        setPulse((k) => k + 1);
        cross(href, world, e.currentTarget);
      }}
    >
      {children}
      <AnimatePresence>
        {pulse > 0 && (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-pop"
            initial={{ opacity: 0.65, scale: 1 }}
            animate={{ opacity: 0, scale: 1.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.34, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
});
