// PATCH /api/finance/banking/transactions/:id/note
//
// Body: { note: string | null }
//
// Sets bank_transactions.note. Empty string and explicit null both clear
// the column. Scoped by user_id so a stray id from another tenant 404s.

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

  const body = (await req.json().catch(() => null)) as { note?: string | null } | null;
  if (!body || (body.note !== null && typeof body.note !== "string")) {
    return NextResponse.json({ error: "note must be a string or null" }, { status: 400 });
  }

  const normalised = typeof body.note === "string" && body.note.trim().length === 0
    ? null
    : body.note;

  const { data, error } = await supabase
    .from("bank_transactions")
    .update({ note: normalised })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, note")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, transaction: data });
}
