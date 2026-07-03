"use client";

/**
 * Badge — the single tinted-pill primitive for the whole app.
 *
 * Three shipped shapes, one component:
 *   • variant="status" (default) — uppercase, bold, tight, tinted — project/
 *     contact STATE labels ("OVERDUE", "ACTIVE").
 *   • variant="tag" — lowercase, medium, softer tint — free-form labels
 *     ("gallery", "client", "press").
 *   • variant="solid" — filled uppercase (status, but a solid fill instead of a
 *     tint) — high-emphasis state stamps ("DRAFT", "PAID", "OVERDUE").
 *
 * Colour comes from a fixed `tone` palette (never ad-hoc rgba), so every pill
 * in the product reads as one system. Tinted variants derive from a single RGB
 * per tone at a variant-specific alpha; the solid variant uses the tone's
 * filled colour with a readable foreground.
 *
 * NOTE: this is for FIXED-semantic pills only. Palette-driven tags (coloured by
 * the user's custom palette via paletteColorForKey) must stay dynamic — don't
 * force those onto Badge's fixed tones.
 */

export type BadgeTone =
  | "sage"    // brand / in-progress / active
  | "green"   // success / complete / paid
  | "amber"   // caution / on-hold
  | "orange"  // warm accent / award
  | "red"     // danger / overdue
  | "blue"    // info / sent / gallery
  | "gold"    // lead
  | "purple"  // press
  | "teal"    // event
  | "neutral"; // planning / draft / inactive

export type BadgeVariant = "status" | "tag" | "solid";

// All colour flows from globals.css tokens so Badge re-skins with the theme.
// `rgb` is a tint base (rgba(rgb, alpha)); solidText stays a fixed contrast
// anchor (white, or ink on the light amber fill).
const TONES: Record<BadgeTone, { rgb: string; text: string; solid: string; solidText: string }> = {
  sage:    { rgb: "var(--color-sage-rgb)",     text: "var(--color-sage-text)",     solid: "var(--color-sage)",        solidText: "#fff"     },
  green:   { rgb: "var(--color-green-rgb)",    text: "var(--color-green-deep)",    solid: "var(--color-green-solid)", solidText: "#fff"     },
  amber:   { rgb: "var(--color-amber-rgb)",    text: "var(--color-amber-deep)",    solid: "var(--color-amber-solid)", solidText: "#1f211a"  },
  orange:  { rgb: "var(--color-orange-rgb)",   text: "var(--color-orange-deep)",   solid: "var(--color-orange-solid)",solidText: "#fff"     },
  red:     { rgb: "var(--color-red-rgb)",      text: "var(--color-red-orange)",    solid: "var(--color-red-orange)",  solidText: "#fff"     },
  blue:    { rgb: "var(--color-blue-rgb)",     text: "var(--color-blue)",          solid: "var(--color-blue)",        solidText: "#fff"     },
  gold:    { rgb: "var(--color-gold-rgb)",     text: "var(--color-gold)",          solid: "var(--color-gold)",        solidText: "#fff"     },
  purple:  { rgb: "var(--color-purple-rgb)",   text: "var(--color-purple)",        solid: "var(--color-purple)",      solidText: "#fff"     },
  teal:    { rgb: "var(--color-teal-rgb)",     text: "var(--color-teal)",          solid: "var(--color-teal)",        solidText: "#fff"     },
  neutral: { rgb: "var(--color-charcoal-rgb)", text: "var(--color-text-tertiary)", solid: "var(--color-grey)",        solidText: "#fff"     },
};

interface BadgeProps {
  children: React.ReactNode;
  tone?:    BadgeTone;
  variant?: BadgeVariant;
}

export default function Badge({
  children,
  tone = "neutral",
  variant = "status",
}: BadgeProps) {
  const t = TONES[tone];
  const isStatus = variant === "status";
  const isSolid  = variant === "solid";
  const isTag    = variant === "tag";
  // status + solid share the uppercase state-label typography; only the fill
  // differs (tint vs solid). tag is the softer lowercase form.
  const upper = isStatus || isSolid;
  // Neutral (charcoal) needs a lighter tint than the chromatic tones to stay
  // subtle; status pills sit a step stronger than tags.
  const alpha = tone === "neutral" ? 0.07 : isStatus ? 0.16 : 0.1;

  return (
    <span
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        fontSize:       isTag ? 11 : 10,
        fontWeight:     isTag ? 500 : 700,
        padding:        isTag ? "3px 10px" : "3px 8px",
        borderRadius:   9999,
        background:     isSolid ? t.solid : `rgba(${t.rgb},${alpha})`,
        color:          isSolid ? t.solidText : t.text,
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
