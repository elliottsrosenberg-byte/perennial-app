"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceLineItem, TimeEntry, Expense, Project, Contact, Organization } from "@/types/database";
import EmptyState from "@/components/ui/EmptyState";
import Menu from "@/components/ui/Menu";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";
import { formatInvoiceNumber } from "@/lib/invoices/format";
import { X, Download, Send, FileText, MoreHorizontal, Plus, Clock, Receipt, CheckCircle2, Sparkles, ChevronDown, Link2, Check, Pencil, Search } from "lucide-react";

// Canonical join used whenever we re-fetch a single invoice after a write,
// so the detail pane always has the client's contact details + project + lines.
const INVOICE_SELECT =
  "*, client_contact:contacts(id, first_name, last_name, email, phone, location), client_organization:organizations(id, name, email, phone, location), project:projects(id, title, rate), line_items:invoice_line_items(*)";

interface Props {
  invoices: Invoice[];
  timeEntries: TimeEntry[];
  expenses: Expense[];
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  invoicePrefix: string | null;
  onInvoiceUpdated: (inv: Invoice) => void;
  onInvoiceDeleted: (invoiceId: string) => void;
  onInvoiceSent: (invoiceId: string) => void;
  onNewInvoice: () => void;
}

// ── Send Invoice Modal ────────────────────────────────────────────────────────

