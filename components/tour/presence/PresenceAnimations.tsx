"use client";

// Lightweight CSS/SVG animations for the Presence intro modal slides. Same
// scale and visual language as Projects/Calendar/Outreach so the family of
// walkthroughs feels coherent. Each loop demonstrates one Presence idea:
// the opportunities feed materializing, filters narrowing the list, saving
// a card with a status pill, and the integrations strip lighting up.

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// Match Presence's catColor() palette so the demo feels like the real feed.
const CAT = {
  fair:      { dark: "#2563ab", light: "rgba(37,99,171,0.13)" },
  openCall:  { dark: "#148c8c", light: "rgba(20,140,140,0.13)" },
  grant:     { dark: "#6d4fa3", light: "rgba(109,79,163,0.13)" },
  award:     { dark: "#b8860b", light: "rgba(184,134,11,0.14)" },
  residency: { dark: "#3d6b4f", light: "rgba(61,107,79,0.13)" },
} as const;

// ── Mini opportunity row (mirrors Presence OppRow composition) ───────────────
function MiniOppRow({
  month, day, title, sub, cat, status, dim, pulse, style = {},
}: {
  month: string; day: string;
  title: string; sub: string;
  cat: keyof typeof CAT;
  status?: string;
  dim?: boolean;
  pulse?: boolean;
  style?: React.CSSProperties;
}) {
  const c = CAT[cat];
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 7,
      padding: "5px 6px",
      borderRadius: 5,
      background: pulse ? "var(--color-cream)" : "transparent",
      opacity: dim ? 0.35 : 1,
      transition: "opacity 0.3s ease, background 0.3s ease",
      ...style,
    }}>
      <div style={{
        width: 26, height: 28, borderRadius: 5,
        background: "var(--color-cream)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 5.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)" }}>{month}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-charcoal)", lineHeight: 1 }}>{day}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
          <span style={{ fontSize: 8, fontWeight: 600, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          <span style={{ fontSize: 6, fontWeight: 600, padding: "1px 5px", borderRadius: 6, background: c.light, color: c.dark, textTransform: "uppercase", letterSpacing: "0.03em", flexShrink: 0 }}>
            {cat === "openCall" ? "Open call" : cat}
          </span>
        </div>
        <p style={{ fontSize: 7, color: "var(--color-grey)" }}>{sub}</p>
        {status && (
          <span style={{
            display: "inline-block",
            fontSize: 6, fontWeight: 600, padding: "1px 5px",
            borderRadius: 6, background: c.dark, color: "white",
            textTransform: "uppercase", letterSpacing: "0.04em",
            marginTop: 2,
          }}>{status}</span>
        )}
      </div>
    </div>
  );
}

