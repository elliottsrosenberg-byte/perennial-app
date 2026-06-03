// POST /api/finance/banking/transactions/manual
//
// Creates a manually-entered transaction (cash, Venmo, an unlinked payment,
// etc.) as a bank_transactions row with provider='manual'. It then shows in
// the Banking list like any synced row: a debit lands in To-review (log it
// as an expense), a credit can be matched to a paid invoice.
//
// Body: {
//   type: "debit" | "credit",
//   amount: number,            // positive magnitude; sign derived from type
//   name: string,              // display name (stored as custom_name)
//   date: string,              // YYYY-MM-DD
//   category?: string | null,  // canonical category key (manual_category)
//   payment_method?: string | null,
//   note?: string | null,
// }

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CANONICAL_CATEGORY_KEYS } from "@/components/finance/plaidCategoryDisplay";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const PAYMENT_METHODS = new Set(["cash", "venmo", "card", "bank", "other"]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    type?: "debit" | "credit";
    amount?: number;
    name?: string;
    date?: string;
    category?: string | null;
    payment_method?: string | null;
    note?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const type = body.type === "credit" ? "credit" : "debit";
  const magnitude = Math.abs(Number(body.amount));
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const date = (body.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const category = body.category && CANONICAL_CATEGORY_KEYS.includes(body.category) ? body.category : null;
  const paymentMethod = body.payment_method && PAYMENT_METHODS.has(body.payment_method)
    ? body.payment_method : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  // Signed amount: positive = money IN (credit), negative = OUT (debit) —
  // matches how synced rows are normalised for display.
  const signed = type === "credit" ? magnitude : -magnitude;

  const { data, error } = await supabase
    .from("bank_transactions")
    .insert({
      user_id:         user.id,
      bank_account_id: null,
      provider:        "manual",
      external_id:     `manual_${randomUUID()}`,
      amount:          signed,
      type,
      description:     name,
      custom_name:     name,
      details:         {},
      date,
      status:          "posted",
      manual_category: category,
      payment_method:  paymentMethod,
      note,
    })
    .select("*, bank_account:bank_accounts(name, institution, last_four, type, subtype)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, transaction: data });
}
