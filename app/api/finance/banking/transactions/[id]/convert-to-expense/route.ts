// POST /api/finance/banking/transactions/:id/convert-to-expense
//
// Body: { project_id?: string, category: ExpenseCategory, description?: string, vendor?: string }
//
// Creates an `expenses` row using the transaction's amount + date, then
// stamps bank_transactions.linked_expense_id so the row leaves the
// review queue. We don't roll a real DB transaction here (Supabase JS
// can't); failure between the insert and the update would leave an
// orphaned expense — see "rough edges" in the report.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ExpenseCategory } from "@/types/database";

export const runtime = "nodejs";

const VALID_CATEGORIES: ExpenseCategory[] = ["materials", "travel", "production", "software", "other"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    project_id?: string | null;
    category?:    ExpenseCategory;
    description?: string;
    vendor?:      string;
  } | null;
  if (!body) return NextResponse.json({ error: "missing_body" }, { status: 400 });

  const category: ExpenseCategory = body.category && VALID_CATEGORIES.includes(body.category)
    ? body.category
    : "other";

  // Load the transaction (with cheap details for fallback description +
  // the receipt fields so the expense inherits any uploaded file).
  const { data: tx, error: txErr } = await supabase
    .from("bank_transactions")
    .select("id, amount, type, date, description, details, linked_expense_id, receipt_url, receipt_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (txErr)   return NextResponse.json({ error: txErr.message }, { status: 500 });
  if (!tx)     return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (tx.linked_expense_id) {
    return NextResponse.json({ error: "already_linked" }, { status: 409 });
  }

  // Only debits become expenses. Credits (money in) are invoice
  // payments, not business spend.
  if (tx.type !== "debit") {
    return NextResponse.json({ error: "credits cannot be logged as expenses" }, { status: 400 });
  }

  const description = body.description?.trim()
    || body.vendor?.trim()
    || tx.description
    || "Bank transaction";

  const expenseAmount = Math.abs(Number(tx.amount));

  // Carry the receipt over so the expense already has the file the user
  // attached on the bank row. Both columns are nullable, so a missing
  // receipt just stays null.
  const { data: expense, error: insertErr } = await supabase
    .from("expenses")
    .insert({
      user_id:      user.id,
      project_id:   body.project_id || null,
      description,
      category,
      amount:       expenseAmount,
      date:         tx.date,
      receipt_url:  tx.receipt_url  ?? null,
      receipt_path: tx.receipt_path ?? null,
    })
    .select("*, project:projects(id, title, type, rate)")
    .single();
  if (insertErr || !expense) {
    return NextResponse.json({ error: insertErr?.message ?? "insert_failed" }, { status: 500 });
  }

  const { error: linkErr } = await supabase
    .from("bank_transactions")
    .update({ linked_expense_id: expense.id })
    .eq("id", tx.id)
    .eq("user_id", user.id);
  if (linkErr) {
    // Best-effort rollback — delete the orphaned expense so the user
    // doesn't see a phantom row.
    await supabase.from("expenses").delete().eq("id", expense.id).eq("user_id", user.id);
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expense, transaction_id: tx.id });
}
