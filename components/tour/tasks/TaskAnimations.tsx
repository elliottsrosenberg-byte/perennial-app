"use client";

// Lightweight CSS animations for the Tasks intro modal slides. Same scale and
// visual language as ProjectAnimations / ContactAnimations so the three
// walkthroughs read as one family. Each loop demonstrates a distinct
// affordance of the Tasks module: quick capture, due-date triage, project
// linkage rolling up, and the inline edits that keep the list moving.

import { Folder, User, Briefcase } from "lucide-react";

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ── Mini task row matching the real TasksClient layout ──────────────────────
function MiniTaskRow({
  title, checked = false, priority, due, link, dim = false, style = {},
}: {
  title:    string;
  checked?: boolean;
  priority?: { label: string; color: string };
  due?:     { label: string; color: string };
  link?:    { label: string; icon?: "project" | "contact" | "opp" };
  dim?:     boolean;
  style?:   React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 8px",
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 6,
        opacity: dim ? 0.45 : 1,
        ...style,
      }}
    >
      <div style={{
        width: 10, height: 10, borderRadius: 3, flexShrink: 0,
        border: checked ? "none" : "1.5px solid var(--color-border-strong)",
        background: checked ? "var(--color-sage)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {checked && (
          <svg width="6" height="5" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 9, color: "var(--color-charcoal)",
        textDecoration: checked ? "line-through" : "none",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{title}</span>
      {link && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          fontSize: 7, padding: "1px 5px", borderRadius: 99,
          background: "rgba(155,163,122,0.12)", color: "#5a7040", fontWeight: 500,
          flexShrink: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {link.icon === "contact" ? <User size={6} strokeWidth={2} /> :
           link.icon === "opp"     ? <Briefcase size={6} strokeWidth={2} /> :
                                     <Folder size={6} strokeWidth={2} />}
          {link.label}
        </span>
      )}
      {due && (
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 99,
          background: "var(--color-surface-sunken)",
          color: due.color, fontWeight: 500, flexShrink: 0,
        }}>{due.label}</span>
      )}
      {priority && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          fontSize: 7, padding: "1px 5px", borderRadius: 99,
          background: "var(--color-surface-sunken)",
          color: priority.color, fontWeight: 500, flexShrink: 0,
        }}>
          <span style={{ width: 4, height: 4, borderRadius: 99, background: priority.color }} />
          {priority.label}
        </span>
      )}
    </div>
  );
}

// ─── Slide 1: type → enter → row materializes in the list ───────────────────
export function QuickCapture() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes tk-type {
          0%, 4%   { width: 0; }
          22%, 38% { width: 100%; }
          42%, 100% { width: 0; }
        }
        @keyframes tk-caret {
          0%, 38%   { opacity: 1; }
          42%, 100% { opacity: 0; }
        }
        @keyframes tk-row-in {
          0%, 44%   { opacity: 0; transform: translateY(-4px); max-height: 0; margin-top: 0; }
          50%, 92%  { opacity: 1; transform: translateY(0);    max-height: 30px; margin-top: 4px; }
          96%, 100% { opacity: 0; transform: translateY(-4px); max-height: 0; margin-top: 0; }
        }
        @keyframes tk-add-pulse {
          0%, 38%   { opacity: 0; transform: scale(0.85); }
          42%, 48%  { opacity: 1; transform: scale(1); }
          52%, 100% { opacity: 0; transform: scale(0.85); }
        }
        .tk-type-fill { animation: tk-type 5s ease-in-out infinite; }
        .tk-caret     { animation: tk-caret 5s steps(1, end) infinite; }
        .tk-row-new   { animation: tk-row-in 5s ease-out infinite; }
        .tk-add       { animation: tk-add-pulse 5s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 0, width: 260 }}>
        {/* QuickAdd row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 8px",
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 6,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: 3, flexShrink: 0,
            border: "1.5px dashed var(--color-border-strong)", background: "transparent",
          }} />
          <div style={{ flex: 1, position: "relative", height: 11, overflow: "hidden" }}>
            <div className="tk-type-fill" style={{
              overflow: "hidden", whiteSpace: "nowrap",
              fontSize: 9, color: "var(--color-charcoal)", lineHeight: "11px",
            }}>Email gallery about install dates</div>
            <span className="tk-caret" style={{
              position: "absolute", left: 0, top: 0,
              width: 1, height: 11, background: "var(--color-charcoal)",
              transform: "translateX(0)",
            }} />
          </div>
          <span className="tk-add" style={{
            fontSize: 7, fontWeight: 600, padding: "2px 6px",
            background: "var(--color-sage)", color: "white",
            borderRadius: 4,
          }}>Add</span>
        </div>

        {/* List below — new row materializes */}
        <div className="tk-row-new" style={{ overflow: "hidden" }}>
          <MiniTaskRow
            title="Email gallery about install dates"
            due={{ label: "Today", color: "#a07800" }}
          />
        </div>
        <MiniTaskRow
          title="Order brass tubing"
          due={{ label: "Tomorrow", color: "#a07800" }}
          style={{ marginTop: 4 }}
        />
        <MiniTaskRow
          title="Edit press release draft"
          due={{ label: "3 days", color: "var(--color-text-secondary)" }}
          style={{ marginTop: 4 }}
        />
      </div>
    </div>
  );
}

