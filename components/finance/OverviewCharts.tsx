"use client";

// Finance overview — real-data visualisations.
//
// Three cards wired to the same time / invoices / expenses the overview KPIs
// use: a 6-month cash-flow bar chart (collected invoice $ vs expenses),
// an expenses-by-category donut (YTD), and a 6-month billable-hours bar.
// Pure inline SVG — no chart lib. This is intentionally a starting point;
// we expect to iterate on what's most useful.

import type { TimeEntry, Expense, Invoice, ExpenseCategory } from "@/types/database";

interface Props {
  timeEntries: TimeEntry[];
  expenses:    Expense[];
  invoices:    Invoice[];
}

const CARD_STYLE: React.CSSProperties = {
  background:   "var(--color-off-white)",
  border:       "0.5px solid var(--color-border)",
  borderRadius: 12,
  boxShadow:    "0 2px 8px rgba(31,33,26,0.04)",
  padding:      "14px 16px",
};
const TITLE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600,
  color: "var(--color-charcoal)", letterSpacing: "-0.005em",
};
const CAPTION_STYLE: React.CSSProperties = { fontSize: 10.5, color: "var(--color-grey)", marginTop: 2 };

const CATEGORY_META: Record<ExpenseCategory, { label: string; color: string }> = {
  materials:  { label: "Materials",  color: "#a37f12" },
  travel:     { label: "Travel",     color: "var(--color-sage)" },
  production: { label: "Production", color: "#7f6f9c" },
  software:   { label: "Software",   color: "var(--color-charcoal)" },
  other:      { label: "Other",      color: "var(--color-grey)" },
};

function fmtUSD(n: number, dp = 0): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function invoiceTotal(inv: Invoice): number {
  return (inv.line_items ?? []).reduce((s, li) => s + Number(li.amount), 0);
}

// Last 6 month buckets as { key: "YYYY-MM", label: "Jun" }, oldest→newest.
function lastMonths(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: dt.toLocaleString("en-US", { month: "short" }) });
  }
  return out;
}

export default function OverviewCharts({ timeEntries, expenses, invoices }: Props) {
  const months = lastMonths(6);
  const yearStart = `${new Date().getFullYear()}-01-01`;

  // Cash flow: collected invoice $ vs expenses, per month.
  const income = months.map((m) =>
    invoices.filter((inv) => inv.status === "paid" && (inv.paid_at ?? "").slice(0, 7) === m.key)
      .reduce((s, inv) => s + invoiceTotal(inv), 0));
  const spend = months.map((m) =>
    expenses.filter((e) => e.date.slice(0, 7) === m.key)
      .reduce((s, e) => s + Number(e.amount), 0));

  // Billable hours per month.
  const hours = months.map((m) =>
    timeEntries.filter((e) => e.billable && (e.logged_at ?? "").slice(0, 7) === m.key)
      .reduce((s, e) => s + e.duration_minutes, 0) / 60);

  // Expenses by category, YTD.
  const byCat = (Object.keys(CATEGORY_META) as ExpenseCategory[]).map((cat) => ({
    cat,
    value: expenses.filter((e) => e.date >= yearStart && e.category === cat).reduce((s, e) => s + Number(e.amount), 0),
  })).filter((c) => c.value > 0);

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
      <CashFlowCard months={months} income={income} spend={spend} />
      <CategoryCard data={byCat} />
      <HoursCard months={months} hours={hours} />
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-[11px]" style={{ color: "var(--color-grey)", marginTop: 16 }}>{text}</p>;
}

// ── Cash flow ───────────────────────────────────────────────────────────────
function CashFlowCard({ months, income, spend }: { months: { key: string; label: string }[]; income: number[]; spend: number[] }) {
  const max = Math.max(1, ...income, ...spend);
  const W = 360, H = 130, gap = 10, n = months.length;
  const groupW = (W - gap * (n - 1)) / n;
  const barW = (groupW - 3) / 2;
  const has = income.some((v) => v > 0) || spend.some((v) => v > 0);

  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>Cash flow</p>
      <p style={CAPTION_STYLE}>Collected vs expenses · last 6 months</p>
      {has ? (
        <>
          <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "auto", marginTop: 12, display: "block" }}>
            {months.map((m, i) => {
              const x = i * (groupW + gap);
              const inH = (income[i] / max) * H;
              const outH = (spend[i] / max) * H;
              return (
                <g key={m.key}>
                  <rect x={x} y={H - inH} width={barW} height={inH} fill="var(--color-sage)" rx={1.5} />
                  <rect x={x + barW + 3} y={H - outH} width={barW} height={outH} fill="var(--color-charcoal)" opacity={0.85} rx={1.5} />
                  <text x={x + groupW / 2} y={H + 14} fontSize={9} textAnchor="middle" fill="var(--color-grey)">{m.label}</text>
                </g>
              );
            })}
          </svg>
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10.5, color: "var(--color-grey)" }}>
            <Swatch color="var(--color-sage)" label="Collected" />
            <Swatch color="var(--color-charcoal)" label="Expenses" />
          </div>
        </>
      ) : <EmptyNote text="No collected payments or expenses yet." />}
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color }} />
      {label}
    </span>
  );
}

