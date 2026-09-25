"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/motion";

/** One celebratory burst for strong scores. Skipped entirely with reduced motion. */
export function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!fire || reduce || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const colors = ["--pop", "--line", "--track-dsa", "--track-system-design", "--track-real-world"].map((v) =>
      css.getPropertyValue(v).trim(),
    );
    const parts = Array.from({ length: 110 }, (_, i) => ({
      x: innerWidth / 2,
      y: innerHeight * 0.35,
      vx: Math.cos((i / 110) * Math.PI * 2) * (4 + Math.random() * 8),
      vy: Math.sin((i / 110) * Math.PI * 2) * (4 + Math.random() * 8) - 6,
      r: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[i % colors.length],
    }));

    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const age = (t - start) / 1000;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - age / 2.6);
      for (const p of parts) {
        p.vy += 0.25;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      }
      if (age < 2.6) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire, reduce]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
