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

// ─── Slide 3: hover the right of a card → inline insert → compressed logged
// Mirrors the real PipelineBoard interaction. The right edge handle expands
// on hover into a real click target; clicking opens the follow-up form inline
// under the card; after logging, the card compresses to 80% width and tucks
// right so a glance shows what's still owed.
export function FollowUpBar() {
  return (
    <div style={animationFrame}>
      <style>{`
        /* Handle width — thin at rest, expands when the pointer enters
           the right ~25% of the card. */
        @keyframes ot-handle-w {
          0%, 18%    { width: 6px;  background: rgba(201,122,74,0.20); }
          24%, 44%   { width: 44px; background: #c97a4a; }
          /* After click the inline insert opens; handle stays expanded */
          50%, 70%   { width: 44px; background: #c97a4a; }
          /* Once logged the card compresses; handle stays as a slim copper marker */
          76%, 100%  { width: 6px;  background: rgba(201,122,74,0.40); }
        }
        /* Inline insert reveal — opens after the user clicks the handle. */
        @keyframes ot-insert {
          0%, 44%    { max-height: 0; opacity: 0; margin-top: 0; }
          50%, 70%   { max-height: 110px; opacity: 1; margin-top: 6px; }
          74%, 100%  { max-height: 0; opacity: 0; margin-top: 0; }
        }
        /* Card compresses to 80% and right-justifies after logging. */
        @keyframes ot-card-compress {
          0%, 70%    { width: 100%; margin-left: 0; background: var(--color-warm-white); border-color: var(--color-border); }
          76%, 100%  { width: 80%; margin-left: auto; background: rgba(201,122,74,0.06); border-color: rgba(201,122,74,0.40); }
        }
        /* Handle label "Log follow-up" — visible while the handle is open. */
        @keyframes ot-handle-label {
          0%, 22%   { opacity: 0; }
          26%, 48%  { opacity: 1; }
          52%, 100% { opacity: 0; }
        }
        /* Logged check appears as the card compresses. */
        @keyframes ot-handle-check {
          0%, 72%   { opacity: 0; }
          76%, 100% { opacity: 1; }
        }
        /* "Followed up · today" line replaces the stale timestamp. */
        @keyframes ot-age-stale   { 0%, 70% { opacity: 1; color: var(--color-red-orange); } 74%, 100% { opacity: 0; } }
        @keyframes ot-age-logged  { 0%, 72% { opacity: 0; } 76%, 100% { opacity: 1; color: #c97a4a; font-weight: 700; } }

        /* Pointer (fingertip) — enters from the right, dwells on handle, then
           drifts down to click the Log button in the inline insert. */
        @keyframes ot-pointer {
          0%, 14%   { opacity: 0; transform: translate(0px, 0px); }
          22%       { opacity: 1; transform: translate(-12px, 0px); }
          44%, 48%  { opacity: 1; transform: translate(-12px, 0px); }
          58%       { opacity: 1; transform: translate(-50px, 70px); }
          68%, 70%  { opacity: 1; transform: translate(-50px, 70px); }
          75%       { opacity: 0; transform: translate(-50px, 70px); }
          100%      { opacity: 0; transform: translate(0px, 0px); }
        }

        .ot-card-compress  { animation: ot-card-compress 7s ease-in-out infinite; }
        .ot-handle-w       { animation: ot-handle-w 7s ease-in-out infinite; }
        .ot-handle-label   { animation: ot-handle-label 7s ease-in-out infinite; }
        .ot-handle-check   { animation: ot-handle-check 7s ease-in-out infinite; }
        .ot-insert         { animation: ot-insert 7s ease-in-out infinite; }
        .ot-age-stale      { animation: ot-age-stale 7s ease-in-out infinite; position: absolute; inset: 0; }
        .ot-age-logged     { animation: ot-age-logged 7s ease-in-out infinite; position: absolute; inset: 0; display: inline-flex; align-items: center; gap: 3px; }
        .ot-pointer-anim   { animation: ot-pointer 7s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 260, position: "relative" }}>
        {/* Card — width animates to 80% + margin-left auto after the log */}
        <div className="ot-card-compress" style={{
          position: "relative",
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
            <span className="ot-age-stale" style={{ fontSize: 9 }}>5w ago</span>
            <span className="ot-age-logged" style={{ fontSize: 9 }}>
              <svg width="7" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M1 3L3 5L7 1" stroke="#c97a4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Followed up · today
            </span>
          </div>

          {/* Right-edge handle — width and content animate together */}
          <div className="ot-handle-w" style={{
            position: "absolute",
            right: 0, top: 0, bottom: 0,
            borderRadius: "0 8px 8px 0",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 8, fontWeight: 700,
            letterSpacing: "0.03em",
            overflow: "hidden",
          }}>
            <span className="ot-handle-label" style={{ paddingInline: 4 }}>Log follow-up</span>
            <span className="ot-handle-check" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="7" height="6" viewBox="0 0 8 6" fill="none">
                <path d="M1 3L3 5L7 1" stroke="#c97a4a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </div>
        </div>

        {/* Inline insert — opens under the card on click */}
        <div className="ot-insert" style={{
          overflow: "hidden",
          maxHeight: 0,
          opacity: 0,
        }}>
          <div style={{
            background: "var(--color-off-white)",
            border: "0.5px solid rgba(201,122,74,0.40)",
            borderRadius: 7,
            padding: 7,
            display: "flex", flexDirection: "column", gap: 5,
          }}>
            <div style={{ display: "flex", gap: 3 }}>
              {["Email", "Call", "Meeting", "Note"].map((label, i) => (
                <span key={label} style={{
                  fontSize: 7, fontWeight: 600,
                  padding: "1.5px 6px", borderRadius: 99,
                  background: i === 0 ? "#c97a4a" : "var(--color-cream)",
                  color:      i === 0 ? "white" : "#6b6860",
                  border: `0.5px solid ${i === 0 ? "#c97a4a" : "var(--color-border)"}`,
                }}>{label}</span>
              ))}
            </div>
            <div style={{
              height: 16, borderRadius: 4,
              background: "var(--color-warm-white)",
              border: "0.5px solid var(--color-border)",
            }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
              <span style={{
                fontSize: 7, fontWeight: 700,
                padding: "2px 8px", borderRadius: 4,
                background: "#c97a4a", color: "white",
              }}>Log follow-up</span>
            </div>
          </div>
        </div>

        {/* Pointer ring — enters at handle, then moves to the inline Log button */}
        <div className="ot-pointer-anim" aria-hidden style={{
          position: "absolute",
          right: -8, top: 18,
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

