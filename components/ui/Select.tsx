"use client";

import { useState, useEffect, useRef } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value:        string;
  onChange:     (v: string) => void;
  options:      SelectOption[];
  placeholder?: string;
  disabled?:    boolean;
}

export default function Select({ value, onChange, options, placeholder, disabled = false }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  const trigBase: React.CSSProperties = {
    width:        "100%",
    padding:      "8px 12px",
    fontSize:     12,
    background:   "var(--color-surface-sunken)",
    border:       open
      ? "0.5px solid var(--color-sage)"
      : "0.5px solid var(--color-border)",
    boxShadow:    open ? "0 0 0 3px var(--color-focus-ring)" : "none",
    borderRadius: 8,
    color:        selected ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
    fontFamily:   "inherit",
    cursor:       disabled ? "not-allowed" : "pointer",
    outline:      "none",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "space-between",
    gap:          8,
    opacity:      disabled ? 0.5 : 1,
    transition:   "border-color 0.12s ease, box-shadow 0.12s ease",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        style={trigBase}
      >
        <span>{selected?.label ?? placeholder ?? "Select…"}</span>
        <svg
          width="10" height="10" viewBox="0 0 16 16" fill="none"
          stroke="var(--color-text-secondary)" strokeWidth="2.5"
          style={{
            flexShrink: 0,
            transition: "transform 0.12s ease",
            transform:  open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position:     "absolute",
          top:          "calc(100% + 4px)",
          left:         0,
          right:        0,
          zIndex:       50,
          background:   "var(--color-surface-raised)",
          border:       "0.5px solid var(--color-border)",
          borderRadius: 10,
          boxShadow:    "var(--shadow-md)",
          overflow:     "hidden",
        }}>
          {options.map((o) => {
            const isActive = o.value === value;
            return (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width:      "100%",
                  padding:    "8px 12px",
                  fontSize:   12,
                  textAlign:  "left",
                  border:     "none",
                  cursor:     "pointer",
                  fontFamily: "inherit",
                  background: isActive ? "rgba(155,163,122,0.10)" : "transparent",
                  color:      isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  fontWeight: isActive ? 500 : 400,
                  display:    "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "background 0.08s ease",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {o.label}
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--color-sage)" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2 8l4.5 4.5L14 4"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
