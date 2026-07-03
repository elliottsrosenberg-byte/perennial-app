// Design-token-only colour maps for canvas objects. Every value is a CSS
// custom property or an rgba() over a token's `-rgb` channel — no raw hex.
// (See AGENTS.md "Design system — MANDATORY".)
//
// The 10-colour palette matches Badge / the rest of the app. Fills are kept
// lightly translucent so overlapping objects and the dot grid read through.

import type { StickyColor, ShapeColor } from "./types";

interface Swatch {
  /** Soft, slightly translucent fill behind the object. */
  fill: string;
  /** Accent/text colour that reads on the fill. */
  accent: string;
  /** Subtle border. */
  border: string;
}

/** Fill translucency — colour reads clearly but the canvas shows through. */
const FILL_ALPHA = 0.22;
const BORDER_ALPHA = 0.4;

// hue → optional deeper accent token (falls back to the base hue).
const HUES: { key: StickyColor; accent?: string }[] = [
  { key: "sage", accent: "var(--color-sage-deep)" },
  { key: "green", accent: "var(--color-green-deep)" },
  { key: "amber", accent: "var(--color-amber-deep)" },
  { key: "orange", accent: "var(--color-orange-deep)" },
  { key: "red" },
  { key: "blue" },
  { key: "gold" },
  { key: "purple" },
  { key: "teal" },
  { key: "grey" },
];

function build(): Record<StickyColor, Swatch> {
  const out = {} as Record<StickyColor, Swatch>;
  for (const { key, accent } of HUES) {
    out[key] = {
      fill: `rgba(var(--color-${key}-rgb), ${FILL_ALPHA})`,
      accent: accent ?? `var(--color-${key})`,
      border: `rgba(var(--color-${key}-rgb), ${BORDER_ALPHA})`,
    };
  }
  return out;
}

export const STICKY_PALETTE: Record<StickyColor, Swatch> = build();
export const SHAPE_PALETTE: Record<ShapeColor, Swatch> = STICKY_PALETTE;

export const STICKY_COLOR_ORDER: StickyColor[] = HUES.map((h) => h.key);
