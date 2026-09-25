"use client";

import { ArrowRight, FileText, FlaskConical, Play, Upload, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CurveUnderline } from "@/components/brand";
import { PageSkeleton } from "@/components/page-shell";
import { ErrorPanel } from "@/components/status";
import { Button, Field, inputClass, Segmented } from "@/components/ui";
import { createSession, getHealth, uploadResume } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn, shortRound } from "@/lib/format";
import { spring } from "@/lib/motion";
import { COUNTS, LEVELS, ROUNDS, SetupSchema, STYLES } from "@/lib/schemas";
import { useHydrated, useStore } from "@/lib/store";

type Health = Awaited<ReturnType<typeof getHealth>> | "loading";

function ServerNotice() {
  const [health, setHealth] = useState<Health>("loading");
  useEffect(() => {
    void getHealth().then(setHealth);
  }, []);
  if (health === "loading") return null;
  if (health === null || !health.db)
    return (
      <div role="status" className="mb-8 flex items-center gap-3 rounded-xl border-2 border-bad bg-surface p-4 text-sm">
        <WifiOff className="size-4 shrink-0 text-bad" aria-hidden />
        {health === null
          ? "Can't reach the server. If you're running locally, start the backend on port 8000."
          : "The server can't reach its database right now. Check DATABASE_URL in backend/.env."}
      </div>
    );
  if (health.mock)
    return (
      <div role="status" className="mb-8 flex items-center gap-3 rounded-xl border-2 border-dashed border-line bg-surface p-4 text-sm">
        <FlaskConical className="size-4 shrink-0 text-warn" aria-hidden />
        Demo mode: the AI returns sample responses. Add an AI key on the server for real interviews.
      </div>
    );
  return null;
}

