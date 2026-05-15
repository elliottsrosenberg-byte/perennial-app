"use client";

// Dropdown opened by the 3-dot button in the Contacts topbar. Houses any
// list-wide preferences and surface actions that don't fit a single contact.
// Mirrors the placement + visual treatment of OptionsMenu in the Projects
// module so the two feel consistent.

import { useEffect, useRef } from "react";
import { Archive, Tag } from "lucide-react";

interface Props {
  showArchived: boolean;
  onToggleShowArchived: () => void;
  archivedCount: number;
  onClose: () => void;
}

export default function ContactsOptionsMenu({
  showArchived, onToggleShowArchived, archivedCount, onClose,
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
          Contacts options
        </p>
      </div>

      <div style={{ padding: 6 }}>
        {/* Show archived toggle */}
        <button
          onClick={onToggleShowArchived}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7, border: "none",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Archive size={13} strokeWidth={1.75} style={{ color: showArchived ? "var(--color-sage)" : "var(--color-text-tertiary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Show archived contacts
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              {archivedCount === 0
                ? "Nothing archived"
                : `${archivedCount} archived · restore them inline`}
            </p>
          </div>
          {/* Toggle pill */}
          <span
            aria-checked={showArchived}
            style={{
              flexShrink: 0,
              width: 26, height: 14, borderRadius: 999,
              background: showArchived ? "var(--color-sage)" : "var(--color-border-strong)",
              position: "relative",
              transition: "background 0.15s ease",
            }}
          >
            <span style={{
              position: "absolute",
              top: 1, left: showArchived ? 13 : 1,
              width: 12, height: 12, borderRadius: 999,
              background: "white",
              boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
              transition: "left 0.15s ease",
            }} />
          </span>
        </button>

        {/* Manage tags (placeholder for a future tag editor) */}
        <button
          disabled
          title="Tag rename + cleanup coming in a follow-up pass"
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7, border: "none",
            background: "transparent", cursor: "not-allowed", fontFamily: "inherit",
            textAlign: "left", opacity: 0.55,
          }}
        >
          <Tag size={13} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Manage tags
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              Rename, recolour, prune — coming soon
            </p>
          </div>
          <span style={{
            flexShrink: 0,
            fontSize: 9, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.06em", color: "var(--color-text-tertiary)",
            padding: "2px 6px", borderRadius: 4,
            background: "var(--color-surface-sunken)",
            border: "0.5px solid var(--color-border)",
          }}>
            Soon
          </span>
        </button>
      </div>
    </div>
  );
}
