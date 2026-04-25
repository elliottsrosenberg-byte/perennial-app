"use client";

interface NumberStepperProps {
  value:     number;
  onChange:  (v: number) => void;
  min?:      number;
  max?:      number;
  step?:     number;
  prefix?:   string;
  suffix?:   string;
  disabled?: boolean;
}

export default function NumberStepper({
  value, onChange, min = 0, max = 9999, step = 1, prefix = "", suffix = "", disabled = false,
}: NumberStepperProps) {
  const btnBase: React.CSSProperties = {
    width:   36,
    flexShrink: 0,
    border:  "none",
    background: "transparent",
    fontSize: 18,
    lineHeight: 1,
    color:   "var(--color-text-secondary)",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.08s ease",
    height: "100%",
  };

  return (
    <div style={{
      display:      "inline-flex",
      alignItems:   "center",
      height:       36,
      background:   "var(--color-surface-sunken)",
      border:       "0.5px solid var(--color-border)",
      borderRadius: 8,
      overflow:     "hidden",
      opacity:      disabled ? 0.5 : 1,
    }}>
      <button
        style={{ ...btnBase, cursor: (disabled || value <= min) ? "not-allowed" : "pointer", opacity: value <= min ? 0.3 : 1 }}
        onClick={() => !disabled && onChange(Math.max(min, value - step))}
        disabled={disabled || value <= min}
        onMouseEnter={(e) => { if (!disabled && value > min) e.currentTarget.style.background = "var(--color-surface-app)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        −
      </button>
      <div style={{ width: 1, height: "55%", background: "var(--color-border)" }} />
      <div style={{
        minWidth:   60,
        textAlign:  "center",
        fontSize:   13,
        fontWeight: 500,
        color:      "var(--color-text-primary)",
        padding:    "0 14px",
        userSelect: "none",
      }}>
        {prefix}{value}{suffix}
      </div>
      <div style={{ width: 1, height: "55%", background: "var(--color-border)" }} />
      <button
        style={{ ...btnBase, cursor: (disabled || value >= max) ? "not-allowed" : "pointer", opacity: value >= max ? 0.3 : 1 }}
        onClick={() => !disabled && onChange(Math.min(max, value + step))}
        disabled={disabled || value >= max}
        onMouseEnter={(e) => { if (!disabled && value < max) e.currentTarget.style.background = "var(--color-surface-app)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        +
      </button>
    </div>
  );
}
