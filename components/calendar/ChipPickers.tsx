"use client";

// Perennial-styled date/time chips for the calendar create/edit cards
// (EventCard, QuickTaskCard). Replaces the old invisible native
// <input type="date|time"> overlay — whose native picker icon got clipped
// by the narrow chip, so clicks rarely opened it (PER-84) — with on-brand
// popovers that match components/ui/DatePicker.
//
// The popovers render in a portal anchored to the chip's viewport rect, so
// they're never clipped by the host card's `overflow: auto`. Because the
// portal lives outside the host card's DOM, every pointer/scroll/key event
// inside the popover is stopped from propagating to the document — otherwise
// the host card's own click-outside listener would treat it as an outside
// click and close the whole card.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MonthGrid } from "@/components/ui/DatePicker";

function pad(n: number): string { return n.toString().padStart(2, "0"); }

function fmtTimeChip(timeHHMM: string): string {
  const [h, m] = timeHHMM.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${pad(m)} ${period}`;
}

function fmtDateChip(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const CHIP_STYLE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 8px", borderRadius: 6,
  background: "var(--color-cream)",
  border: "0.5px solid var(--color-border)",
  fontSize: 12, color: "var(--color-text-primary)",
  position: "relative", fontFamily: "inherit",
};

/**
 * Trigger chip + portaled popover. Handles open/close, viewport-anchored
 * positioning (flips above the chip when there's no room below), and
 * outside-click / Escape / scroll dismissal — all scoped so events don't
 * leak to the host card.
 */
function ChipPopover({
  label, disabled, popoverWidth, children,
}: {
  label: string;
  disabled?: boolean;
  popoverWidth: number;
  /** Render-prop; receives a `close` callback to call after a selection. */
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const POP_MAX_H = 300;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const placeAbove = r.bottom + 4 + POP_MAX_H > vh && r.top - 4 - POP_MAX_H > 8;
    const top = placeAbove ? r.top - 4 : r.bottom + 4;
    const left = Math.max(8, Math.min(r.left, vw - popoverWidth - 8));
    setCoords({ top, left, placeAbove });
  };

  const toggle = () => {
    if (disabled) return;
    if (!open) place();
    setOpen((v) => !v);
  };
  const close = () => setOpen(false);

  // Dismiss on outside mousedown, Escape, or any scroll. The outside check
  // runs in the capture phase so we see the event before it reaches the host
  // card; we don't close when the interaction is inside the popover or the
  // trigger itself.
  //
  // The popover is portaled to <body>, outside the host card's DOM, so a
  // native mousedown inside it would bubble to the card's own
  // document-level click-outside listener and close the whole card. React's
  // synthetic stopPropagation can't prevent that, so we attach a NATIVE
  // bubble-phase listener on the popover node to stop propagation before it
  // reaches document.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    }
    function onScroll() { close(); }
    const stopNative = (e: Event) => e.stopPropagation();
    const pop = popRef.current;
    pop?.addEventListener("mousedown", stopNative);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      pop?.removeEventListener("mousedown", stopNative);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={toggle}
        disabled={disabled}
        style={{
          ...CHIP_STYLE,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.6 : 1,
          ...(open ? { borderColor: "var(--color-sage)" } : null),
        }}
      >
        {label}
      </button>

      {open && coords && createPortal(
        <div
          ref={popRef}
          // Stop pointer events from reaching the host card's click-outside.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: coords.left,
            ...(coords.placeAbove
              ? { bottom: window.innerHeight - coords.top }
              : { top: coords.top }),
            zIndex: 80,
            width: popoverWidth,
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-md)",
            overflow: "hidden",
          }}
        >
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  );
}

export function DateChip({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const selected = value ? new Date(value + "T00:00:00") : null;
  return (
    <ChipPopover label={fmtDateChip(value)} disabled={disabled} popoverWidth={252}>
      {(close) => (
        <div style={{ padding: 14 }}>
          <MonthGrid
            selected={selected}
            onSelect={(d) => {
              onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
              close();
            }}
          />
        </div>
      )}
    </ChipPopover>
  );
}

// All 15-minute slots in a day, as "HH:MM".
const TIME_SLOTS: string[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${pad(h)}:${pad(m)}`;
});

export function TimeChip({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <ChipPopover label={fmtTimeChip(value)} disabled={disabled} popoverWidth={132}>
      {(close) => <TimeList value={value} onChange={onChange} close={close} />}
    </ChipPopover>
  );
}

function TimeList({ value, onChange, close }: { value: string; onChange: (v: string) => void; close: () => void }) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  // Snap an arbitrary value (e.g. 09:07) to the nearest slot for highlighting.
  const [h, m] = value.split(":").map(Number);
  const nearest = `${pad(h)}:${pad(Math.round(m / 15) * 15 % 60)}`;

  useLayoutEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div style={{ maxHeight: 240, overflowY: "auto", padding: 4 }}>
      {TIME_SLOTS.map((slot) => {
        const isSel = slot === nearest;
        return (
          <button
            type="button"
            key={slot}
            ref={isSel ? selectedRef : undefined}
            onClick={() => { onChange(slot); close(); }}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "6px 10px", borderRadius: 6, border: "none",
              fontSize: 12, fontFamily: "inherit", cursor: "pointer",
              fontWeight: isSel ? 600 : 400,
              background: isSel ? "var(--color-sage)" : "transparent",
              color: isSel ? "white" : "var(--color-text-primary)",
              transition: "background 0.08s ease",
            }}
            onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
            onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
          >
            {fmtTimeChip(slot)}
          </button>
        );
      })}
    </div>
  );
}
