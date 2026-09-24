"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

/** Accessible confirm dialog (native <dialog>: focus trap and Esc for free). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,440px)] bg-transparent p-0 text-ink backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="rounded-3xl border border-line bg-bg-2 p-6 shadow-2xl"
          >
            <h2 className="font-display text-3xl tracking-tight">{title}</h2>
            <div className="mt-2 text-muted">{body}</div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-bad">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} autoFocus>
                Cancel
              </Button>
              <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
