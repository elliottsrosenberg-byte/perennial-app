"use client";

// Customize Categories — modal for editing user-defined transaction
// categories that augment the built-in five. The built-ins are listed
// read-only (you can't rename "Materials" — it's an enum value used by
// expenses + invoices). Customs are stored on profiles.custom_categories
// as a jsonb array and persisted on save via a single UPDATE.

import { useEffect, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Select from "@/components/ui/Select";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseCategory } from "@/types/database";
import {
  CATEGORY_PALETTE,
  parseCustomCategories,
  type CustomCategory,
} from "@/lib/finance/customCategories";

// ── Built-in display registry ──────────────────────────────────────────────
// Mirrors AddExpenseModal's labels. Read-only in this surface.

const BUILTIN_LABELS: Record<ExpenseCategory, string> = {
  materials:  "Materials",
  travel:     "Travel",
  production: "Production",
  software:   "Software",
  other:      "Other",
};
const BUILTIN_ORDER: ExpenseCategory[] = ["materials", "travel", "production", "software", "other"];

const BUILTIN_PREVIEW: Record<ExpenseCategory, string> = {
  materials:  "#a37f12",
  travel:     "#9BA37A",
  production: "#7f6f9c",
  software:   "#5a6470",
  other:      "#9a9690",
};

// ── Tiny utility: stable UUID for new customs (no crypto polyfill needed
// since modern browsers expose crypto.randomUUID). ────────────────────────
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback: timestamp + random hex.
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface Props {
  initial: CustomCategory[];
  onClose: () => void;
  onSaved: (next: CustomCategory[]) => void;
}

