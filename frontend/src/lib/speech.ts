"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* ---------- Text to speech (interviewer reads questions aloud) ---------- */

const noopSubscribe = () => () => {};

export function useSpeechSynthesis() {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "speechSynthesis" in window,
    () => false,
  );
  const [speaking, setSpeaking] = useState(false);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  useEffect(() => cancel, [cancel]);
  return { supported, speaking, speak, cancel };
}

/* ---------- Speech to text (answer by voice) ---------- */

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(onText: (text: string) => void) {
  const supported = useSyncExternalStore(noopSubscribe, () => getRecognition() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("");
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  // Chrome ends recognition (fires "no-speech") after a few seconds of silence even with
  // continuous=true - restart quietly rather than treating a pause as "stopped". Capped so
  // a genuinely broken mic doesn't loop forever.
  const quickRestarts = useRef(0);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const stop = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    try {
      r?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  const start = useCallback(
    (base: string) => {
      const Ctor = getRecognition();
      if (!Ctor) return;
      quickRestarts.current = 0;
      try {
        const r = new Ctor();
        r.continuous = true;
        r.interimResults = true;
        r.lang = navigator.language || "en-IN";
        const prefix = base.trim() ? `${base.trim()} ` : "";
        let finals = "";
        r.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finals += `${res[0].transcript} `;
            else interim += res[0].transcript;
          }
          quickRestarts.current = 0; // real speech came through; forget any silent streak
          onTextRef.current(prefix + finals + interim);
        };
        r.onerror = (e) => {
          // Only act on the recognition we're still using: a stale instance's error
          // (from our own stop(), or one already replaced) is not our concern.
          if (rec.current !== r) return;
          if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            setNote("Microphone access is blocked. Type your answer instead.");
            stop();
            return;
          }
          if (e.error === "no-speech") {
            quickRestarts.current += 1;
            if (quickRestarts.current <= 6) return; // onend below restarts it
          }
          setNote(
            e.error === "audio-capture"
              ? "No microphone found. Type your answer instead."
              : e.error === "network"
                ? "Voice input needs a network connection. Type your answer instead."
                : "Voice input stopped. Tap the mic to continue.",
          );
          stop();
        };
        r.onend = () => {
          if (rec.current !== r) return;
          // A pause (no-speech) ends the browser's session but we're still "listening" -
          // start a fresh one right away, silently, unless we've given up above.
          if (quickRestarts.current > 0 && quickRestarts.current <= 6) {
            try {
              r.start();
              return;
            } catch {
              /* fall through to a real stop */
            }
          }
          stop();
        };
        rec.current = r;
        r.start();
        setNote("");
        setListening(true);
      } catch {
        setNote("Voice input isn't available here. Type your answer instead.");
        rec.current = null;
      }
    },
    [stop],
  );

  useEffect(() => stop, [stop]);
  return { supported, listening, note, start, stop };
}

/* ---------- Live microphone level, for the waveform ---------- */

export function useMicLevels(active: boolean, bars = 24) {
  const [levels, setLevels] = useState<number[]>(() => Array(bars).fill(0));

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) return;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const step = Math.floor(data.length / bars) || 1;
          setLevels(Array.from({ length: bars }, (_, i) => data[i * step] / 255));
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {
        /* no mic permission: waveform just stays flat */
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setLevels(Array(bars).fill(0));
    };
  }, [active, bars]);

  return levels;
}
