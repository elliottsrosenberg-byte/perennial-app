"use client";

/**
 * Badge — the single tinted-pill primitive for the whole app.
 *
 * Two shipped shapes, one component:
 *   • variant="status" (default) — uppercase, bold, tight — project/invoice/
 *     contact STATE labels ("OVERDUE", "PAID", "ACTIVE").
 *   • variant="tag" — lowercase, medium, softer tint — free-form labels
 *     ("gallery", "client", "press").
 *
 * Colour comes from a fixed `tone` palette (never ad-hoc rgba), so every pill
 * in the product reads as one system. Tints are derived from a single RGB per
 * tone at a variant-specific alpha, so status pills are a touch stronger than
 * tags automatically.
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

export type BadgeVariant = "status" | "tag";

const TONES: Record<BadgeTone, { rgb: string; text: string }> = {
  sage:    { rgb: "155,163,122", text: "var(--color-sage-text)" },
  green:   { rgb: "141,208,71",  text: "#3d6b4f" },
  amber:   { rgb: "232,197,71",  text: "#a07800" },
  orange:  { rgb: "232,133,13",  text: "#c06200" },
  red:     { rgb: "220,62,13",   text: "var(--color-red-orange)" },
  blue:    { rgb: "37,99,171",   text: "#2563ab" },
  gold:    { rgb: "184,134,11",  text: "#b8860b" },
  purple:  { rgb: "109,79,163",  text: "#6d4fa3" },
  teal:    { rgb: "20,140,140",  text: "#148c8c" },
  neutral: { rgb: "31,33,26",    text: "var(--color-text-tertiary)" },
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
  // Neutral (charcoal) needs a lighter tint than the chromatic tones to stay
  // subtle; status pills sit a step stronger than tags.
  const alpha = tone === "neutral" ? 0.07 : isStatus ? 0.16 : 0.1;

  return (
    <span
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        fontSize:       isStatus ? 10 : 11,
        fontWeight:     isStatus ? 700 : 500,
        padding:        isStatus ? "3px 8px" : "3px 10px",
        borderRadius:   9999,
        background:     `rgba(${t.rgb},${alpha})`,
        color:          t.text,
        textTransform:  isStatus ? "uppercase" : "none",
        letterSpacing:  isStatus ? "0.04em" : "normal",
        lineHeight:     1,
        whiteSpace:     "nowrap",
      }}
    >
      {children}
    </span>
  );
}
