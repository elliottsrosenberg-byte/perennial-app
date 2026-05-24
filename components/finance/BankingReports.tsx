"use client";

// Banking → Reports — UI shell.
//
// Pure placeholder dashboard. No real analytics: each card carries a
// "Live data coming" sage pip in the corner and a mock visualisation
// (inline SVG, no chart library). When the underlying queries land, the
// data wiring slots in here without changing the BankingTab toggle.

import { Music, ShoppingBag, Briefcase, Car, Receipt as ReceiptIcon, Wrench } from "lucide-react";

const CARD_STYLE: React.CSSProperties = {
  background:   "var(--color-off-white)",
  border:       "0.5px solid var(--color-border)",
  borderRadius: 12,
  boxShadow:    "0 2px 8px rgba(31,33,26,0.04)",
  padding:      "14px 16px",
  position:     "relative",
};

const TITLE_STYLE: React.CSSProperties = {
  fontFamily:    "var(--font-display)",
  fontSize:      12,
  fontWeight:    600,
  color:         "var(--color-charcoal)",
  letterSpacing: "-0.01em",
};

const CAPTION_STYLE: React.CSSProperties = {
  fontSize: 10.5,
  color:    "var(--color-grey)",
  marginTop: 2,
};

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];
const MOCK_INCOME  = [4200, 5100, 3800, 6200, 4900, 5500, 7100, 4800, 5200, 5900, 6300, 6800];
const MOCK_SPEND   = [3100, 3600, 4100, 3200, 3700, 4200, 5300, 3500, 3900, 4100, 4500, 4700];

const MOCK_CATEGORY_SPEND: { label: string; value: number; color: string }[] = [
  { label: "Materials",  value: 3400, color: "#a37f12"           },
  { label: "Travel",     value: 1800, color: "var(--color-sage)" },
  { label: "Production", value: 2200, color: "#7f6f9c"           },
  { label: "Software",   value:  920, color: "var(--color-charcoal)" },
  { label: "Other",      value:  640, color: "var(--color-grey)" },
];

const MOCK_MERCHANTS: { name: string; count: number; total: number; icon: React.ElementType }[] = [
  { name: "Uber",          count: 14, total: 312.40, icon: Car        },
  { name: "GERTIE",        count: 11, total: 218.55, icon: ReceiptIcon},
  { name: "MTA NYC",       count: 18, total: 145.00, icon: Car        },
  { name: "Home Depot",    count:  5, total: 489.22, icon: Wrench     },
  { name: "B&H Photo",     count:  3, total: 612.18, icon: ShoppingBag},
  { name: "Spotify",       count:  1, total:  10.99, icon: Music      },
  { name: "Adobe",         count:  1, total:  54.99, icon: Briefcase  },
  { name: "Whole Foods",   count:  8, total: 184.30, icon: ShoppingBag},
];

// ── Shared bits ────────────────────────────────────────────────────────────

function ShellPip() {
  return (
    <span
      title="Live data coming — placeholder values shown"
      style={{
        position: "absolute", top: 12, right: 12,
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 9.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
        color: "var(--color-sage)",
        padding: "2px 7px", borderRadius: 999,
        background: "rgba(155,163,122,0.12)",
        border: "0.5px solid rgba(155,163,122,0.35)",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--color-sage)" }} />
      Live data coming
    </span>
  );
}

function fmtUSD(n: number, dp = 0): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function BankingReports() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      paddingBottom: 8,
    }}>
      <MonthlyCashFlowCard />
      <SpendByCategoryCard />
      <TopMerchantsCard />
      <IncomeRatioCard />
    </div>
  );
}

// ── 1. Monthly cash flow ───────────────────────────────────────────────────

