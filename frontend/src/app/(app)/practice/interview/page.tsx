"use client";

import {
  ArrowRight,
  Lightbulb,
  Mic,
  MicOff,
  ScrollText,
  Send,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/dialog";
import { InterviewerOrb, Waveform, type OrbMode } from "@/components/orb";
import { SessionGate } from "@/components/session-gate";
import { ErrorPanel } from "@/components/status";
import { Stamp } from "@/components/brand";
import { Button, Card, Kbd } from "@/components/ui";
import { deleteSession, endSession, streamHint } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn, formatClock, shortRound } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useMicLevels, useSpeechRecognition, useSpeechSynthesis } from "@/lib/speech";
import type { Session } from "@/lib/schemas";
import { answeredCount, useStore } from "@/lib/store";
import { useElapsed, useInterviewerTurn } from "@/lib/use-interviewer";

function Progress({ iv }: { iv: Session }) {
  const n = iv.setup.question_count;
  const k = iv.state.main_asked;
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const done = iv.state.done || i < k - 1;
        const current = !iv.state.done && i === k - 1;
        return (
          <div
            key={i}
            className={cn(
              "h-2.5 flex-1 overflow-hidden rounded-full border-2 bg-surface transition-colors",
              done || current ? "border-line" : "border-line-soft",
            )}
          >
            <motion.div
              className="h-full origin-left bg-pop"
              initial={false}
              animate={{ scaleX: done ? 1 : current ? 0.5 : 0 }}
              transition={spring.gentle}
            />
          </div>
        );
      })}
    </div>
  );
}

