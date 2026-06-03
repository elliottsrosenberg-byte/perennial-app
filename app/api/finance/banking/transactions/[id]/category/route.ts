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
import { CANONICAL_CATEGORY_KEYS } from "@/components/finance/plaidCategoryDisplay";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set(CANONICAL_CATEGORY_KEYS);

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
    /** A canonical category key (see CANONICAL_CATEGORIES) or null to clear. */
    manual_category?:   string | null;
    /** Optional UUID of a custom category from profiles.custom_categories.
     *  When provided, the row's chip renders the custom label/colour.
     *  Pass null to clear. */
    manual_custom_id?:  string | null;
  } | null;
  if (!body || !("manual_category" in body)) {
    return NextResponse.json({ error: "manual_category is required" }, { status: 400 });
  }

  const next = body.manual_category;
  if (next !== null && !VALID_CATEGORIES.has(next as string)) {
    return NextResponse.json({ error: "invalid manual_category" }, { status: 400 });
  }

  // Build the update payload. We only touch manual_custom_id when the
  // client explicitly sends it — keeps the existing chip picker (which
  // doesn't know about customs) from accidentally clearing the custom id
  // when toggling between built-ins.
  const patch: Record<string, unknown> = { manual_category: next };
  if ("manual_custom_id" in body) {
    const cid = body.manual_custom_id;
    if (cid !== null && (typeof cid !== "string" || cid.length > 128)) {
      return NextResponse.json({ error: "invalid manual_custom_id" }, { status: 400 });
    }
    patch.manual_custom_id = cid;
  }

  const { data, error } = await supabase
    .from("bank_transactions")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, manual_category, manual_custom_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, transaction: data });
}
