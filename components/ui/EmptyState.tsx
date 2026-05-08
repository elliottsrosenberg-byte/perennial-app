"use client";

import AshMark from "@/components/ui/AshMark";

interface EmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  body: string;
  /** Primary CTA — rendered as a button */
  action?: { label: string; onClick: () => void };
  /** Optional Ash prompt to send when user clicks "Ask Ash" */
  ashPrompt?: string;
  /** Optional list of 2–3 short educational bullets */
  tips?: string[];
}

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";

function openAsh(message: string) {
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}

export default function EmptyState({
  icon, heading, body, action, ashPrompt, tips,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "56px 32px",
        maxWidth: 480,
        margin: "0 auto",
        textAlign: "center",
        gap: 0,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 56, height: 56, borderRadius: 16, marginBottom: 20,
          background: "var(--color-cream)",
          border: "0.5px solid var(--color-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26,
        }}
      >
        {icon}
      </div>

      {/* Heading + body */}
      <h3
        style={{
          fontSize: 15, fontWeight: 600, marginBottom: 8,
          color: "var(--color-charcoal)", fontFamily: "var(--font-display)",
        }}
      >
        {heading}
      </h3>
      <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--color-grey)", marginBottom: tips ? 20 : 24 }}>
        {body}
      </p>

      {/* Educational tips */}
      {tips && tips.length > 0 && (
        <div
          style={{
            alignSelf: "stretch", marginBottom: 24,
            background: "var(--color-off-white)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 12, padding: "14px 16px",
            textAlign: "left",
          }}
        >
          <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 10 }}>
            How it works
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tips.map((tip, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 10, color: "var(--color-sage)", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                  {i + 1}
                </span>
                <p style={{ fontSize: 11, lineHeight: 1.55, color: "#6b6860", margin: 0 }}>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        {action && (
          <button
            onClick={action.onClick}
            style={{
              padding: "8px 18px", fontSize: 12, fontWeight: 500,
              background: "var(--color-charcoal)", color: "var(--color-warm-white)",
              border: "none", borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit", transition: "opacity 0.12s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {action.label}
          </button>
        )}
        {ashPrompt && (
          <button
            onClick={() => openAsh(ashPrompt)}
            style={{
              padding: "8px 14px", fontSize: 12, fontWeight: 500,
              background: "transparent",
              border: "0.5px solid var(--color-border)",
              borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 7,
              color: "var(--color-ash-dark)",
              transition: "background 0.1s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-ash-tint)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div
              style={{
                width: 18, height: 18, borderRadius: "50%",
                background: ASH_GRADIENT, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <AshMark size={10} variant="on-dark" />
            </div>
            Ask Ash
          </button>
        )}
      </div>
    </div>
  );
}
