"use client";

import { useState } from "react";

/**
 * Card — the shared surface container.
 *
 * Standardizes the three things every card in the app hand-picks today:
 * background, radius, and shadow. Instead of bespoke `boxShadow` values
 * scattered across dozens of files, a card is a `variant`:
 *   • raised (default) — surface-raised + shadow-card (the hairline ring is in
 *     the token, so no extra border). Home dashboard, project grid, panels.
 *   • flat  — surface-raised + a 0.5px border, no shadow. Nested/inset cards.
 *   • sunken — surface-sunken + border. Wells, read-only groupings.
 *
 * `interactive` adds a hover lift (shadow-md + 1px rise) for clickable cards.
 * Radius is the modal-scale `--radius-lg` (12px) the token system assigns to
 * cards. `padding` covers the common insets; pass `none` for header+rows cards
 * that manage their own padding. `style` is an escape hatch.
 */

export type CardVariant = "raised" | "flat" | "sunken";
export type CardPadding = "none" | "sm" | "md" | "lg";

const PAD: Record<CardPadding, number> = { none: 0, sm: 12, md: 16, lg: 20 };

interface CardProps {
  children:     React.ReactNode;
  variant?:     CardVariant;
  padding?:     CardPadding | number;
  interactive?: boolean;
  onClick?:     () => void;
  style?:       React.CSSProperties;
}

export default function Card({
  children,
  variant = "raised",
  padding = "md",
  interactive = false,
  onClick,
  style,
}: CardProps) {
  const [hov, setHov] = useState(false);
  const pad = typeof padding === "number" ? padding : PAD[padding];

  const bg =
    variant === "sunken" ? "var(--color-surface-sunken)" : "var(--color-surface-raised)";
  const baseShadow = variant === "raised" ? "var(--shadow-card)" : "none";
  const border =
    variant === "flat" || variant === "sunken"
      ? "0.5px solid var(--color-border)"
      : undefined;
  const clickable = interactive || Boolean(onClick);

  return (
    <div
      onClick={onClick}
      onMouseEnter={interactive ? () => setHov(true) : undefined}
      onMouseLeave={interactive ? () => setHov(false) : undefined}
      style={{
        background:   bg,
        borderRadius: "var(--radius-lg)",
        boxShadow:    interactive && hov ? "var(--shadow-md)" : baseShadow,
        border,
        padding:      pad,
        overflow:     "hidden",
        cursor:       clickable ? "pointer" : undefined,
        transition:   interactive ? "box-shadow 0.15s ease, transform 0.15s ease" : undefined,
        transform:    interactive && hov ? "translateY(-1px)" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
