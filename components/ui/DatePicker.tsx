"use client";

import { useState, useEffect, useRef } from "react";

interface DatePickerProps {
  value:     Date | null;
  onChange:  (d: Date) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function DatePicker({ value, onChange, placeholder = "Pick a date…", disabled = false }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(value ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const yr = view.getFullYear();
  const mo = view.getMonth();
  const today = new Date();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDow    = new Date(yr, mo, 1).getDay();

  const MONTHS = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isSel = (d: number) =>
    !!value && value.getDate() === d && value.getMonth() === mo && value.getFullYear() === yr;
  const isTo  = (d: number) =>
    today.getDate() === d && today.getMonth() === mo && today.getFullYear() === yr;

  const label = value
    ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : placeholder;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          width:        "100%",
          padding:      "8px 12px",
          fontSize:     12,
          background:   "var(--color-surface-sunken)",
          border:       open ? "0.5px solid var(--color-sage)" : "0.5px solid var(--color-border)",
          boxShadow:    open ? "0 0 0 3px var(--color-focus-ring)" : "none",
          borderRadius: 8,
          color:        value ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          fontFamily:   "inherit",
          cursor:       disabled ? "not-allowed" : "pointer",
          outline:      "none",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          gap:          8,
          opacity:      disabled ? 0.5 : 1,
          transition:   "border-color 0.12s ease",
        }}
      >
        <span>{label}</span>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v2M11 1v2M2 7h12"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position:     "absolute",
          top:          "calc(100% + 4px)",
          left:         0,
          zIndex:       50,
          width:        252,
          background:   "var(--color-surface-raised)",
          border:       "0.5px solid var(--color-border)",
          borderRadius: 12,
          boxShadow:    "var(--shadow-md)",
          padding:      14,
        }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            {[{ label: "‹", action: () => setView(new Date(yr, mo - 1, 1)) }, null, { label: "›", action: () => setView(new Date(yr, mo + 1, 1)) }].map((item, i) =>
              item === null ? (
                <span key={i} style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {MONTHS[mo]} {yr}
                </span>
              ) : (
                <button
                  type="button"
                  key={i}
                  onClick={item.action}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: "0.5px solid var(--color-border)", background: "transparent",
                    cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}
                >
                  {item.label}
                </button>
              )
            )}
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {DOW.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "3px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) =>
              day === null ? (
                <div key={`e${i}`} />
              ) : (
                <button
                  type="button"
                  key={day}
                  onClick={() => { onChange(new Date(yr, mo, day)); setOpen(false); }}
                  style={{
                    width: "100%", aspectRatio: "1", borderRadius: 6, border: "none",
                    fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                    fontWeight:  isSel(day) ? 600 : 400,
                    background:  isSel(day) ? "var(--color-sage)" : "transparent",
                    color:       isSel(day) ? "white" : isTo(day) ? "var(--color-sage)" : "var(--color-text-primary)",
                    outline:     isTo(day) && !isSel(day) ? "1.5px solid var(--color-sage)" : "none",
                    outlineOffset: -1,
                    transition:  "background 0.08s ease",
                  }}
                  onMouseEnter={(e) => { if (!isSel(day)) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                  onMouseLeave={(e) => { if (!isSel(day)) e.currentTarget.style.background = "transparent"; }}
                >
                  {day}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
