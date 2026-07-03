"use client";

import { useState, useRef, useEffect } from "react";

// ─── Shared task priority palette ───────────────────────────────────────────
// Single source of truth for the priority dot colours + labels used across the
// Tasks page and the project detail panel.

export const PRIORITY_DOT: Record<string, string> = {
  high:   "var(--color-red-orange)",
  medium: "var(--color-gold)",
  low:    "var(--color-text-tertiary)",
};
export const PRIORITY_LABELS: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

export type Priority = "high" | "medium" | "low";

// ─── PriorityPicker ─────────────────────────────────────────────────────────
// Inline pill + dropdown for choosing a task priority. `align` controls which
// edge the dropdown anchors to (Tasks rows default to "left", the project
// panel defaults to "right").

export default function PriorityPicker({
  value, onChange, align = "left",
}: {
  value:    Priority | null;
  onChange: (v: Priority | null) => void;
  align?:   "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dotColor = value ? PRIORITY_DOT[value] : "var(--color-border-strong)";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, padding: "3px 8px", borderRadius: 9999,
          border: `0.5px solid ${open ? "var(--color-border-strong)" : "var(--color-border)"}`,
          background: value ? "var(--color-surface-sunken)" : "transparent",
          color: value ? PRIORITY_DOT[value] : "var(--color-text-tertiary)",
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          transition: "all 0.1s ease",
        }}
        onMouseEnter={e => { if (!value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={e => { if (!value) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        {value ? PRIORITY_LABELS[value] : "Priority"}
      </button>

      {open && (
        <div style={{
          position: "absolute", [align === "right" ? "right" : "left"]: 0,
          top: "calc(100% + 5px)", zIndex: 200, minWidth: 130,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          {value && (
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 11, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-border-strong)" }} />
              None
            </button>
          )}
          {(["high", "medium", "low"] as const).map(p => (
            <button type="button" key={p} onClick={() => { onChange(p); setOpen(false); }} style={{
              width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 11,
              background: p === value ? "var(--color-surface-sunken)" : "transparent",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              color: PRIORITY_DOT[p], fontWeight: p === value ? 600 : 400,
              display: "flex", alignItems: "center", gap: 8,
            }}
            onMouseEnter={e => { if (p !== value) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
            onMouseLeave={e => { if (p !== value) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRIORITY_DOT[p] }} />
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
