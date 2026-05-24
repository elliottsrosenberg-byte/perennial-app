// PATCH /api/finance/banking/transactions/:id/receipt
//
// Body: { receipt_url: string | null, receipt_path: string | null }
//
// Persists the result of a client-side upload to the `receipts` bucket.
// The actual upload + delete-from-storage happens on the client via
// lib/uploads/receipt.ts — this route writes the two columns on the
// bank row AND mirrors the file into the Resources surface so it shows
// up in the user's file library.
//
// Mirror rules:
//   - Set: upsert one resources row with bank_transaction_id=<tx.id>,
//     category='Receipts', item_type='file'. Re-uploading replaces the
//     same row instead of creating a duplicate.
//   - Clear: delete the resources row keyed by bank_transaction_id.
//     (Client-side already removed the storage object via
//     lib/uploads/receipt.deleteReceipt before calling this route.)

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

  // Load enough of the tx to name the resource (merchant + date).
  const { data: tx, error: loadErr } = await supabase
    .from("bank_transactions")
    .select("id, date, description, details")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!tx)     return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await supabase
    .from("bank_transactions")
    .update({ receipt_url: url, receipt_path: path })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, receipt_url, receipt_path")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // ── Mirror into resources ────────────────────────────────────────────────
  // Dedup by bank_transaction_id so re-uploads replace, not duplicate.
  if (url) {
    // Best-effort: shape the resource so it reads well in the file library.
    const merchant =
      (tx.details as { merchant_name?: string | null } | null)?.merchant_name
      || tx.description
      || "Receipt";
    const niceDate = (() => {
      try {
        return new Date(tx.date + "T12:00:00").toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
      } catch { return tx.date; }
    })();
    const name = `${merchant} — ${niceDate}`.slice(0, 200);

    const { data: existing } = await supabase
      .from("resources")
      .select("id")
      .eq("user_id", user.id)
      .eq("bank_transaction_id", id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("resources")
        .update({
          name,
          file_urls: [url],
          status:    "complete",
        })
        .eq("id", existing.id)
        .eq("user_id", user.id);
    } else {
      await supabase
        .from("resources")
        .insert({
          user_id:             user.id,
          category:            "Receipts",
          name,
          item_type:           "file",
          status:              "complete",
          preview_type:        "file",
          file_urls:           [url],
          bank_transaction_id: id,
        });
    }
  } else {
    // Clear: drop the mirrored resource row (storage object was already
    // removed client-side by deleteReceipt before this PATCH fired).
    await supabase
      .from("resources")
      .delete()
      .eq("user_id", user.id)
      .eq("bank_transaction_id", id);
  }

  return NextResponse.json({ ok: true, transaction: data });
}
