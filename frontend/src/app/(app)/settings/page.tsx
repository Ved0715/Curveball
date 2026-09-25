"use client";

import { Check, LogOut, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/dialog";
import { QueuePanel } from "@/components/learn";
import { CurveUnderline, TrackGlyph } from "@/components/brand";
import { PageSkeleton } from "@/components/page-shell";
import { Skel } from "@/components/skeleton";
import { Button, Field, inputClass } from "@/components/ui";
import { changePassword, deleteAccount, getPrefs, getQueue, putPrefs, updateMe } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TRACKS } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { QueueItem } from "@/lib/schemas";
import { useStore } from "@/lib/store";

/** Ruled settings row: what it is on the left, the controls on the right. */
function Section({ id, title, lede, children }: { id?: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="rule grid scroll-mt-24 grid-cols-1 gap-5 pt-6 lg:grid-cols-[260px_1fr] lg:gap-10">
      <div>
        <h2 className="text-headline">{title}</h2>
        {lede && <p className="mt-1.5 text-sm text-muted">{lede}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Saved({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={spring.bouncy}
          className="inline-flex items-center gap-1 text-sm font-semibold text-good"
          role="status"
        >
          <Check className="size-4" strokeWidth={3} aria-hidden /> Saved
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [user?.timezone ?? "Asia/Kolkata"];
    }
  }, [user?.timezone]);
  const [name, setName] = useState(user?.name ?? "");
  const [tz, setTz] = useState(user?.timezone ?? "Asia/Kolkata");
  const [state, setState] = useState<{ busy: boolean; saved: boolean; error?: string }>({ busy: false, saved: false });
  if (!user) return null;
  return (
    <Section title="Profile" lede={user.email}>
      <form
        className="grid grid-cols-1 gap-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setState({ busy: true, saved: false });
          try {
            setUser(await updateMe({ name, timezone: tz }));
            setState({ busy: false, saved: true });
          } catch (err) {
            setState({ busy: false, saved: false, error: friendlyError(err) });
          }
        }}
      >
        <Field label="Name" htmlFor="name">
          <input id="name" className={inputClass} value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Timezone" hint="decides when your day rolls over" htmlFor="tz">
          <select id="tz" className={cn(inputClass, "cursor-pointer")} value={tz} onChange={(e) => setTz(e.target.value)}>
            {(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={state.busy}>
            Save profile
          </Button>
          <Saved show={state.saved} />
          {state.error && <span className="text-sm text-bad">{state.error}</span>}
        </div>
      </form>
    </Section>
  );
}

function FocusSection() {
  const [focus, setFocus] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    getPrefs()
      .then((p) => setFocus(p.focus_areas))
      .catch((err: unknown) => setError(friendlyError(err)));
  }, []);
  async function toggle(id: string) {
    if (!focus) return;
    const next = focus.includes(id) ? focus.filter((f) => f !== id) : [...focus, id];
    if (!next.length) return;
    setFocus(next);
    try {
      setFocus((await putPrefs(next)).focus_areas);
      setError(undefined);
    } catch (err) {
      setFocus(focus);
      setError(friendlyError(err));
    }
  }
  return (
    <Section
      title="Focus areas"
      lede="Daily topics come only from tracks that are on. History from turned-off tracks still counts."
    >
      {focus === null ? (
        error ? (
          <p className="text-sm text-bad">{error}</p>
        ) : (
          <div className="grid gap-2" aria-busy>
            {TRACKS.map((t) => (
              <Skel key={t.id} className="h-12" />
            ))}
          </div>
        )
      ) : (
        <ul className="grid" role="group" aria-label="Focus areas">
          {TRACKS.map((t) => {
            const on = focus.includes(t.id);
            const last = on && focus.length === 1;
            return (
              <li key={t.id} className="rule-soft first:border-t-0">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={last}
                  title={last ? "Keep at least one track on" : undefined}
                  onClick={() => void toggle(t.id)}
                  className="group flex min-h-14 w-full cursor-pointer items-center gap-3 py-2 text-left disabled:cursor-not-allowed"
                >
                  <TrackGlyph id={t.id} size={14} className={cn("transition", !on && "opacity-35 grayscale")} />
                  <span className={cn("flex-1 font-semibold transition-colors", on ? "text-ink" : "text-muted")}>{t.label}</span>
                  {last && <span className="hidden text-xs text-muted sm:inline">keep one on</span>}
                  <span
                    className={cn(
                      "relative h-7 w-12 shrink-0 rounded-full border-2 border-line transition-colors",
                      on ? "bg-pop" : "bg-surface",
                    )}
                    aria-hidden
                  >
                    <motion.span
                      className="absolute top-0.5 left-0.5 size-5 rounded-full border-2 border-line bg-ink"
                      initial={false}
                      animate={{ x: on ? 20 : 0 }}
                      transition={spring.press}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && focus !== null && <p className="mt-3 text-sm text-bad">{error}</p>}
    </Section>
  );
}

function QueueSection() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  useEffect(() => {
    getQueue()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  return (
    <Section
      id="queue"
      title="Your queue"
      lede="Queued topics are served before anything else, top first. Drag to reorder. Interview weak spots land here too."
    >
      {items === null ? (
        <div className="grid gap-2" aria-busy>
          <Skel className="h-12" />
          <Skel className="h-12" />
        </div>
      ) : (
        <QueuePanel items={items} setItems={(fn) => setItems((xs) => fn(xs ?? []))} />
      )}
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<{ busy: boolean; saved: boolean; error?: string }>({ busy: false, saved: false });
  return (
    <Section title="Password" lede="Changing it keeps you signed in here.">
      <form
        className="grid grid-cols-1 gap-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setState({ busy: true, saved: false });
          try {
            await changePassword({ current, new: next });
            setCurrent("");
            setNext("");
            setState({ busy: false, saved: true });
          } catch (err) {
            setState({ busy: false, saved: false, error: friendlyError(err) });
          }
        }}
      >
        <Field label="Current password" htmlFor="pw-current">
          <input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            className={inputClass}
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" hint="8+ characters" htmlFor="pw-new">
          <input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            minLength={8}
            className={inputClass}
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="ghost" loading={state.busy}>
            Change password
          </Button>
          <Saved show={state.saved} />
          {state.error && <span className="text-sm text-bad">{state.error}</span>}
        </div>
      </form>
    </Section>
  );
}

function DangerSection() {
  const router = useRouter();
  const { logout } = useAuth();
  const reset = useStore((s) => s.reset);
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  return (
    <Section title="Account" lede="Deleting removes your log, streaks, interviews, reports and resume for good.">
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => void logout()}>
          <LogOut className="size-4" aria-hidden /> Log out
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          <Trash2 className="size-4" aria-hidden /> Delete account and all data
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete everything?"
        body="This permanently deletes your account, learning log, streaks, interviews, reports and resume. It can't be undone."
        confirmLabel="Delete my account"
        danger
        busy={state.busy}
        error={state.error}
        onConfirm={async () => {
          setState({ busy: true });
          try {
            await deleteAccount();
            reset();
            router.replace("/");
          } catch (err) {
            setState({ busy: false, error: friendlyError(err) });
          }
        }}
      />
    </Section>
  );
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return <PageSkeleton />;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-6 lg:pt-12">
      <header className="mb-10">
        <p className="text-label text-muted">Settings</p>
        <h1 className="mt-3 text-hero">
          Make it <CurveUnderline>yours</CurveUnderline>
        </h1>
      </header>
      <div className="grid grid-cols-1 gap-12">
        <FocusSection />
        <QueueSection />
        <ProfileSection />
        <PasswordSection />
        <DangerSection />
      </div>
    </div>
  );
}
