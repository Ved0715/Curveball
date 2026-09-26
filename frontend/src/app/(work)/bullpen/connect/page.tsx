"use client";

import { Check, Copy, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ConfirmDialog } from "@/components/dialog";
import { Skel } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { Button, Field, inputClass, Segmented } from "@/components/ui";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/api";
import { WORK_BRAND } from "@/lib/brand";
import { friendlyError } from "@/lib/errors";
import { cn, timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import type { ApiToken } from "@/lib/schemas";

const CLIENTS = ["Claude Code", "Cursor", "Other"] as const;
type Client = (typeof CLIENTS)[number];

function snippet(client: Client, url: string, token: string): string {
  if (client === "Claude Code")
    return `claude mcp add --transport http bullpen ${url} \\\n  --header "Authorization: Bearer ${token}"`;
  if (client === "Cursor")
    return JSON.stringify({ mcpServers: { bullpen: { url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  return `URL:     ${url}\nHeader:  Authorization: Bearer ${token}\nTransport: Streamable HTTP`;
}

function CopyBlock({ text, label, disabled = false }: { text: string; label: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre
        className={cn(
          "overflow-x-auto rounded-xl border-2 border-line-soft bg-bg p-4 pr-14 font-mono text-[0.8rem] leading-relaxed",
          disabled && "opacity-45 select-none",
        )}
      >
        {text}
      </pre>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Copy ${label}`}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2.5 right-2.5 grid size-9 cursor-pointer place-items-center rounded-lg border-2 border-line-soft bg-surface text-muted hover:border-line hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? <Check className="size-4 text-good" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

const noop = () => () => {};

export default function ConnectPage() {
  const toast = useToast();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const url = `${origin}/api/mcp`;
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [fresh, setFresh] = useState<ApiToken | null>(null);
  const [client, setClient] = useState<Client>("Claude Code");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);

  useEffect(() => {
    listApiTokens()
      .then(setTokens)
      .catch(() => setTokens([]));
  }, []);

  // A setup line with a placeholder token can only fail, so it isn't copyable until a real one exists.
  const shown = fresh?.token ?? "cbk_CREATE_A_TOKEN_FIRST";

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:pt-12">
      <header className="mb-10">
        <p className="text-label text-muted">{WORK_BRAND} · connect</p>
        <h1 className="mt-3 text-display">Bring your agent</h1>
        <p className="mt-4 max-w-2xl text-muted">
          {WORK_BRAND} speaks MCP, so any agent that does (Claude Code, Cursor, Antigravity, Windsurf, Cline) can plan into it
          and work from it. One URL, one token.
        </p>
      </header>

      <div className="grid gap-12">
        <section className="rule grid gap-5 pt-5 md:grid-cols-[200px_1fr] md:gap-8">
          <h2 className="flex items-baseline gap-3 text-headline">
            <span className="font-mono text-sm text-accent">01</span>Make a token
          </h2>
          <div className="min-w-0">
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = String(new FormData(form).get("name") ?? "").trim();
                setBusy(true);
                try {
                  const t = await createApiToken(name || "My agent");
                  setFresh(t);
                  setTokens((old) => [t, ...(old ?? [])]);
                  form.reset();
                } catch (err) {
                  toast({ title: "Couldn't create a token", description: friendlyError(err), tone: "error" });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="flex-1">
                <Field label="Name it after where it lives" htmlFor="tok-name">
                  <input id="tok-name" name="name" maxLength={80} placeholder="Claude Code · work laptop" className={inputClass} />
                </Field>
              </div>
              <Button type="submit" size="lg" className="h-[50px]" loading={busy}>
                <KeyRound className="size-4" aria-hidden /> Create token
              </Button>
            </form>

            <AnimatePresence>
              {fresh?.token && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={spring.gentle}
                  className="mt-5 rounded-2xl border-2 border-pop p-4"
                  role="status"
                >
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="size-4 text-pop" aria-hidden /> Copy it now. It won&apos;t be shown again.
                  </p>
                  <CopyBlock text={fresh.token} label="token" />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6">
              <h3 className="mb-2 text-label text-muted">Active tokens</h3>
              {tokens === null ? (
                <Skel className="h-12" />
              ) : tokens.length === 0 ? (
                <p className="text-sm text-muted">None yet.</p>
              ) : (
                <ul>
                  {tokens.map((t) => (
                    <li key={t.id} className="rule-soft flex items-center gap-3 py-3 first:border-t-0">
                      <KeyRound className="size-4 shrink-0 text-muted" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{t.name}</p>
                        <p className="font-mono text-xs text-muted">
                          {t.prefix}… · made {timeAgo(t.created_at)} · {t.last_used_at ? `used ${timeAgo(t.last_used_at)}` : "never used"}
                        </p>
                      </div>
                      <Button variant="soft" size="sm" aria-label={`Revoke ${t.name}`} onClick={() => setRevoking(t)}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="rule grid gap-5 pt-5 md:grid-cols-[200px_1fr] md:gap-8">
          <h2 className="flex items-baseline gap-3 text-headline">
            <span className="font-mono text-sm text-accent">02</span>Plug it in
          </h2>
          <div className="min-w-0">
            <div className="mb-4 max-w-md">
              <Segmented label="Your agent" hideLabel options={CLIENTS} value={client} onChange={setClient} />
            </div>
            <CopyBlock text={snippet(client, url, shown)} label={`${client} setup`} disabled={!fresh?.token} />
            <p className={cn("mt-2 text-sm", fresh?.token ? "text-good" : "font-semibold text-sun")}>
              {fresh?.token
                ? "Your new token is already filled in."
                : "Create a token in step 01 first: this fills in with it and becomes copyable. (Tokens are shown only once, so an existing one can't be refilled; make a new one.)"}
              {client === "Cursor" && " Add this to .cursor/mcp.json in your project, or ~/.cursor/mcp.json for all projects."}
            </p>
          </div>
        </section>

        <section className="rule grid gap-5 pt-5 md:grid-cols-[200px_1fr] md:gap-8">
          <h2 className="flex items-baseline gap-3 text-headline">
            <span className="font-mono text-sm text-accent">03</span>Give it a big task
          </h2>
          <div className="min-w-0">
            <CopyBlock
              label="example prompt"
              text={`Use Bullpen to plan and fix: <your big task>.\nCreate a session, decompose it into leaves that pass the leaf test,\nthen claim and ship the ready leaves one by one.`}
            />
            <p className="mt-2 text-sm text-muted">Keep this page open in another tab: the tree fills in live as the agent works.</p>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke “${revoking?.name ?? ""}”?`}
        body="Any agent using it stops working immediately."
        confirmLabel="Revoke"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!revoking) return;
          setBusy(true);
          try {
            await revokeApiToken(revoking.id);
            setTokens((old) => (old ?? []).filter((t) => t.id !== revoking.id));
            if (fresh?.id === revoking.id) setFresh(null);
            setRevoking(null);
          } catch (err) {
            toast({ title: "Couldn't revoke it", description: friendlyError(err), tone: "error" });
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
