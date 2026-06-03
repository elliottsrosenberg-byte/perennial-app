"use client";

// Banking — unified transaction table.
//
// One filterable, sortable, paginated list of every bank_transactions row
// the user has, modeled after Rocket Money. Filters live above the table;
// each row expands inline for the per-tx actions (log expense, mark
// personal, match invoice, attach receipt, note). The underlying review
// semantics (`needs_review` = not personal AND no linked expense AND no
// matched invoice) are unchanged — just collapsed into one surface.
//
// The Plaid + Teller connect flows are carried over verbatim from the
// segmented version; only the data layer and presentation are new.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Script from "next/script";
import {
  Check, ChevronRight, Link2, Loader2, MoreHorizontal, Paperclip, Plus, RefreshCw,
  Trash2, Unplug, X,
  // Category-chip icons (lookup by name from plaidCategoryDisplay):
  ArrowDownToLine, ArrowLeftRight, Briefcase, Car, HeartPulse, Landmark, Laptop,
  Lightbulb, Music, Plane, Receipt as ReceiptIcon, ShoppingBag, Tag,
  User as UserIcon, Utensils, Wrench,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Menu from "@/components/ui/Menu";
import Select from "@/components/ui/Select";
import AddExpenseModal from "./AddExpenseModal";
import ManualTransactionModal from "./ManualTransactionModal";
import BankingReports from "./BankingReports";
import CustomizeCategoriesModal from "./CustomizeCategoriesModal";
import type { BankAccount, BankTransaction, Expense, ExpenseCategory, Project } from "@/types/database";
import {
  categoryFor, canonicalByKey, expenseForCategory,
  CANONICAL_CATEGORIES,
} from "./plaidCategoryDisplay";
import { uploadReceipt, deleteReceipt } from "@/lib/uploads/receipt";
import { createClient } from "@/lib/supabase/client";
import {
  parseCustomCategories, tintForColor, findCustom,
  type CustomCategory,
} from "@/lib/finance/customCategories";

const PROVIDER = (process.env.NEXT_PUBLIC_BANK_PROVIDER ?? "plaid") as "plaid" | "teller";
const API_BASE = `/api/integrations/${PROVIDER}`;

// ── Provider SDK shims (verbatim from previous design) ──────────────────────

declare global {
  interface Window {
    TellerConnect?: { setup: (config: TellerConnectConfig) => { open: () => void } };
    Plaid?:         { create: (config: PlaidLinkConfig)     => { open: () => void } };
  }
}
interface TellerConnectConfig {
  applicationId: string;
  environment:   string;
  onSuccess:     (enrollment: TellerEnrollment) => void;
  onExit?:       () => void;
}
interface TellerEnrollment {
  accessToken: string;
  user: { id: string };
  enrollment: { id: string; institution: { name: string } };
}
interface PlaidLinkConfig {
  token:     string;
  onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void;
  onExit?:   (err: PlaidLinkError | null, metadata: PlaidLinkMetadata | null) => void;
  onLoad?:   () => void;
}
interface PlaidLinkMetadata {
  institution: { name: string; institution_id: string } | null;
  accounts:    { id: string; name: string; mask: string | null; type: string; subtype: string | null }[];
  link_session_id: string;
}
interface PlaidLinkError { error_code: string; error_message: string }

// ── Server payload types ────────────────────────────────────────────────────

interface KpiPayload {
  in_this_month:  number;
  out_this_month: number;
  net:            number;
}
type StatusCounts = Record<"all" | "needs_review" | "logged" | "matched" | "personal", number>;
interface TransactionsResponse {
  transactions: BankTransaction[];
  total:        number;
  page:         number;
  pageSize:     number;
  kpis:         KpiPayload;
  counts:       StatusCounts;
}
interface OutstandingInvoice {
  id:     string;
  number: number;
  client: string;
  total:  number;
}

/** Item from /api/finance/banking/queue#invoice_activity — a credit
 *  bank row with zero-or-more suggested outstanding invoice matches
 *  (the queue route uses a $1 tolerance). We surface the first
 *  suggestion as an inline auto-match banner above the table; the
 *  user dismisses per-credit for the session. */
interface InvoiceActivityRow extends BankTransaction {
  suggested_invoices: {
    id:     string;
    number: number;
    client: string;
    total:  number;
  }[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number, opts: { dp?: number; sign?: boolean } = {}) {
  const dp = opts.dp ?? 2;
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtShortDate(ds: string): string {
  // M/D — matches the Rocket Money reference.
  const d = new Date(ds + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtLongDate(ds: string): string {
  return new Date(ds + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function trimAccountName(name: string): string {
  if (!name) return "Account";
  let n = name.replace(/^[A-Z][a-z]+\s+(Express|Bank|Card|Credit|Savings)\s*-\s*/, "");
  n = n.replace(/\bPlaid\b\s+/g, "");
  n = n.replace(/\bGold Standard 0% Interest\b/g, "");
  n = n.replace(/\s{2,}/g, " ").trim();
  if (n.length > 28) n = n.slice(0, 26).trimEnd() + "…";
  return n || name;
}
function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setOut(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return out;
}

const CARD_STYLE: React.CSSProperties = {
  background:   "var(--color-off-white)",
  border:       "0.5px solid var(--color-border)",
  borderRadius: 12,
  boxShadow:    "0 2px 8px rgba(31,33,26,0.04)",
};
const SECTION_HEADER_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize:   13,
  fontWeight: 600,
  color:      "var(--color-charcoal)",
  letterSpacing: "-0.01em",
};

// ── Category icon registry ──────────────────────────────────────────────────
// plaidCategoryDisplay returns icon NAMES (so it can stay framework-free);
// resolve them here.
const ICON_REGISTRY: Record<string, React.ElementType> = {
  ArrowDownToLine, ArrowLeftRight, Briefcase, Car, HeartPulse, Landmark, Laptop,
  Lightbulb, Music, Plane, Receipt: ReceiptIcon, ShoppingBag, Tag, User: UserIcon, Utensils, Wrench,
};

// Display labels for a manual transaction's payment_method.
const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash", venmo: "Venmo", card: "Card", bank: "Bank account", other: "Manual",
};

// ── Filter / sort types ─────────────────────────────────────────────────────

type StatusFilter = "all" | "needs_review" | "logged" | "matched" | "personal";
type TypeFilter   = "all" | "debit" | "credit";
type SortKey      = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

// Pipeline order, left→right: incoming review → the two ways to handle a
// row (log as expense / match to a paid invoice) → excluded → everything.
// Logged + Matched carry an icon that mirrors their action.
const STATUS_OPTIONS: { value: StatusFilter; label: string; icon?: React.ElementType }[] = [
  { value: "needs_review", label: "To review" },
  { value: "logged",       label: "Logged",   icon: ReceiptIcon },
  { value: "matched",      label: "Matched",  icon: Link2       },
  { value: "personal",     label: "Personal"  },
  { value: "all",          label: "All"       },
];
const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all",    label: "All types" },
  { value: "debit",  label: "Debits"    },
  { value: "credit", label: "Credits"   },
];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date_desc",   label: "Date · newest" },
  { value: "date_asc",    label: "Date · oldest" },
  { value: "amount_desc", label: "Amount · high" },
  { value: "amount_asc",  label: "Amount · low"  },
];

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onExpenseCreated:    (e: Expense) => void;
  /** For the manual-expense + edit-linked-expense flows that mutate
   *  the parent's expense cache. Both are no-ops for the create flow
   *  driven by the inline "Save as expense" form (that one goes
   *  through onExpenseCreated). */
  onExpenseUpdated?:   (e: Expense) => void;
  onExpenseDeleted?:   (id: string) => void;
  onInvoiceMarkedPaid: (invoiceId: string, paidAt: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BankingTab({ projects, onExpenseCreated, onExpenseUpdated, onExpenseDeleted, onInvoiceMarkedPaid }: Props) {
  const [accounts, setAccounts]                   = useState<BankAccount[]>([]);
  const [transactions, setTransactions]           = useState<BankTransaction[]>([]);
  const [total, setTotal]                         = useState(0);
  const [kpis, setKpis]                           = useState<KpiPayload>({ in_this_month: 0, out_this_month: 0, net: 0 });
  const [statusCounts, setStatusCounts]           = useState<StatusCounts>({ all: 0, needs_review: 0, logged: 0, matched: 0, personal: 0 });
  const [outstanding, setOutstanding]             = useState<OutstandingInvoice[]>([]);
  // Auto-match suggestions from the queue route. Only credits whose
  // amount matches an outstanding invoice within tolerance land here;
  // we render up to 3 inline banners above the filter bar. Dismissals
  // are session-local (cleared on reload by design — a fresh page
  // load should re-surface anything the user didn't act on).
  const [invoiceActivity, setInvoiceActivity]     = useState<InvoiceActivityRow[]>([]);
  const [dismissedMatches, setDismissedMatches]   = useState<Set<string>>(new Set());

  const [loading, setLoading]                     = useState(true);
  const [syncing, setSyncing]                     = useState(false);
  const [tableLoading, setTableLoading]           = useState(false);
  const [connecting, setConnecting]               = useState(false);
  const [scriptReady, setScriptReady]             = useState(false);
  const [error, setError]                         = useState<string | null>(null);

  // Filter / sort / page state
  const [status, setStatus]     = useState<StatusFilter>("needs_review");
  const [account, setAccount]   = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [txType, setTxType]     = useState<TypeFilter>("all");
  const [searchRaw, setSearchRaw] = useState<string>("");
  const search = useDebounced(searchRaw, 300);
  const [sort, setSort]         = useState<SortKey>("date_desc");
  const [page, setPage]         = useState(1);
  const pageSize = 20;

  // In-tab subview toggle: Transactions (the unified table) vs Reports
  // (the placeholder analytics shell). Kept local — there's no URL
  // contract for these yet; if/when we want to deep-link into Reports,
  // promote this to a search-param.
  const [subTab, setSubTab] = useState<"transactions" | "reports">("transactions");

  // Per-row UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // `convertTarget` is still here for parity (the AddExpenseModal-based
  // log flow), but the new path is the inline form inside ExpandedRow.
  // We keep the modal pathway dormant for now — useful as a fallback
  // if the inline form ever proves too cramped on small viewports.
  const [convertTarget, setConvertTarget] = useState<BankTransaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // "+ Add manual expense" button in the header opens AddExpenseModal
  // with no prefill. The created row goes through onExpenseCreated;
  // it isn't linked to any bank_transaction so it never appears in the
  // Banking table — it lives in the expenses cache and can still be
  // pulled into an invoice via NewInvoiceModal.
  const [manualExpenseOpen, setManualExpenseOpen] = useState(false);

  // For editing the expense already linked to a bank row. We fetch the
  // expense row on demand (rather than holding the full expenses array
  // as a prop) so the BankingTab surface stays self-contained.
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<{
    tx: BankTransaction;
    expenseId: string;
  } | null>(null);

  // User-defined custom categories (from profiles.custom_categories).
  // Merged with built-ins in the row picker and used by the chip renderer
  // when a row's manual_custom_id points at one. Loaded once on mount.
  const [customs, setCustoms] = useState<CustomCategory[]>([]);
  const [headerMenuOpen, setHeaderMenuOpen]   = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [customizeOpen, setCustomizeOpen]     = useState(false);
  // Bulk category drop-up (in the selection ribbon).
  const [ribbonCatOpen, setRibbonCatOpen]     = useState(false);
  // Two-click confirm for the destructive-ish ribbon actions.
  const [pendingAction, setPendingAction]     = useState<"log" | "personal" | null>(null);
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("custom_categories")
        .eq("user_id", user.id)
        .maybeSingle();
      setCustoms(parseCustomCategories(data?.custom_categories));
    })();
  }, []);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) setHeaderMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHeaderMenuOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [headerMenuOpen]);
  const [snackbar, setSnackbar] = useState<{ text: string; onUndo?: () => void } | null>(null);
  // Auto-dismiss snackbars after 4s unless they carry an Undo.
  useEffect(() => {
    if (!snackbar || snackbar.onUndo) return;
    const id = window.setTimeout(() => setSnackbar(null), 4000);
    return () => window.clearTimeout(id);
  }, [snackbar]);

  const tellerAppId = process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID ?? "";
  const tellerEnv   = process.env.NEXT_PUBLIC_TELLER_ENVIRONMENT ?? "sandbox";
  const plaidEnv    = process.env.NEXT_PUBLIC_PLAID_ENV ?? "sandbox";

  // ── Data fetchers ─────────────────────────────────────────────────────────

  const reqIdRef = useRef(0);
  const fetchTransactions = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setTableLoading(true);
    try {
      const params = new URLSearchParams({
        status, account, category, type: txType, sort,
        page:     String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/finance/banking/transactions?${params.toString()}`);
      if (myReqId !== reqIdRef.current) return; // a newer request superseded us
      if (!res.ok) { setError("Couldn't load transactions."); return; }
      const data: TransactionsResponse = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
      setKpis(data.kpis);
      if (data.counts) setStatusCounts(data.counts);
    } finally {
      if (myReqId === reqIdRef.current) setTableLoading(false);
    }
  }, [status, account, category, txType, search, sort, page]);

  // Pulls accounts + runs the Plaid sync (the GET /transactions on the
  // provider route does that on every read), then loads the new table data.
  const initialLoad = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const [acctRes, syncRes, invRes] = await Promise.all([
        fetch(`${API_BASE}/accounts`),
        fetch(`${API_BASE}/transactions`),
        fetch(`/api/finance/banking/queue`), // still the simplest way to get outstanding invoices
      ]);
      if (acctRes.status === 503 || syncRes.status === 503) {
        const res = acctRes.status === 503 ? acctRes : syncRes;
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `${PROVIDER} isn't fully configured yet.`);
      }
      if (acctRes.ok) { const { accounts: a } = await acctRes.json(); setAccounts(a ?? []); }
      if (invRes.ok) {
        const data = await invRes.json() as {
          outstanding_invoices?: OutstandingInvoice[];
          invoice_activity?:     InvoiceActivityRow[];
        };
        setOutstanding(data.outstanding_invoices ?? []);
        setInvoiceActivity(data.invoice_activity ?? []);
      }
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { initialLoad(); }, [initialLoad]);
  // After the initial load resolves accounts, fetch the table.
  useEffect(() => { if (!loading) fetchTransactions(); }, [loading, fetchTransactions]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setPage(1); }, [status, account, category, txType, search, sort]);
  // Drop any pending ribbon confirm when the selection changes.
  useEffect(() => { setPendingAction(null); }, [selectedIds]);

  // Provider SDK probe (verbatim).
  useEffect(() => {
    if (scriptReady) return;
    if (typeof window === "undefined") return;
    const probe = () => PROVIDER === "plaid" ? !!window.Plaid : !!window.TellerConnect;
    if (probe()) { setScriptReady(true); return; }
    let elapsed = 0;
    const id = window.setInterval(() => {
      if (probe()) { setScriptReady(true); window.clearInterval(id); return; }
      elapsed += 250;
      if (elapsed >= 15000) {
        window.clearInterval(id);
        setError(`${PROVIDER === "plaid" ? "Plaid Link" : "Teller Connect"} failed to load. Check your network or disable any script blockers, then refresh.`);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [scriptReady]);

  // ── Provider connect flows (verbatim) ─────────────────────────────────────

  async function openConnect() {
    setError(null);
    if (PROVIDER === "plaid") return openPlaidLink();
    return openTellerConnect();
  }
  async function openPlaidLink() {
    if (!window.Plaid) { setError("Plaid Link is still loading — try again in a moment."); return; }
    setConnecting(true);
    let linkToken: string;
    try {
      const tokRes = await fetch(`${API_BASE}/link-token`, { method: "POST" });
      if (!tokRes.ok) {
        const j = await tokRes.json().catch(() => ({}));
        setError(j?.error ?? `Failed to create link token (${tokRes.status})`);
        setConnecting(false);
        return;
      }
      linkToken = (await tokRes.json()).link_token as string;
    } catch (e) {
      setError(e instanceof Error ? `Failed to start Plaid Link: ${e.message}` : "Failed to start Plaid Link");
      setConnecting(false);
      return;
    }
    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          const res = await fetch(`${API_BASE}/enroll`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_token:     publicToken,
              institution_name: metadata.institution?.name ?? "Bank",
              institution_id:   metadata.institution?.institution_id ?? null,
              accounts:         metadata.accounts.map(a => ({ id: a.id, name: a.name, mask: a.mask ?? "" })),
            }),
          });
          if (!res.ok) {
            let body: string;
            try { body = (await res.json() as { error?: string }).error ?? `HTTP ${res.status}`; }
            catch { body = (await res.text()) || `HTTP ${res.status}`; }
            setError(body);
          } else {
            await initialLoad();
            await fetchTransactions();
          }
        } catch (err) {
          console.error("[BankingTab/plaid] enroll failed:", err);
          setError(err instanceof Error ? `Connection failed: ${err.message}` : "Connection failed");
        } finally {
          setConnecting(false);
        }
      },
      onExit: (err) => {
        setConnecting(false);
        if (err) setError(err.error_message || "Connection cancelled");
      },
    });
    handler.open();
  }
  function openTellerConnect() {
    if (!window.TellerConnect) { setError("Teller Connect is still loading — try again in a moment."); return; }
    if (!tellerAppId)          { setError("Teller App ID not configured."); return; }
    const teller = window.TellerConnect.setup({
      applicationId: tellerAppId,
      environment:   tellerEnv,
      onSuccess: async (enrollment) => {
        setConnecting(true);
        try {
          const res = await fetch(`${API_BASE}/enroll`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken:     enrollment.accessToken,
              enrollmentId:    enrollment.enrollment.id,
              institutionName: enrollment.enrollment.institution.name,
            }),
          });
          if (!res.ok) {
            let body: string;
            try { body = (await res.json() as { error?: string }).error ?? `HTTP ${res.status}`; }
            catch { body = (await res.text()) || `HTTP ${res.status}`; }
            setError(body);
          } else {
            await initialLoad();
            await fetchTransactions();
          }
        } catch (err) {
          console.error("[BankingTab/teller] enroll failed:", err);
          setError(err instanceof Error ? `Connection failed: ${err.message}` : "Connection failed");
        } finally {
          setConnecting(false);
        }
      },
      onExit: () => setConnecting(false),
    });
    teller.open();
  }

  // Disconnect a single account. The provider DELETE supports ?id=<acctId>
  // and tears down the parent Plaid Item if it was the last account on it.
  async function disconnectAccount(acctId: string) {
    const prev = accounts;
    setAccounts((rows) => rows.filter((a) => a.id !== acctId));
    const res = await fetch(`${API_BASE}/accounts?id=${encodeURIComponent(acctId)}`, { method: "DELETE" });
    if (!res.ok) {
      setAccounts(prev);
      setError("Couldn't disconnect that account.");
      return;
    }
    // Pull fresh table state — server cascaded the tx rows.
    await fetchTransactions();
  }

  async function manualSync() {
    setSyncing(true);
    try {
      await fetch(`${API_BASE}/transactions`); // triggers the sync server-side
      await fetchTransactions();
    } finally {
      setSyncing(false);
    }
  }

  // Per-account "Sync this account" — the provider's /transactions endpoint
  // already syncs every Plaid Item the user owns (cursor-based, cheap when
  // there are no deltas), so we fan out the same call and refresh balances.
  async function syncAccount() {
    await manualSync();
    await initialLoad();
  }

  // ── Optimistic mutators ───────────────────────────────────────────────────

  function patchLocal(id: string, patch: Partial<BankTransaction>) {
    setTransactions((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  async function markPersonal(tx: BankTransaction, isPersonal: boolean) {
    const prev = { is_personal: tx.is_personal };
    patchLocal(tx.id, { is_personal: isPersonal });
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/personal`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_personal: isPersonal }),
    });
    if (!res.ok) {
      patchLocal(tx.id, prev);
      setError("Couldn't update transaction — refreshing.");
      await fetchTransactions();
      return;
    }
    // The row may no longer belong in the current filter (a personal row
    // leaves To-review, an un-personal'd one leaves Personal) and the pill
    // counts shifted — reconcile both.
    await fetchTransactions();
  }

  async function matchInvoice(tx: BankTransaction, invoiceId: string) {
    patchLocal(tx.id, { matched_invoice_id: invoiceId });
    setOutstanding((rows) => rows.filter((i) => i.id !== invoiceId));
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/match-invoice`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ invoice_id: invoiceId }),
    });
    if (!res.ok) {
      patchLocal(tx.id, { matched_invoice_id: null });
      setError("Couldn't match invoice — refreshing.");
      await fetchTransactions();
      return;
    }
    onInvoiceMarkedPaid(invoiceId, tx.date);
    setSnackbar({ text: `Matched to #${outstanding.find(i => i.id === invoiceId)?.number ?? ""}` });
  }

  async function unmatch(tx: BankTransaction) {
    const prevId = tx.matched_invoice_id;
    patchLocal(tx.id, { matched_invoice_id: null });
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/unmatch`, { method: "POST" });
    if (!res.ok) {
      patchLocal(tx.id, { matched_invoice_id: prevId });
      setError("Couldn't unmatch — refreshing.");
      await fetchTransactions();
    }
  }

  async function submitConvert(tx: BankTransaction, values: {
    project_id:  string | null;
    description: string;
    category:    ExpenseCategory;
    amount:      number;
    date:        string;
  }) {
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/convert-to-expense`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        project_id:  values.project_id,
        category:    values.category,
        description: values.description,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { error: j?.error ?? `Failed (HTTP ${res.status})` };
    }
    const { expense } = await res.json() as { expense: Expense };
    patchLocal(tx.id, { linked_expense_id: expense.id });
    onExpenseCreated(expense);
    setSnackbar({ text: "Logged as expense" });
    return { expense };
  }

  // One-click log straight from the needs-review list — no expand, no
  // receipt, no project. Uses the same resolved category the chip shows.
  // The row flips to "Logged" in place; the user can still expand it later
  // to attach a receipt or a project (the richer path we nudge toward).
  async function quickLog(tx: BankTransaction) {
    const primary  = tx.details?.personal_finance_category?.primary ?? null;
    const category = findCustom(customs, tx.manual_custom_id)?.routesTo
      ?? expenseForCategory(tx.manual_category, primary);
    await submitConvert(tx, {
      project_id:  null,
      description: tx.custom_name ?? tx.details?.merchant_name ?? tx.description ?? "Expense",
      category,
      amount:      Math.abs(Number(tx.amount)),
      date:        tx.date,
    });
  }

  // Open AddExpenseModal in edit mode against the expense linked to
  // this bank row. We do a tiny on-demand fetch instead of threading
  // the parent's expenses array down — the modal owns the form state,
  // so all we need is the row to seed it.
  async function openEditLinkedExpense(tx: BankTransaction) {
    if (!tx.linked_expense_id) return;
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("expenses")
      .select("*, project:projects(id, title, type, rate)")
      .eq("id", tx.linked_expense_id)
      .maybeSingle();
    if (err || !data) {
      setError("Couldn't load the linked expense.");
      return;
    }
    setEditingExpense(data as Expense);
  }

  // Delete the expense + unlink the bank row in two steps. We don't
  // wrap in a transaction (Supabase JS can't), so on the rare error
  // between steps the user just sees the bank row still pointing at a
  // (now-missing) expense — they can re-trigger the delete.
  async function deleteLinkedExpense(tx: BankTransaction, expenseId: string) {
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId);
    if (delErr) { setError("Couldn't delete the expense."); return; }
    const { error: linkErr } = await supabase
      .from("bank_transactions")
      .update({ linked_expense_id: null })
      .eq("id", tx.id);
    if (linkErr) { setError("Deleted the expense, but couldn't unlink the bank row — refreshing."); }
    patchLocal(tx.id, { linked_expense_id: null });
    onExpenseDeleted?.(expenseId);
    setSnackbar({ text: "Expense deleted, bank row unlinked" });
  }

  async function saveNote(tx: BankTransaction, note: string | null) {
    const prev = tx.note;
    patchLocal(tx.id, { note });
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/note`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ note }),
    });
    if (!res.ok) {
      patchLocal(tx.id, { note: prev });
      setError("Couldn't save note.");
    }
  }

  // Rename a transaction — sets a custom_name override that wins over the
  // Plaid merchant_name / raw description everywhere the row name shows.
  // Autosaved from the expanded view; doesn't touch the logged-expense flow.
  async function renameTransaction(tx: BankTransaction, name: string | null) {
    const prev = tx.custom_name;
    const next = name && name.trim() ? name.trim() : null;
    if (next === (prev ?? null)) return;
    patchLocal(tx.id, { custom_name: next });
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/name`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ custom_name: next }),
    });
    if (!res.ok) {
      patchLocal(tx.id, { custom_name: prev });
      setError("Couldn't rename transaction.");
    }
  }

  async function setManualCategory(
    tx: BankTransaction,
    next: string | null,
    customId: string | null = null,
  ) {
    const prevCat = tx.manual_category;
    const prevCid = tx.manual_custom_id;
    patchLocal(tx.id, { manual_category: next, manual_custom_id: customId });
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/category`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ manual_category: next, manual_custom_id: customId }),
    });
    if (!res.ok) {
      patchLocal(tx.id, { manual_category: prevCat, manual_custom_id: prevCid });
      setError("Couldn't update category.");
      return;
    }
    // If the user is assigning a real category to a row that was marked
    // personal, also un-mark personal. Otherwise the row stays hidden
    // from rollups even though the user just picked a normal category —
    // there was no path out of "personal" via the picker before.
    if (tx.is_personal && next !== null) {
      await markPersonal(tx, false);
    }
  }

  async function attachReceipt(tx: BankTransaction, file: File) {
    try {
      const up = await uploadReceipt(file);
      const res = await fetch(`/api/finance/banking/transactions/${tx.id}/receipt`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ receipt_url: up.url, receipt_path: up.path }),
      });
      if (!res.ok) throw new Error("save failed");
      patchLocal(tx.id, { receipt_url: up.url, receipt_path: up.path });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receipt upload failed.");
    }
  }

  async function removeReceipt(tx: BankTransaction) {
    const prevUrl  = tx.receipt_url;
    const prevPath = tx.receipt_path;
    patchLocal(tx.id, { receipt_url: null, receipt_path: null });
    try {
      if (prevPath) await deleteReceipt(prevPath);
      const res = await fetch(`/api/finance/banking/transactions/${tx.id}/receipt`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ receipt_url: null, receipt_path: null }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch (e) {
      patchLocal(tx.id, { receipt_url: prevUrl, receipt_path: prevPath });
      setError(e instanceof Error ? e.message : "Couldn't remove receipt.");
    }
  }

  const allVisibleSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id));
  function toggleSelectAll() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(transactions.map((t) => t.id)));
  }

  async function bulkMarkPersonal() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    // Optimistic
    setTransactions((rows) => rows.map((r) => ids.includes(r.id) ? { ...r, is_personal: true } : r));
    setSelectedIds(new Set());
    await Promise.all(ids.map((id) =>
      fetch(`/api/finance/banking/transactions/${id}/personal`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ is_personal: true }),
      }),
    ));
    await fetchTransactions();
  }

  // Bulk-log every selected unhandled debit as an expense (auto category,
  // no project/receipt — same as the row Log button).
  async function bulkLog() {
    const rows = transactions.filter((t) =>
      selectedIds.has(t.id) && Number(t.amount) < 0
      && !t.linked_expense_id && !t.matched_invoice_id && !t.is_personal);
    if (rows.length === 0) return;
    setSelectedIds(new Set());
    await Promise.all(rows.map((t) => quickLog(t)));
    await fetchTransactions();
  }

  // Bulk-assign a category to every selected row. Pass (key, null) for a
  // canonical category or (null, customId) for a custom one.
  async function bulkSetCategory(key: string | null, customId: string | null) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSelectedIds(new Set());
    setTransactions((rows) => rows.map((r) =>
      ids.includes(r.id) ? { ...r, manual_category: key, manual_custom_id: customId } : r));
    await Promise.all(ids.map((id) =>
      fetch(`/api/finance/banking/transactions/${id}/category`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ manual_category: key, manual_custom_id: customId }),
      }),
    ));
    await fetchTransactions();
  }

  // Two-click ribbon action: first click arms the confirm; the pill keeps a
  // FIXED width so the ribbon never reflows — the armed state just splits the
  // same pill into a ✓ / ✕ pair.
  function ribbonConfirm(actionKey: "log" | "personal", label: string, run: () => void, width: number) {
    return (
      <div style={{ width, height: 26, position: "relative", flexShrink: 0 }}>
        {pendingAction === actionKey ? (
          <div className="flex h-full rounded-full overflow-hidden">
            <button onClick={() => { setPendingAction(null); run(); }} title={`Confirm: ${label}`}
              className="flex-1 inline-flex items-center justify-center transition-colors"
              style={{ background: "white", color: "var(--color-sage)", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.88)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "white"}>
              <Check size={14} strokeWidth={2.75} />
            </button>
            <button onClick={() => setPendingAction(null)} title="Cancel"
              className="flex-1 inline-flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.18)", color: "white", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}>
              <X size={13} strokeWidth={2.75} />
            </button>
          </div>
        ) : (
          <button onClick={() => setPendingAction(actionKey)}
            className="w-full h-full text-[11px] font-medium rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.18)", color: "white", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}>
            {label}
          </button>
        )}
      </div>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  // Auto-match banners. Source of truth: queue.invoice_activity rows
  // that (a) have at least one suggested invoice, (b) aren't already
  // matched, and (c) haven't been dismissed in this session. Capped
  // at 3 to avoid swallowing the table; "+N more" affordance is
  // deferred per spec.
  const visibleMatchBanners = useMemo(() => {
    return invoiceActivity
      .filter((r) => r.suggested_invoices.length > 0)
      .filter((r) => !r.matched_invoice_id)
      .filter((r) => !dismissedMatches.has(r.id))
      .slice(0, 3);
  }, [invoiceActivity, dismissedMatches]);

  // When the user marks a credit paid via the banner, we go through the
  // existing matchInvoice mutator (which already updates the table row,
  // the outstanding list, and the parent invoices). We also drop the
  // row from invoiceActivity so the banner disappears immediately.
  async function acceptMatchBanner(row: InvoiceActivityRow, invoiceId: string) {
    setInvoiceActivity((rows) => rows.filter((r) => r.id !== row.id));
    await matchInvoice(row, invoiceId);
  }
  function dismissMatchBanner(rowId: string) {
    setDismissedMatches((s) => {
      const n = new Set(s); n.add(rowId); return n;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart  = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd    = Math.min(page * pageSize, total);

  // Balance rollups for the KPI strip. Cash uses available with a current
  // fallback (Plaid's available reflects holds; not every account exposes
  // it). Credit is rendered as money owed (positive) — the wire value is
  // typically negative for cards, so absolute it.
  const totalCash = useMemo(
    () => accounts
      .filter((a) => a.type === "depository")
      .reduce((sum, a) => sum + (a.balance_available ?? a.balance_current ?? 0), 0),
    [accounts],
  );
  const totalCredit = useMemo(
    () => accounts
      .filter((a) => a.type === "credit")
      .reduce((sum, a) => sum + Math.abs(a.balance_current ?? 0), 0),
    [accounts],
  );

  const accountOptions = useMemo(() => ([
    { value: "all", label: "All accounts" },
    ...accounts.map((a) => ({
      value: a.id,
      label: `${trimAccountName(a.name)}${a.last_four ? ` ••${a.last_four}` : ""}`,
    })),
  ]), [accounts]);

  const categoryOptions = useMemo(() => ([
    { value: "all", label: "All categories" },
    ...CANONICAL_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
  ]), []);

  const envLabel = PROVIDER === "plaid"
    ? (plaidEnv === "production" ? "Live" : plaidEnv === "development" ? "Live (Dev)" : "Sandbox mode")
    : (tellerEnv === "sandbox" ? "Sandbox mode" : "Live");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {PROVIDER === "plaid" ? (
        <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          onLoad={() => setScriptReady(true)} strategy="afterInteractive" />
      ) : (
        <Script src="https://cdn.teller.io/connect/connect.js"
          onLoad={() => setScriptReady(true)} strategy="afterInteractive" />
      )}

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

        {/* ── Header ───────────────────────────────────────────────────── */}
        {/* The top-right Sync / Disconnect / + Add account triple was killed
            in v3: per-account controls now live in each card's ⋯ menu, and
            a dashed "Add account" tile sits at the end of the strip (same
            affordance as adding a new project card to a board). The empty
            state below still owns the first-connect CTA. */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex-1">
            <h2 style={SECTION_HEADER_STYLE}>Banking</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>
              {accounts.length > 0
                ? `${accounts.length} account${accounts.length !== 1 ? "s" : ""} · ${envLabel}${syncing ? " · Syncing…" : ""}`
                : "Connect a bank to start triaging transactions"}
            </p>
          </div>
          {/* Subtab toggle — only meaningful once accounts exist, so
              suppress it until the empty state is dismissed. */}
          {!loading && accounts.length > 0 && (
            <SubTabToggle value={subTab} onChange={setSubTab} />
          )}
          {/* "+ Add transaction" — manually log cash / Venmo / any unlinked
              payment as a real transaction row (provider='manual'), which
              then shows in the list: a debit goes to To-review, a credit can
              be matched to an invoice. */}
          {!loading && accounts.length > 0 && (
            <button
              type="button"
              onClick={() => setManualExpenseOpen(true)}
              className="flex items-center gap-1.5 px-3 transition-colors"
              style={{
                height:        28,
                borderRadius:  999,
                fontSize:      11.5,
                color:         "var(--color-grey)",
                background:    "transparent",
                border:        "0.5px solid var(--color-border)",
                cursor:        "pointer",
                fontFamily:    "inherit",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(31,33,26,0.04)"; e.currentTarget.style.color = "var(--color-charcoal)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-grey)"; }}
            >
              <Plus size={12} strokeWidth={1.75} />
              Add transaction
            </button>
          )}
          {/* Top-level ⋯ menu — sits where Sync / Disconnect used to live
              before they moved into the per-account cards. Currently
              houses the Customize categories action. */}
          <div ref={headerMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((o) => !o)}
              aria-label="Banking options"
              className="flex items-center justify-center rounded transition-colors"
              style={{
                width: 28, height: 28,
                background: headerMenuOpen ? "rgba(31,33,26,0.06)" : "transparent",
                color: "var(--color-grey)",
                border: "none", cursor: "pointer",
              }}
              onMouseEnter={(e) => { if (!headerMenuOpen) e.currentTarget.style.background = "rgba(31,33,26,0.04)"; }}
              onMouseLeave={(e) => { if (!headerMenuOpen) e.currentTarget.style.background = "transparent"; }}
            >
              <MoreHorizontal size={14} />
            </button>
            {headerMenuOpen && (
              <Menu
                items={[
                  {
                    label:   "Customize categories",
                    icon:    Tag,
                    onClick: () => setCustomizeOpen(true),
                  },
                ]}
                onClose={() => setHeaderMenuOpen(false)}
                style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 200, zIndex: 40 }}
              />
            )}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg text-[12px] shrink-0 flex items-start gap-3"
            style={{ background: "rgba(220,62,13,0.07)", color: "var(--color-red-orange)", border: "0.5px solid rgba(220,62,13,0.2)" }}>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} style={{ color: "var(--color-red-orange)" }}>
              <X size={12} />
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center h-48 text-[12px]" style={{ color: "var(--color-grey)" }}>
            Loading banking…
          </div>
        )}

        {/* ── Empty (no accounts) ─────────────────────────────────────── */}
        {!loading && accounts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 rounded-xl"
            style={{ border: "0.5px dashed var(--color-border)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.3">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>
            </svg>
            <div className="text-center">
              <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No bank accounts connected</p>
              <p className="text-[12px]" style={{ color: "var(--color-grey)" }}>Connect a bank to see what needs categorizing and which invoices have landed.</p>
            </div>
            <button onClick={openConnect} disabled={connecting || !scriptReady}
              className="px-5 py-2 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
              style={{ background: "var(--color-sage)" }}>
              {connecting ? "Connecting…" : "Connect your bank"}
            </button>
          </div>
        )}

        {!loading && accounts.length > 0 && subTab === "reports" && (
          <BankingReports />
        )}

        {!loading && accounts.length > 0 && subTab === "transactions" && (
          <>
            {/* ── Accounts strip ─────────────────────────────────────── */}
            {/* Each card carries its own ⋯ menu with Sync + Disconnect for
                that account only. The final dashed tile is the "+ Add
                account" affordance (mirrors the projects board's
                "+ New project" tile). shrink-0 + explicit minHeight
                protects against parent flex-col collapsing the row when
                the table grows tall. */}
            <div className="flex gap-2 overflow-x-auto pb-1 shrink-0"
                 style={{ scrollbarWidth: "thin", minHeight: 76 }}>
              {accounts.map((acct) => (
                <AccountCard
                  key={acct.id}
                  acct={acct}
                  syncing={syncing}
                  onSync={syncAccount}
                  onDisconnect={() => disconnectAccount(acct.id)}
                />
              ))}
              <button
                type="button"
                onClick={openConnect}
                disabled={connecting || !scriptReady}
                data-tour-target="finance.connect-bank"
                className="shrink-0 flex flex-col items-center justify-center gap-1.5 transition-colors"
                style={{
                  minWidth:     168,
                  maxWidth:     208,
                  minHeight:    68,
                  borderRadius: 12,
                  border:       "1px dashed var(--color-border)",
                  background:   "transparent",
                  color:        "var(--color-grey)",
                  cursor:       connecting || !scriptReady ? "not-allowed" : "pointer",
                  opacity:      connecting || !scriptReady ? 0.5 : 1,
                  fontFamily:   "inherit",
                  fontSize:     12,
                }}
                onMouseEnter={(e) => {
                  if (connecting || !scriptReady) return;
                  e.currentTarget.style.borderColor = "var(--color-sage)";
                  e.currentTarget.style.background  = "rgba(155,163,122,0.06)";
                  e.currentTarget.style.color       = "var(--color-sage)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-border)";
                  e.currentTarget.style.background  = "transparent";
                  e.currentTarget.style.color       = "var(--color-grey)";
                }}
              >
                <Plus size={16} strokeWidth={1.75} />
                <span>{connecting ? "Connecting…" : "Add account"}</span>
              </button>
            </div>

            {/* ── KPI cards ─────────────────────────────────────────── */}
            {/* Five-up at typical widths so the eye reads
                balances (cash / credit) → flow (in / out / net) left
                to right. Cash sums depository.balance_available with
                a current-balance fallback; credit sums |credit.current|
                since the wire-level sign is negative (debt). */}
            <div className="grid grid-cols-5 gap-3 shrink-0">
              {[
                { label: "Total cash",     value: fmtCurrency(totalCash,     { dp: 0 }), color: "var(--color-sage)"     },
                { label: "Total credit",   value: fmtCurrency(totalCredit,   { dp: 0 }), color: "#b8860b" },
                { label: "In this month",  value: "+" + fmtCurrency(kpis.in_this_month,  { dp: 0 }), color: "var(--color-sage)" },
                { label: "Out this month", value: "−" + fmtCurrency(kpis.out_this_month, { dp: 0 }), color: "var(--color-charcoal)" },
                {
                  label: "Net",
                  value: (kpis.net >= 0 ? "+" : "−") + fmtCurrency(kpis.net, { dp: 0 }),
                  color: kpis.net >= 0 ? "var(--color-sage)" : "var(--color-red-orange)",
                },
              ].map((s) => (
                <div key={s.label} className="px-4 py-3" style={CARD_STYLE}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>{s.label}</p>
                  <p className="text-[20px] font-semibold tabular-nums" style={{ color: s.color, fontFamily: "var(--font-display)" }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── Auto-match banners ─────────────────────────────────── */}
            {/* Inline, sage-tinted nudge when a credit looks like an
                outstanding invoice payment. "Mark paid" runs the same
                match-invoice mutator the row's expanded view uses;
                "Not this one" dismisses for the session. Stacked up
                to 3; deferred: +N affordance for the longer tail. */}
            {visibleMatchBanners.length > 0 && (
              <div className="flex flex-col gap-2 shrink-0">
                {visibleMatchBanners.map((row) => {
                  const suggestion = row.suggested_invoices[0];
                  return (
                    <div key={row.id}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
                      style={{
                        background: "rgba(155,163,122,0.10)",
                        border:     "0.5px solid rgba(155,163,122,0.35)",
                      }}>
                      <span className="inline-flex items-center justify-center shrink-0"
                        style={{
                          width: 22, height: 22, borderRadius: 999,
                          background: "var(--color-sage)", color: "white",
                          fontSize: 12, fontWeight: 600,
                        }}>
                        ✓
                      </span>
                      <p className="flex-1 text-[12px]" style={{ color: "var(--color-charcoal)" }}>
                        Got <span style={{ fontWeight: 600 }}>+{fmtCurrency(Number(row.amount), { dp: 0 })}</span>
                        {" on "}
                        {new Date(row.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" — looks like "}
                        <span style={{ fontWeight: 600 }}>Invoice #{suggestion.number}</span>
                        {" from "}
                        <span style={{ fontWeight: 600 }}>{suggestion.client}</span>
                        .
                      </p>
                      <button
                        type="button"
                        onClick={() => void acceptMatchBanner(row, suggestion.id)}
                        className="px-3 py-1.5 text-[11.5px] font-medium text-white"
                        style={{ background: "var(--color-sage)", borderRadius: 999, border: "none", cursor: "pointer" }}>
                        Mark paid
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissMatchBanner(row.id)}
                        className="px-3 py-1.5 text-[11.5px] transition-colors"
                        style={{
                          color: "var(--color-grey)",
                          background: "transparent",
                          border: "0.5px solid var(--color-border)",
                          borderRadius: 999,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        Not this one
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Filter / sort bar ─────────────────────────────────── */}
            {/* Sticky so the table can scroll under it. Negative top
                offset cancels the parent's flex-col gap (20px); the
                bottom padding restores breathing room above the table. */}
            <div className="flex items-center gap-2 flex-wrap shrink-0"
              style={{
                position:   "sticky",
                top:        -20,
                zIndex:     10,
                background: "var(--color-warm-white)",
                paddingTop:    10,
                paddingBottom: 10,
                marginTop:    -10,
                marginBottom: -10,
              }}>
              <FilterPills
                value={status}
                options={STATUS_OPTIONS}
                onChange={(v) => setStatus(v)}
                counts={statusCounts}
              />
              <div style={{ width: 168 }}>
                <Select value={account}  onChange={setAccount}  options={accountOptions}  />
              </div>
              <div style={{ width: 184 }}>
                <Select value={category} onChange={setCategory} options={categoryOptions} />
              </div>
              <div style={{ width: 132 }}>
                <Select value={txType}   onChange={(v) => setTxType(v as TypeFilter)} options={TYPE_OPTIONS} />
              </div>
              <div className="flex-1" />
              <input
                type="text"
                value={searchRaw}
                onChange={(e) => setSearchRaw(e.target.value)}
                placeholder="Search transactions…"
                className="px-3 py-2 text-[12px] rounded-lg"
                style={{
                  width: 200,
                  background: "var(--color-surface-sunken)",
                  border:     "0.5px solid var(--color-border)",
                  color:      "var(--color-charcoal)",
                  outline:    "none",
                  fontFamily: "inherit",
                }}
              />
              <div style={{ width: 156 }}>
                <Select value={sort} onChange={(v) => setSort(v as SortKey)} options={SORT_OPTIONS} />
              </div>
            </div>

            {/* Contextual hint — only in the To-review stage, naming the two
                ways to clear a transaction so the pipeline reads clearly. */}
            {status === "needs_review" && transactions.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0 text-[11.5px]"
                style={{ color: "var(--color-grey)", marginTop: -4 }}>
                <span>
                  Clear a transaction by{" "}
                  <span style={{ color: "var(--color-charcoal)", fontWeight: 500 }}>logging it as an expense</span>
                  {" "}(hit Log, or open it to add a receipt) or{" "}
                  <span style={{ color: "var(--color-charcoal)", fontWeight: 500 }}>matching it to a paid invoice</span>.
                </span>
              </div>
            )}

            {/* ── Bulk action bar — floats centered at the bottom, sage in
                both themes with white text. ──────────────────────────── */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3"
                style={{
                  position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
                  zIndex: 60, padding: "9px 12px 9px 18px", borderRadius: 999,
                  background: "var(--color-sage)", color: "white",
                  boxShadow: "0 10px 30px rgba(31,33,26,0.30)",
                }}>
                <span className="text-[12px] font-semibold">{selectedIds.size} selected</span>

                {/* Category — opens a drop-up of the same canonical + custom
                    categories as the row picker, applied to the selection. */}
                <div style={{ position: "relative" }}>
                  <button onClick={() => setRibbonCatOpen((o) => !o)}
                    className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded-full transition-colors"
                    style={{ background: "rgba(255,255,255,0.18)", color: "white", border: "none", cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}>
                    Category <ChevronRight size={11} style={{ transform: "rotate(-90deg)" }} />
                  </button>
                  {ribbonCatOpen && (
                    <>
                      <div onClick={() => setRibbonCatOpen(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 1 }} />
                      <div role="menu"
                        style={{
                          position: "absolute", bottom: "calc(100% + 10px)", left: 0, zIndex: 2,
                          width: 248, maxHeight: 300, overflowY: "auto",
                          display: "grid", gridTemplateColumns: "1fr", gap: 4,
                          background: "var(--color-off-white)", border: "0.5px solid var(--color-border)",
                          borderRadius: 12, boxShadow: "0 -12px 28px rgba(31,33,26,0.18)", padding: 10,
                        }}>
                        {CANONICAL_CATEGORIES.map((opt) => (
                          <PillButton key={opt.key} active={false} bg={opt.bg} fg={opt.fg}
                            icon={ICON_REGISTRY[opt.icon] ?? Tag} label={opt.label}
                            onClick={() => { bulkSetCategory(opt.key, null); setRibbonCatOpen(false); }} />
                        ))}
                        {customs.map((c) => (
                          <PillButton key={c.id} active={false} bg={tintForColor(c.color)} fg={c.color}
                            icon={Tag} label={c.label}
                            onClick={() => { bulkSetCategory(null, c.id); setRibbonCatOpen(false); }} />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {ribbonConfirm("log", "Log", bulkLog, 60)}
                {ribbonConfirm("personal", "Mark personal", bulkMarkPersonal, 112)}
                <button onClick={() => { setRibbonCatOpen(false); setSelectedIds(new Set()); }}
                  className="px-2.5 py-1 text-[11px] rounded-full transition-colors"
                  style={{ background: "transparent", color: "rgba(255,255,255,0.85)", border: "none", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.color = "white"}
                  onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.85)"}>
                  Deselect
                </button>
              </div>
            )}

            {/* ── Transactions table ────────────────────────────────── */}
            <div style={CARD_STYLE}>
              {/* Column header */}
              <div className="grid items-center px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  gridTemplateColumns: `24px 56px 1fr 180px 120px ${status === "needs_review" ? 64 : 18}px`,
                  gap: 12,
                  borderBottom: "0.5px solid var(--color-border)",
                  color: "var(--color-grey)",
                  background: "var(--color-warm-white)",
                }}>
                <span onClick={(e) => e.stopPropagation()}>
                  {transactions.length > 0 && (
                    <SelectCheckbox
                      checked={allVisibleSelected}
                      onToggle={toggleSelectAll}
                    />
                  )}
                </span>
                <span>Date</span>
                <span>Name</span>
                <span>Category</span>
                <span style={{ textAlign: "right" }}>Amount</span>
                <span />
              </div>

              {/* Body */}
              {tableLoading && transactions.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-12 text-[12px]" style={{ color: "var(--color-grey)" }}>
                  <Loader2 size={12} className="animate-spin" /> Loading…
                </div>
              )}
              {!tableLoading && transactions.length === 0 && (
                <EmptyForFilter status={status} />
              )}
              {transactions.map((tx, i) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  first={i === 0}
                  expanded={expandedId === tx.id}
                  selected={selectedIds.has(tx.id)}
                  reviewMode={status === "needs_review"}
                  customs={customs}
                  projects={projects}
                  onToggleSelect={() => {
                    setSelectedIds((s) => {
                      const n = new Set(s);
                      if (n.has(tx.id)) n.delete(tx.id); else n.add(tx.id);
                      return n;
                    });
                  }}
                  onToggleExpand={() => setExpandedId((id) => id === tx.id ? null : tx.id)}
                  onMarkPersonal={() => markPersonal(tx, true)}
                  onConvert={() => setConvertTarget(tx)}
                  onSubmitInlineLog={(values) => submitConvert(tx, values)}
                  onEditLinkedExpense={() => openEditLinkedExpense(tx)}
                  onDeleteLinkedExpense={(expenseId) => setConfirmDeleteExpense({ tx, expenseId })}
                  onQuickLog={() => quickLog(tx)}
                  onMatch={(invoiceId) => matchInvoice(tx, invoiceId)}
                  onUnmatch={() => unmatch(tx)}
                  onUnmarkPersonal={() => markPersonal(tx, false)}
                  onSaveNote={(note) => saveNote(tx, note)}
                  onRename={(name) => renameTransaction(tx, name)}
                  onAttachReceipt={(file) => attachReceipt(tx, file)}
                  onRemoveReceipt={() => removeReceipt(tx)}
                  onSetManualCategory={(c, cid) => setManualCategory(tx, c, cid)}
                  onCustomize={() => setCustomizeOpen(true)}
                  onCollapse={() => setExpandedId(null)}
                  outstanding={outstanding}
                />
              ))}

              {/* Pagination footer.
                  Bottom-left only — the bottom-right corner is reserved
                  for the floating Ash overlay, and bottom-center looks
                  lost on wide screens. Caption sits to the right of the
                  controls so the eye lands on the page indicator first. */}
              <div className="flex items-center gap-3 px-4 py-3 text-[11px]"
                style={{ borderTop: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}>
                <span>
                  {total === 0
                    ? "No transactions"
                    : `Showing ${pageStart}–${pageEnd} of ${total}`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || tableLoading}
                    className="w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
                    style={{ border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
                    <ChevronRight size={12} style={{ transform: "rotate(180deg)" }} />
                  </button>
                  <span style={{ color: "var(--color-charcoal)" }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || tableLoading}
                    className="w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30"
                    style={{ border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" }}>
                    <ChevronRight size={12} />
                  </button>
                </div>
                <div className="flex-1" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Snackbar ───────────────────────────────────────────────── */}
      {snackbar && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg text-[12px]"
          style={{ background: "var(--color-charcoal)", color: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
          <span>{snackbar.text}</span>
          {snackbar.onUndo && (
            <button onClick={snackbar.onUndo}
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-sage)" }}>
              Undo
            </button>
          )}
          <button onClick={() => setSnackbar(null)} style={{ color: "rgba(255,255,255,0.6)" }}>
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Customize categories modal ──────────────────────────────── */}
      {customizeOpen && (
        <CustomizeCategoriesModal
          initial={customs}
          onClose={() => setCustomizeOpen(false)}
          onSaved={setCustoms}
        />
      )}

      {/* ── Manual transaction modal (header "+ Add transaction") ──── */}
      {manualExpenseOpen && (
        <ManualTransactionModal
          today={new Date().toISOString().split("T")[0]}
          accounts={accounts}
          onClose={() => setManualExpenseOpen(false)}
          onCreated={(tx) => {
            setSnackbar({ text: tx.linked_expense_id ? "Logged as expense" : tx.type === "credit" ? "Payment added" : "Transaction added" });
            // Surface it: jump to the filter the new row lands in (Logged if
            // it was Add+Log, otherwise To-review) so it's visible.
            const target: StatusFilter = tx.linked_expense_id ? "logged" : "needs_review";
            if (status !== target) setStatus(target);
            else fetchTransactions();
          }}
        />
      )}

      {/* ── Edit linked expense (from a "Logged as expense" row) ──── */}
      {editingExpense && (
        <AddExpenseModal
          projects={projects}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onCreated={() => { /* unused in edit mode */ }}
          onUpdated={(e) => { onExpenseUpdated?.(e); setSnackbar({ text: "Expense updated" }); }}
        />
      )}

      {/* ── Confirm delete linked expense ──────────────────────────── */}
      <ConfirmDialog
        open={!!confirmDeleteExpense}
        title="Delete this expense?"
        body="The expense will be removed and this bank transaction will be un-logged so you can re-categorize it. Receipts uploaded to the expense will be detached."
        confirmLabel="Delete expense"
        tone="danger"
        onConfirm={() => {
          if (confirmDeleteExpense) {
            void deleteLinkedExpense(confirmDeleteExpense.tx, confirmDeleteExpense.expenseId);
          }
          setConfirmDeleteExpense(null);
        }}
        onCancel={() => setConfirmDeleteExpense(null)}
      />

      {/* ── Convert-to-expense modal (legacy AddExpenseModal flow) ── */}
      {/* Kept dormant — the new ExpandedRow uses an inline form instead.
          This branch never fires from the current UI but stays mounted
          for the rare future case where we want to pop a fuller modal
          (e.g. attaching a receipt before saving). */}
      {convertTarget && (
        <AddExpenseModal
          projects={projects}
          prefill={{
            description: convertTarget.details?.merchant_name ?? convertTarget.description ?? "",
            amount:      Math.abs(Number(convertTarget.amount)),
            date:        convertTarget.date,
            // Resolve to an ExpenseCategory bucket: a custom's routesTo wins,
            // then the canonical override / Plaid mapping.
            category:    findCustom(customs, convertTarget.manual_custom_id)?.routesTo
              ?? expenseForCategory(convertTarget.manual_category, convertTarget.details?.personal_finance_category?.primary ?? null),
          }}
          onSubmitOverride={(values) => submitConvert(convertTarget, values)}
          onClose={() => setConvertTarget(null)}
          onCreated={() => { /* submitConvert already updated parent + table */ }}
        />
      )}

    </>
  );
}

// ── Account card ────────────────────────────────────────────────────────────
// Each connected bank gets its own card with a ⋯ menu carrying Sync +
// Disconnect actions. The menu is anchored under the dots; click-outside
// + Escape close it. Disconnect drops into a ConfirmDialog so a misclick
// can't nuke an Item's history.

interface AccountCardProps {
  acct: BankAccount;
  syncing: boolean;
  onSync: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}

function AccountCard({ acct, syncing, onSync, onDisconnect }: AccountCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Coordinates for the portal-mounted menu. Anchored to the trigger's
  // bottom-right so the menu floats above the accounts strip's
  // overflow-x-auto clip and never forces the strip to scroll.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const reposition = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    setMenuPos({
      top:   rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    reposition();
    const onScroll = () => reposition();
    const onResize = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen, reposition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = triggerRef.current?.contains(target);
      const insideMenu    = menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const acctLabel = `${trimAccountName(acct.name)}${acct.last_four ? ` ••${acct.last_four}` : ""}`;

  return (
    <div ref={wrapRef}
      className="shrink-0 px-3 py-2.5 flex flex-col justify-between relative group"
      style={{
        ...CARD_STYLE,
        minWidth:  168,
        maxWidth:  208,
        minHeight: 68,
      }}>
      {/* Absolute top-right so it doesn't fight the institution label
          for horizontal space, and quiet enough on idle that it doesn't
          read as a chip. Visible bg only when menu is open or hovered. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
        aria-label={`Options for ${acctLabel}`}
        className="absolute flex items-center justify-center rounded transition-opacity opacity-0 group-hover:opacity-100"
        style={{
          top: 6, right: 6,
          width: 18, height: 18,
          color: "var(--color-grey)",
          background: menuOpen ? "rgba(31,33,26,0.06)" : "transparent",
          opacity: menuOpen ? 1 : undefined,
        }}>
        <MoreHorizontal size={11} />
      </button>
      <div className="flex items-start">
        <p className="flex-1 text-[10px] uppercase tracking-wider truncate pr-5" style={{ color: "var(--color-grey)" }}>
          {acct.institution}
        </p>
      </div>
      <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>
        {trimAccountName(acct.name)}
        {acct.last_four ? <span style={{ color: "var(--color-grey)" }}> ••{acct.last_four}</span> : null}
      </p>
      <p className="text-[14px] font-semibold tabular-nums" style={{
        color: acct.type === "credit" && (acct.balance_current ?? 0) < 0 ? "#b8860b" : "var(--color-charcoal)",
        fontFamily: "var(--font-display)",
      }}>
        {acct.balance_available !== null
          ? fmtCurrency(acct.balance_available, { dp: 0 })
          : acct.balance_current !== null ? fmtCurrency(acct.balance_current, { dp: 0 }) : "—"}
      </p>

      {menuOpen && menuPos && typeof document !== "undefined" && createPortal(
        <div ref={menuRef}>
          <Menu
            items={[
              {
                label:    syncing ? "Syncing…" : "Sync this account",
                icon:     RefreshCw,
                disabled: syncing,
                onClick:  () => { void onSync(); },
              },
              "divider",
              {
                label:   "Disconnect this account",
                icon:    Unplug,
                danger:  true,
                onClick: () => setConfirmOpen(true),
              },
            ]}
            onClose={() => setMenuOpen(false)}
            style={{ position: "fixed", top: menuPos.top, right: menuPos.right, minWidth: 200, zIndex: 1000 }}
          />
        </div>,
        document.body,
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Disconnect ${acctLabel}?`}
        body="This account and its transaction history will be removed. You can reconnect at any time."
        confirmLabel="Disconnect"
        tone="danger"
        onConfirm={() => { setConfirmOpen(false); void onDisconnect(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// ── Sub-tab toggle ──────────────────────────────────────────────────────────
// Sits in the Banking header row to flip between the transactions table
// and the Reports placeholder. Two segments, charcoal active fill — same
// visual vocabulary as FilterPills below but pinned (not multi-select).

function SubTabToggle({
  value, onChange,
}: {
  value: "transactions" | "reports";
  onChange: (v: "transactions" | "reports") => void;
}) {
  const options: { value: "transactions" | "reports"; label: string }[] = [
    { value: "transactions", label: "Transactions" },
    { value: "reports",      label: "Reports"      },
  ];
  return (
    <div style={{
      display: "inline-flex",
      padding: 3,
      borderRadius: 999,
      background: "rgba(31,33,26,0.05)",
      gap: 2,
    }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              all:        "unset",
              padding:    "5px 12px",
              borderRadius: 999,
              fontSize:   11.5,
              fontWeight: active ? 600 : 500,
              color:      active ? "white" : "var(--color-grey)",
              background: active ? "var(--color-charcoal)" : "transparent",
              cursor:     "pointer",
              transition: "background 0.1s ease, color 0.1s ease",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Filter pills ────────────────────────────────────────────────────────────
// Matches the InvoicesTab list-pane pattern: filled charcoal when active,
// quiet ghost otherwise. Kept inline (no new ui primitive).

function FilterPills<T extends string>({ value, options, onChange, counts }: {
  value:   T;
  options: { value: T; label: string; icon?: React.ElementType }[];
  onChange: (v: T) => void;
  /** Optional per-option count, rendered as a trailing badge. */
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        const Icon   = o.icon;
        const count  = counts?.[o.value];
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors"
            style={{
              background: active ? "var(--color-charcoal)" : "rgba(31,33,26,0.06)",
              color:      active ? "white" : "var(--color-grey)",
              border:     "none",
              fontWeight: active ? 600 : 400,
            }}>
            {Icon && <Icon size={11} style={{ opacity: active ? 0.9 : 0.6 }} />}
            {o.label}
            {count != null && (
              <span className="tabular-nums" style={{
                fontSize: 10, fontWeight: 600, lineHeight: 1,
                padding: "1.5px 5px", borderRadius: 999,
                background: active ? "rgba(255,255,255,0.18)" : "rgba(31,33,26,0.07)",
                color:      active ? "white" : "var(--color-grey)",
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Empty state per filter ──────────────────────────────────────────────────

function EmptyForFilter({ status }: { status: StatusFilter }) {
  const copy: Record<StatusFilter, string> = {
    needs_review: "No transactions need review — you're caught up.",
    all:          "No transactions yet. They'll show up here as your bank syncs.",
    logged:       "No transactions have been logged as expenses yet.",
    matched:      "No transactions matched to invoices yet.",
    personal:     "No personal transactions hidden.",
  };
  return (
    <p className="px-4 py-10 text-center text-[12px]" style={{ color: "var(--color-grey)" }}>
      {copy[status]}
    </p>
  );
}

// ── Selection checkbox ───────────────────────────────────────────────────────
// Matches the Tasks list checkbox: 16px rounded-square, border-strong outline
// when empty, sage fill + white tick when selected.
function SelectCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: checked ? "none" : "1.5px solid var(--color-border-strong)",
        background: checked ? "var(--color-sage)" : "transparent",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.12s ease", padding: 0,
      }}
      onMouseEnter={(e) => { if (!checked) e.currentTarget.style.borderColor = "var(--color-sage)"; }}
      onMouseLeave={(e) => { if (!checked) e.currentTarget.style.borderColor = "var(--color-border-strong)"; }}>
      {checked && (
        <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

// ── Transaction row ─────────────────────────────────────────────────────────

interface RowProps {
  tx: BankTransaction;
  first: boolean;
  expanded: boolean;
  selected: boolean;
  /** True in the To-review filter — swaps the trailing chevron for a Log button. */
  reviewMode: boolean;
  customs: CustomCategory[];
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onMarkPersonal: () => void;
  /** Legacy modal-based convert flow (currently dormant). */
  onConvert:      () => void;
  /** New inline log workflow — drives the "Save as expense" button
   *  inside ExpandedRow. Returns the convert-to-expense response so
   *  the form can surface errors and reset its busy state. */
  onSubmitInlineLog: (values: {
    project_id:  string | null;
    description: string;
    category:    ExpenseCategory;
    amount:      number;
    date:        string;
  }) => Promise<{ expense: Expense } | { error: string }>;
  onEditLinkedExpense:   () => void;
  onDeleteLinkedExpense: (expenseId: string) => void;
  /** One-click "Log" from the row (no expand) — debits not yet handled. */
  onQuickLog:     () => void;
  onMatch:        (invoiceId: string) => void;
  onUnmatch:      () => void;
  onUnmarkPersonal: () => void;
  onSaveNote:       (note: string | null) => void;
  /** Rename the transaction (custom_name override). Null clears it. */
  onRename:         (name: string | null) => void;
  onAttachReceipt:  (file: File) => void;
  onRemoveReceipt:  () => void;
  /** When `customId` is provided the row chip renders the custom's
   *  label/colour; `category` is the built-in we route persistence to. */
  onSetManualCategory: (c: string | null, customId?: string | null) => void;
  /** Open the Customize-categories modal from the row picker. */
  onCustomize:      () => void;
  onCollapse:       () => void;
  outstanding:      OutstandingInvoice[];
}

function TransactionRow({
  tx, first, expanded, selected, reviewMode, customs, projects,
  onToggleSelect, onToggleExpand,
  onMarkPersonal, onConvert, onSubmitInlineLog,
  onEditLinkedExpense, onDeleteLinkedExpense, onQuickLog,
  onMatch, onUnmatch, onUnmarkPersonal,
  onSaveNote, onRename, onAttachReceipt, onRemoveReceipt, onSetManualCategory,
  onCustomize, onCollapse, outstanding,
}: RowProps) {
  const amt        = Number(tx.amount);
  const isCredit   = amt > 0;
  const merchant   = tx.custom_name ?? tx.details?.merchant_name ?? tx.description;
  const pending    = tx.status === "pending";
  const primary    = tx.details?.personal_finance_category?.primary ?? null;
  const acct       = tx.bank_account;

  // One taxonomy resolves the chip: a custom category (manual_custom_id)
  // wins, then a canonical override key (manual_category), then Plaid's
  // auto-detected primary. Each branch carries its own brand palette so
  // the row chip and the picker pill read the same colour.
  const customMatch = findCustom(customs, tx.manual_custom_id);
  const canonical   = canonicalByKey(tx.manual_category) ?? categoryFor(primary);
  const displayCat  = customMatch
    ? { label: customMatch.label, bg: tintForColor(customMatch.color), fg: customMatch.color, icon: Tag }
    : { label: canonical.label, bg: canonical.bg, fg: canonical.fg, icon: ICON_REGISTRY[canonical.icon] ?? Tag };

  // Personal is a state-chip but the user can now flip back to a normal
  // category via the picker, so it lives alongside (not instead of) the
  // category — but for `is_personal` rows we still want a pill that says
  // "Personal". Logged / Matched continue to override the chip.
  let stateChip: { label: string; bg: string; fg: string } | null = null;
  if (tx.is_personal)             stateChip = { label: "Personal",  bg: "rgba(31,33,26,0.06)",    fg: "var(--color-grey)" };
  else if (tx.linked_expense_id)  stateChip = { label: "Logged",    bg: "rgba(155,163,122,0.14)", fg: "var(--color-sage)" };
  else if (tx.matched_invoice_id) stateChip = { label: "Matched",   bg: "rgba(155,163,122,0.14)", fg: "var(--color-sage)" };

  // A debit that hasn't been handled yet can be logged in one click from
  // the row. Credits route to invoice-matching instead, so they don't get
  // the quick-log affordance. In the To-review view the trailing chevron is
  // replaced by an always-visible Log button (reviewMode).
  const canQuickLog = !isCredit && !tx.linked_expense_id && !tx.matched_invoice_id && !tx.is_personal;
  const showLogButton = reviewMode && canQuickLog;
  const trailingW = reviewMode ? 64 : 18;

  return (
    <>
      <div
        className="grid items-center px-4 py-3 transition-colors"
        style={{
          position: "relative",
          gridTemplateColumns: `24px 56px 1fr 180px 120px ${trailingW}px`,
          gap: 12,
          borderTop: first ? "none" : "0.5px solid var(--color-border)",
          background: expanded ? "var(--color-surface-sunken)" : "transparent",
          cursor: "pointer",
        }}
        onClick={onToggleExpand}
        onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = "rgba(31,33,26,0.025)"; }}
        onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
      >
        {/* Checkbox */}
        <span onClick={(e) => e.stopPropagation()}>
          <SelectCheckbox checked={selected} onToggle={onToggleSelect} />
        </span>

        {/* Date */}
        <span className="text-[12px] tabular-nums" style={{ color: "var(--color-grey)" }}>
          {fmtShortDate(tx.date)}
        </span>

        {/* Name + account + pending */}
        <span className="min-w-0">
          <span className="text-[13px] font-medium truncate block" style={{ color: "var(--color-charcoal)" }}>
            {merchant}
            {acct ? (
              <span className="font-normal" style={{ color: "var(--color-grey)" }}>
                {" · "}{acct.institution}{acct.last_four ? ` ••${acct.last_four}` : ""}
              </span>
            ) : tx.payment_method ? (
              <span className="font-normal" style={{ color: "var(--color-grey)" }}>
                {" · "}{tx.payment_detail || PAYMENT_LABEL[tx.payment_method] || "Manual"}
              </span>
            ) : null}
            {pending && (
              <span className="ml-2 text-[10px] font-normal" style={{ color: "#b8860b" }}>
                • Pending
              </span>
            )}
          </span>
        </span>

        {/* Category / state chip — clicking opens the category picker. The
            Personal pill still flips the state (sets is_personal=true) and
            the picker treats "Auto (Plaid)" as clearing the override. */}
        <span onClick={(e) => e.stopPropagation()}>
          <CategoryPickerChip
            tx={tx}
            stateChip={stateChip}
            displayCat={displayCat}
            customs={customs}
            onSelect={(c, cid) => onSetManualCategory(c, cid)}
            onSelectPersonal={onMarkPersonal}
            onUnmarkPersonal={onUnmarkPersonal}
            onCustomize={onCustomize}
          />
        </span>

        {/* Amount */}
        <span className="text-[13px] font-medium tabular-nums" style={{
          textAlign: "right",
          color: isCredit ? "var(--color-sage)" : "var(--color-charcoal)",
        }}>
          {isCredit ? "+" : "−"}{fmtCurrency(amt)}
        </span>

        {/* Trailing cell — an always-visible Log button on To-review debits,
            otherwise the expand chevron. */}
        {showLogButton ? (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickLog(); }}
            title="Log as an expense — open the row to add a receipt or project"
            style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              padding: "3px 9px", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              color: "white", background: "var(--color-sage)",
              border: "none", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap",
              justifySelf: "end",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-sage-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-sage)")}>
            <Plus size={11} /> Log
          </button>
        ) : (
          <span style={{ color: "var(--color-grey)", justifySelf: "end" }}>
            <ChevronRight size={12} style={{
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.12s ease",
            }} />
          </span>
        )}
      </div>

      {expanded && (
        <ExpandedRow
          tx={tx}
          projects={projects}
          expenseCategory={customMatch?.routesTo ?? expenseForCategory(tx.manual_category, primary)}
          acctLabel={acct ? `${acct.institution} ${acct.last_four ? `••${acct.last_four}` : ""}` : "Account"}
          onConvert={onConvert}
          onSubmitInlineLog={onSubmitInlineLog}
          onEditLinkedExpense={onEditLinkedExpense}
          onDeleteLinkedExpense={onDeleteLinkedExpense}
          onMarkPersonal={onMarkPersonal}
          onUnmarkPersonal={onUnmarkPersonal}
          onMatch={onMatch}
          onUnmatch={onUnmatch}
          onSaveNote={onSaveNote}
          onRename={onRename}
          onAttachReceipt={onAttachReceipt}
          onRemoveReceipt={onRemoveReceipt}
          onCollapse={onCollapse}
          outstanding={outstanding}
        />
      )}
    </>
  );
}

// ── Category picker chip ────────────────────────────────────────────────────
// Click the chip → 2-col pill grid anchored under it, listing built-in
// + user-defined custom categories as colour-coded buttons. Personal sits
// below a divider as a quieter ghost pill so its destructive-ish
// "hide this from the books" meaning stays visually distinct. "Auto
// (Plaid)" clears any override and falls back to the Plaid mapping.
// Closes on outside click or Escape.
//
// Visual contract: each pill matches the row chip's vocabulary (tinted
// bg + full-colour fg + icon) so the connection between picker and chip
// is obvious. Built-ins re-use the Plaid display palette so the same
// label reads the same in either surface; customs use the user's
// chosen swatch (tintForColor for bg, full hex for fg).

interface CategoryPickerChipProps {
  tx:        BankTransaction;
  stateChip: { label: string; bg: string; fg: string } | null;
  displayCat: { label: string; bg: string; fg: string; icon: React.ElementType };
  customs:   CustomCategory[];
  /** Pass (key, null) for a canonical category, (null, customId) for a
   *  custom, (null, null) for Auto (clear the override). */
  onSelect:  (c: string | null, customId: string | null) => void;
  onSelectPersonal:   () => void;
  onUnmarkPersonal:   () => void;
  /** Open the Customize-categories modal to add/edit custom categories. */
  onCustomize:        () => void;
}

function CategoryPickerChip({
  tx, stateChip, displayCat, customs, onSelect, onSelectPersonal, onUnmarkPersonal, onCustomize,
}: CategoryPickerChipProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change category"
        style={{
          all:        "unset",
          cursor:     "pointer",
          maxWidth:   "100%",
          display:    "inline-flex",
        }}>
        {stateChip ? (
          <Chip bg={stateChip.bg} fg={stateChip.fg} label={stateChip.label} />
        ) : (
          <Chip bg={displayCat.bg} fg={displayCat.fg} icon={displayCat.icon} label={displayCat.label} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position:     "absolute",
            top:          "calc(100% + 6px)",
            left:         0,
            zIndex:       30,
            width:        268,
            background:   "var(--color-off-white)",
            border:       "0.5px solid var(--color-border)",
            borderRadius: 12,
            boxShadow:    "0 12px 28px rgba(31,33,26,0.14)",
            padding:      "10px 10px 8px",
            fontFamily:   "inherit",
          }}>
          {/* Canonical (Plaid-derived) + custom list. Single column reads
              faster and lets long custom labels render without truncation;
              capped height keeps the now-longer canonical list scrollable. */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "1fr",
            gap:                 4,
            maxHeight:           300,
            overflowY:           "auto",
          }}>
            {CANONICAL_CATEGORIES.map((opt) => {
              const active = tx.manual_category === opt.key && !tx.manual_custom_id;
              return (
                <PillButton
                  key={opt.key}
                  active={active}
                  bg={opt.bg}
                  fg={opt.fg}
                  icon={ICON_REGISTRY[opt.icon] ?? Tag}
                  label={opt.label}
                  onClick={() => { onSelect(opt.key, null); setOpen(false); }}
                />
              );
            })}
            {customs.map((c) => {
              const active = tx.manual_custom_id === c.id;
              return (
                <PillButton
                  key={c.id}
                  active={active}
                  bg={tintForColor(c.color)}
                  fg={c.color}
                  icon={Tag}
                  label={c.label}
                  onClick={() => { onSelect(null, c.id); setOpen(false); }}
                />
              );
            })}
          </div>

          {/* Make a new custom category, then come back and pick it. */}
          <button type="button"
            onClick={() => { onCustomize(); setOpen(false); }}
            style={{
              all: "unset", display: "flex", alignItems: "center", gap: 5,
              width: "100%", boxSizing: "border-box",
              padding: "7px 10px", marginTop: 6, borderRadius: 8,
              fontSize: 11, cursor: "pointer", color: "var(--color-grey)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-sunken)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            <Plus size={12} /> New category…
          </button>

          {(tx.manual_category != null || tx.manual_custom_id != null) && (
            <button type="button"
              onClick={() => { onSelect(null, null); setOpen(false); }}
              style={{
                all: "unset", display: "block", width: "100%",
                padding: "6px 8px", marginTop: 8,
                fontSize: 10.5, cursor: "pointer", textAlign: "center",
                color: "var(--color-grey)", borderRadius: 6,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              Reset to auto (from Plaid)
            </button>
          )}

          <div style={{ height: "0.5px", background: "var(--color-border)", margin: "8px 0 6px" }} />

          {/* Personal — quieter ghost pill kept visually distinct from the
              category grid. When already personal, the button flips to
              "Unmark personal" so the user has a path back out — the
              previous "Mark as personal" copy was a dead end. */}
          <button type="button"
            onClick={() => {
              if (tx.is_personal) onUnmarkPersonal(); else onSelectPersonal();
              setOpen(false);
            }}
            style={{
              all: "unset",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              width: "100%",
              padding: "7px 10px",
              borderRadius: 999,
              fontSize: 11.5,
              cursor: "pointer",
              border: "0.5px solid var(--color-border)",
              background: tx.is_personal ? "rgba(155,163,122,0.10)" : "transparent",
              color: tx.is_personal ? "var(--color-sage)" : "var(--color-grey)",
              fontWeight: tx.is_personal ? 600 : 500,
              boxSizing: "border-box",
              transition: "background 0.1s ease",
            }}
            onMouseEnter={(e) => { if (!tx.is_personal) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
            onMouseLeave={(e) => { if (!tx.is_personal) e.currentTarget.style.background = "transparent"; }}>
            <UserIcon size={11} strokeWidth={1.75} />
            {tx.is_personal ? "Unmark personal" : "Mark as personal"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── PillButton (picker grid) ───────────────────────────────────────────────

function PillButton({
  active, bg, fg, icon: Icon, label, onClick,
}: {
  active: boolean;
  bg:     string;
  fg:     string;
  icon:   React.ElementType;
  label:  string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        all:        "unset",
        display:    "inline-flex",
        alignItems: "center",
        gap:        6,
        padding:    "7px 10px",
        borderRadius: 999,
        background: bg,
        color:      fg,
        fontSize:   11.5,
        fontWeight: active ? 600 : 500,
        boxSizing:  "border-box",
        cursor:     "pointer",
        outline:    active ? `1.5px solid ${fg}` : "1px solid transparent",
        outlineOffset: active ? -1 : 0,
        minWidth:   0,
        transition: "filter 0.1s ease",
      }}
      onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(0.96)"}
      onMouseLeave={(e) => e.currentTarget.style.filter = "none"}
    >
      <Icon size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </button>
  );
}

function Chip({ bg, fg, icon: Icon, label }: {
  bg: string; fg: string; icon?: React.ElementType; label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] max-w-full"
      style={{ background: bg, color: fg }}>
      {Icon && <Icon size={11} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
      <span className="truncate">{label}</span>
    </span>
  );
}

// ── Expanded row ────────────────────────────────────────────────────────────

interface ExpandedProps {
  tx: BankTransaction;
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  /** Pre-resolved ExpenseCategory bucket for the row (custom routesTo /
   *  canonical override / Plaid mapping), used when logging an expense. */
  expenseCategory: ExpenseCategory;
  acctLabel: string;
  /** Legacy modal-based log flow (dormant; see Props.onConvert). */
  onConvert:        () => void;
  onSubmitInlineLog: (values: {
    project_id:  string | null;
    description: string;
    category:    ExpenseCategory;
    amount:      number;
    date:        string;
  }) => Promise<{ expense: Expense } | { error: string }>;
  onEditLinkedExpense:   () => void;
  onDeleteLinkedExpense: (expenseId: string) => void;
  onMarkPersonal:   () => void;
  onUnmarkPersonal: () => void;
  onMatch:          (invoiceId: string) => void;
  onUnmatch:        () => void;
  onSaveNote:       (note: string | null) => void;
  onRename:         (name: string | null) => void;
  onAttachReceipt:  (file: File) => void;
  onRemoveReceipt:  () => void;
  onCollapse:       () => void;
  outstanding:      OutstandingInvoice[];
}

function ExpandedRow({
  tx, projects, expenseCategory, acctLabel,
  onConvert: _onConvert,
  onSubmitInlineLog, onEditLinkedExpense, onDeleteLinkedExpense,
  onMarkPersonal, onUnmarkPersonal, onMatch, onUnmatch,
  onSaveNote, onRename, onAttachReceipt, onRemoveReceipt,
  onCollapse, outstanding,
}: ExpandedProps) {
  const [noteDraft, setNoteDraft] = useState<string>(tx.note ?? "");
  // Editable display name — seeded from the effective name (override →
  // Plaid merchant → raw description). Autosaves on blur.
  const defaultName = (tx.details?.merchant_name ?? tx.description ?? "").trim();
  const [nameDraft, setNameDraft] = useState<string>(tx.custom_name ?? defaultName);
  useEffect(() => { setNameDraft(tx.custom_name ?? defaultName); }, [tx.custom_name, defaultName]);
  const [chosenInvoice, setChosenInvoice] = useState<string>("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync when the row mutates from elsewhere.
  useEffect(() => { setNoteDraft(tx.note ?? ""); }, [tx.note]);

  const isCredit  = Number(tx.amount) > 0;
  const isLogged  = !!tx.linked_expense_id;
  // "Show the inline log workflow" — applies to debits that haven't
  // been logged yet and aren't marked personal. Credits keep their
  // existing invoice-match flow; personal rows keep theirs too.
  const showInlineLog = !isCredit && !isLogged && !tx.is_personal;

  // ── Inline log form state ──
  // The logged expense's description IS the transaction name (the Name
  // field above), so there's no separate description input here anymore.
  const [logBillable,    setLogBillable]    = useState(false);
  const [logProjectId,   setLogProjectId]   = useState<string>("");
  const [logSaving,      setLogSaving]      = useState(false);
  const [logError,       setLogError]       = useState<string | null>(null);

  // Description used when logging — the live name draft, the stored
  // override, the Plaid merchant, or a dated fallback (never empty).
  const logDescription =
    (nameDraft.trim() || defaultName) || `Bank transaction · ${tx.date}`;

  const isImageReceipt = tx.receipt_url
    ? /\.(jpe?g|png|gif|webp)(\?|$)/i.test(tx.receipt_url)
    : false;

  async function pickFile(file: File) {
    setUploadingReceipt(true);
    try {
      await onAttachReceipt(file);
    } finally {
      setUploadingReceipt(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void pickFile(file);
  }

  const invoiceOptions = [
    { value: "", label: "Pick an outstanding invoice…" },
    ...outstanding.map((i) => ({
      value: i.id,
      label: `#${i.number} · ${i.client} · ${fmtCurrency(i.total, { dp: 0 })}`,
    })),
  ];

  return (
    <div className="px-6 py-4"
      style={{
        borderTop: "0.5px solid var(--color-border)",
        background: "var(--color-surface-sunken)",
      }}>
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* Left column: editable name + note */}
        <div className="flex flex-col gap-3 min-w-0">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>
              Name
            </p>
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                const trimmed = nameDraft.trim();
                onRename(trimmed && trimmed !== defaultName ? trimmed : null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder={defaultName || "Transaction name"}
              className="w-full px-3 py-2 text-[13px] font-medium rounded-lg"
              style={{
                background: "var(--color-warm-white)",
                border:     "0.5px solid var(--color-border)",
                color:      "var(--color-charcoal)",
                outline:    "none",
                fontFamily: "inherit",
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--color-grey)" }}>
              {(tx.payment_method ? [PAYMENT_LABEL[tx.payment_method] ?? "Manual", tx.payment_detail].filter(Boolean).join(" · ") : acctLabel)} · {fmtLongDate(tx.date)} · {tx.status === "pending" ? "Pending" : "Posted"}
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>
              Note
            </p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                const next = noteDraft.trim() === "" ? null : noteDraft;
                if (next !== (tx.note ?? null)) onSaveNote(next);
              }}
              placeholder="Add a note…"
              rows={2}
              className="w-full px-3 py-2 text-[12px] rounded-lg resize-none"
              style={{
                background: "var(--color-warm-white)",
                border:     "0.5px solid var(--color-border)",
                color:      "var(--color-charcoal)",
                outline:    "none",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* Right column: receipt — fills the column height so the drop
            target is a large, easy hit. */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-col flex-1">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>
              Receipt
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            {tx.receipt_url ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
                {isImageReceipt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tx.receipt_url} alt="Receipt"
                    style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                ) : (
                  <span className="w-11 h-11 flex items-center justify-center rounded-md"
                    style={{ background: "var(--color-cream)", color: "var(--color-grey)", flexShrink: 0 }}>
                    <Paperclip size={16} />
                  </span>
                )}
                <a href={tx.receipt_url} target="_blank" rel="noreferrer"
                  className="flex-1 text-[12px] truncate"
                  style={{ color: "var(--color-sage)", textDecoration: "none" }}>
                  View receipt
                </a>
                <button onClick={onRemoveReceipt}
                  className="w-7 h-7 flex items-center justify-center rounded-md"
                  style={{ color: "var(--color-grey)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <Trash2 size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                disabled={uploadingReceipt}
                className="w-full flex-1 flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg text-[12px] transition-colors"
                style={{
                  minHeight:  96,
                  border:     `0.5px dashed ${dragOver ? "var(--color-sage)" : "var(--color-border)"}`,
                  background: dragOver ? "rgba(155,163,122,0.08)" : "transparent",
                  color:      "var(--color-grey)",
                  cursor:     "pointer",
                  fontFamily: "inherit",
                }}>
                <Paperclip size={16} />
                {uploadingReceipt ? "Uploading…" : "Drop or click to upload receipt"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline log form — renders for unlogged, non-personal debits. The
          category comes from the row chip above and the description from the
          Name field above, so this form is just the billable + project
          decision. Project becomes required when Billable is checked. */}
      {showInlineLog && (
        <div className="mt-4 pt-4 flex flex-col gap-3"
          style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <div className="grid gap-3 items-end" style={{ gridTemplateColumns: "auto 1fr" }}>
            <label className="flex items-center gap-2 text-[11.5px] select-none"
              style={{ color: "var(--color-charcoal)", cursor: "pointer", paddingBottom: 6 }}>
              <input
                type="checkbox"
                checked={logBillable}
                onChange={(e) => setLogBillable(e.target.checked)}
                style={{ accentColor: "var(--color-sage)", cursor: "pointer" }}
              />
              This is a billable client expense
            </label>
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--color-grey)" }}>
                Project {logBillable && <span style={{ color: "var(--color-red-orange)" }}>*</span>}
              </label>
              <Select
                value={logProjectId}
                onChange={setLogProjectId}
                options={[
                  { value: "", label: logBillable ? "Pick a project…" : "None (unattached)" },
                  ...projects.map((p) => ({ value: p.id, label: p.title })),
                ]}
              />
            </div>
          </div>

          {logError && (
            <p className="text-[11px]" style={{ color: "var(--color-red-orange)" }}>{logError}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={logSaving || !logDescription.trim() || (logBillable && !logProjectId)}
              onClick={async () => {
                setLogError(null);
                setLogSaving(true);
                const result = await onSubmitInlineLog({
                  project_id:  logProjectId || null,
                  description: logDescription.trim(),
                  category:    expenseCategory,
                  amount:      Math.abs(Number(tx.amount)),
                  date:        tx.date,
                });
                setLogSaving(false);
                if ("error" in result) { setLogError(result.error); return; }
                // On success the parent flips tx.linked_expense_id, which
                // re-renders this expanded view into the "Logged" branch.
              }}
              className="px-4 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-40"
              style={{ background: "var(--color-sage)", borderRadius: 999, cursor: logSaving ? "wait" : "pointer", border: "none" }}>
              {logSaving ? "Saving…" : "Save as expense"}
            </button>
            <button
              type="button"
              onClick={onCollapse}
              className="px-3 py-1.5 text-[11.5px] transition-colors"
              style={{ color: "var(--color-grey)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-charcoal)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-grey)"}>
              Cancel
            </button>
            <div className="flex-1" />
            <button onClick={onMarkPersonal}
              className="px-3 py-1.5 text-[11px] transition-colors"
              style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", borderRadius: 999, background: "transparent", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              Mark personal instead
            </button>
          </div>
        </div>
      )}

      {/* Logged-as-expense panel — quieter header + Edit / Delete
          affordances for the linked expense. The old copy "Edit or
          delete from the Expenses tab" is gone with the tab. */}
      {isLogged && (
        <div className="mt-4 pt-3 flex items-center gap-2 flex-wrap"
          style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--color-sage)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-sage)" }} />
            Logged as expense
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onEditLinkedExpense}
            className="px-3 py-1.5 text-[11px] transition-colors"
            style={{ color: "var(--color-charcoal)", border: "0.5px solid var(--color-border)", borderRadius: 999, background: "transparent", cursor: "pointer" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            Edit expense
          </button>
          <button
            type="button"
            onClick={() => tx.linked_expense_id && onDeleteLinkedExpense(tx.linked_expense_id)}
            className="px-3 py-1.5 text-[11px] transition-colors"
            style={{ color: "var(--color-red-orange)", border: "0.5px solid rgba(220,62,13,0.25)", borderRadius: 999, background: "transparent", cursor: "pointer" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(220,62,13,0.06)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
            Delete expense + unlink
          </button>
        </div>
      )}

      {/* Personal / matched-credit / unmatched-credit action rows —
          unchanged from before, just rehomed below the inline-log branch.
          (Credits never enter the log workflow; personal rows have their
          own flow; matched rows just show the un-match affordance.) */}
      {(tx.is_personal || tx.matched_invoice_id || (isCredit && !tx.matched_invoice_id)) && (
        <div className="flex items-center gap-2 mt-4 pt-3 flex-wrap"
          style={{ borderTop: "0.5px solid var(--color-border)" }}>
          {tx.is_personal && (
            <button onClick={onUnmarkPersonal}
              className="px-3 py-1.5 text-[11px] transition-colors"
              style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", borderRadius: 999, background: "transparent", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              Unmark personal
            </button>
          )}
          {tx.matched_invoice_id && (
            <button onClick={onUnmatch}
              className="px-3 py-1.5 text-[11px] transition-colors"
              style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", borderRadius: 999, background: "transparent", cursor: "pointer" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              Unmatch invoice
            </button>
          )}
          {isCredit && !tx.matched_invoice_id && !tx.is_personal && (
            <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-[480px]">
              <div className="flex-1">
                <Select value={chosenInvoice} onChange={setChosenInvoice} options={invoiceOptions} />
              </div>
              <button onClick={() => chosenInvoice && onMatch(chosenInvoice)}
                disabled={!chosenInvoice}
                className="px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
                style={{ background: "var(--color-sage)", borderRadius: 999, border: "none", cursor: "pointer" }}>
                Match
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
