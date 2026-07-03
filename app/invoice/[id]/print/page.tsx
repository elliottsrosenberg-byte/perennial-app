import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Invoice } from "@/types/database";
import { formatInvoiceNumber } from "@/lib/invoices/format";
import PrintTrigger from "./PrintTrigger";
import { fmtDateLong as fmtDate } from "@/lib/format/date";

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invoiceTotal(inv: Invoice) {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}

function clientName(inv: Invoice) {
  if (inv.client_contact) return `${inv.client_contact.first_name} ${inv.client_contact.last_name}`;
  if (inv.client_organization) return inv.client_organization.name;
  return "—";
}

export default async function InvoicePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { id } = await params;
  const preview = (await searchParams).preview === "1";
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoices")
    .select("*, client_contact:contacts(id, first_name, last_name, email, phone, location, organization_id), client_organization:organizations(id, name, email, phone, location), project:projects(id, title, rate), line_items:invoice_line_items(*), attachments:invoice_attachments(id, name, url)")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const inv = data as Invoice;
  const total = invoiceTotal(inv);

  // Client contact details — surfaced on the invoice only when the user
  // flipped "show client details" on. Pulled live from the contact/org.
  const cContact = inv.client_contact as { email?: string | null; phone?: string | null; location?: string | null } | null;
  const cOrg     = inv.client_organization as { email?: string | null; phone?: string | null; location?: string | null } | null;
  const cEmail   = cContact?.email ?? cOrg?.email ?? null;
  const cPhone   = cContact?.phone ?? cOrg?.phone ?? null;
  const cAddress = cContact?.location ?? cOrg?.location ?? null;
  const showClient = inv.show_client_info;
  const isOverdue = inv.status === "sent" && !!inv.due_at && inv.due_at < new Date().toISOString().split("T")[0];

  // Studio identity for the "From" header — pulled from profiles so the
  // printable invoice reflects the user's real studio (logo, address,
  // phone, EIN) rather than placeholder copy. All fields are optional;
  // missing values just collapse out of the layout.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("studio_name, display_name, location, website, address, phone, ein, logo_url, invoice_prefix, brand_color")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const displayNumber = formatInvoiceNumber(inv.number, profile?.invoice_prefix);
  const studioName    = profile?.studio_name?.trim() || profile?.display_name?.trim() || "Your studio";
  const studioEmail   = user?.email ?? "";
  const studioAddress = (profile?.address ?? "").trim();
  const studioPhone   = (profile?.phone ?? "").trim();
  const studioEin     = (profile?.ein ?? "").trim();
  const studioLogo    = profile?.logo_url ?? null;
  const brandColor    = profile?.brand_color?.trim() || null;
  // Fallback used only when address is blank — keeps the "From" column
  // from looking empty for users who haven't filled in the new fields.
  const fallbackLocation = profile?.location ?? null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Albert Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          background: white;
          color: #1f211a;
          font-size: 13px;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .page {
          max-width: 760px;
          margin: 0 auto;
          padding: 60px 64px;
          min-height: 100vh;
        }

        /* margin:0 suppresses the browser's own date/URL header & footer. */
        @page { size: auto; margin: 0; }

        /* Powered-by tag at the foot of the document — screen + PDF. */
        .pp-footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid #eff0e7; text-align: center; font-size: 11px; color: #9a9690; }

        @media print {
          .no-print { display: none !important; }
          .page { padding: 48px 48px 56px; }
          body { font-size: 12px; }
        }

        @media screen {
          body { background: #f5f4f1; }
          .page { background: white; box-shadow: 0 2px 40px rgba(0,0,0,0.08); min-height: 100vh; }
          .print-btn {
            position: fixed; top: 24px; right: 24px;
            background: #1f211a; color: white; border: none;
            padding: 8px 18px; border-radius: 6px; cursor: pointer;
            font-family: inherit; font-size: 12px; font-weight: 500;
          }
          .print-btn:hover { background: #3a3d35; }
          .back-btn {
            position: fixed; top: 24px; left: 24px; display: inline-flex; align-items: center; gap: 6px;
            background: white; color: #1f211a; border: 0.5px solid #e6e4dd;
            padding: 8px 14px; border-radius: 8px; cursor: pointer; text-decoration: none;
            font-family: inherit; font-size: 12px; font-weight: 500;
          }
          .back-btn:hover { background: #fbf9f4; }
        }

        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 52px; gap: 32px; }
        .studio-block { max-width: 360px; }
        .studio-logo { display: block; height: 96px; max-width: 240px; object-fit: contain; margin-bottom: 14px; }
        .studio-mark { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #1f211a; margin-bottom: 6px; }
        .studio-line { font-size: 11.5px; color: #6b6860; line-height: 1.55; white-space: pre-line; }
        .studio-ein { font-size: 10.5px; color: #9a9690; margin-top: 8px; letter-spacing: 0.01em; }
        .inv-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9690; text-align: right; margin-bottom: 4px; }
        .inv-number { font-size: 28px; font-weight: 700; color: #1f211a; text-align: right; letter-spacing: -0.02em; }

        .parties { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 32px; margin-bottom: 40px; }
        .party-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9690; margin-bottom: 6px; }
        .party-name { font-size: 14px; font-weight: 600; color: #1f211a; margin-bottom: 2px; }
        .party-sub { font-size: 12px; color: #6b6860; }
        .dates-row { display: flex; flex-direction: column; gap: 4px; }
        .date-item { display: flex; justify-content: space-between; font-size: 12px; }
        .date-key { color: #9a9690; }
        .date-val { font-weight: 500; color: #1f211a; }

        .divider { border: none; border-top: 1px solid #eff0e7; margin: 0 0 24px; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        thead tr { border-bottom: 1px solid #eff0e7; }
        thead th { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #9a9690; padding: 0 0 10px; text-align: left; }
        thead th.right { text-align: right; }
        tbody tr { border-bottom: 1px solid #f5f4f1; }
        tbody td { padding: 12px 0; font-size: 13px; color: #1f211a; vertical-align: top; }
        tbody td.right { text-align: right; }
        tbody td.grey { color: #9a9690; font-size: 11px; }
        .line-desc { font-weight: 500; }
        .line-source { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: #eff0e7; color: #9a9690; margin-left: 6px; vertical-align: middle; }

        .totals { margin-top: 8px; display: flex; justify-content: flex-end; }
        .totals-box { min-width: 240px; }
        .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f5f4f1; }
        .total-row.final { border-top: 2px solid #1f211a; border-bottom: none; padding-top: 12px; margin-top: 4px; }
        .total-row.final .total-label { font-weight: 700; font-size: 15px; }
        .total-row.final .total-val { font-weight: 700; font-size: 20px; }
        .total-label { color: #6b6860; }
        .total-val { font-weight: 500; color: #1f211a; }

        .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #eff0e7; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .footer-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #9a9690; margin-bottom: 6px; }
        .footer-val { font-size: 12px; color: #6b6860; line-height: 1.6; }

        .status-badge {
          display: inline-block; padding: 3px 10px; border-radius: 9999px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
          margin-left: 12px; vertical-align: middle;
        }
        .status-paid    { background: rgba(var(--color-green-deep-rgb),0.12);  color: #3d6b4f; }
        .status-sent    { background: rgba(37,99,171,0.1);   color: #2563ab; }
        .status-saved   { background: rgba(184,134,11,0.12); color: #b8860b; }
        .status-draft   { background: rgba(31,33,26,0.07);   color: #9a9690; }
        .status-overdue { background: rgba(220,62,13,0.1);   color: #dc3e0d; }
        .status-voided  { background: rgba(31,33,26,0.07);   color: #9a9690; }
      `}</style>

      {/* PrintTrigger is the client-side bit — it auto-fires window.print()
          on mount AND renders the on-screen Print button. We can't put the
          onClick handler on a button directly in this Server Component. */}
      <PrintTrigger preview={preview} />
      {!preview && (
        <a className="back-btn no-print" href={`/finance?tab=invoices&invoice=${id}`}>← Back to invoices</a>
      )}

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="studio-block">
            {studioLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="studio-logo" src={studioLogo} alt={`${studioName} logo`} />
            )}
            <div className="studio-mark" style={brandColor ? { color: brandColor } : undefined}>{studioName}</div>
            <div className="studio-line">
              {studioAddress || (fallbackLocation ?? "")}
              {studioPhone   ? `${(studioAddress || fallbackLocation) ? "\n" : ""}${studioPhone}` : ""}
              {studioEmail   ? `${(studioAddress || fallbackLocation || studioPhone) ? "\n" : ""}${studioEmail}` : ""}
            </div>
            {studioEin && <div className="studio-ein">EIN: {studioEin}</div>}
          </div>
          <div>
            <div className="inv-label">Invoice</div>
            <div className="inv-number">
              {displayNumber}
              <span className={`status-badge status-${isOverdue ? "overdue" : inv.status}`}>
                {isOverdue ? "Overdue"
                  : inv.status === "paid" ? "Paid"
                  : inv.status === "sent" ? "Sent"
                  : inv.status === "saved" ? "Saved"
                  : inv.status === "voided" ? "Void"
                  : "Draft"}
              </span>
            </div>
          </div>
        </div>

        {/* Parties + dates */}
        <div className="parties">
          <div>
            <div className="party-label">Bill to</div>
            <div className="party-name">{clientName(inv)}</div>
            {showClient && cEmail && <div className="party-sub">{cEmail}</div>}
            {showClient && cPhone && <div className="party-sub">{cPhone}</div>}
            {showClient && cAddress && <div className="party-sub" style={{ whiteSpace: "pre-line" }}>{cAddress}</div>}
            {inv.project?.title && <div className="party-sub" style={{ marginTop: 4 }}>Re: {inv.project.title}</div>}
          </div>
          <div />
          <div>
            <div className="dates-row">
              <div className="date-item"><span className="date-key">Issued</span><span className="date-val">{fmtDate(inv.issued_at)}</span></div>
              {inv.due_at && <div className="date-item"><span className="date-key">Due</span><span className="date-val" style={{ color: isOverdue ? "var(--color-red-orange)" : undefined }}>{fmtDate(inv.due_at)}</span></div>}
              {inv.payment_terms && <div className="date-item"><span className="date-key">Terms</span><span className="date-val">{inv.payment_terms}</span></div>}
              {inv.paid_at && <div className="date-item"><span className="date-key">Paid</span><span className="date-val" style={{ color: "var(--color-green-deep)" }}>{fmtDate(inv.paid_at)}</span></div>}
            </div>
          </div>
        </div>

        <hr className="divider" />

        {/* Line items */}
        <table>
          <thead>
            <tr>
              <th style={{ width: "50%" }}>Description</th>
              <th className="right" style={{ width: "12%" }}>Qty</th>
              <th className="right" style={{ width: "18%" }}>Rate</th>
              <th className="right" style={{ width: "20%" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(inv.line_items ?? []).length === 0 ? (
              <tr><td colSpan={4} style={{ color: "var(--color-text-tertiary)", fontStyle: "italic", paddingTop: 16 }}>No line items added.</td></tr>
            ) : (inv.line_items ?? []).map((li) => (
              <tr key={li.id}>
                <td>
                  <span className="line-desc">{li.description}</span>
                  {li.source !== "manual" && <span className="line-source">{li.source.toUpperCase()}</span>}
                </td>
                <td className="right grey">{li.quantity}</td>
                <td className="right grey">{fmtCurrency(li.rate)}</td>
                <td className="right">{fmtCurrency(Number(li.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="totals">
          <div className="totals-box">
            <div className="total-row final">
              <span className="total-label">Total due</span>
              <span className="total-val">{fmtCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        {(inv.payment_method || inv.notes) && (
          <div className="footer">
            {inv.payment_method && (
              <div>
                <div className="footer-label">Payment method</div>
                <div className="footer-val">{inv.payment_method}</div>
              </div>
            )}
            {inv.notes && (
              <div>
                <div className="footer-label">Notes</div>
                <div className="footer-val">{inv.notes}</div>
              </div>
            )}
          </div>
        )}

        {(inv.attachments ?? []).length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #eff0e7" }}>
            <div className="footer-label">Attachments</div>
            {(inv.attachments ?? []).map((a) => (
              <div key={a.id} className="footer-val">
                <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-green-deep)" }}>{a.name}</a>
              </div>
            ))}
          </div>
        )}

        <div className="pp-footer">Powered by Perennial</div>
      </div>
    </>
  );
}
