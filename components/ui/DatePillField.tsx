"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

// ── DatePillField ─────────────────────────────────────────────────────────────
// Compact inline date control used in detail-panel property rows. Always visible
// (even when empty) so users see a "Pick a date" affordance without first
// clicking an em-dash. A pill shows the formatted date + a calendar icon; the
// popover is a month grid with prev/next nav and a hover-revealed Clear (X).
//
// Extracted verbatim from ProjectDetailPanel (Start/Due) so both Projects and
// Outreach/Target's Deadline share one styled control. It deals in `Date`;
// callers storing ISO strings adapt at the boundary (e.g.
// `new Date(iso + "T12:00:00")` in / rebuild `YYYY-MM-DD` from local
// getFullYear/Month/Date out).

export default function DatePillField({
  value, onChange, onClear, alert = false,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  onClear?: () => void;
  alert?: boolean;
}) {
  const [open, setOpen]       = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const yr = (value ?? new Date()).getFullYear();
  const mo = (value ?? new Date()).getMonth();
  const [view, setView] = useState({ yr, mo });
  useEffect(() => { setView({ yr, mo }); }, [yr, mo]);

  const today        = new Date();
  const daysInMonth  = new Date(view.yr, view.mo + 1, 0).getDate();
  const firstDow     = new Date(view.yr, view.mo, 1).getDay();
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW    = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const cells  = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const isSel = (d: number) =>
    !!value && value.getDate() === d && value.getMonth() === view.mo && value.getFullYear() === view.yr;
  const isTo  = (d: number) =>
    today.getDate() === d && today.getMonth() === view.mo && today.getFullYear() === view.yr;

  const label = value
    ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Pick a date";

  const filled = !!value;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "2px 9px", borderRadius: 999,
          fontSize: 10, fontWeight: 500,
          fontFamily: "inherit",
          background: filled
            ? (alert ? "rgba(220,62,13,0.10)" : "var(--color-surface-sunken)")
            : "transparent",
          color: alert
            ? "var(--color-red-orange)"
            : filled
              ? "#6b6860"
              : "var(--color-grey)",
          border: `0.5px ${filled ? "solid" : "dashed"} ${alert ? "rgba(220,62,13,0.35)" : "var(--color-border-strong)"}`,
          cursor: "pointer",
          transition: "background 0.1s ease, border-color 0.1s ease",
        }}
        onMouseEnter={e => {
          if (!filled) e.currentTarget.style.borderColor = "var(--color-sage)";
          if (!filled) e.currentTarget.style.color = "var(--color-text-secondary)";
        }}
        onMouseLeave={e => {
          if (!filled) e.currentTarget.style.borderColor = "var(--color-border-strong)";
          if (!filled) e.currentTarget.style.color = "var(--color-grey)";
        }}
      >
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v2M11 1v2M2 7h12"/>
        </svg>
        {label}
      </button>

      {filled && hovered && onClear && (
        <button
          onClick={onClear}
          aria-label="Clear date"
          title="Clear"
          style={{
            background: "transparent", border: "none", padding: 0,
            color: "var(--color-grey)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 60,
          width: 232,
          background: "var(--color-surface-raised)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
          padding: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button
              onClick={() => setView(v => ({ yr: v.mo === 0 ? v.yr - 1 : v.yr, mo: v.mo === 0 ? 11 : v.mo - 1 }))}
              style={{ width: 24, height: 24, borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
            >‹</button>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {MONTHS[view.mo]} {view.yr}
            </span>
            <button
              onClick={() => setView(v => ({ yr: v.mo === 11 ? v.yr + 1 : v.yr, mo: v.mo === 11 ? 0 : v.mo + 1 }))}
              style={{ width: 24, height: 24, borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
            >›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {DOW.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) =>
              day === null ? <div key={`e${i}`} /> : (
                <button
                  key={day}
                  onClick={() => { onChange(new Date(view.yr, view.mo, day)); setOpen(false); }}
                  style={{
                    width: "100%", aspectRatio: "1", borderRadius: 6, border: "none",
                    fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    fontWeight:  isSel(day) ? 600 : 400,
                    background:  isSel(day) ? "var(--color-sage)" : "transparent",
                    color:       isSel(day) ? "white" : isTo(day) ? "var(--color-sage)" : "var(--color-text-primary)",
                    outline:     isTo(day) && !isSel(day) ? "1.5px solid var(--color-sage)" : "none",
                    outlineOffset: -1,
                    transition:  "background 0.08s ease",
                  }}
                  onMouseEnter={e => { if (!isSel(day)) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                  onMouseLeave={e => { if (!isSel(day)) e.currentTarget.style.background = "transparent"; }}
                >{day}</button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
