// POST /api/finance/banking/transactions/:id/personal
//
// Body: { is_personal: boolean }
//
// Flips the per-transaction is_personal flag. When true, the row drops
// out of the active review queue and joins the Hidden section; setting
// it back to false is the "Undo" path. We do NOT clear any existing
// linked_expense_id / matched_invoice_id here — those are independent
// derived states (a personal-tagged row that was previously logged is
// almost certainly a user error and they can unwind via the Hidden
// list).

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

  const body = (await req.json().catch(() => null)) as { is_personal?: boolean } | null;
  if (!body || typeof body.is_personal !== "boolean") {
    return NextResponse.json({ error: "is_personal must be a boolean" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bank_transactions")
    .update({ is_personal: body.is_personal })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, is_personal")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, transaction: data });
}
