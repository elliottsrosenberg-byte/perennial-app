"use client";

// Lightweight CSS animations for the Resources intro modal slides. Same scale
// and visual language as Projects/Outreach so the walkthroughs feel like one
// family. Each loop demonstrates a distinct affordance of the Resources
// module: categories sliding in, a card filling, a file landing in storage,
// and the Ash draft handoff.

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ── Mini resource card (matches the real card composition) ───────────────────
function MiniResourceCard({
  title, meta, swatchTone = "var(--color-sage)", style = {}, dashed = false,
}: {
  title: string;
  meta?: string;
  swatchTone?: string;
  style?: React.CSSProperties;
  dashed?: boolean;
}) {
  return (
    <div style={{
      background: dashed ? "transparent" : "var(--color-warm-white)",
      border: dashed ? "0.5px dashed var(--color-border)" : "0.5px solid var(--color-border)",
      borderRadius: 7,
      padding: "5px 7px",
      boxShadow: dashed ? "none" : "0 1px 2px rgba(0,0,0,0.05)",
      display: "flex", flexDirection: "column", gap: 2,
      ...style,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 4, height: 4, borderRadius: 99, background: swatchTone }} />
        <span style={{ fontSize: 8, fontWeight: 700, color: "var(--color-charcoal)" }}>{title}</span>
      </div>
      {meta && <p style={{ fontSize: 7, color: "var(--color-grey)" }}>{meta}</p>}
    </div>
  );
}

