"use client";

interface CheckboxProps {
  checked:   boolean;
  onChange:  () => void;
  disabled?: boolean;
}

export default function Checkbox({ checked, onChange, disabled = false }: CheckboxProps) {
  return (
    <div
      onClick={(e) => { if (disabled) return; e.stopPropagation(); onChange(); }}
      style={{
        width:        16,
        height:       16,
        borderRadius: 4,
        cursor:       disabled ? "not-allowed" : "pointer",
        background:   checked ? "var(--color-sage)" : "transparent",
        border:       checked
          ? "1.5px solid var(--color-sage)"
          : "1.5px solid rgba(31,33,26,0.25)",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        transition:   "all 0.12s ease",
        flexShrink:   0,
        opacity:      disabled ? 0.45 : 1,
      }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}
