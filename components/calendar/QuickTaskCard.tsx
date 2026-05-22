"use client";

// Lightweight inline card for creating a task from the calendar surface.
// Mirrors EventCard's right-anchored 340px shape so the create-event
// and create-task flows feel symmetric. The full NewTaskModal still
// exists for the sidebar "+ New task" button (project + contact pickers
// + date picker); this card is intentionally smaller — title, optional
// time, description.
//
// Tasks support an OPTIONAL time-of-day via tasks.due_at. When the
// "Set time" toggle is on, the calendar promotes the task into the
// time grid as a chip at that exact time. When off, the task lives in
// the date-only tasks ribbon at the top of the day column.

import { useEffect, useRef, useState } from "react";
import { X, Clock, FileText, ArrowRight } from "lucide-react";

interface Props {
  /** The day this quick-create was triggered for (tasks-ribbon click). */
  day:        Date;
  /** Pre-selected time of day. When provided, the "Set time" toggle is
   *  pre-flipped on and the time chips render. Lets the calendar reuse
   *  this card from the time grid too (e.g. dragging into the grid). */
  defaultTime?: string;        // HH:MM, 24h
  defaultEndTime?: string;
  /** Anchored position (right-edge of the source cell, falling back to
   *  the calendar's top-right). */
  anchorRect?: DOMRect | null;
  onClose:    () => void;
  onCreate:   (input: QuickTaskInput) => Promise<void> | void;
}

export interface QuickTaskInput {
  title:       string;
  dueDate:     string;        // YYYY-MM-DD
  dueAt:       string | null; // ISO timestamp when time-of-day set
  description: string | null;
}

function pad(n: number): string { return n.toString().padStart(2, "0"); }

function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function combineLocalIso(dateStr: string, timeStr: string): string {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const [h, mm]    = timeStr.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, dd, h, mm, 0, 0).toISOString();
}

