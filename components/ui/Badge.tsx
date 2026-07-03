"use client";

import { PALETTE, hexToRgba } from "@/lib/ui/palette";

/**
 * Badge — the single tinted-pill primitive for the whole app.
 *
 * Three shipped shapes, one component:
 *   • variant="status" (default) — uppercase, bold, tight, tinted — state
 *     labels ("OVERDUE", "ACTIVE").
 *   • variant="tag" — lowercase, medium, softer tint — free-form labels
 *     ("gallery", "client", "press").
 *   • variant="solid" — filled uppercase — high-emphasis state stamps
 *     ("DRAFT", "PAID", "OVERDUE").
 *
 * Color is the design system's ONE accent/status/palette set: `sage` (the
 * brand) plus the 10 user-palette colors from lib/ui/palette.ts. There is no
 * separate accent palette — statuses, tags, and accents all draw from here.
 */

export type BadgeTone =
  | "sage"    // brand
  | "green" | "grey" | "brown" | "orange" | "yellow"
  | "olive" | "blue" | "purple" | "rose" | "red";

export type BadgeVariant = "status" | "tag" | "solid";

// Hex per palette tone (name lowercased). Sage is handled separately via tokens.
const PALETTE_HEX: Record<string, string> = Object.fromEntries(
  PALETTE.map((c) => [c.name.toLowerCase(), c.hex]),
);

// Light palette colors need dark (ink) text on a solid fill; the rest take white.
const LIGHT_SOLID = new Set(["yellow", "grey", "green"]);

// Darken a hex for readable text on a tint (palette colors are mid-tone).
function darken(hex: string, f: number): string {
  const c = hex.replace("#", "");
  const r = Math.round(parseInt(c.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(c.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(c.slice(4, 6), 16) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

interface BadgeProps {
  children: React.ReactNode;
  tone?:    BadgeTone;
  variant?: BadgeVariant;
}

export default function Badge({
  children,
  tone = "grey",
  variant = "status",
}: BadgeProps) {
  const isStatus = variant === "status";
  const isSolid  = variant === "solid";
  const isTag    = variant === "tag";
  const upper = isStatus || isSolid;
  const alpha = isStatus ? 0.16 : 0.1;

  let background: string;
  let color: string;

  if (tone === "sage") {
    // Brand tone — token-driven so it flips/re-skins with the theme.
    background = isSolid ? "var(--color-sage)" : `rgba(var(--color-sage-rgb),${alpha})`;
    color = isSolid ? "#fff" : "var(--color-sage-text)";
  } else {
    const hex = PALETTE_HEX[tone] ?? PALETTE_HEX.grey;
    if (isSolid) {
      background = hex;
      color = LIGHT_SOLID.has(tone) ? "var(--color-charcoal)" : "#fff";
    } else {
      background = hexToRgba(hex, alpha);
      color = darken(hex, 0.62);
    }
  }

  return (
    <span
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        fontSize:       isTag ? 11 : 10,
        fontWeight:     isTag ? 500 : 700,
        padding:        isTag ? "3px 10px" : "3px 8px",
        borderRadius:   9999,
        background,
        color,
        textTransform:  upper ? "uppercase" : "none",
        letterSpacing:  upper ? "0.04em" : "normal",
        lineHeight:     1,
        whiteSpace:     "nowrap",
      }}
    >
      {children}
    </span>
  );
}
