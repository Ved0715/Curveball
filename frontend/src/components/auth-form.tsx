"use client";

import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getProviders, login, signup } from "@/lib/api";
import { primeUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { CurveUnderline } from "./brand";
import { LogoMark } from "./logo";
import { Button, Field, inputClass } from "./ui";

/** Messages for ?error=… when Google sends someone back without signing them in. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled:
    "Google sign-in was cancelled. Try again, or log in with your email.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
  google_unverified:
    "That Google account's email isn't verified yet. Verify it with Google, or use your email instead.",
  google_unavailable:
    "Google sign-in isn't set up on this server yet. Use your email for now.",
  too_many_attempts:
    "Too many sign-in attempts. Wait a few minutes and try again.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function safeNext(next: string | null) {
  // Only same-site paths: never redirect to another origin after login.
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/today";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(
    () => GOOGLE_ERRORS[params.get("error") ?? ""],
  );
  // null while we ask the server; false hides the button (Google not configured).
  const [google, setGoogle] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  const isSignup = mode === "signup";
  const next = safeNext(params.get("next"));

  // No router.prefetch(next) here: prefetching while signed out caches the proxy's
  // "go to /login" answer, and the router would replay it after login (production only).

  useEffect(() => {
    getProviders()
      .then((p) => setGoogle(p.google))
      .catch(() => setGoogle(false));
  }, []);

  // Inputs are uncontrolled and read on submit, so anything typed before the page finished
  // loading is kept (a controlled input would be reset when React takes over).
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError(undefined);
    try {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
      primeUser(
        isSignup
          ? await signup({ name, email, password, timezone })
          : await login({ email, password }),
      );
      router.replace(next);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-md content-center px-4 py-12">
      <div className="neo bg-surface relative rounded-3xl p-7 sm:p-9">
        <span className="sticker absolute -top-4 right-6 bg-sun text-sm text-[#16131a]">
          {isSignup ? "Day 1 starts now" : "Welcome back"}
        </span>
        <LogoMark size={44} />
        <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight">
          {isSignup ? (
            <>
              Start your <CurveUnderline>streak</CurveUnderline>
            </>
          ) : (
            <>
              Log in to <CurveUnderline>{BRAND}</CurveUnderline>
            </>
          )}
        </h1>
        <p className="mt-2 text-muted">
          {isSignup
            ? "One topic a day, honest interview practice, and a streak you'll want to protect."
            : "Your streak missed you."}
        </p>

        {google !== false && (
          <div className="mt-7">
            {google === null ? (
              <span className="skeleton block h-12 rounded-xl" aria-hidden />
            ) : (
              // A plain GET form: a full page load to the API, which redirects to Google.
              <form
                action="/api/auth/google/start"
                method="get"
                onSubmit={(e) => {
                  const tz = e.currentTarget.elements.namedItem(
                    "tz",
                  ) as HTMLInputElement;
                  tz.value =
                    Intl.DateTimeFormat().resolvedOptions().timeZone ||
                    "Asia/Kolkata";
                  setLeaving(true);
                }}
              >
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="tz" defaultValue="" />
                <button
                  type="submit"
                  disabled={leaving}
                  aria-busy={leaving || undefined}
                  className="press neo-sm flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-surface font-semibold disabled:opacity-60"
                >
                  {leaving ? (
                    <LoaderCircle className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <GoogleMark />
                  )}
                  Continue with Google
                </button>
              </form>
            )}
            <p
              className="mt-6 flex items-center gap-3 text-xs font-semibold text-muted uppercase"
              aria-hidden
            >
              <span className="h-0.5 flex-1 bg-line-soft" /> or with email{" "}
              <span className="h-0.5 flex-1 bg-line-soft" />
            </p>
          </div>
        )}

        {/* method=post: if submitted before JavaScript loads, credentials never end up in a URL. */}
        <form
          method="post"
          onSubmit={(e) => void submit(e)}
          className={`${google === false ? "mt-7" : "mt-5"} grid gap-5`}
        >
          {isSignup && (
            <Field label="Your name" htmlFor="name">
              <input
                id="name"
                name="name"
                className={inputClass}
                autoComplete="name"
                required
                maxLength={80}
              />
            </Field>
          )}
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              className={inputClass}
              autoComplete="email"
              required
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            hint={isSignup ? "8+ characters" : undefined}
            aside={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? (
                  <EyeOff className="size-3.5" aria-hidden />
                ) : (
                  <Eye className="size-3.5" aria-hidden />
                )}
                {show ? "Hide" : "Show"}
              </button>
            }
          >
            <input
              id="password"
              type={show ? "text" : "password"}
              className={inputClass}
              name="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 8 : 1}
              maxLength={128}
            />
          </Field>
          {error && (
            <p
              role="alert"
              className="rounded-xl border-2 border-bad bg-bad/10 px-4 py-3 text-sm font-medium"
            >
              {error}
            </p>
          )}
          <Button type="submit" size="lg" loading={busy}>
            {isSignup ? "Create account" : "Log in"}{" "}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link
            href={`${isSignup ? "/login" : "/signup"}${params.get("next") ? `?next=${encodeURIComponent(params.get("next") ?? "")}` : ""}`}
            className="font-bold text-ink underline decoration-pop decoration-4 underline-offset-4"
          >
            {isSignup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
    </div>
  );
}
