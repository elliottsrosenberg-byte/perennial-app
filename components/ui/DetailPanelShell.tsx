"use client";

import type { CSSProperties, ReactNode } from "react";

// ── Detail-panel SHELL primitive ──────────────────────────────────────────────
//
// The scrim + positioned-panel scaffold shared byte-for-byte by every module's
// detail overlay (Projects, Network/Contact, Network/Organization, Outreach/
// Target). This component owns ONLY the chrome that is identical across all of
// them:
//
//   • the fixed, blurred, click-to-close scrim (hidden when maximized)
//   • the fixed, positioned, animated panel container (inset / radius / shadow /
//     border / maximize transition)
//
// Everything that differs per panel — the left identity/sidebar block, the tab
// set, the top-bar controls, the content — is passed as `children` and rendered
// untouched inside the panel container, which is itself `flex overflow-hidden`
// exactly as each panel root already was.
//
// State ownership stays with the calling panel: it keeps `maximized` (and its
// own `settingsOpen`, delete-confirm, etc.) and passes `maximized` + handlers
// down. This keeps the migration a pure wrapper-swap with zero behavior change.
//
// The inset numbers below reproduce the Target panel's scaffold EXACTLY:
//   top: 52px · bottom: 32px · left: calc(56px + 32px) · right: 32px
// where 56px is the Sidebar rail. When maximized every edge goes to 0 and the
// radius collapses to 0, animated over 0.2s ease.

const PANEL_TRANSITION =
  "top 0.2s ease, bottom 0.2s ease, left 0.2s ease, right 0.2s ease, border-radius 0.2s ease";

interface Props {
  /** Whether the panel is maximized (full-bleed). Owned by the caller. */
  maximized: boolean;
  /** Click-to-close on the scrim (and used by the caller's chrome / Esc). */
  onClose: () => void;
  /** The panel's own contents — left sidebar + right main area, unchanged. */
  children: ReactNode;
  /**
   * Optional extra styles merged onto the panel container. The shell already
   * applies inset / radius / shadow / border / transition; callers should only
   * use this for things genuinely panel-specific (none today).
   */
  panelStyle?: CSSProperties;
}

export default function DetailPanelShell({ maximized, onClose, children, panelStyle }: Props) {
  return (
    <>
      {/* Scrim */}
      {!maximized && (
        <div className="fixed inset-0 z-10 cursor-pointer"
          style={{ background: "rgba(20,18,16,0.52)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
          onClick={onClose} />
      )}

      {/* Panel */}
      <div className="fixed z-20 flex overflow-hidden" style={{
        top:    maximized ? 0 : "52px",
        bottom: maximized ? 0 : "32px",
        left:   maximized ? 0 : "calc(56px + 32px)",
        right:  maximized ? 0 : "32px",
        background:   "var(--color-off-white)",
        borderRadius: maximized ? 0 : 12,
        boxShadow:    "0 8px 40px rgba(0,0,0,0.22)",
        border:       "0.5px solid var(--color-border)",
        transition:   PANEL_TRANSITION,
        ...panelStyle,
      }}>
        {children}
      </div>
    </>
  );
}
