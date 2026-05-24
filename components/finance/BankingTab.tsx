"use client";

import { useState, useEffect, useCallback } from "react";
import Script from "next/script";

// Provider switch — Plaid by default; flip NEXT_PUBLIC_BANK_PROVIDER to
// "teller" in the env to fall back to the older Teller integration. The
// API routes are mirrored per-provider; everything below this constant
// is provider-agnostic.
const PROVIDER = (process.env.NEXT_PUBLIC_BANK_PROVIDER ?? "plaid") as "plaid" | "teller";
const API_BASE = `/api/integrations/${PROVIDER}`;

interface BankAccount {
  id: string;
  external_id: string;
  provider:    string;
  institution: string;
  name: string;
  type: string;
  subtype: string;
  last_four: string;
  balance_available: number | null;
  balance_current: number | null;
  balance_updated_at: string | null;
}

interface Transaction {
  id: string;
  external_id: string;
  provider:    string;
  amount: number;
  type: string;
  description: string;
  date: string;
  status: string;
  bank_account: { name: string; institution: string; last_four: string; type?: string; subtype?: string } | null;
}

function fmtCurrency(n: number) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ds: string) {
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function accountIcon(type: string, subtype: string) {
  if (subtype === "checking") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
  );
  if (subtype === "savings") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
  );
  if (type === "credit") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
  );
}

// ── Provider-specific SDK types ──────────────────────────────────────────────

declare global {
  interface Window {
    TellerConnect?: {
      setup: (config: TellerConnectConfig) => { open: () => void };
    };
    Plaid?: {
      create: (config: PlaidLinkConfig) => { open: () => void };
    };
  }
}

interface TellerConnectConfig {
  applicationId: string;
  environment: string;
  onSuccess: (enrollment: TellerEnrollment) => void;
  onExit?: () => void;
}
interface TellerEnrollment {
  accessToken: string;
  user: { id: string };
  enrollment: { id: string; institution: { name: string } };
}

interface PlaidLinkConfig {
  token:      string;
  onSuccess:  (publicToken: string, metadata: PlaidLinkMetadata) => void;
  onExit?:    (err: PlaidLinkError | null, metadata: PlaidLinkMetadata | null) => void;
  onLoad?:    () => void;
}
interface PlaidLinkMetadata {
  institution: { name: string; institution_id: string } | null;
  accounts:    { id: string; name: string; mask: string | null; type: string; subtype: string | null }[];
  link_session_id: string;
}
interface PlaidLinkError { error_code: string; error_message: string }

// ── Component ────────────────────────────────────────────────────────────────

