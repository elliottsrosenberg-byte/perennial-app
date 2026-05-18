"use client";

// Lightweight CSS animations for the Notes intro modal slides. Same scale
// and visual language as ProjectAnimations / ContactAnimations so the three
// walkthroughs feel like one family. Each loop demonstrates a distinct
// affordance of the Notes module: free-form writing, pin + filter, linking
// to projects/people/opportunities, and turning a note into tasks via Ash.

import { Pin, Search, Link2, Sparkles, CheckSquare } from "lucide-react";

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ─── Mini note row matching the real NotesClient sidebar layout ─────────────
function MiniNoteRow({
  title, snippet, when, pinned = false, active = false, dim = false, hidden = false, style = {},
}: {
  title:    string;
  snippet?: string;
  when:     string;
  pinned?:  boolean;
  active?:  boolean;
  dim?:     boolean;
  hidden?:  boolean;
  style?:   React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "5px 7px 5px 8px",
        borderRadius: 5,
        borderLeft: `2px solid ${active ? "var(--color-sage)" : "transparent"}`,
        background: active
          ? "rgba(155,163,122,0.12)"
          : "var(--color-off-white)",
        border: active ? "0.5px solid rgba(155,163,122,0.3)" : "0.5px solid var(--color-border)",
        opacity: hidden ? 0 : dim ? 0.4 : 1,
        transition: "opacity 0.25s ease, background 0.25s ease",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
        {pinned && (
          <svg width="6" height="6" viewBox="0 0 16 16" fill="var(--color-sage)" style={{ flexShrink: 0 }}>
            <path d="M9.5 1.5L14.5 6.5L10 11L9 14L6 11L2 7L5 6L9.5 1.5Z" />
          </svg>
        )}
        <span style={{
          fontSize: 8.5, fontWeight: 600,
          color: active ? "#4a6232" : "var(--color-charcoal)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {title}
        </span>
      </div>
      {snippet && (
        <div style={{
          fontSize: 7, color: "var(--color-grey)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          marginBottom: 1,
        }}>
          {snippet}
        </div>
      )}
      <div style={{ fontSize: 6.5, color: "var(--color-grey)" }}>{when}</div>
    </div>
  );
}

// ─── Slide 1: a writing surface — title types in, paragraph lines flow in ───
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

// ─── Slide 2: pin + search/filter — list reflows as the user pins a note ───
export function PinAndFilter() {
  return (
    <div style={animationFrame}>
      <style>{`
        /* Loop: list at rest → pin lights up on "Vidal" → it floats up under
         * Pinned, then search "vid" filters everything else out. */
        @keyframes nt-pin-icon {
          0%, 18%   { opacity: 0; transform: scale(0.6); }
          22%, 50%  { opacity: 1; transform: scale(1.15); color: var(--color-sage); }
          55%, 100% { opacity: 1; transform: scale(1); color: var(--color-sage); }
        }
        @keyframes nt-show-pinned {
          0%, 18%   { opacity: 0; transform: translateY(-3px); max-height: 0; margin-bottom: 0; }
          24%, 100% { opacity: 1; transform: translateY(0); max-height: 30px; margin-bottom: 4px; }
        }
        @keyframes nt-row-pinned {
          0%, 18%   { opacity: 1; transform: translateY(0); }
          22%, 26%  { opacity: 0.3; }
          30%, 100% { opacity: 0; max-height: 0; padding: 0; margin: 0; }
        }
        @keyframes nt-pinned-card {
          0%, 24%   { opacity: 0; transform: translateY(-4px); }
          30%, 100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-search-text {
          0%, 60%   { width: 0; }
          66%, 100% { width: 22px; }
        }
        @keyframes nt-show-match {
          0%, 60%   { opacity: 1; }
          66%, 100% { opacity: 1; }
        }
        @keyframes nt-hide-nonmatch {
          0%, 60%   { opacity: 1; }
          66%, 100% { opacity: 0.18; }
        }
        .nt-pin-icon     { animation: nt-pin-icon     6.4s ease-in-out infinite; }
        .nt-show-pinned  { animation: nt-show-pinned  6.4s ease-in-out infinite; }
        .nt-row-pinned   { animation: nt-row-pinned   6.4s ease-in-out infinite; }
        .nt-pinned-card  { animation: nt-pinned-card  6.4s ease-in-out infinite; }
        .nt-search-text  { animation: nt-search-text  6.4s steps(3, end) infinite; overflow: hidden; }
        .nt-hide-nonmatch { animation: nt-hide-nonmatch 6.4s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 240, display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Search bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "4px 7px",
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 5,
        }}>
          <Search size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
          <div style={{
            fontSize: 8, color: "var(--color-charcoal)",
            display: "flex", alignItems: "center", height: 9,
          }}>
            <span className="nt-search-text" style={{ display: "inline-block", whiteSpace: "nowrap" }}>vid</span>
          </div>
        </div>

        {/* Pinned section header */}
        <div className="nt-show-pinned" style={{ overflow: "hidden" }}>
          <div style={{
            padding: "2px 6px",
            background: "var(--color-surface-sunken)",
            borderRadius: 3,
            fontSize: 6.5, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--color-grey)",
          }}>
            Pinned
          </div>
        </div>

        {/* Pinned card slot — appears mid-loop */}
        <div className="nt-pinned-card" style={{ marginBottom: 2 }}>
          <MiniNoteRow
            title="Studio visit — Vidal" snippet="Brass finishes, lead time 6w…"
            when="2m ago" pinned active
          />
        </div>

        {/* Original list (un-pinned position) — fades out after pin */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div className="nt-row-pinned" style={{ overflow: "hidden", position: "relative" }}>
            <MiniNoteRow
              title="Studio visit — Vidal" snippet="Brass finishes, lead time 6w…"
              when="2m ago"
            />
            <div className="nt-pin-icon" style={{
              position: "absolute", top: 5, right: 6,
              color: "var(--color-grey)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Pin size={9} strokeWidth={1.8} fill="currentColor" />
            </div>
          </div>
          <div className="nt-hide-nonmatch">
            <MiniNoteRow title="Press list for Q3" snippet="Studio Mag, Sight Unseen, T-Magazine" when="Today" />
          </div>
          <div className="nt-hide-nonmatch">
            <MiniNoteRow title="Foster console — pricing" snippet="Materials breakdown vs studio rate" when="Yesterday" />
          </div>
          <div className="nt-hide-nonmatch">
            <MiniNoteRow title="Open call ideas" snippet="Hand-drawn vs printed proposal" when="Jul 24" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: link a note to a project / contact / opportunity ──────────────
export function LinkBack() {
  return (
    <div style={animationFrame}>
      <style>{`
        /* Loop: empty pill → opens dropdown → "Brass console" selected → pill
         * fills sage, dropdown collapses. */
        @keyframes nt-pill-fill {
          0%, 38%   { background: transparent; color: var(--color-grey); border-color: var(--color-border); }
          44%, 100% { background: rgba(155,163,122,0.16); color: #4a6232; border-color: rgba(155,163,122,0.42); }
        }
        @keyframes nt-pill-label {
          0%, 38%   { opacity: 1; }
          42%, 100% { opacity: 0; }
        }
        @keyframes nt-pill-result {
          0%, 38%   { opacity: 0; }
          44%, 100% { opacity: 1; }
        }
        @keyframes nt-dropdown {
          0%, 14%   { opacity: 0; transform: translateY(-3px); max-height: 0; }
          20%, 36%  { opacity: 1; transform: translateY(0); max-height: 90px; }
          42%, 100% { opacity: 0; transform: translateY(-3px); max-height: 0; }
        }
        @keyframes nt-row-highlight {
          0%, 24%   { background: transparent; }
          28%, 36%  { background: rgba(155,163,122,0.14); }
          40%, 100% { background: transparent; }
        }
        .nt-pill-fill     { animation: nt-pill-fill     5.6s ease-in-out infinite; }
        .nt-pill-label    { animation: nt-pill-label    5.6s ease-in-out infinite; }
        .nt-pill-result   { animation: nt-pill-result   5.6s ease-in-out infinite; }
        .nt-dropdown      { animation: nt-dropdown      5.6s ease-in-out infinite; overflow: hidden; }
        .nt-row-highlight { animation: nt-row-highlight 5.6s ease-in-out infinite; }
      `}</style>

      <div style={{
        width: 300, padding: 12,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        display: "flex", flexDirection: "column", gap: 6,
        position: "relative",
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: "var(--color-charcoal)",
          letterSpacing: "-0.01em",
        }}>
          Studio visit — Vidal
        </div>

        {/* Link pill */}
        <div style={{ position: "relative", display: "flex" }}>
          <div className="nt-pill-fill" style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 8.5,
            padding: "2px 7px", borderRadius: 9999,
            border: "0.5px solid var(--color-border)",
            background: "transparent", color: "var(--color-grey)",
            transition: "all 0.2s ease",
            position: "relative",
            minWidth: 92,
          }}>
            <Link2 size={8} strokeWidth={1.75} />
            <span style={{ position: "relative", display: "inline-block" }}>
              <span className="nt-pill-label" style={{ position: "absolute", inset: 0, whiteSpace: "nowrap" }}>Link to…</span>
              <span className="nt-pill-result" style={{ display: "inline-block", whiteSpace: "nowrap" }}>Brass console — Foster</span>
            </span>
          </div>
        </div>

        {/* Dropdown */}
        <div className="nt-dropdown" style={{
          position: "absolute", top: 52, left: 12,
          width: 200,
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 7,
          boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
          padding: 3,
          zIndex: 2,
        }}>
          {/* Tabs strip */}
          <div style={{
            display: "flex", gap: 4,
            padding: "2px 4px 4px",
            borderBottom: "0.5px solid var(--color-border)", marginBottom: 3,
          }}>
            <span style={{
              fontSize: 7, fontWeight: 700,
              color: "var(--color-charcoal)",
              borderBottom: "1.5px solid var(--color-sage)",
              padding: "0 1px 2px",
            }}>Projects</span>
            <span style={{ fontSize: 7, color: "var(--color-grey)", padding: "0 1px 2px" }}>Contacts</span>
            <span style={{ fontSize: 7, color: "var(--color-grey)", padding: "0 1px 2px" }}>Opportunities</span>
          </div>
          {[
            { t: "Brass console — Foster",      hl: true },
            { t: "Editions vol. 4",             hl: false },
            { t: "Press kit refresh",           hl: false },
          ].map((r) => (
            <div
              key={r.t}
              className={r.hl ? "nt-row-highlight" : ""}
              style={{
                padding: "3px 6px", borderRadius: 4,
                fontSize: 8, color: "var(--color-charcoal)",
                fontWeight: r.hl ? 600 : 400,
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {r.hl ? (
                <svg width="7" height="6" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l2.5 2.5L9 1" stroke="#5a7040" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <div style={{ width: 7 }} />
              )}
              {r.t}
            </div>
          ))}
        </div>

        {/* Sample lines under the title — gives the note context */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
          <div style={textLine(100)} />
          <div style={textLine(86)} />
          <div style={textLine(68)} />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: Generate tasks — Ash reads a note and drafts tasks ────────────
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