function MonthlyCashFlowCard() {
  const max = Math.max(...MOCK_INCOME, ...MOCK_SPEND);
  const W = 360, H = 140, gap = 4, groupW = (W - gap * 11) / 12;
  const barW = (groupW - 2) / 2;

  return (
    <div style={CARD_STYLE}>
      <ShellPip />
      <p style={TITLE_STYLE}>Monthly cash flow</p>
      <p style={CAPTION_STYLE}>12-month rollup · placeholder data</p>
      <svg viewBox={`0 0 ${W} ${H + 22}`} preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", marginTop: 12, display: "block" }}>
        {MOCK_MONTHS.map((m, i) => {
          const x = i * (groupW + gap);
          const inH  = (MOCK_INCOME[i] / max) * H;
          const outH = (MOCK_SPEND[i]  / max) * H;
          return (
            <g key={m}>
              <rect x={x}             y={H - inH}  width={barW} height={inH}
                fill="var(--color-sage)" rx={1.5} />
              <rect x={x + barW + 2}  y={H - outH} width={barW} height={outH}
                fill="var(--color-charcoal)" opacity={0.85} rx={1.5} />
              <text x={x + groupW / 2} y={H + 14}
                fontSize={9} textAnchor="middle"
                fill="var(--color-grey)">{m}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10.5, color: "var(--color-grey)" }}>
        <Swatch color="var(--color-sage)"     label="Income" />
        <Swatch color="var(--color-charcoal)" label="Spend"  />
      </div>
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

// ── 2. Spend by category ───────────────────────────────────────────────────

function SpendByCategoryCard() {
  const total = MOCK_CATEGORY_SPEND.reduce((s, c) => s + c.value, 0);
  const R = 52, INNER = 32, CX = 64, CY = 64;
  let acc = 0;
  const arcs = MOCK_CATEGORY_SPEND.map((c) => {
    const frac    = c.value / total;
    const startA  = acc * 2 * Math.PI - Math.PI / 2;
    const endA    = (acc + frac) * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    return { c, d: donutArc(CX, CY, R, INNER, startA, endA) };
  });

  return (
    <div style={CARD_STYLE}>
      <ShellPip />
      <p style={TITLE_STYLE}>Spend by category</p>
      <p style={CAPTION_STYLE}>This month · placeholder data</p>
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 14 }}>
        <svg viewBox="0 0 128 128" style={{ width: 128, height: 128, flexShrink: 0 }}>
          {arcs.map(({ c, d }) => (
            <path key={c.label} d={d} fill={c.color} />
          ))}
          <text x={64} y={62} textAnchor="middle" fontSize={11}
            fill="var(--color-grey)" fontWeight={500}>Total</text>
          <text x={64} y={78} textAnchor="middle" fontSize={14}
            fill="var(--color-charcoal)" fontWeight={600}
            style={{ fontFamily: "var(--font-display)" }}>{fmtUSD(total)}</text>
        </svg>
        <ul style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {MOCK_CATEGORY_SPEND.map((c) => (
            <li key={c.label} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 11, color: "var(--color-charcoal)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.label}
              </span>
              <span style={{ color: "var(--color-grey)", fontVariantNumeric: "tabular-nums" }}>
                {fmtUSD(c.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Build an SVG path for a donut segment between two angles.
function donutArc(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0o = cx + R * Math.cos(a0), y0o = cy + R * Math.sin(a0);
  const x1o = cx + R * Math.cos(a1), y1o = cy + R * Math.sin(a1);
  const x0i = cx + r * Math.cos(a1), y0i = cy + r * Math.sin(a1);
  const x1i = cx + r * Math.cos(a0), y1i = cy + r * Math.sin(a0);
  return [
    `M ${x0o} ${y0o}`,
    `A ${R} ${R} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x0i} ${y0i}`,
    `A ${r} ${r} 0 ${large} 0 ${x1i} ${y1i}`,
    "Z",
  ].join(" ");
}

// ── 3. Top merchants this month ────────────────────────────────────────────

function TopMerchantsCard() {
  return (
    <div style={CARD_STYLE}>
      <ShellPip />
      <p style={TITLE_STYLE}>Top merchants this month</p>
      <p style={CAPTION_STYLE}>By total spend · placeholder data</p>
      <ul style={{
        marginTop: 10,
        display: "flex", flexDirection: "column",
      }}>
        {MOCK_MERCHANTS.map((m, i) => {
          const Icon = m.icon;
          return (
            <li key={m.name} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 4px",
              borderTop: i === 0 ? "none" : "0.5px solid var(--color-border)",
              fontSize: 11.5,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: "var(--color-cream)", color: "var(--color-grey)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={11} strokeWidth={1.75} />
              </span>
              <span style={{ flex: 1, minWidth: 0, color: "var(--color-charcoal)", fontWeight: 500 }}>
                {m.name}
              </span>
              <span style={{ color: "var(--color-grey)", fontSize: 10.5, width: 56, textAlign: "right" }}>
                {m.count} tx
              </span>
              <span style={{
                color: "var(--color-charcoal)",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 500, width: 72, textAlign: "right",
              }}>
                {fmtUSD(m.total, 2)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── 4. Income vs expense ratio ─────────────────────────────────────────────

function IncomeRatioCard() {
  const incomeTotal = MOCK_INCOME.reduce((s, v) => s + v, 0);
  const spendTotal  = MOCK_SPEND.reduce((s, v) => s + v, 0);
  const ratio       = (incomeTotal / spendTotal).toFixed(2);

  // 12-month moving ratio for the inline sparkline.
  const ratios = MOCK_INCOME.map((v, i) => v / MOCK_SPEND[i]);
  const min = Math.min(...ratios), max = Math.max(...ratios);
  const W = 320, H = 56;
  const xs = ratios.map((_, i) => (i / (ratios.length - 1)) * W);
  const ys = ratios.map((r) => H - ((r - min) / (max - min || 1)) * H);
  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const fillPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div style={CARD_STYLE}>
      <ShellPip />
      <p style={TITLE_STYLE}>Income vs expense ratio</p>
      <p style={CAPTION_STYLE}>Trailing 12 months · placeholder data</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
        <p style={{
          fontFamily: "var(--font-display)",
          fontSize: 36, fontWeight: 600,
          color: "var(--color-sage)",
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}>
          {ratio}×
        </p>
        <p style={{ fontSize: 11, color: "var(--color-grey)" }}>
          earned per dollar spent
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 4}`} preserveAspectRatio="none"
        style={{ width: "100%", height: 70, marginTop: 10, display: "block" }}>
        <path d={fillPath} fill="rgba(155,163,122,0.16)" />
        <path d={linePath} stroke="var(--color-sage)" strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