export default function BankingTab() {
  const [accounts,     setAccounts]     = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [connecting,   setConnecting]   = useState(false);
  const [scriptReady,  setScriptReady]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Provider-specific env. The Teller bits are gated to the Teller branch.
  const tellerAppId = process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID ?? "";
  const tellerEnv   = process.env.NEXT_PUBLIC_TELLER_ENVIRONMENT ?? "sandbox";
  const plaidEnv    = process.env.NEXT_PUBLIC_PLAID_ENV ?? "sandbox";

  const fetchData = useCallback(async () => {
    setSyncing(true);
    const [acctRes, txRes] = await Promise.all([
      fetch(`${API_BASE}/accounts`),
      fetch(`${API_BASE}/transactions`),
    ]);
    if (acctRes.status === 503 || txRes.status === 503) {
      const res = acctRes.status === 503 ? acctRes : txRes;
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? `${PROVIDER} isn't fully configured yet.`);
    }
    if (acctRes.ok) { const { accounts: a } = await acctRes.json(); setAccounts(a ?? []); }
    if (txRes.ok)   { const { transactions: t } = await txRes.json(); setTransactions(t ?? []); }
    setSyncing(false);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll for the provider's SDK global so the Connect button enables as
  // soon as the script lands, even if Next/Script's onLoad misses.
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
        setError(`${PROVIDER === "plaid" ? "Plaid Link" : "Teller Connect"} failed to load. Check your network or disable any ad/script blockers, then refresh.`);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [scriptReady]);

  async function openConnect() {
    setError(null);
    if (PROVIDER === "plaid") return openPlaidLink();
    return openTellerConnect();
  }

  // ── Plaid ──────────────────────────────────────────────────────────────────
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

  // ── Teller (fallback when NEXT_PUBLIC_BANK_PROVIDER=teller) ────────────────
  function openTellerConnect() {
    if (!window.TellerConnect) { setError("Teller Connect is still loading — try again in a moment."); return; }
    if (!tellerAppId) { setError("Teller App ID not configured."); return; }

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
    if (!confirm("Disconnect all bank accounts? Your transaction history will be removed.")) return;
    await fetch(`${API_BASE}/accounts`, { method: "DELETE" });
    setAccounts([]);
    setTransactions([]);
  }

  async function removeAccount(id: string) {
    const prev = accounts;
    const prevTx = transactions;
    setAccounts((cs) => cs.filter(c => c.id !== id));
    setTransactions((ts) => ts.filter(t => t.bank_account
      ? prev.some(a => a.id === id && a.name === t.bank_account?.name && a.last_four === t.bank_account?.last_four) ? false : true
      : true,
    ));
    try {
      const res = await fetch(`${API_BASE}/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("DELETE failed");
      await fetchData();
    } catch {
      setAccounts(prev);
      setTransactions(prevTx);
    }
  }

  const totalCash = accounts
    .filter(a => a.type === "depository")
    .reduce((s, a) => s + (a.balance_available ?? a.balance_current ?? 0), 0);
  const totalCredit = accounts
    .filter(a => a.type === "credit")
    .reduce((s, a) => s + Math.abs(a.balance_current ?? 0), 0);

  const envLabel = PROVIDER === "plaid"
    ? (plaidEnv === "production" ? "Live" : plaidEnv === "development" ? "Live (Dev)" : "Sandbox mode")
    : (tellerEnv === "sandbox" ? "Sandbox mode" : "Live");

  return (
    <>
      {PROVIDER === "plaid" ? (
        <Script
          src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          onLoad={() => setScriptReady(true)}
          strategy="afterInteractive"
        />
      ) : (
        <Script
          src="https://cdn.teller.io/connect/connect.js"
          onLoad={() => setScriptReady(true)}
          strategy="afterInteractive"
        />
      )}

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Banking</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>
              {accounts.length > 0
                ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""} connected · ${envLabel}`
                : "Connect your bank accounts to see real balances and transactions"}
            </p>
          </div>
          {accounts.length > 0 && (
            <>
              <button onClick={fetchData} disabled={syncing}
                className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {syncing ? "Syncing…" : "Sync"}
              </button>
              <button onClick={disconnect}
                className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                style={{ color: "var(--color-red-orange)", border: "0.5px solid rgba(220,62,13,0.2)" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.06)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                Disconnect
              </button>
            </>
          )}
          <button
            onClick={openConnect}
            disabled={connecting || !scriptReady}
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
            Loading accounts…
          </div>
        )}

        {!loading && accounts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 rounded-xl"
            style={{ border: "0.5px dashed var(--color-border)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.3">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>
            </svg>
            <div className="text-center">
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No bank accounts connected</p>
              <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>Connect your checking, savings, or credit accounts to track real cash flow</p>
            </div>
            <button onClick={openConnect} disabled={connecting || !scriptReady}
              className="px-5 py-2 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
              style={{ background: "var(--color-sage)" }}>
              {connecting ? "Connecting…" : "Connect your bank"}
            </button>
            {PROVIDER === "plaid" && plaidEnv === "sandbox" && (
              <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                Sandbox mode — use test credentials: username <code>user_good</code>, password <code>pass_good</code>
              </p>
            )}
            {PROVIDER === "teller" && tellerEnv === "sandbox" && (
              <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                Sandbox mode — use test credentials (any username starting with &quot;test_&quot;)
              </p>
            )}
          </div>
        )}

        {!loading && accounts.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Cash available", value: fmtCurrency(totalCash),   color: "var(--color-charcoal)" },
                { label: "Credit balance", value: fmtCurrency(totalCredit), color: totalCredit > 0 ? "#b8860b" : "var(--color-charcoal)" },
                { label: "Net position",   value: fmtCurrency(totalCash - totalCredit), color: totalCash - totalCredit >= 0 ? "var(--color-sage)" : "var(--color-red-orange)" },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4"
                  style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-grey)" }}>{s.label}</p>
                  <p className="text-[22px] font-semibold tracking-tight" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
              <div className="px-4 py-3 text-[12px] font-semibold" style={{ background: "var(--color-cream)", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
                Accounts
              </div>
              {accounts.map((acct, i) => (
                <div key={acct.id} className="group flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < accounts.length - 1 ? "0.5px solid var(--color-border)" : "none", background: "var(--color-off-white)" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--color-cream)", color: "var(--color-grey)" }}>
                    {accountIcon(acct.type, acct.subtype)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-charcoal)" }}>
                      {acct.institution} {acct.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                      {acct.subtype ? `${acct.subtype.charAt(0).toUpperCase() + acct.subtype.slice(1)} · ` : ""}
                      {acct.last_four ? `••••${acct.last_four}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-semibold" style={{ color: acct.type === "credit" && (acct.balance_current ?? 0) < 0 ? "#b8860b" : "var(--color-charcoal)" }}>
                      {acct.balance_available !== null
                        ? fmtCurrency(acct.balance_available)
                        : acct.balance_current !== null ? fmtCurrency(acct.balance_current) : "—"}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                      {acct.balance_updated_at ? `Updated ${fmtDate(acct.balance_updated_at.split("T")[0])}` : "available"}
                    </p>
                  </div>
                  <button
                    onClick={() => removeAccount(acct.id)}
                    title="Remove this account"
                    aria-label="Remove account"
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1.5"
                    style={{ color: "var(--color-grey)", background: "transparent", border: "none", cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(220,62,13,0.08)"; e.currentTarget.style.color = "var(--color-red-orange)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>

            {transactions.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
                <div className="px-4 py-3 text-[12px] font-semibold flex items-center justify-between"
                  style={{ background: "var(--color-cream)", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
                  Recent transactions
                  <span className="text-[10px] font-normal" style={{ color: "var(--color-grey)" }}>{transactions.length} loaded</span>
                </div>
                {transactions.map((tx, i) => {
                  const isCredit  = tx.bank_account?.type === "credit";
                  const moneyIn   = isCredit ? tx.amount < 0 : tx.amount > 0;
                  const display   = (moneyIn ? "+" : "−") + fmtCurrency(Math.abs(tx.amount));
                  const tone      = moneyIn ? "var(--color-sage)" : "var(--color-charcoal)";
                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: i < transactions.length - 1 ? "0.5px solid var(--color-border)" : "none", background: "var(--color-off-white)" }}>
                      <div className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: moneyIn ? "var(--color-sage)" : "rgba(31,33,26,0.2)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{tx.description}</p>
                        <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                          {tx.bank_account?.institution ?? ""} · {fmtDate(tx.date)}
                          {tx.status === "pending" && <span style={{ color: "#b8860b" }}> · Pending</span>}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold shrink-0" style={{ color: tone }}>
                        {display}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