// ─── Slide 1: opportunities feed materializes row-by-row ────────────────────
export function FeedMaterialize() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pr-row-in {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pr-section-bar {
          0%, 25% { transform: scaleY(0); }
          40%,100% { transform: scaleY(1); }
        }

        .pr-row-0 { animation: pr-row-in 0.5s ease-out 0.0s both; }
        .pr-row-1 { animation: pr-row-in 0.5s ease-out 0.18s both; }
        .pr-row-2 { animation: pr-row-in 0.5s ease-out 0.36s both; }
        .pr-row-3 { animation: pr-row-in 0.5s ease-out 0.54s both; }
        .pr-sect-bar { animation: pr-section-bar 0.7s ease-out 0.0s both; transform-origin: top center; }
      `}</style>

      <div style={{
        width: 280,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        padding: 9,
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        {/* Section header — "Act soon" */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 6 }}>
          <div className="pr-sect-bar" style={{ width: 2.5, height: 11, background: "#c0392b", borderRadius: 1 }} />
          <span style={{ fontSize: 8, fontWeight: 700, color: "#c0392b" }}>Act soon</span>
          <span style={{ fontSize: 6, fontWeight: 600, padding: "1px 5px", borderRadius: 6, background: "rgba(192,57,43,0.13)", color: "#c0392b" }}>2</span>
        </div>
        <div className="pr-row-0"><MiniOppRow month="Jun" day="14" title="Design Miami / Basel" sub="Basel, Switzerland · Fair" cat="fair" /></div>
        <div className="pr-row-1"><MiniOppRow month="Jul" day="03" title="Loewe Foundation Craft Prize" sub="Deadline · Award" cat="award" /></div>

        {/* Section header — "Upcoming" */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 6, marginTop: 4 }}>
          <div className="pr-sect-bar" style={{ width: 2.5, height: 11, background: "#3d6b4f", borderRadius: 1 }} />
          <span style={{ fontSize: 8, fontWeight: 700, color: "#3d6b4f" }}>Upcoming</span>
          <span style={{ fontSize: 6, fontWeight: 600, padding: "1px 5px", borderRadius: 6, background: "rgba(61,107,79,0.13)", color: "#3d6b4f" }}>2</span>
        </div>
        <div className="pr-row-2"><MiniOppRow month="Sep" day="22" title="Pollack Krasner Grant" sub="Foundation grant · Quarterly" cat="grant" /></div>
        <div className="pr-row-3"><MiniOppRow month="Oct" day="04" title="MacDowell Residency" sub="Peterborough, NH · 4–6 weeks" cat="residency" /></div>
      </div>
    </div>
  );
}

// ─── Slide 2: filter chip narrows the feed — others fade out ────────────────
export function FilterFocus() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pr-chip-pick {
          0%, 35% { background: transparent; color: var(--color-grey); border-color: rgba(31,33,26,0.13); }
          50%, 100% { background: var(--color-charcoal); color: var(--color-off-white); border-color: var(--color-charcoal); }
        }
        @keyframes pr-row-fade { 0%, 30% { opacity: 1; } 50%, 100% { opacity: 0.18; } }
        @keyframes pr-row-keep { 0%, 100% { opacity: 1; } }
      `}</style>

      <div style={{
        width: 280,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        padding: 9,
        display: "flex", flexDirection: "column", gap: 5,
      }}>
        {/* Filter chips strip */}
        <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
          <span style={{ fontSize: 6.5, padding: "2px 6px", borderRadius: 9, border: "0.5px solid rgba(31,33,26,0.13)", color: "var(--color-grey)" }}>All</span>
          <span style={{ fontSize: 6.5, padding: "2px 6px", borderRadius: 9, border: "0.5px solid rgba(31,33,26,0.13)", color: "var(--color-grey)" }}>Fairs</span>
          <span style={{
            fontSize: 6.5, padding: "2px 6px", borderRadius: 9,
            border: "0.5px solid",
            animation: "pr-chip-pick 2.4s ease-in-out infinite",
          }}>Open calls</span>
          <span style={{ fontSize: 6.5, padding: "2px 6px", borderRadius: 9, border: "0.5px solid rgba(31,33,26,0.13)", color: "var(--color-grey)" }}>Grants</span>
          <span style={{ fontSize: 6.5, padding: "2px 6px", borderRadius: 9, border: "0.5px solid rgba(31,33,26,0.13)", color: "var(--color-grey)" }}>Residencies</span>
        </div>
        {/* Rows — Open-call kept, others fade out */}
        <div style={{ animation: "pr-row-fade 2.4s ease-in-out infinite" }}>
          <MiniOppRow month="Jun" day="14" title="Design Miami / Basel" sub="Basel, Switzerland · Fair" cat="fair" />
        </div>
        <div style={{ animation: "pr-row-keep 2.4s ease-in-out infinite" }}>
          <MiniOppRow month="Aug" day="01" title="Sight Unseen OFFSITE submission" sub="Deadline · Open call" cat="openCall" />
        </div>
        <div style={{ animation: "pr-row-fade 2.4s ease-in-out infinite" }}>
          <MiniOppRow month="Sep" day="22" title="Pollack Krasner Grant" sub="Foundation grant · Quarterly" cat="grant" />
        </div>
        <div style={{ animation: "pr-row-keep 2.4s ease-in-out infinite" }}>
          <MiniOppRow month="Sep" day="12" title="Wallpaper* Design Awards" sub="Deadline · Open call" cat="openCall" />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: a status pill snaps onto a card ───────────────────────────────