function fmtTimeChip(timeHHMM: string): string {
  const [h, m] = timeHHMM.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${pad(m)} ${period}`;
}

export default function QuickTaskCard({
  day, defaultTime, defaultEndTime, anchorRect, onClose, onCreate,
}: Props) {
  const dueDate = toLocalDateInput(day);
  const [title,       setTitle]       = useState("");
  const [withTime,    setWithTime]    = useState(!!defaultTime);
  const [time,        setTime]        = useState(defaultTime ?? "09:00");
  // End time is captured for symmetry with the event flow but tasks only
  // persist a single moment (due_at). We surface the picker so a user
  // dragging on the time grid sees the range they selected, even if only
  // the start ends up on the task. Custom task ranges are deferred.
  const [endTime,     setEndTime]     = useState(defaultEndTime ?? "09:30");
  const [description, setDescription] = useState("");
  const [saving,      setSaving]      = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef  = useRef<HTMLDivElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Click-outside to close — armed after the first frame so the same
  // mouseup that opened the card from a ribbon click doesn't immediately
  // dismiss it.
  useEffect(() => {
    let armed = false;
    const arm = window.setTimeout(() => { armed = true; }, 0);
    function onDown(e: MouseEvent) {
      if (!armed) return;
      if (!cardRef.current) return;
      if (cardRef.current.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate({
        title:       title.trim(),
        dueDate,
        dueAt:       withTime ? combineLocalIso(dueDate, time) : null,
        description: description.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // Anchored positioning — same logic as EventCard. With a rect we
  // anchor to its right edge, flipping left if it would overflow; without
  // a rect we fall back to the right edge of the viewport (matches the
  // create-event card).
  const PANEL_W = 340;
  const positionStyle: React.CSSProperties = (() => {
    if (!anchorRect || typeof window === "undefined") {
      return { top: 64, right: 16 };
    }
    const GAP = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    if (anchorRect.right + GAP + PANEL_W + 8 <= vw) {
      left = anchorRect.right + GAP;
    } else if (anchorRect.left - GAP - PANEL_W >= 8) {
      left = anchorRect.left - GAP - PANEL_W;
    } else {
      left = Math.max(8, vw - PANEL_W - 8);
    }
    const desiredTop = anchorRect.top - 8;
    const top = Math.max(8, Math.min(vh - 400 - 8, desiredTop));
    return { top, left };
  })();

  return (
    <div
      ref={cardRef}
      style={{
        position: "fixed",
        ...positionStyle,
        width: PANEL_W,
        background: "var(--color-off-white)",
        border:     "0.5px solid var(--color-border)",
        borderRadius: 14,
        boxShadow:  "0 8px 28px rgba(0,0,0,0.16)",
        fontFamily: "inherit",
        zIndex: 60,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "0.5px solid var(--color-border)",
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>Task</span>
        <button
          onClick={onClose}
          style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, color: "var(--color-grey)", background: "transparent", border: "none", cursor: "pointer" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <X size={13} />
        </button>
      </div>

      {/* Title */}
      <div style={{ padding: "14px 16px 6px" }}>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          placeholder="Task title"
          style={{
            width: "100%",
            fontSize: 15, fontWeight: 500,
            color: "var(--color-charcoal)",
            background: "transparent", border: "none", outline: "none",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Date row — read-only (this card is always anchored to the cell's day) */}
      <div style={{ padding: "4px 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "3px 8px", borderRadius: 6,
          background: "var(--color-cream)",
          border: "0.5px solid var(--color-border)",
          fontSize: 12, color: "var(--color-text-primary)",
        }}>
          {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Time row — only when "Set time" is on */}
      {withTime && (
        <div style={{ padding: "0 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
          <TimeChip value={time} onChange={setTime} />
          <ArrowRight size={11} style={{ color: "var(--color-text-tertiary)" }} />
          <TimeChip value={endTime} onChange={setEndTime} />
        </div>
      )}

      {/* Set-time / no-time toggle row */}
      <div style={{ padding: "2px 16px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--color-text-tertiary)", display: "inline-flex" }}>
          <Clock size={12} />
        </span>
        <span style={{ flex: 1, fontSize: 12, color: "var(--color-text-primary)" }}>Set time</span>
        <button
          type="button"
          role="switch"
          aria-checked={withTime}
          onClick={() => setWithTime(v => !v)}
          style={{
            width: 26, height: 14, borderRadius: 999, border: "none",
            background: withTime ? "var(--color-sage)" : "var(--color-border-strong)",
            position: "relative", cursor: "pointer", padding: 0,
            transition: "background 0.15s ease",
          }}
        >
          <span style={{
            position: "absolute",
            top: 1, left: withTime ? 13 : 1,
            width: 12, height: 12, borderRadius: 999,
            background: "white",
            boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
            transition: "left 0.15s ease",
          }} />
        </button>
      </div>

      <div style={{ height: 1, background: "var(--color-border)" }} />

      {/* Description */}
      <div style={{ padding: "8px 16px 12px", display: "flex", gap: 10 }}>
        <FileText size={13} style={{ color: "var(--color-text-tertiary)", marginTop: 8, flexShrink: 0 }} />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes, context, links"
          rows={2}
          style={{
            flex: 1,
            padding: "6px 8px", fontSize: 12,
            background: "transparent",
            border: "0.5px solid transparent",
            borderRadius: 6,
            fontFamily: "inherit",
            color: "var(--color-text-primary)",
            outline: "none",
            resize: "vertical", minHeight: 44,
          }}
        />
      </div>

      <div style={{
        display: "flex", justifyContent: "flex-end", gap: 8,
        padding: "10px 16px",
        borderTop: "0.5px solid var(--color-border)",
      }}>
        <button
          onClick={onClose}
          style={{
            padding: "6px 12px", fontSize: 12, borderRadius: 7,
            color: "var(--color-grey)", border: "0.5px solid var(--color-border)",
            background: "transparent", cursor: "pointer", fontFamily: "inherit",
          }}
        >Cancel</button>
        <button
          onClick={submit}
          disabled={!title.trim() || saving}
          style={{
            padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 7,
            color: "white", background: "var(--color-sage)",
            opacity: (!title.trim() || saving) ? 0.5 : 1,
            border: "none", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Add task"}
        </button>
      </div>
    </div>
  );
}

function TimeChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 6,
        background: "var(--color-cream)",
        border: "0.5px solid var(--color-border)",
        fontSize: 12, color: "var(--color-text-primary)",
        cursor: "pointer", position: "relative",
      }}
    >
      {fmtTimeChip(value)}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: "absolute", inset: 0,
          opacity: 0, cursor: "pointer",
        }}
      />
    </label>
  );
}
