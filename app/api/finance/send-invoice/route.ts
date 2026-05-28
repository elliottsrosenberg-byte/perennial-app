import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mintPublicInvoiceToken } from "@/lib/invoices/token";
import { formatInvoiceNumber } from "@/lib/invoices/format";
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

function clientName(inv: Invoice) {
  if (inv.client_contact) return `${inv.client_contact.first_name} ${inv.client_contact.last_name}`;
  if (inv.client_organization) return inv.client_organization.name;
  return "Client";
}

function buildEmail(inv: Invoice, to: string, message: string, appUrl: string, publicToken: string, invoicePrefix: string | null | undefined) {
  const total = invoiceTotal(inv);
  const invNum = formatInvoiceNumber(inv.number, invoicePrefix);
  const printUrl  = `${appUrl}/finance/invoice/${inv.id}/print`;
  const publicUrl = `${appUrl}/i/${publicToken}`;
  const lineItemRows = (inv.line_items ?? []).map(li => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#1f211a;">${li.description}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#9a9690;text-align:right;">${li.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#9a9690;text-align:right;">${fmtCurrency(li.rate)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;font-weight:500;text-align:right;">${fmtCurrency(Number(li.amount))}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:#1f211a;padding:28px 36px;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:white;font-size:18px;font-weight:700;letter-spacing:-0.02em;">Perennial</div>
      <div style="color:rgba(255,255,255,0.6);font-size:12px;">Invoice ${invNum}</div>
    </div>

    <!-- Body -->
    <div style="padding:32px 36px;">
      <p style="font-size:15px;font-weight:600;color:#1f211a;margin:0 0 8px;">Invoice from your studio</p>
      <p style="font-size:13px;color:#6b6860;margin:0 0 24px;line-height:1.6;">${message.replace(/\n/g, "<br>")}</p>

      <!-- Meta -->
      <div style="background:#f9faf4;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:11px;color:#9a9690;padding-bottom:4px;">Invoice #</td>
            <td style="font-size:11px;color:#9a9690;padding-bottom:4px;text-align:right;">Issued</td>
            ${inv.due_at ? `<td style="font-size:11px;color:#9a9690;padding-bottom:4px;text-align:right;">Due</td>` : ""}
          </tr>
          <tr>
            <td style="font-size:14px;font-weight:600;color:#1f211a;">${invNum}</td>
            <td style="font-size:13px;color:#1f211a;text-align:right;">${fmtDate(inv.issued_at)}</td>
            ${inv.due_at ? `<td style="font-size:13px;color:#1f211a;text-align:right;font-weight:500;">${fmtDate(inv.due_at)}</td>` : ""}
          </tr>
        </table>
      </div>

      <!-- Line items -->
      ${lineItemRows ? `
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr>
            <th style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9a9690;text-align:left;padding-bottom:8px;border-bottom:2px solid #f0ede8;">Description</th>
            <th style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9a9690;text-align:right;padding-bottom:8px;border-bottom:2px solid #f0ede8;">Qty</th>
            <th style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9a9690;text-align:right;padding-bottom:8px;border-bottom:2px solid #f0ede8;">Rate</th>
            <th style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9a9690;text-align:right;padding-bottom:8px;border-bottom:2px solid #f0ede8;">Amount</th>
          </tr>
        </thead>
        <tbody>${lineItemRows}</tbody>
      </table>` : ""}

      <!-- Total -->
      <div style="display:flex;justify-content:flex-end;margin-bottom:28px;">
        <div style="min-width:200px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:12px;border-top:2px solid #1f211a;">
            <span style="font-size:13px;font-weight:600;color:#1f211a;">Total due</span>
            <span style="font-size:22px;font-weight:700;color:#1f211a;">${fmtCurrency(total)}</span>
          </div>
        </div>
      </div>

      <!-- Primary CTA: hosted public view with embedded Stripe payment -->
      <div style="text-align:center;margin-bottom:12px;">
        <a href="${publicUrl}" style="background:#3d6b4f;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-size:13px;font-weight:600;">View &amp; pay invoice →</a>
      </div>
      <!-- Secondary: plain PDF -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="${printUrl}" style="font-size:12px;color:#6b6860;text-decoration:underline;">Or download a PDF</a>
      </div>
      ${inv.payment_method ? `<p style="text-align:center;font-size:12px;color:#9a9690;margin-top:12px;">Payment via ${inv.payment_method}</p>` : ""}
    </div>

    <!-- Footer -->
    <div style="background:#f9faf4;padding:16px 36px;border-top:1px solid #eff0e7;">
      <p style="font-size:11px;color:#9a9690;margin:0;">Sent via Perennial · <a href="${publicUrl}" style="color:#3d6b4f;text-decoration:none;">Open the secure invoice page</a></p>
    </div>
  </div>
</body>
</html>`;

  return { html, subject: `Invoice ${invNum} — ${fmtCurrency(total)}` };
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email not configured. Add RESEND_API_KEY to your environment variables." }, { status: 503 });
  }

  const { invoiceId, to, message } = await req.json() as { invoiceId: string; to: string; message: string };
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

  // Pull the user's invoice_prefix so the email subject + header use the
  // configured prefix (e.g. "INV-007") instead of a bare "#007".
  const { data: profile } = await supabase
    .from("profiles")
    .select("invoice_prefix")
    .eq("user_id", (inv as Invoice).user_id)
    .maybeSingle();

  const { html, subject } = buildEmail(inv as Invoice, to, message, appUrl, publicToken, profile?.invoice_prefix);

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM ?? "onboarding@resend.dev",
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ error: (error as { message?: string }).message ?? "Failed to send email." }, { status: 500 });
  }

  // Mark invoice as sent if it's still draft
  if (inv.status === "draft") {
    await supabase.from("invoices").update({ status: "sent" }).eq("id", invoiceId);
  }

  return NextResponse.json({ ok: true });
}
