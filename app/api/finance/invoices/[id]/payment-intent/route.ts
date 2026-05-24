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

  const intent = await stripe.paymentIntents.create({
    amount:   amountCents,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      invoice_id:   inv.id,
      public_token: token,
    },
  });

  await supabase
    .from("invoices")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", inv.id);

  return NextResponse.json({
    client_secret: intent.client_secret,
    amount:        intent.amount,
  });
}
