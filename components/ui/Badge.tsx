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

const TONES: Record<BadgeTone, { rgb: string; text: string; solid: string; solidText: string }> = {
  sage:    { rgb: "155,163,122", text: "var(--color-sage-text)",     solid: "var(--color-sage)",       solidText: "#fff"     },
  green:   { rgb: "141,208,71",  text: "#3d6b4f",                    solid: "#5a9e2f",                 solidText: "#fff"     },
  amber:   { rgb: "232,197,71",  text: "#a07800",                    solid: "#e0a82e",                 solidText: "#1f211a"  },
  orange:  { rgb: "232,133,13",  text: "#c06200",                    solid: "#e0850d",                 solidText: "#fff"     },
  red:     { rgb: "220,62,13",   text: "var(--color-red-orange)",    solid: "var(--color-red-orange)", solidText: "#fff"     },
  blue:    { rgb: "37,99,171",   text: "#2563ab",                    solid: "#2563ab",                 solidText: "#fff"     },
  gold:    { rgb: "184,134,11",  text: "#b8860b",                    solid: "#b8860b",                 solidText: "#fff"     },
  purple:  { rgb: "109,79,163",  text: "#6d4fa3",                    solid: "#6d4fa3",                 solidText: "#fff"     },
  teal:    { rgb: "20,140,140",  text: "#148c8c",                    solid: "#148c8c",                 solidText: "#fff"     },
  neutral: { rgb: "31,33,26",    text: "var(--color-text-tertiary)", solid: "var(--color-grey)",       solidText: "#fff"     },
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