export default function CustomizeCategoriesModal({ initial, onClose, onSaved }: Props) {
  const [items, setItems] = useState<CustomCategory[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomCategory | null>(null);

  // New-category draft. Inline form at the bottom — keeps the modal small.
  const [draftLabel, setDraftLabel]       = useState("");
  const [draftColor, setDraftColor]       = useState(CATEGORY_PALETTE[0].value);
  const [draftRoutes, setDraftRoutes]     = useState<ExpenseCategory>("other");

  function addDraft() {
    const label = draftLabel.trim();
    if (!label) return;
    setItems((prev) => [...prev, {
      id:       newId(),
      label,
      color:    draftColor,
      routesTo: draftRoutes,
    }]);
    setDraftLabel("");
    setDraftColor(CATEGORY_PALETTE[(items.length + 1) % CATEGORY_PALETTE.length].value);
    setDraftRoutes("other");
  }

  function updateItem(id: string, patch: Partial<CustomCategory>) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error: e } = await supabase
        .from("profiles")
        .update({ custom_categories: items })
        .eq("user_id", user.id);
      if (e) throw e;
      onSaved(items);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const routesOptions = BUILTIN_ORDER.map((k) => ({ value: k, label: `Routes to ${BUILTIN_LABELS[k]}` }));

  return (
    <>
    <Modal
      onClose={onClose}
      maxWidth={520}
      ariaLabel="Customize categories"
      bodyStyle={{ padding: 0 }}
      header={
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px 12px",
          borderBottom: "0.5px solid var(--color-border)",
        }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
              Customize categories
            </p>
            <p style={{ fontSize: 11, color: "var(--color-grey)", marginTop: 2 }}>
              Add your own categories alongside the built-ins. They&apos;ll appear in the row picker.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{
              width: 26, height: 26, borderRadius: 6, background: "transparent",
              border: "none", cursor: "pointer", color: "var(--color-grey)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <X size={14} />
          </button>
        </div>
      }
      footer={
        <>
          {error && (
            <span style={{ flex: 1, fontSize: 11, color: "var(--color-red-orange)" }}>{error}</span>
          )}
          <button onClick={onClose}
            style={{
              padding: "7px 14px", borderRadius: 6,
              background: "transparent", color: "var(--color-grey)",
              border: "0.5px solid var(--color-border)",
              fontSize: 12, fontFamily: "inherit", cursor: "pointer",
            }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{
              padding: "7px 14px", borderRadius: 6,
              background: "var(--color-sage)", color: "white",
              border: "none", fontSize: 12, fontWeight: 500,
              fontFamily: "inherit",
              cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
            }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
        {/* Body */}
        <div style={{ padding: "14px 18px" }}>
          {/* Built-ins */}
          <p style={SECTION_LABEL_STYLE}>Built-in</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            {BUILTIN_ORDER.map((k) => (
              <div key={k} style={ROW_STYLE}>
                <span style={{
                  width: 10, height: 10, borderRadius: 99,
                  background: BUILTIN_PREVIEW[k],
                  border: "0.5px solid rgba(0,0,0,0.1)",
                  flexShrink: 0,
                }} />
                <span style={{ flex: 1, fontSize: 12, color: "var(--color-charcoal)" }}>
                  {BUILTIN_LABELS[k]}
                </span>
                <span style={{ fontSize: 10, color: "var(--color-grey)" }}>built-in</span>
              </div>
            ))}
          </div>

          {/* Customs */}
          <p style={SECTION_LABEL_STYLE}>Custom</p>
          {items.length === 0 ? (
            <p style={{ fontSize: 11.5, color: "var(--color-grey)", padding: "6px 4px 14px" }}>
              No custom categories yet. Add one below.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
              {items.map((it) => (
                <CustomRow
                  key={it.id}
                  item={it}
                  onChange={(patch) => updateItem(it.id, patch)}
                  onDelete={() => setConfirmDelete(it)}
                />
              ))}
            </div>
          )}

          {/* New-category form */}
          <div style={{
            border: "0.5px dashed var(--color-border)",
            borderRadius: 10,
            padding: "10px 12px",
            background: "var(--color-warm-white)",
          }}>
            <p style={{ ...SECTION_LABEL_STYLE, marginBottom: 8 }}>+ New category</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <SwatchPicker value={draftColor} onChange={setDraftColor} />
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addDraft(); }}
                placeholder="Label, e.g. Studio rent"
                style={{
                  flex: 1, fontSize: 12,
                  padding: "6px 10px", borderRadius: 6,
                  border: "0.5px solid var(--color-border)",
                  background: "var(--color-off-white)",
                  color: "var(--color-charcoal)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <Select
                  value={draftRoutes}
                  onChange={(v) => setDraftRoutes(v as ExpenseCategory)}
                  options={routesOptions}
                />
              </div>
              <button
                type="button"
                onClick={addDraft}
                disabled={!draftLabel.trim()}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "6px 12px", borderRadius: 6,
                  background: "var(--color-sage)", color: "white",
                  fontSize: 12, fontWeight: 500,
                  border: "none", cursor: draftLabel.trim() ? "pointer" : "not-allowed",
                  opacity: draftLabel.trim() ? 1 : 0.5,
                  fontFamily: "inherit",
                }}
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
        </div>

    </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete "${confirmDelete?.label ?? ""}"?`}
        body="Transactions previously tagged with this category will fall back to their auto-detected category. This only affects display — no expenses are removed."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) removeItem(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize:       10,
  fontWeight:     700,
  textTransform:  "uppercase",
  letterSpacing:  "0.06em",
  color:          "var(--color-grey)",
  marginBottom:   6,
};

const ROW_STYLE: React.CSSProperties = {
  display:    "flex",
  alignItems: "center",
  gap:        8,
  padding:    "6px 8px",
  borderRadius: 6,
  background: "transparent",
};

// ── CustomRow ──────────────────────────────────────────────────────────────

function CustomRow({ item, onChange, onDelete }: {
  item:     CustomCategory;
  onChange: (patch: Partial<CustomCategory>) => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...ROW_STYLE,
        background: hovered ? "var(--color-surface-sunken)" : "transparent",
        transition: "background 0.1s ease",
      }}
    >
      <SwatchPicker value={item.color} onChange={(c) => onChange({ color: c })} />
      <input
        value={item.label}
        onChange={(e) => onChange({ label: e.target.value })}
        style={{
          flex: 1, fontSize: 12,
          padding: "3px 6px", borderRadius: 4,
          background: "transparent",
          border: "none",
          color: "var(--color-charcoal)",
          outline: "none",
          fontFamily: "inherit",
        }}
        onFocus={(e) => e.currentTarget.style.background = "var(--color-off-white)"}
        onBlur={(e)  => e.currentTarget.style.background = "transparent"}
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete category"
        style={{
          width: 22, height: 22, borderRadius: 4,
          background: "transparent", border: "none",
          cursor: "pointer", color: "var(--color-grey)",
          opacity: hovered ? 1 : 0.45,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-red-orange)"}
        onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-grey)"}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── SwatchPicker ───────────────────────────────────────────────────────────

function SwatchPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change color"
        style={{
          width: 16, height: 16, borderRadius: 99,
          background: value,
          border: "0.5px solid rgba(0,0,0,0.15)",
          cursor: "pointer",
          padding: 0,
          display: "block",
        }}
      />
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "transparent" }}
          />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0,
            zIndex: 51,
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md)",
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
            width: 140,
          }}>
            {CATEGORY_PALETTE.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => { onChange(p.value); setOpen(false); }}
                title={p.name}
                style={{
                  width: 24, height: 24, borderRadius: 99,
                  background: p.value,
                  border: value === p.value ? "1.5px solid var(--color-charcoal)" : "0.5px solid rgba(0,0,0,0.1)",
                  cursor: "pointer", padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {value === p.value && <Check size={11} color="white" strokeWidth={2.5} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
