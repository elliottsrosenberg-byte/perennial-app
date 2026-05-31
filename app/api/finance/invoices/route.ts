import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/types/database";

// POST /api/finance/invoices
//
// Body: {
//   number, client_contact_id?, client_organization_id?, project_id?,
//   issued_at, due_at?, payment_terms?, payment_method?, notes?,
//   time_entry_ids: string[],   // pulled from uninvoiced time
//   expense_ids:    string[],   // pulled from uninvoiced expenses
//   manual_lines?:  { description, quantity, rate }[],
// }
//
// Creates the invoice + all line items in one round trip. Time-derived
// lines use the project's billable rate (0 if unset). Expense-derived
// lines use qty=1, rate=amount. The DB write is not in a tx (Supabase
// REST doesn't expose pg tx) — if the line insert fails, the invoice
// is deleted to avoid a half-created draft.

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json() as {
    number:                 number;
    client_contact_id?:     string | null;
    client_organization_id?: string | null;
    project_id?:            string | null;
    issued_at:              string;
    due_at?:                string | null;
    payment_terms?:         string | null;
    payment_method?:        string | null;
    notes?:                 string | null;
    time_entry_ids?:        string[];
    expense_ids?:           string[];
    manual_lines?:          { description: string; quantity: number; rate: number }[];
  };

  if (!body.number || !body.issued_at) {
    return NextResponse.json({ error: "Missing number or issued_at" }, { status: 400 });
  }
  if (!body.client_contact_id && !body.client_organization_id) {
    return NextResponse.json({ error: "Pick a client (contact or organization)." }, { status: 400 });
  }

  // 1. Insert the invoice in draft.
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      user_id:                user.id,
      number:                 body.number,
      status:                 "draft",
      client_contact_id:      body.client_contact_id ?? null,
      client_organization_id: body.client_organization_id ?? null,
      project_id:             body.project_id ?? null,
      issued_at:              body.issued_at,
      due_at:                 body.due_at ?? null,
      payment_terms:          body.payment_terms ?? null,
      payment_method:         body.payment_method ?? null,
      notes:                  body.notes ?? null,
    })
    .select("id")
    .single();

  if (invErr || !inv) {
    return NextResponse.json({ error: invErr?.message ?? "Failed to create invoice" }, { status: 500 });
  }

  // 2. Build line item rows.
  const rows: Array<Record<string, unknown>> = [];

  // 2a. Look up project rate once if we have any time entries.
  let projectRate = 0;
  if ((body.time_entry_ids?.length ?? 0) > 0 && body.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("rate")
      .eq("id", body.project_id)
      .single();
    projectRate = Number(project?.rate ?? 0);
  }

  // 2b. Time entries → one row each.
  if (body.time_entry_ids && body.time_entry_ids.length > 0) {
    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, description, duration_minutes")
      .in("id", body.time_entry_ids)
      .eq("user_id", user.id);
    for (const e of entries ?? []) {
      const hours = parseFloat((e.duration_minutes / 60).toFixed(2));
      const amount = parseFloat((hours * projectRate).toFixed(2));
      rows.push({
        invoice_id:    inv.id,
        user_id:       user.id,
        description:   e.description || "Time entry",
        quantity:      hours,
        rate:          projectRate,
        amount,
        source:        "time",
        time_entry_id: e.id,
      });
    }
  }

  // 2c. Expenses → one row each, qty=1, rate=amount.
  if (body.expense_ids && body.expense_ids.length > 0) {
    const { data: exps } = await supabase
      .from("expenses")
      .select("id, description, amount")
      .in("id", body.expense_ids)
      .eq("user_id", user.id);
    for (const x of exps ?? []) {
      const amount = Number(x.amount);
      rows.push({
        invoice_id:  inv.id,
        user_id:     user.id,
        description: x.description || "Expense",
        quantity:    1,
        rate:        amount,
        amount,
        source:      "expense",
        expense_id:  x.id,
      });
    }
  }

  // 2d. Manual lines.
  for (const m of body.manual_lines ?? []) {
    if (!m.description?.trim()) continue;
    const qty = Number(m.quantity) || 1;
    const rate = Number(m.rate) || 0;
    rows.push({
      invoice_id:  inv.id,
      user_id:     user.id,
      description: m.description.trim(),
      quantity:    qty,
      rate,
      amount:      parseFloat((qty * rate).toFixed(2)),
      source:      "manual",
    });
  }

  // 3. Bulk insert lines. Roll back on failure.
  if (rows.length > 0) {
    const { error: lineErr } = await supabase.from("invoice_line_items").insert(rows);
    if (lineErr) {
      await supabase.from("invoices").delete().eq("id", inv.id);
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }
  }

  // 4. Re-fetch the invoice with all joins for the client.
  const { data: full } = await supabase
    .from("invoices")
    .select("*, client_contact:contacts(id, first_name, last_name, email, phone, location), client_organization:organizations(id, name, email, phone, location), project:projects(id, title, rate), line_items:invoice_line_items(*)")
    .eq("id", inv.id)
    .single();

  return NextResponse.json({ invoice: full as Invoice });
}
