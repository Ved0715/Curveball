"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getWorkEvents, getWorkTree } from "@/lib/api";
import { toApiError, type ApiError } from "@/lib/errors";
import type { WorkEvent, WorkTree } from "@/lib/schemas";

type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; tree: WorkTree };

const POLL_MS = 2500;
const FLASH_MS = 1800;

/**
 * A session's tree, kept live: poll the events feed (cheap), and refetch the tree only when
 * something happened. Returns which nodes just changed so rows can flash, and whether the
 * session was shipped while you watched.
 */
export function useLiveSession(id: string) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const [shipped, setShipped] = useState(0);
  const since = useRef(0);

  const refresh = useCallback(
    () =>
      getWorkTree(id).then(
        (tree) => {
          since.current = Math.max(since.current, tree.last_event_id);
          setLoad({ status: "ready", tree });
          return tree;
        },
        (err: unknown) => {
          setLoad((l) => (l.status === "ready" ? l : { status: "error", error: toApiError(err) }));
          return null;
        },
      ),
    [id],
  );

  useEffect(() => {
    let live = true;
    since.current = 0;
    void refresh().then((tree) => {
      if (!tree || !live) return;
      // Seed the feed with recent history.
      void getWorkEvents(id, Math.max(0, tree.last_event_id - 30)).then((evs) => live && setEvents(evs.reverse()));
    });

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const fresh = await getWorkEvents(id, since.current);
        if (!live || fresh.length === 0) return;
        since.current = fresh[fresh.length - 1].id;
        setEvents((old) => [...fresh.reverse(), ...old].slice(0, 60));
        const touched = new Set(fresh.map((e) => e.node_id).filter((x): x is string => !!x));
        setChanged(touched);
        setTimeout(() => live && setChanged(new Set()), FLASH_MS);
        if (fresh.some((e) => e.kind === "session_resolved")) setShipped((n) => n + 1);
        await refresh();
      } catch {
        /* a missed poll is fine; the next one catches up */
      }
    };
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [id, refresh]);

  return { load, events, changed, shipped, refresh };
}

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** True on desktop widths. Server render assumes mobile; hydration-safe. */
export function useWide() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}
