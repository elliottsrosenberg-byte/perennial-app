import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendInvoicePaidEmails } from "@/lib/invoices/notify";
import type { Invoice } from "@/types/database";

// POST /api/finance/invoices/[id]/mark-paid
//
// Manual "Mark as paid" — sets status + paid_at, then emails all parties a
// payment confirmation (the Stripe path does this from the webhook). Returns
// the fully-joined invoice so the client can update in place.

const SELECT =
  "*, client_contact:contacts(id, first_name, last_name, email, phone, location), client_organization:organizations(id, name, email, phone, location), project:projects(id, title, rate), line_items:invoice_line_items(*), attachments:invoice_attachments(*)";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: today })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Invoice not found" }, { status: 404 });
  }

  await sendInvoicePaidEmails(id);

  return NextResponse.json({ invoice: data as Invoice });
}