// ─── Slide 2: due-date triage — Overdue / Today / Upcoming sections ─────────
export function DueDateTriage() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes tk-overdue-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,62,13,0); }
          40%, 60% { box-shadow: 0 0 0 3px rgba(220,62,13,0.18); }
        }
        @keyframes tk-section-glow {
          0%, 30%  { opacity: 0.55; }
          50%, 70% { opacity: 1; }
          90%,100% { opacity: 0.55; }
        }
        .tk-overdue       { animation: tk-overdue-pulse 4s ease-in-out infinite; border-radius: 6px; }
        .tk-section-today { animation: tk-section-glow  4s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", width: 264, gap: 3 }}>
        <SectionStrip label="Overdue" dot="var(--color-red-orange)" count={1} />
        <div className="tk-overdue">
          <MiniTaskRow
            title="Deposit invoice — Foster"
            due={{ label: "Overdue", color: "var(--color-red-orange)" }}
            priority={{ label: "High", color: "var(--color-red-orange)" }}
          />
        </div>

        <SectionStrip label="Today" dot="#a07800" count={2} highlight />
        <MiniTaskRow
          title="Studio visit — Mendez"
          due={{ label: "Today", color: "#a07800" }}
          priority={{ label: "Med", color: "#b8860b" }}
        />
        <MiniTaskRow
          title="Send install schedule"
          due={{ label: "Today", color: "#a07800" }}
        />

        <SectionStrip label="Upcoming" dot="var(--color-sage)" count={1} />
        <MiniTaskRow
          title="Pick up brass from Vidal"
          due={{ label: "3 days", color: "var(--color-text-secondary)" }}
        />
      </div>
    </div>
  );
}

function SectionStrip({ label, dot, count, highlight }: { label: string; dot: string; count: number; highlight?: boolean }) {
  return (
    <div
      className={highlight ? "tk-section-today" : ""}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "3px 6px 2px",
        background: "var(--color-surface-sunken)",
        borderTop: "0.5px solid var(--color-border)",
        borderBottom: "0.5px solid var(--color-border)",
      }}
    >
      <span style={{ width: 4, height: 4, borderRadius: 99, background: dot, flexShrink: 0 }} />
      <span style={{
        fontSize: 7, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.07em", color: "var(--color-grey)",
      }}>{label}</span>
      <span style={{ fontSize: 7, color: "var(--color-grey)" }}>{count}</span>
    </div>
  );
}

