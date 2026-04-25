"use client";

import { useState } from "react";

export type ButtonVariant = "primary" | "dark" | "secondary" | "ghost" | "danger";
export type ButtonSize    = "sm" | "md" | "lg";

interface ButtonProps {
  children:   React.ReactNode;
  variant?:   ButtonVariant;
  size?:      ButtonSize;
  disabled?:  boolean;
  onClick?:   () => void;
  type?:      "button" | "submit" | "reset";
  fullWidth?: boolean;
}

const SIZES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "5px 14px",  fontSize: 11, borderRadius: 6 },
  md: { padding: "7px 20px",  fontSize: 12, borderRadius: 8 },
  lg: { padding: "9px 24px",  fontSize: 13, borderRadius: 8 },
};

const BASE: Record<ButtonVariant, React.CSSProperties> = {
  primary:   { background: "var(--color-sage)",     color: "white",                         border: "none" },
  dark:      { background: "var(--color-charcoal)", color: "var(--color-warm-white)",        border: "none" },
  secondary: { background: "transparent",           color: "var(--color-text-secondary)",    border: "1px solid rgba(31,33,26,0.22)" },
  ghost:     { background: "transparent",           color: "var(--color-text-tertiary)",     border: "none" },
  danger:    { background: "transparent",           color: "var(--color-red-orange)",        border: "0.5px solid rgba(220,62,13,0.35)" },
};

const HOVER_BG: Record<ButtonVariant, string> = {
  primary:   "var(--color-sage-hover)",
  dark:      "rgba(31,33,26,0.82)",
  secondary: "var(--color-surface-sunken)",
  ghost:     "var(--color-surface-sunken)",
  danger:    "rgba(220,62,13,0.08)",
};

export default function Button({
  children, variant = "primary", size = "md",
  disabled = false, onClick, type = "button", fullWidth = false,
}: ButtonProps) {
  const [hov, setHov] = useState(false);

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...SIZES[size],
        ...BASE[variant],
        background: hov && !disabled ? HOVER_BG[variant] : BASE[variant].background,
        fontFamily: "inherit",
        fontWeight: 500,
        cursor:     disabled ? "not-allowed" : "pointer",
        opacity:    disabled ? 0.40 : 1,
        transition: "background 0.12s ease, opacity 0.12s ease",
        outline:    "none",
        display:    "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap:        6,
        width:      fullWidth ? "100%" : undefined,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
