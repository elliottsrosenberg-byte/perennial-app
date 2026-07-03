"use client";

// Presence overview — audience visualisations. Deliberately mirrors the
// Finance overview's chart vocabulary (same card chrome, captions, inline
// SVG, donut, bars) so the two modules read as one system. Starting point —
// expect to iterate as more time-series data lands.

interface IntegrationLike {
  account_name?: string | null;
  metadata: Record<string, unknown>;
}

interface Props {
  website:    IntegrationLike | null; // GA4
  instagram:  IntegrationLike | null;
  newsletter: IntegrationLike | null;
}

const CARD_STYLE: React.CSSProperties = {
  background: "var(--color-off-white)", border: "0.5px solid var(--color-border)",
  borderRadius: 12, boxShadow: "0 2px 8px rgba(var(--color-charcoal-rgb),0.04)", padding: "14px 16px",
};
const TITLE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600,
  color: "var(--color-charcoal)", letterSpacing: "-0.005em",
};
const CAPTION_STYLE: React.CSSProperties = { fontSize: 10.5, color: "var(--color-grey)", marginTop: 2 };

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}
function fmt(n: number): string { return n.toLocaleString("en-US"); }

export default function PresenceCharts({ website, instagram, newsletter }: Props) {
  const sessions    = website ? num(website.metadata.sessions) ?? num(website.metadata.visitors_30d) : null;
  const followers   = instagram ? num(instagram.metadata.followers_count) : null;
  const subscribers = newsletter ? (num(newsletter.metadata.subscriber_count) ?? num(newsletter.metadata.total_subscribers) ?? num(newsletter.metadata.subscribers)) : null;

  const history = (instagram?.metadata.followers_history as { d: string; f: number }[] | undefined) ?? [];
  const channels = (website?.metadata.channels as { channel: string; sessions: number; pct: number }[] | undefined) ?? [];

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1.2fr" }}>
      <AudienceReachCard sessions={sessions} followers={followers} subscribers={subscribers} />
      <FollowerGrowthCard history={history} />
      <ChannelsCard channels={channels} />
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-[11px]" style={{ color: "var(--color-grey)", marginTop: 16 }}>{text}</p>;
}

// ── Audience reach (cross-channel) ────────────────────────────────────────────
function AudienceReachCard({ sessions, followers, subscribers }: { sessions: number | null; followers: number | null; subscribers: number | null }) {
  const rows = [
    { label: "Site visitors", note: "30 days", value: sessions,    color: "var(--color-sage)" },
    { label: "IG followers",  note: "total",   value: followers,   color: "#7f6f9c" },
    { label: "Subscribers",   note: "active",  value: subscribers, color: "#a37f12" },
  ].filter((r) => r.value != null) as { label: string; note: string; value: number; color: string }[];
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>Audience reach</p>
      <p style={CAPTION_STYLE}>Across your connected channels</p>
      {rows.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--color-charcoal)", flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--color-charcoal)" }}>{fmt(r.value)}</span>
                <span style={{ fontSize: 10, color: "var(--color-grey)" }}>{r.note}</span>
              </div>
              <div style={{ height: 7, background: "var(--color-cream)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyNote text="Connect a channel to see your reach." />}
    </div>
  );
}

// ── Follower growth ───────────────────────────────────────────────────────────
function FollowerGrowthCard({ history }: { history: { d: string; f: number }[] }) {
  const pts = history.slice(-30);
  const has = pts.length >= 2;
  const W = 240, H = 96;
  let path = "", area = "";
  if (has) {
    const vals = pts.map((p) => p.f);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);
    const ys = pts.map((p) => H - ((p.f - min) / span) * (H - 8) - 4);
    path = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
    area = `${path} L ${W} ${H} L 0 ${H} Z`;
  }
  const delta = has ? pts[pts.length - 1].f - pts[0].f : 0;

  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>Follower growth</p>
      <p style={CAPTION_STYLE}>{has ? `${delta >= 0 ? "+" : "−"}${fmt(Math.abs(delta))} over ${pts.length} days` : "Instagram"}</p>
      {has ? (
        <svg viewBox={`0 0 ${W} ${H + 2}`} preserveAspectRatio="none" style={{ width: "100%", height: 100, marginTop: 12, display: "block" }}>
          <path d={area} fill="rgba(var(--color-sage-rgb),0.16)" />
          <path d={path} stroke="var(--color-sage)" strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : <EmptyNote text="We'll chart your follower growth as daily data builds." />}
    </div>
  );
}

// ── Traffic channels ──────────────────────────────────────────────────────────
function ChannelsCard({ channels }: { channels: { channel: string; sessions: number; pct: number }[] }) {
  const data = channels.filter((c) => c.sessions > 0).slice(0, 6);
  const total = data.reduce((s, c) => s + c.sessions, 0);
  const COLORS = ["var(--color-sage)", "#7f6f9c", "#a37f12", "#2a8a8a", "#c93a6a", "var(--color-grey)"];
  const R = 48, INNER = 30, CX = 56, CY = 56;
  let acc = 0;
  const arcs = data.map((c, i) => {
    const frac = c.sessions / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    const a1 = (acc + frac) * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    return { c, color: COLORS[i % COLORS.length], d: donutArc(CX, CY, R, INNER, a0, a1) };
  });

  return (
    <div style={CARD_STYLE}>
      <p style={TITLE_STYLE}>Traffic channels</p>
      <p style={CAPTION_STYLE}>Where your visitors come from · 30 days</p>
      {total > 0 ? (
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12 }}>
          <svg viewBox="0 0 112 112" style={{ width: 104, height: 104, flexShrink: 0 }}>
            {arcs.map(({ c, color, d }) => <path key={c.channel} d={d} fill={color} />)}
          </svg>
          <ul style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {arcs.map(({ c, color }) => (
              <li key={c.channel} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--color-charcoal)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.channel}</span>
                <span style={{ color: "var(--color-grey)", fontVariantNumeric: "tabular-nums" }}>{c.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <EmptyNote text="Connect Google Analytics to see traffic channels." />}
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
