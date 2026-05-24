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
  ChevronRight, Loader2, MoreHorizontal, Paperclip, Plus, RefreshCw,
  Trash2, Unplug, X,
  // Category-chip icons (lookup by name from plaidCategoryDisplay):
  ArrowDownToLine, ArrowLeftRight, Briefcase, Car, HeartPulse, Landmark,
  Lightbulb, Music, Plane, Receipt as ReceiptIcon, ShoppingBag, Tag,
  User as UserIcon, Utensils, Wrench,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Menu from "@/components/ui/Menu";
import Select from "@/components/ui/Select";
import AddExpenseModal from "./AddExpenseModal";
import type { BankAccount, BankTransaction, Expense, ExpenseCategory, Project } from "@/types/database";
import { plaidCategoryToExpenseCategory } from "./plaidCategoryMap";
import { categoryFor, PLAID_PRIMARY_KEYS } from "./plaidCategoryDisplay";
import { uploadReceipt, deleteReceipt } from "@/lib/uploads/receipt";

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
interface TransactionsResponse {
  transactions: BankTransaction[];
  total:        number;
  page:         number;
  pageSize:     number;
  kpis:         KpiPayload;
}
interface OutstandingInvoice {
  id:     string;
  number: number;
  client: string;
  total:  number;
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
  ArrowDownToLine, ArrowLeftRight, Briefcase, Car, HeartPulse, Landmark,
  Lightbulb, Music, Plane, Receipt: ReceiptIcon, ShoppingBag, Tag, User: UserIcon, Utensils, Wrench,
};

// ── ExpenseCategory display ────────────────────────────────────────────────
// Labels mirror AddExpenseModal so the picker reads the same as the
// downstream "Log expense" form. Order is the AddExpenseModal order.
const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: "materials",  label: "Materials"  },
  { value: "travel",     label: "Travel"     },
  { value: "production", label: "Production" },
  { value: "software",   label: "Software"   },
  { value: "other",      label: "Other"      },
];
const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> =
  Object.fromEntries(EXPENSE_CATEGORY_OPTIONS.map((o) => [o.value, o.label])) as Record<ExpenseCategory, string>;

// ── Filter / sort types ─────────────────────────────────────────────────────

