"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, toApiError } from "./errors";

export type TaskState =
  | { status: "idle" }
  | { status: "running"; chars: number }
  | { status: "stopped" }
  | { status: "error"; error: ApiError };

/** Runs one streaming AI call with progress, stop and retry. Only one run at a time. */
export function useStreamTask<T>(
  task: (signal: AbortSignal, onProgress: (chars: number) => void) => Promise<T>,
  onDone: (result: T) => void,
) {
  const [state, setState] = useState<TaskState>({ status: "idle" });
  const ctl = useRef<AbortController | null>(null);
  const latest = useRef({ task, onDone });
  useEffect(() => {
    latest.current = { task, onDone };
  });

  const run = useCallback(async () => {
    if (ctl.current) return;
    const c = new AbortController();
    ctl.current = c;
    setState({ status: "running", chars: 0 });
    try {
      const result = await latest.current.task(c.signal, (chars) => setState({ status: "running", chars }));
      setState({ status: "idle" });
      latest.current.onDone(result);
    } catch (err) {
      const e = toApiError(err);
      setState(e.code === "cancelled" ? { status: "stopped" } : { status: "error", error: e });
    } finally {
      ctl.current = null;
    }
  }, []);

  const stop = useCallback(() => ctl.current?.abort(), []);
  useAbortOnUnmount(ctl);

  return { state, run, stop };
}

/**
 * Abort in-flight work only on a real unmount. React dev mode unmounts and remounts
 * every component once; aborting immediately would cancel the request we just started.
 */
export function useAbortOnUnmount(ctl: { current: AbortController | null }) {
  const mounted = useRef(false);
  useEffect(() => {
    const target = ctl;
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) target.current?.abort();
      }, 0);
    };
  }, [ctl]);
}
