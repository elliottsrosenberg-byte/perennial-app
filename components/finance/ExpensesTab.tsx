"use client";

import { useState, useMemo } from "react";
import type { Expense, Project, ExpenseCategory } from "@/types/database";
import EmptyState from "@/components/ui/EmptyState";

interface Props {
  expenses: Expense[];
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onExpenseCreated: (e: Expense) => void;
  onExpenseDeleted: (id: string) => void;
}

const CAT_CONFIG: Record<ExpenseCategory, { color: string; bg: string; label: string; initial: string }> = {
  materials:  { color: "#3d6b4f", bg: "rgba(61,107,79,0.1)",   label: "Materials",  initial: "M" },
  travel:     { color: "#2563ab", bg: "rgba(37,99,171,0.1)",   label: "Travel",     initial: "T" },
  production: { color: "#b8860b", bg: "rgba(184,134,11,0.1)",  label: "Production", initial: "P" },
  software:   { color: "#6d4fa3", bg: "rgba(109,79,163,0.1)",  label: "Software",   initial: "S" },
  other:      { color: "#148c8c", bg: "rgba(20,140,140,0.1)",  label: "Other",      initial: "O" },
};

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ExpensesTab({ expenses, projects, onExpenseCreated, onExpenseDeleted }: Props) {
  const [filterProject, setFilterProject] = useState("all");
  const [filterCat, setFilterCat]         = useState("all");
  const [filterPeriod, setFilterPeriod]   = useState("month");

  const periodStart = useMemo(() => {
    const now = new Date();
    if (filterPeriod === "month") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    if (filterPeriod === "last")  {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    }
    return `${now.getFullYear()}-01-01`;
  }, [filterPeriod]);

  const periodEnd = useMemo(() => {
    if (filterPeriod === "last") {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    }
    return "9999-12-31";
  }, [filterPeriod]);

  const filtered = useMemo(() => expenses.filter((e) => {
    if (filterProject !== "all" && e.project_id !== filterProject) return false;
    if (filterCat !== "all" && e.category !== filterCat) return false;
    if (e.date < periodStart || e.date > periodEnd) return false;
    return true;
  }), [expenses, filterProject, filterCat, periodStart, periodEnd]);

  const total      = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const unattached = filtered.filter((e) => !e.project_id).reduce((s, e) => s + Number(e.amount), 0);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => { map[e.category] = (map[e.category] ?? 0) + Number(e.amount); });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [filtered]);

  const byProject = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    filtered.forEach((e) => {
      const key = e.project_id ?? "__none__";
      if (!map[key]) map[key] = { name: e.project?.title ?? "Unattached", total: 0 };
      map[key].total += Number(e.amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const maxCatAmt = Math.max(1, ...byCategory.map(([, v]) => v));

  const selectCls = "px-3 py-1.5 text-[11px] rounded-lg focus:outline-none";
  const selectStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={selectCls} style={selectStyle}>
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          <option value="__none__">Unattached</option>
        </select>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className={selectCls} style={selectStyle}>
          <option value="all">All categories</option>
          {Object.entries(CAT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className={selectCls} style={selectStyle}>
          <option value="month">This month</option>
          <option value="last">Last month</option>
          <option value="ytd">YTD</option>
        </select>
        <div className="ml-auto text-[11px]" style={{ color: "var(--color-grey)" }}>
          Total: <strong style={{ color: "var(--color-charcoal)" }}>{fmtCurrency(total)}</strong>
          {unattached > 0 && <span style={{ color: "#b8860b" }}> · {fmtCurrency(unattached)} unattached</span>}
        </div>
      </div>

      <div className="flex gap-4 flex-1">
        {/* Expense table */}
        <div className="flex-1 rounded-xl overflow-hidden" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
          {/* Column headers */}
          <div className="grid px-4 py-2 text-[9px] font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: "28px 1fr 120px 64px 16px 72px 24px", gap: "0.625rem", background: "rgba(31,33,26,0.04)", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}>
            <div />
            <div>Description</div>
            <div>Project</div>
            <div>Date</div>
            <div title="Receipt">R</div>
            <div className="text-right">Amount</div>
            <div />
          </div>
          {filtered.map((e) => {
            const cfg = CAT_CONFIG[e.category];
            return (
              <div key={e.id} className="grid items-center px-4 py-2.5 group"
                style={{ gridTemplateColumns: "28px 1fr 120px 64px 16px 72px 24px", gap: "0.625rem", borderBottom: "0.5px solid var(--color-border)" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}>{cfg.initial}</div>
                <div>
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{e.description}</p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>{cfg.label}</p>
                </div>
                {e.project?.title ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded truncate"
                    style={{ background: "rgba(31,33,26,0.07)", color: "var(--color-grey)" }}>{e.project.title}</span>
                ) : (
                  <span className="text-[10px] italic" style={{ color: "var(--color-grey)" }}>Unattached</span>
                )}
                <span className="text-[10px] tabular-nums" style={{ color: "var(--color-grey)" }}>
                  {new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <div className="w-2 h-2 rounded-full" title={e.receipt_url ? "Receipt attached" : "No receipt"}
                  style={{ background: e.receipt_url ? "var(--color-sage)" : "var(--color-border)" }} />
                <span className="text-[12px] font-semibold tabular-nums text-right" style={{ color: "var(--color-charcoal)" }}>
                  {fmtCurrency(Number(e.amount))}
                </span>
                <button
                  onClick={() => { if (confirm("Delete this expense?")) onExpenseDeleted(e.id); }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-opacity"
                  style={{ color: "var(--color-grey)" }}
                  onMouseEnter={ev => ev.currentTarget.style.color = "var(--color-red-orange)"}
                  onMouseLeave={ev => ev.currentTarget.style.color = "var(--color-grey)"}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l10 10M13 3L3 13"/></svg>
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && expenses.length === 0 && (
            <EmptyState
              icon="🧾"
              heading="Log your studio expenses"
              body="Track materials, travel, software, production costs, and other expenses by project. Expenses feed into your financial overview and can be included in client invoices."
              ashPrompt="What expenses should I be tracking as a designer? How do expenses connect to invoicing in Perennial?"
              tips={[
                "Log expenses by category: materials, travel, production, software, or other.",
                "Link an expense to a project to track per-project profitability.",
                "Expenses can be pulled into invoices as line items when billing a client.",
              ]}
            />
          )}
          {filtered.length === 0 && expenses.length > 0 && (
            <p className="px-4 py-6 text-[12px] text-center" style={{ color: "var(--color-grey)" }}>No expenses match this filter.</p>
          )}
        </div>

        {/* Side breakdown */}
        <div className="flex flex-col gap-4" style={{ width: 220 }}>
          {/* By category */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
              <span className="text-[12px] font-semibold" style={{ color: "var(--color-charcoal)" }}>By category</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {byCategory.map(([cat, amt]) => {
                const cfg = CAT_CONFIG[cat as ExpenseCategory];
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-[11px] w-20 shrink-0" style={{ color: "var(--color-grey)" }}>{cfg.label}</span>
                    <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: "rgba(31,33,26,0.07)" }}>
                      <div style={{ width: `${(amt / maxCatAmt) * 100}%`, height: "100%", background: cfg.color, opacity: 0.7, borderRadius: 3 }} />
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums w-12 text-right" style={{ color: "var(--color-charcoal)" }}>
                      {fmtCurrency(amt)}
                    </span>
                  </div>
                );
              })}
              {byCategory.length === 0 && <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>—</p>}
            </div>
          </div>

          {/* By project */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
            <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border)" }}>
              <span className="text-[12px] font-semibold" style={{ color: "var(--color-charcoal)" }}>By project</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {byProject.map((p) => (
                <div key={p.name} className="flex items-center justify-between">
                  <span className="text-[11px] truncate flex-1" style={{ color: p.name === "Unattached" ? "#b8860b" : "var(--color-grey)" }}>{p.name}</span>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: p.name === "Unattached" ? "#b8860b" : "var(--color-charcoal)" }}>
                    {fmtCurrency(p.total)}
                  </span>
                </div>
              ))}
              {byProject.length === 0 && <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>—</p>}
            </div>
          </div>

          {/* Unattached warning */}
          {unattached > 0 && (
            <div className="rounded-lg p-3 text-[11px]"
              style={{ background: "rgba(184,134,11,0.1)", border: "0.5px solid rgba(184,134,11,0.2)", color: "#6b6860", lineHeight: 1.5 }}>
              <strong style={{ color: "#b8860b" }}>{fmtCurrency(unattached)} unattached.</strong>{" "}
              Attach these to a project to include them in your next invoice.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
