// PATCH /api/finance/banking/transactions/:id/category
//
// Body: { manual_category: ExpenseCategory | null }
//
// Persists the user's category override on a bank transaction. When set,
// `manual_category` takes precedence over the Plaid-derived
// `details.personal_finance_category.primary` for both the row chip and
// the "Log expense" prefill in AddExpenseModal. Passing null clears the
// override so the row falls back to the Plaid mapping. Mirrors the
// `/personal` route's auth + body-validation pattern.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ExpenseCategory } from "@/types/database";

export const runtime = "nodejs";

const VALID_CATEGORIES: readonly ExpenseCategory[] = [
  "materials", "travel", "production", "software", "other",
];

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    manual_category?: ExpenseCategory | null;
  } | null;
  if (!body || !("manual_category" in body)) {
    return NextResponse.json({ error: "manual_category is required" }, { status: 400 });
  }

  const next = body.manual_category;
  if (next !== null && !VALID_CATEGORIES.includes(next as ExpenseCategory)) {
    return NextResponse.json({ error: "invalid manual_category" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bank_transactions")
    .update({ manual_category: next })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, manual_category")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, transaction: data });
}
