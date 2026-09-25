import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/format";

/** The mark: a lime ball with curved seams, thrown slightly off-axis. */
export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={cn("shrink-0", className)}>
      <circle cx="21.5" cy="21.5" r="16" fill="var(--shadow-color)" />
      <circle cx="19" cy="19" r="16" fill="var(--pop)" stroke="var(--line)" strokeWidth="2.5" />
      <path d="M8.5 11.5c6 3.5 7.5 12 3.8 18.8" fill="none" stroke="var(--pop-ink)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M29.5 7.8c-4.6 5.8-4.2 14.8 1.2 21" fill="none" stroke="var(--pop-ink)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", className)} aria-label={`${BRAND} home`}>
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-12" />
      <span className="font-display text-[1.45rem] font-extrabold leading-none tracking-tight">{BRAND}</span>
    </Link>
  );
}
