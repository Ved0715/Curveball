"use client";

import { Pencil, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurveUnderline } from "@/components/brand";
import { PageTitle } from "@/components/page-shell";
import { ReportView } from "@/components/report-view";
import { SessionGate } from "@/components/session-gate";
import { ErrorPanel, StreamingPanel } from "@/components/status";
import { Button } from "@/components/ui";
import { addToQueue, createSession, streamReport } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { streamPercent } from "@/lib/format";
import type { Session } from "@/lib/schemas";
import { answeredCount, useStore } from "@/lib/store";
import { useStreamTask } from "@/lib/use-task";

function ReportFlow({ session }: { session: Session }) {
  const router = useRouter();
  const patchSession = useStore((s) => s.patchSession);
  const openSession = useStore((s) => s.openSession);
  const [fresh, setFresh] = useState(false);
  const [again, setAgain] = useState<{ busy: boolean; error?: string }>({ busy: false });

  const { state, run, stop } = useStreamTask(
    (signal, on) => streamReport(session.id, on, signal),
    (report) => {
      patchSession((s) => ({ ...s, report }));
      setFresh(true);
    },
  );

  const canScore = session.state.done && answeredCount(session.turns) > 0;
  useEffect(() => {
    if (!session.report && canScore && state.status === "idle") void run();
  }, [session.report, canScore, state.status, run]);

  async function practiseAgain() {
    setAgain({ busy: true });
    try {
      openSession(await createSession(session.setup));
      router.push("/practice/interview");
    } catch (err) {
      setAgain({ busy: false, error: friendlyError(err) });
    }
  }

  if (session.report)
    return (
      <>
        <PageTitle
          step="Practice · Report"
          title={
            <>
              How it <CurveUnderline>went</CurveUnderline>
            </>
          }
        />
        <ReportView
          report={session.report}
          role={session.setup.role}
          company={session.setup.company}
          round={session.setup.round}
          celebrate={fresh}
          onQueue={async (title, blurb) => {
            await addToQueue({ title, blurb, source: "interview", session_id: session.id });
          }}
          actions={
            <>
              <Button size="lg" onClick={() => void practiseAgain()} loading={again.busy}>
                <RotateCcw className="size-4" aria-hidden /> Practise again with new questions
              </Button>
              <Link
                href="/practice"
                className="press neo-sm inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface px-7 font-semibold"
              >
                <Pencil className="size-4" aria-hidden /> Change setup
              </Link>
            </>
          }
        />
        {again.error && (
          <p role="alert" className="mt-4 text-sm text-bad">
            {again.error}
          </p>
        )}
      </>
    );

  if (!canScore)
    return (
      <>
        <PageTitle
          title="No report yet"
          lede="Finish the interview (or end it early after answering at least one question) to get scored."
        />
        <Link href="/practice/interview" className="link font-semibold">
          Back to the interview
        </Link>
      </>
    );

  if (state.status === "error" || state.status === "stopped")
    return (
      <div className="mx-auto max-w-2xl">
        <PageTitle step="Practice · Report" title="Report not ready" />
        <ErrorPanel
          message={state.status === "stopped" ? "You stopped scoring before it finished." : friendlyError(state.error)}
          onRetry={run}
        />
      </div>
    );

  return (
    <StreamingPanel
      title="Scoring your interview"
      lede="Reviewing every answer like a hiring manager would, then writing stronger versions from your own experience."
      lines={[
        "Reading your answers…",
        "Checking for specifics and numbers…",
        "Comparing against the level bar…",
        "Writing stronger answers in your voice…",
      ]}
      percent={state.status === "running" ? streamPercent(state.chars, 7000) : null}
      steps={
        session.setup.resume.trim()
          ? [
              { key: "resume", label: "Check your resume", active: "Re-reading your resume…" },
              { key: "scoring", label: "Score every answer", active: "Scoring your answers…" },
            ]
          : undefined
      }
      stage={state.status === "running" ? state.stage : null}
      onStop={stop}
    />
  );
}

export default function ReportPage() {
  return <SessionGate>{(session) => <ReportFlow session={session} />}</SessionGate>;
}
