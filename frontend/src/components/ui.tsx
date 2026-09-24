"use client";

import { LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format";

type Variant = "primary" | "ghost" | "soft" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-bg hover:shadow-[0_8px_30px_-6px_var(--accent)] hover:-translate-y-px active:translate-y-0 border border-transparent",
  ghost: "border border-line bg-surface hover:bg-surface-strong hover:border-line-strong text-ink",
  soft: "bg-transparent text-muted hover:text-ink hover:bg-surface border border-transparent",
  danger: "border border-line bg-transparent text-bad hover:bg-bad/10 hover:border-bad/40",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[0.95rem] gap-2 rounded-2xl",
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
        "relative inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
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
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[0.72rem] uppercase tracking-[0.18em] text-muted", className)}>{children}</p>
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
  "w-full rounded-2xl border border-line bg-bg/60 px-4 py-3 text-[0.97rem] text-ink placeholder:text-muted/70 outline-none transition focus:border-accent/60 focus:bg-bg focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_15%,transparent)]";

/** A row of pill options with an animated highlight that slides between choices. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => ReactNode;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-line bg-bg/50 p-1.5">
        {options.map((opt) => {
          const selected = opt === value;
          return (
            <label
              key={String(opt)}
              className={cn(
                "relative flex-1 cursor-pointer rounded-xl px-3.5 py-2 text-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                selected ? "text-bg" : "text-muted hover:text-ink",
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
                  className="absolute inset-0 rounded-xl bg-ink"
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
    <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[0.7rem] text-muted">
      {children}
    </kbd>
  );
}
