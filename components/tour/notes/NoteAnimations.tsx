"use client";

// Lightweight CSS animations for the Notes intro modal slides. Same scale
// and visual language as ProjectAnimations / ContactAnimations so the three
// walkthroughs feel like one family. Each loop demonstrates an affordance
// of the Notes module: free-form writing, calling Ash inline, and turning
// a note into tasks.

import { Sparkles, CheckSquare } from "lucide-react";

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ─── Slide 1 + 2: a writing surface — title types in, paragraph lines flow in ───
export function WritingSurface() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes nt-title {
          0%, 4%   { width: 0; }
          18%, 100% { width: 142px; }
        }
        @keyframes nt-cursor {
          0%, 50%  { opacity: 1; }
          51%,100% { opacity: 0; }
        }
        @keyframes nt-line-1 {
          0%, 22%   { opacity: 0; transform: translateY(3px); }
          28%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-line-2 {
          0%, 38%   { opacity: 0; transform: translateY(3px); }
          44%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-line-3 {
          0%, 54%   { opacity: 0; transform: translateY(3px); }
          60%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-line-4 {
          0%, 70%   { opacity: 0; transform: translateY(3px); }
          76%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-bullet-1 {
          0%, 82%   { opacity: 0; transform: translateY(3px); }
          88%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-saved {
          0%, 88%   { opacity: 0; transform: translateY(2px); }
          94%, 100% { opacity: 1; transform: translateY(0); }
        }
        .nt-title { animation: nt-title 5s steps(20, end) infinite; overflow: hidden; white-space: nowrap; display: inline-block; vertical-align: bottom; }
        .nt-cursor { animation: nt-cursor 0.9s steps(1, end) infinite; }
        .nt-line-1 { animation: nt-line-1 5s ease-out infinite; }
        .nt-line-2 { animation: nt-line-2 5s ease-out infinite; }
        .nt-line-3 { animation: nt-line-3 5s ease-out infinite; }
        .nt-line-4 { animation: nt-line-4 5s ease-out infinite; }
        .nt-bullet-1 { animation: nt-bullet-1 5s ease-out infinite; }
        .nt-saved { animation: nt-saved 5s ease-out infinite; }
      `}</style>

      <div style={{
        width: 296, height: 168,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Mini toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "5px 9px",
          borderBottom: "0.5px solid var(--color-border)",
          background: "var(--color-warm-white)",
        }}>
          {["B", "I", "U"].map((c) => (
            <div key={c} style={{
              width: 14, height: 14, borderRadius: 3,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, fontWeight: 700, color: "var(--color-grey)",
            }}>{c}</div>
          ))}
          <div style={{ width: 0.5, height: 9, background: "var(--color-border)", margin: "0 2px" }} />
          <div style={{ fontSize: 7, fontWeight: 700, color: "var(--color-grey)" }}>H1</div>
          <div style={{ fontSize: 7, fontWeight: 700, color: "var(--color-grey)" }}>H2</div>
          <div style={{ flex: 1 }} />
          <div className="nt-saved" style={{
            display: "flex", alignItems: "center", gap: 3,
            fontSize: 7, color: "var(--color-sage)", fontWeight: 600,
          }}>
            <svg width="7" height="6" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Saved
          </div>
        </div>

        {/* Page */}
        <div style={{ padding: "10px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: "var(--color-charcoal)",
            letterSpacing: "-0.01em", lineHeight: 1.2,
          }}>
            <span className="nt-title">Studio visit — Vidal</span>
            <span className="nt-cursor" style={{
              display: "inline-block", width: 1, height: 11,
              background: "var(--color-charcoal)", marginLeft: 1,
              verticalAlign: "text-bottom",
            }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
            <div className="nt-line-1" style={textLine(100)} />
            <div className="nt-line-2" style={textLine(94)} />
            <div className="nt-line-3" style={textLine(85)} />
            <div className="nt-line-4" style={textLine(70)} />
            <div className="nt-bullet-1" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
              <div style={{ width: 3, height: 3, borderRadius: 99, background: "var(--color-grey)" }} />
              <div style={{ ...textLine(60), margin: 0 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: inline Ash tease — user types space, Ash popover appears,
// streams a sentence into the line ───────────────────────────────────────────
export function InlineAshTease() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes nt-ia-prompt {
          0%, 18%   { opacity: 0; transform: translateY(-4px); }
          24%, 56%  { opacity: 1; transform: translateY(0); }
          62%, 100% { opacity: 0; transform: translateY(-4px); }
        }
        @keyframes nt-ia-prompt-text {
          0%, 28%   { width: 0; }
          50%, 100% { width: 138px; }
        }
        @keyframes nt-ia-line {
          0%, 60%   { opacity: 0; transform: translateY(3px); }
          66%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-ia-line2 {
          0%, 72%   { opacity: 0; transform: translateY(3px); }
          78%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-ia-line3 {
          0%, 84%   { opacity: 0; transform: translateY(3px); }
          90%, 100% { opacity: 1; transform: translateY(0); }
        }
        .nt-ia-prompt        { animation: nt-ia-prompt        6.4s ease-in-out infinite; }
        .nt-ia-prompt-text   { animation: nt-ia-prompt-text   6.4s steps(18, end) infinite; overflow: hidden; white-space: nowrap; display: inline-block; }
        .nt-ia-line          { animation: nt-ia-line          6.4s ease-out infinite; }
        .nt-ia-line2         { animation: nt-ia-line2         6.4s ease-out infinite; }
        .nt-ia-line3         { animation: nt-ia-line3         6.4s ease-out infinite; }
      `}</style>

      <div style={{
        width: 296, height: 168,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        position: "relative",
      }}>
        {/* Page */}
        <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--color-charcoal)",
            letterSpacing: "-0.01em",
          }}>
            Press kit — fall release
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4, position: "relative" }}>
            <div style={textLine(96)} />
            <div style={textLine(82)} />

            {/* Inline Ash popover floating over the empty line */}
            <div className="nt-ia-prompt" style={{
              position: "absolute", top: 22, left: 0,
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 9px",
              background: "linear-gradient(#1f211a, #1f211a) padding-box, linear-gradient(135deg, #a8b886 0%, #4a6232 100%) border-box",
              border: "1px solid transparent",
              borderRadius: 999,
              boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
              zIndex: 2,
            }}>
              <div style={{
                width: 11, height: 11, borderRadius: "50%",
                background: "linear-gradient(135deg, #a8b886 0%, #4a6232 100%)",
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: 8, color: "rgba(245,241,233,0.92)",
                fontFamily: "inherit",
              }}>
                <span className="nt-ia-prompt-text">Draft the opener…</span>
              </span>
            </div>

            <div className="nt-ia-line" style={{ ...textLine(92), marginTop: 4, background: "var(--color-sage)" }} />
            <div className="nt-ia-line2" style={{ ...textLine(78), background: "var(--color-sage)" }} />
            <div className="nt-ia-line3" style={{ ...textLine(64), background: "var(--color-sage)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide: Generate tasks — Ash reads a note and drafts tasks ──────────────
export function NoteToTasks() {
  return (
    <div style={animationFrame}>
      <style>{`
        /* Loop:
         *   0–18%  static note
         *  20–34%  "Generate tasks" pulses + sparkle
         *  36–46%  thinking shimmer
         *  48–100% three task checkboxes appear in cascade
         */
        @keyframes nt-cta-pulse {
          0%, 18%  { box-shadow: 0 0 0 0 rgba(122,148,86,0); }
          24%      { box-shadow: 0 0 0 6px rgba(122,148,86,0.18); }
          34%      { box-shadow: 0 0 0 0 rgba(122,148,86,0); }
          100%     { box-shadow: 0 0 0 0 rgba(122,148,86,0); }
        }
        @keyframes nt-sparkle {
          0%, 18%  { opacity: 0; transform: scale(0.4) rotate(-20deg); }
          22%, 34% { opacity: 1; transform: scale(1.1) rotate(0deg); }
          38%, 100% { opacity: 0; transform: scale(0.4) rotate(20deg); }
        }
        @keyframes nt-thinking {
          0%, 34%   { opacity: 0; }
          38%, 44%  { opacity: 1; }
          48%, 100% { opacity: 0; }
        }
        @keyframes nt-task-1 {
          0%, 46%   { opacity: 0; transform: translateX(-6px); }
          52%, 100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes nt-task-2 {
          0%, 56%   { opacity: 0; transform: translateX(-6px); }
          62%, 100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes nt-task-3 {
          0%, 66%   { opacity: 0; transform: translateX(-6px); }
          72%, 100% { opacity: 1; transform: translateX(0); }
        }
        .nt-cta-pulse  { animation: nt-cta-pulse  6.4s ease-in-out infinite; }
        .nt-sparkle    { animation: nt-sparkle    6.4s ease-in-out infinite; }
        .nt-thinking   { animation: nt-thinking   6.4s ease-in-out infinite; }
        .nt-task-1     { animation: nt-task-1     6.4s ease-out infinite; }
        .nt-task-2     { animation: nt-task-2     6.4s ease-out infinite; }
        .nt-task-3     { animation: nt-task-3     6.4s ease-out infinite; }
      `}</style>

      <div style={{
        display: "flex", gap: 10, width: 308, alignItems: "stretch",
      }}>
        {/* Note card */}
        <div style={{
          flex: 1,
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 8,
          padding: "8px 10px",
          display: "flex", flexDirection: "column", gap: 5,
          minWidth: 0,
        }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, color: "var(--color-charcoal)",
            letterSpacing: "-0.01em",
          }}>
            Studio visit — Vidal
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={textLine(100)} />
            <div style={textLine(88)} />
            <div style={textLine(72)} />
            <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 1 }}>
              <div style={{ width: 3, height: 3, borderRadius: 99, background: "var(--color-grey)" }} />
              <div style={{ ...textLine(60), margin: 0 }} />
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <div style={{ width: 3, height: 3, borderRadius: 99, background: "var(--color-grey)" }} />
              <div style={{ ...textLine(54), margin: 0 }} />
            </div>
          </div>

          {/* CTA */}
          <div className="nt-cta-pulse" style={{
            marginTop: "auto", alignSelf: "flex-start",
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px",
            background: "linear-gradient(#fffefc, #fffefc) padding-box, linear-gradient(135deg, #a8b886 0%, #4a6232 100%) border-box",
            border: "1px solid transparent",
            borderRadius: 5,
            fontSize: 8, fontWeight: 600,
            color: "#4a6232",
            position: "relative",
          }}>
            <Sparkles className="nt-sparkle" size={8} fill="#4a6232" strokeWidth={0} />
            Generate tasks
          </div>
        </div>

        {/* Output panel */}
        <div style={{
          width: 138,
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 8,
          padding: "8px 9px",
          display: "flex", flexDirection: "column", gap: 5,
          position: "relative",
        }}>
          <div style={{
            fontSize: 7, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.06em", color: "var(--color-grey)",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <Sparkles size={7} fill="#4a6232" strokeWidth={0} />
            Suggested tasks
          </div>

          {/* Thinking shimmer */}
          <div className="nt-thinking" style={{
            position: "absolute", top: 26, left: 9, right: 9,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ ...shimmerLine, width: "92%" }} />
            <div style={{ ...shimmerLine, width: "78%" }} />
            <div style={{ ...shimmerLine, width: "85%" }} />
          </div>

          {/* Task rows */}
          <div className="nt-task-1" style={taskRow}>
            <CheckSquare size={8} strokeWidth={1.75} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
            <span style={{ ...miniTaskLine, width: "90%" }} />
          </div>
          <div className="nt-task-2" style={taskRow}>
            <CheckSquare size={8} strokeWidth={1.75} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
            <span style={{ ...miniTaskLine, width: "76%" }} />
          </div>
          <div className="nt-task-3" style={taskRow}>
            <CheckSquare size={8} strokeWidth={1.75} style={{ color: "var(--color-sage)", flexShrink: 0 }} />
            <span style={{ ...miniTaskLine, width: "62%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────────

function textLine(widthPct: number): React.CSSProperties {
  return {
    height: 4, borderRadius: 2,
    background: "var(--color-border-strong)",
    width: `${widthPct}%`,
    display: "block",
  };
}

const taskRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 5,
};

const miniTaskLine: React.CSSProperties = {
  height: 4, borderRadius: 2,
  background: "var(--color-border-strong)",
  display: "block",
};

const shimmerLine: React.CSSProperties = {
  height: 4, borderRadius: 2,
  background: "linear-gradient(90deg, rgba(155,163,122,0.18), rgba(155,163,122,0.42), rgba(155,163,122,0.18))",
  backgroundSize: "200% 100%",
  animation: "nt-shimmer 1.4s linear infinite",
};

// keyframes for shimmer (registered globally once it appears in any slide)
if (typeof document !== "undefined" && !document.getElementById("nt-shimmer-kf")) {
  const s = document.createElement("style");
  s.id = "nt-shimmer-kf";
  s.textContent = `@keyframes nt-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
  document.head.appendChild(s);
}
