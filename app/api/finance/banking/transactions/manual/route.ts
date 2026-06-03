// POST /api/finance/banking/transactions/manual
//
// Creates a manually-entered transaction (cash, Venmo, an unlinked payment,
// etc.) as a bank_transactions row with provider='manual'. It then shows in
// the Banking list like any synced row: a debit lands in To-review (log it
// as an expense), a credit can be matched to a paid invoice.
//
// When `log` is true on a debit, we also create the linked expense in the
// same call (the "Add + Log" action), carrying the billable flag + receipt.
//
// Body: {
//   type: "debit" | "credit",
//   amount: number,            // positive magnitude; sign derived from type
//   name: string,              // display name (stored as custom_name)
//   date: string,              // YYYY-MM-DD
//   category?: string | null,  // canonical category key (manual_category)
//   payment_method?: string | null,
//   payment_detail?: string | null,
//   bank_account_id?: string | null,  // when attributed to a linked account
//   receipt_url?: string | null,
//   receipt_path?: string | null,
//   billable?: boolean,        // only used when log=true on a debit
//   log?: boolean,             // also create + link an expense (debit only)
// }

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CANONICAL_CATEGORY_KEYS, expenseForCategory } from "@/components/finance/plaidCategoryDisplay";
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
    payment_detail?: string | null;
    bank_account_id?: string | null;
    receipt_url?: string | null;
    receipt_path?: string | null;
    billable?: boolean;
    log?: boolean;
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
  const paymentDetail = typeof body.payment_detail === "string" && body.payment_detail.trim()
    ? body.payment_detail.trim() : null;

  // Validate the linked account, if any, belongs to this user.
  let bankAccountId: string | null = null;
  if (body.bank_account_id) {
    const { data: acct } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("id", body.bank_account_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (acct) bankAccountId = acct.id;
  }

  // Signed amount: positive = money IN (credit), negative = OUT (debit) —
  // matches how synced rows are normalised for display.
  const signed = type === "credit" ? magnitude : -magnitude;

  const { data: tx, error } = await supabase
    .from("bank_transactions")
    .insert({
      user_id:         user.id,
      bank_account_id: bankAccountId,
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
      payment_detail:  paymentDetail,
      receipt_url:     body.receipt_url ?? null,
      receipt_path:    body.receipt_path ?? null,
    })
    .select("*, bank_account:bank_accounts(name, institution, last_four, type, subtype)")
    .single();
  if (error || !tx) return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });

  // "Add + Log": create the linked expense for a debit.
  if (body.log && type === "debit") {
    const { data: expense, error: expErr } = await supabase
      .from("expenses")
      .insert({
        user_id:     user.id,
        project_id:  null,
        description: name,
        category:    expenseForCategory(category, null),
        amount:      magnitude,
        date,
        billable:    body.billable ?? true,
        receipt_url: body.receipt_url ?? null,
      })
      .select("id")
      .single();
    if (!expErr && expense) {
      await supabase.from("bank_transactions")
        .update({ linked_expense_id: expense.id })
        .eq("id", tx.id)
        .eq("user_id", user.id);
      tx.linked_expense_id = expense.id;
    }
  }

  return NextResponse.json({ ok: true, transaction: tx });
}
