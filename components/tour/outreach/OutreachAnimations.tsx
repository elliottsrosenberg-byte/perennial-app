"use client";

// Lightweight CSS animations for the Outreach intro modal slides. Same scale
// and visual language as Projects/Contacts so the three walkthroughs feel
// like one family. Each loop demonstrates a distinct affordance of the
// Outreach module: a pipeline materializing, a target moving stages, the
// follow-up bar logging a touch, and the left-rail switcher between Leads,
// Follow-ups, and Pipelines.

import { Mail } from "lucide-react";

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ── Mini target card (matches the real PipelineBoard composition) ────────────
function MiniTargetCard({
  title, sub, lastTouch = "2d ago",
  dragging = false, dim = false,
  style = {},
}: {
  title:    string;
  sub?:     string;
  lastTouch?: string;
  dragging?: boolean;
  dim?:     boolean;
  style?:   React.CSSProperties;
}) {
  return (
    <div style={{
      position: "relative",
      background: "var(--color-warm-white)",
      border: "0.5px solid var(--color-border)",
      borderRadius: 7,
      padding: "5px 7px",
      boxShadow: dragging ? "0 6px 16px rgba(31,33,26,0.18)" : "0 1px 2px rgba(0,0,0,0.05)",
      opacity: dim ? 0.5 : 1,
      ...style,
    }}>
      <span style={{ fontSize: 8, fontWeight: 700, color: "var(--color-charcoal)", lineHeight: 1.25, display: "block", marginBottom: 2 }}>{title}</span>
      {sub && <p style={{ fontSize: 7, color: "var(--color-grey)" }}>{sub}</p>}
      <p style={{ fontSize: 6.5, color: "var(--color-grey)", marginTop: 3 }}>{lastTouch}</p>
    </div>
  );
}

