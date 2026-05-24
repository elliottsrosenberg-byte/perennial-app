// POST /api/finance/banking/transactions/:id/match-invoice
//
// Body: { invoice_id: string }
//
// Marks the invoice as paid on the date of the transaction, and
// stamps bank_transactions.matched_invoice_id so the credit leaves
// the "Invoice activity" list. Two updates, no real DB transaction —
// if the second one fails we roll back the first.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { invoice_id?: string } | null;
  if (!body?.invoice_id) {
    return NextResponse.json({ error: "invoice_id required" }, { status: 400 });
  }

  // Look up the transaction first so we can use its date as paid_at.
  const { data: tx, error: txErr } = await supabase
    .from("bank_transactions")
    .select("id, date, matched_invoice_id, type")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });
  if (!tx)   return NextResponse.json({ error: "transaction_not_found" }, { status: 404 });

  // Capture the prior invoice status so we can roll back cleanly.
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, status, paid_at")
    .eq("id", body.invoice_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (invErr)   return NextResponse.json({ error: invErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });

  const { error: updateInvErr } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: tx.date })
    .eq("id", invoice.id)
    .eq("user_id", user.id);
  if (updateInvErr) {
    return NextResponse.json({ error: updateInvErr.message }, { status: 500 });
  }

  const { error: linkErr } = await supabase
    .from("bank_transactions")
    .update({ matched_invoice_id: invoice.id })
    .eq("id", tx.id)
    .eq("user_id", user.id);
  if (linkErr) {
    // Roll the invoice back to whatever it was before.
    await supabase
      .from("invoices")
      .update({ status: invoice.status, paid_at: invoice.paid_at })
      .eq("id", invoice.id)
      .eq("user_id", user.id);
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, invoice_id: invoice.id, transaction_id: tx.id });
}
