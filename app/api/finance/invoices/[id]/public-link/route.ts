import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mintPublicInvoiceToken } from "@/lib/invoices/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ensures the invoice has a public_token (minting + persisting one if
 *  it doesn't) and returns the full URL the user can hand to their
 *  client. Auth'd through the regular Supabase session — the user must
 *  own the invoice. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: inv, error } = await supabase
    .from("invoices")
    .select("id, user_id, public_token, status")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("invoice lookup failed:", error);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
  if (!inv || inv.user_id !== user.id) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  let token: string = inv.public_token ?? "";
  if (!token) {
    token = mintPublicInvoiceToken();
    const { error: updErr } = await supabase
      .from("invoices")
      .update({ public_token: token })
      .eq("id", id);
    if (updErr) {
      console.error("Failed to persist public_token:", updErr);
      return NextResponse.json({ error: "Failed to mint link." }, { status: 500 });
    }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return NextResponse.json({ token, url: `${base}/i/${token}` });
}