// ─── Slide 1: pipeline columns materialize, then a card slides into view ────
export function PipelineMaterialize() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ot-col-in {
          0%      { opacity: 0; transform: translateY(8px); }
          100%    { opacity: 1; transform: translateY(0); }
        }
        @keyframes ot-card-in {
          0%, 30%   { opacity: 0; transform: translateY(8px) scale(0.94); }
          50%, 100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ot-counter { 0% { transform: translateY(0); } 40%,100% { transform: translateY(-100%); } }

        .ot-col-0 { animation: ot-col-in 0.6s ease-out 0.0s both; }
        .ot-col-1 { animation: ot-col-in 0.6s ease-out 0.18s both; }
        .ot-col-2 { animation: ot-col-in 0.6s ease-out 0.36s both; }

        .ot-mat-card-0 { animation: ot-card-in 1.5s ease-out 0.6s both; }
        .ot-mat-card-1 { animation: ot-card-in 1.5s ease-out 1.0s both; }
        .ot-mat-card-2 { animation: ot-card-in 1.5s ease-out 1.4s both; }

        .ot-counter-loop { animation: ot-counter 5s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 290 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {/* Identify column */}
          <div className="ot-col-0" style={pipeColStyle}>
            <div style={pipeColHeader}>
              <span style={{ width: 4, height: 4, borderRadius: 99, background: "#7d9456" }} />
              <span>Identify</span>
            </div>
            <div className="ot-mat-card-0">
              <MiniTargetCard
                title="Cooper Hewitt"
                sub="Press · NYC"
                lastTouch="3d ago"
              />
            </div>
          </div>

          {/* Submit column */}
          <div className="ot-col-1" style={pipeColStyle}>
            <div style={pipeColHeader}>
              <span style={{ width: 4, height: 4, borderRadius: 99, background: "#7d9456" }} />
              <span>Submit</span>
            </div>
            <div className="ot-mat-card-1">
              <MiniTargetCard
                title="The Future Perfect"
                sub="Gallery · NYC"
                lastTouch="1w ago"
              />
            </div>
          </div>

          {/* Discuss column */}
          <div className="ot-col-2" style={pipeColStyle}>
            <div style={pipeColHeader}>
              <span style={{ width: 4, height: 4, borderRadius: 99, background: "#7d9456" }} />
              <span>Discuss</span>
            </div>
            <div className="ot-mat-card-2">
              <MiniTargetCard
                title="Salone Satellite"
                sub="Fair · Milan"
                lastTouch="Yesterday"
              />
            </div>
          </div>
        </div>

        {/* Target counter strip */}
        <div style={{
          background: "var(--color-cream)", borderRadius: 8, padding: "6px 10px",
          display: "flex", alignItems: "center", gap: 8,
          border: "0.5px solid var(--color-border)",
        }}>
          <span style={{ fontSize: 9, color: "var(--color-grey)" }}>Active targets</span>
          <div style={{ marginLeft: "auto", overflow: "hidden", height: 14 }}>
            <div className="ot-counter-loop" style={{ display: "flex", flexDirection: "column", lineHeight: "14px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-charcoal)" }}>0</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#7d9456" }}>3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: drag a target from Submit → Discuss column ─────────────────────
export function DragStage() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ot-dragmove {
          0%, 10%   { transform: translate(0,0) rotate(0deg) scale(1); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
          18%       { transform: translate(0,-2px) rotate(-1deg) scale(1.03); box-shadow: 0 6px 14px rgba(0,0,0,0.18); }
          50%, 65%  { transform: translate(94px, 0) rotate(-1deg) scale(1.03); box-shadow: 0 8px 18px rgba(0,0,0,0.2); }
          78%, 100% { transform: translate(94px, 0) rotate(0deg) scale(1); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
        }
        @keyframes ot-dropzone {
          0%, 45%   { background: transparent; border-color: transparent; }
          50%, 65%  { background: rgba(125,148,86,0.10); border-color: #7d9456; }
          78%, 100% { background: transparent; border-color: transparent; }
        }
        .ot-drag-card  { animation: ot-dragmove 5s ease-in-out infinite; position: relative; z-index: 2; }
        .ot-drag-zone  { animation: ot-dropzone 5s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", gap: 8, width: 290 }}>
        {/* Submit column */}
        <div style={pipeColStyle}>
          <div style={pipeColHeader}>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#7d9456" }} />
            <span>Submit</span>
          </div>
          <div className="ot-drag-card">
            <MiniTargetCard
              title="The Future Perfect"
              sub="Gallery · NYC"
              lastTouch="1w ago"
            />
          </div>
          <MiniTargetCard
            title="Carpenters"
            sub="Gallery · London"
            lastTouch="3w ago"
            dim
            style={{ marginTop: 4 }}
          />
        </div>

        {/* Discuss column */}
        <div style={pipeColStyle}>
          <div style={pipeColHeader}>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#7d9456" }} />
            <span>Discuss</span>
          </div>
          <MiniTargetCard
            title="Salone Satellite"
            sub="Fair · Milan"
            lastTouch="Yesterday"
          />
          <div className="ot-drag-zone" style={{
            marginTop: 4, height: 38,
            borderRadius: 7,
            border: "1px dashed transparent",
            transition: "background 0.2s ease, border-color 0.2s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: target ages → swipe-right gesture → fresh + logged ───────────
// Mirrors the real PipelineBoard interaction: the card has a copper-coloured
// swipe handle on the right edge. Grab it and pull the card to the right —
// a copper reveal band appears behind, and at threshold the follow-up
// commits. We loop the gesture so the slide reads as one continuous motion.
export function FollowUpBar() {
  return (
    <div style={animationFrame}>
      <style>{`
        /* Card translateX loop: aging → grab → pull → release → settle.
           Copper colour throughout — distinct from sage, amber, red-orange. */
        @keyframes ot-card-pull {
          0%, 28%    { transform: translateX(0); box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
          38%        { transform: translateX(14px); box-shadow: 0 4px 12px rgba(201,122,74,0.18); }
          58%, 64%   { transform: translateX(78px); box-shadow: 0 8px 22px rgba(201,122,74,0.30); }
          76%        { transform: translateX(96px); box-shadow: 0 8px 22px rgba(201,122,74,0.30); }
          86%        { transform: translateX(20px); box-shadow: 0 2px 8px rgba(201,122,74,0.15); }
          100%       { transform: translateX(0); box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
        }
        @keyframes ot-reveal-opacity {
          0%, 30%    { opacity: 0; }
          40%, 86%   { opacity: 1; }
          100%       { opacity: 0; }
        }
        @keyframes ot-reveal-label {
          0%, 56%    { opacity: 0; }
          62%, 80%   { opacity: 1; }
          84%, 100%  { opacity: 0; }
        }

        /* Ageing labels — cycle: Today → 5d → 3w → 5w → Today */
        @keyframes ot-age-fresh   { 0%, 8% { opacity: 1; color: var(--color-grey); } 12%, 100% { opacity: 0; } }
        @keyframes ot-age-mid     { 0%, 8% { opacity: 0; } 12%, 18% { opacity: 1; color: var(--color-grey); } 22%, 100% { opacity: 0; } }
        @keyframes ot-age-amber   { 0%, 18% { opacity: 0; } 22%, 26% { opacity: 1; color: #b8860b; } 30%, 100% { opacity: 0; } }
        @keyframes ot-age-stale   { 0%, 26% { opacity: 0; } 30%, 80% { opacity: 1; color: var(--color-red-orange); } 84%, 100% { opacity: 0; } }
        @keyframes ot-age-reset   { 0%, 84% { opacity: 0; } 88%, 100% { opacity: 1; color: #c97a4a; font-weight: 700; } }

        /* Pointer (the user's fingertip on the handle) */
        @keyframes ot-pointer {
          0%, 24%    { opacity: 0; transform: translate(0,0); }
          30%        { opacity: 1; transform: translate(0,0); }
          58%, 64%   { opacity: 1; transform: translate(78px, 0); }
          76%        { opacity: 1; transform: translate(96px, 0); }
          80%        { opacity: 0; transform: translate(96px, 0); }
          100%       { opacity: 0; transform: translate(0,0); }
        }

        /* Handle width — slightly bigger when actively grabbed */
        @keyframes ot-handle {
          0%, 24%   { width: 6px; background: rgba(201,122,74,0.18); }
          28%, 30%  { width: 12px; background: #c97a4a; }
          86%, 100% { width: 6px; background: rgba(201,122,74,0.28); }
        }

        .ot-card-pull     { animation: ot-card-pull 6.5s cubic-bezier(0.34, 1.4, 0.5, 1) infinite; }
        .ot-reveal        { animation: ot-reveal-opacity 6.5s ease-in-out infinite; }
        .ot-reveal-label  { animation: ot-reveal-label 6.5s ease-in-out infinite; }
        .ot-age-fresh     { animation: ot-age-fresh 6.5s ease-in-out infinite; position: absolute; inset: 0; }
        .ot-age-mid       { animation: ot-age-mid 6.5s ease-in-out infinite; position: absolute; inset: 0; }
        .ot-age-amber     { animation: ot-age-amber 6.5s ease-in-out infinite; position: absolute; inset: 0; }
        .ot-age-stale     { animation: ot-age-stale 6.5s ease-in-out infinite; position: absolute; inset: 0; }
        .ot-age-reset     { animation: ot-age-reset 6.5s ease-in-out infinite; position: absolute; inset: 0; }
        .ot-pointer-anim  { animation: ot-pointer 6.5s ease-in-out infinite; }
        .ot-handle-anim   { animation: ot-handle 6.5s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 260, position: "relative" }}>
        {/* Reveal layer (sits behind the card) */}
        <div className="ot-reveal" style={{
          position: "absolute", inset: 0,
          borderRadius: 8,
          background: "linear-gradient(90deg, rgba(201,122,74,0.18) 0%, rgba(201,122,74,0.30) 70%, #c97a4a 100%)",
          display: "flex", alignItems: "center", paddingLeft: 14,
        }}>
          <span className="ot-reveal-label" style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 9, fontWeight: 700, color: "white", letterSpacing: "0.02em",
          }}>
            <svg width="9" height="7" viewBox="0 0 8 6" fill="none">
              <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Release to log
          </span>
        </div>

        {/* Card */}
        <div className="ot-card-pull" style={{
          position: "relative",
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 8,
          padding: "10px 12px",
          paddingRight: 18,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-charcoal)" }}>The Future Perfect</span>
            <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 99, background: "rgba(125,148,86,0.18)", color: "#5a7040", fontWeight: 600, flexShrink: 0 }}>
              Galleries
            </span>
          </div>
          <p style={{ fontSize: 9, color: "var(--color-grey)", marginBottom: 1 }}>Casey Lurie · NYC</p>
          <div style={{ position: "relative", height: 12, marginTop: 5 }}>
            <span className="ot-age-fresh" style={{ fontSize: 9 }}>Today</span>
            <span className="ot-age-mid"   style={{ fontSize: 9 }}>5d ago</span>
            <span className="ot-age-amber" style={{ fontSize: 9 }}>3w ago</span>
            <span className="ot-age-stale" style={{ fontSize: 9 }}>5w ago</span>
            <span className="ot-age-reset" style={{ fontSize: 9 }}>Today</span>
          </div>

          {/* Swipe handle */}
          <div className="ot-handle-anim" style={{
            position: "absolute",
            right: 0, top: 0, bottom: 0,
            borderRadius: "0 8px 8px 0",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 1,
          }}>
            <span aria-hidden style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <span style={{ width: 1.5, height: 1.5, borderRadius: 1, background: "white" }} />
              <span style={{ width: 1.5, height: 1.5, borderRadius: 1, background: "white" }} />
              <span style={{ width: 1.5, height: 1.5, borderRadius: 1, background: "white" }} />
            </span>
          </div>
        </div>

        {/* Pointer ring — follows the handle as it pulls right */}
        <div className="ot-pointer-anim" aria-hidden style={{
          position: "absolute", right: -8, top: "50%",
          marginTop: -7,
          width: 14, height: 14, borderRadius: 99,
          background: "rgba(31,33,26,0.78)",
          border: "1.5px solid white",
          boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
          pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

// ─── Slide 4: left rail cycles between Leads / Follow-ups / Pipelines ──────
export function RailSwitch() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ot-rail-cycle {
          0%, 25%   { background: var(--color-cream); color: var(--color-charcoal); font-weight: 500; }
          30%, 100% { background: transparent; color: var(--color-charcoal); font-weight: 400; }
        }
        @keyframes ot-pane-cycle {
          0%, 25%   { opacity: 1; transform: translateY(0); }
          28%, 100% { opacity: 0; transform: translateY(4px); }
        }
        .ot-rail-0 { animation: ot-rail-cycle 6s steps(1, end) infinite; animation-delay: 0s; }
        .ot-rail-1 { animation: ot-rail-cycle 6s steps(1, end) infinite; animation-delay: -4s; }
        .ot-rail-2 { animation: ot-rail-cycle 6s steps(1, end) infinite; animation-delay: -2s; }
        .ot-pane-0 { animation: ot-pane-cycle 6s ease-in-out infinite; animation-delay: 0s; }
        .ot-pane-1 { animation: ot-pane-cycle 6s ease-in-out infinite; animation-delay: -4s; }
        .ot-pane-2 { animation: ot-pane-cycle 6s ease-in-out infinite; animation-delay: -2s; }
      `}</style>

      <div style={{
        width: 320, height: 168,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
        display: "flex", overflow: "hidden",
      }}>
        {/* ── Left rail ── */}
        <div style={{
          width: 102, flexShrink: 0,
          borderRight: "0.5px solid var(--color-border)",
          background: "var(--color-warm-white)",
          padding: "9px 8px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)", marginBottom: 1 }}>Leads</div>
          <div className="ot-rail-0" style={railItem}>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#b8860b" }} />
            <span style={{ flex: 1 }}>Leads</span>
            <span style={{ fontSize: 7, color: "var(--color-grey)" }}>8</span>
          </div>
          <div className="ot-rail-1" style={railItem}>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "var(--color-red-orange)" }} />
            <span style={{ flex: 1 }}>Follow-ups</span>
            <span style={{ fontSize: 7, color: "var(--color-grey)" }}>3</span>
          </div>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)", marginTop: 4, marginBottom: 1 }}>Pipelines</div>
          <div className="ot-rail-2" style={railItem}>
            <span style={{ width: 4, height: 4, borderRadius: 99, background: "#7d9456" }} />
            <span style={{ flex: 1 }}>Galleries</span>
            <span style={{ fontSize: 7, color: "var(--color-grey)" }}>12</span>
          </div>
        </div>

        {/* ── Content pane ── */}
        <div style={{ flex: 1, position: "relative", padding: "10px 12px" }}>
          {/* Leads pane */}
          <div className="ot-pane-0" style={paneStyle}>
            {["AS", "JK", "RH"].map((initials, i) => (
              <div key={initials} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 99,
                  background: "rgba(184,134,11,0.14)", color: "#b8860b",
                  fontSize: 6, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>{initials}</span>
                <span style={{ ...paneLine, flex: 1, width: i === 0 ? "75%" : i === 1 ? "55%" : "65%" }} />
                <span style={{ fontSize: 6, color: "#b8860b", fontWeight: 600 }}>Lead</span>
              </div>
            ))}
          </div>

          {/* Follow-ups pane */}
          <div className="ot-pane-1" style={paneStyle}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 6px",
                background: "var(--color-warm-white)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 5,
              }}>
                <Mail size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
                <span style={{ ...paneLine, flex: 1, width: i === 0 ? "60%" : "70%" }} />
                <span style={{ fontSize: 6, color: i === 0 ? "var(--color-red-orange)" : "#b8860b", fontWeight: 600 }}>
                  {i === 0 ? "6w" : "4w"}
                </span>
              </div>
            ))}
          </div>

          {/* Pipeline pane */}
          <div className="ot-pane-2" style={paneStyle}>
            <div style={{ display: "flex", gap: 4, flex: 1 }}>
              {["Identify", "Submit", "Discuss"].map((stage, i) => (
                <div key={stage} style={{
                  flex: 1,
                  background: "var(--color-warm-white)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 5,
                  padding: "3px 4px",
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                  <div style={{ fontSize: 6, fontWeight: 700, textTransform: "uppercase", color: "var(--color-grey)" }}>{stage}</div>
                  <div style={{
                    height: 18,
                    background: "var(--color-off-white)",
                    borderRadius: 3,
                    padding: 2,
                    display: "flex", flexDirection: "column", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 5.5, fontWeight: 700, color: "var(--color-charcoal)" }}>
                      {i === 0 ? "Cooper Hewitt" : i === 1 ? "Future Perfect" : "Carpenters"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const pipeColStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  borderRadius: 7,
  padding: "5px 5px 7px",
  display: "flex", flexDirection: "column", gap: 4,
};

const pipeColHeader: React.CSSProperties = {
  fontSize: 7, fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-grey)",
  paddingBottom: 4,
  borderBottom: "0.5px solid var(--color-border)",
  display: "flex", alignItems: "center", gap: 4,
};

const railItem: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
  padding: "3px 6px",
  borderRadius: 4,
  fontSize: 8,
  background: "transparent",
  color: "var(--color-charcoal)",
  transition: "background 0.15s ease, color 0.15s ease",
};

const paneStyle: React.CSSProperties = {
  position: "absolute", inset: "6px 8px",
  display: "flex", flexDirection: "column", gap: 5,
  transition: "opacity 0.2s ease, transform 0.2s ease",
};

const paneLine: React.CSSProperties = {
  height: 4, borderRadius: 2,
  background: "var(--color-border-strong)",
  display: "block",
};

