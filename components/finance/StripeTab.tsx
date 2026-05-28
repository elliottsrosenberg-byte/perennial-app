"use client";

// Stripe subtab in Banking — surfaces the user's Stripe balance, recent
// charges, and recent payouts via /api/integrations/stripe/summary. If
// Stripe isn't connected, renders an empty-state CTA pointing to
// Settings → Integrations.
//
// Read-only by design — payment workflows live elsewhere (in the
// hosted invoice page); this is purely a "see what's in Stripe" surface
// so the user doesn't have to open Stripe's dashboard.

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, RefreshCcw } from "lucide-react";
import Link from "next/link";

interface BalanceEntry { amount: number; currency: string }
interface Charge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paid: boolean;
  refunded: boolean;
  description: string | null;
  receipt_email: string | null;
  created: number;
}
interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
  created: number;
  method: string | null;
}

interface Summary {
  connected: boolean;
  accountName?: string | null;
  livemode?: boolean;
  defaultCurrency?: string | null;
  balance?: { available: BalanceEntry[]; pending: BalanceEntry[] };
  charges?: Charge[];
  payouts?: Payout[];
  error?: string;
}

function fmtMoney(cents: number, currency: string) {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

function fmtRelDate(epochSec: number) {
  return new Date(epochSec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtArrivalDate(epochSec: number) {
  const now = Date.now();
  const date = new Date(epochSec * 1000);
  const isPast = date.getTime() < now;
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { dateStr, isPast };
}

const cardShadow = "0 1px 2px rgba(31,33,26,0.04)";

export default function StripeTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/integrations/stripe/summary", { cache: "no-store" });
      const body = await res.json() as Summary;
      if (!res.ok && res.status !== 502) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSummary(body);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: "var(--color-grey)" }}>
        Loading Stripe summary…
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[12px]" style={{ color: "var(--color-red-orange)" }}>
        <span>Couldn&apos;t load Stripe: {err}</span>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", background: "var(--color-warm-white)" }}>
          <RefreshCcw size={11} /> Retry
        </button>
      </div>
    );
  }

  if (!summary?.connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(99,91,255,0.10)", color: "#635bff" }}>
          <CreditCard size={20} />
        </div>
        <div className="text-center max-w-xs">
          <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Connect Stripe</p>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--color-grey)" }}>
            Paste a Restricted API key in Settings → Integrations and your balance, recent charges, and payouts will show up here.
          </p>
        </div>
        <Link href="/settings?tab=integrations" className="text-[12px] px-3.5 py-1.5 rounded-lg font-medium" style={{ background: "var(--color-charcoal)", color: "white" }}>
          Open integrations →
        </Link>
      </div>
    );
  }

  if (summary.error === "stripe_fetch_failed") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[12px]" style={{ color: "var(--color-red-orange)" }}>
        <span>Stripe rejected the request. The stored API key may have been revoked.</span>
        <Link href="/settings?tab=integrations" className="text-[12px] px-3 py-1.5 rounded-lg" style={{ border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
          Reconnect
        </Link>
      </div>
    );
  }

  const avail   = summary.balance?.available ?? [];
  const pending = summary.balance?.pending   ?? [];
  const charges = summary.charges            ?? [];
  const payouts = summary.payouts            ?? [];
  const currency = summary.defaultCurrency ?? avail[0]?.currency ?? "usd";

  // Roll up the per-currency balance entries — most accounts only have one
  // currency in play, but Stripe returns an array so respect that shape.
  const availTotal   = avail.reduce((s, e) => s + e.amount, 0);
  const pendingTotal = pending.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
      {/* Header strip */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,91,255,0.10)", color: "#635bff" }}>
          <CreditCard size={16} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>
              {summary.accountName ?? "Stripe"}
            </span>
            {!summary.livemode && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(232,197,71,0.15)", color: "#9a7a00" }}>
                Test mode
              </span>
            )}
          </div>
          <span className="text-[10.5px]" style={{ color: "var(--color-grey)" }}>
            Live data from Stripe · refreshed just now
          </span>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-colors" style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}>
          <RefreshCcw size={10} /> Refresh
        </button>
        <a href={`https://dashboard.stripe.com/${summary.livemode ? "" : "test/"}dashboard`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-colors" style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}>
          <ExternalLink size={10} /> Open Stripe
        </a>
      </div>

      {/* Balance row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-grey)" }}>Available</div>
          <div className="text-[22px] font-semibold tabular-nums" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>
            {fmtMoney(availTotal, avail[0]?.currency ?? currency)}
          </div>
          {avail.length > 1 && (
            <div className="text-[10px] mt-1" style={{ color: "var(--color-grey)" }}>
              {avail.map((e) => fmtMoney(e.amount, e.currency)).join(" · ")}
            </div>
          )}
        </div>
        <div className="p-4 rounded-xl" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--color-grey)" }}>Pending</div>
          <div className="text-[22px] font-semibold tabular-nums" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>
            {fmtMoney(pendingTotal, pending[0]?.currency ?? currency)}
          </div>
        </div>
      </div>

      {/* Recent charges */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
        <div className="flex items-center px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <span className="text-[13px] font-semibold flex-1" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Recent charges</span>
          <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>Last {charges.length}</span>
        </div>
        {charges.length === 0 ? (
          <div className="px-4 py-6 text-[11.5px] italic text-center" style={{ color: "var(--color-grey)" }}>No charges yet.</div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {charges.map((c) => (
              <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate" style={{ color: "var(--color-charcoal)" }}>
                    {c.description || c.receipt_email || c.id}
                  </div>
                  <div className="text-[10.5px]" style={{ color: "var(--color-grey)" }}>
                    {fmtRelDate(c.created)} · <ChargeBadge charge={c} />
                  </div>
                </div>
                <div className="text-[12.5px] font-semibold tabular-nums shrink-0" style={{ color: c.refunded ? "var(--color-grey)" : "var(--color-charcoal)" }}>
                  {fmtMoney(c.amount, c.currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent payouts */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
        <div className="flex items-center px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <span className="text-[13px] font-semibold flex-1" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Recent payouts</span>
          <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>Last {payouts.length}</span>
        </div>
        {payouts.length === 0 ? (
          <div className="px-4 py-6 text-[11.5px] italic text-center" style={{ color: "var(--color-grey)" }}>No payouts yet.</div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {payouts.map((p) => {
              const arrival = fmtArrivalDate(p.arrival_date);
              return (
                <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>
                      Payout · {p.method ?? "standard"}
                    </div>
                    <div className="text-[10.5px]" style={{ color: "var(--color-grey)" }}>
                      {arrival.isPast ? `Arrived ${arrival.dateStr}` : `Arriving ${arrival.dateStr}`} · {p.status}
                    </div>
                  </div>
                  <div className="text-[12.5px] font-semibold tabular-nums shrink-0" style={{ color: "var(--color-charcoal)" }}>
                    {fmtMoney(p.amount, p.currency)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChargeBadge({ charge }: { charge: Charge }) {
  if (charge.refunded) return <span style={{ color: "var(--color-grey)" }}>Refunded</span>;
  if (!charge.paid)    return <span style={{ color: "var(--color-red-orange)" }}>{charge.status}</span>;
  return <span style={{ color: "#3d6b4f" }}>Paid</span>;
}
