"use client";

// Lightweight CSS animations for the Contacts intro modal slides. Same scale
// and visual language as ProjectAnimations so the two walkthroughs feel like
// one family. Each loop demonstrates a distinct affordance of the Contacts
// module: alive relationship state, stale-contact surfacing, tag filtering,
// and the relationship-file detail panel.

import { Mail, Phone, MessageSquare, FileText, Calendar as CalendarIcon, Folder, CheckSquare } from "lucide-react";

const animationFrame: React.CSSProperties = {
  width: "100%", height: 200,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--color-surface-sunken)",
  borderRadius: 10,
  overflow: "hidden",
  position: "relative",
};

// ── Mini contact row matching the real ContactsClient layout ────────────────
function MiniContactRow({
  initials, name, sub, tag, status = "active", lastContact,
  isLead = false, dim = false, hidden = false, style = {},
}: {
  initials:    string;
  name:        string;
  sub?:        string;
  tag?:        { label: string; bg: string; color: string };
  status?:     "active" | "inactive" | "former";
  lastContact?: { label: string; color: string };
  isLead?:     boolean;
  dim?:        boolean;
  hidden?:     boolean;
  style?:      React.CSSProperties;
}) {
  const statusDot =
    status === "active"   ? "var(--color-sage)" :
    status === "inactive" ? "var(--color-grey)" :
    "#6d4fa3";
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 7,
        padding: "5px 7px",
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 6,
        opacity: hidden ? 0 : dim ? 0.45 : 1,
        transition: "opacity 0.25s ease",
        ...style,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: 99, flexShrink: 0,
        background: isLead ? "rgba(184,134,11,0.12)" : "var(--color-cream)",
        border: "0.5px solid var(--color-border)",
        color: isLead ? "#b8860b" : "#6b6860",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 7, fontWeight: 700,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: "var(--color-charcoal)" }}>{name}</span>
          {isLead && (
            <span style={{
              fontSize: 6, padding: "0 4px", borderRadius: 99,
              background: "rgba(184,134,11,0.12)", color: "#b8860b", fontWeight: 600,
            }}>Lead</span>
          )}
        </div>
        {sub && <span style={{ fontSize: 7, color: "var(--color-grey)" }}>{sub}</span>}
      </div>
      {tag && (
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 99,
          background: tag.bg, color: tag.color, fontWeight: 500, flexShrink: 0,
        }}>
          {tag.label}
        </span>
      )}
      <span style={{ width: 4, height: 4, borderRadius: 99, background: statusDot, flexShrink: 0 }} />
      {lastContact && (
        <span style={{ fontSize: 7, color: lastContact.color, fontWeight: 500, minWidth: 32, textAlign: "right", flexShrink: 0 }}>
          {lastContact.label}
        </span>
      )}
    </div>
  );
}

