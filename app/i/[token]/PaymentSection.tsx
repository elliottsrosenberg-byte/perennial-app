"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import type { InvoiceStatus } from "@/types/database";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// Memoized per-account loader. For Stripe Connect direct charges, the
// Elements provider needs to know which connected account the
// client_secret was minted on — so loadStripe() takes a stripeAccount
// option and we cache by acct_xxx ID. Each hosted-invoice page only
// loads a single account, so the cache stays tiny in practice.
const stripeJsByAccount = new Map<string, Promise<StripeJs | null>>();
function getStripeJsFor(stripeAccount: string): Promise<StripeJs | null> | null {
  if (!publishableKey) return null;
  let promise = stripeJsByAccount.get(stripeAccount);
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount });
    stripeJsByAccount.set(stripeAccount, promise);
  }
  return promise;
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentSection({
  invoiceId, token, amount, status, clientEmail,
}: {
  invoiceId:   string;
  token:       string;
  amount:      number;
  status:      InvoiceStatus;
  clientEmail: string | null;
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
    <PaymentFlow invoiceId={invoiceId} token={token} amount={amount} clientEmail={clientEmail} />
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
function PaymentFlow({
  invoiceId, token, amount, clientEmail,
}: {
  invoiceId:   string;
  token:       string;
  amount:      number;
  clientEmail: string | null;
}) {
  const [clientSecret,  setClientSecret]  = useState<string | null>(null);
  const [stripeAccount, setStripeAccount] = useState<string | null>(null);
  const [error,         setError]         = useState<string | null>(null);
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
        const json = await res.json() as { client_secret?: string; stripe_account?: string; error?: string; message?: string };
        if (!res.ok || !json.client_secret || !json.stripe_account) {
          setError(json.message ?? json.error ?? "Could not start payment.");
          return;
        }
        setClientSecret(json.client_secret);
        setStripeAccount(json.stripe_account);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start payment.");
      }
    })();
  }, [invoiceId, token]);

  const stripeJs = useMemo(
    () => (stripeAccount ? getStripeJsFor(stripeAccount) : null),
    [stripeAccount],
  );

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

  const elementsOptions: StripeElementsOptions = {
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
  };

  return (
    <Elements
      stripe={stripeJs}
      options={elementsOptions}
    >
      <PayForm amount={amount} token={token} clientEmail={clientEmail} />
    </Elements>
  );
}

function PayForm({
  amount, token, clientEmail,
}: {
  amount:      number;
  token:       string;
  clientEmail: string | null;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [busy, setBusy]                       = useState(false);
  const [err,  setErr]                        = useState<string | null>(null);
  // Track the PaymentElement lifecycle so we can gate the Pay button on
  // it actually rendering, and surface load failures inline instead of
  // leaving the user staring at an empty white box.
  const [elementReady, setElementReady]       = useState(false);
  const [elementError, setElementError]       = useState<string | null>(null);
  const [elementComplete, setElementComplete] = useState(false);
  // If the iframe never reports ready within 5s, it likely loaded but
  // rendered no payment methods (silent-empty case — Stripe doesn't
  // always fire loaderror for this). We surface the same diagnostic as
  // an explicit loaderror would trigger.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (elementReady) return;
    const t = setTimeout(() => setStalled(true), 5_000);
    return () => clearTimeout(t);
  }, [elementReady]);
  const showDiagnostic = Boolean(elementError) || (stalled && !elementReady);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    // Belt-and-suspenders: don't let an empty/incomplete form race into
    // confirmPayment, which historically left the button stuck at
    // "Processing…" indefinitely.
    if (!elementReady || !elementComplete) return;
    setBusy(true);
    setErr(null);

    const returnUrl = typeof window !== "undefined"
      ? `${window.location.origin}/i/${token}?paid=1`
      : `/i/${token}?paid=1`;

    // Wrap confirmPayment in a 90s timeout. Stripe's promise can stall
    // silently when a 3DS popup is blocked or a postMessage gets lost —
    // we'd rather give the user an actionable error than leave them
    // staring at "Processing…" forever.
    type ConfirmResult = Awaited<ReturnType<typeof stripe.confirmPayment>>;
    const result = (await Promise.race([
      stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl },
      }),
      new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              error: {
                message:
                  "Payment is taking longer than expected — please try again or refresh.",
              },
            }),
          90_000,
        ),
      ),
    ])) as ConfirmResult | { error: { message: string } };

    // If we get here, confirmPayment didn't redirect (typically because
    // there was an immediate validation error, or our timeout fired).
    // Surface it inline and unstick the button.
    if ("error" in result && result.error) {
      setErr(result.error.message ?? "Payment failed. Please try again.");
      setBusy(false);
    }
  }

  // Button label tracks the three meaningful states: still loading the
  // PaymentElement, ready to take a payment, or actively submitting.
  const buttonLabel = busy
    ? "Processing…"
    : !elementReady
      ? "Loading…"
      : `Pay ${fmtCurrency(amount)}`;

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: "white", padding: "14px 14px", borderRadius: 8, marginBottom: 12 }}>
        {/* Prefill the payer's email from the invoice contact so they
            don't have to retype something we already know. They can
            still edit it. */}
        <PaymentElement
          options={{
            defaultValues: {
              billingDetails: { email: clientEmail ?? undefined },
            },
          }}
          onReady={() => setElementReady(true)}
          onLoadError={(event) => {
            // event.elementType is "payment"; event.error has { type, message, code? }
            const msg =
              event?.error?.message ??
              "Payment form couldn't load. Please refresh and try again.";
            console.error("[hosted-invoice] PaymentElement loaderror:", event?.error);
            setElementError(msg);
          }}
          onChange={(event) => {
            setElementComplete(Boolean(event.complete));
          }}
        />
      </div>
      {elementError && (
        <p style={{ fontSize: 11.5, color: "#dc3e0d", marginBottom: 10, lineHeight: 1.5 }}>
          Payment form couldn&apos;t load: {elementError}
        </p>
      )}
      {!elementError && elementReady && !elementComplete && (
        <p style={{ fontSize: 11.5, color: "#9a9690", marginBottom: 10, lineHeight: 1.5 }}>
          Enter your payment details to continue.
        </p>
      )}
      {showDiagnostic && (
        <div
          style={{
            background: "white", border: "0.5px solid #e6e4dd", borderRadius: 8,
            padding: "12px 14px", marginBottom: 12, fontSize: 11.5,
            color: "#1f211a", lineHeight: 1.55,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 6 }}>
            Payment form didn&apos;t load.
          </p>
          <p style={{ color: "#6b6860", marginBottom: 10 }}>
            This usually means no payment methods are enabled in your Stripe account.
            Open Stripe Dashboard → Settings → Payment methods, enable Card, then refresh.
          </p>
          <a
            href="https://dashboard.stripe.com/settings/payment_methods"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 6,
              background: "#1f211a", color: "white", textDecoration: "none",
              fontSize: 11.5, fontWeight: 600,
            }}
          >
            Open Stripe settings ↗
          </a>
        </div>
      )}
      {err && (
        <p style={{ fontSize: 11.5, color: "#dc3e0d", marginBottom: 10, lineHeight: 1.5 }}>{err}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || busy || !elementReady || !elementComplete}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 8,
          background: "#1f211a", color: "white", border: "none",
          fontFamily: "inherit", fontSize: 13, fontWeight: 600,
          cursor: (busy || !elementReady || !elementComplete) ? "default" : "pointer",
          opacity: (busy || !elementReady || !elementComplete) ? 0.7 : 1,
        }}
      >
        {buttonLabel}
      </button>
    </form>
  );
}
