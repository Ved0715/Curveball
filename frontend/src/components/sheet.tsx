"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import { duration, ease, spring } from "@/lib/motion";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useIsNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 639px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

const noop = () => () => {};

/**
 * One overlay primitive. Phones: a bottom sheet you can drag down to dismiss.
 * Larger screens: a centred dialog that scales in. Traps focus, closes on Esc and
 * backdrop click, restores focus to whatever opened it, and locks page scroll.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
  placement = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** "top" suits a command palette on large screens. */
  placement?: "center" | "top";
}) {
  const narrow = useIsNarrow();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!els.length) return;
        const [first, last] = [els[0], els[els.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0 z-[80] flex justify-center", narrow ? "items-end" : placement === "top" ? "items-start pt-[12vh]" : "items-center p-4")}>
          <motion.div
            className="absolute inset-0 bg-[#16131a]/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: duration.base } }}
            exit={{ opacity: 0, transition: { duration: duration.fast } }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              "sheet relative flex max-h-[88dvh] w-full flex-col overflow-hidden",
              narrow ? "rounded-t-[1.75rem] pb-[env(safe-area-inset-bottom)]" : "max-w-lg rounded-3xl",
              className,
            )}
            initial={narrow ? { y: "100%" } : { opacity: 0, scale: 0.95, y: 12 }}
            animate={narrow ? { y: 0, transition: spring.gentle } : { opacity: 1, scale: 1, y: 0, transition: spring.gentle }}
            exit={
              narrow
                ? { y: "100%", transition: { duration: duration.base, ease: ease.in } }
                : { opacity: 0, scale: 0.97, transition: { duration: duration.fast, ease: ease.in } }
            }
            drag={narrow ? "y" : false}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            {narrow && (
              <div
                className="flex cursor-grab touch-none justify-center pt-3 pb-1 active:cursor-grabbing"
                onPointerDown={(e) => drag.start(e)}
                aria-hidden
              >
                <span className="h-1.5 w-11 rounded-full bg-line-soft" />
              </div>
            )}
            <div className="flex items-start justify-between gap-4 px-6 pt-4 sm:pt-6">
              <div>
                <h2 id={titleId} className="text-headline">
                  {title}
                </h2>
                {description && <div className="mt-1 text-sm text-muted">{description}</div>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-strong hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 pt-4 pb-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
