"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceLineItem, TimeEntry, Project } from "@/types/database";

interface Props {
  invoices: Invoice[];
  timeEntries: TimeEntry[];
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onInvoiceUpdated: (inv: Invoice) => void;
}

type Filter = "all" | "overdue" | "sent" | "draft" | "paid";

function isOverdue(inv: Invoice) {
  return inv.status === "sent" && !!inv.due_at && inv.due_at < new Date().toISOString().split("T")[0];
}

function invoiceTotal(inv: Invoice) {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}

function clientName(inv: Invoice) {
  if (inv.client_contact) return `${inv.client_contact.first_name} ${inv.client_contact.last_name}`;
  if (inv.client_company) return inv.client_company.name;
  return "—";
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(ds: string | null) {
  if (!ds) return "—";
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:   { bg: "rgba(31,33,26,0.07)", color: "var(--color-grey)",       label: "Draft"   },
  sent:    { bg: "rgba(37,99,171,0.1)", color: "#2563ab",                  label: "Sent"    },
  paid:    { bg: "rgba(61,107,79,0.1)", color: "var(--color-sage)",        label: "Paid"    },
  overdue: { bg: "rgba(220,62,13,0.1)", color: "var(--color-red-orange)",  label: "Overdue" },
};

export default function InvoicesTab({ invoices, timeEntries, projects, onInvoiceUpdated }: Props) {
  const [filter, setFilter]                   = useState<Filter>("all");
  const [selectedId, setSelectedId]           = useState<string | null>(invoices[0]?.id ?? null);
  const [addingLine, setAddingLine]           = useState(false);
  const [lineDesc, setLineDesc]               = useState("");
  const [lineQty, setLineQty]                 = useState("1");
  const [lineRate, setLineRate]               = useState("");
  const [savingLine, setSavingLine]           = useState(false);
  const [savingStatus, setSavingStatus]       = useState(false);

  const selectedInvoice = invoices.find((i) => i.id === selectedId) ?? null;

  const filteredInvoices = useMemo(() => invoices.filter((inv) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(inv);
    if (filter === "sent")    return inv.status === "sent" && !isOverdue(inv);
    return inv.status === filter;
  }), [invoices, filter]);

  const outstanding   = invoices.filter((i) => i.status === "sent").reduce((s, i) => s + invoiceTotal(i), 0);
  const collectedYtd  = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + invoiceTotal(i), 0);
  const draftTotal    = invoices.filter((i) => i.status === "draft").reduce((s, i) => s + invoiceTotal(i), 0);

  const overdueDays = selectedInvoice?.due_at
    ? Math.floor((Date.now() - new Date(selectedInvoice.due_at).getTime()) / 86400000)
    : 0;

  async function updateStatus(inv: Invoice, status: "sent" | "paid") {
    setSavingStatus(true);
    const supabase = createClient();
    const patch: Record<string, unknown> = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("invoices")
      .update(patch)
      .eq("id", inv.id)
      .select("*, client_contact:contacts(id, first_name, last_name), client_company:companies(id, name), project:projects(id, title, rate), line_items:invoice_line_items(*)")
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
    setSavingStatus(false);
  }

  async function addLineItem() {
    if (!selectedInvoice || !lineDesc.trim()) return;
    setSavingLine(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingLine(false); return; }
    const qty = parseFloat(lineQty) || 1;
    const rate = parseFloat(lineRate) || 0;
    const amount = qty * rate;
    const { data } = await supabase
      .from("invoice_line_items")
      .insert({ invoice_id: selectedInvoice.id, user_id: user.id, description: lineDesc.trim(), quantity: qty, rate, amount, source: "manual" })
      .select("*")
      .single();
    if (data) {
      const updated = { ...selectedInvoice, line_items: [...(selectedInvoice.line_items ?? []), data as InvoiceLineItem] };
      onInvoiceUpdated(updated as Invoice);
    }
    setLineDesc(""); setLineQty("1"); setLineRate(""); setAddingLine(false); setSavingLine(false);
  }

  async function pullFromProjectTime() {
    if (!selectedInvoice?.project_id) return;
    const projectTimeEntries = timeEntries.filter(
      (e) => e.project_id === selectedInvoice.project_id && e.billable
    );
    if (projectTimeEntries.length === 0) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const project = projects.find((p) => p.id === selectedInvoice.project_id);
    const rate = project?.rate ?? 0;
    const rows = projectTimeEntries.map((e) => ({
      invoice_id: selectedInvoice.id,
      user_id: user.id,
      description: e.description || "Time entry",
      quantity: parseFloat((e.duration_minutes / 60).toFixed(2)),
      rate,
      amount: parseFloat(((e.duration_minutes / 60) * rate).toFixed(2)),
      source: "time" as const,
      time_entry_id: e.id,
    }));
    const { data } = await supabase.from("invoice_line_items").insert(rows).select("*");
    if (data) {
      const updated = { ...selectedInvoice, line_items: [...(selectedInvoice.line_items ?? []), ...(data as InvoiceLineItem[])] };
      onInvoiceUpdated(updated as Invoice);
    }
  }

  async function deleteLineItem(lineId: string) {
    if (!selectedInvoice) return;
    const supabase = createClient();
    await supabase.from("invoice_line_items").delete().eq("id", lineId);
    const updated = { ...selectedInvoice, line_items: (selectedInvoice.line_items ?? []).filter((li) => li.id !== lineId) };
    onInvoiceUpdated(updated as Invoice);
  }

  const filterCounts: Record<Filter, number> = {
    all: invoices.length,
    overdue: invoices.filter(isOverdue).length,
    sent: invoices.filter((i) => i.status === "sent" && !isOverdue(i)).length,
    draft: invoices.filter((i) => i.status === "draft").length,
    paid: invoices.filter((i) => i.status === "paid").length,
  };

  const inputCls = "px-2 py-1.5 text-[12px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

  return (
    <div className="flex gap-0 flex-1 overflow-hidden p-5">
      {/* Invoice list pane */}
      <div className="flex flex-col overflow-hidden rounded-xl shrink-0"
        style={{ width: 296, background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <p className="text-[13px] font-semibold mb-2" style={{ color: "var(--color-charcoal)" }}>All invoices</p>
          <div className="flex flex-wrap gap-1.5">
            {(["all","overdue","sent","draft","paid"] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className="px-2.5 py-1 rounded-full text-[11px] capitalize transition-colors"
                style={{
                  background: filter === f ? (f === "overdue" ? "rgba(220,62,13,0.1)" : "var(--color-charcoal)") : "rgba(31,33,26,0.06)",
                  color: filter === f ? (f === "overdue" ? "var(--color-red-orange)" : "white") : "var(--color-grey)",
                  border: f === "overdue" && filterCounts.overdue > 0 ? "0.5px solid rgba(220,62,13,0.2)" : "none",
                }}>
                {f}{filterCounts[f] > 0 ? ` ${filterCounts[f]}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredInvoices.map((inv) => {
            const overdue = isOverdue(inv);
            const statusKey = overdue ? "overdue" : inv.status;
            const st = STATUS_STYLE[statusKey];
            const total = invoiceTotal(inv);
            const isSelected = inv.id === selectedId;
            return (
              <div key={inv.id}
                className="px-4 py-3 cursor-pointer"
                style={{
                  borderBottom: "0.5px solid var(--color-border)",
                  background: isSelected ? "rgba(37,99,171,0.07)" : "transparent",
                  borderLeft: isSelected ? "2px solid #2563ab" : "2px solid transparent",
                }}
                onClick={() => setSelectedId(inv.id)}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--color-grey)" }}>#{inv.number}</span>
                  <span className="text-[12px] font-semibold flex-1 truncate" style={{ color: "var(--color-charcoal)" }}>{clientName(inv)}</span>
                  <span className="text-[13px] font-semibold tabular-nums"
                    style={{ color: overdue ? "var(--color-red-orange)" : inv.status === "paid" ? "var(--color-sage)" : "var(--color-charcoal)" }}>
                    {fmtCurrency(total)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] flex-1 truncate" style={{ color: "var(--color-grey)" }}>{inv.project?.title ?? ""}</span>
                  {inv.due_at && <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>Due {fmtDate(inv.due_at)}</span>}
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>
                    {st.label.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
          {filteredInvoices.length === 0 && (
            <p className="px-4 py-6 text-[12px] text-center" style={{ color: "var(--color-grey)" }}>No invoices.</p>
          )}
        </div>

        {/* Footer totals */}
        <div className="flex gap-4 px-4 py-3 shrink-0" style={{ borderTop: "0.5px solid var(--color-border)", background: "rgba(31,33,26,0.04)" }}>
          {[
            { label: "Outstanding", value: fmtCurrency(outstanding), color: outstanding > 0 ? "#b8860b" : "var(--color-charcoal)" },
            { label: "Collected YTD", value: fmtCurrency(collectedYtd), color: "var(--color-charcoal)" },
            { label: "Draft", value: fmtCurrency(draftTotal), color: "var(--color-charcoal)" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>{item.label}</span>
              <span className="text-[12px] font-semibold tabular-nums" style={{ color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice detail pane */}
      {selectedInvoice ? (
        <div className="flex-1 flex flex-col overflow-hidden ml-4">
          {/* Detail header */}
          <div className="flex items-center gap-3 px-5 py-3 rounded-t-xl shrink-0"
            style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", borderBottom: "none" }}>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold truncate" style={{ color: "var(--color-charcoal)" }}>
                {clientName(selectedInvoice)} — #{selectedInvoice.number}
              </p>
              <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                {selectedInvoice.project?.title ?? ""}{selectedInvoice.issued_at ? ` · Issued ${fmtDate(selectedInvoice.issued_at)}` : ""}
              </p>
            </div>
            {(() => {
              const overdue = isOverdue(selectedInvoice);
              const statusKey = overdue ? "overdue" : selectedInvoice.status;
              const st = STATUS_STYLE[statusKey];
              return (
                <span className="text-[10px] font-bold px-3 py-1 rounded-full shrink-0"
                  style={{ background: st.bg, color: st.color }}>
                  {overdue ? `${overdueDays}d overdue` : st.label.toUpperCase()}
                </span>
              );
            })()}
            {selectedInvoice.status === "draft" && (
              <button onClick={() => updateStatus(selectedInvoice, "sent")} disabled={savingStatus}
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
                style={{ background: "#2563ab" }}>
                {savingStatus ? "…" : "Mark as sent →"}
              </button>
            )}
            {selectedInvoice.status === "sent" && (
              <button onClick={() => updateStatus(selectedInvoice, "paid")} disabled={savingStatus}
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
                style={{ background: "var(--color-sage)" }}>
                {savingStatus ? "…" : "Mark as paid →"}
              </button>
            )}
          </div>

          {/* Detail body */}
          <div className="flex-1 overflow-y-auto rounded-b-xl"
            style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", borderTop: "0.5px solid var(--color-border)" }}>
            <div className="flex gap-5 p-5 items-start">
              {/* Main column */}
              <div className="flex-1 flex flex-col gap-4 min-w-0">
                {/* Meta */}
                <div className="rounded-xl p-4 flex flex-col gap-2"
                  style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
                  {[
                    { label: "Client", value: clientName(selectedInvoice) },
                    { label: "Project", value: selectedInvoice.project?.title ?? "—" },
                    { label: "Issued", value: fmtDate(selectedInvoice.issued_at) },
                    { label: "Due", value: fmtDate(selectedInvoice.due_at) },
                  ].map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between">
                      <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>{row.label}</span>
                      <span className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{row.value}</span>
                    </div>
                  ))}
                  <div className="my-1" style={{ borderTop: "0.5px solid var(--color-border)" }} />
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>Total</span>
                    <span className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--color-charcoal)" }}>
                      {fmtCurrency(invoiceTotal(selectedInvoice))}
                    </span>
                  </div>
                </div>

                {/* Line items */}
                <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
                  <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
                    <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Line items</span>
                    {selectedInvoice.project_id && (
                      <button onClick={pullFromProjectTime}
                        className="text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                        style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        ↓ Pull from project time
                      </button>
                    )}
                  </div>
                  {/* Table header */}
                  <div className="grid px-4 py-2 text-[9px] font-semibold uppercase tracking-wider"
                    style={{ gridTemplateColumns: "1fr 72px 72px 72px 24px", background: "rgba(31,33,26,0.04)", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}>
                    <div>Description</div><div className="text-right">Qty</div>
                    <div className="text-right">Rate</div><div className="text-right">Amount</div><div />
                  </div>
                  {(selectedInvoice.line_items ?? []).map((li) => (
                    <div key={li.id} className="group grid items-center px-4 py-2.5"
                      style={{ gridTemplateColumns: "1fr 72px 72px 72px 24px", borderBottom: "0.5px solid var(--color-border)" }}>
                      <div>
                        <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>{li.description}</span>
                        {li.source !== "manual" && (
                          <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: li.source === "time" ? "rgba(61,107,79,0.1)" : "rgba(184,134,11,0.1)", color: li.source === "time" ? "var(--color-sage)" : "#b8860b" }}>
                            {li.source.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>{li.quantity}</span>
                      <span className="text-[12px] tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>{fmtCurrency(li.rate)}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>{fmtCurrency(Number(li.amount))}</span>
                      <button onClick={() => deleteLineItem(li.id)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] w-5 h-5 flex items-center justify-center rounded transition-opacity"
                        style={{ color: "var(--color-red-orange)" }}>✕</button>
                    </div>
                  ))}
                  {/* Total row */}
                  {(selectedInvoice.line_items ?? []).length > 0 && (
                    <div className="grid px-4 py-2.5"
                      style={{ gridTemplateColumns: "1fr 72px 72px 72px 24px", background: "rgba(31,33,26,0.04)", borderTop: "0.5px solid var(--color-border)" }}>
                      <span className="text-[12px] font-semibold col-span-3" style={{ color: "var(--color-charcoal)" }}>Total</span>
                      <span className="text-[12px] font-semibold tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>
                        {fmtCurrency(invoiceTotal(selectedInvoice))}
                      </span>
                      <div />
                    </div>
                  )}
                  {/* Add line item */}
                  {addingLine ? (
                    <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "0.5px solid var(--color-border)" }}>
                      <input value={lineDesc} onChange={(e) => setLineDesc(e.target.value)}
                        placeholder="Description" className={`${inputCls} flex-1`} style={inputStyle} />
                      <input value={lineQty} onChange={(e) => setLineQty(e.target.value)}
                        placeholder="Qty" className={`${inputCls} w-14`} style={inputStyle} type="number" min="0" step="0.1" />
                      <input value={lineRate} onChange={(e) => setLineRate(e.target.value)}
                        placeholder="Rate" className={`${inputCls} w-20`} style={inputStyle} type="number" min="0" />
                      <button onClick={addLineItem} disabled={savingLine || !lineDesc.trim()}
                        className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
                        style={{ background: "var(--color-charcoal)" }}>Add</button>
                      <button onClick={() => setAddingLine(false)}
                        className="px-2 py-1.5 text-[12px] rounded-lg"
                        style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingLine(true)}
                      className="w-full flex items-center gap-1.5 px-4 py-2.5 text-[11px] transition-colors"
                      style={{ color: "var(--color-grey)", borderTop: "0.5px solid var(--color-border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-off-white)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      + Add line item
                    </button>
                  )}
                </div>
              </div>

              {/* Right sidebar */}
              <div className="flex flex-col gap-4 shrink-0" style={{ width: 188 }}>
                {/* Payment */}
                <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)" }}>
                  <div className="px-4 py-2.5 text-[11px] font-semibold" style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)", color: "var(--color-charcoal)" }}>Payment</div>
                  <div className="p-4 flex flex-col gap-2.5">
                    {[
                      { label: "Method", value: selectedInvoice.payment_method ?? "—" },
                      { label: "Terms",  value: selectedInvoice.payment_terms  ?? "—" },
                      { label: "Due",    value: fmtDate(selectedInvoice.due_at), color: isOverdue(selectedInvoice) ? "var(--color-red-orange)" : undefined },
                      ...(selectedInvoice.status === "paid" ? [{ label: "Paid", value: fmtDate(selectedInvoice.paid_at) }] : []),
                    ].map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between text-[11px]">
                        <span style={{ color: "var(--color-grey)" }}>{row.label}</span>
                        <span style={{ color: row.color ?? "var(--color-charcoal)", fontWeight: 500 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                {selectedInvoice.notes && (
                  <div className="rounded-xl p-4" style={{ border: "0.5px solid var(--color-border)" }}>
                    <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--color-charcoal)" }}>Notes</p>
                    <p className="text-[11px]" style={{ color: "var(--color-grey)", lineHeight: 1.5 }}>{selectedInvoice.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center ml-4">
          <p className="text-[13px]" style={{ color: "var(--color-grey)" }}>Select an invoice</p>
        </div>
      )}
    </div>
  );
}