function SendInvoiceModal({ invoice, invoicePrefix, onClose, onSent }: {
  invoice: Invoice;
  invoicePrefix: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const clientEmail = (invoice.client_contact as { email?: string | null } | null)?.email ?? "";
  const [to,      setTo]      = useState(clientEmail);
  const [message, setMessage] = useState(`Hi,\n\nPlease find your invoice attached. Let me know if you have any questions.\n\nThank you for your business.`);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [sent,    setSent]    = useState(false);

  async function handleSend() {
    if (!to.trim()) { setError("Enter a recipient email."); return; }
    setLoading(true); setError(null);
    const res = await fetch("/api/finance/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoice.id, to: to.trim(), message }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok || json.error) {
      setError(json.error ?? "Failed to send.");
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
    setTimeout(() => { onSent(); onClose(); }, 1200);
  }

  const inputCls = "w-full px-3 py-2 text-[12px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Send invoice</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>{formatInvoiceNumber(invoice.number, invoicePrefix)} · {clientName(invoice)}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <X size={14} />
          </button>
        </div>
        {sent ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[22px] mb-2">✓</p>
            <p className="text-[13px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Invoice sent!</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--color-grey)" }}>Delivered to {to}</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>To *</label>
              <input type="email" value={to} onChange={e => setTo(e.target.value)}
                placeholder="client@email.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                className={inputCls} style={{ ...inputStyle, resize: "none" }} />
            </div>
            {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
          </div>
        )}
        {!sent && (
          <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: "0.5px solid var(--color-border)" }}>
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-[12px] rounded-lg"
              style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              Cancel
            </button>
            <button onClick={handleSend} disabled={loading || !to.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
              style={{ background: "var(--color-sage)" }}>
              <Send size={11} />
              {loading ? "Sending…" : "Send invoice"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
  if (inv.client_organization) return inv.client_organization.name;
  return "—";
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(ds: string | null) {
  if (!ds) return "—";
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtHours(mins: number) { return `${(mins / 60).toFixed(1)}h`; }

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:   { bg: "var(--color-grey)",            color: "white", label: "Draft"   },
  sent:    { bg: "#2563ab",                       color: "white", label: "Sent"    },
  paid:    { bg: "var(--color-sage)",             color: "white", label: "Paid"    },
  overdue: { bg: "var(--color-red-orange)",       color: "white", label: "Overdue" },
};

// Shared grid template for the line-items table (description | qty | rate | amount | actions).
const LINE_GRID = "1fr 70px 80px 90px 46px";

const SOURCE_STYLE: Record<string, { bg: string; color: string }> = {
  time:    { bg: "rgba(61,107,79,0.10)",  color: "var(--color-sage)" },
  expense: { bg: "rgba(220,153,13,0.10)", color: "var(--color-dark-orange)" },
  manual:  { bg: "rgba(31,33,26,0.06)",   color: "var(--color-grey)" },
};

export default function InvoicesTab({
  invoices, timeEntries, expenses, projects, invoicePrefix,
  onInvoiceUpdated, onInvoiceDeleted, onInvoiceSent, onNewInvoice,
}: Props) {
  const [filter, setFilter]                   = useState<Filter>("all");
  const [selectedId, setSelectedId]           = useState<string | null>(invoices[0]?.id ?? null);
  const [addingLine, setAddingLine]           = useState(false);
  const [lineDesc, setLineDesc]               = useState("");
  const [lineQty, setLineQty]                 = useState("1");
  const [lineRate, setLineRate]               = useState("");
  const [savingLine, setSavingLine]           = useState(false);
  const [savingStatus, setSavingStatus]       = useState(false);
  const [showSendModal, setShowSendModal]     = useState(false);
  const [editingNotes, setEditingNotes]       = useState(false);
  const [notesdraft, setNotesDraft]           = useState("");
  const [savingNotes, setSavingNotes]         = useState(false);
  const [menuOpen, setMenuOpen]               = useState(false);
  const [pullerOpen, setPullerOpen]           = useState(false);
  const [confirmDelete, setConfirmDelete]     = useState(false);
  const [editingNumber, setEditingNumber]     = useState(false);
  const [numberDraft, setNumberDraft]         = useState("");
  const [savingNumber, setSavingNumber]       = useState(false);
  const [numberError, setNumberError]         = useState<string | null>(null);
  // Inline line-item editing (draft mode).
  const [editingLineId, setEditingLineId]     = useState<string | null>(null);
  const [editDesc, setEditDesc]               = useState("");
  const [editQty, setEditQty]                 = useState("");
  const [editRate, setEditRate]               = useState("");
  // Client chooser — lazily loads the contact list the first time it opens.
  const [clientChooserOpen, setClientChooserOpen] = useState(false);
  const [allContacts, setAllContacts]         = useState<Contact[]>([]);
  const [contactsLoaded, setContactsLoaded]   = useState(false);
  const clientChooserRef = useRef<HTMLDivElement>(null);
  // Persist banner dismissal for the session so it doesn't re-appear every
  // tab switch. sessionStorage is intentional — the next browser tab can
  // remind them again.
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("perennial:invoices:bannerDismissed") === "1";
  });
  function dismissBanner() {
    setBannerDismissed(true);
    try { window.sessionStorage.setItem("perennial:invoices:bannerDismissed", "1"); } catch {}
  }
  const menuRef = useRef<HTMLDivElement>(null);
  const pullerRef = useRef<HTMLDivElement>(null);

  const selectedInvoice = invoices.find((i) => i.id === selectedId) ?? null;
  const isDraft = selectedInvoice?.status === "draft";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (pullerRef.current && !pullerRef.current.contains(e.target as Node)) setPullerOpen(false);
      if (clientChooserRef.current && !clientChooserRef.current.contains(e.target as Node)) setClientChooserOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Drop any in-progress edits when the selection changes so editors never
  // carry one invoice's draft over to another.
  useEffect(() => {
    setEditingNumber(false); setNumberError(null);
    setEditingLineId(null); setClientChooserOpen(false);
  }, [selectedId]);

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
    ? Math.floor((Date.now() - new Date(selectedInvoice.due_at + "T12:00:00").getTime()) / 86400000)
    : 0;

  // Build the "already invoiced" set so we can compute "ready to bill" for
  // (a) the dismissable banner and (b) the "Pull more" affordance.
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

  // Count of projects with uninvoiced time / expense (for the banner).
  const readyProjectCount = useMemo(() => {
    const set = new Set<string>();
    for (const e of timeEntries) {
      if (e.project_id && e.billable && !invoicedTimeIds.has(e.id)) set.add(e.project_id);
    }
    for (const x of expenses) {
      if (x.project_id && !invoicedExpenseIds.has(x.id)) set.add(x.project_id);
    }
    return set.size;
  }, [timeEntries, expenses, invoicedTimeIds, invoicedExpenseIds]);

  // Additional uninvoiced rows for the selected invoice's project that aren't
  // yet on this invoice — surfaced via the "+ Pull more" picker.
  const pullableTime = useMemo(() => {
    if (!selectedInvoice?.project_id) return [];
    return timeEntries.filter((e) =>
      e.project_id === selectedInvoice.project_id &&
      e.billable &&
      !invoicedTimeIds.has(e.id)
    );
  }, [selectedInvoice?.project_id, timeEntries, invoicedTimeIds]);

  const pullableExpenses = useMemo(() => {
    if (!selectedInvoice?.project_id) return [];
    return expenses.filter((x) =>
      x.project_id === selectedInvoice.project_id &&
      !invoicedExpenseIds.has(x.id)
    );
  }, [selectedInvoice?.project_id, expenses, invoicedExpenseIds]);

  async function updateStatus(inv: Invoice, status: "draft" | "sent" | "paid") {
    setSavingStatus(true);
    const supabase = createClient();
    const patch: Record<string, unknown> = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString().split("T")[0];
    if (status !== "paid") patch.paid_at = null;
    const { data } = await supabase
      .from("invoices")
      .update(patch)
      .eq("id", inv.id)
      .select(INVOICE_SELECT)
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
    setSavingStatus(false);
  }

  function startEditNumber() {
    if (!selectedInvoice) return;
    setNumberDraft(String(selectedInvoice.number));
    setNumberError(null);
    setEditingNumber(true);
  }
  function cancelEditNumber() {
    setEditingNumber(false);
    setNumberError(null);
  }
  async function saveNumber() {
    if (!selectedInvoice) return;
    const n = parseInt(numberDraft, 10);
    if (!Number.isInteger(n) || n <= 0) { setNumberError("Enter a positive whole number."); return; }
    if (n === selectedInvoice.number) { cancelEditNumber(); return; }
    setSavingNumber(true); setNumberError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("invoices")
      .update({ number: n })
      .eq("id", selectedInvoice.id)
      .select(INVOICE_SELECT)
      .single();
    setSavingNumber(false);
    if (error) {
      // 23505 = unique_violation — another invoice already uses this number.
      setNumberError(error.code === "23505" ? "That number is already in use." : error.message);
      return;
    }
    if (data) onInvoiceUpdated(data as Invoice);
    setEditingNumber(false);
  }

  // ── Client / project / client-detail editing (draft mode) ──────────────────

  async function loadContacts() {
    if (contactsLoaded) return;
    const supabase = createClient();
    const { data } = await supabase.from("contacts")
      .select("*").eq("archived", false).order("first_name");
    setAllContacts((data as Contact[]) ?? []);
    setContactsLoaded(true);
  }

  async function changeClient(contact: Contact) {
    if (!selectedInvoice) return;
    setClientChooserOpen(false);
    const supabase = createClient();
    const { data } = await supabase.from("invoices")
      .update({ client_contact_id: contact.id, client_organization_id: null })
      .eq("id", selectedInvoice.id)
      .select(INVOICE_SELECT)
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
  }

  async function changeProject(projectId: string) {
    if (!selectedInvoice) return;
    const supabase = createClient();
    const { data } = await supabase.from("invoices")
      .update({ project_id: projectId || null })
      .eq("id", selectedInvoice.id)
      .select(INVOICE_SELECT)
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
  }

  // Write a client-detail field back to the underlying contact/organization
  // record, then reflect the change on the invoice's joined client locally.
  async function saveClientField(field: "email" | "phone" | "location", value: string) {
    if (!selectedInvoice) return;
    const v = value.trim() || null;
    const supabase = createClient();
    if (selectedInvoice.client_contact) {
      await supabase.from("contacts").update({ [field]: v }).eq("id", selectedInvoice.client_contact.id);
      onInvoiceUpdated({ ...selectedInvoice, client_contact: { ...selectedInvoice.client_contact, [field]: v } as Contact });
    } else if (selectedInvoice.client_organization) {
      await supabase.from("organizations").update({ [field]: v }).eq("id", selectedInvoice.client_organization.id);
      onInvoiceUpdated({ ...selectedInvoice, client_organization: { ...selectedInvoice.client_organization, [field]: v } as Organization });
    }
  }

  async function toggleShowClientInfo() {
    if (!selectedInvoice) return;
    const supabase = createClient();
    const next = !selectedInvoice.show_client_info;
    const { data } = await supabase.from("invoices")
      .update({ show_client_info: next })
      .eq("id", selectedInvoice.id)
      .select(INVOICE_SELECT)
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
  }

  function startEditLine(li: InvoiceLineItem) {
    setEditingLineId(li.id);
    setEditDesc(li.description);
    setEditQty(String(li.quantity));
    setEditRate(String(li.rate));
  }
  async function saveEditLine() {
    if (!selectedInvoice || !editingLineId) return;
    const qty = parseFloat(editQty) || 0;
    const rate = parseFloat(editRate) || 0;
    const amount = parseFloat((qty * rate).toFixed(2));
    const supabase = createClient();
    const { data } = await supabase.from("invoice_line_items")
      .update({ description: editDesc.trim() || "—", quantity: qty, rate, amount })
      .eq("id", editingLineId)
      .select("*")
      .single();
    if (data) {
      const updated = { ...selectedInvoice, line_items: (selectedInvoice.line_items ?? []).map((li) => li.id === editingLineId ? data as InvoiceLineItem : li) };
      onInvoiceUpdated(updated as Invoice);
    }
    setEditingLineId(null);
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

  async function pullTimeEntries(ids: string[]) {
    if (!selectedInvoice || ids.length === 0) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const project = projects.find((p) => p.id === selectedInvoice.project_id);
    const rate = project?.rate ?? 0;
    const picked = pullableTime.filter((e) => ids.includes(e.id));
    const rows = picked.map((e) => ({
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

  async function pullExpenses(ids: string[]) {
    if (!selectedInvoice || ids.length === 0) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const picked = pullableExpenses.filter((x) => ids.includes(x.id));
    const rows = picked.map((x) => ({
      invoice_id: selectedInvoice.id,
      user_id: user.id,
      description: x.description || "Expense",
      quantity: 1,
      rate: Number(x.amount),
      amount: Number(x.amount),
      source: "expense" as const,
      expense_id: x.id,
    }));
    const { data } = await supabase.from("invoice_line_items").insert(rows).select("*");
    if (data) {
      const updated = { ...selectedInvoice, line_items: [...(selectedInvoice.line_items ?? []), ...(data as InvoiceLineItem[])] };
      onInvoiceUpdated(updated as Invoice);
    }
  }

  async function saveNotes() {
    if (!selectedInvoice) return;
    setSavingNotes(true);
    const supabase = createClient();
    const { data } = await supabase.from("invoices")
      .update({ notes: notesdraft.trim() || null })
      .eq("id", selectedInvoice.id)
      .select(INVOICE_SELECT)
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
    setSavingNotes(false);
    setEditingNotes(false);
  }

  async function deleteLineItem(lineId: string) {
    if (!selectedInvoice) return;
    const supabase = createClient();
    await supabase.from("invoice_line_items").delete().eq("id", lineId);
    const updated = { ...selectedInvoice, line_items: (selectedInvoice.line_items ?? []).filter((li) => li.id !== lineId) };
    onInvoiceUpdated(updated as Invoice);
  }

  async function deleteInvoice() {
    if (!selectedInvoice) return;
    const supabase = createClient();
    // Line items have FK to invoices; if the FK isn't ON DELETE CASCADE we
    // explicitly drop them first to keep the API honest.
    await supabase.from("invoice_line_items").delete().eq("invoice_id", selectedInvoice.id);
    await supabase.from("invoices").delete().eq("id", selectedInvoice.id);
    onInvoiceDeleted(selectedInvoice.id);
    setSelectedId(invoices.find((i) => i.id !== selectedInvoice.id)?.id ?? null);
    setConfirmDelete(false);
  }

  const filterCounts: Record<Filter, number> = {
    all: invoices.length,
    overdue: invoices.filter(isOverdue).length,
    sent: invoices.filter((i) => i.status === "sent" && !isOverdue(i)).length,
    draft: invoices.filter((i) => i.status === "draft").length,
    paid: invoices.filter((i) => i.status === "paid").length,
  };

  const inputCls = "px-2 py-1.5 text-[12px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

  const cardShadow = "0 2px 8px rgba(31,33,26,0.04)";
  const detailBg   = "var(--color-cream)";   // a real step darker than the list pane

  return (
    <div className="flex gap-0 flex-1 overflow-hidden p-5">
      {/* ─── Invoice list pane ──────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden rounded-xl shrink-0"
        style={{ width: 296, background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
        <div className="px-4 py-3 shrink-0"
          style={{ borderBottom: "0.5px solid var(--color-border)",
                   background: "var(--color-warm-white)", position: "sticky", top: 0, zIndex: 1 }}>
          <p className="text-[13px] font-semibold mb-2"
            style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>All invoices</p>
          <div className="flex flex-wrap gap-1.5">
            {(["all","overdue","sent","draft","paid"] as Filter[]).map((f) => {
              const active = filter === f;
              const overdueFilter = f === "overdue";
              return (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className="px-2.5 py-1 rounded-full text-[11px] capitalize transition-colors"
                  style={{
                    background: active
                      ? (overdueFilter ? "var(--color-red-orange)" : "var(--color-charcoal)")
                      : "rgba(31,33,26,0.06)",
                    color: active ? "white" : "var(--color-grey)",
                    border: !active && overdueFilter && filterCounts.overdue > 0 ? "0.5px solid rgba(220,62,13,0.25)" : "none",
                    fontWeight: active ? 600 : 400,
                  }}>
                  {f}{filterCounts[f] > 0 ? ` ${filterCounts[f]}` : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Uninvoiced ready banner — quiet sage, dismissable */}
          {!bannerDismissed && readyProjectCount > 0 && invoices.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: "rgba(155,163,122,0.10)", borderBottom: "0.5px solid var(--color-border)" }}>
              <Sparkles size={11} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
              <span className="text-[11px] flex-1" style={{ color: "var(--color-charcoal)" }}>
                {readyProjectCount} {readyProjectCount === 1 ? "project has" : "projects have"} uninvoiced work
              </span>
              <button onClick={onNewInvoice}
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-sage)" }}>
                Create
              </button>
              <button onClick={dismissBanner}
                className="w-4 h-4 flex items-center justify-center" style={{ color: "var(--color-grey)" }}>
                <X size={10} />
              </button>
            </div>
          )}

          {filteredInvoices.map((inv) => {
            const overdue = isOverdue(inv);
            const statusKey = overdue ? "overdue" : inv.status;
            const st = STATUS_STYLE[statusKey];
            const total = invoiceTotal(inv);
            const isSelected = inv.id === selectedId;
            // Left stripe carries status color so it's legible even when the
            // row isn't selected. Selection widens the stripe (3px → reads as
            // active without changing the row's chrome).
            const stripeColor = overdue
              ? "var(--color-red-orange)"
              : inv.status === "paid" ? "var(--color-sage)"
              : inv.status === "sent" ? "#2563ab"
              : "var(--color-border)";
            return (
              <div key={inv.id}
                className="px-4 py-3 cursor-pointer"
                style={{
                  borderBottom: "0.5px solid var(--color-border)",
                  // Sage tint reads clearly on both the light and dark
                  // surfaces (a fixed dark overlay was invisible in dark mode).
                  background: isSelected ? "rgba(155,163,122,0.18)" : "transparent",
                  // Widen the stripe when selected; for drafts (faint border
                  // stripe) promote it to sage so selection is unmistakable.
                  borderLeft: `${isSelected ? 3 : 2}px solid ${isSelected && stripeColor === "var(--color-border)" ? "var(--color-sage)" : stripeColor}`,
                }}
                onClick={() => setSelectedId(inv.id)}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--color-grey)" }}>{formatInvoiceNumber(inv.number, invoicePrefix)}</span>
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
          {filteredInvoices.length === 0 && invoices.length === 0 && (
            <div style={{ padding: "12px 0" }}>
              <EmptyState
                icon={<FileText size={24} strokeWidth={1.5} color="var(--color-sage)" />}
                heading="Create your first invoice"
                body="Perennial invoices are linked to clients and projects. Log time and expenses first, then pull them into an invoice with one click."
                action={{ label: "New invoice", onClick: onNewInvoice }}
                tips={[
                  "Start by logging time against a project with a client rate — that time auto-populates into new invoices.",
                  "Invoices move through Draft → Sent → Paid. Mark as paid when you receive payment.",
                  "Track outstanding and overdue invoices from this list — statuses update as you send and mark paid.",
                ]}
              />
            </div>
          )}
          {filteredInvoices.length === 0 && invoices.length > 0 && (
            <p className="px-4 py-6 text-[12px] text-center" style={{ color: "var(--color-grey)" }}>No invoices match this filter.</p>
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

      {/* ─── Invoice detail pane ─────────────────────────────────────── */}
      {selectedInvoice ? (
        <div className="flex-1 flex flex-col overflow-hidden ml-4 rounded-xl"
          style={{ background: detailBg, border: "0.5px solid var(--color-border)" }}>

          {/* Detail header */}
          <div className="flex items-center gap-3 px-5 py-3 shrink-0"
            style={{ borderBottom: "0.5px solid var(--color-border)", background: detailBg }}>
            <div className="flex-1 min-w-0">
              {editingNumber ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[15px] font-semibold"
                    style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                    {clientName(selectedInvoice)}
                  </span>
                  <span className="text-[15px]" style={{ color: "var(--color-grey)", fontWeight: 400 }}>
                    · {(invoicePrefix ?? "").trim() || "#"}
                  </span>
                  <input
                    autoFocus
                    value={numberDraft}
                    onChange={(e) => setNumberDraft(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")  { e.preventDefault(); saveNumber(); }
                      if (e.key === "Escape") { e.preventDefault(); cancelEditNumber(); }
                    }}
                    inputMode="numeric"
                    className="w-16 px-1.5 py-0.5 text-[14px] rounded focus:outline-none tabular-nums"
                    style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" }}
                  />
                  <button type="button" onClick={saveNumber} disabled={savingNumber || !numberDraft}
                    className="w-6 h-6 flex items-center justify-center rounded text-white disabled:opacity-50"
                    style={{ background: "var(--color-sage)" }} title="Save">
                    <Check size={12} />
                  </button>
                  <button type="button" onClick={cancelEditNumber}
                    className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }} title="Cancel">
                    <X size={12} />
                  </button>
                  {numberError && (
                    <span className="text-[10.5px]" style={{ color: "var(--color-red-orange)" }}>{numberError}</span>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-[15px] font-semibold truncate"
                    style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                    {clientName(selectedInvoice)}{" "}
                    <button type="button" onClick={startEditNumber}
                      className="rounded transition-colors hover:underline"
                      style={{ color: "var(--color-grey)", fontWeight: 400 }}
                      title="Edit invoice number">
                      · {formatInvoiceNumber(selectedInvoice.number, invoicePrefix)}
                    </button>
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>
                    {selectedInvoice.project?.title ?? "No project"}{selectedInvoice.issued_at ? ` · Issued ${fmtDate(selectedInvoice.issued_at)}` : ""}
                  </p>
                </>
              )}
            </div>

            {/* Status pill (filled) — drafts read as a working state, so we
                skip the pill there and let the action buttons carry it. */}
            {selectedInvoice.status !== "draft" && (() => {
              const overdue = isOverdue(selectedInvoice);
              const statusKey = overdue ? "overdue" : selectedInvoice.status;
              const st = STATUS_STYLE[statusKey];
              return (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: st.bg, color: st.color }}>
                  {st.label}
                </span>
              );
            })()}

            {/* Contextual primary action */}
            {selectedInvoice.status === "draft" && (
              <>
                <button onClick={() => setShowSendModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg text-white"
                  style={{ background: "var(--color-sage)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-sage-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-sage)"}>
                  <Send size={12} />
                  Send invoice
                </button>
                <button onClick={() => updateStatus(selectedInvoice, "sent")} disabled={savingStatus}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg disabled:opacity-50 transition-colors"
                  style={{ color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)", background: "transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-warm-white)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Check size={12} />
                  {savingStatus ? "…" : "Mark as sent"}
                </button>
              </>
            )}
            {selectedInvoice.status === "sent" && (
              <div className="flex items-center gap-2">
                {isOverdue(selectedInvoice) && (
                  <span className="text-[10px] font-semibold px-2 py-1 rounded"
                    style={{ background: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" }}>
                    {overdueDays}d overdue
                  </span>
                )}
                <button onClick={() => updateStatus(selectedInvoice, "paid")} disabled={savingStatus}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg text-white disabled:opacity-50"
                  style={{ background: "var(--color-sage)" }}>
                  <CheckCircle2 size={12} />
                  {savingStatus ? "…" : "Mark paid"}
                </button>
              </div>
            )}
            {selectedInvoice.status === "paid" && (
              <span className="text-[11px] font-medium"
                style={{ color: "var(--color-sage)" }}>
                Paid {fmtDate(selectedInvoice.paid_at)}
              </span>
            )}

            {/* Public link affordance — available on every status, including
                drafts (the endpoint mints a token on demand). */}
            <CopyPublicLinkButton invoiceId={selectedInvoice.id} />

            {/* Overflow menu */}
            <div ref={menuRef} style={{ position: "relative" }}>
              <button onClick={() => setMenuOpen((v) => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--color-warm-white)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <Menu
                  onClose={() => setMenuOpen(false)}
                  style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 200, zIndex: 30 }}
                  items={[
                    { label: "Download PDF", icon: Download, href: `/finance/invoice/${selectedInvoice.id}/print`, external: true },
                    "divider",
                    ...(selectedInvoice.status !== "draft" ? [{ label: "Move to draft",  onClick: () => updateStatus(selectedInvoice, "draft") }] : []),
                    ...(selectedInvoice.status === "paid"  ? [{ label: "Mark as sent",   onClick: () => updateStatus(selectedInvoice, "sent")  }] : []),
                    ...(selectedInvoice.status !== "paid"  ? [{ label: "Mark as paid",   onClick: () => updateStatus(selectedInvoice, "paid")  }] : []),
                    "divider",
                    { label: "Delete invoice", danger: true, onClick: () => setConfirmDelete(true) },
                  ]}
                />
              )}
            </div>
          </div>

          {/* Detail body — single full-width column */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-5">
              {/* Hero totals card */}
              <div className="rounded-xl p-5"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-grey)" }}>
                  {selectedInvoice.status === "paid" ? "Paid in full" : "Total due"}
                </p>
                <p className="text-[32px] font-bold tabular-nums mt-1"
                  style={{
                    color: selectedInvoice.status === "paid" ? "var(--color-sage)" : "var(--color-charcoal)",
                    fontFamily: "var(--font-display)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.05,
                  }}>
                  {fmtCurrency(invoiceTotal(selectedInvoice))}
                </p>
                {/* Issued / Due / Paid — the single source of these dates. */}
                <div className="flex gap-5 mt-4 pt-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
                  {[
                    { label: "Issued", value: fmtDate(selectedInvoice.issued_at) },
                    { label: "Due", value: fmtDate(selectedInvoice.due_at),
                      color: isOverdue(selectedInvoice) ? "var(--color-red-orange)" : undefined },
                    ...(selectedInvoice.status === "paid"
                      ? [{ label: "Paid", value: fmtDate(selectedInvoice.paid_at), color: "var(--color-sage)" }]
                      : []),
                  ].map((row) => (
                    <div key={row.label} className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-grey)" }}>{row.label}</span>
                      <span className="text-[12px] font-medium"
                        style={{ color: row.color ?? "var(--color-charcoal)" }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill to & project */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <span className="text-[13px] font-semibold flex-1"
                    style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Bill to &amp; project</span>
                  {isDraft && (
                    <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>Editable while draft</span>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {/* Client row */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-grey)", width: 64 }}>Client</span>
                    <span className="text-[13px] font-medium flex-1" style={{ color: "var(--color-charcoal)" }}>{clientName(selectedInvoice)}</span>
                    {isDraft && (
                      <div ref={clientChooserRef} style={{ position: "relative" }}>
                        <button onClick={() => { setClientChooserOpen((v) => !v); loadContacts(); }}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg"
                          style={{ color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-off-white)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <Pencil size={10} /> Change
                        </button>
                        {clientChooserOpen && (
                          <ClientChooser
                            contacts={allContacts}
                            loaded={contactsLoaded}
                            onPick={changeClient}
                            onClose={() => setClientChooserOpen(false)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  {/* Project row */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-grey)", width: 64 }}>Project</span>
                    {isDraft ? (
                      <div className="flex-1">
                        <Select
                          value={selectedInvoice.project_id ?? ""}
                          onChange={(v) => changeProject(v)}
                          options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.title }))]}
                          placeholder="None"
                        />
                      </div>
                    ) : (
                      <span className="text-[13px] flex-1" style={{ color: "var(--color-charcoal)" }}>{selectedInvoice.project?.title ?? "—"}</span>
                    )}
                  </div>

                  {/* Client details — pulled from the contact/organization record;
                      editable inline while draft (writes back to that record). */}
                  <div className="pt-1 mt-1" style={{ borderTop: "0.5px dashed var(--color-border)" }}>
                    <ClientInfoFields
                      key={selectedInvoice.client_contact?.id ?? selectedInvoice.client_organization?.id ?? "none"}
                      email={selectedInvoice.client_contact?.email ?? selectedInvoice.client_organization?.email ?? ""}
                      phone={selectedInvoice.client_contact?.phone ?? selectedInvoice.client_organization?.phone ?? ""}
                      address={selectedInvoice.client_contact?.location ?? selectedInvoice.client_organization?.location ?? ""}
                      editable={isDraft && !!(selectedInvoice.client_contact || selectedInvoice.client_organization)}
                      onSave={saveClientField}
                    />
                  </div>

                  {/* Show-on-invoice toggle */}
                  <button type="button" onClick={isDraft ? toggleShowClientInfo : undefined}
                    disabled={!isDraft}
                    className="flex items-center gap-2 mt-1 text-left"
                    style={{ cursor: isDraft ? "pointer" : "default" }}>
                    <span className="relative inline-block shrink-0" style={{ width: 32, height: 18 }}>
                      <span className="absolute inset-0 rounded-full transition-colors"
                        style={{ background: selectedInvoice.show_client_info ? "var(--color-sage)" : "var(--color-border)" }} />
                      <span className="absolute rounded-full bg-white transition-all"
                        style={{ width: 14, height: 14, top: 2, left: selectedInvoice.show_client_info ? 16 : 2, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                      Show these client details on the invoice the client sees
                    </span>
                  </button>
                </div>
              </div>

              {/* Line items */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="flex items-center gap-2 px-4 py-3"
                  style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <span className="text-[13px] font-semibold flex-1"
                    style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Line items</span>
                  {selectedInvoice.project_id && (pullableTime.length > 0 || pullableExpenses.length > 0) && (
                    <div ref={pullerRef} style={{ position: "relative" }}>
                      <button onClick={() => setPullerOpen((v) => !v)}
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                        style={{ color: "var(--color-sage)", border: "0.5px solid rgba(155,163,122,0.4)", background: "rgba(155,163,122,0.06)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(155,163,122,0.12)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(155,163,122,0.06)")}>
                        <Plus size={10} /> Pull more
                        <ChevronDown size={9} />
                      </button>
                      {pullerOpen && (
                        <PullMorePicker
                          pullableTime={pullableTime}
                          pullableExpenses={pullableExpenses}
                          onPullTime={(ids) => { pullTimeEntries(ids); setPullerOpen(false); }}
                          onPullExpenses={(ids) => { pullExpenses(ids); setPullerOpen(false); }}
                          onClose={() => setPullerOpen(false)}
                        />
                      )}
                    </div>
                  )}
                </div>
                {/* Table header */}
                <div className="grid px-4 py-2 text-[9px] font-semibold uppercase tracking-wider"
                  style={{ gridTemplateColumns: LINE_GRID, background: "var(--color-off-white)", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}>
                  <div>Description</div><div className="text-right">Qty</div>
                  <div className="text-right">Rate</div><div className="text-right">Amount</div><div />
                </div>
                {(selectedInvoice.line_items ?? []).map((li) => {
                  const src = SOURCE_STYLE[li.source] ?? SOURCE_STYLE.manual;
                  if (editingLineId === li.id) {
                    return (
                      <div key={li.id} className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                        <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                          placeholder="Description" className={`${inputCls} flex-1`} style={inputStyle} autoFocus />
                        <input value={editQty} onChange={(e) => setEditQty(e.target.value)}
                          placeholder="Qty" className={`${inputCls} w-16 text-right`} style={inputStyle} type="number" min="0" step="0.1" />
                        <input value={editRate} onChange={(e) => setEditRate(e.target.value)}
                          placeholder="Rate" className={`${inputCls} w-20 text-right`} style={inputStyle} type="number" min="0" />
                        <button onClick={saveEditLine}
                          className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-white"
                          style={{ background: "var(--color-sage)" }}>Save</button>
                        <button onClick={() => setEditingLineId(null)}
                          className="px-2 py-1.5 text-[12px] rounded-lg"
                          style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}>✕</button>
                      </div>
                    );
                  }
                  return (
                    <div key={li.id} className="group grid items-center px-4 py-3"
                      style={{ gridTemplateColumns: LINE_GRID, borderBottom: "0.5px solid var(--color-border)" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] truncate" style={{ color: "var(--color-charcoal)" }}>{li.description}</span>
                        {li.source !== "manual" && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                            style={{ background: src.bg, color: src.color }}>
                            {li.source}
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>{li.quantity}</span>
                      <span className="text-[13px] tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>{fmtCurrency(li.rate)}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>{fmtCurrency(Number(li.amount))}</span>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEditLine(li)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-opacity"
                          style={{ color: "var(--color-grey)" }} title="Edit line">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => deleteLineItem(li.id)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] w-5 h-5 flex items-center justify-center rounded transition-opacity"
                          style={{ color: "var(--color-red-orange)" }} title="Remove line">✕</button>
                      </div>
                    </div>
                  );
                })}
                {/* Total row */}
                {(selectedInvoice.line_items ?? []).length > 0 && (
                  <div className="grid px-4 py-3"
                    style={{ gridTemplateColumns: LINE_GRID, background: "var(--color-off-white)", borderTop: "0.5px solid var(--color-border)" }}>
                    <span className="text-[12px] font-semibold uppercase tracking-wider col-span-3" style={{ color: "var(--color-grey)" }}>Total</span>
                    <span className="text-[14px] font-bold tabular-nums text-right" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>
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
                      placeholder="Qty" className={`${inputCls} w-16 text-right`} style={inputStyle} type="number" min="0" step="0.1" />
                    <input value={lineRate} onChange={(e) => setLineRate(e.target.value)}
                      placeholder="Rate" className={`${inputCls} w-20 text-right`} style={inputStyle} type="number" min="0" />
                    <button onClick={addLineItem} disabled={savingLine || !lineDesc.trim()}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
                      style={{ background: "var(--color-sage)" }}>Add</button>
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

              {/* Payment */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ borderBottom: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}>
                  Payment
                </div>
                <div className="p-4 flex flex-col gap-2.5">
                  {[
                    { label: "Method", value: selectedInvoice.payment_method ?? "—" },
                    { label: "Terms",  value: selectedInvoice.payment_terms  ?? "—" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between text-[11px]">
                      <span style={{ color: "var(--color-grey)" }}>{row.label}</span>
                      <span style={{ color: "var(--color-charcoal)", fontWeight: 500 }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes — editable */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: editingNotes ? "0.5px solid var(--color-border)" : "none" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Notes</p>
                  {!editingNotes && (
                    <button onClick={() => { setNotesDraft(selectedInvoice.notes ?? ""); setEditingNotes(true); }}
                      className="text-[11px]" style={{ color: "var(--color-grey)" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--color-charcoal)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--color-grey)"}>Edit</button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="p-3 flex flex-col gap-2">
                    <textarea value={notesdraft} onChange={e => setNotesDraft(e.target.value)} rows={4} autoFocus
                      placeholder="Payment instructions, bank details, thank-you note…"
                      className="w-full px-3 py-2 text-[12px] rounded-lg focus:outline-none resize-none"
                      style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingNotes(false)}
                        className="px-3 py-1 text-[11px] rounded-lg"
                        style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Cancel</button>
                      <button onClick={saveNotes} disabled={savingNotes}
                        className="px-3 py-1 text-[11px] font-medium rounded-lg text-white disabled:opacity-50"
                        style={{ background: "var(--color-sage)" }}>
                        {savingNotes ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3" onClick={() => { setNotesDraft(selectedInvoice.notes ?? ""); setEditingNotes(true); }}
                    style={{ cursor: "text", minHeight: 44 }}>
                    {selectedInvoice.notes
                      ? <p className="text-[11px]" style={{ color: "var(--color-grey)", lineHeight: 1.6 }}>{selectedInvoice.notes}</p>
                      : <p className="text-[11px] italic" style={{ color: "var(--color-grey)" }}>Click to add payment instructions, bank details…</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center ml-4 rounded-xl"
          style={{ background: detailBg, border: "0.5px solid var(--color-border)" }}>
          <p className="text-[13px]" style={{ color: "var(--color-grey)" }}>Select an invoice</p>
        </div>
      )}

      {showSendModal && selectedInvoice && (
        <SendInvoiceModal
          invoice={selectedInvoice}
          invoicePrefix={invoicePrefix}
          onClose={() => setShowSendModal(false)}
          onSent={() => onInvoiceSent(selectedInvoice.id)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this invoice?"
        body="This will permanently remove the invoice and all of its line items. The underlying time entries and expenses will remain and become billable again."
        confirmLabel="Delete invoice"
        tone="danger"
        onConfirm={deleteInvoice}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ─── Pull-more picker ────────────────────────────────────────────────────────

function PullMorePicker({
  pullableTime, pullableExpenses, onPullTime, onPullExpenses, onClose,
}: {
  pullableTime: TimeEntry[];
  pullableExpenses: Expense[];
  onPullTime: (ids: string[]) => void;
  onPullExpenses: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [pickedT, setPickedT] = useState<Set<string>>(new Set());
  const [pickedE, setPickedE] = useState<Set<string>>(new Set());

  function toggleT(id: string) {
    setPickedT((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleE(id: string) {
    setPickedE((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function add() {
    if (pickedT.size > 0) onPullTime(Array.from(pickedT));
    if (pickedE.size > 0) onPullExpenses(Array.from(pickedE));
    if (pickedT.size === 0 && pickedE.size === 0) onClose();
  }

  const total = pickedT.size + pickedE.size;

  return (
    <div style={{
      position: "absolute", top: "calc(100% + 6px)", right: 0, width: 340, zIndex: 30,
      background: "var(--color-warm-white)",
      border: "0.5px solid var(--color-border)",
      borderRadius: 12,
      boxShadow: "0 8px 24px rgba(31,33,26,0.12)",
      overflow: "hidden",
    }}>
      <div className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>
          Pull from project
        </span>
        <button onClick={onClose} className="text-[10px]" style={{ color: "var(--color-grey)" }}><X size={11} /></button>
      </div>

      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {pullableTime.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5"
              style={{ background: "rgba(31,33,26,0.03)" }}>
              <Clock size={10} style={{ color: "var(--color-sage)" }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Time</span>
            </div>
            {pullableTime.map((e) => {
              const on = pickedT.has(e.id);
              return (
                <button key={e.id} type="button" onClick={() => toggleT(e.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  style={{ borderBottom: "0.5px solid var(--color-border)", background: on ? "rgba(155,163,122,0.10)" : "transparent" }}>
                  <span className="w-3.5 h-3.5 rounded shrink-0" style={{
                    background: on ? "var(--color-sage)" : "transparent",
                    border: on ? "none" : "1.5px solid var(--color-border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{on && <span className="text-white text-[9px]">✓</span>}</span>
                  <span className="text-[12px] flex-1 truncate" style={{ color: "var(--color-charcoal)" }}>{e.description || "Time entry"}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--color-grey)" }}>{fmtHours(e.duration_minutes)}</span>
                </button>
              );
            })}
          </>
        )}
        {pullableExpenses.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5"
              style={{ background: "rgba(31,33,26,0.03)" }}>
              <Receipt size={10} style={{ color: "var(--color-dark-orange)" }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Expenses</span>
            </div>
            {pullableExpenses.map((x) => {
              const on = pickedE.has(x.id);
              return (
                <button key={x.id} type="button" onClick={() => toggleE(x.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  style={{ borderBottom: "0.5px solid var(--color-border)", background: on ? "rgba(155,163,122,0.10)" : "transparent" }}>
                  <span className="w-3.5 h-3.5 rounded shrink-0" style={{
                    background: on ? "var(--color-sage)" : "transparent",
                    border: on ? "none" : "1.5px solid var(--color-border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{on && <span className="text-white text-[9px]">✓</span>}</span>
                  <span className="text-[12px] flex-1 truncate" style={{ color: "var(--color-charcoal)" }}>{x.description || "Expense"}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--color-grey)" }}>{fmtCurrency(Number(x.amount))}</span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between"
        style={{ borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
        <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
          {total > 0 ? `${total} selected` : "Pick items to add"}
        </span>
        <button onClick={add} disabled={total === 0}
          className="px-3 py-1 text-[11px] font-medium rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--color-sage)" }}>
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Client info fields ───────────────────────────────────────────────────────
// Email / phone / address pulled from the linked contact (or organization).
// Editable while the invoice is a draft — edits save on blur back to the
// underlying record. Keyed by client id upstream, so it remounts (resetting
// local drafts) whenever the invoice's client changes.

function ClientInfoFields({ email, phone, address, editable, onSave }: {
  email: string;
  phone: string;
  address: string;
  editable: boolean;
  onSave: (field: "email" | "phone" | "location", value: string) => void;
}) {
  const [e, setE] = useState(email);
  const [p, setP] = useState(phone);
  const [a, setA] = useState(address);

  const rows: Array<{ key: "email" | "phone" | "location"; label: string; value: string; orig: string; set: (s: string) => void; placeholder: string }> = [
    { key: "email",    label: "Email",   value: e, orig: email,   set: setE, placeholder: "client@email.com" },
    { key: "phone",    label: "Phone",   value: p, orig: phone,   set: setP, placeholder: "(555) 123-4567" },
    { key: "location", label: "Address", value: a, orig: address, set: setA, placeholder: "Street, city, state" },
  ];

  if (!editable) {
    const present = rows.filter((r) => r.value.trim());
    if (present.length === 0) {
      return <p className="text-[11px] italic" style={{ color: "var(--color-grey)" }}>No client contact details on file.</p>;
    }
    return (
      <div className="flex flex-col gap-1.5">
        {present.map((r) => (
          <div key={r.key} className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-grey)", width: 64 }}>{r.label}</span>
            <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>{r.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-grey)", width: 64 }}>{r.label}</span>
          <input
            value={r.value}
            onChange={(ev) => r.set(ev.target.value)}
            onBlur={() => { if (r.value.trim() !== r.orig.trim()) onSave(r.key, r.value); }}
            placeholder={r.placeholder}
            className="flex-1 px-2.5 py-1.5 text-[12px] rounded-lg focus:outline-none"
            style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Client chooser ───────────────────────────────────────────────────────────
// Compact searchable contact list for re-pointing a draft invoice at a
// different client.

function ClientChooser({ contacts, loaded, onPick, onClose }: {
  contacts: Contact[];
  loaded: boolean;
  onPick: (c: Contact) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = contacts.filter((c) =>
    !q ||
    c.first_name.toLowerCase().includes(q) ||
    c.last_name.toLowerCase().includes(q) ||
    (c.email ?? "").toLowerCase().includes(q)
  );
  return (
    <div className="absolute right-0 mt-1 rounded-xl overflow-hidden z-30"
      style={{ top: "100%", width: 280, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 8px 24px rgba(31,33,26,0.14)" }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}>
        <Search size={12} style={{ color: "var(--color-grey)" }} />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts…"
          className="flex-1 text-[12px] bg-transparent focus:outline-none"
          style={{ color: "var(--color-charcoal)", fontFamily: "inherit" }} />
        <button onClick={onClose} style={{ color: "var(--color-grey)" }}><X size={12} /></button>
      </div>
      <div style={{ maxHeight: 240, overflowY: "auto" }}>
        {!loaded ? (
          <p className="text-[12px] text-center py-4" style={{ color: "var(--color-grey)" }}>Loading…</p>
        ) : matches.length === 0 ? (
          <p className="text-[12px] text-center py-4" style={{ color: "var(--color-grey)" }}>No contacts match.</p>
        ) : matches.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)}
            className="w-full text-left px-3 py-2 flex items-center gap-2"
            style={{ borderBottom: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <span className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{c.first_name} {c.last_name}</span>
            {c.email && <span className="text-[11px] ml-auto truncate" style={{ color: "var(--color-grey)", maxWidth: 140 }}>{c.email}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Copy public link ─────────────────────────────────────────────────────────
//
// Hits the public-link endpoint to ensure the invoice has a token (minting
// one if not), then copies the resulting /i/<token> URL to the clipboard.
// Shows a short-lived "Copied!" pill so the user sees the action landed.

function CopyPublicLinkButton({ invoiceId }: { invoiceId: string }) {
  const [busy,    setBusy]    = useState(false);
  const [toast,   setToast]   = useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}/public-link`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setToast(json.error ?? "Could not generate link.");
      } else {
        try {
          await navigator.clipboard.writeText(json.url);
          setToast("Copied!");
        } catch {
          // Some browsers reject clipboard writes without a user gesture
          // — the click counts but iframed previews can still fail.
          setToast(json.url);
        }
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 2000);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title="Copy a public link the client can use to pay"
        aria-label="Copy public link"
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
        style={{
          color:      "var(--color-charcoal)",
          background: "transparent",
          border:     "0.5px solid var(--color-border)",
          opacity:    busy ? 0.6 : 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-warm-white)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Link2 size={14} />
      </button>
      {toast && (
        <span
          className="absolute right-0 text-[10.5px] font-medium px-2 py-1 rounded-md"
          style={{
            top: "calc(100% + 6px)",
            background: "var(--color-charcoal)",
            color: "var(--color-warm-white)",
            whiteSpace: "nowrap",
            zIndex: 40,
            boxShadow: "0 4px 12px rgba(31,33,26,0.18)",
          }}
        >
          {toast}
        </span>
      )}
    </div>
  );
}
