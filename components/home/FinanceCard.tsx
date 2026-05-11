import Link from "next/link";

interface Props {
  billableHours:        number;
  billableAmount:       number;
  outstandingTotal:     number;
  outstandingCount:     number;
  overdueTotal:         number;
  overdueCount:         number;
  overdueInvoiceNumber: number | null;
  expensesTotal:        number;
}

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtHours(h: number) {
  const r = Math.round(h * 10) / 10;
  return `${r} hr${r !== 1 ? "s" : ""}`;
}

export default function FinanceCard({
  billableHours,
  billableAmount,
  outstandingTotal,
  outstandingCount,
  overdueTotal,
  overdueCount,
  overdueInvoiceNumber,
  expensesTotal,
}: Props) {
  const now   = new Date();
  const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()];

  const billableLabel =
    billableHours === 0
      ? "0 hrs"
      : billableAmount > 0
      ? `${fmtHours(billableHours)} · ${fmtCurrency(billableAmount)}`
      : fmtHours(billableHours);

  const outstandingLabel =
    outstandingCount === 0
      ? "None"
      : `${fmtCurrency(outstandingTotal)} · ${outstandingCount} pending`;

  const overdueLabel =
    overdueCount === 0
      ? "—"
      : overdueCount === 1 && overdueInvoiceNumber !== null
      ? `${fmtCurrency(overdueTotal)} · Invoice #${String(overdueInvoiceNumber).padStart(3, "0")}`
      : `${fmtCurrency(overdueTotal)} · ${overdueCount} overdue`;

  const expensesLabel = expensesTotal === 0 ? "$0" : fmtCurrency(expensesTotal);

  const ROWS = [
    { label: "Billable this month",  value: billableLabel,   variant: "normal" as const },
    { label: "Outstanding invoices", value: outstandingLabel, variant: outstandingCount > 0 ? "warn" as const : "normal" as const },
    { label: "Overdue",              value: overdueLabel,     variant: overdueCount > 0 ? "alert" as const : "normal" as const },
    { label: "Expenses this month",  value: expensesLabel,    variant: "normal" as const },
  ];

  const VARIANTS = {
    normal: "var(--color-charcoal)",
    warn:   "#a07800",
    alert:  "var(--color-red-orange)",
  };

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      <div
        className="flex items-center gap-2 px-[14px] py-[10px]"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Finance</span>
        <span
          className="text-[10px] px-[7px] py-[1px] rounded-full"
          style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
        >
          {month} {now.getFullYear()}
        </span>
        <div className="flex-1" />
        <Link href="/finance" className="text-[11px] hover:underline" style={{ color: "#2563ab" }}>
          View all →
        </Link>
      </div>

      {ROWS.map((row, i) => (
        <div
          key={i}
          className="flex justify-between items-baseline px-[14px] py-[8px] text-[12px]"
          style={{ borderBottom: i < ROWS.length - 1 ? "0.5px solid var(--color-border)" : "none" }}
        >
          <span style={{ color: "#6b6860" }}>{row.label}</span>
          <span className="font-semibold" style={{ color: VARIANTS[row.variant] }}>{row.value}</span>
        </div>
      ))}

    </div>
  );
}
