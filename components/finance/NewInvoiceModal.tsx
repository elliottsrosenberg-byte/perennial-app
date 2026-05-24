"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, Project, Contact, Organization, TimeEntry, Expense } from "@/types/database";
import { X, AlertTriangle, Clock, Receipt } from "lucide-react";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";

interface Props {
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  timeEntries: TimeEntry[];
  expenses: Expense[];
  invoices: Invoice[];
  nextNumber: number;
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

type SearchResult = (Contact & { _type: "contact" }) | (Organization & { _type: "organization" });

function fmtMoney(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtHours(mins: number) {
  return `${(mins / 60).toFixed(1)}h`;
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function NewInvoiceModal({
  projects, timeEntries, expenses, invoices, nextNumber, onClose, onCreated,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [search, setSearch]                   = useState("");
  const [searchResults, setSearchResults]     = useState<SearchResult[]>([]);
  const [searching, setSearching]             = useState(false);
  const [showSearch, setShowSearch]           = useState(false);
  const [clientContact, setClientContact]           = useState<Contact | null>(null);
  const [clientOrganization, setClientOrganization] = useState<Organization | null>(null);
  const [projectId, setProjectId]             = useState("");
  const [issuedAt, setIssuedAt]               = useState(today);
  const [dueAt, setDueAt]                     = useState(addDays(today, 14));
  const [paymentTerms, setPaymentTerms]       = useState("Net 14");
  const [paymentMethod, setPaymentMethod]     = useState("");
  const [notes, setNotes]                     = useState("");
  const [excludedTimeIds, setExcludedTimeIds]       = useState<Set<string>>(new Set());
  const [excludedExpenseIds, setExcludedExpenseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // Reset exclusions when project changes — fresh ready-to-bill panel.
  useEffect(() => {
    setExcludedTimeIds(new Set());
    setExcludedExpenseIds(new Set());
  }, [projectId]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => runSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function runSearch(q: string) {
    setSearching(true);
    const supabase = createClient();
    const [{ data: contacts }, { data: organizations }] = await Promise.all([
      supabase.from("contacts").select("*").eq("archived", false).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
      supabase.from("organizations").select("*").ilike("name", `%${q}%`).limit(4),
    ]);
    setSearchResults([
      ...(contacts ?? []).map((c: Contact) => ({ ...c, _type: "contact" as const })),
      ...(organizations ?? []).map((c: Organization) => ({ ...c, _type: "organization" as const })),
    ]);
    setSearching(false);
  }

  function selectClient(item: SearchResult) {
    if (item._type === "contact") {
      setClientContact(item);
      setClientOrganization(null);
    } else {
      setClientOrganization(item);
      setClientContact(null);
    }
    setSearch(""); setSearchResults([]); setShowSearch(false);
  }

  function clearClient() { setClientContact(null); setClientOrganization(null); }

  const clientLabel = clientContact
    ? `${clientContact.first_name} ${clientContact.last_name}`
    : clientOrganization?.name ?? null;

  // Build the "already invoiced" set from every existing invoice's line items
  // (any status). Once a time entry or expense has been attached to a line,
  // it shouldn't show up as billable again.
  const { invoicedTimeIds, invoicedExpenseIds } = useMemo(() => {
    const t = new Set<string>(), e = new Set<string>();
    for (const inv of invoices) {
      for (const li of inv.line_items ?? []) {
        if (li.time_entry_id) t.add(li.time_entry_id);
        if (li.expense_id)    e.add(li.expense_id);
      }
    }
    return { invoicedTimeIds: t, invoicedExpenseIds: e };
  }, [invoices]);

  const selectedProject = projects.find((p) => p.id === projectId);
  const projectRate = Number(selectedProject?.rate ?? 0);
  const rateMissing = !!projectId && projectRate === 0;

  // Uninvoiced billable time for the selected project.
  const uninvoicedTime = useMemo(() => {
    if (!projectId) return [];
    return timeEntries.filter((e) =>
      e.project_id === projectId &&
      e.billable &&
      !invoicedTimeIds.has(e.id)
    );
  }, [projectId, timeEntries, invoicedTimeIds]);

  const uninvoicedExpenses = useMemo(() => {
    if (!projectId) return [];
    return expenses.filter((x) =>
      x.project_id === projectId &&
      !invoicedExpenseIds.has(x.id)
    );
  }, [projectId, expenses, invoicedExpenseIds]);

  const includedTime = uninvoicedTime.filter((e) => !excludedTimeIds.has(e.id));
  const includedExpenses = uninvoicedExpenses.filter((x) => !excludedExpenseIds.has(x.id));

  const timeTotalMinutes = includedTime.reduce((s, e) => s + e.duration_minutes, 0);
  const timeTotalDollars = (timeTotalMinutes / 60) * projectRate;
  const expenseTotal = includedExpenses.reduce((s, x) => s + Number(x.amount), 0);
  const grandTotal = timeTotalDollars + expenseTotal;

  function toggleTimeExclusion(id: string) {
    setExcludedTimeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleExpenseExclusion(id: string) {
    setExcludedExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientLabel) { setError("Select a client."); return; }
    setLoading(true); setError(null);

    const res = await fetch("/api/finance/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: nextNumber,
        client_contact_id:      clientContact?.id ?? null,
        client_organization_id: clientOrganization?.id ?? null,
        project_id:             projectId || null,
        issued_at:              issuedAt,
        due_at:                 dueAt || null,
        payment_terms:          paymentTerms || null,
        payment_method:         paymentMethod || null,
        notes:                  notes.trim() || null,
        time_entry_ids:         includedTime.map((e) => e.id),
        expense_ids:            includedExpenses.map((x) => x.id),
      }),
    });
    const json = await res.json() as { invoice?: Invoice; error?: string };
    if (!res.ok || !json.invoice) {
      setError(json.error ?? "Failed to create invoice.");
      setLoading(false);
      return;
    }
    onCreated(json.invoice);
    onClose();
  }

  // ── styled bits ─────────────────────────────────────────────────────────────

  const hasReady = projectId && (uninvoicedTime.length > 0 || uninvoicedExpenses.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>New invoice</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>#{nextNumber}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Client */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Client *</label>
            {clientLabel ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
                <span className="flex-1 text-[13px]" style={{ color: "var(--color-charcoal)" }}>{clientLabel}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(31,33,26,0.07)", color: "var(--color-grey)" }}>
                  {clientContact ? "Contact" : "Organization"}
                </span>
                <button type="button" onClick={clearClient} style={{ color: "var(--color-grey)" }}><X size={12} /></button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="Search contacts and organizations…"
                  className={inputCls} style={inputStyle} />
                {showSearch && search.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl z-20 overflow-hidden"
                    style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
                    {searching ? (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>Searching…</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-[12px] text-center py-3" style={{ color: "var(--color-grey)" }}>No results</p>
                    ) : searchResults.map((item, i) => {
                      const label = item._type === "contact" ? `${item.first_name} ${item.last_name}` : item.name;
                      return (
                        <button key={i} type="button" onClick={() => selectClient(item)}
                          className="w-full text-left px-4 py-2.5 flex items-center gap-2.5"
                          style={{ borderBottom: i < searchResults.length - 1 ? "0.5px solid var(--color-border)" : "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <span className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ background: item._type === "contact" ? "var(--color-cream)" : "rgba(37,99,171,0.1)", color: item._type === "contact" ? "#6b6860" : "#2563ab" }}>
                            {item._type === "contact" ? "Contact" : "Organization"}
                          </span>
                          <span className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Project */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Project</label>
            <Select
              value={projectId}
              onChange={setProjectId}
              options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.title }))]}
              placeholder="None"
            />
          </div>

          {/* Ready to bill — appears once a project is selected */}
          {projectId && (
            hasReady ? (
              <ReadyToBillPanel
                rateMissing={rateMissing}
                projectRate={projectRate}
                uninvoicedTime={uninvoicedTime}
                uninvoicedExpenses={uninvoicedExpenses}
                excludedTimeIds={excludedTimeIds}
                excludedExpenseIds={excludedExpenseIds}
                toggleTime={toggleTimeExclusion}
                toggleExpense={toggleExpenseExclusion}
                timeTotalMinutes={timeTotalMinutes}
                timeTotalDollars={timeTotalDollars}
                expenseTotal={expenseTotal}
                grandTotal={grandTotal}
                includedTimeCount={includedTime.length}
                includedExpenseCount={includedExpenses.length}
              />
            ) : (
              <div className="rounded-xl p-3 text-[11px]"
                style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}>
                No uninvoiced time or expenses for this project — you can add manual line items after the invoice is created.
              </div>
            )
          )}

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Issue date</label>
              <DatePicker
                value={issuedAt ? new Date(issuedAt + "T12:00:00") : null}
                onChange={(d) => {
                  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                  setIssuedAt(`${y}-${m}-${day}`);
                }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Due date</label>
              <DatePicker
                value={dueAt ? new Date(dueAt + "T12:00:00") : null}
                onChange={(d) => {
                  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                  setDueAt(`${y}-${m}-${day}`);
                }}
                placeholder="Pick a due date…"
              />
            </div>
          </div>

          {/* Terms + method */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Payment terms</label>
              <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Net 14" className={inputCls} style={inputStyle} />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Payment method</label>
              <input type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Bank transfer" className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for this invoice…" rows={2}
              className={inputCls} style={{ ...inputStyle, resize: "none" }} />
          </div>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        <div className="flex items-center justify-between gap-2 px-5 py-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <div className="text-[11px]" style={{ color: "var(--color-grey)" }}>
            {hasReady && (
              <>
                <span style={{ color: "var(--color-charcoal)", fontWeight: 600 }}>{fmtMoney(grandTotal)}</span>
                <span> on this draft</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-[13px] rounded-lg"
              style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>Cancel</button>
            <button onClick={handleSubmit as unknown as React.MouseEventHandler}
              disabled={loading || !clientLabel}
              className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
              style={{ background: "var(--color-charcoal)" }}>
              {loading ? "Creating…" : "Create invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ready-to-bill panel ─────────────────────────────────────────────────────

function ReadyToBillPanel({
  rateMissing, projectRate,
  uninvoicedTime, uninvoicedExpenses,
  excludedTimeIds, excludedExpenseIds,
  toggleTime, toggleExpense,
  timeTotalMinutes, timeTotalDollars, expenseTotal, grandTotal,
  includedTimeCount, includedExpenseCount,
}: {
  rateMissing: boolean;
  projectRate: number;
  uninvoicedTime: TimeEntry[];
  uninvoicedExpenses: Expense[];
  excludedTimeIds: Set<string>;
  excludedExpenseIds: Set<string>;
  toggleTime: (id: string) => void;
  toggleExpense: (id: string) => void;
  timeTotalMinutes: number;
  timeTotalDollars: number;
  expenseTotal: number;
  grandTotal: number;
  includedTimeCount: number;
  includedExpenseCount: number;
}) {
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
        <span className="text-[12px] font-semibold" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Ready to bill</span>
        <span className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>
          {(grandTotal).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
        </span>
      </div>

      {/* Rate warning */}
      {rateMissing && uninvoicedTime.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2"
          style={{ background: "rgba(220,153,13,0.08)", borderBottom: "0.5px solid var(--color-border)" }}>
          <AlertTriangle size={11} style={{ color: "var(--color-dark-orange)", marginTop: 2, flexShrink: 0 }} />
          <p className="text-[11px]" style={{ color: "var(--color-dark-orange)" }}>
            Set a rate on this project to bill time. Time lines will use $0 for now.
          </p>
        </div>
      )}

      {/* Time section */}
      {uninvoicedTime.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-4 py-2"
            style={{ borderBottom: "0.5px solid var(--color-border)", background: "rgba(31,33,26,0.03)" }}>
            <Clock size={11} style={{ color: "var(--color-sage)" }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Time</span>
            <span className="text-[11px] ml-auto tabular-nums" style={{ color: "var(--color-grey)" }}>
              {fmtHours(timeTotalMinutes)} · {includedTimeCount}/{uninvoicedTime.length}
            </span>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-charcoal)" }}>
              {fmtMoney(timeTotalDollars)}
            </span>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {uninvoicedTime.map((e) => {
              const excluded = excludedTimeIds.has(e.id);
              const dollars = (e.duration_minutes / 60) * projectRate;
              return (
                <div key={e.id} className="flex items-center gap-2 px-4 py-1.5"
                  style={{ borderBottom: "0.5px solid var(--color-border)", opacity: excluded ? 0.42 : 1 }}>
                  <span className="text-[12px] flex-1 truncate" style={{ color: "var(--color-charcoal)", textDecoration: excluded ? "line-through" : "none" }}>
                    {e.description || "Time entry"}
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--color-grey)" }}>{fmtHours(e.duration_minutes)}</span>
                  <span className="text-[11px] font-medium tabular-nums w-14 text-right" style={{ color: "var(--color-charcoal)" }}>{fmtMoney(dollars)}</span>
                  <button type="button" onClick={() => toggleTime(e.id)}
                    className="w-5 h-5 flex items-center justify-center rounded"
                    style={{ color: "var(--color-grey)" }}
                    aria-label={excluded ? "Include" : "Exclude"}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--color-cream)")}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}>
                    {excluded ? <span className="text-[11px]">+</span> : <X size={11} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expenses section */}
      {uninvoicedExpenses.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-4 py-2"
            style={{ borderTop: uninvoicedTime.length > 0 ? "0.5px solid var(--color-border)" : "none",
                     borderBottom: "0.5px solid var(--color-border)", background: "rgba(31,33,26,0.03)" }}>
            <Receipt size={11} style={{ color: "var(--color-dark-orange)" }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Expenses</span>
            <span className="text-[11px] ml-auto tabular-nums" style={{ color: "var(--color-grey)" }}>
              {includedExpenseCount}/{uninvoicedExpenses.length} items
            </span>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--color-charcoal)" }}>
              {fmtMoney(expenseTotal)}
            </span>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {uninvoicedExpenses.map((x) => {
              const excluded = excludedExpenseIds.has(x.id);
              return (
                <div key={x.id} className="flex items-center gap-2 px-4 py-1.5"
                  style={{ borderBottom: "0.5px solid var(--color-border)", opacity: excluded ? 0.42 : 1 }}>
                  <span className="text-[12px] flex-1 truncate" style={{ color: "var(--color-charcoal)", textDecoration: excluded ? "line-through" : "none" }}>
                    {x.description || "Expense"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                    style={{ background: "rgba(31,33,26,0.06)", color: "var(--color-grey)" }}>
                    {x.category}
                  </span>
                  <span className="text-[11px] font-medium tabular-nums w-14 text-right" style={{ color: "var(--color-charcoal)" }}>{fmtMoney(Number(x.amount))}</span>
                  <button type="button" onClick={() => toggleExpense(x.id)}
                    className="w-5 h-5 flex items-center justify-center rounded"
                    style={{ color: "var(--color-grey)" }}
                    aria-label={excluded ? "Include" : "Exclude"}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--color-cream)")}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}>
                    {excluded ? <span className="text-[11px]">+</span> : <X size={11} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer total */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
        <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>Draft total</span>
        <span className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--color-charcoal)" }}>
          {fmtMoney(grandTotal)}
        </span>
      </div>
    </div>
  );
}

