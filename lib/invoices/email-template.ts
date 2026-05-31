// Shared invoice-email HTML builder. Used both server-side (the send route)
// and to render the live preview in the Send modal, so the two are
// guaranteed identical. Table-based + inline styles only — flexbox doesn't
// render in Gmail/Outlook, which is what caused the preview↔inbox mismatch.

export interface InvoiceEmailParams {
  invNum:       string;
  studioName:   string;
  accent:       string;        // brand color (hex)
  logoUrl:      string | null;
  message:      string;
  issuedLabel:  string;
  dueLabel:     string | null;
  lineItems:    { description: string; quantity: number | string; rate: number; amount: number }[];
  total:        number;
  publicUrl:    string;
  printUrl:     string;
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Brand color at a given alpha — used for the meta-card background.
function hexToRgba(hex: string, a: number): string {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(155,163,122,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const TH = "font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9a9690;padding:0 0 8px;border-bottom:1px solid #eff0e7;";

export function buildInvoiceEmailHtml(p: InvoiceEmailParams): string {
  const metaBg = hexToRgba(p.accent, 0.12);
  const msgHtml = esc(p.message).replace(/\n/g, "<br>");

  const lineRows = p.lineItems.map((li) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#1f211a;">${esc(li.description)}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#9a9690;">${li.quantity}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#9a9690;">${fmtCurrency(li.rate)}</td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:13px;font-weight:500;color:#1f211a;">${fmtCurrency(li.amount)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f1;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08);">
        <!-- Header: brand color -->
        <tr><td style="background:${p.accent};padding:24px 32px;">
          ${p.logoUrl
            ? `<img src="${esc(p.logoUrl)}" alt="${esc(p.studioName)}" height="30" style="height:30px;max-width:220px;object-fit:contain;display:block;" />`
            : `<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${esc(p.studioName)}</span>`}
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <p style="font-size:13px;color:#6b6860;margin:0 0 20px;line-height:1.6;">${msgHtml}</p>

          <!-- Meta card: brand color at low opacity -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${metaBg};border-radius:8px;margin:0 0 22px;">
            <tr>
              <td style="padding:14px 18px;">
                <div style="font-size:10px;color:#9a9690;margin-bottom:3px;">Invoice #</div>
                <div style="font-size:13px;font-weight:600;color:#1f211a;">${esc(p.invNum)}</div>
              </td>
              <td align="center" style="padding:14px 18px;">
                <div style="font-size:10px;color:#9a9690;margin-bottom:3px;">Issued</div>
                <div style="font-size:13px;color:#1f211a;">${esc(p.issuedLabel)}</div>
              </td>
              ${p.dueLabel ? `<td align="right" style="padding:14px 18px;">
                <div style="font-size:10px;color:#9a9690;margin-bottom:3px;">Due</div>
                <div style="font-size:13px;color:#1f211a;">${esc(p.dueLabel)}</div>
              </td>` : ""}
            </tr>
          </table>

          <!-- Line items -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
            <tr>
              <th align="left"  style="${TH}">Description</th>
              <th align="right" style="${TH}">Qty</th>
              <th align="right" style="${TH}">Rate</th>
              <th align="right" style="${TH}">Amount</th>
            </tr>
            ${lineRows}
          </table>

          <!-- Total (right-aligned, table so it never collapses) -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
            <tr><td align="right">
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:260px;">
                <tr>
                  <td style="border-top:2px solid #1f211a;padding-top:12px;font-size:13px;font-weight:600;color:#1f211a;">Total due</td>
                  <td align="right" style="border-top:2px solid #1f211a;padding-top:12px;font-size:20px;font-weight:700;color:#1f211a;">${fmtCurrency(p.total)}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:10px;">
              <a href="${esc(p.publicUrl)}" style="background:${p.accent};color:#ffffff;padding:12px 26px;border-radius:8px;text-decoration:none;display:inline-block;font-size:13px;font-weight:600;">View &amp; pay invoice →</a>
            </td></tr>
            <tr><td align="center">
              <a href="${esc(p.printUrl)}" style="font-size:12px;color:#6b6860;text-decoration:underline;">Or download a PDF</a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9faf4;padding:14px 32px;border-top:1px solid #eff0e7;">
          <span style="font-size:11px;color:#9a9690;">Sent securely via Perennial</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
