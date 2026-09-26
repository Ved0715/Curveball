"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { WorldGate } from "./world-gate";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {/* Lives above every route group, so a world crossing survives the layout swap. */}
      <WorldGate>{children}</WorldGate>
    </MotionConfig>
  );
}