export function StatusSnap() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pr-pill-pop {
          0%, 25%   { opacity: 0; transform: translateX(-6px) scale(0.85); }
          45%, 100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes pr-card-glow {
          0%, 25%   { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
          45%, 70%  { box-shadow: 0 2px 14px rgba(61,107,79,0.32); }
          100%      { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
        }
        .pr-pop { animation: pr-pill-pop 2.6s ease-out infinite; }
        .pr-glow { animation: pr-card-glow 2.6s ease-out infinite; }
      `}</style>

      <div className="pr-glow" style={{
        width: 250,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 8,
        padding: 10,
        display: "flex", flexDirection: "column", gap: 5,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
          <div style={{
            width: 30, height: 32, borderRadius: 6,
            background: "var(--color-cream)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)" }}>May</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-charcoal)", lineHeight: 1 }}>19</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-charcoal)", marginBottom: 1 }}>ICFF 2026</div>
            <p style={{ fontSize: 7, color: "var(--color-grey)" }}>May 19–23 · Javits Center, NYC</p>
            <span style={{ fontSize: 6, fontWeight: 600, padding: "1px 5px", borderRadius: 6, background: "rgba(37,99,171,0.13)", color: "#2563ab", textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 3, display: "inline-block" }}>Fair</span>
          </div>
        </div>

        {/* Status pill row — animated in */}
        <div style={{ display: "flex", gap: 4, marginTop: 6, paddingTop: 6, borderTop: "0.5px dashed var(--color-border)" }}>
          <span className="pr-pop" style={{
            fontSize: 7, fontWeight: 600, padding: "2px 7px", borderRadius: 9,
            background: "#3d6b4f", color: "white",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>Exhibiting</span>
          <span style={{ fontSize: 6.5, color: "var(--color-grey)", padding: "2px 6px", borderRadius: 9, border: "0.5px solid rgba(31,33,26,0.13)" }}>Saved</span>
          <span style={{ fontSize: 6.5, color: "var(--color-grey)", padding: "2px 6px", borderRadius: 9, border: "0.5px solid rgba(31,33,26,0.13)" }}>Attending</span>
          <span style={{ fontSize: 6.5, color: "var(--color-grey)", padding: "2px 6px", borderRadius: 9, border: "0.5px solid rgba(31,33,26,0.13)" }}>Applied</span>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: integration chips light up one by one ─────────────────────────
export function IntegrationsLight() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pr-int-light {
          0%, 20% { background: var(--color-cream); border-color: rgba(31,33,26,0.13); }
          35%, 80% { background: rgba(155,163,122,0.14); border-color: rgba(155,163,122,0.4); }
          100% { background: var(--color-cream); border-color: rgba(31,33,26,0.13); }
        }
        @keyframes pr-int-dot {
          0%, 20% { background: var(--color-grey); opacity: 0.4; }
          35%, 80% { background: var(--color-sage); opacity: 1; }
          100% { background: var(--color-grey); opacity: 0.4; }
        }
        .pr-int-0 { animation: pr-int-light 4s ease-in-out infinite; animation-delay: 0.0s; }
        .pr-int-d-0 { animation: pr-int-dot 4s ease-in-out infinite; animation-delay: 0.0s; }
        .pr-int-1 { animation: pr-int-light 4s ease-in-out infinite; animation-delay: 0.5s; }
        .pr-int-d-1 { animation: pr-int-dot 4s ease-in-out infinite; animation-delay: 0.5s; }
        .pr-int-2 { animation: pr-int-light 4s ease-in-out infinite; animation-delay: 1.0s; }
        .pr-int-d-2 { animation: pr-int-dot 4s ease-in-out infinite; animation-delay: 1.0s; }
      `}</style>

      <div style={{
        width: 280,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        padding: 12,
        display: "flex", flexDirection: "column", gap: 9, alignItems: "center",
      }}>
        <span style={{ fontSize: 7, color: "var(--color-grey)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Connected accounts</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { name: "perennial.design", sub: "GA4", color: "#2563ab", glyph: "🌐", cls: 0 },
            { name: "@perennial", sub: "Instagram", color: "#6d4fa3", glyph: "◎", cls: 1 },
            { name: "Studio notes", sub: "Substack", color: "#b8860b", glyph: "✉", cls: 2 },
          ].map((it) => (
            <div key={it.name} className={`pr-int-${it.cls}`} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 9px",
              border: "0.5px solid",
              borderRadius: 999,
            }}>
              <span className={`pr-int-d-${it.cls}`} style={{ width: 5, height: 5, borderRadius: "50%" }} />
              <span style={{ fontSize: 8, color: it.color, fontWeight: 700 }}>{it.glyph}</span>
              <span style={{ fontSize: 8, color: "var(--color-charcoal)", fontWeight: 600 }}>{it.name}</span>
              <span style={{ fontSize: 7, color: "var(--color-grey)" }}>{it.sub}</span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 7, color: "var(--color-grey)", fontStyle: "italic", marginTop: 2 }}>
          Your audience signals, in one place.
        </span>
      </div>
    </div>
  );
}
