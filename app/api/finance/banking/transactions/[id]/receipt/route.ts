// PATCH /api/finance/banking/transactions/:id/receipt
//
// Body: { receipt_url: string | null, receipt_path: string | null }
//
// Persists the result of a client-side upload to the `receipts` bucket.
// The actual upload + delete-from-storage happens on the client via
// lib/uploads/receipt.ts — this route only writes the two columns so the
// row knows where the file lives + can render it back.

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

  const body = (await req.json().catch(() => null)) as {
    receipt_url?:  string | null;
    receipt_path?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: "missing_body" }, { status: 400 });

  const url  = body.receipt_url  ?? null;
  const path = body.receipt_path ?? null;

  if (url !== null && typeof url !== "string") {
    return NextResponse.json({ error: "receipt_url must be a string or null" }, { status: 400 });
  }
  if (path !== null && typeof path !== "string") {
    return NextResponse.json({ error: "receipt_path must be a string or null" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bank_transactions")
    .update({ receipt_url: url, receipt_path: path })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, receipt_url, receipt_path")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, transaction: data });
}
