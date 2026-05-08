import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  if (inv.client_company) return inv.client_company.name;
  return "Client";
}

function buildEmail(inv: Invoice, to: string, message: string, appUrl: string) {
  const total = invoiceTotal(inv);
  const invNum = String(inv.number).padStart(3, "0");
  const printUrl = `${appUrl}/finance/invoice/${inv.id}/print`;
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
      <div style="color:rgba(255,255,255,0.6);font-size:12px;">Invoice #${invNum}</div>
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
            <td style="font-size:14px;font-weight:600;color:#1f211a;">#${invNum}</td>
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

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="${printUrl}" style="display:inline-block;background:#9BA37A;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600;">View & Download Invoice</a>
      </div>
      ${inv.payment_method ? `<p style="text-align:center;font-size:12px;color:#9a9690;margin-top:12px;">Payment via ${inv.payment_method}</p>` : ""}
    </div>

    <!-- Footer -->
    <div style="background:#f9faf4;padding:16px 36px;border-top:1px solid #eff0e7;">
      <p style="font-size:11px;color:#9a9690;margin:0;">Sent via Perennial · <a href="${printUrl}" style="color:#9BA37A;text-decoration:none;">View invoice</a></p>
    </div>
  </div>
</body>
</html>`;

  return { html, subject: `Invoice #${invNum} — ${fmtCurrency(total)}` };
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
    .select("*, client_contact:contacts(id, first_name, last_name, email), client_company:companies(id, name), project:projects(id, title, rate), line_items:invoice_line_items(*)")
    .eq("id", invoiceId)
    .single();

  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${new URL(req.url).origin}`;
  const { html, subject } = buildEmail(inv as Invoice, to, message, appUrl);

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
