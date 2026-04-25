export type BadgeVariant =
  | "success" | "warning" | "alert" | "neutral"
  | "info"    | "sage"    | "amber" | "in-progress";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  uppercase?: boolean;
}

const VARIANTS: Record<BadgeVariant, { bg: string; color: string }> = {
  "success":     { bg: "rgba(141,208,71,0.15)",  color: "#3d6b4f"                   },
  "in-progress": { bg: "rgba(155,163,122,0.18)", color: "var(--color-sage)"         },
  "warning":     { bg: "rgba(232,197,71,0.18)",  color: "#a07800"                   },
  "alert":       { bg: "rgba(220,62,13,0.12)",   color: "var(--color-red-orange)"   },
  "neutral":     { bg: "rgba(31,33,26,0.07)",    color: "var(--color-text-tertiary)"},
  "info":        { bg: "rgba(37,99,171,0.12)",   color: "var(--color-blue)"         },
  "sage":        { bg: "rgba(155,163,122,0.18)", color: "var(--color-sage)"         },
  "amber":       { bg: "rgba(184,134,11,0.12)",  color: "#b8860b"                   },
};

export default function Badge({ children, variant = "neutral", uppercase = true }: BadgeProps) {
  const s = VARIANTS[variant];
  return (
    <span style={{
      fontSize:        10,
      fontWeight:      700,
      padding:         "2px 7px",
      borderRadius:    9999,
      background:      s.bg,
      color:           s.color,
      textTransform:   uppercase ? "uppercase" : "none",
      letterSpacing:   uppercase ? "0.04em" : undefined,
      display:         "inline-flex",
      alignItems:      "center",
      whiteSpace:      "nowrap",
    }}>
      {children}
    </span>
  );
}
