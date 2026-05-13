"use client";

// Lightweight CSS/SVG animations for the Projects intro modal slides.
// Designed to loop indefinitely so the user can pause on a slide and the
// motion keeps communicating the idea. Visual language tries to mirror
// the actual Projects module — same status accent bar, same chip styles,
// same tab nav, same property rows — so the slides preview the real UI.

import { Maximize2, FileText, CheckSquare, Users, FolderOpen } from "lucide-react";

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ── Real project card (matches ProjectCard composition) ──────────────────────
function MiniProjectCard({
  status, statusColor, title, type, priority = { label: "Med", bg: "rgba(232,197,71,0.15)", color: "#a07800" },
  dragging = false, dim = false, style = {},
}: {
  status: string;
  statusColor: string;
  title: string;
  type?: { label: string; bg: string; color: string };
  priority?: { label: string; bg: string; color: string };
  dragging?: boolean;
  dim?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 8,
        boxShadow: dragging ? "0 4px 14px rgba(0,0,0,0.14)" : "0 1px 3px rgba(0,0,0,0.06)",
        overflow: "hidden",
        opacity: dim ? 0.55 : 1,
        ...style,
      }}
    >
      <div style={{ height: 2, background: statusColor }} />
      <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: "var(--color-charcoal)", lineHeight: 1.2 }}>{title}</span>
          <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 99, background: priority.bg, color: priority.color, fontWeight: 500 }}>
            {priority.label}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {type && (
            <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 99, background: type.bg, color: type.color, fontWeight: 500 }}>
              {type.label}
            </span>
          )}
          <span style={{ fontSize: 7, color: "var(--color-grey)", marginLeft: "auto" }}>{status}</span>
        </div>
        <div style={{ height: 2, borderRadius: 999, background: "var(--color-border)", marginTop: 1 }}>
          <div style={{ width: "60%", height: "100%", background: "var(--color-sage)", borderRadius: 999 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 1: card materializes + counter ticks 0 → 1 ────────────────────────
export function CardMaterialize() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pj-fadein   { 0% { opacity:0; transform: scale(0.92) translateY(8px); } 100% { opacity:1; transform: scale(1) translateY(0); } }
        @keyframes pj-statuspulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.4); } }
        @keyframes pj-counter  { 0% { transform: translateY(0); } 40%,100% { transform: translateY(-100%); } }
        .pj-mat-loop { animation: pj-fadein 0.6s ease-out 0.2s both, pj-fadein 0.6s ease-out 4.2s both reverse; }
        .pj-counter-track { animation: pj-counter 5s ease-in-out infinite; }
        .pj-status-pulse { animation: pj-statuspulse 2.5s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 240 }}>
        <div className="pj-mat-loop">
          <MiniProjectCard
            status="In progress"
            statusColor="var(--color-sage)"
            title="Brass console — Foster"
            type={{ label: "Furniture", bg: "#f0ebe0", color: "#b8860b" }}
            priority={{ label: "High", bg: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" }}
          />
        </div>

        <div style={{
          background: "var(--color-cream)", borderRadius: 8, padding: "7px 11px",
          display: "flex", alignItems: "center", gap: 10,
          border: "0.5px solid var(--color-border)",
        }}>
          <span style={{ fontSize: 10, color: "var(--color-grey)" }}>Active projects</span>
          <div style={{ marginLeft: "auto", overflow: "hidden", height: 16 }}>
            <div className="pj-counter-track" style={{ display: "flex", flexDirection: "column", lineHeight: "16px" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-charcoal)" }}>0</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-sage)" }}>1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: board view — multiple cards, organize via drag ─────────────────
export function DragColumns() {
  // Two columns; a card drags from Planning → In progress on loop.
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pj-dragmove {
          0%, 12%   { transform: translate(0,0) rotate(0deg) scale(1); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
          22%       { transform: translate(0,-3px) rotate(-1deg) scale(1.02); box-shadow: 0 6px 16px rgba(0,0,0,0.16); }
          55%, 68%  { transform: translate(106px, 28px) rotate(-1.2deg) scale(1.02); box-shadow: 0 8px 18px rgba(0,0,0,0.18); }
          80%, 100% { transform: translate(106px, 28px) rotate(0deg) scale(1); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        }
        @keyframes pj-dropzone {
          0%, 50%   { background: transparent; border-color: transparent; }
          55%, 70%  { background: rgba(155,163,122,0.10); border-color: var(--color-sage); }
          80%, 100% { background: transparent; border-color: transparent; }
        }
        @keyframes pj-statusdot {
          0%, 65%   { background: var(--color-grey); }
          75%, 100% { background: var(--color-sage); }
        }
        @keyframes pj-statuslabel-old {
          0%, 60%   { opacity: 1; }
          70%, 100% { opacity: 0; }
        }
        @keyframes pj-statuslabel-new {
          0%, 65%   { opacity: 0; }
          75%, 100% { opacity: 1; }
        }
        .pj-drag        { animation: pj-dragmove 5.5s ease-in-out infinite; position: relative; z-index: 2; }
        .pj-dropzone    { animation: pj-dropzone 5.5s ease-in-out infinite; }
        .pj-statusdot   { animation: pj-statusdot 5.5s steps(2) infinite; }
        .pj-status-old  { animation: pj-statuslabel-old 5.5s steps(2) infinite; }
        .pj-status-new  { animation: pj-statuslabel-new 5.5s steps(2) infinite; position: absolute; inset: 0; }
      `}</style>

      <div style={{ display: "flex", gap: 8, width: 280 }}>
        {/* Planning column */}
        <div style={columnStyle}>
          <div style={colHeader}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--color-grey)" }} />
            Planning
          </div>
          <div className="pj-drag">
            <MiniProjectCard
              status=""
              statusColor="var(--color-grey)"
              title="Brass console"
              type={{ label: "Furniture", bg: "#f0ebe0", color: "#b8860b" }}
            />
          </div>
          <MiniProjectCard
            status=""
            statusColor="var(--color-grey)"
            title="Ash dining chair"
            type={{ label: "Furniture", bg: "#f0ebe0", color: "#b8860b" }}
            priority={{ label: "Low", bg: "rgba(155,163,122,0.12)", color: "#5a7040" }}
            dim
            style={{ marginTop: 4 }}
          />
        </div>

        {/* In progress column */}
        <div style={columnStyle}>
          <div style={colHeader}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: "var(--color-sage)" }} />
            In progress
          </div>
          <MiniProjectCard
            status=""
            statusColor="var(--color-sage)"
            title="Pendant edition"
            type={{ label: "Lighting", bg: "#f0ebe0", color: "#b8860b" }}
            priority={{ label: "High", bg: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" }}
          />
          <div className="pj-dropzone" style={{
            marginTop: 4,
            height: 38,
            borderRadius: 8,
            border: "1px dashed transparent",
            transition: "background 0.2s ease, border-color 0.2s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: scrim open → expand to fullscreen → collapse back ──────────────
export function ScrimOpen() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pj-scrim-flow {
          0%        { transform: translateX(110%); }
          15%       { transform: translateX(110%); }
          30%, 55%  { transform: translateX(0); width: 60%; }
          70%, 85%  { transform: translateX(0); width: 100%; }
          100%      { transform: translateX(0); width: 60%; }
        }
        @keyframes pj-list-fade {
          0%        { opacity: 1; }
          30%, 55%  { opacity: 1; }
          70%, 85%  { opacity: 0; }
          100%      { opacity: 1; }
        }
        @keyframes pj-tap {
          0%, 15%   { transform: scale(1); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
          18%       { transform: scale(0.97); box-shadow: 0 0 0 4px rgba(155,163,122,0.30); }
          25%, 100% { transform: scale(1); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
        }
        @keyframes pj-maximize-pulse {
          0%, 55%   { background: transparent; }
          60%, 65%  { background: rgba(155,163,122,0.20); }
          70%, 100% { background: transparent; }
        }
        .pj-scrim-anim { animation: pj-scrim-flow 6s ease-in-out infinite; }
        .pj-list-anim  { animation: pj-list-fade  6s ease-in-out infinite; }
        .pj-tap        { animation: pj-tap        6s ease-in-out infinite; }
        .pj-max-pulse  { animation: pj-maximize-pulse 6s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 320, height: 170, position: "relative", overflow: "hidden", borderRadius: 8 }}>
        {/* Background list of cards */}
        <div className="pj-list-anim" style={{
          position: "absolute", inset: 0, padding: 6,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
        }}>
          <div className="pj-tap">
            <MiniProjectCard
              status="In progress"
              statusColor="var(--color-sage)"
              title="Brass console"
              type={{ label: "Furniture", bg: "#f0ebe0", color: "#b8860b" }}
            />
          </div>
          <MiniProjectCard
            status="Planning"
            statusColor="var(--color-grey)"
            title="Ash chair"
            type={{ label: "Furniture", bg: "#f0ebe0", color: "#b8860b" }}
            dim
          />
          <MiniProjectCard
            status="In progress"
            statusColor="var(--color-sage)"
            title="Pendant edition"
            type={{ label: "Lighting", bg: "#f0ebe0", color: "#b8860b" }}
            dim
          />
          <MiniProjectCard
            status="On hold"
            statusColor="var(--color-warm-yellow)"
            title="Marble vessel"
            type={{ label: "Sculpture", bg: "#f0ebe0", color: "#b8860b" }}
            dim
          />
        </div>

        {/* Scrim panel */}
        <div className="pj-scrim-anim" style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          background: "var(--color-off-white)",
          borderLeft: "0.5px solid var(--color-border)",
          boxShadow: "-6px 0 18px rgba(0,0,0,0.10)",
          padding: 8,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {/* Mini scrim header with maximize button */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-charcoal)" }}>Brass console</span>
            <span className="pj-max-pulse" style={{
              width: 16, height: 16, borderRadius: 5,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s ease",
            }}>
              <Maximize2 size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 99, background: "rgba(155,163,122,0.18)", color: "var(--color-sage)", fontWeight: 500 }}>In progress</span>
            <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 99, background: "#f0ebe0", color: "#b8860b", fontWeight: 500 }}>Furniture</span>
          </div>
          <div style={{ borderTop: "0.5px solid var(--color-border)", paddingTop: 4 }}>
            <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-grey)", marginBottom: 3 }}>Timeline</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#6b6860" }}>
              <span>Start · Apr 12</span><span>Due · May 30</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: inside the scrim — canvas, tasks, notes, contacts, files ──────
export function FormFill() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pj-tab-cycle {
          0%, 19%   { background: rgba(155,163,122,0.16); color: var(--color-charcoal); }
          20%, 100% { background: transparent; color: var(--color-grey); }
        }
        @keyframes pj-pane-cycle {
          0%, 19%   { opacity: 1; transform: translateY(0); }
          21%, 100% { opacity: 0; transform: translateY(4px); }
        }
        .pj-tab-0  { animation: pj-tab-cycle  5s steps(1, end) infinite; animation-delay: 0s; }
        .pj-tab-1  { animation: pj-tab-cycle  5s steps(1, end) infinite; animation-delay: -4s; }
        .pj-tab-2  { animation: pj-tab-cycle  5s steps(1, end) infinite; animation-delay: -3s; }
        .pj-tab-3  { animation: pj-tab-cycle  5s steps(1, end) infinite; animation-delay: -2s; }
        .pj-tab-4  { animation: pj-tab-cycle  5s steps(1, end) infinite; animation-delay: -1s; }
        .pj-pane-0 { animation: pj-pane-cycle 5s ease-in-out infinite; animation-delay: 0s; }
        .pj-pane-1 { animation: pj-pane-cycle 5s ease-in-out infinite; animation-delay: -4s; }
        .pj-pane-2 { animation: pj-pane-cycle 5s ease-in-out infinite; animation-delay: -3s; }
        .pj-pane-3 { animation: pj-pane-cycle 5s ease-in-out infinite; animation-delay: -2s; }
        .pj-pane-4 { animation: pj-pane-cycle 5s ease-in-out infinite; animation-delay: -1s; }
      `}</style>

      <div style={{
        width: 300, height: 168,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)" }}>Brass console</span>
          <div style={{ display: "flex", gap: 3 }}>
            <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 99, background: "rgba(155,163,122,0.18)", color: "var(--color-sage)", fontWeight: 500 }}>In progress</span>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ display: "flex", gap: 3 }}>
          {[
            { Icon: FileText,    label: "Canvas",   cls: "pj-tab-0" },
            { Icon: CheckSquare, label: "Tasks",    cls: "pj-tab-1" },
            { Icon: Users,       label: "Contacts", cls: "pj-tab-2" },
            { Icon: FileText,    label: "Notes",    cls: "pj-tab-3" },
            { Icon: FolderOpen,  label: "Files",    cls: "pj-tab-4" },
          ].map((t) => (
            <div key={t.label} className={t.cls} style={{
              display: "flex", alignItems: "center", gap: 3,
              padding: "3px 6px", borderRadius: 5,
              fontSize: 8, fontWeight: 500,
              background: "transparent", color: "var(--color-grey)",
              transition: "background 0.15s ease, color 0.15s ease",
            }}>
              <t.Icon size={8} strokeWidth={1.75} />
              <span>{t.label}</span>
            </div>
          ))}
        </div>

        {/* Content pane — five layers, only one visible at a time */}
        <div style={{ flex: 1, position: "relative", background: "var(--color-cream)", borderRadius: 6, padding: "6px 8px" }}>
          <div className="pj-pane-0" style={paneStyle}>
            <div style={paneLine} />
            <div style={{ ...paneLine, width: "80%" }} />
            <div style={{ ...paneLine, width: "55%" }} />
          </div>
          <div className="pj-pane-1" style={paneStyle}>
            {[0,1,2].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, border: "1px solid var(--color-grey)" }} />
                <span style={{ ...paneLine, flex: 1 }} />
              </div>
            ))}
          </div>
          <div className="pj-pane-2" style={paneStyle}>
            {["A.M.","J.K."].map(initial => (
              <div key={initial} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 99, background: "var(--color-sage)", color: "white", fontSize: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>{initial}</span>
                <span style={{ ...paneLine, flex: 1 }} />
              </div>
            ))}
          </div>
          <div className="pj-pane-3" style={paneStyle}>
            <div style={paneLine} />
            <div style={{ ...paneLine, width: "65%" }} />
          </div>
          <div className="pj-pane-4" style={paneStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <FolderOpen size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
              <span style={{ ...paneLine, flex: 1, maxWidth: 90 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <FolderOpen size={9} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
              <span style={{ ...paneLine, flex: 1, maxWidth: 70 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const columnStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  borderRadius: 8,
  padding: "6px 6px 8px",
  display: "flex", flexDirection: "column", gap: 4,
};

const colHeader: React.CSSProperties = {
  fontSize: 8, fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-grey)",
  paddingBottom: 4,
  borderBottom: "0.5px solid var(--color-border)",
  display: "flex", alignItems: "center", gap: 5,
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
