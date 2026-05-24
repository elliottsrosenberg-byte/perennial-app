// GET /api/finance/banking/queue
//
// Returns the three slices the Banking review queue UI needs:
//
//   to_review        — debits with no linked expense, not personal
//   invoice_activity — credits in the last 60 days, with suggested
//                      invoice matches when an outstanding invoice's
//                      total comes within $1 of the deposit
//   hidden_count     — count of personal + already-handled rows so
//                      the UI can label the Hidden toggle
//
// The "suggested_invoices" payload on each invoice_activity row is
// optional — the UI lets the user pick from any outstanding invoice
// regardless.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface InvoiceLineItemLite { amount: number }
interface InvoiceLite {
  id: string;
  number: number;
  status: "draft" | "sent" | "paid";
  client_contact: { id: string; first_name: string | null; last_name: string | null } | null;
  client_organization: { id: string; name: string } | null;
  line_items: InvoiceLineItemLite[] | null;
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const MATCH_TOLERANCE = 1.00; // dollars

function invoiceTotal(inv: InvoiceLite): number {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}
function invoiceClientLabel(inv: InvoiceLite): string {
  if (inv.client_organization?.name) return inv.client_organization.name;
  const c = inv.client_contact;
  if (c) return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Client";
  return "Client";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Pull a recent slice of transactions joined with the parent account.
  // The 200-row cap keeps the payload bounded for users with very
  // active accounts; the review queue almost always fits well inside.
  const { data: rows, error } = await supabase
    .from("bank_transactions")
    .select("*, bank_account:bank_accounts(name, institution, last_four, type, subtype)")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = rows ?? [];

  // Outstanding invoices (anything not paid). We need totals to match
  // against credit amounts, so we pull line_items too.
  const { data: invRows } = await supabase
    .from("invoices")
    .select("id, number, status, client_contact:contacts(id, first_name, last_name), client_organization:organizations(id, name), line_items:invoice_line_items(amount)")
    .eq("user_id", user.id)
    .neq("status", "paid");
  const outstandingInvoices = (invRows as unknown as InvoiceLite[]) ?? [];

  // The current PostgREST select() can return arrays for joined rows
  // when there's no FK constraint declared — normalise to single object
  // so the downstream consumers stay simple.
  for (const inv of outstandingInvoices) {
    if (Array.isArray(inv.client_contact)) inv.client_contact = inv.client_contact[0] ?? null;
    if (Array.isArray(inv.client_organization)) inv.client_organization = inv.client_organization[0] ?? null;
  }

  // Same normalisation for the transactions' bank_account join.
  for (const tx of all) {
    if (Array.isArray(tx.bank_account)) (tx as { bank_account: unknown }).bank_account = tx.bank_account[0] ?? null;
  }

  const now = Date.now();
  const cutoff = now - SIXTY_DAYS_MS;

  const to_review: typeof all        = [];
  const invoice_activity: unknown[]  = [];
  let hidden_count = 0;

  for (const tx of all) {
    const isHandled = !!tx.linked_expense_id || !!tx.matched_invoice_id || tx.is_personal;
    const isCredit  = tx.type === "credit";
    const isDebit   = tx.type === "debit";

    if (isHandled) hidden_count += 1;

    // To-review: needs-action debits.
    if (isDebit && !tx.linked_expense_id && !tx.is_personal) {
      to_review.push(tx);
    }

    // Invoice activity: credits in last 60 days. Includes matched
    // ones (so the UI can show the "Mark paid" → "Matched" transition
    // without an extra request) UNLESS personal.
    if (isCredit && !tx.is_personal) {
      const txTime = new Date(tx.date + "T12:00:00").getTime();
      if (txTime >= cutoff) {
        // For unmatched, attach any outstanding invoice whose total is
        // within tolerance. Multiple matches → UI shows a picker.
        let suggested: { id: string; number: number; client: string; total: number }[] = [];
        if (!tx.matched_invoice_id) {
          const amt = Math.abs(Number(tx.amount));
          suggested = outstandingInvoices
            .map((inv) => ({ inv, total: invoiceTotal(inv) }))
            .filter(({ total }) => Math.abs(total - amt) <= MATCH_TOLERANCE)
            .map(({ inv, total }) => ({
              id:     inv.id,
              number: inv.number,
              client: invoiceClientLabel(inv),
              total,
            }));
        }
        invoice_activity.push({ ...tx, suggested_invoices: suggested });
      }
    }
  }

  // Biggest first inside to_review.
  to_review.sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));

  // Outstanding invoices payload — the UI needs the full list for the
  // manual "Match to invoice…" picker when no suggestion fires.
  const outstanding_payload = outstandingInvoices.map((inv) => ({
    id:     inv.id,
    number: inv.number,
    status: inv.status,
    client: invoiceClientLabel(inv),
    total:  invoiceTotal(inv),
  }));

  return NextResponse.json({
    to_review,
    invoice_activity,
    hidden_count,
    outstanding_invoices: outstanding_payload,
  });
}