// ─── Slide 3: project linkage — task linked to a project, rolls up ──────────
export function ProjectLinkage() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes tk-link-fly {
          0%, 12%  { opacity: 0; transform: translate(-20px, 12px) scale(0.6); }
          24%, 34% { opacity: 1; transform: translate(0, 0) scale(1); }
          36%, 60% { opacity: 1; transform: translate(0, 0) scale(1); }
          70%, 88% { opacity: 0.55; transform: translate(86px, -42px) scale(0.7); }
          92%,100% { opacity: 0; transform: translate(86px, -42px) scale(0.7); }
        }
        @keyframes tk-count-bump {
          0%, 64%   { transform: scale(1); color: var(--color-grey); }
          72%, 80%  { transform: scale(1.4); color: var(--color-sage); }
          88%, 100% { transform: scale(1); color: var(--color-sage); }
        }
        .tk-link    { animation: tk-link-fly  5.6s ease-in-out infinite; }
        .tk-count   { animation: tk-count-bump 5.6s ease-in-out infinite; display: inline-block; transform-origin: center; }
      `}</style>

      <div style={{ display: "flex", gap: 10, width: 290, alignItems: "flex-start" }}>
        {/* Left: tasks list */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{
            fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--color-grey)", paddingLeft: 4, marginBottom: 2,
          }}>Today</div>
          <MiniTaskRow
            title="Confirm photographer"
            due={{ label: "Today", color: "#a07800" }}
            link={{ label: "Brass console", icon: "project" }}
          />
          <div className="tk-link">
            <MiniTaskRow
              title="Order brass tubing"
              due={{ label: "Today", color: "#a07800" }}
              link={{ label: "Brass console", icon: "project" }}
            />
          </div>
          <MiniTaskRow
            title="Email Mendez re studio visit"
            due={{ label: "Today", color: "#a07800" }}
            link={{ label: "A. Mendez", icon: "contact" }}
          />
        </div>

        {/* Right: project card with task count rolling up */}
        <div style={{
          width: 100, flexShrink: 0,
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}>
          <div style={{ height: 2, background: "var(--color-sage)" }} />
          <div style={{ padding: "6px 7px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 8, fontWeight: 600, color: "var(--color-charcoal)", lineHeight: 1.2 }}>Brass console</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 6, padding: "1px 4px", borderRadius: 99, background: "#f0ebe0", color: "#b8860b", fontWeight: 500 }}>Furniture</span>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              borderTop: "0.5px solid var(--color-border)",
              paddingTop: 4, marginTop: 1,
            }}>
              <span style={{ fontSize: 7, color: "var(--color-grey)" }}>Open tasks</span>
              <span className="tk-count" style={{ fontSize: 9, fontWeight: 700, marginLeft: "auto" }}>3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: inline edits — check off, change date, change priority ────────
export function InlineEdits() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes tk-check {
          0%, 18%   { background: transparent; border-color: var(--color-border-strong); }
          24%, 44%  { background: var(--color-sage); border-color: var(--color-sage); }
          50%, 100% { background: transparent; border-color: var(--color-border-strong); }
        }
        @keyframes tk-check-mark {
          0%, 22%   { opacity: 0; }
          26%, 44%  { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes tk-check-strike {
          0%, 22%   { text-decoration: none; opacity: 1; }
          26%, 50%  { text-decoration: line-through; opacity: 0.5; }
          54%, 100% { text-decoration: none; opacity: 1; }
        }
        @keyframes tk-pop {
          0%, 52%   { opacity: 0; transform: translateY(-2px) scale(0.92); pointer-events: none; }
          58%, 76%  { opacity: 1; transform: translateY(0) scale(1); }
          82%, 100% { opacity: 0; transform: translateY(-2px) scale(0.92); pointer-events: none; }
        }
        @keyframes tk-prio-switch {
          0%, 60%   { background: rgba(232,197,71,0.18); color: #a07800; }
          80%, 100% { background: rgba(220,62,13,0.10); color: var(--color-red-orange); }
        }
        @keyframes tk-prio-dot {
          0%, 60%   { background: #b8860b; }
          80%, 100% { background: var(--color-red-orange); }
        }
        @keyframes tk-prio-label {
          0%, 60%   { opacity: 1; }
          70%, 100% { opacity: 0; }
        }
        @keyframes tk-prio-label-new {
          0%, 65%   { opacity: 0; }
          80%, 100% { opacity: 1; }
        }
        .tk-checkbox    { animation: tk-check 6s ease-in-out infinite; }
        .tk-check-mark  { animation: tk-check-mark 6s ease-in-out infinite; }
        .tk-strike      { animation: tk-check-strike 6s ease-in-out infinite; }
        .tk-pop         { animation: tk-pop 6s ease-in-out infinite; }
        .tk-prio-chip   { animation: tk-prio-switch 6s ease-in-out infinite; }
        .tk-prio-dot    { animation: tk-prio-dot 6s steps(2) infinite; }
        .tk-prio-old    { animation: tk-prio-label 6s steps(2) infinite; }
        .tk-prio-new    { animation: tk-prio-label-new 6s steps(2) infinite; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, width: 268, position: "relative" }}>
        {/* Row 1: check-off cycle */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 8px",
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 6,
        }}>
          <div className="tk-checkbox" style={{
            width: 10, height: 10, borderRadius: 3, flexShrink: 0,
            border: "1.5px solid var(--color-border-strong)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg className="tk-check-mark" width="6" height="5" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="tk-strike" style={{ flex: 1, fontSize: 9, color: "var(--color-charcoal)" }}>
            Order brass tubing
          </span>
        </div>

        {/* Row 2: date picker pop */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 8px",
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 6,
          position: "relative",
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: 3, flexShrink: 0,
            border: "1.5px solid var(--color-border-strong)",
          }} />
          <span style={{ flex: 1, fontSize: 9, color: "var(--color-charcoal)" }}>
            Schedule install with Mendez
          </span>
          <span style={{
            fontSize: 7, padding: "1px 5px", borderRadius: 99,
            background: "var(--color-surface-sunken)", color: "var(--color-grey)", fontWeight: 500,
          }}>
            <svg width="6" height="6" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ marginRight: 3, verticalAlign: -1 }}>
              <rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v2M11 1v2M2 7h12"/>
            </svg>
            Due
          </span>

          {/* Popover */}
          <div className="tk-pop" style={{
            position: "absolute",
            right: 4, top: "100%", marginTop: 4,
            width: 100,
            background: "var(--color-warm-white)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            padding: 5,
            zIndex: 5,
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            {["Today", "Tomorrow", "Next week"].map((s, i) => (
              <span key={s} style={{
                fontSize: 7, padding: "2px 5px", borderRadius: 4,
                background: i === 1 ? "var(--color-sage)" : "transparent",
                color: i === 1 ? "white" : "var(--color-grey)",
                fontWeight: i === 1 ? 600 : 400,
              }}>{s}</span>
            ))}
          </div>
        </div>

        {/* Row 3: priority chip switching */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 8px",
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 6,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: 3, flexShrink: 0,
            border: "1.5px solid var(--color-border-strong)",
          }} />
          <span style={{ flex: 1, fontSize: 9, color: "var(--color-charcoal)" }}>
            Submit grant draft
          </span>
          <span className="tk-prio-chip" style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 7, padding: "1px 5px", borderRadius: 99,
            fontWeight: 500, flexShrink: 0, position: "relative",
            minWidth: 36,
          }}>
            <span className="tk-prio-dot" style={{ width: 4, height: 4, borderRadius: 99, background: "#b8860b" }} />
            <span className="tk-prio-old">Med</span>
            <span className="tk-prio-new">High</span>
          </span>
        </div>
      </div>
    </div>
  );
}
