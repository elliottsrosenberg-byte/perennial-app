import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mintPublicInvoiceToken } from "@/lib/invoices/token";
import { formatInvoiceNumber } from "@/lib/invoices/format";
import { buildInvoiceEmailHtml } from "@/lib/invoices/email-template";
import type { Invoice } from "@/types/database";

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ds: string | null) {
  if (!ds) return "—";
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function invoiceTotal(inv: Invoice) {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}


export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email not configured. Add RESEND_API_KEY to your environment variables." }, { status: 503 });
  }

  const { invoiceId, to, message, subject } = await req.json() as { invoiceId: string; to: string; message: string; subject?: string };
  if (!invoiceId || !to) {
    return NextResponse.json({ error: "Missing invoiceId or to" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("*, client_contact:contacts(id, first_name, last_name, email), client_organization:organizations(id, name), project:projects(id, title, rate), line_items:invoice_line_items(*)")
    .eq("id", invoiceId)
    .single();

  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Mint + persist a public token the first time we send this invoice so
  // the email CTA can deep-link the recipient to /i/[token]. Reuses the
  // existing token on subsequent sends (clients sometimes get re-sent).
  let publicToken: string = (inv as Invoice).public_token ?? "";
  if (!publicToken) {
    publicToken = mintPublicInvoiceToken();
    const { error: tokErr } = await supabase
      .from("invoices")
      .update({ public_token: publicToken })
      .eq("id", invoiceId);
    if (tokErr) {
      console.error("Failed to persist public_token:", tokErr);
      return NextResponse.json({ error: "Failed to prepare public link." }, { status: 500 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${new URL(req.url).origin}`;

  // Pull the user's invoice_prefix + studio identity so the email uses the
  // configured prefix (e.g. "INV-007") and the studio's own name in the
  // header instead of Perennial branding.
  const { data: profile } = await supabase
    .from("profiles")
    .select("invoice_prefix, studio_name, display_name, brand_color, logo_url")
    .eq("user_id", (inv as Invoice).user_id)
    .maybeSingle();
  const studioName = profile?.studio_name?.trim() || profile?.display_name?.trim() || "Your studio";
  const accent = profile?.brand_color?.trim() || "#3d6b4f";
  const logoUrl = profile?.logo_url ?? null;

  const invObj = inv as Invoice;
  const total = invoiceTotal(invObj);
  const invNum = formatInvoiceNumber(invObj.number, profile?.invoice_prefix);
  const html = buildInvoiceEmailHtml({
    invNum,
    studioName,
    accent,
    logoUrl,
    message,
    issuedLabel: fmtDate(invObj.issued_at),
    dueLabel:    invObj.due_at ? fmtDate(invObj.due_at) : null,
    lineItems:   (invObj.line_items ?? []).map((li) => ({ description: li.description, quantity: li.quantity, rate: Number(li.rate), amount: Number(li.amount) })),
    total,
    publicUrl:   `${appUrl}/i/${publicToken}`,
    printUrl:    `${appUrl}/finance/invoice/${invObj.id}/print`,
  });
  const finalSubject = subject?.trim() || `Invoice ${invNum} — ${fmtCurrency(total)}`;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM ?? "onboarding@resend.dev",
    to,
    subject: finalSubject,
    html,
  });

  if (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ error: (error as { message?: string }).message ?? "Failed to send email." }, { status: 500 });
  }

  // Mark invoice as sent if it hasn't been sent yet (draft or saved), stamping
  // sent_at for the activity timeline.
  if (inv.status === "draft" || inv.status === "saved") {
    await supabase.from("invoices")
      .update({ status: "sent", sent_at: (inv as Invoice).sent_at ?? new Date().toISOString() })
      .eq("id", invoiceId);
  }

  return NextResponse.json({ ok: true });
}
