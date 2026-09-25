"use client";

import { Check, KeyRound, ListOrdered, LogOut, Target, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/dialog";
import { QueuePanel } from "@/components/learn";
import { PageShell, PageSkeleton, PageTitle } from "@/components/page-shell";
import { Button, Card, Field, inputClass } from "@/components/ui";
import {
  addToQueue,
  changePassword,
  deleteAccount,
  getPrefs,
  getQueue,
  putPrefs,
  removeFromQueue,
  updateMe,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TRACKS, trackColor } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/format";
import type { QueueItem } from "@/lib/schemas";
import { useStore } from "@/lib/store";

function Section({ icon, title, lede, children }: { icon: ReactNode; title: string; lede?: string; children: ReactNode }) {
  return (
    <Card className="rounded-3xl p-6 sm:p-7">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-display text-2xl font-extrabold">{title}</h2>
      </div>
      {lede && <p className="mt-1 text-sm text-muted">{lede}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function Saved({ show }: { show: boolean }) {
  return show ? (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-good" role="status">
      <Check className="size-4" strokeWidth={3} aria-hidden /> Saved
    </span>
  ) : null;
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
    <Section icon={<UserRound className="size-5" aria-hidden />} title="Profile" lede={user.email}>
      <form
        className="grid gap-5 sm:grid-cols-2"
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
      icon={<Target className="size-5" aria-hidden />}
      title="Focus areas"
      lede="Daily topics come only from tracks that are on. History from turned-off tracks still counts."
    >
      {focus === null ? (
        <p className="text-sm text-muted">{error ?? "Loading…"}</p>
      ) : (
        <div className="flex flex-wrap gap-3" role="group" aria-label="Focus areas">
          {TRACKS.map((t) => {
            const on = focus.includes(t.id);
            const last = on && focus.length === 1;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                disabled={last}
                title={last ? "Keep at least one track on" : undefined}
                onClick={() => void toggle(t.id)}
                className={cn(
                  "press neo-sm inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:cursor-not-allowed",
                  on ? "text-white" : "bg-surface text-muted",
                )}
                style={on ? { background: trackColor(t.id) } : undefined}
              >
                <span aria-hidden>{t.emoji}</span>
                {t.label}
                {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
              </button>
            );
          })}
        </div>
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
      icon={<ListOrdered className="size-5" aria-hidden />}
      title="Your queue"
      lede="Queued topics are served first, oldest first. Interview weak spots land here too."
    >
      {items === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <QueuePanel
          items={items}
          onAdd={async (title) => {
            const item = await addToQueue({ title });
            setItems((q) => (q && q.some((x) => x.id === item.id) ? q : [...(q ?? []), item]));
          }}
          onRemove={async (id) => {
            await removeFromQueue(id);
            setItems((q) => (q ?? []).filter((x) => x.id !== id));
          }}
        />
      )}
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<{ busy: boolean; saved: boolean; error?: string }>({ busy: false, saved: false });
  return (
    <Section icon={<KeyRound className="size-5" aria-hidden />} title="Password">
      <form
        className="grid gap-5 sm:grid-cols-2"
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
    <Card className="rounded-3xl border-bad p-6 sm:p-7">
      <h2 className="font-display text-2xl font-extrabold">Account</h2>
      <div className="mt-4 flex flex-wrap gap-3">
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
    </Card>
  );
}

export default function SettingsPage() {
  const { user, loading } = useAuth();
  if (loading || !user) return <PageSkeleton />;
  return (
    <PageShell>
      <PageTitle
        title={
          <>
            Make it <em className="text-gradient">yours</em>
          </>
        }
      />
      <div className="grid gap-6">
        <FocusSection />
        <QueueSection />
        <ProfileSection />
        <PasswordSection />
        <DangerSection />
      </div>
    </PageShell>
  );
}
