"use client";

import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { login, signup } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { LogoMark } from "./logo";
import { Button, Field, inputClass } from "./ui";

function safeNext(next: string | null) {
  // Only same-site paths: never redirect to another origin after login.
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const isSignup = mode === "signup";

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
      if (isSignup) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
        await signup({ name, email, password, timezone });
      } else {
        await login({ email, password });
      }
      router.replace(safeNext(params.get("next")));
      router.refresh();
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
              Start your <em className="text-gradient">streak</em>
            </>
          ) : (
            <>
              Log in to <em className="text-gradient">{BRAND}</em>
            </>
          )}
        </h1>
        <p className="mt-2 text-muted">
          {isSignup
            ? "One topic a day, honest interview practice, and a streak you'll want to protect."
            : "Your streak missed you."}
        </p>

        {/* method=post: if submitted before JavaScript loads, credentials never end up in a URL. */}
        <form method="post" onSubmit={(e) => void submit(e)} className="mt-7 grid gap-5">
          {isSignup && (
            <Field label="Your name" htmlFor="name">
              <input id="name" name="name" className={inputClass} autoComplete="name" required maxLength={80} />
            </Field>
          )}
          <Field label="Email" htmlFor="email">
            <input id="email" name="email" type="email" className={inputClass} autoComplete="email" required />
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
                {show ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
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
            <p role="alert" className="rounded-xl border-2 border-bad bg-bad/10 px-4 py-3 text-sm font-medium">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" loading={busy}>
            {isSignup ? "Create account" : "Log in"} <ArrowRight className="size-4" aria-hidden />
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
