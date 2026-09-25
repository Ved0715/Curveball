import { cn } from "@/lib/format";

export function Skel({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block", className)} />;
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-6 lg:pt-12" role="status" aria-label={label} aria-busy>
      {children}
    </div>
  );
}

/** Shaped like the Today page, so nothing jumps when content arrives. */
export function TodaySkeleton() {
  return (
    <Frame label="Loading today">
      <Skel className="h-3 w-40" />
      <Skel className="mt-4 h-12 w-3/4 max-w-lg" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border-2 border-line-soft p-7">
          <Skel className="h-6 w-28" />
          <Skel className="mt-6 h-10 w-4/5" />
          <Skel className="mt-3 h-10 w-2/5" />
          <Skel className="mt-6 h-4 w-full" />
          <Skel className="mt-2 h-4 w-3/4" />
          <div className="mt-8 flex gap-3">
            <Skel className="h-14 w-44 rounded-2xl" />
            <Skel className="h-14 w-44 rounded-2xl" />
          </div>
        </div>
        <div className="grid content-start gap-4">
          <Skel className="h-24 w-full" />
          <Skel className="h-4 w-24" />
          <Skel className="h-10 w-full" />
          <Skel className="h-10 w-full" />
        </div>
      </div>
    </Frame>
  );
}

export function ProgressSkeleton() {
  return (
    <Frame label="Loading progress">
      <Skel className="h-12 w-72" />
      <Skel className="mt-4 h-4 w-96 max-w-full" />
      <Skel className="mt-10 h-56 w-full rounded-3xl" />
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <Skel className="h-48 w-full" />
        <Skel className="h-48 w-full" />
      </div>
    </Frame>
  );
}

export function PageSkeletonBlock() {
  return (
    <Frame label="Loading">
      <Skel className="h-3 w-32" />
      <Skel className="mt-4 h-12 w-2/3" />
      <Skel className="mt-10 h-72 w-full rounded-3xl" />
    </Frame>
  );
}
