// GET /api/finance/banking/transactions
//
// Paginated, filterable, sortable list backing the unified Banking table.
// This is the new "Rocket Money-style" projection — replacing the segmented
// /queue feed that the old BankingTab consumed.
//
// Query params:
//   status   = all | needs_review | logged | matched | personal   (default: needs_review)
//   account  = <bank_account.id> | all                            (default: all)
//   category = <plaid primary>  | all                             (default: all)
//   type     = all | debit | credit                               (default: all)
//   search   = substring against description + details.merchant_name
//   sort     = date_desc | date_asc | amount_desc | amount_asc    (default: date_desc)
//   page     = 1-indexed page number                              (default: 1)
//   pageSize = rows per page, capped at 100                       (default: 20)
//
// Response: { transactions, total, page, pageSize, kpis }
// kpis are always the current calendar month (in / out / net) computed from
// the user's full month of transactions — independent of the filter.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BankTransaction } from "@/types/database";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type StatusFilter = "all" | "needs_review" | "logged" | "matched" | "personal";
type TypeFilter   = "all" | "debit" | "credit";
type SortKey      = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

function parseStatus(v: string | null): StatusFilter {
  return (["all","needs_review","logged","matched","personal"] as const).includes(v as StatusFilter)
    ? (v as StatusFilter) : "needs_review";
}
function parseType(v: string | null): TypeFilter {
  return (["all","debit","credit"] as const).includes(v as TypeFilter) ? (v as TypeFilter) : "all";
}
function parseSort(v: string | null): SortKey {
  return (["date_desc","date_asc","amount_desc","amount_asc"] as const).includes(v as SortKey)
    ? (v as SortKey) : "date_desc";
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url       = new URL(req.url);
  const status    = parseStatus(url.searchParams.get("status"));
  const account   = url.searchParams.get("account") ?? "all";
  const category  = url.searchParams.get("category") ?? "all";
  const txType    = parseType(url.searchParams.get("type"));
  const search    = (url.searchParams.get("search") ?? "").trim();
  const sort      = parseSort(url.searchParams.get("sort"));
  const page      = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize  = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE));

  // ── Main filtered query ──────────────────────────────────────────────────
  let q = supabase
    .from("bank_transactions")
    .select("*, bank_account:bank_accounts(name, institution, last_four, type, subtype)", { count: "exact" })
    .eq("user_id", user.id);

  // Status filter — maps to the three booleans/FKs we maintain on the row.
  if (status === "needs_review") {
    q = q.eq("is_personal", false).is("linked_expense_id", null).is("matched_invoice_id", null);
  } else if (status === "personal") {
    q = q.eq("is_personal", true);
  } else if (status === "logged") {
    q = q.not("linked_expense_id", "is", null);
  } else if (status === "matched") {
    q = q.not("matched_invoice_id", "is", null);
  }

  if (account !== "all") q = q.eq("bank_account_id", account);
  if (txType  !== "all") q = q.eq("type", txType);

  // Plaid primary lives at details.personal_finance_category.primary (JSONB).
  if (category !== "all") {
    q = q.eq("details->personal_finance_category->>primary", category);
  }

  if (search) {
    // Case-insensitive across description + the JSONB merchant_name.
    const escaped = search.replace(/[%,]/g, (m) => "\\" + m);
    q = q.or(`description.ilike.%${escaped}%,details->>merchant_name.ilike.%${escaped}%`);
  }

  // Sort
  if (sort === "date_desc")        q = q.order("date", { ascending: false }).order("id", { ascending: false });
  else if (sort === "date_asc")    q = q.order("date", { ascending: true  }).order("id", { ascending: true  });
  else if (sort === "amount_desc") q = q.order("amount", { ascending: false }).order("id", { ascending: false });
  else                              q = q.order("amount", { ascending: true  }).order("id", { ascending: true  });

  // Pagination
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  q = q.range(from, to);

  const { data: rows, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // PostgREST returns joined rows as arrays when there's no FK constraint;
  // normalise to a single object so the client can rely on shape.
  const transactions = (rows ?? []).map((tx) => {
    if (Array.isArray((tx as { bank_account?: unknown }).bank_account)) {
      (tx as { bank_account: unknown }).bank_account =
        (tx as { bank_account: unknown[] }).bank_account[0] ?? null;
    }
    return tx as BankTransaction;
  });

  // ── KPIs: current calendar month, in/out/net ─────────────────────────────
  // Computed independently from the filter — they're a stable header stat.
  const now   = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: monthRows } = await supabase
    .from("bank_transactions")
    .select("amount, is_personal, date")
    .eq("user_id", user.id)
    .eq("is_personal", false)
    .gte("date", start)
    .limit(1000);
  let inSum = 0, outSum = 0;
  for (const r of monthRows ?? []) {
    const amt = Number(r.amount);
    if (amt > 0) inSum  += amt;
    else         outSum += Math.abs(amt);
  }
  const kpis = {
    in_this_month:  inSum,
    out_this_month: outSum,
    net:            inSum - outSum,
  };

  return NextResponse.json({
    transactions,
    total:    count ?? 0,
    page,
    pageSize,
    kpis,
  });
}
