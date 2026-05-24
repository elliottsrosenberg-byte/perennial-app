"use client";

// Banking — review queue.
//
// The historical "transaction feed" UI is gone. Connected accounts are
// assumed business, and every unhandled transaction is one of:
//   (a) a business debit to log as an expense,
//   (b) a credit that's an invoice payment,
//   (c) personal (hide).
//
// The user moves rows out of the active view by acting on them. The
// API layer (POST /api/finance/banking/transactions/:id/*) handles all
// of the writes; this file is just an orchestrator over /queue.

import { useCallback, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";
import AddExpenseModal from "./AddExpenseModal";
import type { BankAccount, BankTransaction, Expense, ExpenseCategory, Project } from "@/types/database";
import { plaidCategoryToExpenseCategory, prettyPlaidPrimary } from "./plaidCategoryMap";

const PROVIDER = (process.env.NEXT_PUBLIC_BANK_PROVIDER ?? "plaid") as "plaid" | "teller";
const API_BASE = `/api/integrations/${PROVIDER}`;

// ── Provider SDK shims ───────────────────────────────────────────────────────

declare global {
  interface Window {
    TellerConnect?: { setup: (config: TellerConnectConfig) => { open: () => void } };
    Plaid?:         { create: (config: PlaidLinkConfig)     => { open: () => void } };
  }
}
interface TellerConnectConfig {
  applicationId: string;
  environment:   string;
  onSuccess:     (enrollment: TellerEnrollment) => void;
  onExit?:       () => void;
}
interface TellerEnrollment {
  accessToken: string;
  user: { id: string };
  enrollment: { id: string; institution: { name: string } };
}
interface PlaidLinkConfig {
  token:     string;
  onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
  onExit?:   (err: PlaidLinkError | null, metadata: PlaidLinkMetadata | null) => void;
  onLoad?:   () => void;
}
interface PlaidLinkMetadata {
  institution: { name: string; institution_id: string } | null;
  accounts:    { id: string; name: string; mask: string | null; type: string; subtype: string | null }[];
  link_session_id: string;
}
interface PlaidLinkError { error_code: string; error_message: string }

// ── Queue payload types ──────────────────────────────────────────────────────

interface SuggestedInvoice {
  id:     string;
  number: number;
  client: string;
  total:  number;
}
interface QueueTransaction extends BankTransaction {
  suggested_invoices?: SuggestedInvoice[];
}
interface OutstandingInvoice {
  id:     string;
  number: number;
  status: string;
  client: string;
  total:  number;
}
interface QueueResponse {
  to_review:            QueueTransaction[];
  invoice_activity:     QueueTransaction[];
  hidden_count:         number;
  outstanding_invoices: OutstandingInvoice[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number, opts: { dp?: number } = {}) {
  const dp = opts.dp ?? 2;
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtDate(ds: string) {
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Plaid loves verbose account names. "American Express - Plaid Gold
// Standard 0% Interest Checking" turns into something legible.
function trimAccountName(name: string): string {
  if (!name) return "Account";
  let n = name.replace(/^[A-Z][a-z]+\s+(Express|Bank|Card|Credit|Savings)\s*-\s*/, "");
  n = n.replace(/\bPlaid\b\s+/g, "");
  n = n.replace(/\bGold Standard 0% Interest\b/g, "");
  n = n.replace(/\s{2,}/g, " ").trim();
  if (n.length > 28) n = n.slice(0, 26).trimEnd() + "…";
  return n || name;
}

const CARD_STYLE: React.CSSProperties = {
  background:   "var(--color-off-white)",
  border:       "0.5px solid var(--color-border)",
  borderRadius: 12,
  boxShadow:    "0 2px 8px rgba(31,33,26,0.04)",
};
const SECTION_HEADER_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize:   13,
  fontWeight: 600,
  color:      "var(--color-charcoal)",
  letterSpacing: "-0.01em",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onExpenseCreated:    (e: Expense) => void;
  onInvoiceMarkedPaid: (invoiceId: string, paidAt: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BankingTab({ projects, onExpenseCreated, onInvoiceMarkedPaid }: Props) {
  const [accounts, setAccounts]                   = useState<BankAccount[]>([]);
  const [queue,    setQueue]                      = useState<QueueResponse>({ to_review: [], invoice_activity: [], hidden_count: 0, outstanding_invoices: [] });
  const [hidden,   setHidden]                     = useState<QueueTransaction[]>([]);
  const [showHidden, setShowHidden]               = useState(false);
  const [loading,  setLoading]                    = useState(true);
  const [syncing,  setSyncing]                    = useState(false);
  const [connecting, setConnecting]               = useState(false);
  const [scriptReady, setScriptReady]             = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // The "Log expense" modal hangs off the transaction it was opened from.
  const [convertTarget, setConvertTarget] = useState<QueueTransaction | null>(null);
  // For credits with multiple suggested matches: chosen invoice id per tx.
  const [chosenInvoice, setChosenInvoice] = useState<Record<string, string>>({});

  const tellerAppId = process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID ?? "";
  const tellerEnv   = process.env.NEXT_PUBLIC_TELLER_ENVIRONMENT ?? "sandbox";
  const plaidEnv    = process.env.NEXT_PUBLIC_PLAID_ENV ?? "sandbox";

  // Pulls accounts, runs the Plaid sync (route does that on every GET
  // to /transactions), then reads the freshly-computed queue.
  const fetchData = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      // Force the sync to run before reading the queue. We don't use the
      // returned list — /queue gives us the actually-needed projection.
      const [acctRes, syncRes] = await Promise.all([
        fetch(`${API_BASE}/accounts`),
        fetch(`${API_BASE}/transactions`),
      ]);
      if (acctRes.status === 503 || syncRes.status === 503) {
        const res = acctRes.status === 503 ? acctRes : syncRes;
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `${PROVIDER} isn't fully configured yet.`);
      }
      if (acctRes.ok) { const { accounts: a } = await acctRes.json(); setAccounts(a ?? []); }

      const qRes = await fetch(`/api/finance/banking/queue`);
      if (qRes.ok) {
        const data: QueueResponse = await qRes.json();
        setQueue(data);
      }
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  // Hidden list is only loaded on demand.
  const fetchHidden = useCallback(async () => {
    // Re-use the raw transactions endpoint; it returns up to 100 rows
    // with the joined account. Personal + already-handled rows are
    // exactly what's NOT in to_review or invoice_activity.
    const res = await fetch(`${API_BASE}/transactions`);
    if (!res.ok) return;
    const { transactions } = await res.json() as { transactions: QueueTransaction[] };
    const hiddenRows = (transactions ?? []).filter(t =>
      t.is_personal || t.linked_expense_id || t.matched_invoice_id,
    );
    setHidden(hiddenRows);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (showHidden) fetchHidden(); }, [showHidden, fetchHidden]);

  // Probe the provider SDK global as a backup for Next/Script onLoad.
  useEffect(() => {
    if (scriptReady) return;
    if (typeof window === "undefined") return;
    const probe = () => PROVIDER === "plaid" ? !!window.Plaid : !!window.TellerConnect;
    if (probe()) { setScriptReady(true); return; }
    let elapsed = 0;
    const id = window.setInterval(() => {
      if (probe()) { setScriptReady(true); window.clearInterval(id); return; }
      elapsed += 250;
      if (elapsed >= 15000) {
        window.clearInterval(id);
        setError(`${PROVIDER === "plaid" ? "Plaid Link" : "Teller Connect"} failed to load. Check your network or disable any script blockers, then refresh.`);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [scriptReady]);

  // ── Provider connect flows (carried over verbatim) ─────────────────────────

  async function openConnect() {
    setError(null);
    if (PROVIDER === "plaid") return openPlaidLink();
    return openTellerConnect();
  }
  async function openPlaidLink() {
    if (!window.Plaid) { setError("Plaid Link is still loading — try again in a moment."); return; }
    setConnecting(true);
    let linkToken: string;
    try {
      const tokRes = await fetch(`${API_BASE}/link-token`, { method: "POST" });
      if (!tokRes.ok) {
        const j = await tokRes.json().catch(() => ({}));
        setError(j?.error ?? `Failed to create link token (${tokRes.status})`);
        setConnecting(false);
        return;
      }
      linkToken = (await tokRes.json()).link_token as string;
    } catch (e) {
      setError(e instanceof Error ? `Failed to start Plaid Link: ${e.message}` : "Failed to start Plaid Link");
      setConnecting(false);
      return;
    }
    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          const res = await fetch(`${API_BASE}/enroll`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_token:     publicToken,
              institution_name: metadata.institution?.name ?? "Bank",
              institution_id:   metadata.institution?.institution_id ?? null,
              accounts:         metadata.accounts.map(a => ({ id: a.id, name: a.name, mask: a.mask ?? "" })),
            }),
          });
          if (!res.ok) {
            let body: string;
            try { body = (await res.json() as { error?: string }).error ?? `HTTP ${res.status}`; }
            catch { body = (await res.text()) || `HTTP ${res.status}`; }
            setError(body);
          } else {
            await fetchData();
          }
        } catch (err) {
          console.error("[BankingTab/plaid] enroll failed:", err);
          setError(err instanceof Error ? `Connection failed: ${err.message}` : "Connection failed");
        } finally {
          setConnecting(false);
        }
      },
      onExit: (err) => {
        setConnecting(false);
        if (err) setError(err.error_message || "Connection cancelled");
      },
    });
    handler.open();
  }
  function openTellerConnect() {
    if (!window.TellerConnect) { setError("Teller Connect is still loading — try again in a moment."); return; }
    if (!tellerAppId)          { setError("Teller App ID not configured."); return; }
    const teller = window.TellerConnect.setup({
      applicationId: tellerAppId,
      environment:   tellerEnv,
      onSuccess: async (enrollment) => {
        setConnecting(true);
        try {
          const res = await fetch(`${API_BASE}/enroll`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken:     enrollment.accessToken,
              enrollmentId:    enrollment.enrollment.id,
              institutionName: enrollment.enrollment.institution.name,
            }),
          });
          if (!res.ok) {
            let body: string;
            try { body = (await res.json() as { error?: string }).error ?? `HTTP ${res.status}`; }
            catch { body = (await res.text()) || `HTTP ${res.status}`; }
            setError(body);
          } else {
            await fetchData();
          }
        } catch (err) {
          console.error("[BankingTab/teller] enroll failed:", err);
          setError(err instanceof Error ? `Connection failed: ${err.message}` : "Connection failed");
        } finally {
          setConnecting(false);
        }
      },
      onExit: () => setConnecting(false),
    });
    teller.open();
  }

  async function disconnect() {
    await fetch(`${API_BASE}/accounts`, { method: "DELETE" });
    setAccounts([]);
    setQueue({ to_review: [], invoice_activity: [], hidden_count: 0, outstanding_invoices: [] });
    setHidden([]);
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  async function markPersonal(tx: QueueTransaction, isPersonal: boolean) {
    // Optimistic — pull out of whichever list it's in.
    setQueue((q) => ({
      ...q,
      to_review:        q.to_review.filter((t) => t.id !== tx.id),
      invoice_activity: q.invoice_activity.filter((t) => t.id !== tx.id),
      hidden_count:     isPersonal ? q.hidden_count + 1 : Math.max(0, q.hidden_count - 1),
    }));
    if (showHidden) setHidden((rows) => isPersonal ? [{ ...tx, is_personal: true }, ...rows] : rows.filter((r) => r.id !== tx.id));

    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/personal`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_personal: isPersonal }),
    });
    if (!res.ok) {
      setError("Couldn't update transaction — refreshing.");
      await fetchData();
      if (showHidden) await fetchHidden();
    }
  }

  async function matchInvoice(tx: QueueTransaction, invoiceId: string) {
    // Optimistic
    setQueue((q) => ({
      ...q,
      invoice_activity: q.invoice_activity.filter((t) => t.id !== tx.id),
      hidden_count:     q.hidden_count + 1,
      outstanding_invoices: q.outstanding_invoices.filter((i) => i.id !== invoiceId),
    }));
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/match-invoice`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ invoice_id: invoiceId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.error ?? "Couldn't match invoice — refreshing.");
      await fetchData();
      return;
    }
    onInvoiceMarkedPaid(invoiceId, tx.date);
  }

  async function unmatch(tx: QueueTransaction) {
    setHidden((rows) => rows.filter((r) => r.id !== tx.id));
    setQueue((q) => ({ ...q, hidden_count: Math.max(0, q.hidden_count - 1) }));
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/unmatch`, { method: "POST" });
    if (!res.ok) { setError("Couldn't unmatch — refreshing."); await fetchData(); await fetchHidden(); return; }
    await fetchData();
  }

  async function unmarkPersonal(tx: QueueTransaction) {
    await markPersonal(tx, false);
    await fetchData();
  }

  async function submitConvert(tx: QueueTransaction, values: {
    project_id: string | null;
    description: string;
    category: ExpenseCategory;
    amount: number;
    date: string;
  }) {
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/convert-to-expense`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        project_id:  values.project_id,
        category:    values.category,
        description: values.description,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { error: j?.error ?? `Failed (HTTP ${res.status})` };
    }
    const { expense } = await res.json() as { expense: Expense };
    // Optimistic: drop the row from to_review and bump hidden_count.
    setQueue((q) => ({
      ...q,
      to_review:    q.to_review.filter((t) => t.id !== tx.id),
      hidden_count: q.hidden_count + 1,
    }));
    onExpenseCreated(expense);
    return { expense };
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  // Monthly rollup — based on the rows we can see in /queue, plus the
  // current month's hidden (reviewed) rows. We use to_review + hidden
  // when expanded, else fall back to to_review + invoice_activity.
  const monthRollup = useMemo(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rows = [...queue.to_review, ...queue.invoice_activity, ...hidden];
    let inSum = 0, outSum = 0;
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (!r.date?.startsWith(month)) continue;
      if (r.is_personal) continue;
      const amt = Number(r.amount);
      if (amt > 0) inSum  += amt;
      else         outSum += Math.abs(amt);
    }
    return { in: inSum, out: outSum, net: inSum - outSum };
  }, [queue.to_review, queue.invoice_activity, hidden]);

  const envLabel = PROVIDER === "plaid"
    ? (plaidEnv === "production" ? "Live" : plaidEnv === "development" ? "Live (Dev)" : "Sandbox mode")
    : (tellerEnv === "sandbox" ? "Sandbox mode" : "Live");

  return (
    <>
      {PROVIDER === "plaid" ? (
        <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          onLoad={() => setScriptReady(true)} strategy="afterInteractive" />
      ) : (
        <Script src="https://cdn.teller.io/connect/connect.js"
          onLoad={() => setScriptReady(true)} strategy="afterInteractive" />
      )}

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h2 style={SECTION_HEADER_STYLE}>Banking</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>
              {accounts.length > 0
                ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""} · ${envLabel}`
                : "Connect a bank to start triaging transactions"}
            </p>
          </div>
          {accounts.length > 0 && (
            <>
              <button onClick={fetchData} disabled={syncing}
                className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {syncing ? "Syncing…" : "Sync"}
              </button>
              <button onClick={() => setConfirmDisconnect(true)}
                className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                style={{ color: "var(--color-red-orange)", border: "0.5px solid rgba(220,62,13,0.2)", background: "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.06)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                Disconnect
              </button>
            </>
          )}
          <button onClick={openConnect} disabled={connecting || !scriptReady}
            data-tour-target="finance.connect-bank"
            className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: "var(--color-sage)" }}>
            {connecting ? "Connecting…" : accounts.length > 0 ? "+ Add account" : "Connect bank"}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg text-[12px]"
            style={{ background: "rgba(220,62,13,0.07)", color: "var(--color-red-orange)", border: "0.5px solid rgba(220,62,13,0.2)" }}>
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-48 text-[12px]" style={{ color: "var(--color-grey)" }}>
            Loading banking…
          </div>
        )}

        {/* ── Empty (no accounts) ───────────────────────────────────────── */}
        {!loading && accounts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 rounded-xl"
            style={{ border: "0.5px dashed var(--color-border)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.3">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>
            </svg>
            <div className="text-center">
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No bank accounts connected</p>
              <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>Connect a bank to see what needs categorizing and which invoices have landed.</p>
            </div>
            <button onClick={openConnect} disabled={connecting || !scriptReady}
              className="px-5 py-2 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
              style={{ background: "var(--color-sage)" }}>
              {connecting ? "Connecting…" : "Connect your bank"}
            </button>
          </div>
        )}

        {!loading && accounts.length > 0 && (
          <>
            {/* ── Accounts strip ────────────────────────────────────────── */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {accounts.map((acct) => (
                <div key={acct.id}
                  className="shrink-0 px-3 py-2.5 flex flex-col gap-0.5"
                  style={{
                    ...CARD_STYLE,
                    minWidth: 160,
                    maxWidth: 200,
                  }}>
                  <p className="text-[10px] uppercase tracking-wider truncate" style={{ color: "var(--color-grey)" }}>
                    {acct.institution}
                  </p>
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>
                    {trimAccountName(acct.name)}
                    {acct.last_four ? <span style={{ color: "var(--color-grey)" }}> ••{acct.last_four}</span> : null}
                  </p>
                  <p className="text-[14px] font-semibold tabular-nums" style={{
                    color: acct.type === "credit" && (acct.balance_current ?? 0) < 0 ? "#b8860b" : "var(--color-charcoal)",
                    fontFamily: "var(--font-display)",
                  }}>
                    {acct.balance_available !== null
                      ? fmtCurrency(acct.balance_available, { dp: 0 })
                      : acct.balance_current !== null ? fmtCurrency(acct.balance_current, { dp: 0 }) : "—"}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Month rollup ─────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "In this month",  value: "+" + fmtCurrency(monthRollup.in,  { dp: 0 }), color: "var(--color-sage)" },
                { label: "Out this month", value: "−" + fmtCurrency(monthRollup.out, { dp: 0 }), color: "var(--color-charcoal)" },
                {
                  label: "Net",
                  value: (monthRollup.net >= 0 ? "+" : "−") + fmtCurrency(monthRollup.net, { dp: 0 }),
                  color: monthRollup.net >= 0 ? "var(--color-sage)" : "var(--color-red-orange)",
                },
              ].map((s) => (
                <div key={s.label} className="px-4 py-3" style={CARD_STYLE}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>{s.label}</p>
                  <p className="text-[20px] font-semibold tabular-nums" style={{ color: s.color, fontFamily: "var(--font-display)" }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── To categorize ────────────────────────────────────────── */}
            <Section title="To categorize" count={queue.to_review.length}>
              {queue.to_review.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--color-grey)" }}>
                  All caught up. New debits will show up here as they post.
                </p>
              ) : (
                queue.to_review.map((tx, i) => {
                  const merchant = tx.details?.merchant_name ?? tx.description;
                  const acct     = tx.bank_account;
                  const primary  = tx.details?.personal_finance_category?.primary ?? null;
                  return (
                    <div key={tx.id} className="flex items-center gap-4 px-4 py-3"
                      style={{ borderTop: i > 0 ? "0.5px solid var(--color-border)" : "none" }}>
                      <div style={{ minWidth: 96 }}>
                        <p className="text-[17px] font-semibold tabular-nums" style={{
                          color: "var(--color-red-orange)",
                          fontFamily: "var(--font-display)",
                        }}>
                          −{fmtCurrency(Math.abs(Number(tx.amount)))}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{merchant}</p>
                        <p className="text-[11px] truncate" style={{ color: "var(--color-grey)" }}>
                          {acct ? `${trimAccountName(acct.name)} ••${acct.last_four ?? ""}` : "Account"} · {fmtDate(tx.date)}
                          {tx.status === "pending" && <span style={{ color: "#b8860b" }}> · Pending</span>}
                          {primary && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                              style={{ background: "var(--color-cream)", color: "var(--color-grey)" }}>
                              {prettyPlaidPrimary(primary)}
                            </span>
                          )}
                        </p>
                      </div>
                      <button onClick={() => setConvertTarget(tx)}
                        className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-white"
                        style={{ background: "var(--color-sage)" }}>
                        → Log expense
                      </button>
                      <button onClick={() => markPersonal(tx, true)}
                        className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                        style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "transparent" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        Personal
                      </button>
                    </div>
                  );
                })
              )}
            </Section>

            {/* ── Invoice activity ─────────────────────────────────────── */}
            <Section title="Invoice activity" count={queue.invoice_activity.length}>
              {queue.invoice_activity.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--color-grey)" }}>
                  No recent deposits. Payments from the last 60 days will land here.
                </p>
              ) : (
                queue.invoice_activity.map((tx, i) => {
                  const suggestions = tx.suggested_invoices ?? [];
                  const single      = suggestions.length === 1;
                  const multi       = suggestions.length > 1;
                  const chosenId    = chosenInvoice[tx.id]
                    ?? (single ? suggestions[0].id : "");
                  const chosen      = suggestions.find((s) => s.id === chosenId)
                    ?? queue.outstanding_invoices.find((i2) => i2.id === chosenId);
                  return (
                    <div key={tx.id} className="flex items-center gap-4 px-4 py-3"
                      style={{ borderTop: i > 0 ? "0.5px solid var(--color-border)" : "none" }}>
                      <div style={{ minWidth: 96 }}>
                        <p className="text-[17px] font-semibold tabular-nums" style={{
                          color: "var(--color-sage)",
                          fontFamily: "var(--font-display)",
                        }}>
                          +{fmtCurrency(Math.abs(Number(tx.amount)))}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>
                          {fmtDate(tx.date)} — {tx.details?.merchant_name ?? tx.description}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: "var(--color-grey)" }}>
                          {single && (
                            <>Looks like #{suggestions[0].number} ({suggestions[0].client})</>
                          )}
                          {multi && (
                            <>{suggestions.length} possible invoice matches</>
                          )}
                          {!single && !multi && (
                            <>No suggested match — pick one to mark paid</>
                          )}
                        </p>
                      </div>
                      {(multi || (!single && !multi)) && (
                        <div style={{ width: 200 }}>
                          <Select
                            value={chosenId}
                            onChange={(v) => setChosenInvoice((m) => ({ ...m, [tx.id]: v }))}
                            placeholder="Match to invoice…"
                            options={(multi ? suggestions : queue.outstanding_invoices).map((s) => ({
                              value: s.id,
                              label: `#${s.number} · ${s.client} · ${fmtCurrency(s.total, { dp: 0 })}`,
                            }))}
                          />
                        </div>
                      )}
                      <button onClick={() => chosen && matchInvoice(tx, chosen.id)}
                        disabled={!chosen}
                        className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-white disabled:opacity-40"
                        style={{ background: "var(--color-sage)" }}>
                        Mark paid
                      </button>
                      <button onClick={() => markPersonal(tx, true)}
                        className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                        style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "transparent" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        Not this one
                      </button>
                    </div>
                  );
                })
              )}
            </Section>

            {/* ── Hidden (collapsible) ─────────────────────────────────── */}
            <div style={CARD_STYLE}>
              <button
                onClick={() => setShowHidden((s) => !s)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <span style={SECTION_HEADER_STYLE}>
                  Hidden <span style={{ color: "var(--color-grey)", fontWeight: 400, marginLeft: 6 }}>{queue.hidden_count}</span>
                </span>
                <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                  {showHidden ? "Hide" : "Show"}
                </span>
              </button>
              {showHidden && (
                <div style={{ borderTop: "0.5px solid var(--color-border)" }}>
                  {hidden.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--color-grey)" }}>Nothing hidden yet.</p>
                  ) : hidden.map((tx, i) => {
                    const acct = tx.bank_account;
                    let label = "Personal";
                    if (tx.linked_expense_id)       label = "Logged as expense";
                    else if (tx.matched_invoice_id) label = "Matched to invoice";
                    return (
                      <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5"
                        style={{ borderTop: i > 0 ? "0.5px solid var(--color-border)" : "none" }}>
                        <div style={{ minWidth: 80 }}>
                          <p className="text-[12px] tabular-nums" style={{ color: "var(--color-grey)" }}>
                            {Number(tx.amount) > 0 ? "+" : "−"}{fmtCurrency(Math.abs(Number(tx.amount)))}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] truncate" style={{ color: "var(--color-charcoal)" }}>
                            {tx.details?.merchant_name ?? tx.description}
                          </p>
                          <p className="text-[10px] truncate" style={{ color: "var(--color-grey)" }}>
                            {acct ? `${trimAccountName(acct.name)} ••${acct.last_four ?? ""}` : ""} · {fmtDate(tx.date)} · {label}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (tx.matched_invoice_id) return unmatch(tx);
                            if (tx.is_personal)        return unmarkPersonal(tx);
                            // linked_expense_id case: we don't auto-delete
                            // the expense; user can do that in Expenses tab.
                            setError("Edit or delete the expense from the Expenses tab to undo.");
                          }}
                          className="px-2.5 py-1 text-[11px] rounded transition-colors"
                          style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          Undo
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Convert-to-expense modal ──────────────────────────────────── */}
      {convertTarget && (
        <AddExpenseModal
          projects={projects}
          prefill={{
            description: convertTarget.details?.merchant_name ?? convertTarget.description ?? "",
            amount:      Math.abs(Number(convertTarget.amount)),
            date:        convertTarget.date,
            category:    plaidCategoryToExpenseCategory(convertTarget.details?.personal_finance_category?.primary ?? null),
          }}
          onSubmitOverride={(values) => submitConvert(convertTarget, values)}
          onClose={() => setConvertTarget(null)}
          onCreated={() => { /* submitConvert already updated parent + queue */ }}
        />
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect all bank accounts?"
        body="All connected accounts and their transaction history will be removed. You can reconnect at any time."
        confirmLabel="Disconnect"
        tone="danger"
        onConfirm={() => { setConfirmDisconnect(false); void disconnect(); }}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={CARD_STYLE}>
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}>
        <span style={SECTION_HEADER_STYLE}>
          {title}
          {typeof count === "number" && count > 0 && (
            <span style={{ color: "var(--color-grey)", fontWeight: 400, marginLeft: 6 }}>· {count}</span>
          )}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}
