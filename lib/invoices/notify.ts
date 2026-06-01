// Payment-confirmation email — sent to all parties when an invoice is
// completed (paid), whether via Stripe (webhook) or a manual "Mark as paid".
//
// Best-effort: never throws into the caller. Uses the service-role client so
// it works from the webhook (no session) and looks up the owner's email via
// the admin API. The owner copy is gated on their notif_payment_received
// preference; the client always receives a receipt.

import { createServiceClient } from "@/lib/supabase/service";
import { formatInvoiceNumber } from "@/lib/invoices/format";
import type { Invoice } from "@/types/database";

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invoiceTotal(inv: Invoice) {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}

function clientName(inv: Invoice) {
  if (inv.client_contact) return `${inv.client_contact.first_name} ${inv.client_contact.last_name}`;
  if (inv.client_organization) return inv.client_organization.name;
  return "your client";
}

function paidEmailHtml(studioName: string, invNum: string, total: number, who: string, isOwner: boolean, accent: string, logoUrl: string | null) {
  const headline = isOwner ? `Payment received from ${who}` : "Payment received — thank you";
  const body = isOwner
    ? `Invoice ${invNum} for ${fmtCurrency(total)} has been paid by ${who}.`
    : `We've received your payment of ${fmtCurrency(total)} for invoice ${invNum}. Thank you!`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
    <div style="background:${accent};padding:24px 32px;">
      ${logoUrl
        ? `<img src="${logoUrl}" alt="${studioName}" height="28" style="height:28px;max-width:200px;object-fit:contain;display:block;" />`
        : `<span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.02em;">${studioName}</span>`}
    </div>
    <div style="padding:28px 32px;text-align:center;">
      <div style="font-size:30px;margin-bottom:8px;">✓</div>
      <p style="font-size:15px;font-weight:600;color:#1f211a;margin:0 0 8px;">${headline}</p>
      <p style="font-size:13px;color:#6b6860;margin:0 0 16px;line-height:1.6;">${body}</p>
      <div style="font-size:28px;font-weight:700;color:${accent};">${fmtCurrency(total)}</div>
    </div>
    <div style="background:#f9faf4;padding:14px 32px;border-top:1px solid #eff0e7;">
      <span style="font-size:11px;color:#9a9690;">Sent securely via Perennial</span>
    </div>
  </div>
</body></html>`;
}

export async function sendInvoicePaidEmails(invoiceId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("invoices")
      .select("*, client_contact:contacts(id, first_name, last_name, email), client_organization:organizations(id, name, email), line_items:invoice_line_items(*)")
      .eq("id", invoiceId)
      .single();
    if (!data) return;
    const inv = data as Invoice;
    const total = invoiceTotal(inv);
    const who = clientName(inv);

    const { data: profile } = await supabase
      .from("profiles")
      .select("studio_name, display_name, invoice_prefix, notif_payment_received, brand_color, logo_url")
      .eq("user_id", inv.user_id)
      .maybeSingle();
    const studioName = profile?.studio_name?.trim() || profile?.display_name?.trim() || "Your studio";
    const invNum = formatInvoiceNumber(inv.number, profile?.invoice_prefix);
    const accent = profile?.brand_color?.trim() || "#3d6b4f";
    const logoUrl = profile?.logo_url ?? null;

    const clientEmail =
      (inv.client_contact as { email?: string | null } | null)?.email ??
      (inv.client_organization as { email?: string | null } | null)?.email ?? null;

    let ownerEmail: string | null = null;
    if (profile?.notif_payment_received !== false) {
      const { data: userRes } = await supabase.auth.admin.getUserById(inv.user_id);
      ownerEmail = userRes.user?.email ?? null;
    }

    const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    if (clientEmail) {
      await resend.emails.send({
        from, to: clientEmail,
        subject: `Payment received — Invoice ${invNum}`,
        html: paidEmailHtml(studioName, invNum, total, who, false, accent, logoUrl),
      });
    }
    if (ownerEmail && ownerEmail !== clientEmail) {
      await resend.emails.send({
        from, to: ownerEmail,
        subject: `Invoice ${invNum} was paid`,
        html: paidEmailHtml(studioName, invNum, total, who, true, accent, logoUrl),
      });
    }
  } catch (e) {
    console.error("sendInvoicePaidEmails failed for", invoiceId, e);
  }
}
