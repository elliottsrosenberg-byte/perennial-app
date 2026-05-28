import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createServiceClient } from "@/lib/supabase/service";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two webhook configs in the Stripe Dashboard point at this one
// endpoint: the platform webhook (events on Perennial's account, e.g.
// future SaaS billing) and the Connect webhook (events on the user's
// connected account, e.g. payment_intent.succeeded for invoice
// payments). Each config has its own signing secret. We try platform
// first, fall back to Connect — both arrive as `Stripe.Event` with the
// same shape; the only externally visible difference is `event.account`,
// which is set for Connect events.
const platformSecret = process.env.STRIPE_WEBHOOK_SECRET;
const connectSecret  = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

function verify(raw: string, sig: string): Stripe.Event | null {
  if (platformSecret) {
    try { return stripe.webhooks.constructEvent(raw, sig, platformSecret); } catch {/* fallthrough */}
  }
  if (connectSecret) {
    try { return stripe.webhooks.constructEvent(raw, sig, connectSecret); } catch {/* fallthrough */}
  }
  return null;
}

/** Stripe webhook receiver. Verifies the signature against whichever
 *  signing secret matches, then mutates the invoice row when a
 *  PaymentIntent succeeds. Idempotent — re-receiving the same event
 *  (Stripe retries up to 3 days) won't double-mark or error out. */
export async function POST(req: Request) {
  if (!platformSecret && !connectSecret) {
    console.error("Neither STRIPE_WEBHOOK_SECRET nor STRIPE_CONNECT_WEBHOOK_SECRET is set — webhook cannot verify events.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  // Stripe signature verification needs the *raw* request body — must
  // not be JSON-parsed first or the HMAC fails. req.text() preserves
  // the original bytes.
  const raw = await req.text();

  const event = verify(raw, sig);
  if (!event) {
    console.error("Stripe webhook signature failed against both platform and Connect secrets");
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const invoiceId = intent.metadata?.invoice_id;
      if (!invoiceId) {
        console.warn("payment_intent.succeeded with no invoice_id metadata:", intent.id);
        break;
      }
      const supabase = createServiceClient();
      const today = new Date().toISOString().split("T")[0];

      // Fetch current status so we can no-op on already-paid invoices
      // (Stripe retries don't need to re-write the row).
      const { data: existing } = await supabase
        .from("invoices")
        .select("status, paid_at")
        .eq("id", invoiceId)
        .maybeSingle();

      if (!existing) {
        console.warn("payment_intent.succeeded for unknown invoice:", invoiceId);
        break;
      }
      if (existing.status === "paid") {
        // Already handled — ignore the retry.
        break;
      }
      const { error } = await supabase
        .from("invoices")
        .update({
          status:                   "paid",
          paid_at:                  today,
          stripe_payment_intent_id: intent.id,
        })
        .eq("id", invoiceId);
      if (error) {
        console.error("Failed to mark invoice paid:", error);
        // Return 500 so Stripe retries.
        return NextResponse.json({ error: "Failed to update invoice." }, { status: 500 });
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      console.warn("PaymentIntent failed:", intent.id, intent.last_payment_error?.message);
      // Intentionally do not mutate invoice state — the client just sees
      // the inline error from the Payment Element and can retry.
      break;
    }
    default:
      // Quietly ignore other event types we haven't subscribed to.
      break;
  }

  return NextResponse.json({ received: true });
}
