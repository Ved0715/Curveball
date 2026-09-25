"use client";

import { LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format";

type Variant = "primary" | "ghost" | "soft" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "press neo-sm bg-pop text-pop-ink font-bold",
  ghost: "press neo-sm bg-surface text-ink",
  soft: "bg-transparent text-muted hover:text-ink hover:bg-surface border-2 border-transparent",
  danger: "press neo-sm bg-surface text-bad",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[0.95rem] gap-2 rounded-xl",
  lg: "h-14 px-7 text-base gap-2.5 rounded-2xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-semibold whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("glass rounded-3xl", className)}>{children}</div>;
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted", className)}>
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  aside,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
          {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
        </label>
        {aside}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border-2 border-line bg-surface px-4 py-3 text-[0.97rem] text-ink placeholder:text-muted/70 outline-none transition focus:shadow-[4px_4px_0_var(--pop)] focus:-translate-x-px focus:-translate-y-px";

/** A row of pill options with an animated highlight that slides between choices. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
  hideLabel = false,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => ReactNode;
  /** Keep the label for screen readers only (when the context already makes it obvious). */
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={hideLabel ? "sr-only" : "mb-2 text-sm font-semibold"}>{label}</legend>
      <div className="flex flex-wrap gap-1.5 rounded-2xl border-2 border-line bg-surface p-1.5">
        {options.map((opt) => {
          const selected = opt === value;
          return (
            <label
              key={String(opt)}
              className={cn(
                "relative flex-1 cursor-pointer rounded-xl px-3.5 py-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                selected ? "text-pop-ink" : "text-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name={id}
                className="sr-only"
                checked={selected}
                onChange={() => onChange(opt)}
              />
              {selected && (
                <motion.span
                  layoutId={`seg-${id}`}
                  className="absolute inset-0 rounded-xl border-2 border-line bg-pop"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{render ? render(opt) : String(opt)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border-2 border-line-soft bg-surface px-1.5 py-0.5 font-mono text-[0.7rem] text-muted">
      {children}
    </kbd>
  );
}