// ── Expenses by category ──────────────────────────────────────────────────────
function CategoryCard({ data }: { data: { cat: ExpenseCategory; value: number }[] }) {
  const total = data.reduce((s, c) => s + c.value, 0);
  const R = 50, INNER = 31, CX = 60, CY = 60;
  let acc = 0;
  const arcs = data.map((c) => {
    const frac = c.value / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    const a1 = (acc + frac) * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    return { c, d: donutArc(CX, CY, R, INNER, a0, a1) };
  });

  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>Expenses by category</p>
      <p style={CAPTION_STYLE}>This year</p>
      {total > 0 ? (
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
          <svg viewBox="0 0 120 120" style={{ width: 108, height: 108, flexShrink: 0 }}>
            {arcs.map(({ c, d }) => <path key={c.cat} d={d} fill={CATEGORY_META[c.cat].color} />)}
            <text x={60} y={58} textAnchor="middle" fontSize={10} fill="var(--color-grey)">Total</text>
            <text x={60} y={73} textAnchor="middle" fontSize={13} fill="var(--color-charcoal)" fontWeight={600}
              style={{ fontFamily: "var(--font-display)" }}>{fmtUSD(total)}</text>
          </svg>
          <ul style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {data.map((c) => (
              <li key={c.cat} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--color-charcoal)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_META[c.cat].color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{CATEGORY_META[c.cat].label}</span>
                <span style={{ color: "var(--color-grey)", fontVariantNumeric: "tabular-nums" }}>{fmtUSD(c.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <EmptyNote text="No expenses logged this year." />}
    </div>
  );
}

function donutArc(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0o = cx + R * Math.cos(a0), y0o = cy + R * Math.sin(a0);
  const x1o = cx + R * Math.cos(a1), y1o = cy + R * Math.sin(a1);
  const x0i = cx + r * Math.cos(a1), y0i = cy + r * Math.sin(a1);
  const x1i = cx + r * Math.cos(a0), y1i = cy + r * Math.sin(a0);
  return [`M ${x0o} ${y0o}`, `A ${R} ${R} 0 ${large} 1 ${x1o} ${y1o}`, `L ${x0i} ${y0i}`, `A ${r} ${r} 0 ${large} 0 ${x1i} ${y1i}`, "Z"].join(" ");
}

// ── Billable hours ────────────────────────────────────────────────────────────
function HoursCard({ months, hours }: { months: { key: string; label: string }[]; hours: number[] }) {
  const max = Math.max(1, ...hours);
  const W = 240, H = 130, gap = 12, n = months.length;
  const barW = (W - gap * (n - 1)) / n;
  const has = hours.some((v) => v > 0);
  const totalHrs = hours.reduce((s, v) => s + v, 0);

  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>Billable hours</p>
      <p style={CAPTION_STYLE}>{has ? `${totalHrs.toFixed(1)}h · last 6 months` : "Last 6 months"}</p>
      {has ? (
        <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "auto", marginTop: 12, display: "block" }}>
          {months.map((m, i) => {
            const x = i * (barW + gap);
            const h = (hours[i] / max) * H;
            return (
              <g key={m.key}>
                <rect x={x} y={H - h} width={barW} height={h} fill="var(--color-sage)" rx={1.5} />
                <text x={x + barW / 2} y={H + 14} fontSize={9} textAnchor="middle" fill="var(--color-grey)">{m.label}</text>
              </g>
            );
          })}
        </svg>
      ) : <EmptyNote text="No billable time logged yet." />}
    </div>
  );
}
