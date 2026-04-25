// Inline Ash mark — the logomark at small size for use inside chips,
// suggestion strips, and any element where Ash is speaking or prompting.
//
// Variants:
//   "on-dark"  — white mark, for use on sage/dark backgrounds
//   "on-light" — sage-colored mark, for use on white/cream backgrounds

interface AshMarkProps {
  size?:    number;
  variant?: "on-dark" | "on-light";
  animate?: boolean;
}

export default function AshMark({ size = 14, variant = "on-light", animate = false }: AshMarkProps) {
  return (
    <img
      src="/Ash-Logomak.svg"
      alt=""
      aria-hidden
      style={{
        width:     size,
        height:    size,
        flexShrink: 0,
        filter:    variant === "on-dark" ? "brightness(0) invert(1)" : undefined,
        opacity:   variant === "on-dark" ? 0.92 : 1,
        animation: animate ? "ash-shimmer 4.5s ease-in-out infinite" : undefined,
      }}
    />
  );
}
