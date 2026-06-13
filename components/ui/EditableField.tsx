"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";

// ── Shared inline-edit field ──────────────────────────────────────────────────
//
// One primitive that reproduces the near-identical inline-edit rows that were
// cloned across the Network (Contact / Organization) and Outreach (Target)
// detail panels. Props are the union of every variation those copies needed,
// so each call site renders exactly as it did before:
//
//   • Contact / Organization single-line → defaults (labelWidth 68,
//     openWhenEmpty, "Add <label>…" placeholder).
//   • Organization bio / description     → `multiline`.
//   • Target rows                        → `labelWidth={80}`, no openWhenEmpty
//     (click-to-edit placeholder span), `isLink` on the Link row.
//
// Commit happens on Enter (single-line) / Cmd|Ctrl+Enter (multiline) and on
// blur, and only fires `onSave` when the trimmed value actually changed.
// Escape reverts the draft.

interface Props {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
  /** Label column width in px. Network panels use 68; Target uses 80. */
  labelWidth?: number;
  /** When true (Network), a blank field renders an open input directly and
   *  uses an "Add <label>…" placeholder. When false (Target), a blank field
   *  shows the `placeholder` text as a click-to-edit span. */
  openWhenEmpty?: boolean;
  /** Target's Link row — render a set value as an external anchor with an
   *  inline Edit affordance. */
  isLink?: boolean;
  /** Organization's bio / description — render a textarea variant. */
  multiline?: boolean;
}

export default function EditableField({
  label,
  value,
  onSave,
  placeholder = "—",
  labelWidth = 68,
  openWhenEmpty = false,
  isLink = false,
  multiline = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() {
    setEditing(false);
    const v = draft.trim() || null;
    if (v !== (value || null)) onSave(v);
  }

  // Network surfaces open blanks directly into the input/textarea (no
  // click-on-the-dash detour); Target keeps the click-to-edit placeholder.
  const showInput = editing || (openWhenEmpty && !value);
  // Network's "Add <label>…" affordance only applies when the caller left the
  // placeholder at its "—" default; an explicit placeholder is respected.
  const inputPlaceholder = openWhenEmpty && placeholder === "—"
    ? `Add ${(label || "value").toLowerCase()}…`
    : placeholder;

  // ── Multiline (Organization bio / description) ─────────────────────────────
  if (multiline) {
    return (
      <div style={{ display: "flex", flexDirection: "column", padding: "6px 0", borderBottom: "0.5px solid var(--color-border)", minWidth: 0 }}>
        <span style={{ fontSize: 11, color: "var(--color-grey)", marginBottom: 3 }}>{label}</span>
        {showInput
          ? <textarea value={draft} onChange={e => setDraft(e.target.value)}
              onFocus={() => setEditing(true)} onBlur={commit}
              placeholder={inputPlaceholder}
              onKeyDown={e => { if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); } }}
              autoFocus={editing} rows={editing ? 3 : 2}
              style={{ width: "100%", minWidth: 0, resize: "vertical", fontSize: 12, lineHeight: 1.55, background: "transparent", border: editing ? "0.5px solid var(--color-sage)" : "0.5px solid transparent", borderRadius: 6, padding: editing ? "5px 7px" : "5px 0", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit" }} />
          : <span onClick={() => setEditing(true)} style={{ fontSize: 12, lineHeight: 1.55, color: "#6b6860", cursor: "text", whiteSpace: "pre-wrap", wordBreak: "break-word" }} title="Click to edit">
              {value}
            </span>
        }
      </div>
    );
  }

  // ── Single-line (Contact / Organization / Target) ──────────────────────────
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid var(--color-border)", minWidth: 0 }}>
      <span style={{ fontSize: 11, color: "var(--color-grey)", width: labelWidth, flexShrink: 0 }}>{label}</span>
      {showInput
        ? // minWidth: 0 + width: 0 lets the input shrink to fit the available
          // flex space, so a long value doesn't push the row wider than its
          // parent and trigger horizontal scroll.
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onFocus={() => setEditing(true)} onBlur={commit}
            placeholder={inputPlaceholder}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
            autoFocus={editing}
            style={{ flex: 1, minWidth: 0, width: 0, fontSize: 12, background: "transparent", border: "none", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit", borderBottom: editing ? "1px solid var(--color-sage)" : "1px solid transparent" }} />
        : isLink && value
          ? <span style={{ flex: 1, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <a href={value} target="_blank" rel="noreferrer"
                style={{ color: "var(--color-sage)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
                onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
              >
                {value.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
              <ExternalLink size={10} strokeWidth={1.75} style={{ color: "var(--color-grey)", flexShrink: 0 }} />
              <button onClick={() => setEditing(true)}
                style={{ background: "none", border: "none", color: "var(--color-grey)", fontSize: 10, cursor: "pointer", padding: "0 4px", marginLeft: "auto", fontFamily: "inherit" }}
                title="Edit link"
              >
                Edit
              </button>
            </span>
          : <span onClick={() => setEditing(true)} style={{ flex: 1, minWidth: 0, fontSize: 12, color: value ? "#6b6860" : "var(--color-grey)", cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="Click to edit">
              {value || placeholder}
            </span>
      }
    </div>
  );
}
