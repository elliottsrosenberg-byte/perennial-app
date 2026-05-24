"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { InvoiceStatus } from "@/types/database";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
// Memoized loader so we only call loadStripe() once across mounts.
let stripeJsPromise: Promise<StripeJs | null> | null = null;
function getStripeJs(): Promise<StripeJs | null> | null {
  if (!publishableKey) return null;
  if (!stripeJsPromise) stripeJsPromise = loadStripe(publishableKey);
  return stripeJsPromise;
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentSection({
  invoiceId, token, amount, status,
}: {
  invoiceId: string;
  token:     string;
  amount:    number;
  status:    InvoiceStatus;
}) {
  // The page already 404s on draft, but defend in depth.
  if (status === "paid") return <PaidChip />;

  // Show the success state when Stripe redirects back with ?paid=1.
  // The webhook does the real DB mutation server-side; this is just UI.
  const [returnedPaid, setReturnedPaid] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("paid") === "1") setReturnedPaid(true);
  }, []);

  if (returnedPaid) {
    return (
      <div
        style={{
          background: "rgba(61,107,79,0.12)", color: "#3d6b4f",
          padding: "12px 14px", borderRadius: 8, fontSize: 12, lineHeight: 1.55, fontWeight: 500,
        }}
      >
        Payment received — thank you. The invoice is being marked paid.
      </div>
    );
  }

  if (!publishableKey) {
    return (
      <div style={{ background: "white", padding: "12px 14px", borderRadius: 8, fontSize: 12, color: "#dc3e0d", lineHeight: 1.55 }}>
        Card payment isn&apos;t configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to your environment.
      </div>
    );
  }

  return (
    <PaymentFlow invoiceId={invoiceId} token={token} amount={amount} />
  );
}

function PaidChip() {
  return (
    <div
      style={{
        background: "rgba(61,107,79,0.12)", color: "#3d6b4f",
        padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
      }}
    >
      Paid — thank you.
    </div>
  );
}

/** Wraps Elements once we have a client_secret. We can't render <Elements>
 *  with an empty options.clientSecret, so we fetch first and only mount
 *  once the response lands. */
function PaymentFlow({ invoiceId, token, amount }: { invoiceId: string; token: string; amount: number }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/finance/invoices/${invoiceId}/payment-intent`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token }),
        });
        const json = await res.json() as { client_secret?: string; error?: string };
        if (!res.ok || !json.client_secret) {
          setError(json.error ?? "Could not start payment.");
          return;
        }
        setClientSecret(json.client_secret);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start payment.");
      }
    })();
  }, [invoiceId, token]);

  const stripeJs = useMemo(() => getStripeJs(), []);

  if (error) {
    return (
      <div style={{ background: "white", padding: "12px 14px", borderRadius: 8, fontSize: 12, color: "#dc3e0d", lineHeight: 1.55 }}>
        {error}
      </div>
    );
  }
  if (!clientSecret || !stripeJs) {
    return (
      <div style={{ background: "white", padding: "12px 14px", borderRadius: 8, fontSize: 12, color: "#9a9690", lineHeight: 1.55 }}>
        Loading secure payment…
      </div>
    );
  }

  return (
    <Elements
      stripe={stripeJs}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary:     "#3d6b4f",
            colorBackground:  "#ffffff",
            colorText:        "#1f211a",
            colorDanger:      "#dc3e0d",
            fontFamily:       "Albert Sans, -apple-system, BlinkMacSystemFont, sans-serif",
            borderRadius:     "8px",
          },
        },
      }}
    >
      <PayForm amount={amount} token={token} />
    </Elements>
  );
}

function PayForm({ amount, token }: { amount: number; token: string }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [busy, setBusy]     = useState(false);
  const [err,  setErr]      = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);

    const returnUrl = typeof window !== "undefined"
      ? `${window.location.origin}/i/${token}?paid=1`
      : `/i/${token}?paid=1`;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });

    // If we get here, confirmPayment didn't redirect (typically because
    // there was an immediate validation error). Surface it inline.
    if (error) {
      setErr(error.message ?? "Payment failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: "white", padding: "14px 14px", borderRadius: 8, marginBottom: 12 }}>
        <PaymentElement />
      </div>
      {err && (
        <p style={{ fontSize: 11.5, color: "#dc3e0d", marginBottom: 10, lineHeight: 1.5 }}>{err}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || busy}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 8,
          background: "#1f211a", color: "white", border: "none",
          fontFamily: "inherit", fontSize: 13, fontWeight: 600,
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Processing…" : `Pay ${fmtCurrency(amount)}`}
      </button>
    </form>
  );
}
