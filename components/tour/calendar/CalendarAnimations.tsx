"use client";

// Lightweight CSS/SVG animations for the Calendar intro modal slides. Same
// scale and visual language as Projects/Contacts/Outreach so the family of
// walkthroughs feels coherent. Each loop demonstrates one calendar idea:
// the week grid materializing, connecting an external calendar, quick
// capture of a task/event, and the unified timeline view.

import { CheckSquare, FolderOpen, Mail } from "lucide-react";

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ─── Slide 1: week grid materializes, then events drop in ────────────────────
export function WeekGridMaterialize() {
  const DAYS = ["S","M","T","W","T","F","S"];
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes cal-col-in   { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes cal-event-in { 0%,40% { opacity: 0; transform: scale(0.9); } 60%,100% { opacity: 1; transform: scale(1); } }
        @keyframes cal-nowline  { 0%,30% { opacity: 0; transform: scaleX(0); } 50%,100% { opacity: 1; transform: scaleX(1); } }

        .cal-col-0 { animation: cal-col-in 0.5s ease-out 0.0s both; }
        .cal-col-1 { animation: cal-col-in 0.5s ease-out 0.05s both; }
        .cal-col-2 { animation: cal-col-in 0.5s ease-out 0.10s both; }
        .cal-col-3 { animation: cal-col-in 0.5s ease-out 0.15s both; }
        .cal-col-4 { animation: cal-col-in 0.5s ease-out 0.20s both; }
        .cal-col-5 { animation: cal-col-in 0.5s ease-out 0.25s both; }
        .cal-col-6 { animation: cal-col-in 0.5s ease-out 0.30s both; }

        .cal-ev-0  { animation: cal-event-in 1.2s ease-out 0.8s both; }
        .cal-ev-1  { animation: cal-event-in 1.2s ease-out 1.1s both; }
        .cal-ev-2  { animation: cal-event-in 1.2s ease-out 1.4s both; }
        .cal-ev-3  { animation: cal-event-in 1.2s ease-out 1.7s both; }
        .cal-nowln { animation: cal-nowline  1.0s ease-out 1.0s both; transform-origin: left center; }
      `}</style>

      <div style={{
        width: 280, height: 168,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Day header strip */}
        <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}>
          <div style={{ width: 22, fontSize: 6, color: "var(--color-grey)", padding: "5px 4px", textAlign: "right" }}>UTC</div>
          {DAYS.map((d, i) => {
            const isToday = i === 3;
            return (
              <div key={i} className={`cal-col-${i}`} style={{
                flex: 1,
                borderLeft: "0.5px solid var(--color-border)",
                padding: "5px 0 4px",
                textAlign: "center",
                background: isToday ? "rgba(155,163,122,0.07)" : "transparent",
              }}>
                <div style={{ fontSize: 7, fontWeight: 600, color: "var(--color-grey)", letterSpacing: "0.04em" }}>{d}</div>
                <div style={{
                  fontSize: 9,
                  width: 14, height: 14, borderRadius: 99,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  margin: "1px auto 0",
                  background: isToday ? "var(--color-charcoal)" : "transparent",
                  color: isToday ? "var(--color-warm-white)" : "var(--color-charcoal)",
                  fontWeight: isToday ? 600 : 400,
                }}>{12 + i}</div>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, position: "relative" }}>
          <div style={{ width: 22, flexShrink: 0 }}>
            {["9","11","1","3"].map((h, i) => (
              <div key={i} style={{ position: "absolute", top: 10 + i * 22, right: 3, fontSize: 6, color: "var(--color-grey)" }}>{h}</div>
            ))}
          </div>
          {DAYS.map((_, i) => {
            const isToday = i === 3;
            return (
              <div key={i} className={`cal-col-${i}`} style={{
                flex: 1, position: "relative",
                borderLeft: "0.5px solid var(--color-border)",
                background: isToday ? "rgba(155,163,122,0.05)" : "transparent",
              }}>
                {/* Hour lines */}
                {[0,1,2,3].map(h => (
                  <div key={h} style={{ position: "absolute", top: (h + 1) * 22, left: 0, right: 0, height: 0.5, background: "var(--color-border)" }} />
                ))}
              </div>
            );
          })}

          {/* Events */}
          <div className="cal-ev-0" style={{
            position: "absolute", top: 14, left: "calc(22px + (100% - 22px) * 1/7 + 2px)",
            width: "calc((100% - 22px) / 7 - 4px)", height: 28,
            borderRadius: 3, background: "rgba(3,155,229,0.14)", borderLeft: "2.5px solid #039BE5",
            padding: "2px 4px",
          }}>
            <div style={{ fontSize: 6.5, fontWeight: 600, color: "#039BE5", lineHeight: 1.2 }}>Studio sync</div>
            <div style={{ fontSize: 5.5, color: "#039BE5", opacity: 0.75 }}>9:00</div>
          </div>

          <div className="cal-ev-1" style={{
            position: "absolute", top: 42, left: "calc(22px + (100% - 22px) * 3/7 + 2px)",
            width: "calc((100% - 22px) / 7 - 4px)", height: 36,
            borderRadius: 3, background: "rgba(126,134,203,0.14)", borderLeft: "2.5px solid #7986CB",
            padding: "2px 4px",
          }}>
            <div style={{ fontSize: 6.5, fontWeight: 600, color: "#7986CB", lineHeight: 1.2 }}>Foster mtg</div>
            <div style={{ fontSize: 5.5, color: "#7986CB", opacity: 0.75 }}>10:30</div>
          </div>

          <div className="cal-ev-2" style={{
            position: "absolute", top: 70, left: "calc(22px + (100% - 22px) * 5/7 + 2px)",
            width: "calc((100% - 22px) / 7 - 4px)", height: 22,
            borderRadius: 3, background: "rgba(155,163,122,0.18)", borderLeft: "2.5px solid var(--color-sage)",
            padding: "2px 4px",
          }}>
            <div style={{ fontSize: 6.5, fontWeight: 600, color: "#4a5630", lineHeight: 1.2 }}>Photo</div>
          </div>

          <div className="cal-ev-3" style={{
            position: "absolute", top: 96, left: "calc(22px + (100% - 22px) * 0/7 + 2px)",
            width: "calc((100% - 22px) / 7 * 2 - 4px)", height: 26,
            borderRadius: 3, background: "rgba(244,81,30,0.14)", borderLeft: "2.5px solid #F4511E",
            padding: "2px 4px",
          }}>
            <div style={{ fontSize: 6.5, fontWeight: 600, color: "#F4511E", lineHeight: 1.2 }}>Fab review</div>
            <div style={{ fontSize: 5.5, color: "#F4511E", opacity: 0.75 }}>2:00</div>
          </div>

          {/* Now line on today */}
          <div className="cal-nowln" style={{
            position: "absolute", top: 58, height: 1.5,
            left: "calc(22px + (100% - 22px) * 3/7)", width: "calc((100% - 22px) / 7)",
            background: "var(--color-orange)",
          }}>
            <div style={{ position: "absolute", left: -3, top: -2.5, width: 6, height: 6, borderRadius: 99, background: "var(--color-orange)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: connect Google + Outlook — chips fly into the week ─────────────
export function ConnectCalendars() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes cal-tile-pulse {
          0%, 25%   { transform: scale(1); box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
          30%, 35%  { transform: scale(1.04); box-shadow: 0 0 0 3px rgba(155,163,122,0.30); }
          45%, 100% { transform: scale(1); box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
        }
        @keyframes cal-event-fly-1 {
          0%, 35%   { opacity: 0; transform: translate(0, 0) scale(0.7); }
          50%       { opacity: 1; transform: translate(60px, -30px) scale(0.9); }
          70%, 100% { opacity: 1; transform: translate(120px, -50px) scale(1); }
        }
        @keyframes cal-event-fly-2 {
          0%, 50%   { opacity: 0; transform: translate(0, 0) scale(0.7); }
          65%      { opacity: 1; transform: translate(50px, -20px) scale(0.9); }
          80%, 100% { opacity: 1; transform: translate(110px, -10px) scale(1); }
        }
        @keyframes cal-event-fly-3 {
          0%, 60%   { opacity: 0; transform: translate(0, 0) scale(0.7); }
          75%       { opacity: 1; transform: translate(40px, 20px) scale(0.9); }
          90%, 100% { opacity: 1; transform: translate(100px, 40px) scale(1); }
        }
        .cal-tile-1 { animation: cal-tile-pulse 4s ease-in-out infinite; }
        .cal-tile-2 { animation: cal-tile-pulse 4s ease-in-out infinite; animation-delay: 0.4s; }
        .cal-fly-1  { animation: cal-event-fly-1 4s ease-in-out infinite; }
        .cal-fly-2  { animation: cal-event-fly-2 4s ease-in-out infinite; }
        .cal-fly-3  { animation: cal-event-fly-3 4s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 290, position: "relative", display: "flex", gap: 20, alignItems: "center" }}>
        {/* Left: provider tiles */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 110, position: "relative", zIndex: 2 }}>
          <div className="cal-tile-1" style={tileStyle}>
            <svg width="14" height="14" viewBox="0 0 48 48" fill="none" style={{ flexShrink: 0 }}>
              <path d="M43.6 20H24v8.4h11.2C33.6 33.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l6-6C34.5 6.3 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19-7.2 19-20 0-1.3-.1-2.7-.4-4z" fill="#4285F4"/>
            </svg>
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "var(--color-charcoal)" }}>Google</div>
              <div style={{ fontSize: 6.5, color: "var(--color-grey)" }}>Calendar</div>
            </div>
          </div>
          <div className="cal-tile-2" style={tileStyle}>
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
              <path d="M15 4H4v11h11V4z" fill="#F25022"/>
              <path d="M28 4H17v11h11V4z" fill="#7FBA00"/>
              <path d="M15 17H4v11h11V17z" fill="#00A4EF"/>
              <path d="M28 17H17v11h11V17z" fill="#FFB900"/>
            </svg>
            <div>
              <div style={{ fontSize: 8, fontWeight: 600, color: "var(--color-charcoal)" }}>Outlook</div>
              <div style={{ fontSize: 6.5, color: "var(--color-grey)" }}>Calendar</div>
            </div>
          </div>
        </div>

        {/* Flying event chips originating from the tiles */}
        <div className="cal-fly-1" style={flyChipStyle("rgba(126,134,203,0.18)", "#7986CB")}>Foster mtg</div>
        <div className="cal-fly-2" style={flyChipStyle("rgba(3,155,229,0.18)", "#039BE5")}>Studio sync</div>
        <div className="cal-fly-3" style={flyChipStyle("rgba(244,81,30,0.18)", "#F4511E")}>Fab review</div>

        {/* Right: mini week strip */}
        <div style={{
          flex: 1, height: 110,
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 6,
          display: "flex", flexDirection: "column", overflow: "hidden",
          position: "relative",
        }}>
          <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-warm-white)" }}>
            {["M","T","W","T","F"].map((d, i) => (
              <div key={i} style={{
                flex: 1, padding: "3px 0",
                fontSize: 6.5, fontWeight: 600, textAlign: "center",
                color: i === 2 ? "var(--color-charcoal)" : "var(--color-grey)",
                borderLeft: i > 0 ? "0.5px solid var(--color-border)" : undefined,
                background: i === 2 ? "rgba(155,163,122,0.07)" : "transparent",
              }}>{d}</div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: quick capture of a task — title typed, then dropped onto day ───
export function QuickCapture() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes cal-input-pulse {
          0%, 15%   { box-shadow: 0 0 0 0 rgba(155,163,122,0); }
          25%, 65%  { box-shadow: 0 0 0 3px rgba(155,163,122,0.30); }
          75%, 100% { box-shadow: 0 0 0 0 rgba(155,163,122,0); }
        }
        @keyframes cal-typing {
          0%, 15%   { width: 0; }
          55%, 100% { width: 100%; }
        }
        @keyframes cal-caret {
          0%, 50%   { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
        @keyframes cal-chip-drop {
          0%, 65%   { opacity: 0; transform: translateY(-12px) scale(0.85); }
          80%, 100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cal-rail-glow {
          0%, 65%   { background: rgba(155,163,122,0.0); }
          80%, 95%  { background: rgba(155,163,122,0.16); }
          100%      { background: rgba(155,163,122,0.0); }
        }
        .cal-input    { animation: cal-input-pulse 4s ease-in-out infinite; }
        .cal-typing   { animation: cal-typing 4s steps(20, end) infinite; overflow: hidden; white-space: nowrap; display: inline-block; }
        .cal-caret    { animation: cal-caret 0.7s steps(1, end) infinite; }
        .cal-chip     { animation: cal-chip-drop 4s ease-out infinite; }
        .cal-rail     { animation: cal-rail-glow 4s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 290, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Input pill — typing animation */}
        <div className="cal-input" style={{
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 8,
          padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 6,
          transition: "box-shadow 0.2s ease",
        }}>
          <CheckSquare size={11} strokeWidth={1.75} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
          <div style={{ fontSize: 10, color: "var(--color-charcoal)", fontWeight: 500, position: "relative" }}>
            <span className="cal-typing">Email Foster about install</span>
            <span className="cal-caret" style={{ display: "inline-block", width: 1, height: 9, background: "var(--color-charcoal)", verticalAlign: "middle", marginLeft: 1 }} />
          </div>
        </div>

        {/* Today rail receiving the new task chip */}
        <div className="cal-rail" style={{
          borderRadius: 8,
          border: "0.5px solid var(--color-border)",
          padding: "7px 10px",
          display: "flex", alignItems: "center", gap: 6,
          transition: "background 0.2s ease",
        }}>
          <span style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-grey)" }}>Today</span>
          <div className="cal-chip" style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(155,163,122,0.14)",
            border: "0.5px solid rgba(155,163,122,0.28)",
            color: "#4a5630",
            padding: "2px 7px", borderRadius: 99,
            fontSize: 8, fontWeight: 500,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 1.5, border: "1px solid #4a5630" }} />
            Email Foster about install
          </div>
        </div>

        {/* Helper hint */}
        <p style={{ fontSize: 8, color: "var(--color-grey)", textAlign: "center", marginTop: 2 }}>
          Tasks land on the day you pick. Or just say it to Ash.
        </p>
      </div>
    </div>
  );
}

// ─── Slide 4: unified timeline — three sources collapse into one row ─────────
export function UnifiedTimeline() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes cal-row-shift {
          0%, 20%   { transform: translateY(0); opacity: 1; }
          35%, 55%  { transform: translateY(36px); opacity: 1; }
          70%, 100% { transform: translateY(36px); opacity: 1; }
        }
        @keyframes cal-row-fade {
          0%, 25%   { opacity: 1; transform: scale(1); }
          35%, 55%  { opacity: 0; transform: scale(0.95); }
          70%, 100% { opacity: 0; transform: scale(0.95); }
        }
        @keyframes cal-merged-in {
          0%, 55%   { opacity: 0; transform: translateY(8px); }
          70%, 100% { opacity: 1; transform: translateY(0); }
        }
        .cal-source-1 { animation: cal-row-shift 5s ease-in-out infinite; }
        .cal-source-2 { animation: cal-row-fade  5s ease-in-out infinite; }
        .cal-source-3 { animation: cal-row-fade  5s ease-in-out infinite; }
        .cal-merged   { animation: cal-merged-in 5s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 290, display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
        {/* Source rows — collapse into one */}
        <div style={{ position: "relative", height: 90 }}>
          <div className="cal-source-1" style={{ ...sourceRowStyle, position: "absolute", top: 0, left: 0, right: 0 }}>
            <FolderOpen size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
            <span style={{ fontSize: 8, fontWeight: 600, color: "var(--color-grey)" }}>Projects</span>
            <span style={chipDot("rgba(155,163,122,0.14)", "#4a5630", "rgba(155,163,122,0.28)")}>Brass console due</span>
          </div>
          <div className="cal-source-2" style={{ ...sourceRowStyle, position: "absolute", top: 30, left: 0, right: 0 }}>
            <Mail size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
            <span style={{ fontSize: 8, fontWeight: 600, color: "var(--color-grey)" }}>Outreach</span>
            <span style={chipDot("rgba(180,120,40,0.14)", "#8a6320", "rgba(180,120,40,0.28)")}>Follow up · Cooper Hewitt</span>
          </div>
          <div className="cal-source-3" style={{ ...sourceRowStyle, position: "absolute", top: 60, left: 0, right: 0 }}>
            <svg width="9" height="9" viewBox="0 0 48 48" fill="none">
              <path d="M43.6 20H24v8.4h11.2C33.6 33.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l6-6C34.5 6.3 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19-7.2 19-20 0-1.3-.1-2.7-.4-4z" fill="#4285F4"/>
            </svg>
            <span style={{ fontSize: 8, fontWeight: 600, color: "var(--color-grey)" }}>Google</span>
            <span style={chipDot("rgba(126,134,203,0.14)", "#7986CB", "rgba(126,134,203,0.28)")}>Studio sync · 10:30</span>
          </div>
        </div>

        {/* Merged result — one timeline row */}
        <div className="cal-merged" style={{
          borderRadius: 8,
          border: "0.5px solid var(--color-border)",
          background: "var(--color-warm-white)",
          padding: "8px 10px",
          display: "flex", flexDirection: "column", gap: 5,
        }}>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-grey)" }}>Thursday · This week</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <span style={chipDot("rgba(126,134,203,0.14)", "#7986CB", "rgba(126,134,203,0.28)")}>Studio sync · 10:30</span>
            <span style={chipDot("rgba(180,120,40,0.14)", "#8a6320", "rgba(180,120,40,0.28)")}>Follow up · Cooper Hewitt</span>
            <span style={chipDot("rgba(155,163,122,0.14)", "#4a5630", "rgba(155,163,122,0.28)")}>Brass console due</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const tileStyle: React.CSSProperties = {
  background: "var(--color-off-white)",
  border: "0.5px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 10px",
  display: "flex", alignItems: "center", gap: 8,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

function flyChipStyle(bg: string, color: string): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%", left: 110,
    fontSize: 7.5, fontWeight: 600,
    background: bg, color, borderLeft: `2px solid ${color}`,
    padding: "3px 6px", borderRadius: 3,
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: 1,
  };
}

const sourceRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  borderRadius: 6, padding: "5px 8px",
  border: "0.5px solid var(--color-border)",
  background: "var(--color-off-white)",
  transition: "transform 0.3s ease, opacity 0.3s ease",
};

function chipDot(bg: string, color: string, border: string): React.CSSProperties {
  return {
    fontSize: 7.5, fontWeight: 500,
    padding: "2px 7px", borderRadius: 99,
    background: bg, color, border: `0.5px solid ${border}`,
    marginLeft: "auto",
  };
}
