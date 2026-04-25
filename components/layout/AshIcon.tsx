"use client";

// Floating Ash button — bottom-right anchor across all app pages.
// Uses the Ash logomark with a sage gradient background and a slow
// breathing glow animation to convey the generative / living nature of Ash.

export default function AshIcon() {
  return (
    <button
      title="Ask Ash"
      style={{
        position:      "fixed",
        bottom:        24,
        right:         24,
        width:         44,
        height:        44,
        borderRadius:  "50%",
        border:        "none",
        cursor:        "pointer",
        zIndex:        20,
        display:       "flex",
        alignItems:    "center",
        justifyContent:"center",
        background:    "linear-gradient(145deg, #a8b886 0%, var(--color-ash-mid) 60%, var(--color-ash-dark) 100%)",
        boxShadow:     "0 2px 10px rgba(155,163,122,0.38), 0 1px 3px rgba(0,0,0,0.12)",
        animation:     "ash-glow 4.5s ease-in-out infinite",
        transition:    "transform 0.15s ease",
        flexShrink:    0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform          = "scale(1.07)";
        e.currentTarget.style.animationPlayState = "paused";
        e.currentTarget.style.boxShadow          =
          "0 6px 24px rgba(155,163,122,0.65), 0 2px 6px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform          = "scale(1)";
        e.currentTarget.style.animationPlayState = "running";
        e.currentTarget.style.boxShadow          =
          "0 2px 10px rgba(155,163,122,0.38), 0 1px 3px rgba(0,0,0,0.12)";
      }}
    >
      <img
        src="/Ash-Logomak.svg"
        alt="Ash"
        style={{
          width:   26,
          height:  26,
          filter:  "brightness(0) invert(1)",
          opacity: 0.92,
          animation: "ash-shimmer 4.5s ease-in-out infinite",
        }}
      />
    </button>
  );
}
