"use client";

// Dropdown opened by the 3-dot button in the Notes topbar. Houses
// list-wide preferences (filter the visible list) and convenience
// entry-points (a second route to Import). Mirrors the placement +
// visual treatment of ContactsOptionsMenu / OptionsMenu so the three
// modules feel consistent.

import { useEffect, useRef } from "react";
import { Pin, Upload } from "lucide-react";

interface Props {
  showPinnedOnly:        boolean;
  onTogglePinnedOnly:    () => void;
  pinnedCount:           number;
  onImport:              () => void;
  onClose:               () => void;
}

export default function NotesOptionsMenu({
  showPinnedOnly, onTogglePinnedOnly, pinnedCount, onImport, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", right: 0, top: "calc(100% + 6px)",
        width: 260, zIndex: 40,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-overlay)",
        overflow: "hidden",
      }}
    >
      <div style={{
        padding: "10px 14px 6px",
        borderBottom: "0.5px solid var(--color-border)",
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
        }}>
          Notes options
        </p>
      </div>

      <div style={{ padding: 6 }}>
        {/* Show pinned only toggle */}
        <button
          onClick={onTogglePinnedOnly}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7, border: "none",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Pin
            size={13}
            strokeWidth={1.75}
            fill={showPinnedOnly ? "var(--color-sage)" : "none"}
            style={{ color: showPinnedOnly ? "var(--color-sage)" : "var(--color-text-tertiary)", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Show pinned only
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              {pinnedCount === 0
                ? "Nothing pinned yet"
                : `${pinnedCount} pinned note${pinnedCount === 1 ? "" : "s"}`}
            </p>
          </div>
          {/* Toggle pill */}
          <span
            aria-checked={showPinnedOnly}
            style={{
              flexShrink: 0,
              width: 26, height: 14, borderRadius: 999,
              background: showPinnedOnly ? "var(--color-sage)" : "var(--color-border-strong)",
              position: "relative",
              transition: "background 0.15s ease",
            }}
          >
            <span style={{
              position: "absolute",
              top: 1, left: showPinnedOnly ? 13 : 1,
              width: 12, height: 12, borderRadius: 999,
              background: "white",
              boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
              transition: "left 0.15s ease",
            }} />
          </span>
        </button>

        <div style={{ height: "0.5px", background: "var(--color-border)", margin: "4px 6px" }} />

        {/* Import note (mirror of the topbar button — handy when the user
            is already in this menu for something else) */}
        <button
          onClick={() => { onImport(); onClose(); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7, border: "none",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Upload size={13} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Import note
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              From a .txt, .pdf, or .docx file
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
