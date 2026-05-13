"use client";

// Lightweight CSS/SVG animations for the Projects intro modal slides.
// These are illustrative — not pixel-accurate to the real UI. Designed to
// loop indefinitely so the user can pause on a slide and the motion keeps
// communicating the idea.

import { Layers, Clock, FileText, Users, FolderOpen, Receipt } from "lucide-react";

const cardBox: React.CSSProperties = {
  background: "var(--color-off-white)",
  border: "0.5px solid var(--color-border)",
  borderRadius: 8,
  padding: "9px 11px",
  display: "flex", flexDirection: "column", gap: 5,
  width: "100%",
};

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

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 260 }}>
        <div className="pj-mat-loop" style={cardBox}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="pj-status-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-warm-yellow)" }} />
            <span style={{ fontSize: 10, color: "var(--color-grey)" }}>In progress</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>Brass console — Foster</div>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={chip}>Furniture</span>
            <span style={{ ...chip, marginLeft: "auto", background: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" }}>Due in 8d</span>
          </div>
        </div>

        <div style={{
          background: "var(--color-cream)", borderRadius: 8, padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 10,
          border: "0.5px solid var(--color-border)",
        }}>
          <span style={{ fontSize: 11, color: "var(--color-grey)" }}>Active projects</span>
          <div style={{ marginLeft: "auto", overflow: "hidden", height: 18 }}>
            <div className="pj-counter-track" style={{ display: "flex", flexDirection: "column", lineHeight: "18px" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-charcoal)" }}>0</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-sage)" }}>1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: form fields typing themselves in ───────────────────────────────
export function FormFill() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pj-cursor { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        @keyframes pj-typetitle { 0% { width: 0; } 30% { width: 100%; } 70% { width: 100%; } 100% { width: 100%; } }
        @keyframes pj-typechip  { 0%, 35% { background: var(--color-off-white); color: #6b6860; border-color: var(--color-border); }
                                  45%, 100% { background: var(--color-sage); color: var(--color-warm-white); border-color: var(--color-sage); } }
        @keyframes pj-cardpop   { 0%, 70% { opacity: 0; transform: scale(0.92) translateY(10px); }
                                  85%, 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .pj-cursor   { animation: pj-cursor 0.9s steps(2) infinite; }
        .pj-typetitle{ animation: pj-typetitle 5s ease-in-out infinite; overflow: hidden; white-space: nowrap; display: inline-block; }
        .pj-typechip { animation: pj-typechip  5s ease-in-out infinite; }
        .pj-cardpop  { animation: pj-cardpop   5s ease-in-out infinite; }
      `}</style>

      <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{
          background: "var(--color-off-white)", borderRadius: 10,
          border: "0.5px solid var(--color-border)", padding: "12px 14px",
          display: "flex", flexDirection: "column", gap: 10,
          boxShadow: "0 4px 18px rgba(31,33,26,0.08)",
        }}>
          <span style={fieldLabel}>Title</span>
          <div style={{ display: "flex", alignItems: "center", gap: 1, fontSize: 12, fontWeight: 500, color: "var(--color-charcoal)" }}>
            <span className="pj-typetitle">Brass console</span>
            <span className="pj-cursor" style={{ display: "inline-block", width: 1, height: 14, background: "var(--color-charcoal)" }} />
          </div>
          <span style={fieldLabel}>Type</span>
          <div style={{ display: "flex", gap: 5 }}>
            {(["Furniture","Lighting","Ceramics"] as const).map((t, i) => (
              <span key={t} className={i === 0 ? "pj-typechip" : ""} style={chip}>{t}</span>
            ))}
          </div>
        </div>

        <div className="pj-cardpop" style={cardBox}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-grey)" }} />
            <span style={{ fontSize: 10, color: "var(--color-grey)" }}>Planning</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>Brass console</div>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={chip}>Furniture</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 3: card click → scrim slides in with cycling tabs ─────────────────
export function ScrimOpen() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pj-scrimslide { 0% { transform: translateX(110%); }
                                   40%, 100% { transform: translateX(0); } }
        @keyframes pj-cardshrink { 0% { width: 100%; }
                                   40%, 100% { width: 32%; } }
        @keyframes pj-tabcycle   { 0%, 19% { background: var(--color-sage); color: var(--color-warm-white); }
                                   20%, 100% { background: transparent; color: var(--color-grey); } }
        .pj-scrim    { animation: pj-scrimslide 5s ease-in-out infinite; }
        .pj-cardshrink { animation: pj-cardshrink 5s ease-in-out infinite; }
        .pj-tab-0 { animation: pj-tabcycle 5s ease-in-out infinite; animation-delay: 0s;    }
        .pj-tab-1 { animation: pj-tabcycle 5s ease-in-out infinite; animation-delay: -4s;   }
        .pj-tab-2 { animation: pj-tabcycle 5s ease-in-out infinite; animation-delay: -3s;   }
        .pj-tab-3 { animation: pj-tabcycle 5s ease-in-out infinite; animation-delay: -2s;   }
        .pj-tab-4 { animation: pj-tabcycle 5s ease-in-out infinite; animation-delay: -1s;   }
      `}</style>

      <div style={{ width: 320, height: 170, display: "flex", gap: 8, overflow: "hidden", position: "relative" }}>
        <div className="pj-cardshrink" style={{ ...cardBox, height: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-warm-yellow)" }} />
            <span style={{ fontSize: 9, color: "var(--color-grey)" }}>In progress</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-charcoal)" }}>Brass console</div>
        </div>

        <div className="pj-scrim" style={{
          flex: 1,
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 10, padding: "10px 12px",
          display: "flex", flexDirection: "column", gap: 8,
          boxShadow: "-4px 0 18px rgba(31,33,26,0.08)",
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)" }}>Brass console</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { Icon: Layers,     label: "Tasks",   cls: "pj-tab-0" },
              { Icon: Clock,      label: "Time",    cls: "pj-tab-1" },
              { Icon: FileText,   label: "Notes",   cls: "pj-tab-2" },
              { Icon: Users,      label: "Contacts",cls: "pj-tab-3" },
              { Icon: Receipt,    label: "Finance", cls: "pj-tab-4" },
            ].map((t) => (
              <div key={t.label} className={t.cls} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 7px", borderRadius: 6,
                fontSize: 9, fontWeight: 500,
                border: "0.5px solid var(--color-border)",
                background: "transparent", color: "var(--color-grey)",
              }}>
                <t.Icon size={9} strokeWidth={1.75} />
                <span>{t.label}</span>
              </div>
            ))}
          </div>
          <div style={{
            background: "var(--color-cream)", borderRadius: 6, padding: "6px 8px",
            fontSize: 9, color: "var(--color-grey)",
          }}>
            <FolderOpen size={9} strokeWidth={1.75} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
            All your project work lives here
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: card drags between columns ─────────────────────────────────────
export function DragColumns() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes pj-dragmove { 0%, 10%   { transform: translate(0,0) rotate(0); }
                                 50%, 60%  { transform: translate(118px, 0) rotate(-1.2deg); }
                                 95%, 100% { transform: translate(118px, 0) rotate(0); } }
        @keyframes pj-statuscolor { 0%, 50% { background: var(--color-grey); }
                                    65%, 100% { background: var(--color-warm-yellow); } }
        @keyframes pj-statustext { 0%, 50% { content: "Planning"; }
                                   65%, 100% { content: "In progress"; } }
        .pj-drag        { animation: pj-dragmove 4.8s ease-in-out infinite; }
        .pj-status-dot  { animation: pj-statuscolor 4.8s steps(2) infinite; }
        .pj-status-text::after { content: "Planning"; animation: pj-statustext 4.8s steps(2) infinite; }
      `}</style>

      <div style={{ display: "flex", gap: 6, width: 280, height: 140 }}>
        <div style={column}>
          <div style={colHeader}>Planning</div>
          <div className="pj-drag" style={{ ...cardBox, padding: "7px 9px", position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div className="pj-status-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-grey)" }} />
              <span className="pj-status-text" style={{ fontSize: 8, color: "var(--color-grey)" }} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-charcoal)" }}>Brass console</div>
          </div>
        </div>
        <div style={column}>
          <div style={colHeader}>In progress</div>
          <div style={{ height: 4 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Shared inline styles ────────────────────────────────────────────────────

const animationFrame: React.CSSProperties = {
  width: "100%", height: 180,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-cream)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

const chip: React.CSSProperties = {
  fontSize: 9, fontWeight: 500,
  padding: "2px 7px", borderRadius: 999,
  background: "var(--color-off-white)",
  border: "0.5px solid var(--color-border)",
  color: "#6b6860",
  display: "inline-block",
};

const fieldLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-grey)",
};

const column: React.CSSProperties = {
  flex: 1,
  background: "var(--color-warm-white)",
  border: "0.5px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 7px",
  display: "flex", flexDirection: "column", gap: 6,
};

const colHeader: React.CSSProperties = {
  fontSize: 9, fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-grey)",
  paddingBottom: 4,
  borderBottom: "0.5px solid var(--color-border)",
};
