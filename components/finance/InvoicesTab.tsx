"use client";

import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, InvoiceLineItem, InvoiceAttachment, InvoiceStatus, TimeEntry, Expense, Project, Contact, Organization } from "@/types/database";
import { uploadReceipt, deleteReceipt } from "@/lib/uploads/receipt";
import EmptyState from "@/components/ui/EmptyState";
import InvoiceStripeGate from "./InvoiceStripeGate";
import Menu from "@/components/ui/Menu";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { formatInvoiceNumber, paymentMethodLabel } from "@/lib/invoices/format";
import { buildInvoiceEmailHtml } from "@/lib/invoices/email-template";
import { fmtDateShort as fmtDate } from "@/lib/format/date";
import { X, Download, Send, FileText, MoreHorizontal, Plus, Clock, Receipt, CheckCircle2, Sparkles, ChevronDown, Link2, Check, Pencil, Search, ArrowUpDown, ArrowUp, ArrowDown, ListFilter, Paperclip } from "lucide-react";

// Canonical join used whenever we re-fetch a single invoice after a write,
// so the detail pane always has the client's contact details + project + lines.
const INVOICE_SELECT =
  "*, client_contact:contacts(id, first_name, last_name, email, phone, location), client_organization:organizations(id, name, email, phone, location), project:projects(id, title, rate), line_items:invoice_line_items(*), attachments:invoice_attachments(*)";

interface Props {
  invoices: Invoice[];
  timeEntries: TimeEntry[];
  expenses: Expense[];
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  invoicePrefix: string | null;
  /** Live Stripe connection health — invoicing is gated on it. */
  stripeStatus: { connected: boolean; status: string | null; accountName: string | null };
  /** Preselect an invoice on mount (e.g. returning from the print page). */
  initialInvoiceId?: string | null;
  /** Select this invoice when it changes (e.g. a just-created invoice). */
  selectInvoiceId?: string | null;
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
  const invNum = formatInvoiceNumber(invoice.number, invoicePrefix);
  const total  = invoiceTotal(invoice);
  const [to,      setTo]      = useState(clientEmail);
  const [subject, setSubject] = useState(`Invoice ${invNum} — ${fmtCurrency(total)}`);
  const [message, setMessage] = useState(`Hi,\n\nPlease find your invoice attached. Let me know if you have any questions.\n\nThank you for your business.`);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [sent,    setSent]    = useState(false);
  const [studioName, setStudioName] = useState("Your studio");
  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [logoUrl,    setLogoUrl]    = useState<string | null>(null);
  const accent = brandColor || "#3d6b4f";

  // Pull the studio identity so the preview matches the real email.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles")
        .select("studio_name, display_name, brand_color, logo_url").eq("user_id", user.id).maybeSingle();
      const name = (data?.studio_name as string | null)?.trim() || (data?.display_name as string | null)?.trim();
      if (name) setStudioName(name);
      setBrandColor((data?.brand_color as string | null)?.trim() || null);
      setLogoUrl((data?.logo_url as string | null) ?? null);
    })();
  }, []);

  async function handleSend() {
    if (!to.trim()) { setError("Enter a recipient email."); return; }
    setLoading(true); setError(null);
    const res = await fetch("/api/finance/send-invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoice.id, to: to.trim(), subject: subject.trim(), message }),
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

  const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" };
  const lineItems = invoice.line_items ?? [];

  return (
    <Modal
      onClose={onClose}
      maxWidth={1160}
      bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", minHeight: "80vh" }}
      header={
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Send invoice</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>{invNum} · {clientName(invoice)}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <X size={14} />
          </button>
        </div>
      }
      footer={!sent ? (
        <>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[12px] rounded-lg"
            style={{ color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border)" }}
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
        </>
      ) : undefined}
    >
        {sent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-5">
            <p className="text-[28px] mb-2">✓</p>
            <p className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Invoice sent!</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--color-grey)" }}>Delivered to {to}</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* Compose */}
            <div className="px-5 py-4 space-y-4 overflow-y-auto shrink-0" style={{ width: 360, borderRight: "0.5px solid var(--color-border)" }}>
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>To *</label>
                <input type="email" value={to} onChange={e => setTo(e.target.value)}
                  placeholder="client@email.com" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>Subject</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder={`Invoice ${invNum}`} className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={10}
                  className={inputCls} style={{ ...inputStyle, resize: "none" }} />
              </div>
              {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
            </div>

            {/* Live email preview — renders the exact same HTML the email
                uses, in an iframe, so the preview matches the inbox 1:1. */}
            <div className="flex-1 flex flex-col min-h-0" style={{ background: "#f5f4f1" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider px-6 pt-4 pb-2 shrink-0" style={{ color: "var(--color-grey)" }}>Email preview · to {to || "client"}</p>
              <iframe
                title="Email preview"
                className="flex-1 min-h-0 w-full"
                style={{ border: "none" }}
                srcDoc={buildInvoiceEmailHtml({
                  invNum,
                  studioName,
                  accent,
                  logoUrl,
                  message,
                  issuedLabel: fmtDate(invoice.issued_at),
                  dueLabel:    invoice.due_at ? fmtDate(invoice.due_at) : null,
                  lineItems:   lineItems.map((li) => ({ description: li.description, quantity: li.quantity, rate: Number(li.rate), amount: Number(li.amount) })),
                  total,
                  publicUrl:   "#",
                  printUrl:    "#",
                })}
              />
            </div>
          </div>
        )}
    </Modal>
  );
}

// Statuses available in the multi-select filter. "overdue" is a derived
// cross-cut of sent invoices, not a stored status, but filterable here.
const STATUS_KEYS = ["draft", "saved", "sent", "paid", "voided", "overdue"] as const;
type StatusKey = typeof STATUS_KEYS[number];

type SortBy = "issued" | "due" | "client" | "amount";
const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "issued", label: "Issue date" },
  { key: "due",    label: "Due date" },
  { key: "client", label: "Client" },
  { key: "amount", label: "Invoice amount" },
];

function isOverdue(inv: Invoice) {
  return inv.status === "sent" && !!inv.due_at && inv.due_at < new Date().toISOString().split("T")[0];
}

// Does an invoice match a given filter key? Overdue is a tag, not a status —
// "sent" includes overdue invoices, and "overdue" narrows to just those.
function matchesStatusKey(inv: Invoice, key: StatusKey): boolean {
  if (key === "overdue") return isOverdue(inv);
  return inv.status === key;
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
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtHours(mins: number) { return `${(mins / 60).toFixed(1)}h`; }

// Status palette: draft & saved blue, sent yellow, paid green, voided grey,
// overdue red (shown as an extra tag, never replacing the real status).
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:   { bg: "var(--color-blue)",                  color: "white",   label: "Draft"   },
  saved:   { bg: "var(--color-blue)",                  color: "white",   label: "Saved"   },
  sent:    { bg: "var(--color-amber-solid)",                  color: "#1f211a", label: "Sent"    },
  paid:    { bg: "var(--color-sage)",        color: "white",   label: "Paid"    },
  overdue: { bg: "var(--color-red-orange)",  color: "white",   label: "Overdue" },
  voided:  { bg: "var(--color-grey)",        color: "white",   label: "Void"    },
};

// Status → Badge tone (solid variant). The menu swatch still reads STATUS_STYLE.
const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "blue", saved: "blue", sent: "amber", paid: "sage", overdue: "red", voided: "neutral",
};

