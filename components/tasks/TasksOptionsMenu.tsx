"use client";

// Dropdown opened by the 3-dot button in the Tasks topbar. Houses any
// list-wide preferences and surface actions that don't fit a single row.
// Mirrors the placement + visual treatment of ContactsOptionsMenu and the
// Projects OptionsMenu so the three modules feel consistent.

import { useEffect, useRef } from "react";
import { CheckCircle2, Download } from "lucide-react";

interface Props {
  showCompletedInline: boolean;
  onToggleShowCompletedInline: () => void;
  completedCount: number;
  onExportCsv: () => void;
  onClose: () => void;
}

export default function TasksOptionsMenu({
  showCompletedInline, onToggleShowCompletedInline, completedCount,
  onExportCsv, onClose,
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
          Tasks options
        </p>
      </div>

      <div style={{ padding: 6 }}>
        {/* Expand completed inline on the All view */}
        <button
          onClick={onToggleShowCompletedInline}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7, border: "none",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <CheckCircle2 size={13} strokeWidth={1.75} style={{ color: showCompletedInline ? "var(--color-sage)" : "var(--color-text-tertiary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Show completed inline
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              {completedCount === 0
                ? "Nothing completed yet"
                : `${completedCount} completed · expand below open tasks`}
            </p>
          </div>
          <span
            aria-checked={showCompletedInline}
            style={{
              flexShrink: 0,
              width: 26, height: 14, borderRadius: 999,
              background: showCompletedInline ? "var(--color-sage)" : "var(--color-border-strong)",
              position: "relative",
              transition: "background 0.15s ease",
            }}
          >
            <span style={{
              position: "absolute",
              top: 1, left: showCompletedInline ? 13 : 1,
              width: 12, height: 12, borderRadius: 999,
              background: "white",
              boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
              transition: "left 0.15s ease",
            }} />
          </span>
        </button>

        {/* Export visible tasks as CSV */}
        <button
          onClick={() => { onExportCsv(); onClose(); }}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 10px", borderRadius: 7, border: "none",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
            textAlign: "left",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Download size={13} strokeWidth={1.75} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Export visible tasks
            </p>
            <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>
              Download the current view as CSV
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
