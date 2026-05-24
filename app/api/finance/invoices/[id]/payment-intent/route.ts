import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe/server";
import type { Invoice, InvoiceLineItem } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invoiceTotal(items: InvoiceLineItem[] | null | undefined): number {
  return (items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}

/** Mint (or reuse) a PaymentIntent for a tokenized invoice. The body
 *  carries the public_token from the /i/[token] URL; we re-verify it
 *  against the invoice row before doing anything Stripe-side. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { token?: string };
  try {
    body = await req.json() as { token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, line_items:invoice_line_items(*)")
    .eq("id", id)
    .eq("public_token", token)
    .maybeSingle();

  if (error) {
    console.error("invoice lookup failed:", error);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const inv = data as Invoice;
  if (inv.status === "draft") {
    return NextResponse.json({ error: "Invoice is not available for payment." }, { status: 404 });
  }
  if (inv.status === "paid") {
    return NextResponse.json({ error: "Invoice has already been paid." }, { status: 400 });
  }

  const amountCents = Math.round(invoiceTotal(inv.line_items) * 100);
  if (amountCents <= 0) {
    return NextResponse.json({ error: "Invoice total is zero." }, { status: 400 });
  }

  // Currency — fall back to USD if the studio hasn't set one (most US
  // users; Stripe accepts the three-letter ISO lowercased).
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency")
    .eq("user_id", inv.user_id)
    .maybeSingle();
  const currency = ((profile?.currency as string | undefined) ?? "USD").toLowerCase();

  // Reuse the existing PaymentIntent if it's still in a usable state —
  // requires_payment_method / requires_confirmation / requires_action all
  // mean the client_secret still lets us complete payment without minting
  // a new intent (which would orphan the previous one).
  const REUSABLE_STATES = new Set([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
  ]);

  if (inv.stripe_payment_intent_id) {
    try {
      const existing = await stripe.paymentIntents.retrieve(inv.stripe_payment_intent_id);
      if (REUSABLE_STATES.has(existing.status) && existing.amount === amountCents) {
        return NextResponse.json({
          client_secret: existing.client_secret,
          amount:        existing.amount,
        });
      }
    } catch (err) {
      // Intent went missing or Stripe is unhappy — fall through and mint
      // a fresh one rather than blocking the client.
      console.warn("PaymentIntent retrieve failed; creating fresh:", err);
    }
  }

  // Primary path: let Stripe surface whatever the dashboard has
  // configured. If the user hasn't enabled anything though, this comes
  // back with payment_method_types: [] and the PaymentElement renders
  // empty — see retry below.
  let intent = await stripe.paymentIntents.create({
    amount:   amountCents,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      invoice_id:   inv.id,
      public_token: token,
    },
  });

  // Defense-in-depth: re-fetch and check whether automatic methods
  // actually produced anything. Empty payment_method_types is the
  // signature of "no methods enabled in Stripe Dashboard → Settings →
  // Payment methods". Retry with an explicit allowlist so at least Card
  // surfaces. (Won't help if Card is explicitly disabled on the
  // account, but covers the much-more-common "nothing enabled at all"
  // case.)
  try {
    const verified = await stripe.paymentIntents.retrieve(intent.id, {
      expand: ["payment_method_options"],
    });
    const methods = verified.payment_method_types ?? [];
    if (methods.length === 0) {
      console.warn(
        `[payment-intent] Stripe returned no payment methods for intent ${intent.id}. ` +
        `Likely cause: no methods enabled in Stripe Dashboard → Settings → Payment Methods.`,
      );
      const retried = await stripe.paymentIntents.create({
        amount:   amountCents,
        currency,
        payment_method_types: ["card", "us_bank_account", "link"],
        metadata: {
          invoice_id:   inv.id,
          public_token: token,
          fallback:     "explicit_method_allowlist",
        },
      });
      // Cancel the empty original so we don't leave an orphaned
      // unusable intent behind.
      try {
        await stripe.paymentIntents.cancel(intent.id);
      } catch (cancelErr) {
        console.warn("[payment-intent] failed to cancel empty intent:", cancelErr);
      }
      intent = retried;
    }
  } catch (verifyErr) {
    // Verification failure shouldn't block the happy path — if the
    // retrieve call hiccups we still return the original client_secret
    // and let the client render what it can.
    console.warn("[payment-intent] post-create verify failed:", verifyErr);
  }

  await supabase
    .from("invoices")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", inv.id);

  return NextResponse.json({
    client_secret: intent.client_secret,
    amount:        intent.amount,
  });
}
