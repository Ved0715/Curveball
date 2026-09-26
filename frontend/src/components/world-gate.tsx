"use client";

import { animate, motion, useMotionTemplate, useMotionValue, useTransform } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "@/lib/motion";

/**
 * Crossing between worlds (Learn <-> Work) is a place change, not a page change.
 *
 * 1. Morph: the clicked door becomes the portal. A layer starts at exactly its rect,
 *    radius and colour, then springs out to fill the screen, turning into the destination's
 *    background, while the old world recedes.
 * 2. Swap: the route changes underneath, fully covered.
 * 3. Reveal: a circular hole opens from the door's centre and the new world moves forward
 *    out of a little depth; its content staggers in once `revealed` flips.
 *
 * About 750 ms end to end. Reduced motion: an instant swap. Only used between worlds;
 * navigation inside a world stays instant.
 */

export type World = "learn" | "work";

type Flight = {
  href: string;
  world: World;
  rect: { top: number; left: number; right: number; bottom: number };
  radius: number;
  from: string;
  to: string;
  cx: number;
  cy: number;
  vw: number;
  vh: number;
};

const WORK_BG = "#0a0d14";

function destinationBg(world: World): string {
  if (world === "work") return WORK_BG;
  return document.documentElement.dataset.theme === "dark" ? "#121016" : "#fff7ea";
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
  const [flight, setFlight] = useState<Flight | null>(null);
  const [revealed, setRevealed] = useState(true);
  const busy = useRef(false);
  const arrived = useRef<(() => void) | null>(null);

  const morph = useMotionValue(0); // 0 = the door, 1 = the whole screen
  const hole = useMotionValue(0); // reveal radius in px

  // Tell a waiting flight the new world has rendered.
  useEffect(() => {
    if (!flight || !arrived.current) return;
    if (pathname === flight.href.split("?")[0]) {
      const done = arrived.current;
      arrived.current = null;
      requestAnimationFrame(() => requestAnimationFrame(done));
    }
  }, [pathname, flight]);

  const cross = useCallback(
    (href: string, world: World, origin: HTMLElement) => {
      if (busy.current) return;
      if (reduce) {
        router.push(href);
        return;
      }
      busy.current = true;
      const r = origin.getBoundingClientRect();
      const cs = getComputedStyle(origin);
      const f: Flight = {
        href,
        world,
        rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom },
        radius: parseFloat(cs.borderTopLeftRadius) || 12,
        from: cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : destinationBg(world),
        to: destinationBg(world),
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
      morph.set(0);
      hole.set(0);
      setRevealed(false);
      setFlight(f);
      router.prefetch(href);

      void (async () => {
        const old = document.getElementById("world");
        const recede = old?.animate(
          [
            { transform: "scale(1)", opacity: 1 },
            { transform: "scale(0.965)", opacity: 0.6 },
          ],
          { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
        );
        await animate(morph, 1, { type: "spring", duration: 0.46, bounce: 0.14 });

        // Swap underneath, fully covered. Don't wait forever on a slow network.
        const landed = new Promise<void>((resolve) => {
          arrived.current = resolve;
          setTimeout(resolve, 2500);
        });
        router.push(href);
        await landed;
        arrived.current = null;
        recede?.cancel();

        const far = Math.hypot(Math.max(f.cx, f.vw - f.cx), Math.max(f.cy, f.vh - f.cy));
        setRevealed(true);
        const fresh = document.getElementById("world");
        fresh?.animate(
          [
            // From a little further away to here: "entering". Scale stays <= 1 so nothing overflows.
            { transform: "scale(0.965) translateY(10px)", filter: "brightness(0.8)" },
            { transform: "none", filter: "none" },
          ],
          { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
        await animate(hole, far + 40, { duration: 0.52, ease: [0.22, 1, 0.36, 1] });
        setFlight(null);
        busy.current = false;
      })();
    },
    [reduce, router, morph, hole],
  );

  return (
    <Ctx.Provider value={{ cross, revealed }}>
      {children}
      {flight && typeof document !== "undefined" && createPortal(<Portal flight={flight} morph={morph} hole={hole} />, document.body)}
    </Ctx.Provider>
  );
}

function Portal({
  flight: f,
  morph,
  hole,
}: {
  flight: Flight;
  morph: ReturnType<typeof useMotionValue<number>>;
  hole: ReturnType<typeof useMotionValue<number>>;
}) {
  const inv = useTransform(morph, (p) => 1 - Math.min(1, Math.max(0, p)));
  const clip = useTransform(inv, (k) => {
    const top = f.rect.top * k;
    const left = f.rect.left * k;
    const right = (f.vw - f.rect.right) * k;
    const bottom = (f.vh - f.rect.bottom) * k;
    return `inset(${top}px ${right}px ${bottom}px ${left}px round ${f.radius * k + 0}px)`;
  });
  const background = useTransform(morph, [0, 0.55], [f.from, f.to]);
  const mask = useMotionTemplate`radial-gradient(circle at ${f.cx}px ${f.cy}px, transparent ${hole}px, #000 calc(${hole}px + 1.5px))`;
  const glyphOpacity = useTransform(morph, [0, 0.35, 0.8], [0, 1, 0]);
  const glyphScale = useTransform(morph, [0, 1], [0.6, 2.4]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-auto fixed inset-0 z-[100]"
      style={{ clipPath: clip, background, maskImage: mask, WebkitMaskImage: mask }}
    >
      <motion.div
        className="absolute"
        style={{ left: f.cx, top: f.cy, x: "-50%", y: "-50%", opacity: glyphOpacity, scale: glyphScale }}
      >
        {f.world === "work" ? <DiamondGlyph /> : <BallGlyph />}
      </motion.div>
    </motion.div>
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

function BallGlyph({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="17" fill="#c8f23c" stroke="#16131a" strokeWidth="2.6" />
      <path d="M8.5 9.5c6 4 7.5 13 3.6 20.6" fill="none" stroke="#16131a" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M31.5 9c-4.8 5.6-4.4 15.2 1.1 21.7" fill="none" stroke="#16131a" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  );
}

/** A button that becomes the portal to another world. */
export const WorldDoor = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { href: string; world: World }
>(function WorldDoor({ href, world, onClick, onPointerEnter, onFocus, ...rest }, ref) {
  const { cross } = useContext(Ctx);
  const router = useRouter();
  return (
    <button
      ref={ref}
      type="button"
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
        if (!e.defaultPrevented) cross(href, world, e.currentTarget);
      }}
    />
  );
});
