"use client";

import Link from "next/link";

interface HomeReminder {
  id: string;
  title: string;
  due_date: string | null;
}

interface OverdueInvoice {
  id: string;
  number: number;
  total: number;
}

interface Props {
  reminders: HomeReminder[];
  overdueInvoices: OverdueInvoice[];
}

type Urgency = "overdue" | "today";

const URGENCY_STYLE = {
  overdue: {
    dot:  "var(--color-red-orange)",
    pill: { bg: "rgba(220,62,13,0.10)", text: "var(--color-red-orange)", label: "Overdue" },
  },
  today: {
    dot:  "var(--color-warm-yellow)",
    pill: { bg: "rgba(232,197,71,0.15)", text: "#a07800", label: "Due today" },
  },
};

function classifyReminder(due: string | null): Urgency {
  if (!due) return "overdue";
  const todayStr = new Date().toISOString().split("T")[0];
  return due.slice(0, 10) < todayStr ? "overdue" : "today";
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function TodayCard({ reminders, overdueInvoices }: Props) {
  const now     = new Date();
  const month   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()];
  const dateLabel = `${month} ${now.getDate()}`;

  // Cap total items at 5 to avoid overflow
  const reminderItems = reminders.slice(0, 5);
  const invoiceSlots  = Math.max(0, 5 - reminderItems.length);
  const invoiceItems  = overdueInvoices.slice(0, invoiceSlots);
  const isEmpty       = reminderItems.length === 0 && invoiceItems.length === 0;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        gridRow: "span 2",
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-[14px] py-[10px] shrink-0"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Today</span>
        <span
          className="text-[10px] px-[7px] py-[1px] rounded-full"
          style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
        >
          {dateLabel}
        </span>
      </div>

      {/* Items */}
      <div className="flex flex-col flex-1">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center flex-1 py-8 px-4 text-center">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center mb-3"
              style={{ background: "rgba(141,208,71,0.12)" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#3d6b4f" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8l4 4 8-8"/>
              </svg>
            </div>
            <p className="text-[12px] font-medium mb-0.5" style={{ color: "var(--color-charcoal)" }}>
              You&apos;re all caught up
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              No overdue items today.
            </p>
          </div>
        ) : (
          <>
            {reminderItems.map((r) => {
              const urgency = classifyReminder(r.due_date);
              const style   = URGENCY_STYLE[urgency];
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-2 px-[14px] py-[9px]"
                  style={{ borderBottom: "0.5px solid var(--color-border)" }}
                >
                  <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: style.dot }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] truncate block" style={{ color: "var(--color-charcoal)" }}>
                      {r.title}
                    </span>
                  </div>
                  <span
                    className="text-[9px] font-bold px-[7px] py-[2px] rounded-full shrink-0"
                    style={{ background: style.pill.bg, color: style.pill.text }}
                  >
                    {style.pill.label}
                  </span>
                </div>
              );
            })}

            {invoiceItems.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-2 px-[14px] py-[9px]"
                style={{ borderBottom: "0.5px solid var(--color-border)" }}
              >
                <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: "var(--color-red-orange)" }} />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] truncate block" style={{ color: "var(--color-charcoal)" }}>
                    Invoice #{String(inv.number).padStart(3, "0")} · {fmtCurrency(inv.total)}
                  </span>
                </div>
                <span
                  className="text-[9px] font-bold px-[7px] py-[2px] rounded-full shrink-0"
                  style={{ background: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" }}
                >
                  Overdue
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <Link
        href="/calendar"
        className="flex items-center px-[14px] py-[9px] text-[11px] w-full transition-colors"
        style={{ borderTop: "0.5px solid var(--color-border)", color: "var(--color-grey)", background: "transparent" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span className="mr-1.5">+</span> Add reminder
      </Link>
    </div>
  );
}
