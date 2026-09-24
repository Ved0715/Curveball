"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { friendlyError } from "@/lib/errors";
import type { Session } from "@/lib/schemas";
import { useCurrentSession } from "@/lib/store";
import { PageShell, PageSkeleton, PageTitle } from "./page-shell";
import { ErrorPanel } from "./status";

/** Loads the open session from the server; shows loading, empty and error states. */
export function SessionGate({
  children,
  wrap = true,
}: {
  children: (session: Session) => ReactNode;
  wrap?: boolean;
}) {
  const load = useCurrentSession();
  if (load.status === "loading") return <PageSkeleton />;
  if (load.status === "none")
    return (
      <PageShell>
        <PageTitle title="No interview open" lede="Set up an interview to get started." />
        <Link href="/practice" className="font-semibold text-accent underline underline-offset-4">
          Go to setup
        </Link>
      </PageShell>
    );
  if (load.status === "error")
    return (
      <PageShell>
        <PageTitle title="Couldn't load your interview" />
        <ErrorPanel message={friendlyError(load.error)} onRetry={load.retry} />
      </PageShell>
    );
  return wrap ? <PageShell>{children(load.session)}</PageShell> : <>{children(load.session)}</>;
}
