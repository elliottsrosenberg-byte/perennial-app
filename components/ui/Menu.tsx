"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MenuItem {
  label:     string;
  icon?:     React.ElementType;
  onClick?:  () => void;
  href?:     string;
  danger?:   boolean;
  disabled?: boolean;
  external?: boolean;
  badge?:    string;
}

export type MenuContent = MenuItem | "divider";

interface MenuProps {
  items:   MenuContent[];
  onClose: () => void;
  style?:  React.CSSProperties;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
//
// Generic dropdown menu. The parent is responsible for positioning (absolute/fixed)
// and open/close state. Pair with a useRef + useEffect click-outside handler.
//
// Usage:
//   {open && (
//     <Menu
//       items={[
//         { label: "Edit", icon: Pencil, onClick: handleEdit },
//         "divider",
//         { label: "Delete", icon: Trash2, danger: true, onClick: handleDelete },
//       ]}
//       onClose={() => setOpen(false)}
//       style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 180 }}
//     />
//   )}

export default function Menu({ items, onClose, style }: MenuProps) {
  return (
    <div
      style={{
        background:   "var(--color-surface-raised)",
        border:       "0.5px solid var(--color-border)",
        borderRadius: 10,
        boxShadow:    "var(--shadow-lg)",
        overflow:     "hidden",
        minWidth:     160,
        ...style,
      }}
    >
      {items.map((item, i) => {
        if (item === "divider") {
          return <div key={i} style={{ height: "0.5px", background: "var(--color-border)", margin: "2px 0" }} />;
        }

        const { label, icon: Icon, href, danger, disabled, external, badge, onClick } = item;

        const textColor = danger
          ? "var(--color-red-orange)"
          : disabled
          ? "var(--color-text-tertiary)"
          : "var(--color-text-primary)";

        const iconColor = danger ? "var(--color-red-orange)" : "var(--color-text-tertiary)";

        const hoverBg = danger ? "rgba(220,62,13,0.06)" : "var(--color-surface-sunken)";

        const baseStyle: React.CSSProperties = {
          display:        "flex",
          alignItems:     "center",
          gap:            9,
          padding:        "9px 12px",
          fontSize:       12,
          fontWeight:     500,
          color:          textColor,
          background:     "transparent",
          border:         "none",
          cursor:         disabled ? "not-allowed" : "pointer",
          fontFamily:     "inherit",
          textAlign:      "left",
          width:          "100%",
          opacity:        disabled ? 0.45 : 1,
          textDecoration: "none",
          transition:     "background 0.08s ease",
        };

        const inner = (
          <>
            {Icon && <Icon size={13} strokeWidth={1.75} style={{ flexShrink: 0, color: iconColor }} />}
            <span style={{ flex: 1 }}>{label}</span>
            {badge && (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                background: "var(--color-surface-sunken)", color: "var(--color-text-tertiary)",
                flexShrink: 0,
              }}>
                {badge}
              </span>
            )}
            {external && <ExternalLink size={10} style={{ flexShrink: 0, color: "var(--color-text-tertiary)" }} />}
          </>
        );

        const hover = (e: React.MouseEvent<HTMLElement>) => {
          if (!disabled) e.currentTarget.style.background = hoverBg;
        };
        const unhover = (e: React.MouseEvent<HTMLElement>) => {
          e.currentTarget.style.background = "transparent";
        };

        if (href && !disabled) {
          return (
            <Link
              key={i}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              style={baseStyle}
              onClick={onClose}
              onMouseEnter={hover}
              onMouseLeave={unhover}
            >
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={i}
            style={baseStyle}
            disabled={disabled}
            onClick={() => { if (!disabled) { onClick?.(); onClose(); } }}
            onMouseEnter={hover}
            onMouseLeave={unhover}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
