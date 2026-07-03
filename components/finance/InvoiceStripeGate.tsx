"use client";

// Full-pane gate shown in place of the Invoices tab when Stripe isn't
// connected (or its connection is unhealthy). Stripe is foundational to
// invoicing — without a connected account clients can't pay online and
// payments have nowhere to land — so rather than bury the requirement at
// the public payment page we surface it here, up front, and block the
// tab until it's resolved. Mirrors the Banking tab's "connect a bank"
// empty state in spirit so the two financial integrations feel of a
// piece.

import { CreditCard, AlertTriangle, ArrowRight, ShieldCheck, Banknote, Globe } from "lucide-react";

export type StripeGateState = "disconnected" | "error";

const STRIPE_PURPLE = "#635bff";

export default function InvoiceStripeGate({
  state,
  accountName,
}: {
  state: StripeGateState;
  accountName?: string | null;
}) {
  const isError = state === "error";

  // Return to the invoices tab after the OAuth round-trip so the gate
  // re-evaluates against the freshly-connected account.
  const connectHref = `/api/auth/stripe?next=${encodeURIComponent("/finance?tab=invoices")}`;

  const title = isError
    ? "Your Stripe connection needs attention"
    : "Connect Stripe to start invoicing";

  const body = isError
    ? `There's a problem with the Stripe account${accountName ? ` (${accountName})` : ""} powering your invoices, so invoicing is paused. Reconnect to get clients paying online again.`
    : "Invoices run on Stripe. Connect your account so clients can pay online and payments land straight in your bank — you'll need this before creating or sending invoices.";

  const cta = isError ? "Reconnect Stripe" : "Connect Stripe";

  return (
    <div className="flex-1 overflow-y-auto p-5 flex items-center justify-center">
      <div
        className="flex flex-col items-center text-center"
        style={{
          maxWidth: 460,
          padding: "44px 40px",
          borderRadius: 16,
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          boxShadow: "var(--shadow-card, 0 1px 2px rgba(var(--color-charcoal-rgb),0.04))",
        }}
      >
        {/* Brand badge */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: isError ? "rgba(var(--color-red-rgb),0.10)" : "rgba(99,91,255,0.10)",
            color: isError ? "var(--color-red-orange)" : STRIPE_PURPLE,
            marginBottom: 18,
          }}
        >
          {isError ? <AlertTriangle size={24} strokeWidth={1.75} /> : <CreditCard size={24} strokeWidth={1.75} />}
        </div>

        <h2
          className="font-semibold"
          style={{ fontSize: 17, color: "var(--color-charcoal)", fontFamily: "var(--font-display)", marginBottom: 8 }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--color-grey)", marginBottom: 24 }}>
          {body}
        </p>

        <a
          href={connectHref}
          className="flex items-center justify-center gap-2 text-white font-medium transition-opacity"
          style={{
            height: 40,
            padding: "0 22px",
            borderRadius: 10,
            fontSize: 13,
            background: isError ? "var(--color-red-orange)" : STRIPE_PURPLE,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          {cta}
          <ArrowRight size={14} strokeWidth={2} />
        </a>

        {/* Reassurance row — what connecting buys, kept terse */}
        <div
          className="flex items-center gap-5"
          style={{ marginTop: 28, paddingTop: 20, borderTop: "0.5px solid var(--color-border)" }}
        >
          {[
            { icon: Globe, label: "Pay online" },
            { icon: Banknote, label: "Straight to your bank" },
            { icon: ShieldCheck, label: "Stripe-secured" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5" style={{ width: 96 }}>
              <Icon size={15} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
              <span style={{ fontSize: 10.5, lineHeight: 1.3, color: "var(--color-grey)" }}>{label}</span>
            </div>
          ))}
        </div>

        <a
          href="/settings?section=integrations&provider=stripe"
          className="transition-colors"
          style={{ marginTop: 22, fontSize: 11, color: "var(--color-grey)", textDecoration: "none" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-charcoal)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-grey)"; }}
        >
          Manage in Settings → Integrations
        </a>
      </div>
    </div>
  );
}
