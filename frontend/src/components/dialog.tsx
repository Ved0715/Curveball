"use client";

import type { ReactNode } from "react";
import { Sheet } from "./sheet";
import { Button } from "./ui";

/** Confirm a consequential action. Built on Sheet: bottom sheet on phones, dialog elsewhere. */
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
  return (
    <Sheet open={open} onClose={onClose} title={title} description={body}>
      {error && (
        <p role="alert" className="mb-4 text-sm font-medium text-bad">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} data-autofocus>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
