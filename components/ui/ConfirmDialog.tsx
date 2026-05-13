"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open:        boolean;
  title:       string;
  body:        string;
  confirmLabel?: string;
  cancelLabel?:  string;
  /** "danger" tints the confirm button red-orange; "primary" uses sage. */
  tone?:       "danger" | "primary";
  onConfirm:   () => void;
  onCancel:    () => void;
}

export default function ConfirmDialog({
  open, title, body,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  tone = "primary",
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBg     = tone === "danger" ? "var(--color-red-orange)" : "var(--color-sage)";
  const confirmHover  = tone === "danger" ? "#c8350a"                 : "var(--color-sage-hover)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "perennial-confirm-bg 0.16s ease-out",
      }}
    >
      <style>{`
        @keyframes perennial-confirm-bg   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes perennial-confirm-card { from { opacity: 0; transform: scale(0.96) translateY(6px); }
                                            to   { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 380,
          background: "var(--color-surface-raised)",
          color: "var(--color-text-primary)",
          borderRadius: 14,
          border: "0.5px solid var(--color-border)",
          boxShadow: "var(--shadow-overlay)",
          padding: "20px 22px 18px",
          fontFamily: "inherit",
          animation: "perennial-confirm-card 0.2s ease-out",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          {tone === "danger" && (
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: "rgba(220,62,13,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--color-red-orange)",
            }}>
              <AlertTriangle size={18} strokeWidth={1.75} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              fontFamily: "var(--font-display)",
              fontSize: 16, fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 4, letterSpacing: "-0.01em",
            }}>
              {title}
            </h3>
            <p style={{
              fontSize: 12, lineHeight: 1.6,
              color: "var(--color-text-secondary)",
            }}>
              {body}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 500,
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "0.5px solid var(--color-border-strong)",
              borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.1s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "7px 16px", fontSize: 12, fontWeight: 600,
              background: confirmBg, color: "white",
              border: "none", borderRadius: 8, cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.1s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = confirmHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = confirmBg)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