// Left-stripe color per status for the list rows.
function stripeFor(status: string, overdue: boolean): string {
  if (overdue) return "var(--color-red-orange)";
  if (status === "paid")                          return "var(--color-sage)";
  if (status === "sent")                          return "var(--color-amber-solid)";
  if (status === "draft" || status === "saved")   return "var(--color-blue)";
  if (status === "voided")                        return "var(--color-grey)";
  return "var(--color-border)";
}

// Shared grid template for the line-items table (description | qty | rate | amount | actions).
const LINE_GRID = "1fr 70px 80px 90px 46px";

const SOURCE_STYLE: Record<string, { bg: string; color: string }> = {
  time:    { bg: "rgba(var(--color-green-deep-rgb),0.10)",  color: "var(--color-sage)" },
  expense: { bg: "rgba(220,153,13,0.10)", color: "var(--color-dark-orange)" },
  manual:  { bg: "rgba(var(--color-charcoal-rgb),0.06)",   color: "var(--color-grey)" },
};

export default function InvoicesTab({
  invoices, timeEntries, expenses, projects, invoicePrefix, stripeStatus, initialInvoiceId, selectInvoiceId,
  onInvoiceUpdated, onInvoiceDeleted, onInvoiceSent, onNewInvoice,
}: Props) {
  // Nothing is selected on entry — the detail pane stays empty until the user
  // picks an invoice (unless we were deep-linked to one, e.g. back from print).
  const [selectedId, setSelectedId]           = useState<string | null>(initialInvoiceId ?? null);
  // Multi-select status filter (empty = show all) + sort controls.
  const [statusFilter, setStatusFilter]       = useState<Set<StatusKey>>(new Set());
  const [statusMenuOpen, setStatusMenuOpen]   = useState(false);
  const [sortMenuOpen, setSortMenuOpen]       = useState(false);
  const [sortBy, setSortBy]                   = useState<SortBy>("issued");
  const [sortDir, setSortDir]                 = useState<"asc" | "desc">("desc");
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const sortMenuRef   = useRef<HTMLDivElement>(null);
  const [addingLine, setAddingLine]           = useState(false);
  const [lineDesc, setLineDesc]               = useState("");
  const [lineQty, setLineQty]                 = useState("1");
  const [lineRate, setLineRate]               = useState("");
  const [savingLine, setSavingLine]           = useState(false);
  const [savingStatus, setSavingStatus]       = useState(false);
  const [showSendModal, setShowSendModal]     = useState(false);
  const [menuOpen, setMenuOpen]               = useState(false);
  const [pullerOpen, setPullerOpen]           = useState(false);
  const [confirmDelete, setConfirmDelete]     = useState(false);
  const [editingNumber, setEditingNumber]     = useState(false);
  const [numberDraft, setNumberDraft]         = useState("");
  const [savingNumber, setSavingNumber]       = useState(false);
  const [numberError, setNumberError]         = useState<string | null>(null);
  // Saved invoices are edited behind a pencil toggle (drafts are open by
  // default). This flag opens a saved invoice's fields for editing.
  const [editingSaved, setEditingSaved]       = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const status = selectedInvoice?.status;
  const isDraft = status === "draft";
  const isSaved = status === "saved";
  // Fields are open while a draft, or while a saved invoice is being edited
  // via the pencil. Sent / paid / voided invoices render the PDF preview.
  const editable = isDraft || (isSaved && editingSaved);
  // Sent / paid / voided show the invoice as the client sees it (PDF view).
  const showPdfView = status === "sent" || status === "paid" || status === "voided";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (pullerRef.current && !pullerRef.current.contains(e.target as Node)) setPullerOpen(false);
      if (clientChooserRef.current && !clientChooserRef.current.contains(e.target as Node)) setClientChooserOpen(false);
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Drop any in-progress edits when the selection changes so editors never
  // carry one invoice's draft over to another.
  useEffect(() => {
    setEditingNumber(false); setNumberError(null);
    setEditingSaved(false); setClientChooserOpen(false);
  }, [selectedId]);

  // Select a freshly-created invoice in the detail pane (the parent bumps
  // selectInvoiceId when one is made). Guard the initial null so this
  // never fights the mount-time initialInvoiceId selection.
  useEffect(() => {
    if (selectInvoiceId) setSelectedId(selectInvoiceId);
  }, [selectInvoiceId]);

  // Filter by the selected statuses (empty = all), then sort.
  const visibleInvoices = useMemo(() => {
    const keys = [...statusFilter];
    const filtered = invoices.filter((inv) =>
      keys.length === 0 || keys.some((k) => matchesStatusKey(inv, k)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let r = 0;
      if (sortBy === "issued")      r = (a.issued_at ?? "").localeCompare(b.issued_at ?? "");
      else if (sortBy === "due")    r = (a.due_at ?? "").localeCompare(b.due_at ?? "");
      else if (sortBy === "client") r = clientName(a).localeCompare(clientName(b));
      else if (sortBy === "amount") r = invoiceTotal(a) - invoiceTotal(b);
      return r * dir;
    });
  }, [invoices, statusFilter, sortBy, sortDir]);

  // Per-status counts for the filter dropdown.
  const statusCounts = useMemo(() => {
    const c = {} as Record<StatusKey, number>;
    for (const k of STATUS_KEYS) c[k] = invoices.filter((inv) => matchesStatusKey(inv, k)).length;
    return c;
  }, [invoices]);

  function toggleStatus(k: StatusKey) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function pickSort(k: SortBy) {
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(k); setSortDir("desc"); }
  }

  // Group label for the active sort: month break for date sorts, client name
  // for the client sort, none for amount. Rows are already sorted, so we just
  // break whenever this key changes between consecutive rows.
  function groupInfo(inv: Invoice): { key: string; label: string } | null {
    if (sortBy === "client") {
      const n = clientName(inv);
      return { key: "c:" + n.toLowerCase(), label: n };
    }
    if (sortBy === "issued" || sortBy === "due") {
      const d = sortBy === "issued" ? inv.issued_at : inv.due_at;
      if (!d) return { key: "none", label: sortBy === "due" ? "No due date" : "No issue date" };
      const dt = new Date(d + "T12:00:00");
      return { key: "m:" + d.slice(0, 7), label: dt.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
    }
    return null;
  }

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
      x.billable &&
      !invoicedExpenseIds.has(x.id)
    );
  }, [selectedInvoice?.project_id, expenses, invoicedExpenseIds]);

  async function updateStatus(inv: Invoice, status: InvoiceStatus) {
    setSavingStatus(true);
    // Completing an invoice goes through a server route so all parties get a
    // payment-confirmation email (matching the Stripe webhook path).
    if (status === "paid") {
      const res = await fetch(`/api/finance/invoices/${inv.id}/mark-paid`, { method: "POST" });
      const json = await res.json() as { invoice?: Invoice };
      if (json.invoice) onInvoiceUpdated(json.invoice);
      setSavingStatus(false);
      return;
    }
    const supabase = createClient();
    // Non-paid transitions. Moving off paid clears paid_at.
    const patch: Record<string, unknown> = { status, paid_at: null };
    // Stamp activity timestamps for the timeline.
    if (status === "sent" && !inv.sent_at) patch.sent_at = new Date().toISOString();
    if (status === "voided") patch.voided_at = new Date().toISOString();
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

  // Commit an inline edit to a single line item (open-by-default rows commit
  // on blur). amount is recomputed from qty × rate.
  async function saveLineItem(id: string, patch: { description: string; quantity: number; rate: number }) {
    if (!selectedInvoice) return;
    const amount = parseFloat((patch.quantity * patch.rate).toFixed(2));
    const supabase = createClient();
    const { data } = await supabase.from("invoice_line_items")
      .update({ ...patch, amount })
      .eq("id", id)
      .select("*")
      .single();
    if (data) {
      const updated = { ...selectedInvoice, line_items: (selectedInvoice.line_items ?? []).map((li) => li.id === id ? data as InvoiceLineItem : li) };
      onInvoiceUpdated(updated as Invoice);
    }
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
    // Auto-attach receipts from any pulled expense that has one.
    const receiptRows = picked
      .filter((x) => x.receipt_url)
      .map((x) => ({
        invoice_id: selectedInvoice.id,
        user_id:    user.id,
        name:       `${x.description || "Expense"} — receipt`,
        url:        x.receipt_url as string,
        path:       null,
        source:     "expense_receipt" as const,
      }));
    let newAttachments: InvoiceAttachment[] = [];
    if (receiptRows.length > 0) {
      const { data: attData } = await supabase.from("invoice_attachments").insert(receiptRows).select("*");
      newAttachments = (attData as InvoiceAttachment[]) ?? [];
    }
    if (data || newAttachments.length > 0) {
      const updated = {
        ...selectedInvoice,
        line_items: [...(selectedInvoice.line_items ?? []), ...((data as InvoiceLineItem[]) ?? [])],
        attachments: [...(selectedInvoice.attachments ?? []), ...newAttachments],
      };
      onInvoiceUpdated(updated as Invoice);
    }
  }

  // ── Manual attachments ──────────────────────────────────────────────────────

  async function addAttachment(file: File) {
    if (!selectedInvoice) return;
    setUploadingAttachment(true);
    setAttachmentError(null);
    try {
      const up = await uploadReceipt(file);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { data, error } = await supabase.from("invoice_attachments")
        .insert({
          invoice_id: selectedInvoice.id,
          user_id:    user.id,
          name:       up.name,
          url:        up.url,
          path:       up.path,
          file_type:  up.type,
          size_bytes: file.size,
          source:     "manual",
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      onInvoiceUpdated({ ...selectedInvoice, attachments: [...(selectedInvoice.attachments ?? []), data as InvoiceAttachment] });
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function removeAttachment(att: InvoiceAttachment) {
    if (!selectedInvoice) return;
    const supabase = createClient();
    await supabase.from("invoice_attachments").delete().eq("id", att.id);
    // Only delete the stored object for manual uploads — expense receipts are
    // owned by the expense and shared.
    if (att.source === "manual" && att.path) {
      try { await deleteReceipt(att.path); } catch { /* non-fatal */ }
    }
    onInvoiceUpdated({ ...selectedInvoice, attachments: (selectedInvoice.attachments ?? []).filter((a) => a.id !== att.id) });
  }

  // Generic text save for the invoice's own free-text fields (payment terms /
  // method / notes). Used by the always-open editors that commit on blur.
  async function saveInvoiceText(field: "payment_terms" | "payment_method" | "notes", value: string) {
    if (!selectedInvoice) return;
    const supabase = createClient();
    const { data } = await supabase.from("invoices")
      .update({ [field]: value.trim() || null })
      .eq("id", selectedInvoice.id)
      .select(INVOICE_SELECT)
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
  }

  async function saveInvoiceDate(field: "issued_at" | "due_at", date: Date | null) {
    if (!selectedInvoice) return;
    const v = date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : null;
    const supabase = createClient();
    const { data } = await supabase.from("invoices")
      .update({ [field]: v })
      .eq("id", selectedInvoice.id)
      .select(INVOICE_SELECT)
      .single();
    if (data) onInvoiceUpdated(data as Invoice);
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

  const inputCls = "px-2 py-1.5 text-[12px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

  const cardShadow = "0 2px 8px rgba(var(--color-charcoal-rgb),0.04)";
  const detailBg   = "var(--color-cream)";   // a real step darker than the list pane

  // Stripe is foundational here: no healthy connection, no invoicing. Gate
  // the whole tab behind the connect prompt rather than letting the user
  // build invoices they can't actually get paid on. `error` gets a
  // distinct reconnect treatment; anything else not-connected is a fresh
  // connect.
  if (!stripeStatus.connected) {
    return (
      <InvoiceStripeGate
        state={stripeStatus.status === "error" ? "error" : "disconnected"}
        accountName={stripeStatus.accountName}
      />
    );
  }

  return (
    <div className="flex gap-0 flex-1 overflow-hidden p-5">
      {/* ─── Invoice list pane ──────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden rounded-xl shrink-0"
        style={{ width: 296, background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
        <div className="px-4 py-3 shrink-0"
          style={{ borderBottom: "0.5px solid var(--color-border)",
                   background: "var(--color-warm-white)", position: "sticky", top: 0, zIndex: 1 }}>
          <p className="text-[13px] font-semibold mb-2.5"
            style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>All invoices</p>

          {/* Summary — moved up from the footer. */}
          <div className="flex gap-4 mb-3">
            {[
              { label: "Outstanding", value: fmtCurrency(outstanding), color: outstanding > 0 ? "var(--color-gold)" : "var(--color-charcoal)" },
              { label: "Collected YTD", value: fmtCurrency(collectedYtd), color: "var(--color-charcoal)" },
              { label: "Draft", value: fmtCurrency(draftTotal), color: "var(--color-charcoal)" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>{item.label}</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Filter + sort controls — right-aligned */}
          <div className="flex items-center justify-end gap-2">
            {/* Status multi-select — icon only, matches the sort icon */}
            <div ref={statusMenuRef} className="relative">
              <button type="button" onClick={() => { setStatusMenuOpen((v) => !v); setSortMenuOpen(false); }}
                title="Filter by status"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: statusFilter.size > 0 ? "var(--color-cream)" : "transparent" }}>
                <ListFilter size={13} />
                {statusFilter.size > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center text-white text-[9px] font-bold rounded-full"
                    style={{ minWidth: 15, height: 15, padding: "0 3px", background: "var(--color-sage)" }}>{statusFilter.size}</span>
                )}
              </button>
              {statusMenuOpen && (
                <div className="absolute right-0 mt-1 rounded-xl overflow-hidden z-30"
                  style={{ top: "100%", width: 200, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 8px 24px rgba(var(--color-charcoal-rgb),0.14)" }}>
                  {STATUS_KEYS.map((k) => {
                    const on = statusFilter.has(k);
                    const meta = STATUS_STYLE[k];
                    return (
                      <button key={k} type="button" onClick={() => toggleStatus(k)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left"
                        style={{ borderBottom: "0.5px solid var(--color-border)", background: on ? "rgba(var(--color-sage-rgb),0.10)" : "transparent" }}>
                        <span className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                          style={{ background: on ? "var(--color-sage)" : "transparent", border: on ? "none" : "1.5px solid var(--color-border)" }}>
                          {on && <Check size={10} color="white" />}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                        <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--color-grey)" }}>{statusCounts[k]}</span>
                      </button>
                    );
                  })}
                  {statusFilter.size > 0 && (
                    <button type="button" onClick={() => setStatusFilter(new Set())}
                      className="w-full px-3 py-2 text-[11px] text-center" style={{ color: "var(--color-grey)" }}>
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sort */}
            <div ref={sortMenuRef} className="relative">
              <button type="button" onClick={() => { setSortMenuOpen((v) => !v); setStatusMenuOpen(false); }}
                title="Sort invoices"
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}>
                <ArrowUpDown size={13} />
              </button>
              {sortMenuOpen && (
                <div className="absolute right-0 mt-1 rounded-xl overflow-hidden z-30"
                  style={{ top: "100%", width: 180, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 8px 24px rgba(var(--color-charcoal-rgb),0.14)" }}>
                  <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--color-grey)", borderBottom: "0.5px solid var(--color-border)" }}>Sort by</div>
                  {SORT_OPTIONS.map((opt) => {
                    const active = sortBy === opt.key;
                    return (
                      <button key={opt.key} type="button" onClick={() => pickSort(opt.key)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px]"
                        style={{ borderBottom: "0.5px solid var(--color-border)", background: active ? "rgba(var(--color-sage-rgb),0.10)" : "transparent", color: "var(--color-charcoal)", fontWeight: active ? 600 : 400 }}>
                        <span className="flex-1">{opt.label}</span>
                        {active && (sortDir === "asc" ? <ArrowUp size={12} style={{ color: "var(--color-sage)" }} /> : <ArrowDown size={12} style={{ color: "var(--color-sage)" }} />)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Uninvoiced ready banner — quiet sage, dismissable */}
          {!bannerDismissed && readyProjectCount > 0 && invoices.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: "rgba(var(--color-sage-rgb),0.10)", borderBottom: "0.5px solid var(--color-border)" }}>
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

          {(() => {
            const out: ReactNode[] = [];
            let prevKey: string | null = null;
            for (const inv of visibleInvoices) {
              const overdue = isOverdue(inv);
              // The chip carries the real status; overdue is shown as a separate tag.
              const st = STATUS_STYLE[inv.status] ?? STATUS_STYLE.draft;
              const total = invoiceTotal(inv);
              const isSelected = inv.id === selectedId;
              const stripeColor = stripeFor(inv.status, overdue);

              // Month / client break when the group key changes.
              const g = groupInfo(inv);
              if (g && g.key !== prevKey) {
                out.push(
                  <div key={"h-" + g.key}
                    className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--color-grey)", background: "var(--color-off-white)", borderBottom: "0.5px solid var(--color-border)" }}>
                    {g.label}
                  </div>,
                );
              }
              if (g) prevKey = g.key;

              // The date shown tracks the active sort (issue vs due).
              const dateLabel = sortBy === "issued" ? "Issued" : "Due";
              const dateVal   = sortBy === "issued" ? inv.issued_at : inv.due_at;
              const showDate  = sortBy === "issued" ? !!inv.issued_at : (!overdue && !!inv.due_at);

              out.push(
                <div key={inv.id}
                  className="px-4 py-3 cursor-pointer"
                  style={{
                    borderBottom: "0.5px solid var(--color-border)",
                    // Sage tint reads clearly on both the light and dark surfaces.
                    background: isSelected ? "rgba(var(--color-sage-rgb),0.18)" : "transparent",
                    borderLeft: `${isSelected ? 3 : 2}px solid ${stripeColor}`,
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
                    {showDate && <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{dateLabel} {fmtDate(dateVal)}</span>}
                    {overdue && <Badge tone="red" variant="solid">Overdue</Badge>}
                    <Badge tone={STATUS_TONE[inv.status] ?? "blue"} variant="solid">{st.label}</Badge>
                  </div>
                </div>,
              );
            }
            return out;
          })()}
          {visibleInvoices.length === 0 && invoices.length === 0 && (
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
          {visibleInvoices.length === 0 && invoices.length > 0 && (
            <p className="px-4 py-6 text-[12px] text-center" style={{ color: "var(--color-grey)" }}>No invoices match this filter.</p>
          )}
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
                  <div className="flex items-center gap-1 min-w-0">
                    {isDraft ? (
                      <div ref={clientChooserRef} style={{ position: "relative" }} className="min-w-0">
                        <button type="button" onClick={() => { setClientChooserOpen((v) => !v); loadContacts(); }}
                          className="flex items-center gap-1 max-w-full rounded transition-colors hover:underline"
                          style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}
                          title="Change client">
                          <span className="text-[15px] font-semibold truncate">{clientName(selectedInvoice)}</span>
                          <ChevronDown size={12} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
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
                    ) : (
                      <span className="text-[15px] font-semibold truncate"
                        style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)", letterSpacing: "-0.01em" }}>
                        {clientName(selectedInvoice)}
                      </span>
                    )}
                    <button type="button" onClick={startEditNumber}
                      className="text-[15px] rounded transition-colors hover:underline shrink-0"
                      style={{ color: "var(--color-grey)", fontWeight: 400 }}
                      title="Edit invoice number">
                      · {formatInvoiceNumber(selectedInvoice.number, invoicePrefix)}
                    </button>
                  </div>
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
              const st = STATUS_STYLE[statusKey] ?? STATUS_STYLE.draft;
              return (
                <Badge tone={STATUS_TONE[statusKey] ?? "blue"} variant="solid">{st.label}</Badge>
              );
            })()}

            {/* Action cluster — ⋯ menu on the left, primary green CTA on the right. */}
            <div className="flex items-center gap-2">
              {/* Overflow menu (leftmost) */}
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
                    style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 200, zIndex: 30 }}
                    items={[
                      { label: "Download PDF", icon: Download, href: `/invoice/${selectedInvoice.id}/print`, external: true },
                      "divider",
                      ...(selectedInvoice.status !== "draft" ? [{ label: "Move to draft", onClick: () => updateStatus(selectedInvoice, "draft") }] : []),
                      ...((selectedInvoice.status === "draft" || selectedInvoice.status === "saved") ? [{ label: "Mark as sent", onClick: () => updateStatus(selectedInvoice, "sent") }] : []),
                      ...((selectedInvoice.status === "draft" || selectedInvoice.status === "saved" || selectedInvoice.status === "sent") ? [{ label: "Mark as paid", onClick: () => updateStatus(selectedInvoice, "paid") }] : []),
                      ...((selectedInvoice.status === "saved" || selectedInvoice.status === "sent") ? [{ label: "Void invoice", onClick: () => updateStatus(selectedInvoice, "voided") }] : []),
                      "divider",
                      { label: "Delete invoice", danger: true, onClick: () => setConfirmDelete(true) },
                    ]}
                  />
                )}
              </div>

              {/* Overdue badge */}
              {selectedInvoice.status === "sent" && isOverdue(selectedInvoice) && (
                <span className="text-[10px] font-semibold px-2 py-1 rounded"
                  style={{ background: "rgba(var(--color-red-rgb),0.10)", color: "var(--color-red-orange)" }}>
                  {overdueDays}d overdue
                </span>
              )}

              {/* Copy public link — meaningful once shared (sent / paid). */}
              {(selectedInvoice.status === "sent" || selectedInvoice.status === "paid") && (
                <CopyPublicLinkButton invoiceId={selectedInvoice.id} />
              )}

              {/* Secondary action */}
              {selectedInvoice.status === "draft" && (
                <button onClick={() => updateStatus(selectedInvoice, "saved")} disabled={savingStatus}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg disabled:opacity-50 transition-colors"
                  style={{ color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)", background: "transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-warm-white)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <Check size={12} />
                  {savingStatus ? "…" : "Save"}
                </button>
              )}
              {selectedInvoice.status === "saved" && (
                <button onClick={() => setEditingSaved((v) => !v)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg transition-colors"
                  style={{ color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)", background: editingSaved ? "var(--color-warm-white)" : "transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-warm-white)"}
                  onMouseLeave={e => e.currentTarget.style.background = editingSaved ? "var(--color-warm-white)" : "transparent"}>
                  <Pencil size={12} />
                  {editingSaved ? "Done" : "Edit"}
                </button>
              )}
              {selectedInvoice.status === "paid" && (() => {
                const payLabel = paymentMethodLabel(selectedInvoice.payment_method_type, selectedInvoice.payment_card_brand, selectedInvoice.payment_card_last4);
                return (
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[11px] font-medium" style={{ color: "var(--color-sage)" }}>
                      Paid {fmtDate(selectedInvoice.paid_at)}
                    </span>
                    {payLabel && (
                      <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{payLabel}</span>
                    )}
                  </div>
                );
              })()}

              {/* Primary green CTA (rightmost) */}
              {(selectedInvoice.status === "draft" || selectedInvoice.status === "saved") && (
                <button onClick={() => setShowSendModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg text-white"
                  style={{ background: "var(--color-sage)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-sage-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-sage)"}>
                  <Send size={12} />
                  Send invoice
                </button>
              )}
              {selectedInvoice.status === "sent" && (
                <button onClick={() => updateStatus(selectedInvoice, "paid")} disabled={savingStatus}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-lg text-white disabled:opacity-50"
                  style={{ background: "var(--color-sage)" }}>
                  <CheckCircle2 size={12} />
                  {savingStatus ? "…" : "Mark paid"}
                </button>
              )}
            </div>
          </div>

          {/* Detail body. Sent / paid / voided show the invoice as the client
              sees it (PDF preview); draft / saved show the editable cards. */}
          {showPdfView ? (
            <div className="flex-1 min-h-0 flex flex-col" style={{ background: "var(--color-cream)" }}>
              <div className="px-5 pt-5 shrink-0">
                <InvoiceActivity invoice={selectedInvoice} />
              </div>
              {/* Only the PDF scrolls — the body itself doesn't (avoids a double scrollbar). */}
              <div className="flex-1 min-h-0 p-5 pt-4">
                <div className="w-full h-full rounded-xl overflow-hidden" style={{ border: "0.5px solid var(--color-border)", background: "white" }}>
                  <InvoicePdfPreview token={selectedInvoice.public_token} invoiceId={selectedInvoice.id} voided={selectedInvoice.status === "voided"} />
                </div>
              </div>
            </div>
          ) : (
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
                {/* Issued / Due — editable date pickers while in draft (same
                    control as the rest of the draft flow); read-only otherwise. */}
                <div className="flex gap-5 mt-4 pt-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
                  {editable ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Issued</span>
                        <div style={{ width: 156 }}>
                          <DatePicker
                            value={selectedInvoice.issued_at ? new Date(selectedInvoice.issued_at + "T12:00:00") : null}
                            onChange={(d) => saveInvoiceDate("issued_at", d)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Due</span>
                        <div style={{ width: 156 }}>
                          <DatePicker
                            value={selectedInvoice.due_at ? new Date(selectedInvoice.due_at + "T12:00:00") : null}
                            onChange={(d) => saveInvoiceDate("due_at", d)}
                            placeholder="Pick a due date…"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    [
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
                    ))
                  )}
                </div>
              </div>

              {/* Payment terms & method — top of the body, editable while draft. */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ borderBottom: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}>
                  Payment
                </div>
                <PaymentEditor
                  key={`${selectedInvoice.id}:${editable}`}
                  terms={selectedInvoice.payment_terms ?? ""}
                  method={selectedInvoice.payment_method ?? ""}
                  editable={editable}
                  onSave={saveInvoiceText}
                />
              </div>

              {/* Bill to & project */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <span className="text-[13px] font-semibold flex-1"
                    style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Bill to &amp; project</span>
                  {editable && (
                    <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>Editing — changes save automatically</span>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {/* Project row — the client itself is changed from the header title. */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--color-grey)", width: 64 }}>Project</span>
                    {editable ? (
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
                      key={`${selectedInvoice.client_contact?.id ?? selectedInvoice.client_organization?.id ?? "none"}:${editable}`}
                      email={selectedInvoice.client_contact?.email ?? selectedInvoice.client_organization?.email ?? ""}
                      phone={selectedInvoice.client_contact?.phone ?? selectedInvoice.client_organization?.phone ?? ""}
                      address={selectedInvoice.client_contact?.location ?? selectedInvoice.client_organization?.location ?? ""}
                      editable={editable && !!(selectedInvoice.client_contact || selectedInvoice.client_organization)}
                      onSave={saveClientField}
                    />
                  </div>

                  {/* Show-on-invoice toggle */}
                  <button type="button" onClick={editable ? toggleShowClientInfo : undefined}
                    disabled={!editable}
                    className="flex items-center gap-2 mt-1 text-left"
                    style={{ cursor: editable ? "pointer" : "default" }}>
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
                        style={{ color: "var(--color-sage)", border: "0.5px solid rgba(var(--color-sage-rgb),0.4)", background: "rgba(var(--color-sage-rgb),0.06)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(var(--color-sage-rgb),0.12)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(var(--color-sage-rgb),0.06)")}>
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
                  // Open-by-default editable row while editable; read-only otherwise.
                  if (editable) {
                    return (
                      <LineItemEditableRow key={li.id} li={li}
                        onSave={saveLineItem}
                        onDelete={() => deleteLineItem(li.id)} />
                    );
                  }
                  return (
                    <div key={li.id} className="grid items-center px-4 py-3"
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
                      <div />
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
                {/* Add line item — only while editable */}
                {editable && (addingLine ? (
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
                ))}
              </div>

              {/* Attachments */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <span className="text-[13px] font-semibold flex-1"
                    style={{ color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Attachments</span>
                  {editable && (
                    <>
                      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) addAttachment(f); e.target.value = ""; }} />
                      <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAttachment}
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                        style={{ color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-off-white)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <Paperclip size={10} /> {uploadingAttachment ? "Uploading…" : "Add file"}
                      </button>
                    </>
                  )}
                </div>
                {(selectedInvoice.attachments ?? []).length === 0 ? (
                  <p className="px-4 py-3 text-[11px] italic" style={{ color: "var(--color-grey)" }}>
                    {editable ? "Attach receipts, contracts, or other files for the client." : "No attachments."}
                  </p>
                ) : (selectedInvoice.attachments ?? []).map((att) => (
                  <div key={att.id} className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                    <Paperclip size={12} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                      className="text-[12px] flex-1 truncate hover:underline" style={{ color: "var(--color-charcoal)" }}>{att.name}</a>
                    {att.source === "expense_receipt" && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: "rgba(220,153,13,0.10)", color: "var(--color-dark-orange)" }}>Receipt</span>
                    )}
                    {editable && (
                      <button onClick={() => removeAttachment(att)}
                        className="text-[10px] w-5 h-5 flex items-center justify-center rounded"
                        style={{ color: "var(--color-red-orange)" }} title="Remove attachment">✕</button>
                    )}
                  </div>
                ))}
                {attachmentError && (
                  <p className="px-4 py-2 text-[11px]" style={{ color: "var(--color-red-orange)" }}>{attachmentError}</p>
                )}
              </div>

              {/* Notes — always-open editor */}
              <div className="rounded-xl overflow-hidden"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
                <div className="px-4 py-2.5" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Notes</p>
                </div>
                <NotesEditor
                  key={`${selectedInvoice.id}:${editable}`}
                  value={selectedInvoice.notes ?? ""}
                  editable={editable}
                  onSave={(v) => saveInvoiceText("notes", v)}
                />
              </div>
            </div>
            </div>
            )}
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
      boxShadow: "0 8px 24px rgba(var(--color-charcoal-rgb),0.12)",
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
              style={{ background: "rgba(var(--color-charcoal-rgb),0.03)" }}>
              <Clock size={10} style={{ color: "var(--color-sage)" }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Time</span>
            </div>
            {pullableTime.map((e) => {
              const on = pickedT.has(e.id);
              return (
                <button key={e.id} type="button" onClick={() => toggleT(e.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  style={{ borderBottom: "0.5px solid var(--color-border)", background: on ? "rgba(var(--color-sage-rgb),0.10)" : "transparent" }}>
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
              style={{ background: "rgba(var(--color-charcoal-rgb),0.03)" }}>
              <Receipt size={10} style={{ color: "var(--color-dark-orange)" }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>Expenses</span>
            </div>
            {pullableExpenses.map((x) => {
              const on = pickedE.has(x.id);
              return (
                <button key={x.id} type="button" onClick={() => toggleE(x.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  style={{ borderBottom: "0.5px solid var(--color-border)", background: on ? "rgba(var(--color-sage-rgb),0.10)" : "transparent" }}>
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

// ─── Payment editor ───────────────────────────────────────────────────────────
// Terms + method. Editable inputs (commit on blur) while draft; read-only
// rows otherwise. Keyed by invoice id upstream so drafts reset cleanly.

function PaymentEditor({ terms, method, editable, onSave }: {
  terms: string;
  method: string;
  editable: boolean;
  onSave: (field: "payment_terms" | "payment_method", value: string) => void;
}) {
  const [t, setT] = useState(terms);
  const [m, setM] = useState(method);

  if (!editable) {
    return (
      <div className="p-4 flex flex-col gap-2.5">
        {[{ label: "Terms", value: terms || "—" }, { label: "Method", value: method || "—" }].map((r) => (
          <div key={r.label} className="flex items-baseline justify-between text-[11px]">
            <span style={{ color: "var(--color-grey)" }}>{r.label}</span>
            <span style={{ color: "var(--color-charcoal)", fontWeight: 500 }}>{r.value}</span>
          </div>
        ))}
      </div>
    );
  }

  const fieldStyle = { background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" };
  return (
    <div className="p-4 flex gap-3">
      <div className="flex-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>Payment terms</label>
        <input value={t} onChange={(e) => setT(e.target.value)}
          onBlur={() => { if (t.trim() !== terms.trim()) onSave("payment_terms", t); }}
          placeholder="Net 14"
          className="w-full px-2.5 py-1.5 text-[12px] rounded-lg focus:outline-none" style={fieldStyle} />
      </div>
      <div className="flex-1">
        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>Payment method</label>
        <input value={m} onChange={(e) => setM(e.target.value)}
          onBlur={() => { if (m.trim() !== method.trim()) onSave("payment_method", m); }}
          placeholder="Bank transfer"
          className="w-full px-2.5 py-1.5 text-[12px] rounded-lg focus:outline-none" style={fieldStyle} />
      </div>
    </div>
  );
}

// ─── Notes editor ─────────────────────────────────────────────────────────────
// Open textarea (commits on blur) while editable; read-only text otherwise.
// Keyed by invoice id + editable upstream so it resets cleanly.

function NotesEditor({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  if (!editable) {
    return (
      <div className="px-4 py-3">
        {value.trim()
          ? <p className="text-[11px]" style={{ color: "var(--color-grey)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{value}</p>
          : <p className="text-[11px] italic" style={{ color: "var(--color-grey)" }}>No notes.</p>}
      </div>
    );
  }
  return (
    <div className="p-3">
      <textarea value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v.trim() !== value.trim()) onSave(v); }}
        rows={4}
        placeholder="Payment instructions, bank details, thank-you note…"
        className="w-full px-3 py-2 text-[12px] rounded-lg focus:outline-none resize-none"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
    </div>
  );
}

// ─── Line item editable row ────────────────────────────────────────────────────
// Open-by-default editable row (description / qty / rate). Commits on blur;
// amount is recomputed live. Keyed by line id upstream.

function LineItemEditableRow({ li, onSave, onDelete }: {
  li: InvoiceLineItem;
  onSave: (id: string, patch: { description: string; quantity: number; rate: number }) => void;
  onDelete: () => void;
}) {
  const [desc, setDesc] = useState(li.description);
  const [qty, setQty]   = useState(String(li.quantity));
  const [rate, setRate] = useState(String(li.rate));
  const q = parseFloat(qty) || 0;
  const r = parseFloat(rate) || 0;
  const commit = () => {
    if (desc.trim() !== li.description || q !== Number(li.quantity) || r !== Number(li.rate)) {
      onSave(li.id, { description: desc.trim() || "—", quantity: q, rate: r });
    }
  };
  const cell = { background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" };
  return (
    <div className="group grid items-center px-4 py-2" style={{ gridTemplateColumns: LINE_GRID, borderBottom: "0.5px solid var(--color-border)" }}>
      <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={commit}
        placeholder="Description"
        className="mr-2 px-2 py-1.5 text-[12px] rounded-lg focus:outline-none" style={cell} />
      <input value={qty} onChange={(e) => setQty(e.target.value)} onBlur={commit}
        type="number" min="0" step="0.1"
        className="ml-auto w-16 px-2 py-1.5 text-[12px] rounded-lg focus:outline-none text-right tabular-nums" style={cell} />
      <input value={rate} onChange={(e) => setRate(e.target.value)} onBlur={commit}
        type="number" min="0"
        className="ml-auto w-20 px-2 py-1.5 text-[12px] rounded-lg focus:outline-none text-right tabular-nums" style={cell} />
      <span className="text-[13px] font-semibold tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>{fmtCurrency(q * r)}</span>
      <button onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-[10px] w-5 h-5 ml-auto flex items-center justify-center rounded transition-opacity"
        style={{ color: "var(--color-red-orange)" }} title="Remove line">✕</button>
    </div>
  );
}

// ─── Invoice activity timeline ──────────────────────────────────────────────────
// Milestone feed for sent/paid/voided invoices — created → sent → paid (or
// voided), plus a "next step" hint. Derived from the invoice's timestamps.

function fmtWhen(s: string | null): string | null {
  if (!s) return null;
  const d = s.length <= 10 ? new Date(s + "T12:00:00") : new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function InvoiceActivity({ invoice }: { invoice: Invoice }) {
  const overdue = isOverdue(invoice);
  type Ev = { label: string; at: string | null; color: string };
  const events: Ev[] = [
    { label: "Invoice created", at: invoice.created_at, color: "var(--color-grey)" },
  ];
  if (invoice.sent_at) {
    events.push({ label: "Sent to client", at: invoice.sent_at, color: "var(--color-amber-solid)" });
  } else if (invoice.status === "sent" || invoice.status === "paid") {
    events.push({ label: "Sent to client", at: null, color: "var(--color-amber-solid)" });
  }
  if (invoice.status === "paid") events.push({ label: "Payment received", at: invoice.paid_at, color: "var(--color-sage)" });
  if (invoice.status === "voided") events.push({ label: "Voided", at: invoice.voided_at, color: "var(--color-grey)" });

  let next: string | null = null;
  if (invoice.status === "sent") next = overdue ? "Awaiting payment — past due" : "Awaiting payment";
  else if (invoice.status === "paid") next = "Complete — paid in full";
  else if (invoice.status === "voided") next = "This invoice is void";

  const cardShadow = "0 2px 8px rgba(var(--color-charcoal-rgb),0.04)";
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", boxShadow: cardShadow }}>
      <div className="px-4 py-3 text-[13px] font-semibold" style={{ borderBottom: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "var(--font-display)" }}>Activity</div>
      <div className="p-4">
        {events.map((e, i) => {
          const hasMore = i < events.length - 1 || !!next;
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center" style={{ width: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: e.color, marginTop: 3, flexShrink: 0 }} />
                {hasMore && <span style={{ width: 1, flex: 1, background: "var(--color-border)", marginTop: 3 }} />}
              </div>
              <div style={{ paddingBottom: hasMore ? 16 : 0 }}>
                <p className="text-[12px] font-medium" style={{ color: "var(--color-charcoal)" }}>{e.label}</p>
                <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>{fmtWhen(e.at) ?? "Date not recorded"}</p>
              </div>
            </div>
          );
        })}
        {next && (
          <div className="flex gap-3">
            <div className="flex flex-col items-center" style={{ width: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "transparent", border: "1.5px solid var(--color-border)", marginTop: 3, flexShrink: 0 }} />
            </div>
            <div>
              <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>{next}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PDF preview ────────────────────────────────────────────────────────────────
// Sent / paid / voided invoices show the invoice exactly as the client sees
// it when they open the emailed link — the public /i/[token] page, embedded
// in an iframe. Falls back to the chrome-free print preview if the invoice
// has no public token yet (e.g. voided before it was ever sent).

function InvoicePdfPreview({ token, invoiceId, voided }: { token: string | null; invoiceId: string; voided: boolean }) {
  const src = token ? `/i/${token}?preview=1` : `/invoice/${invoiceId}/print?preview=1`;
  return (
    <div className="relative w-full h-full" style={{ minHeight: 480 }}>
      <iframe
        title="Invoice preview"
        src={src}
        className="w-full h-full"
        style={{ border: "none", minHeight: 480, background: "transparent" }}
      />
      {/* Only the print fallback needs an overlay — the /i/[token] page shows
          its own voided state. */}
      {voided && !token && (
        <div className="absolute inset-0 flex items-start justify-center pointer-events-none" style={{ paddingTop: 80 }}>
          <span className="text-[64px] font-bold tracking-widest"
            style={{ color: "rgba(var(--color-red-rgb),0.18)", transform: "rotate(-18deg)", fontFamily: "var(--font-display)" }}>
            VOID
          </span>
        </div>
      )}
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
    <div className="absolute left-0 mt-1 rounded-xl overflow-hidden z-30"
      style={{ top: "100%", width: 280, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", boxShadow: "0 8px 24px rgba(var(--color-charcoal-rgb),0.14)" }}>
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
            boxShadow: "0 4px 12px rgba(var(--color-charcoal-rgb),0.18)",
          }}
        >
          {toast}
        </span>
      )}
    </div>
  );
}