// ─── Slide 1: a network materializes — rows fade in with rich state ─────────
export function NetworkMaterialize() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ct-row-in {
          0%, 100% { opacity: 0; transform: translateY(4px); }
          12%, 88% { opacity: 1; transform: translateY(0); }
        }
        .ct-row-0 { animation: ct-row-in 5.2s ease-out infinite; animation-delay: 0s; }
        .ct-row-1 { animation: ct-row-in 5.2s ease-out infinite; animation-delay: 0.18s; }
        .ct-row-2 { animation: ct-row-in 5.2s ease-out infinite; animation-delay: 0.36s; }
        .ct-row-3 { animation: ct-row-in 5.2s ease-out infinite; animation-delay: 0.54s; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, width: 260 }}>
        <div className="ct-row-0">
          <MiniContactRow
            initials="JK" name="Jenna Kim" sub="Friedman Gallery"
            tag={{ label: "gallery", bg: "rgba(37,99,171,0.10)", color: "#2563ab" }}
            status="active"
            lastContact={{ label: "Today", color: "var(--color-sage)" }}
          />
        </div>
        <div className="ct-row-1">
          <MiniContactRow
            initials="AM" name="Alex Mendez" sub="Collector"
            tag={{ label: "collector", bg: "rgba(109,79,163,0.10)", color: "#6d4fa3" }}
            status="active"
            lastContact={{ label: "2w ago", color: "var(--color-charcoal)" }}
          />
        </div>
        <div className="ct-row-2">
          <MiniContactRow
            initials="SR" name="Sasha Reyes" sub="Studio Mag"
            tag={{ label: "press", bg: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" }}
            status="active"
            isLead
            lastContact={{ label: "5w ago", color: "#b8860b" }}
          />
        </div>
        <div className="ct-row-3">
          <MiniContactRow
            initials="DV" name="Dario Vidal" sub="Vidal Steel"
            tag={{ label: "supplier", bg: "rgba(184,134,11,0.10)", color: "#b8860b" }}
            status="inactive"
            lastContact={{ label: "3mo ago", color: "var(--color-red-orange)" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Slide 2: stale contacts surface — last-contact pill ages through colors
export function StaleSurface() {
  return (
    <div style={animationFrame}>
      <style>{`
        /* Top contact's last-contact pill ages on loop: today (sage) → 2w
         * (charcoal) → 5w (gold) → 2mo (red-orange). Conveys auto-aging. */
        @keyframes ct-age-bg {
          0%, 18%  { background: rgba(155,163,122,0.15); color: var(--color-sage); }
          22%, 40% { background: rgba(31,33,26,0.06);    color: var(--color-charcoal); }
          44%, 62% { background: rgba(232,197,71,0.18);  color: #a07800; }
          66%, 88% { background: rgba(220,62,13,0.12);   color: var(--color-red-orange); }
          92%,100% { background: rgba(155,163,122,0.15); color: var(--color-sage); }
        }
        @keyframes ct-age-label {
          0%, 18%  { content: "Today"; }
          22%, 40% { content: "2w ago"; }
          44%, 62% { content: "5w ago"; }
          66%, 88% { content: "2mo ago"; }
        }
        @keyframes ct-bell-pulse {
          0%, 40%  { opacity: 0; transform: scale(0.7); }
          44%, 88% { opacity: 1; transform: scale(1); }
          92%,100% { opacity: 0; transform: scale(0.7); }
        }
        .ct-age-pill {
          font-size: 8px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 99px;
          animation: ct-age-bg 6.4s ease-in-out infinite;
        }
        .ct-bell {
          animation: ct-bell-pulse 6.4s ease-in-out infinite;
        }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 280 }}>
        <div style={{
          fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
          color: "var(--color-grey)", paddingLeft: 4, marginBottom: 2,
        }}>
          Needs a follow-up
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 7, padding: "6px 8px",
          background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 6,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 99, flexShrink: 0,
            background: "var(--color-cream)", border: "0.5px solid var(--color-border)",
            color: "#6b6860", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 700,
          }}>EM</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: "var(--color-charcoal)" }}>
              Eli Maron
            </div>
            <span style={{ fontSize: 7, color: "var(--color-grey)" }}>Maron Studio · gallery</span>
          </div>
          <div className="ct-bell" style={{
            width: 14, height: 14, borderRadius: 99,
            background: "rgba(220,62,13,0.14)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="7" height="7" viewBox="0 0 16 16" fill="var(--color-red-orange)">
              <path d="M8 1.5a4 4 0 00-4 4v2.6L2.6 11h10.8L12 8.1V5.5a4 4 0 00-4-4zM6.5 12.5a1.5 1.5 0 003 0h-3z"/>
            </svg>
          </div>
          <span className="ct-age-pill">aging…</span>
        </div>

        <div style={{ height: 1, background: "var(--color-border)", margin: "2px 0" }} />

        <MiniContactRow
          initials="NA" name="Nia Akhtar" sub="Akhtar Projects"
          tag={{ label: "gallery", bg: "rgba(37,99,171,0.10)", color: "#2563ab" }}
          status="active"
          lastContact={{ label: "6d ago", color: "var(--color-sage)" }}
        />
        <MiniContactRow
          initials="RC" name="Reza Cho" sub="Architect"
          tag={{ label: "client", bg: "rgba(61,107,79,0.10)", color: "#3d6b4f" }}
          status="active"
          lastContact={{ label: "3w ago", color: "var(--color-charcoal)" }}
        />
      </div>
    </div>
  );
}

// ─── Slide 3: tag chips filter the list ─────────────────────────────────────
export function TagFilter() {
  return (
    <div style={animationFrame}>
      <style>{`
        /* Two cycles per loop: highlight a tag, hide non-matching rows,
         * then move on to the next tag. */
        @keyframes ct-tag-gallery {
          0%, 18%   { background: #2563ab; color: white; border-color: #2563ab; }
          22%, 100% { background: transparent; color: #2563ab; border-color: rgba(37,99,171,0.34); }
        }
        @keyframes ct-tag-press {
          0%, 38%   { background: transparent; color: var(--color-red-orange); border-color: rgba(220,62,13,0.34); }
          42%, 58%  { background: var(--color-red-orange); color: white; border-color: var(--color-red-orange); }
          62%, 100% { background: transparent; color: var(--color-red-orange); border-color: rgba(220,62,13,0.34); }
        }
        @keyframes ct-tag-collector {
          0%, 78%   { background: transparent; color: #6d4fa3; border-color: rgba(109,79,163,0.34); }
          82%, 98%  { background: #6d4fa3; color: white; border-color: #6d4fa3; }
          100%      { background: transparent; color: #6d4fa3; border-color: rgba(109,79,163,0.34); }
        }
        /* Row visibility — each row stays visible only when its tag is the active filter. */
        @keyframes ct-show-gallery {
          0%, 18%   { opacity: 1; }
          22%, 100% { opacity: 0.32; }
        }
        @keyframes ct-show-press {
          0%, 38%   { opacity: 0.32; }
          42%, 58%  { opacity: 1; }
          62%, 100% { opacity: 0.32; }
        }
        @keyframes ct-show-collector {
          0%, 78%   { opacity: 0.32; }
          82%, 98%  { opacity: 1; }
          100%      { opacity: 0.32; }
        }
        .ct-tag-gallery   { animation: ct-tag-gallery   6.8s ease-in-out infinite; }
        .ct-tag-press     { animation: ct-tag-press     6.8s ease-in-out infinite; }
        .ct-tag-collector { animation: ct-tag-collector 6.8s ease-in-out infinite; }
        .ct-row-gallery   { animation: ct-show-gallery   6.8s ease-in-out infinite; }
        .ct-row-press     { animation: ct-show-press     6.8s ease-in-out infinite; }
        .ct-row-collector { animation: ct-show-collector 6.8s ease-in-out infinite; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 280 }}>
        {/* Tag strip */}
        <div style={{ display: "flex", gap: 4, paddingBottom: 6, borderBottom: "0.5px solid var(--color-border)" }}>
          <span style={tagPillBase}>All</span>
          <span style={tagPillBase} className="ct-tag-gallery">gallery</span>
          <span style={tagPillBase} className="ct-tag-press">press</span>
          <span style={tagPillBase} className="ct-tag-collector">collector</span>
          <span style={tagPillBase}>client</span>
        </div>

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="ct-row-gallery">
            <MiniContactRow
              initials="JK" name="Jenna Kim" sub="Friedman Gallery"
              tag={{ label: "gallery", bg: "rgba(37,99,171,0.10)", color: "#2563ab" }}
              lastContact={{ label: "Today", color: "var(--color-sage)" }}
            />
          </div>
          <div className="ct-row-press">
            <MiniContactRow
              initials="SR" name="Sasha Reyes" sub="Studio Mag"
              tag={{ label: "press", bg: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" }}
              lastContact={{ label: "1w", color: "var(--color-sage)" }}
            />
          </div>
          <div className="ct-row-collector">
            <MiniContactRow
              initials="AM" name="Alex Mendez" sub="Collector"
              tag={{ label: "collector", bg: "rgba(109,79,163,0.10)", color: "#6d4fa3" }}
              lastContact={{ label: "2w", color: "var(--color-charcoal)" }}
            />
          </div>
          <div className="ct-row-gallery">
            <MiniContactRow
              initials="NA" name="Nia Akhtar" sub="Akhtar Projects"
              tag={{ label: "gallery", bg: "rgba(37,99,171,0.10)", color: "#2563ab" }}
              lastContact={{ label: "4d", color: "var(--color-sage)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slide 4: detail panel — workspace nav cycles, activity timeline ────────
export function RelationshipFile() {
  return (
    <div style={animationFrame}>
      <style>{`
        @keyframes ct-nav-cycle {
          0%, 19%   { background: rgba(155,163,122,0.16); color: #5a7040; }
          20%, 100% { background: transparent; color: var(--color-grey); }
        }
        @keyframes ct-pane-cycle {
          0%, 19%   { opacity: 1; transform: translateY(0); }
          21%, 100% { opacity: 0; transform: translateY(4px); }
        }
        .ct-nav-0  { animation: ct-nav-cycle  5s steps(1, end) infinite; animation-delay: 0s; }
        .ct-nav-1  { animation: ct-nav-cycle  5s steps(1, end) infinite; animation-delay: -4s; }
        .ct-nav-2  { animation: ct-nav-cycle  5s steps(1, end) infinite; animation-delay: -3s; }
        .ct-nav-3  { animation: ct-nav-cycle  5s steps(1, end) infinite; animation-delay: -2s; }
        .ct-nav-4  { animation: ct-nav-cycle  5s steps(1, end) infinite; animation-delay: -1s; }
        .ct-pane-0 { animation: ct-pane-cycle 5s ease-in-out infinite; animation-delay: 0s; }
        .ct-pane-1 { animation: ct-pane-cycle 5s ease-in-out infinite; animation-delay: -4s; }
        .ct-pane-2 { animation: ct-pane-cycle 5s ease-in-out infinite; animation-delay: -3s; }
        .ct-pane-3 { animation: ct-pane-cycle 5s ease-in-out infinite; animation-delay: -2s; }
        .ct-pane-4 { animation: ct-pane-cycle 5s ease-in-out infinite; animation-delay: -1s; }
      `}</style>

      <div style={{
        width: 320, height: 178,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        display: "flex", overflow: "hidden",
      }}>
        {/* ── Left rail: avatar, name, status, tags, linked project ── */}
        <div style={{
          width: 122, flexShrink: 0,
          borderRight: "0.5px solid var(--color-border)",
          background: "var(--color-warm-white)",
          padding: "9px 9px 8px",
          display: "flex", flexDirection: "column", gap: 7,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 99, flexShrink: 0,
              background: "var(--color-cream)", border: "0.5px solid var(--color-border)",
              color: "#6b6860",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, fontWeight: 700,
            }}>JK</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-charcoal)", lineHeight: 1.2 }}>
              Jenna Kim
            </div>
          </div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 99, background: "rgba(155,163,122,0.18)", color: "var(--color-sage)", fontWeight: 500 }}>Active</span>
            <span style={{ fontSize: 7, padding: "1px 5px", borderRadius: 99, background: "rgba(37,99,171,0.10)", color: "#2563ab", fontWeight: 500 }}>gallery</span>
          </div>
          <div style={{ borderTop: "0.5px solid var(--color-border)", paddingTop: 6 }}>
            <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-grey)", marginBottom: 4 }}>Workspace</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {[
                { Icon: FileText,     label: "Canvas",   cls: "ct-nav-0" },
                { Icon: MessageSquare, label: "Activity", cls: "ct-nav-1" },
                { Icon: CheckSquare,  label: "Tasks",    cls: "ct-nav-2" },
                { Icon: FileText,     label: "Notes",    cls: "ct-nav-3" },
                { Icon: Folder,       label: "Files",    cls: "ct-nav-4" },
              ].map((t) => (
                <div key={t.label} className={t.cls} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 5px", borderRadius: 5,
                  fontSize: 9, fontWeight: 500,
                  background: "transparent", color: "var(--color-grey)",
                  transition: "background 0.15s ease, color 0.15s ease",
                }}>
                  <t.Icon size={9} strokeWidth={1.75} />
                  <span>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Content pane — only the active section is visible ── */}
        <div style={{ flex: 1, position: "relative", padding: "10px 12px" }}>
          {/* Canvas */}
          <div className="ct-pane-0" style={paneStyle}>
            <div style={paneLineHeading} />
            <div style={paneLine} />
            <div style={{ ...paneLine, width: "85%" }} />
            <div style={{ ...paneLine, width: "70%" }} />
          </div>
          {/* Activity timeline */}
          <div className="ct-pane-1" style={paneStyle}>
            {[
              { Icon: Mail,         label: "Sent statement",    when: "Jul 2" },
              { Icon: MessageSquare, label: "Studio visit",      when: "Jun 15" },
              { Icon: Phone,        label: "Intro call",        when: "May 10" },
              { Icon: CalendarIcon, label: "Met at Sight Unseen", when: "Apr 03" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 4,
                  background: "var(--color-cream)",
                  border: "0.5px solid var(--color-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <row.Icon size={8} strokeWidth={1.75} style={{ color: "var(--color-grey)" }} />
                </div>
                <span style={{ ...paneLine, flex: 1, width: i === 1 ? "70%" : "85%" }} />
                <span style={{ fontSize: 7, color: "var(--color-grey)", flexShrink: 0 }}>{row.when}</span>
              </div>
            ))}
          </div>
          {/* Tasks */}
          <div className="ct-pane-2" style={paneStyle}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, border: "1px solid var(--color-grey)", flexShrink: 0 }} />
                <span style={{ ...paneLine, flex: 1, width: i === 0 ? "80%" : i === 2 ? "60%" : "72%" }} />
              </div>
            ))}
          </div>
          {/* Notes */}
          <div className="ct-pane-3" style={paneStyle}>
            <div style={{
              border: "0.5px solid var(--color-border)",
              borderRadius: 6,
              padding: "6px 7px",
              background: "var(--color-warm-white)",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={paneLineHeading} />
              <div style={paneLine} />
              <div style={{ ...paneLine, width: "65%" }} />
            </div>
            <div style={{
              border: "0.5px solid var(--color-border)",
              borderRadius: 6,
              padding: "6px 7px",
              background: "var(--color-warm-white)",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ ...paneLineHeading, width: "55%" }} />
              <div style={{ ...paneLine, width: "80%" }} />
            </div>
          </div>
          {/* Files */}
          <div className="ct-pane-4" style={paneStyle}>
            {[
              { label: "contract.pdf",   w: 80 },
              { label: "bio-2026.docx",  w: 90 },
              { label: "press-kit.zip",  w: 100 },
            ].map((f) => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Folder size={10} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
                <span style={{ ...paneLine, flex: 1, maxWidth: f.w }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const tagPillBase: React.CSSProperties = {
  fontSize: 8, fontWeight: 600,
  padding: "2px 7px", borderRadius: 99,
  border: "0.5px solid var(--color-border)",
  background: "transparent", color: "var(--color-grey)",
  display: "inline-flex", alignItems: "center",
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

const paneLineHeading: React.CSSProperties = {
  height: 6, borderRadius: 2,
  background: "var(--color-charcoal)",
  opacity: 0.6,
  width: "45%",
  display: "block",
};