function Room({ iv }: { iv: Session }) {
  const router = useRouter();
  const openSession = useStore((s) => s.openSession);
  const closeSession = useStore((s) => s.closeSession);
  const speakAloud = useStore((s) => s.speakAloud);
  const setSpeakAloud = useStore((s) => s.setSpeakAloud);

  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState<{ text: string; loading: boolean; error?: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [ending, setEnding] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [turnStartedAt, setTurnStartedAt] = useState(() => Date.now());
  const answerRef = useRef<HTMLTextAreaElement>(null);

  const tts = useSpeechSynthesis();
  const mic = useSpeechRecognition(setAnswer);
  const levels = useMicLevels(mic.listening, 28);

  const { live, busy, error, ask, answer: sendAnswer, stop } = useInterviewerTurn(iv.id, (say, done) => {
    setTurnStartedAt(Date.now());
    setHint(null);
    if (useStore.getState().speakAloud) tts.speak(say);
    if (!done) setTimeout(() => answerRef.current?.focus(), 50);
  });

  const lastInterviewer = [...iv.turns].reverse().find((t) => t.speaker === "interviewer");
  const last = iv.turns.at(-1);
  const awaitingInterviewer = !iv.state.done && (!last || last.speaker === "candidate");
  const answering = !busy && !iv.state.done && !awaitingInterviewer;
  const seconds = useElapsed(turnStartedAt, answering);

  // Start the interview, or resume it if we left mid-turn.
  useEffect(() => {
    if (awaitingInterviewer && !busy && !error) void ask();
  }, [awaitingInterviewer, busy, error, ask]);

  function send() {
    const text = answer.trim();
    if (!text || busy || iv.state.done) return;
    mic.stop();
    tts.cancel();
    setAnswer("");
    setHint(null);
    sendAnswer({ answer: text, answer_seconds: seconds });
  }

  async function getHint() {
    if (!lastInterviewer || busy) return;
    setHint({ text: "", loading: true });
    try {
      const text = await streamHint(iv.id, (d) =>
        setHint((h) => ({ text: (h?.text ?? "") + d, loading: true })),
      );
      setHint({ text, loading: false });
    } catch (err) {
      setHint({ text: "", loading: false, error: friendlyError(err) });
    }
  }

  const answered = answeredCount(iv.turns);

  async function finish() {
    setEnding({ busy: true });
    stop();
    mic.stop();
    tts.cancel();
    try {
      if (answered) {
        openSession(await endSession(iv.id));
        router.push("/practice/report");
      } else {
        await deleteSession(iv.id);
        closeSession();
        router.push("/practice");
      }
      setConfirm(false);
    } catch (err) {
      setEnding({ busy: false, error: friendlyError(err) });
    }
  }
  const mode: OrbMode = busy ? (live ? "speaking" : "thinking") : tts.speaking ? "speaking" : mic.listening ? "listening" : "idle";
  const question = busy ? live : (lastInterviewer?.text ?? "");
  const isFollowup = !busy && lastInterviewer?.kind === "followup";

  return (
    <div className="mx-auto max-w-4xl">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold" aria-live="polite">
          {!iv.state.done && (
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-bad opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-bad" />
            </span>
          )}
          {iv.state.done
            ? "Interview finished"
            : iv.state.main_asked
              ? `Question ${iv.state.main_asked} of ${iv.setup.question_count}${isFollowup ? " · follow-up" : ""}`
              : "Starting"}
        </span>
        <div className="flex items-center gap-2">
          {tts.supported && (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={speakAloud}
              onClick={() => {
                if (speakAloud) tts.cancel();
                setSpeakAloud(!speakAloud);
              }}
            >
              {speakAloud ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
              <span className="hidden sm:inline">Read aloud</span>
            </Button>
          )}
          {!iv.state.done && (
            <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
              <X className="size-4" aria-hidden /> End
            </Button>
          )}
        </div>
      </div>
      <Progress iv={iv} />

      {/* Stage */}
      <Card className="relative mt-6 overflow-hidden p-6 sm:p-10">
        <div className="relative flex items-center gap-4">
          <InterviewerOrb mode={mode} initial={iv.interviewer[0]} size={64} />
          <div>
            <p className="font-semibold">{iv.interviewer}</p>
            <p className="text-sm text-muted">
              {iv.setup.style} interviewer · {shortRound(iv.setup.round)}
              {iv.setup.company ? ` · ${iv.setup.company}` : ""}
            </p>
          </div>
        </div>

        <p
          className={cn(
            "relative mt-8 min-h-[4.5em] max-w-[34ch] font-display text-[clamp(1.7rem,4.2vw,2.6rem)] leading-[1.2] tracking-[-0.01em] transition-opacity",
            busy && !live && "opacity-40",
          )}
          aria-live="polite"
        >
          {question || (busy ? <span className="shimmer-text">{iv.interviewer} is thinking…</span> : null)}
          {busy && live && <span className="caret" />}
        </p>

        <AnimatePresence>
          {hint && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 flex gap-3 rounded-xl border-2 border-dashed border-line bg-pop/15 p-4 text-sm" aria-live="polite">
                <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p className="flex-1 whitespace-pre-wrap">
                  {hint.error ?? (hint.text || <span className="shimmer-text">Thinking of a nudge…</span>)}
                </p>
                <button type="button" onClick={() => setHint(null)} aria-label="Close hint" className="-m-2 grid size-9 cursor-pointer place-items-center rounded-lg text-muted hover:text-ink">
                  <X className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-4">
            <ErrorPanel message={friendlyError(error)} onRetry={() => void ask()} />
          </div>
        )}
      </Card>

      {/* Composer or finish */}
      {iv.state.done ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <Stamp className="mb-4">Finished</Stamp>
              <h2 className="text-title">That&apos;s a wrap.</h2>
              <p className="text-muted">
                You answered {answered} question{answered === 1 ? "" : "s"}. Let&apos;s see how it went.
              </p>
            </div>
            <Button size="lg" onClick={() => router.push("/practice/report")}>
              Get my report <ArrowRight className="size-4" aria-hidden />
            </Button>
          </Card>
        </motion.div>
      ) : (
        <Card className="mt-4 p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <label htmlFor="answer" className="text-sm font-semibold">
              Your answer
            </label>
            <span className="font-mono text-xs text-muted tabular-nums" aria-label="Time on this answer">
              {answering ? formatClock(seconds) : "–:––"}
            </span>
          </div>
          <textarea
            ref={answerRef}
            id="answer"
            rows={5}
            value={answer}
            disabled={busy}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Answer as you would out loud…"
            className="w-full resize-y rounded-xl border-2 border-line bg-bg p-4 leading-relaxed outline-none transition focus:shadow-[4px_4px_0_var(--pop)] disabled:opacity-60"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {mic.supported && (
                <Button
                  variant={mic.listening ? "danger" : "ghost"}
                  size="sm"
                  aria-pressed={mic.listening}
                  disabled={busy}
                  onClick={() => (mic.listening ? mic.stop() : mic.start(answer))}
                >
                  {mic.listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                  {mic.listening ? "Stop" : "Speak"}
                </Button>
              )}
              {mic.listening && <Waveform levels={levels} active />}
              <Button variant="ghost" size="sm" disabled={busy || !lastInterviewer || hint?.loading} onClick={() => void getHint()}>
                <Lightbulb className="size-4" aria-hidden /> I&apos;m stuck
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted sm:inline">
                <Kbd>⌘</Kbd> <Kbd>Enter</Kbd>
              </span>
              <Button onClick={send} disabled={busy || !answer.trim()}>
                Send <Send className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
          {mic.note && (
            <p className="mt-2 px-1 text-xs text-muted" aria-live="polite">
              {mic.note}
            </p>
          )}
        </Card>
      )}

      {busy && (
        <div className="mt-3 flex justify-center">
          <Button variant="soft" size="sm" onClick={stop}>
            <Square className="size-3 fill-current" aria-hidden /> Stop
          </Button>
        </div>
      )}

      {/* Transcript */}
      {iv.turns.length > 1 && (
        <details className="group mt-8">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
            <ScrollText className="size-4" aria-hidden /> Transcript ({iv.turns.length} turns)
            <span className="text-xs transition-transform group-open:rotate-90" aria-hidden>▸</span>
          </summary>
          <ol className="mt-4 grid gap-3">
            {iv.turns.map((t, i) => (
              <li
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl p-4 text-sm",
                  t.speaker === "candidate" ? "ml-auto border-2 border-line bg-pop/20" : "border-2 border-line-soft bg-surface",
                )}
              >
                <p className="mb-1 text-label text-muted">
                  {t.speaker === "candidate" ? "You" : iv.interviewer}
                  {t.answer_seconds ? ` · ${formatClock(t.answer_seconds)}` : ""}
                </p>
                {t.text}
              </li>
            ))}
          </ol>
        </details>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={answered ? "End the interview?" : "Leave without answering?"}
        body={
          answered
            ? `We'll score the ${answered} answer${answered === 1 ? "" : "s"} you gave.`
            : "Nothing has been answered, so there's nothing to score."
        }
        confirmLabel={answered ? "End and score" : "Leave"}
        danger={!answered}
        busy={ending.busy}
        error={ending.error}
        onConfirm={() => void finish()}
      />
    </div>
  );
}

export default function InterviewPage() {
  return <SessionGate>{(session) => <Room iv={session} />}</SessionGate>;
}