type StatusFilter = "all" | "needs_review" | "logged" | "matched" | "personal";
type TypeFilter   = "all" | "debit" | "credit";
type SortKey      = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "needs_review", label: "Needs review" },
  { value: "all",          label: "All"          },
  { value: "logged",       label: "Logged"       },
  { value: "matched",      label: "Matched"      },
  { value: "personal",     label: "Personal"     },
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
  onInvoiceMarkedPaid: (invoiceId: string, paidAt: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BankingTab({ projects, onExpenseCreated, onInvoiceMarkedPaid }: Props) {
  const [accounts, setAccounts]                   = useState<BankAccount[]>([]);
  const [transactions, setTransactions]           = useState<BankTransaction[]>([]);
  const [total, setTotal]                         = useState(0);
  const [kpis, setKpis]                           = useState<KpiPayload>({ in_this_month: 0, out_this_month: 0, net: 0 });
  const [outstanding, setOutstanding]             = useState<OutstandingInvoice[]>([]);

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

  // Per-row UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<BankTransaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
        const data = await invRes.json() as { outstanding_invoices?: OutstandingInvoice[] };
        setOutstanding(data.outstanding_invoices ?? []);
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
    if (isPersonal) {
      setSnackbar({
        text: "Marked personal",
        onUndo: async () => {
          setSnackbar(null);
          await markPersonal({ ...tx, is_personal: true }, false);
          await fetchTransactions();
        },
      });
    }
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

  async function setManualCategory(tx: BankTransaction, next: ExpenseCategory | null) {
    const prev = tx.manual_category;
    patchLocal(tx.id, { manual_category: next });
    const res = await fetch(`/api/finance/banking/transactions/${tx.id}/category`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ manual_category: next }),
    });
    if (!res.ok) {
      patchLocal(tx.id, { manual_category: prev });
      setError("Couldn't update category.");
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

  // ── Derived ───────────────────────────────────────────────────────────────

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
    ...PLAID_PRIMARY_KEYS.map((k) => ({ value: k, label: categoryFor(k).label })),
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

        {!loading && accounts.length > 0 && (
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

            {/* ── Bulk action bar ───────────────────────────────────── */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg shrink-0"
                style={{ background: "var(--color-charcoal)", color: "white" }}>
                <span className="text-[12px]">{selectedIds.size} selected</span>
                <div className="flex-1" />
                <button onClick={bulkMarkPersonal}
                  className="px-3 py-1 text-[11px] rounded-md"
                  style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>
                  Mark all personal
                </button>
                <button onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1 text-[11px] rounded-md"
                  style={{ background: "transparent", color: "rgba(255,255,255,0.7)" }}>
                  Cancel
                </button>
              </div>
            )}

            {/* ── Transactions table ────────────────────────────────── */}
            <div style={CARD_STYLE}>
              {/* Column header */}
              <div className="grid items-center px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  gridTemplateColumns: "24px 56px 1fr 180px 120px 18px",
                  gap: 12,
                  borderBottom: "0.5px solid var(--color-border)",
                  color: "var(--color-grey)",
                  background: "var(--color-warm-white)",
                }}>
                <span />
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
                  onMatch={(invoiceId) => matchInvoice(tx, invoiceId)}
                  onUnmatch={() => unmatch(tx)}
                  onUnmarkPersonal={() => markPersonal(tx, false)}
                  onSaveNote={(note) => saveNote(tx, note)}
                  onAttachReceipt={(file) => attachReceipt(tx, file)}
                  onRemoveReceipt={() => removeReceipt(tx)}
                  onSetManualCategory={(c) => setManualCategory(tx, c)}
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

      {/* ── Convert-to-expense modal ────────────────────────────────── */}
      {convertTarget && (
        <AddExpenseModal
          projects={projects}
          prefill={{
            description: convertTarget.details?.merchant_name ?? convertTarget.description ?? "",
            amount:      Math.abs(Number(convertTarget.amount)),
            date:        convertTarget.date,
            // User's manual override wins over the Plaid-derived guess.
            category:    convertTarget.manual_category
              ?? plaidCategoryToExpenseCategory(convertTarget.details?.personal_finance_category?.primary ?? null),
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

// ── Filter pills ────────────────────────────────────────────────────────────
// Matches the InvoicesTab list-pane pattern: filled charcoal when active,
// quiet ghost otherwise. Kept inline (no new ui primitive).

function FilterPills<T extends string>({ value, options, onChange }: {
  value:   T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className="px-2.5 py-1 rounded-full text-[11px] transition-colors"
            style={{
              background: active ? "var(--color-charcoal)" : "rgba(31,33,26,0.06)",
              color:      active ? "white" : "var(--color-grey)",
              border:     "none",
              fontWeight: active ? 600 : 400,
            }}>
            {o.label}
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

// ── Transaction row ─────────────────────────────────────────────────────────

interface RowProps {
  tx: BankTransaction;
  first: boolean;
  expanded: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onMarkPersonal: () => void;
  onConvert:      () => void;
  onMatch:        (invoiceId: string) => void;
  onUnmatch:      () => void;
  onUnmarkPersonal: () => void;
  onSaveNote:       (note: string | null) => void;
  onAttachReceipt:  (file: File) => void;
  onRemoveReceipt:  () => void;
  onSetManualCategory: (c: ExpenseCategory | null) => void;
  outstanding:      OutstandingInvoice[];
}

function TransactionRow({
  tx, first, expanded, selected,
  onToggleSelect, onToggleExpand,
  onMarkPersonal, onConvert, onMatch, onUnmatch, onUnmarkPersonal,
  onSaveNote, onAttachReceipt, onRemoveReceipt, onSetManualCategory,
  outstanding,
}: RowProps) {
  const amt        = Number(tx.amount);
  const isCredit   = amt > 0;
  const merchant   = tx.details?.merchant_name ?? tx.description;
  const pending    = tx.status === "pending";
  const primary    = tx.details?.personal_finance_category?.primary ?? null;
  const plaidCat   = categoryFor(primary);
  const PlaidIcon  = ICON_REGISTRY[plaidCat.icon] ?? Tag;
  const acct       = tx.bank_account;

  // Manual category override beats the Plaid label. When set we show a
  // muted "Manual" pip beside the chip so it's clear the row has been
  // touched (and to nudge the user that the value is editable).
  const hasManual = !!tx.manual_category;
  const displayCat = hasManual
    ? { label: EXPENSE_CATEGORY_LABEL[tx.manual_category as ExpenseCategory], bg: plaidCat.bg, fg: plaidCat.fg, icon: PlaidIcon }
    : { label: plaidCat.label, bg: plaidCat.bg, fg: plaidCat.fg, icon: PlaidIcon };

  // Personal is a state-chip but the user can now flip back to a normal
  // category via the picker, so it lives alongside (not instead of) the
  // category — but for `is_personal` rows we still want a pill that says
  // "Personal". Logged / Matched continue to override the chip.
  let stateChip: { label: string; bg: string; fg: string } | null = null;
  if (tx.is_personal)             stateChip = { label: "Personal",  bg: "rgba(31,33,26,0.06)",    fg: "var(--color-grey)" };
  else if (tx.linked_expense_id)  stateChip = { label: "Logged",    bg: "rgba(155,163,122,0.14)", fg: "var(--color-sage)" };
  else if (tx.matched_invoice_id) stateChip = { label: "Matched",   bg: "rgba(155,163,122,0.14)", fg: "var(--color-sage)" };

  return (
    <>
      <div
        className="grid items-center px-4 py-3 transition-colors"
        style={{
          gridTemplateColumns: "24px 56px 1fr 180px 120px 18px",
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
        <span onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}>
          <input type="checkbox" checked={selected} readOnly
            style={{ cursor: "pointer", accentColor: "var(--color-sage)" }} />
        </span>

        {/* Date */}
        <span className="text-[12px] tabular-nums" style={{ color: "var(--color-grey)" }}>
          {fmtShortDate(tx.date)}
        </span>

        {/* Name + pending */}
        <span className="min-w-0">
          <span className="text-[13px] font-medium truncate block" style={{ color: "var(--color-charcoal)" }}>
            {merchant}
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
            hasManual={hasManual}
            onSelect={(c) => onSetManualCategory(c)}
            onSelectPersonal={onMarkPersonal}
          />
        </span>

        {/* Amount */}
        <span className="text-[13px] font-medium tabular-nums" style={{
          textAlign: "right",
          color: isCredit ? "var(--color-sage)" : "var(--color-charcoal)",
        }}>
          {isCredit ? "+" : "−"}{fmtCurrency(amt)}
        </span>

        {/* Chevron */}
        <span style={{ color: "var(--color-grey)" }}>
          <ChevronRight size={12} style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.12s ease",
          }} />
        </span>
      </div>

      {expanded && (
        <ExpandedRow
          tx={tx}
          acctLabel={acct ? `${acct.institution} ${acct.last_four ? `••${acct.last_four}` : ""}` : "Account"}
          onConvert={onConvert}
          onMarkPersonal={onMarkPersonal}
          onUnmarkPersonal={onUnmarkPersonal}
          onMatch={onMatch}
          onUnmatch={onUnmatch}
          onSaveNote={onSaveNote}
          onAttachReceipt={onAttachReceipt}
          onRemoveReceipt={onRemoveReceipt}
          outstanding={outstanding}
        />
      )}
    </>
  );
}

// ── Category picker chip ────────────────────────────────────────────────────
// Click the chip → vertical options popover anchored under it. Lists the
// five ExpenseCategory values plus a Personal option below a divider.
// "Auto (Plaid)" clears the manual override and falls back to the Plaid
// mapping. Closes on outside click or Escape. Styled with the same
// CARD_STYLE shadow + a thin sage border so it reads as a controlled
// surface without needing a new ui primitive.

interface CategoryPickerChipProps {
  tx:        BankTransaction;
  stateChip: { label: string; bg: string; fg: string } | null;
  displayCat: { label: string; bg: string; fg: string; icon: React.ElementType };
  hasManual: boolean;
  onSelect:  (c: ExpenseCategory | null) => void;
  onSelectPersonal: () => void;
}

function CategoryPickerChip({
  tx, stateChip, displayCat, hasManual, onSelect, onSelectPersonal,
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
      {hasManual && !stateChip && (
        <span title="Manual category" style={{
          fontSize: 9, lineHeight: 1, padding: "1px 4px", borderRadius: 3,
          background: "rgba(31,33,26,0.05)", color: "var(--color-grey)",
          letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600,
        }}>
          Manual
        </span>
      )}

      {open && (
        <div
          role="menu"
          style={{
            position:     "absolute",
            top:          "calc(100% + 6px)",
            left:         0,
            zIndex:       30,
            minWidth:     180,
            background:   "var(--color-off-white)",
            border:       "0.5px solid var(--color-sage)",
            borderRadius: 10,
            boxShadow:    "0 8px 24px rgba(31,33,26,0.10)",
            overflow:     "hidden",
            padding:      "4px 0",
            fontFamily:   "inherit",
          }}>
          {EXPENSE_CATEGORY_OPTIONS.map((opt) => {
            const active = tx.manual_category === opt.value;
            return (
              <button key={opt.value} type="button"
                onClick={() => { onSelect(opt.value); setOpen(false); }}
                style={{
                  all:        "unset",
                  display:    "block",
                  width:      "100%",
                  padding:    "7px 12px",
                  fontSize:   12,
                  cursor:     "pointer",
                  color:      active ? "var(--color-sage)" : "var(--color-charcoal)",
                  fontWeight: active ? 600 : 400,
                  background: active ? "rgba(155,163,122,0.10)" : "transparent",
                  boxSizing:  "border-box",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                {opt.label}
              </button>
            );
          })}
          {tx.manual_category != null && (
            <button type="button"
              onClick={() => { onSelect(null); setOpen(false); }}
              style={{
                all: "unset", display: "block", width: "100%",
                padding: "7px 12px", fontSize: 11, cursor: "pointer",
                color: "var(--color-grey)", boxSizing: "border-box",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              Auto (from Plaid)
            </button>
          )}
          <div style={{ height: "0.5px", background: "var(--color-border)", margin: "4px 0" }} />
          <button type="button"
            onClick={() => { onSelectPersonal(); setOpen(false); }}
            style={{
              all: "unset", display: "block", width: "100%",
              padding: "7px 12px", fontSize: 12, cursor: "pointer",
              color: tx.is_personal ? "var(--color-sage)" : "var(--color-charcoal)",
              fontWeight: tx.is_personal ? 600 : 400,
              background: tx.is_personal ? "rgba(155,163,122,0.10)" : "transparent",
              boxSizing: "border-box",
            }}
            onMouseEnter={(e) => { if (!tx.is_personal) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
            onMouseLeave={(e) => { if (!tx.is_personal) e.currentTarget.style.background = "transparent"; }}>
            Personal
          </button>
        </div>
      )}
    </div>
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
  acctLabel: string;
  onConvert:        () => void;
  onMarkPersonal:   () => void;
  onUnmarkPersonal: () => void;
  onMatch:          (invoiceId: string) => void;
  onUnmatch:        () => void;
  onSaveNote:       (note: string | null) => void;
  onAttachReceipt:  (file: File) => void;
  onRemoveReceipt:  () => void;
  outstanding:      OutstandingInvoice[];
}

function ExpandedRow({
  tx, acctLabel,
  onConvert, onMarkPersonal, onUnmarkPersonal, onMatch, onUnmatch,
  onSaveNote, onAttachReceipt, onRemoveReceipt,
  outstanding,
}: ExpandedProps) {
  const [noteDraft, setNoteDraft] = useState<string>(tx.note ?? "");
  const [chosenInvoice, setChosenInvoice] = useState<string>("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync when the row mutates from elsewhere.
  useEffect(() => { setNoteDraft(tx.note ?? ""); }, [tx.note]);

  const isHandled = tx.is_personal || !!tx.linked_expense_id || !!tx.matched_invoice_id;
  const isCredit  = Number(tx.amount) > 0;

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
        {/* Left column: metadata + note */}
        <div className="flex flex-col gap-3 min-w-0">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-grey)" }}>
              Details
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              {acctLabel} · {fmtLongDate(tx.date)} · {tx.status === "pending" ? "Pending" : "Posted"}
            </p>
            <p className="text-[12px] mt-1 break-words" style={{ color: "var(--color-charcoal)" }}>
              {tx.description}
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

        {/* Right column: receipt */}
        <div className="flex flex-col gap-3 min-w-0">
          <div>
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
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-[12px] transition-colors"
                style={{
                  border:     `0.5px dashed ${dragOver ? "var(--color-sage)" : "var(--color-border)"}`,
                  background: dragOver ? "rgba(155,163,122,0.08)" : "transparent",
                  color:      "var(--color-grey)",
                  cursor:     "pointer",
                  fontFamily: "inherit",
                }}>
                <Paperclip size={12} />
                {uploadingReceipt ? "Uploading…" : "Drop or click to upload receipt"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 mt-4 pt-3 flex-wrap"
        style={{ borderTop: "0.5px solid var(--color-border)" }}>
        {isHandled ? (
          <>
            {tx.is_personal && (
              <button onClick={onUnmarkPersonal}
                className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                Unmark personal
              </button>
            )}
            {tx.matched_invoice_id && (
              <button onClick={onUnmatch}
                className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                Unmatch invoice
              </button>
            )}
            {tx.linked_expense_id && (
              <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
                Edit or delete the expense from the Expenses tab to undo.
              </span>
            )}
          </>
        ) : (
          <>
            {!isCredit && (
              <button onClick={onConvert}
                className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-white"
                style={{ background: "var(--color-sage)" }}>
                → Log expense
              </button>
            )}
            <button onClick={onMarkPersonal}
              className="px-3 py-1.5 text-[11px] rounded-lg transition-colors"
              style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-cream)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              Mark personal
            </button>
            {isCredit && (
              <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-[480px]">
                <div className="flex-1">
                  <Select value={chosenInvoice} onChange={setChosenInvoice} options={invoiceOptions} />
                </div>
                <button onClick={() => chosenInvoice && onMatch(chosenInvoice)}
                  disabled={!chosenInvoice}
                  className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-white disabled:opacity-40"
                  style={{ background: "var(--color-sage)" }}>
                  Match
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
