"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Modal — the shared overlay + panel shell for every dialog in the app.
 *
 * Owns the parts that were being re-cloned in ~20 files: the fixed blurred
 * scrim, click-outside-to-close, Escape-to-close, body scroll-lock, centering,
 * and the fade/scale-in animation. Callers supply only their content.
 *
 * Two mount patterns, both supported:
 *   • `{show && <Modal onClose=…>…</Modal>}` — omit `open`; shown while mounted.
 *   • `<Modal open={x} onClose=…>…</Modal>` — self-gates on `open` (returns null
 *     when closed), matching the ConfirmDialog pattern.
 *
 * Structure is opt-in: pass `title` (or a custom `header`) for a divider-topped
 * header with a close button, and/or `footer` for a divider-topped action row.
 * Pass neither for a bare padded panel (ConfirmDialog-style).
 */

export type ModalSize = "sm" | "md" | "lg" | "xl";

const MAX_WIDTH: Record<ModalSize, number> = {
  sm: 380, // confirm prompts, small forms
  md: 460,
  lg: 512, // the common form modal (was max-w-lg)
  xl: 640,
};

interface ModalProps {
  onClose:  () => void;
  children: React.ReactNode;
  /** Controlled visibility. Omit to show whenever mounted. */
  open?:    boolean;
  /** Convenience header — title text + close button + divider. */
  title?:   string;
  /** Custom header node (replaces `title`); you own its close affordance. */
  header?:  React.ReactNode;
  /** Action row, rendered in a divider-topped footer. */
  footer?:  React.ReactNode;
  size?:    ModalSize;
  /** Exact max-width in px; overrides `size` when a modal needs a specific width. */
  maxWidth?: number;
  /** Overrides the default body padding ("20px 22px"). */
  bodyStyle?:       React.CSSProperties;
  closeOnBackdrop?: boolean;
  closeOnEsc?:      boolean;
  /** aria-label when no `title` is provided. */
  ariaLabel?: string;
}

export default function Modal({
  onClose,
  children,
  open,
  title,
  header,
  footer,
  size = "md",
  maxWidth,
  bodyStyle,
  closeOnBackdrop = true,
  closeOnEsc = true,
  ariaLabel,
}: ModalProps) {
  const visible = open !== false;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [visible, closeOnEsc, onClose]);

  if (!visible) return null;

  const hasHeader = Boolean(header || title);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? ariaLabel}
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(31,33,26,0.45)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "perennial-modal-bg 0.16s ease-out",
      }}
    >
      <style>{`
        @keyframes perennial-modal-bg   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes perennial-modal-card { from { opacity: 0; transform: scale(0.96) translateY(6px); }
                                          to   { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: maxWidth ?? MAX_WIDTH[size],
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface-raised)",
          color: "var(--color-text-primary)",
          borderRadius: 16,
          border: "0.5px solid var(--color-border)",
          boxShadow: "var(--shadow-overlay)",
          overflow: "hidden",
          fontFamily: "inherit",
          animation: "perennial-modal-card 0.2s ease-out",
        }}
      >
        {header ??
          (title && (
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "16px 20px",
                borderBottom: "0.5px solid var(--color-border)",
                flexShrink: 0,
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16, fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.01em",
                  minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 28, height: 28, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, border: "none", background: "transparent",
                  color: "var(--color-text-tertiary)", cursor: "pointer",
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>
          ))}

        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            padding: bodyStyle ? undefined : "20px 22px",
            ...bodyStyle,
          }}
        >
          {children}
        </div>

        {footer && (
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              gap: 8, padding: "14px 20px",
              borderTop: "0.5px solid var(--color-border)",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
