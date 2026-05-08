import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Invoice } from "@/types/database";
import PrintTrigger from "./PrintTrigger";

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
  if (inv.client_company) return inv.client_company.name;
  return "—";
}

function clientEmail(inv: Invoice) {
  return (inv.client_contact as { email?: string | null } | null)?.email ?? null;
}

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoices")
    .select("*, client_contact:contacts(id, first_name, last_name, email, company_id), client_company:companies(id, name), project:projects(id, title, rate), line_items:invoice_line_items(*)")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const inv = data as Invoice;
  const total = invoiceTotal(inv);
  const isOverdue = inv.status === "sent" && !!inv.due_at && inv.due_at < new Date().toISOString().split("T")[0];

  return (
    <>
      <PrintTrigger />
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

        /* Hide print button when printing */
        @media print {
          .no-print { display: none !important; }
          .page { padding: 48px; }
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
        }

        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 52px; }
        .studio-mark { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #1f211a; margin-bottom: 4px; }
        .studio-sub { font-size: 11px; color: #9a9690; }
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
        .status-paid    { background: rgba(61,107,79,0.12);  color: #3d6b4f; }
        .status-sent    { background: rgba(37,99,171,0.1);   color: #2563ab; }
        .status-draft   { background: rgba(31,33,26,0.07);   color: #9a9690; }
        .status-overdue { background: rgba(220,62,13,0.1);   color: #dc3e0d; }
      `}</style>

      {/* Screen-only print button */}
      <button className="print-btn no-print" onClick={() => window.print()}>Print / Save PDF</button>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            <div className="studio-mark">Perennial</div>
            <div className="studio-sub">Your studio · your@email.com</div>
          </div>
          <div>
            <div className="inv-label">Invoice</div>
            <div className="inv-number">
              #{String(inv.number).padStart(3, "0")}
              <span className={`status-badge status-${isOverdue ? "overdue" : inv.status}`}>
                {isOverdue ? "Overdue" : inv.status === "paid" ? "Paid" : inv.status === "sent" ? "Sent" : "Draft"}
              </span>
            </div>
          </div>
        </div>

        {/* Parties + dates */}
        <div className="parties">
          <div>
            <div className="party-label">Bill to</div>
            <div className="party-name">{clientName(inv)}</div>
            {clientEmail(inv) && <div className="party-sub">{clientEmail(inv)}</div>}
            {inv.project?.title && <div className="party-sub" style={{ marginTop: 4 }}>Re: {inv.project.title}</div>}
          </div>
          <div />
          <div>
            <div className="dates-row">
              <div className="date-item"><span className="date-key">Issued</span><span className="date-val">{fmtDate(inv.issued_at)}</span></div>
              {inv.due_at && <div className="date-item"><span className="date-key">Due</span><span className="date-val" style={{ color: isOverdue ? "#dc3e0d" : undefined }}>{fmtDate(inv.due_at)}</span></div>}
              {inv.payment_terms && <div className="date-item"><span className="date-key">Terms</span><span className="date-val">{inv.payment_terms}</span></div>}
              {inv.paid_at && <div className="date-item"><span className="date-key">Paid</span><span className="date-val" style={{ color: "#3d6b4f" }}>{fmtDate(inv.paid_at)}</span></div>}
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
              <tr><td colSpan={4} style={{ color: "#9a9690", fontStyle: "italic", paddingTop: 16 }}>No line items added.</td></tr>
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
      </div>
    </>
  );
}
