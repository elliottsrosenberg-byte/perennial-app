"use client";

interface ToggleProps {
  checked:  boolean;
  onChange: () => void;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      style={{
        position:   "relative",
        width:      36,
        height:     20,
        borderRadius: 9999,
        border:     "none",
        cursor:     disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--color-sage)" : "rgba(31,33,26,0.18)",
        transition: "background 0.15s ease",
        padding:    0,
        flexShrink: 0,
        opacity:    disabled ? 0.45 : 1,
      }}
    >
      <span
        style={{
          position:     "absolute",
          top:          2,
          left:         checked ? "calc(100% - 18px)" : 2,
          width:        16,
          height:       16,
          borderRadius: "50%",
          background:   "white",
          transition:   "left 0.15s ease",
          boxShadow:    "0 1px 3px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}
