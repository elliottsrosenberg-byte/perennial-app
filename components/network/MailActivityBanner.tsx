"use client";

// Sits at the top of a contact's Activity timeline. Three jobs:
//   1. If the user has no mail account connected, nudge them to connect one —
//      email activity can't appear until they do (PER-146).
//   2. If a mail account IS connected, kick off a background sync when the tab
//      opens so newly-arrived mail shows up without waiting for the cron.
//   3. While the one-time full-inbox import is still running, show progress so
//      the user knows history is still filling in.
//
// State is derived from the user's own `integrations` rows (RLS-scoped). The
// heavy lifting lives server-side; this component only triggers + reflects it.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, RefreshCw } from "lucide-react";

interface MailIntegration {
  id:          string;
  provider:    string;
  scopes:      Record<string, boolean> | null;
  status:      string;
  sync_state:  Record<string, unknown> | null;
}

interface BackfillState {
  status:  "running" | "done";
  scanned: number;
}

// Trigger a sync-on-open at most this often (per browser session) so clicking
// through many contacts doesn't hammer the sync route.
const SYNC_MIN_INTERVAL_MS = 60_000;
let lastSyncTriggeredAt = 0;

function mailConnected(rows: MailIntegration[]): boolean {
  return rows.some(
    (r) =>
      r.status === "active" &&
      ((r.provider.startsWith("google") && !!r.scopes?.gmail) ||
        (r.provider === "microsoft" && !!r.scopes?.mail)),
  );
}

function backfillOf(rows: MailIntegration[]): BackfillState | null {
  for (const r of rows) {
    const bf = r.sync_state?.gmail_backfill as BackfillState | undefined;
    if (bf && bf.status === "running") return bf;
  }
  return null;
}

export default function MailActivityBanner({ onSynced }: { onSynced: () => void }) {
  const [rows,    setRows]    = useState<MailIntegration[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadRows(): Promise<MailIntegration[]> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setRows([]); return []; }
    const { data } = await supabase
      .from("integrations")
      .select("id, provider, scopes, status, sync_state")
      .eq("user_id", user.id)
      .in("provider", ["google", "google_calendar", "microsoft"]);
    const list = (data ?? []) as MailIntegration[];
    setRows(list);
    return list;
  }

  async function triggerSync(providers: Set<string>) {
    if (Date.now() - lastSyncTriggeredAt < SYNC_MIN_INTERVAL_MS) return;
    lastSyncTriggeredAt = Date.now();
    setSyncing(true);
    try {
      const calls: Promise<unknown>[] = [];
      if (providers.has("google"))    calls.push(fetch("/api/integrations/google/sync",    { method: "POST" }));
      if (providers.has("microsoft")) calls.push(fetch("/api/integrations/microsoft/sync", { method: "POST" }));
      await Promise.allSettled(calls);
    } catch { /* best-effort */ }
    await loadRows();
    onSynced();
    setSyncing(false);
  }

  // On mount: load status, and if connected, trigger a background sync.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadRows();
      if (cancelled || !mailConnected(list)) return;
      const providers = new Set<string>();
      for (const r of list) {
        if (r.status !== "active") continue;
        if (r.provider.startsWith("google") && r.scopes?.gmail) providers.add("google");
        if (r.provider === "microsoft" && r.scopes?.mail)       providers.add("microsoft");
      }
      triggerSync(providers);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While a backfill is running, poll for progress + pull in new activities.
  useEffect(() => {
    const running = rows ? backfillOf(rows) : null;
    if (!running) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return; // already polling
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks++;
      const list = await loadRows();
      onSynced();
      if (ticks >= 40 || !backfillOf(list)) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (rows === null) return null; // still loading — don't flash anything

  const connected = mailConnected(rows);
  const backfill  = backfillOf(rows);

  // ── Not connected → connect nudge ─────────────────────────────────────
  if (!connected) {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px", marginBottom: 14,
          background: "rgba(var(--color-blue-rgb),0.06)",
          border: "0.5px solid rgba(var(--color-blue-rgb),0.22)",
          borderRadius: 10,
        }}
      >
        <div style={{
          width: 26, height: 26, borderRadius: 7, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(var(--color-blue-rgb),0.12)", color: "var(--color-blue)",
        }}>
          <Mail size={14} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
            Connect your email
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.45 }}>
            See past and new emails with this contact logged here automatically.
          </div>
        </div>
        <a
          href="/api/auth/google"
          style={{
            flexShrink: 0, textDecoration: "none",
            padding: "6px 14px", borderRadius: 7,
            fontSize: 11, fontWeight: 500,
            background: "var(--color-sage)", color: "white",
            fontFamily: "inherit",
          }}
        >
          Connect
        </a>
      </div>
    );
  }

  // ── Connected + import still running → progress ───────────────────────
  if (backfill) {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", marginBottom: 14,
          background: "var(--color-surface-sunken)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 10,
          fontSize: 11, color: "var(--color-text-secondary)",
        }}
      >
        <RefreshCw size={12} strokeWidth={1.75} className="spin" style={{ color: "var(--color-blue)" }} />
        <span>
          Importing your email history…{" "}
          <span style={{ color: "var(--color-text-tertiary)" }}>
            {backfill.scanned.toLocaleString()} scanned so far
          </span>
        </span>
        <style>{`@keyframes mab-spin { to { transform: rotate(360deg); } } .spin { animation: mab-spin 1s linear infinite; }`}</style>
      </div>
    );
  }

  // ── Connected + caught up → a quiet syncing hint, else nothing ────────
  if (syncing) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "6px 2px", marginBottom: 10,
        fontSize: 10.5, color: "var(--color-text-tertiary)",
      }}>
        <RefreshCw size={11} strokeWidth={1.75} className="spin" />
        <span>Checking for new email…</span>
        <style>{`@keyframes mab-spin { to { transform: rotate(360deg); } } .spin { animation: mab-spin 1s linear infinite; }`}</style>
      </div>
    );
  }

  return null;
}
