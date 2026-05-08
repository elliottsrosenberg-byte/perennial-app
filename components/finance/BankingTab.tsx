"use client";

import { useState, useEffect, useCallback } from "react";
import Script from "next/script";

interface BankAccount {
  id: string;
  teller_id: string;
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
  teller_id: string;
  amount: number;
  type: string;
  description: string;
  date: string;
  status: string;
  bank_account: { name: string; institution: string; last_four: string } | null;
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

// Teller Connect types
declare global {
  interface Window {
    TellerConnect?: {
      setup: (config: TellerConnectConfig) => { open: () => void };
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

export default function BankingTab() {
  const [accounts,     setAccounts]     = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [connecting,   setConnecting]   = useState(false);
  const [scriptReady,  setScriptReady]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const appId = process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID ?? "";
  const env   = process.env.NEXT_PUBLIC_TELLER_ENVIRONMENT ?? "sandbox";

  const fetchData = useCallback(async () => {
    setSyncing(true);
    const [acctRes, txRes] = await Promise.all([
      fetch("/api/integrations/teller/accounts"),
      fetch("/api/integrations/teller/transactions"),
    ]);
    if (acctRes.ok) { const { accounts: a } = await acctRes.json(); setAccounts(a ?? []); }
    if (txRes.ok)   { const { transactions: t } = await txRes.json(); setTransactions(t ?? []); }
    setSyncing(false);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openTellerConnect() {
    if (!window.TellerConnect) { setError("Teller Connect is still loading — try again in a moment."); return; }
    if (!appId) { setError("Teller App ID not configured."); return; }

    const teller = window.TellerConnect.setup({
      applicationId: appId,
      environment:   env,
      onSuccess: async (enrollment) => {
        setConnecting(true);
        setError(null);
        try {
          const res = await fetch("/api/integrations/teller/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken:     enrollment.accessToken,
              enrollmentId:    enrollment.enrollment.id,
              institutionName: enrollment.enrollment.institution.name,
            }),
          });
          if (!res.ok) {
            const { error: e } = await res.json() as { error: string };
            setError(e ?? "Connection failed.");
          } else {
            await fetchData();
          }
        } catch {
          setError("Connection failed. Please try again.");
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
    await fetch("/api/integrations/teller/accounts", { method: "DELETE" });
    setAccounts([]);
    setTransactions([]);
  }

  // Compute totals
  const totalCash = accounts
    .filter(a => a.type === "depository")
    .reduce((s, a) => s + (a.balance_available ?? a.balance_current ?? 0), 0);
  const totalCredit = accounts
    .filter(a => a.type === "credit")
    .reduce((s, a) => s + Math.abs(a.balance_current ?? 0), 0);

  const recentIncome  = transactions.filter(t => t.type === "credit" && t.status === "posted").slice(0, 5);
  const recentExpense = transactions.filter(t => t.type === "debit"  && t.status === "posted").slice(0, 5);

  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" };

  return (
    <>
      <Script
        src="https://cdn.teller.io/connect/connect.js"
        onLoad={() => setScriptReady(true)}
        strategy="afterInteractive"
      />

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Banking</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>
              {accounts.length > 0
                ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""} connected · ${env === "sandbox" ? "Sandbox mode" : "Live"}`
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
            onClick={openTellerConnect}
            disabled={connecting || !scriptReady}
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
            <button onClick={openTellerConnect} disabled={connecting || !scriptReady}
              className="px-5 py-2 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
              style={{ background: "var(--color-sage)" }}>
              {connecting ? "Connecting…" : "Connect your bank"}
            </button>
            {env === "sandbox" && (
              <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                Sandbox mode — use test credentials (any username starting with "test_")
              </p>
            )}
          </div>
        )}

        {!loading && accounts.length > 0 && (
          <>
            {/* Summary bar */}
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

            {/* Accounts list */}
            <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
              <div className="px-4 py-3 text-[12px] font-semibold" style={{ background: "var(--color-cream)", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
                Accounts
              </div>
              {accounts.map((acct, i) => (
                <div key={acct.id} className="flex items-center gap-3 px-4 py-3"
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
                      ••••{acct.last_four}
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
                </div>
              ))}
            </div>

            {/* Transactions */}
            {transactions.length > 0 && (
              <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
                <div className="px-4 py-3 text-[12px] font-semibold flex items-center justify-between"
                  style={{ background: "var(--color-cream)", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
                  Recent transactions
                  <span className="text-[10px] font-normal" style={{ color: "var(--color-grey)" }}>{transactions.length} loaded</span>
                </div>
                {transactions.slice(0, 20).map((tx, i) => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-2.5"
                    style={{ borderBottom: i < Math.min(19, transactions.length - 1) ? "0.5px solid var(--color-border)" : "none", background: "var(--color-off-white)" }}>
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: tx.type === "credit" ? "var(--color-sage)" : "rgba(31,33,26,0.2)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{tx.description}</p>
                      <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>
                        {tx.bank_account?.institution ?? ""} · {fmtDate(tx.date)}
                        {tx.status === "pending" && <span style={{ color: "#b8860b" }}> · Pending</span>}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold shrink-0"
                      style={{ color: tx.type === "credit" ? "var(--color-sage)" : "var(--color-charcoal)" }}>
                      {tx.type === "credit" ? "+" : "−"}{fmtCurrency(Math.abs(tx.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
