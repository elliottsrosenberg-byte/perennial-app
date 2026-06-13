// The canonical 10-color palette for USER-CUSTOMIZABLE things — calendar
// colors, tags, pipeline stages, project accents, etc. App-native elements
// (charts, status badges, chrome, stat visuals) use the --color-* design
// tokens instead; do NOT source those from this palette.
//
// Hexes are Elliott's chosen palette. They intentionally differ slightly from
// the near-matching design tokens (e.g. palette Blue #2564ab vs --color-blue
// #2563ab) — they serve a different purpose (user picks vs app chrome).

export interface PaletteColor {
  name: string;
  hex:  string;
}

export const PALETTE: readonly PaletteColor[] = [
  { name: "Green",  hex: "#90c84a" },
  { name: "Grey",   hex: "#b5b5b6" },
  { name: "Brown",  hex: "#8b5d51" },
  { name: "Orange", hex: "#e78625" },
  { name: "Yellow", hex: "#e8c547" },
  { name: "Olive",  hex: "#537f48" },
  { name: "Blue",   hex: "#2564ab" },
  { name: "Purple", hex: "#6d50a1" },
  { name: "Rose",   hex: "#dc5270" },
  { name: "Red",    hex: "#da4126" },
];

export const PALETTE_HEXES: readonly string[] = PALETTE.map((c) => c.hex);

/** `{ name, value }` shape for swatch pickers that expect `value`. */
export const PALETTE_SWATCHES: readonly { name: string; value: string }[] =
  PALETTE.map((c) => ({ name: c.name, value: c.hex }));

/** Parse `#rgb`/`#rrggbb` to an `rgba()` string at the given alpha. Returns the
 *  input unchanged if it isn't a hex (e.g. a `var(--…)` token). */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace("#", "");
  if (h.length !== 3 && h.length !== 6) return hex;
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(f.slice(0, 2), 16);
  const g = parseInt(f.slice(2, 4), 16);
  const b = parseInt(f.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Soft chip/pill style from any hex: tinted background + solid foreground.
 *  Matches the app's rgba(…, 0.10–0.16) chip convention. */
export function chipStyle(hex: string, bgAlpha = 0.12): { background: string; color: string } {
  return { background: hexToRgba(hex, bgAlpha), color: hex };
}

/** Deterministic palette color for an arbitrary key (e.g. a tag string) so the
 *  same key always renders the same color without persisting an assignment. */
export function paletteColorForKey(key: string): PaletteColor {
  const k = (key ?? "").toLowerCase().trim();
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
