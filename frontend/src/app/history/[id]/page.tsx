"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageShell, PageSkeleton, PageTitle } from "@/components/page-shell";
import { ReportView } from "@/components/report-view";
import { ErrorPanel } from "@/components/status";
import { getSession } from "@/lib/api";
import { friendlyError, toApiError, type ApiError } from "@/lib/errors";
import type { Session } from "@/lib/schemas";

type Load = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; session: Session };

export default function PastReportPage() {
  const { id } = useParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    getSession(id)
      .then((session) => live && setLoad({ status: "ready", session }))
      .catch((err: unknown) => live && setLoad({ status: "error", error: toApiError(err) }));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (load.status === "loading") return <PageSkeleton />;

  return (
    <PageShell>
      <Link href="/history" className="mb-6 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All interviews
      </Link>
      {load.status === "error" ? (
        <ErrorPanel
          message={friendlyError(load.error)}
          onRetry={
            load.error.code === "not_found"
              ? undefined
              : () => {
                  setLoad({ status: "loading" });
                  setAttempt((n) => n + 1);
                }
          }
        />
      ) : load.session.report ? (
        <>
          <PageTitle
            step={new Date(load.session.created_at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            title={
              <>
                Interview with <em className="text-gradient">{load.session.interviewer}</em>
              </>
            }
          />
          <ReportView
            report={load.session.report}
            role={load.session.setup.role}
            company={load.session.setup.company}
            round={load.session.setup.round}
          />
        </>
      ) : (
        <PageTitle title="Not scored yet" lede="This interview doesn't have a report." />
      )}
    </PageShell>
  );
}