// ─── Slide 1: Category rail materializes alongside a few resource cards ─────
export function CategoryMaterialize() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes rs-row-in {
          0%      { opacity: 0; transform: translateX(-6px); }
          100%    { opacity: 1; transform: translateX(0); }
        }
        @keyframes rs-card-in {
          0%, 30%   { opacity: 0; transform: translateY(8px) scale(0.94); }
          50%, 100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .rs-row-0 { animation: rs-row-in 0.45s ease-out 0.0s both; }
        .rs-row-1 { animation: rs-row-in 0.45s ease-out 0.10s both; }
        .rs-row-2 { animation: rs-row-in 0.45s ease-out 0.20s both; }
        .rs-row-3 { animation: rs-row-in 0.45s ease-out 0.30s both; }
        .rs-mat-card-0 { animation: rs-card-in 1.2s ease-out 0.6s both; }
        .rs-mat-card-1 { animation: rs-card-in 1.2s ease-out 0.9s both; }
        .rs-mat-card-2 { animation: rs-card-in 1.2s ease-out 1.2s both; }
      `}</style>

      <div style={{ display: "flex", gap: 10, width: 290 }}>
        {/* Category rail */}
        <div style={{
          flex: "0 0 110px",
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 7,
          padding: 6,
          display: "flex", flexDirection: "column", gap: 5,
        }}>
          <div className="rs-row-0" style={railRow(true)}>
            <span style={catChip("#b8860b")}>O</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: "var(--color-charcoal)" }}>Operations</span>
          </div>
          <div className="rs-row-1" style={railRow(false)}>
            <span style={catChip("#6d4fa3")}>B</span>
            <span style={{ fontSize: 8, color: "var(--color-grey)" }}>Brand</span>
          </div>
          <div className="rs-row-2" style={railRow(false)}>
            <span style={catChip("#3d6b4f")}>P</span>
            <span style={{ fontSize: 8, color: "var(--color-grey)" }}>Press</span>
          </div>
          <div className="rs-row-3" style={railRow(false)}>
            <span style={catChip("#3d6b4f")}>D</span>
            <span style={{ fontSize: 8, color: "var(--color-grey)" }}>Design</span>
          </div>
        </div>

        {/* Card column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <div className="rs-mat-card-0"><MiniResourceCard title="Business Information" meta="Structured · 6 fields" swatchTone="#b8860b" /></div>
          <div className="rs-mat-card-1"><MiniResourceCard title="W-9 / Tax Forms" meta="File · PDF" swatchTone="#b8860b" /></div>
          <div className="rs-mat-card-2"><MiniResourceCard title="Lease Agreements" meta="File · 3 docs" swatchTone="#b8860b" /></div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: An empty card fills with prompts (Ash draft) ──────────────────
export function CardFills() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes rs-line-fill {
          0%, 20%   { width: 0%; opacity: 0.4; }
          60%, 100% { width: var(--rs-line-w, 100%); opacity: 1; }
        }
        @keyframes rs-status-shift {
          0%, 30%   { background: rgba(31,33,26,0.10); color: var(--color-grey); }
          60%, 100% { background: rgba(184,134,11,0.16); color: #b8860b; }
        }
        .rs-line-0 { animation: rs-line-fill 1.8s ease-out 0.4s both; --rs-line-w: 100%; }
        .rs-line-1 { animation: rs-line-fill 1.8s ease-out 0.7s both; --rs-line-w: 90%; }
        .rs-line-2 { animation: rs-line-fill 1.8s ease-out 1.0s both; --rs-line-w: 70%; }
        .rs-line-3 { animation: rs-line-fill 1.8s ease-out 1.3s both; --rs-line-w: 60%; }
        .rs-status { animation: rs-status-shift 1.6s ease-out 0.6s both; }
      `}</style>

      <div style={{ width: 240, background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", borderRadius: 9, padding: 10, display: "flex", flexDirection: "column", gap: 7, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-charcoal)" }}>Mission &amp; Vision</span>
          <span className="rs-status" style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 6px", borderRadius: 99 }}>Partial</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ height: 6, background: "var(--color-cream)", borderRadius: 2, overflow: "hidden" }}>
              <div className={`rs-line-${i}`} style={{ height: "100%", background: "rgba(125,148,86,0.5)", borderRadius: 2 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: A file drops into a card and gets a "Stored" badge ────────────
export function FileLands() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes rs-file-drop {
          0%      { opacity: 0; transform: translateY(-30px) scale(0.92); }
          70%     { opacity: 1; transform: translateY(0) scale(1); }
          85%     { transform: translateY(-2px); }
          100%    { transform: translateY(0); }
        }
        @keyframes rs-badge-in {
          0%, 60%   { opacity: 0; transform: scale(0.85); }
          100%      { opacity: 1; transform: scale(1); }
        }
        .rs-file-drop { animation: rs-file-drop 1.2s ease-out 0.3s both; }
        .rs-badge-in  { animation: rs-badge-in 0.5s ease-out 1.3s both; }
      `}</style>

      <div style={{
        width: 200, height: 130,
        background: "var(--color-warm-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 9,
        boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
        overflow: "hidden", position: "relative",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          flex: 1,
          background: "rgba(155,163,122,0.14)",
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}>
          <div className="rs-file-drop" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3d6b4f" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span style={{ fontSize: 8, fontWeight: 600, color: "#3d6b4f" }}>logo-mark.svg</span>
          </div>
          <div className="rs-badge-in" style={{
            position: "absolute", top: 6, right: 6,
            fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
            padding: "2px 6px", borderRadius: 99,
            background: "rgba(61,107,79,0.18)", color: "#3d6b4f",
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#3d6b4f" }} />
            Stored
          </div>
        </div>
        <div style={{ padding: "5px 8px" }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: "var(--color-charcoal)" }}>Logo Files</span>
          <p style={{ fontSize: 7, color: "var(--color-grey)" }}>3 files · uploaded just now</p>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: External link saved (Drive / Dropbox / portfolio) ─────────────
export function LinkSaved() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes rs-link-slide-in {
          0%      { opacity: 0; transform: translateX(20px); }
          70%     { opacity: 1; transform: translateX(0); }
          100%    { transform: translateX(0); }
        }
        .rs-link-0 { animation: rs-link-slide-in 0.6s ease-out 0.25s both; }
        .rs-link-1 { animation: rs-link-slide-in 0.6s ease-out 0.55s both; }
        .rs-link-2 { animation: rs-link-slide-in 0.6s ease-out 0.85s both; }
      `}</style>

      <div style={{ width: 240, display: "flex", flexDirection: "column", gap: 5 }}>
        {[
          { name: "Portfolio (Dropbox)", host: "dropbox.com/sh/…" },
          { name: "Studio Drive",        host: "drive.google.com/…" },
          { name: "perennial.design",    host: "perennial.design" },
        ].map((l, i) => (
          <div key={i} className={`rs-link-${i}`} style={{
            background: "var(--color-warm-white)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 7,
            padding: "6px 8px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: 5,
              background: "rgba(155,163,122,0.18)", color: "#3d6b4f",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" />
                <path d="M10 2h4v4M14 2L8 8" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "var(--color-charcoal)" }}>{l.name}</div>
              <div style={{ fontSize: 7, color: "var(--color-grey)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.host}</div>
            </div>
            <span style={{ fontSize: 7, color: "#3d6b4f", flexShrink: 0 }}>Open ↗</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function railRow(active: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5,
    padding: "3px 5px",
    borderRadius: 4,
    background: active ? "var(--color-cream)" : "transparent",
    borderLeft: `1.5px solid ${active ? "var(--color-sage)" : "transparent"}`,
  };
}

function catChip(color: string): React.CSSProperties {
  return {
    width: 12, height: 12, borderRadius: 3,
    background: `${color}22`,
    color, fontSize: 6, fontWeight: 800,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}
