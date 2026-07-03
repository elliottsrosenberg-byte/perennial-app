// Design-token-only colour maps for canvas objects. Every value is a CSS
// custom property or an rgba() over a token's `-rgb` channel — no raw hex.
// (See AGENTS.md "Design system — MANDATORY".)

import type { StickyColor, ShapeColor } from "./types";

interface Swatch {
  /** Soft fill behind the object. */
  fill: string;
  /** Accent/text colour that reads on the fill. */
  accent: string;
  /** Subtle border. */
  border: string;
}

export const STICKY_PALETTE: Record<StickyColor, Swatch> = {
  amber: {
    fill:   "rgba(var(--color-amber-rgb), 0.16)",
    accent: "var(--color-amber-deep)",
    border: "rgba(var(--color-amber-rgb), 0.30)",
  },
  sage: {
    fill:   "rgba(var(--color-sage-rgb), 0.16)",
    accent: "var(--color-sage-deep)",
    border: "rgba(var(--color-sage-rgb), 0.30)",
  },
  orange: {
    fill:   "rgba(var(--color-orange-rgb), 0.14)",
    accent: "var(--color-orange-deep)",
    border: "rgba(var(--color-orange-rgb), 0.28)",
  },
  green: {
    fill:   "rgba(var(--color-green-rgb), 0.16)",
    accent: "var(--color-green-deep)",
    border: "rgba(var(--color-green-rgb), 0.30)",
  },
  neutral: {
    fill:   "var(--color-surface-sunken)",
    accent: "var(--color-text-secondary)",
    border: "var(--color-border)",
  },
};

export const SHAPE_PALETTE: Record<ShapeColor, Swatch> = STICKY_PALETTE;

export const STICKY_COLOR_ORDER: StickyColor[] = [
  "amber",
  "sage",
  "orange",
  "green",
  "neutral",
];
