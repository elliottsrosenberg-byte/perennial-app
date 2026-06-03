// PATCH /api/finance/banking/transactions/:id/name
//
// Body: { custom_name: string | null }
//
// Sets bank_transactions.custom_name — a user-supplied display name that
// overrides the Plaid merchant_name / raw description for the row. Empty
// string and explicit null both clear the override. Scoped by user_id so a
// stray id from another tenant 404s. Mirrors the /note route.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { custom_name?: string | null } | null;
  if (!body || (body.custom_name !== null && typeof body.custom_name !== "string")) {
    return NextResponse.json({ error: "custom_name must be a string or null" }, { status: 400 });
  }

  const normalised = typeof body.custom_name === "string" && body.custom_name.trim().length === 0
    ? null
    : body.custom_name?.trim() ?? null;

  const { data, error } = await supabase
    .from("bank_transactions")
    .update({ custom_name: normalised })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, custom_name")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, transaction: data });
}
