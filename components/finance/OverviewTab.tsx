"use client";

import type { TimeEntry, ActiveTimer, Expense, Invoice } from "@/types/database";

type Tab = "overview" | "time" | "expenses" | "invoices";

interface Props {
  timeEntries: TimeEntry[];
  activeTimer: ActiveTimer | null;
  timerSeconds: number;
  expenses: Expense[];
  invoices: Invoice[];
  onStopTimer: () => void;
  onSwitchTab: (tab: Tab) => void;
}

const PROJ_COLORS = ["#2563ab","#6d4fa3","#148c8c","#3d6b4f","#b8860b","#dc3e0d"];
function projectColor(id: string | null | undefined) {
  if (!id) return "#9BA37A";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return PROJ_COLORS[Math.abs(h) % PROJ_COLORS.length];
}

function fmtHrs(min: number) {
  const h = min / 60;
  return h % 1 === 0 ? `${h}` : h.toFixed(1);
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTimer(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function isOverdue(inv: Invoice) {
  return inv.status === "sent" && !!inv.due_at && inv.due_at < new Date().toISOString().split("T")[0];
}

function invoiceTotal(inv: Invoice) {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:   { bg: "rgba(31,33,26,0.07)", color: "var(--color-grey)",       label: "Draft"   },
  sent:    { bg: "rgba(37,99,171,0.1)", color: "#2563ab",                  label: "Sent"    },
  paid:    { bg: "rgba(61,107,79,0.1)", color: "var(--color-sage)",        label: "Paid"    },
  overdue: { bg: "rgba(220,62,13,0.1)", color: "var(--color-red-orange)",  label: "Overdue" },
};

export default function OverviewTab({ timeEntries, activeTimer, timerSeconds, expenses, invoices, onStopTimer, onSwitchTab }: Props) {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const yearStart  = `${now.getFullYear()}-01-01`;

  const billableMinThisMonth = timeEntries
    .filter((e) => e.billable && e.logged_at >= monthStart)
    .reduce((s, e) => s + e.duration_minutes, 0);

  const outstanding = invoices
    .filter((inv) => inv.status === "sent")
    .reduce((s, inv) => s + invoiceTotal(inv), 0);
  const overdueAmt = invoices
    .filter(isOverdue)
    .reduce((s, inv) => s + invoiceTotal(inv), 0);
  const overdueCount = invoices.filter(isOverdue).length;
  const sentCount = invoices.filter((i) => i.status === "sent" && !isOverdue(i)).length;

  const expensesYtd = expenses.filter((e) => e.date >= yearStart).reduce((s, e) => s + Number(e.amount), 0);
  const unattached  = expenses.filter((e) => e.date >= yearStart && !e.project_id).reduce((s, e) => s + Number(e.amount), 0);

  const collectedYtd = invoices
    .filter((inv) => inv.status === "paid" && inv.paid_at && inv.paid_at >= yearStart)
    .reduce((s, inv) => s + invoiceTotal(inv), 0);
  const paidCount = invoices.filter((inv) => inv.status === "paid" && inv.paid_at && inv.paid_at >= yearStart).length;
  const lastPaid  = invoices
    .filter((inv) => inv.status === "paid" && inv.paid_at)
    .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""))[0];

  const billableEarningsThisMonth = timeEntries
    .filter(e => e.billable && e.logged_at >= monthStart)
    .reduce((s, e) => s + (e.duration_minutes / 60) * (e.project?.rate ?? 0), 0);

  const recentTime = timeEntries.slice(0, 4);
  const recentInvoices = [...invoices]
    .sort((a, b) => {
      const order = (i: Invoice) => isOverdue(i) ? 0 : i.status === "sent" ? 1 : i.status === "draft" ? 2 : 3;
      return order(a) - order(b);
    })
    .slice(0, 4);
  const recentExpenses = expenses.slice(0, 3);

  const card = "rounded-xl overflow-hidden";
  const cardStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" };
  const cardHead = "flex items-center gap-2 px-4 py-3";
  const cardHeadStyle = { borderBottom: "0.5px solid var(--color-border)" };

  return (
    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: "Billable hrs · " + now.toLocaleString("en-US", { month: "short" }),
            value: fmtHrs(billableMinThisMonth),
            sub: billableEarningsThisMonth > 0
              ? `${fmtCurrency(billableEarningsThisMonth)} at project rates`
              : billableMinThisMonth > 0 ? "Rate not set on projects" : "No billable time this month",
            subColor: billableEarningsThisMonth > 0 ? "var(--color-grey)" : "var(--color-grey)",
          },
          {
            label: "Outstanding",
            value: fmtCurrency(outstanding),
            sub: overdueCount > 0 ? `${overdueCount} overdue · ${fmtCurrency(overdueAmt)}` : sentCount > 0 ? `${sentCount} sent, awaiting payment` : "No open invoices",
            subColor: overdueCount > 0 ? "var(--color-red-orange)" : "var(--color-grey)",
          },
          {
            label: "Expenses · YTD",
            value: fmtCurrency(expensesYtd),
            sub: unattached > 0 ? `${fmtCurrency(unattached)} unattached` : "All attached to projects",
            subColor: unattached > 0 ? "#b8860b" : "var(--color-grey)",
          },
          {
            label: "Collected · " + now.getFullYear(),
            value: fmtCurrency(collectedYtd),
            sub: paidCount > 0 ? `${paidCount} invoice${paidCount > 1 ? "s" : ""} paid` + (lastPaid?.paid_at ? ` · Last: ${new Date(lastPaid.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "") : "Nothing collected yet",
            subColor: "var(--color-grey)",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4 flex flex-col gap-1.5"
            style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-grey)" }}>{s.label}</p>
            <p className="text-[26px] font-semibold leading-none tracking-tight" style={{ color: "var(--color-charcoal)" }}>{s.value}</p>
            <p className="text-[11px]" style={{ color: s.subColor }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Main + side columns */}
      <div className="flex gap-4 flex-1">
        {/* Time card */}
        <div className={`${card} flex-1 flex flex-col`} style={cardStyle}>
          <div className={cardHead} style={cardHeadStyle}>
            <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>
              Time · {now.toLocaleString("en-US", { month: "long" })}
            </span>
            <button onClick={() => onSwitchTab("time")}
              className="text-[11px]" style={{ color: "var(--color-sage)" }}>See all →</button>
          </div>
          {/* Active timer */}
          {activeTimer && (
            <div className="flex items-center gap-2.5 px-4 py-2.5"
              style={{ background: "rgba(61,107,79,0.06)", borderBottom: "0.5px solid rgba(61,107,79,0.15)" }}>
              <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: "var(--color-sage)" }} />
              <span className="text-[12px] font-medium flex-1 truncate" style={{ color: "var(--color-sage)" }}>
                {activeTimer.project?.title ?? "No project"}{activeTimer.description ? ` · ${activeTimer.description}` : ""}
              </span>
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--color-sage)" }}>{fmtTimer(timerSeconds)}</span>
              <button onClick={onStopTimer}
                className="text-[10px] px-2 py-1 rounded-md"
                style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}>
                Stop
              </button>
            </div>
          )}
          {recentTime.map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 px-4 py-2.5"
              style={{ borderBottom: "0.5px solid var(--color-border)" }}>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: projectColor(e.project_id) }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{e.description || "—"}</p>
                <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>{e.project?.title ?? "No project"}</p>
              </div>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: e.billable ? "rgba(61,107,79,0.1)" : "rgba(31,33,26,0.07)", color: e.billable ? "var(--color-sage)" : "var(--color-grey)" }}>
                {e.billable ? "BILLABLE" : "INTERNAL"}
              </span>
              <span className="text-[12px] font-medium tabular-nums w-12 text-right" style={{ color: "var(--color-charcoal)" }}>
                {fmtDuration(e.duration_minutes)}
              </span>
            </div>
          ))}
          {recentTime.length === 0 && !activeTimer && (
            <p className="px-4 py-4 text-[12px]" style={{ color: "var(--color-grey)" }}>No time logged this month.</p>
          )}
        </div>

        {/* Side column */}
        <div className="flex flex-col gap-4" style={{ width: 272 }}>
          {/* Invoices card */}
          <div className={card} style={cardStyle}>
            <div className={cardHead} style={cardHeadStyle}>
              <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Invoices</span>
              <button onClick={() => onSwitchTab("invoices")} className="text-[11px]" style={{ color: "var(--color-sage)" }}>See all →</button>
            </div>
            {recentInvoices.map((inv) => {
              const overdue = isOverdue(inv);
              const statusKey = overdue ? "overdue" : inv.status;
              const st = STATUS_STYLE[statusKey];
              const total = invoiceTotal(inv);
              const clientName = inv.client_contact
                ? `${inv.client_contact.first_name} ${inv.client_contact.last_name}`
                : inv.client_company?.name ?? "—";
              return (
                <div key={inv.id} className="flex items-center gap-2.5 px-4 py-2.5"
                  style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                  <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--color-grey)" }}>#{inv.number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{clientName}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--color-grey)" }}>{inv.project?.title ?? ""}</p>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: st.bg, color: st.color }}>{st.label.toUpperCase()}</span>
                  <span className="text-[12px] font-semibold tabular-nums shrink-0 w-14 text-right"
                    style={{ color: overdue ? "var(--color-red-orange)" : inv.status === "paid" ? "var(--color-sage)" : "var(--color-charcoal)" }}>
                    {fmtCurrency(total)}
                  </span>
                </div>
              );
            })}
            {recentInvoices.length === 0 && (
              <p className="px-4 py-4 text-[12px]" style={{ color: "var(--color-grey)" }}>No invoices yet.</p>
            )}
          </div>

          {/* Expenses card */}
          <div className={card} style={cardStyle}>
            <div className={cardHead} style={cardHeadStyle}>
              <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Recent expenses</span>
              <button onClick={() => onSwitchTab("expenses")} className="text-[11px]" style={{ color: "var(--color-sage)" }}>See all →</button>
            </div>
            {recentExpenses.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 px-4 py-2.5"
                style={{ borderBottom: "0.5px solid var(--color-border)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>{e.description}</p>
                  <p className="text-[10px]" style={{ color: "var(--color-grey)" }}>{e.date} · {e.category}</p>
                </div>
                {e.project?.title ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "rgba(31,33,26,0.07)", color: "var(--color-grey)" }}>{e.project.title}</span>
                ) : (
                  <span className="text-[10px] italic shrink-0" style={{ color: "var(--color-grey)" }}>Unattached</span>
                )}
                <span className="text-[12px] font-semibold tabular-nums shrink-0 w-14 text-right" style={{ color: "var(--color-charcoal)" }}>
                  {fmtCurrency(Number(e.amount))}
                </span>
              </div>
            ))}
            {recentExpenses.length === 0 && (
              <p className="px-4 py-4 text-[12px]" style={{ color: "var(--color-grey)" }}>No expenses logged.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
