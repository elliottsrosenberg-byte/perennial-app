import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import type { Invoice } from "@/types/database";
import { formatInvoiceNumber, paymentMethodLabel } from "@/lib/invoices/format";
import PrintButton from "./PrintButton";
import PaymentSectionMount from "./PaymentSectionMount";

function fmtDate(ds: string | null) {
  if (!ds) return "—";
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invoiceTotal(inv: Invoice) {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}

function clientName(inv: Invoice) {
  if (inv.client_contact) return `${inv.client_contact.first_name} ${inv.client_contact.last_name}`;
  if (inv.client_organization) return inv.client_organization.name;
  return "Client";
}

export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  // preview=1 is the owner's in-app embed — no payment UI (they don't pay
  // their own invoice). The real client link omits it and can pay.
  const preview = (await searchParams).preview === "1";
  if (!token || token.length < 12) notFound();

  // Service-role client — the visitor has no Supabase session. RLS can't
  // gate "any row where public_token = $param" because Postgres RLS has
  // no access to request context like that, so we use the service role
  // and rely on the unguessable token as the auth.
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("invoices")
    .select("*, client_contact:contacts(id, first_name, last_name, email, phone, location), client_organization:organizations(id, name, email, phone, location), project:projects(id, title), line_items:invoice_line_items(*), attachments:invoice_attachments(id, name, url)")
    .eq("public_token", token)
    .maybeSingle();

  if (!data) notFound();
  const inv = data as Invoice;

  // Never expose pre-send invoices publicly — only sent / paid / voided are
  // shareable. (A draft or saved invoice with a leaked token should 404.)
  if (inv.status === "draft" || inv.status === "saved") notFound();

  const total = invoiceTotal(inv);
  const isOverdue = inv.status === "sent" && !!inv.due_at && inv.due_at < new Date().toISOString().split("T")[0];

  // Studio identity for the From block — same shape as the print page.
  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_name, display_name, location, address, phone, ein, logo_url, invoice_prefix, brand_color")
    .eq("user_id", inv.user_id)
    .maybeSingle();
  const invNum = formatInvoiceNumber(inv.number, profile?.invoice_prefix);
  const brandColor    = profile?.brand_color?.trim() || null;
  const studioName    = profile?.studio_name?.trim() || profile?.display_name?.trim() || "Studio";
  const studioAddress = (profile?.address ?? "").trim();
  const studioPhone   = (profile?.phone ?? "").trim();
  const studioEin     = (profile?.ein ?? "").trim();
  const studioLogo    = profile?.logo_url ?? null;
  const fallbackLocation = profile?.location ?? null;

  const cContact = inv.client_contact as { email?: string | null; phone?: string | null; location?: string | null } | null;
  const cOrg     = inv.client_organization as { email?: string | null; phone?: string | null; location?: string | null } | null;
  const clientEmail = cContact?.email ?? cOrg?.email ?? null;
  const clientPhone = cContact?.phone ?? cOrg?.phone ?? null;
  const clientAddress = cContact?.location ?? cOrg?.location ?? null;
  const showClient = inv.show_client_info;

  const payLabel = paymentMethodLabel(inv.payment_method_type, inv.payment_card_brand, inv.payment_card_last4);
  // Right-hand panel: a paid receipt always shows; the live payment form and
  // the void notice only show on the real client link (hidden in the owner's
  // in-app preview, where there's nothing to pay).
  const showAside = inv.status === "paid" || (!preview && (inv.status === "sent" || inv.status === "voided"));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body {
          font-family: 'Albert Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          background: #f5f4f1;
          color: #1f211a;
          font-size: 14px;
          line-height: 1.5;
          min-height: 100vh;
        }

        .pi-shell { min-height: 100vh; padding: 28px 24px 64px; }

        .pi-topbar {
          max-width: 1080px; margin: 0 auto 24px; display: flex; align-items: center;
          justify-content: flex-end; gap: 8px;
        }
        .pi-topbtn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
          font-size: 12px; font-weight: 500; color: #1f211a;
          background: white; border: 0.5px solid #e6e4dd; border-radius: 8px;
          text-decoration: none; cursor: pointer; font-family: inherit;
        }
        .pi-topbtn:hover { background: #fbf9f4; }

        .pi-grid {
          max-width: 1080px; margin: 0 auto;
          display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px;
          align-items: start;
        }
        .pi-grid.pi-solo { grid-template-columns: minmax(0, 1fr); max-width: 760px; }
        @media (max-width: 880px) {
          .pi-grid { grid-template-columns: 1fr; }
        }

        .pi-card {
          background: white; border-radius: 12px;
          box-shadow: 0 1px 3px rgba(31,33,26,0.04), 0 4px 24px rgba(31,33,26,0.06);
          overflow: hidden;
        }

        /* Left invoice card */
        .pi-paper { padding: 40px 44px; }
        .pi-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 28px; margin-bottom: 36px;
        }
        .pi-studio-logo {
          display: block; height: 80px; max-width: 220px; object-fit: contain; margin-bottom: 12px;
        }
        .pi-studio-name {
          font-size: 16px; font-weight: 700; letter-spacing: -0.01em;
          color: #1f211a; margin-bottom: 6px;
        }
        .pi-studio-line { font-size: 11.5px; color: #6b6860; line-height: 1.55; white-space: pre-line; }
        .pi-inv-label {
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; color: #9a9690; text-align: right;
        }
        .pi-inv-num {
          font-size: 26px; font-weight: 700; color: #1f211a;
          text-align: right; letter-spacing: -0.02em; margin-top: 2px;
        }
        .pi-status {
          display: inline-block; padding: 3px 9px; border-radius: 9999px;
          font-size: 9.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; margin-left: 10px; vertical-align: middle;
        }
        .pi-status-sent    { background: rgba(37,99,171,0.10);  color: #2563ab; }
        .pi-status-paid    { background: rgba(61,107,79,0.12);  color: #3d6b4f; }
        .pi-status-overdue { background: rgba(220,62,13,0.10);  color: #dc3e0d; }
        .pi-status-voided  { background: rgba(31,33,26,0.07);   color: #9a9690; }

        .pi-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 28px; }
        .pi-meta-label {
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; color: #9a9690; margin-bottom: 6px;
        }
        .pi-meta-name { font-size: 13.5px; font-weight: 600; color: #1f211a; margin-bottom: 2px; }
        .pi-meta-sub { font-size: 12px; color: #6b6860; }

        .pi-dates { display: flex; flex-direction: column; gap: 4px; }
        .pi-date-row { display: flex; justify-content: space-between; font-size: 12px; }
        .pi-date-key { color: #9a9690; }
        .pi-date-val { color: #1f211a; font-weight: 500; }

        .pi-divider { height: 1px; background: #eff0e7; margin: 24px 0 18px; border: 0; }

        .pi-items { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        .pi-items th {
          font-size: 9.5px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: #9a9690; text-align: left;
          padding: 0 0 10px; border-bottom: 1px solid #eff0e7;
        }
        .pi-items th.right { text-align: right; }
        .pi-items td { padding: 12px 0; font-size: 13px; color: #1f211a; border-bottom: 1px solid #f5f4f1; vertical-align: top; }
        .pi-items td.right { text-align: right; }
        .pi-items td.qty { color: #9a9690; }

        .pi-due-row {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-top: 16px; padding-top: 16px; border-top: 2px solid #1f211a;
        }
        .pi-due-label { font-size: 13px; font-weight: 700; color: #1f211a; }
        .pi-due-amt { font-size: 26px; font-weight: 700; color: #1f211a; letter-spacing: -0.02em; }

        /* Right: payment card — soft sage panel (on-brand, not orange) */
        .pi-pay {
          background: #eef1e6; border: 0.5px solid #dde2cf;
          padding: 28px 24px; border-radius: 12px;
          box-shadow: 0 1px 3px rgba(31,33,26,0.04), 0 4px 24px rgba(31,33,26,0.06);
        }
        .pi-pay-meta { font-size: 12px; color: #6b6860; margin-top: 6px; }
        .pi-pay-meta strong { color: #1f211a; font-weight: 600; }
        .pi-pay-head {
          display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
        }
        .pi-pay-title { font-size: 13px; font-weight: 700; color: #1f211a; }
        .pi-pay-amt {
          font-size: 11px; color: #6b6860; margin-bottom: 4px;
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em;
        }
        .pi-pay-amount {
          font-size: 28px; font-weight: 700; color: #1f211a;
          letter-spacing: -0.02em; margin-bottom: 18px;
        }

        .pi-foot {
          max-width: 1080px; margin: 24px auto 0; text-align: center;
          font-size: 11px; color: #9a9690;
        }
      `}</style>

      <div className="pi-shell">
        {/* Top action bar */}
        <div className="pi-topbar">
          <a
            className="pi-topbtn"
            href={`/finance/invoice/${inv.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
          >
            PDF
          </a>
          <PrintButton />
        </div>

        <div className={`pi-grid${showAside ? "" : " pi-solo"}`}>
          {/* Left: invoice paper */}
          <div className="pi-card">
            <div className="pi-paper">
              <div className="pi-header">
                <div>
                  {studioLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="pi-studio-logo" src={studioLogo} alt={`${studioName} logo`} />
                  )}
                  <div className="pi-studio-name" style={brandColor ? { color: brandColor } : undefined}>{studioName}</div>
                  <div className="pi-studio-line">
                    {[studioAddress || fallbackLocation, studioPhone].filter(Boolean).join("\n")}
                  </div>
                  {studioEin && <div className="pi-studio-line" style={{ marginTop: 6, color: "#9a9690", fontSize: 11 }}>EIN: {studioEin}</div>}
                </div>
                <div>
                  <div className="pi-inv-label">Invoice</div>
                  <div className="pi-inv-num">
                    {invNum}
                    <span className={`pi-status pi-status-${isOverdue ? "overdue" : inv.status}`}>
                      {isOverdue ? "Overdue" : inv.status === "paid" ? "Paid" : inv.status === "voided" ? "Void" : "Sent"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pi-meta">
                <div>
                  <div className="pi-meta-label">Bill to</div>
                  <div className="pi-meta-name">{clientName(inv)}</div>
                  {showClient && clientEmail && <div className="pi-meta-sub">{clientEmail}</div>}
                  {showClient && clientPhone && <div className="pi-meta-sub">{clientPhone}</div>}
                  {showClient && clientAddress && <div className="pi-meta-sub" style={{ whiteSpace: "pre-line" }}>{clientAddress}</div>}
                  {inv.project?.title && <div className="pi-meta-sub" style={{ marginTop: 4 }}>Re: {inv.project.title}</div>}
                </div>
                <div className="pi-dates">
                  <div className="pi-date-row"><span className="pi-date-key">Issued</span><span className="pi-date-val">{fmtDate(inv.issued_at)}</span></div>
                  {inv.due_at && (
                    <div className="pi-date-row">
                      <span className="pi-date-key">Due</span>
                      <span className="pi-date-val" style={{ color: isOverdue ? "#dc3e0d" : undefined }}>{fmtDate(inv.due_at)}</span>
                    </div>
                  )}
                  {inv.payment_terms && <div className="pi-date-row"><span className="pi-date-key">Terms</span><span className="pi-date-val">{inv.payment_terms}</span></div>}
                  {inv.paid_at && <div className="pi-date-row"><span className="pi-date-key">Paid</span><span className="pi-date-val" style={{ color: "#3d6b4f" }}>{fmtDate(inv.paid_at)}</span></div>}
                </div>
              </div>

              <hr className="pi-divider" />

              <table className="pi-items">
                <thead>
                  <tr>
                    <th style={{ width: "55%" }}>Description</th>
                    <th className="right" style={{ width: "10%" }}>Qty</th>
                    <th className="right" style={{ width: "15%" }}>Rate</th>
                    <th className="right" style={{ width: "20%" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(inv.line_items ?? []).length === 0 ? (
                    <tr><td colSpan={4} style={{ color: "#9a9690", fontStyle: "italic" }}>No line items.</td></tr>
                  ) : (inv.line_items ?? []).map((li) => (
                    <tr key={li.id}>
                      <td>{li.description}</td>
                      <td className="right qty">{li.quantity}</td>
                      <td className="right qty">{fmtCurrency(li.rate)}</td>
                      <td className="right">{fmtCurrency(Number(li.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pi-due-row">
                <span className="pi-due-label">
                  {inv.status === "paid" ? "Paid in full" : "Amount due"}
                </span>
                <span className="pi-due-amt">{fmtCurrency(total)}</span>
              </div>

              {inv.notes && (
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #eff0e7" }}>
                  <div className="pi-meta-label">Notes</div>
                  <p style={{ fontSize: 12, color: "#6b6860", lineHeight: 1.6 }}>{inv.notes}</p>
                </div>
              )}

              {(inv.attachments ?? []).length > 0 && (
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #eff0e7" }}>
                  <div className="pi-meta-label">Attachments</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {(inv.attachments ?? []).map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "#3d6b4f", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span aria-hidden>📎</span> {a.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: paid receipt / live payment / void notice */}
          {showAside && (
          <aside>
            {inv.status === "paid" ? (
              <div className="pi-pay">
                <div className="pi-pay-head">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3d6b4f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span className="pi-pay-title">Paid in full</span>
                </div>
                <div className="pi-pay-amt">Amount paid</div>
                <div className="pi-pay-amount">{fmtCurrency(total)}</div>
                {payLabel && <div className="pi-pay-meta">Paid with <strong>{payLabel}</strong></div>}
                {inv.paid_at && <div className="pi-pay-meta">on {fmtDate(inv.paid_at)}</div>}
              </div>
            ) : inv.status === "voided" ? (
              <div className="pi-pay" style={{ background: "#eff0e7", border: "0.5px solid #e6e4dd" }}>
                <div className="pi-pay-title" style={{ marginBottom: 6 }}>Invoice voided</div>
                <p style={{ fontSize: 12, color: "#6b6860", lineHeight: 1.6 }}>
                  This invoice has been voided and is no longer payable. Please contact the sender with any questions.
                </p>
              </div>
            ) : (
              <div className="pi-pay">
                <div className="pi-pay-head">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1f211a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span className="pi-pay-title">Secure payment</span>
                </div>
                <div className="pi-pay-amt">Amount due</div>
                <div className="pi-pay-amount">{fmtCurrency(total)}</div>
                <PaymentSectionMount invoiceId={inv.id} token={token} amount={total} status={inv.status} clientEmail={clientEmail} />
              </div>
            )}
          </aside>
          )}
        </div>

        <p className="pi-foot">Powered by Perennial</p>
      </div>
    </>
  );
}

