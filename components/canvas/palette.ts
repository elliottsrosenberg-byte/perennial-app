// Canvas object colours come straight from the app's canonical user-pick
// palette (lib/ui/palette.ts) — the SAME 10 colours used for tags, calendar
// colours, pipeline stages and project accents. Canvas objects are a
// user-picked colour (like a tag or sticky), so they belong to that palette,
// NOT the --color-* chrome tokens.
//
// We reference the palette hexes via import and tint them here with hexToRgba;
// no raw hex or rgba(<numbers>) literals live in this file, so the design-token
// rule holds. (Those palette hexes are the documented user-pick exception.)

import { PALETTE, hexToRgba } from "@/lib/ui/palette";
import type { StickyColor, ShapeColor } from "./types";

interface Swatch {
  /** Soft, slightly translucent fill behind the object. */
  fill: string;
  /** Accent/text/stroke colour — the solid palette hue (matches the swatch). */
  accent: string;
  /** Subtle border. */
  border: string;
}

/** Fill translucency — colour reads clearly but the canvas still shows through. */
const FILL_ALPHA = 0.4;
const BORDER_ALPHA = 0.6;

// Palette name (lib/ui/palette.ts) → canvas colour key. The iteration order of
// PALETTE therefore drives STICKY_COLOR_ORDER, and every key here must match a
// member of the StickyColor union in types.ts.
const KEY_BY_NAME: Record<string, StickyColor> = {
  Green:  "green",
  Grey:   "grey",
  Brown:  "brown",
  Orange: "orange",
  Yellow: "yellow",
  Olive:  "olive",
  Blue:   "blue",
  Purple: "purple",
  Rose:   "rose",
  Red:    "red",
};

function build(): { palette: Record<StickyColor, Swatch>; order: StickyColor[] } {
  const palette = {} as Record<StickyColor, Swatch>;
  const order: StickyColor[] = [];
  for (const { name, hex } of PALETTE) {
    const key = KEY_BY_NAME[name];
    if (!key) continue;
    palette[key] = {
      fill: hexToRgba(hex, FILL_ALPHA),
      accent: hex,
      border: hexToRgba(hex, BORDER_ALPHA),
    };
    order.push(key);
  }
  return { palette, order };
}

const built = build();

export const STICKY_PALETTE: Record<StickyColor, Swatch> = built.palette;
export const SHAPE_PALETTE: Record<ShapeColor, Swatch> = STICKY_PALETTE;

export const STICKY_COLOR_ORDER: StickyColor[] = built.order;