function ResumeUpload({ onText }: { onText: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "err"; msg: string }>({
    kind: "idle",
    msg: "",
  });

  async function handle(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: "busy", msg: `Reading ${file.name}…` });
    try {
      onText(await uploadResume(file));
      setStatus({ kind: "ok", msg: `Loaded ${file.name}. Check the text looks right.` });
    } catch (err) {
      setStatus({ kind: "err", msg: friendlyError(err) });
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "group mb-3 flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 text-left transition",
          drag ? "scale-[1.01] border-line bg-pop/25" : "border-line-soft hover:border-line hover:bg-surface",
        )}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-line bg-surface transition group-hover:-rotate-6">
          {status.kind === "ok" ? (
            <FileText className="size-5 text-good" aria-hidden />
          ) : (
            <Upload className={cn("size-5", status.kind === "busy" && "animate-bounce")} aria-hidden />
          )}
        </span>
        <span>
          <span className="block text-sm font-semibold">Drop your resume here, or click to upload</span>
          <span className="block text-xs text-muted">PDF, DOCX or TXT · up to 5 MB</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        hidden
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p
        aria-live="polite"
        className={cn("mt-2 min-h-5 text-xs", status.kind === "err" ? "text-bad" : "text-muted")}
      >
        {status.msg}
      </p>
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const setup = useStore((s) => s.setup);
  const update = useStore((s) => s.updateSetup);
  const openSession = useStore((s) => s.openSession);
  const [error, setError] = useState<string>();
  const [submit, setSubmit] = useState<{ busy: "brief" | "skip" | null; error?: string }>({ busy: null });
  const roleRef = useRef<HTMLInputElement>(null);

  if (!hydrated) return <PageSkeleton />;

  function valid() {
    const r = SetupSchema.safeParse(setup);
    if (r.success) {
      setError(undefined);
      return true;
    }
    setError(r.error.issues[0]?.message ?? "Check your setup.");
    roleRef.current?.focus();
    return false;
  }

  async function begin(mode: "brief" | "skip") {
    if (!valid()) return;
    setSubmit({ busy: mode });
    try {
      openSession(await createSession(SetupSchema.parse(setup)));
      router.push(mode === "brief" ? "/practice/brief" : "/practice/interview");
    } catch (err) {
      setSubmit({ busy: null, error: friendlyError(err) });
    }
  }

  const ready = setup.role.trim().length > 0;
  const summary = [setup.level, shortRound(setup.round), setup.style, `${setup.question_count} questions`].join(" · ");

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:pt-10">
      <header className="mb-10">
        <p className="text-label text-muted">Practice · Set up</p>
        <h1 className="mt-3 text-display">
          Tell us about <CurveUnderline>the interview</CurveUnderline>
        </h1>
        <p className="mt-4 max-w-2xl text-muted">
          The more detail you give, the sharper the questions. Everything is tailored to this role and your real resume.
        </p>
      </header>
      <ServerNotice />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void begin("brief");
        }}
        className="grid grid-cols-1 gap-12"
      >
        <FormSection n={1} title="The job">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Role" htmlFor="role" error={error}>
              <input
                ref={roleRef}
                id="role"
                className={inputClass}
                placeholder="e.g. Backend Engineer, Product Analyst"
                autoComplete="off"
                value={setup.role}
                aria-invalid={!!error}
                onChange={(e) => update({ role: e.target.value })}
              />
            </Field>
            <Field label="Company" hint="Optional" htmlFor="company">
              <input
                id="company"
                className={inputClass}
                placeholder="e.g. Flipkart, Razorpay, Google"
                autoComplete="off"
                value={setup.company}
                onChange={(e) => update({ company: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Job description"
                hint="Paste the posting"
                htmlFor="jd"
                aside={<span className="font-mono text-xs text-muted">{setup.jd.length.toLocaleString()} chars</span>}
              >
                <textarea
                  id="jd"
                  rows={6}
                  className={cn(inputClass, "resize-y leading-relaxed")}
                  placeholder="Paste the job description here"
                  value={setup.jd}
                  onChange={(e) => update({ jd: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </FormSection>

        <FormSection n={2} title="The room">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Field label="Experience level" htmlFor="level">
              <select
                id="level"
                className={cn(inputClass, "cursor-pointer appearance-none")}
                value={setup.level}
                onChange={(e) => update({ level: e.target.value as (typeof LEVELS)[number] })}
              >
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Interview round" htmlFor="round">
              <select
                id="round"
                className={cn(inputClass, "cursor-pointer appearance-none")}
                value={setup.round}
                onChange={(e) => update({ round: e.target.value as (typeof ROUNDS)[number] })}
              >
                {ROUNDS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Segmented label="Interviewer style" options={STYLES} value={setup.style} onChange={(v) => update({ style: v })} />
            <Segmented
              label="Length"
              options={COUNTS}
              value={setup.question_count}
              onChange={(v) => update({ question_count: v })}
              render={(v) => `${v} questions`}
            />
          </div>
        </FormSection>

        <FormSection n={3} title="You">
          <Field
            label="Your resume"
            hint="Upload or paste"
            htmlFor="resume"
            aside={<span className="font-mono text-xs text-muted">{setup.resume.length.toLocaleString()} chars</span>}
          >
            <ResumeUpload onText={(resume) => update({ resume })} />
            <textarea
              id="resume"
              rows={7}
              className={cn(inputClass, "resize-y leading-relaxed")}
              placeholder="…or paste your resume text here"
              value={setup.resume}
              onChange={(e) => update({ resume: e.target.value })}
            />
          </Field>
          <AnimatePresence>
            {!setup.resume.trim() && ready && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 text-sm text-muted"
              >
                Tip: without a resume, questions and model answers will be generic.
              </motion.p>
            )}
          </AnimatePresence>
        </FormSection>

        {submit.error && <ErrorPanel message={submit.error} />}

        {/* Sticky summary: what you're about to start, always one tap away */}
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t-2 border-line bg-bg/90 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:bottom-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={ready ? "ready" : "empty"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={spring.snappy}
                  className="truncate font-semibold"
                >
                  {ready ? `${setup.role.trim()}${setup.company.trim() ? ` at ${setup.company.trim()}` : ""}` : "Add a role to begin"}
                </motion.p>
              </AnimatePresence>
              <p className="truncate text-sm text-muted">{summary}</p>
            </div>
            <div className="flex min-w-0 gap-2">
              <Button
                type="button"
                variant="ghost"
                aria-label="Skip to interview"
                loading={submit.busy === "skip"}
                disabled={!!submit.busy}
                onClick={() => void begin("skip")}
              >
                <Play className="size-4" aria-hidden /> <span className="sm:hidden">Skip</span>
                <span className="hidden sm:inline">Skip to interview</span>
              </Button>
              <Button type="submit" className="min-w-0 flex-1 sm:flex-none" loading={submit.busy === "brief"} disabled={!!submit.busy}>
                Build my prep brief <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function FormSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rule grid grid-cols-1 gap-5 pt-5 md:grid-cols-[180px_1fr] md:gap-8">
      <h2 className="flex items-baseline gap-3 text-headline">
        <span className="font-mono text-sm text-muted">0{n}</span>
        {title}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
