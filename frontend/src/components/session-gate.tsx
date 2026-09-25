"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { friendlyError } from "@/lib/errors";
import type { Session } from "@/lib/schemas";
import { useCurrentSession } from "@/lib/store";
import { PageShell, PageSkeleton, PageTitle } from "./page-shell";
import { EmptyState } from "./empty";
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
        <EmptyState
          title="No interview open"
          body="Set up an interview to get started. It takes about a minute."
          action={
            <Link href="/practice" className="press neo-sm inline-flex h-11 items-center rounded-xl bg-pop px-4 font-bold text-pop-ink">
              Go to setup
            </Link>
          }
        />
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
