"use client";

// Project options editor — surfaces Status / Type / Priority lists and lets
// the user rename, recolour, reorder, add, or delete. Persists to
// profiles.project_options via the ProjectOptionsContext.
//
// Reorder uses native HTML5 drag-and-drop on each row's grip handle (kept
// lightweight rather than pulling in @hello-pangea/dnd just for this).
// Deletion is soft-blocked when a project is still using the option; the user
// can move those projects first or rename the option instead.

import { useEffect, useRef, useState } from "react";
import { Check, GripVertical, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  useProjectOptions, slugifyOptionKey, OPTION_PALETTE,
  type OptionDimension, type ProjectOption,
} from "@/lib/projects/options";

const SECTIONS: { dim: OptionDimension; title: string }[] = [
  { dim: "status",   title: "Status"   },
  { dim: "type",     title: "Type"     },
  { dim: "priority", title: "Priority" },
];

export default function OptionsMenu({ onClose }: { onClose: () => void }) {
  const { options, setDimension } = useProjectOptions();
  // Counts: how many projects use each option key in each dimension. Used to
  // gate destructive actions (delete is disabled while in-use).
  const [counts, setCounts] = useState<Record<OptionDimension, Record<string, number>>>({
    status: {}, type: {}, priority: {},
  });

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("projects")
        .select("status, type, priority")
        .eq("user_id", user.id);
      if (!data) return;
      const next: Record<OptionDimension, Record<string, number>> = {
        status: {}, type: {}, priority: {},
      };
      for (const row of data as Array<Record<OptionDimension, string | null>>) {
        for (const dim of ["status", "type", "priority"] as OptionDimension[]) {
          const k = row[dim];
          if (k) next[dim][k] = (next[dim][k] ?? 0) + 1;
        }
      }
      setCounts(next);
    })();
  }, []);

  return (
    <div
      style={{
        position: "absolute", right: 0, top: "calc(100% + 6px)",
        width: 340, maxHeight: "calc(100vh - 120px)",
        zIndex: 70,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-md)",
        fontFamily: "inherit",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px 10px",
        borderBottom: "0.5px solid var(--color-border)",
      }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
          Customize project options
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 22, height: 22, borderRadius: 5,
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--color-text-tertiary)",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <X size={13} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 12px" }}>
        {SECTIONS.map((s) => (
          <DimensionEditor
            key={s.dim}
            title={s.title}
            dim={s.dim}
            items={options[s.dim]}
            counts={counts[s.dim] ?? {}}
            onChange={(next) => setDimension(s.dim, next)}
          />
        ))}
        <p style={{
          fontSize: 10.5, lineHeight: 1.5,
          color: "var(--color-text-tertiary)",
          marginTop: 8,
        }}>
          Drag the grip to reorder. Click a swatch to change its colour.
          Renaming keeps existing projects pointing at the same option — only
          the label changes.
        </p>
      </div>
    </div>
  );
}

// ── DimensionEditor ──────────────────────────────────────────────────────────

function DimensionEditor({
  title, items, counts, onChange,
}: {
  title:    string;
  dim:      OptionDimension;
  items:    ProjectOption[];
  counts:   Record<string, number>;
  onChange: (next: ProjectOption[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft,  setDraft]  = useState("");
  const dragIndex = useRef<number | null>(null);

  function rename(i: number, label: string) {
    onChange(items.map((it, idx) => idx === i ? { ...it, label } : it));
  }
  function recolour(i: number, color: string) {
    onChange(items.map((it, idx) => idx === i ? { ...it, color } : it));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function commitAdd() {
    const label = draft.trim();
    if (!label) { setAdding(false); return; }
    const key   = slugifyOptionKey(label, items.map((it) => it.key));
    const color = OPTION_PALETTE[items.length % OPTION_PALETTE.length].value;
    onChange([...items, { key, label, color }]);
    setDraft(""); setAdding(false);
  }

  function onDragStart(i: number) { dragIndex.current = i; }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onDrop(i: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === i) return;
    const copy = [...items];
    const [moved] = copy.splice(from, 1);
    copy.splice(i, 0, moved);
    onChange(copy);
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-grey)" }}>
          {title}
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 6px", borderRadius: 5,
            fontSize: 10.5, fontWeight: 500,
            background: "transparent", color: "var(--color-text-tertiary)",
            border: "none", cursor: "pointer", fontFamily: "inherit",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--color-sage)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--color-text-tertiary)"}
        >
          <Plus size={11} strokeWidth={2.25} /> Add
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it, i) => (
          <OptionRow
            key={it.key}
            option={it}
            inUseCount={counts[it.key] ?? 0}
            onRename={(l) => rename(i, l)}
            onRecolour={(c) => recolour(i, c)}
            onRemove={() => remove(i)}
            onDragStart={() => onDragStart(i)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(i)}
          />
        ))}

        {adding && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 6px" }}>
            <span style={{ width: 16, flexShrink: 0 }} />
            <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--color-sage)", flexShrink: 0 }} />
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  commitAdd();
                if (e.key === "Escape") { setAdding(false); setDraft(""); }
              }}
              onBlur={commitAdd}
              placeholder="New option name"
              style={{
                flex: 1, fontSize: 12,
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--color-sage)",
                outline: "none",
                color: "var(--color-text-primary)",
                fontFamily: "inherit",
                padding: "2px 0",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── OptionRow ────────────────────────────────────────────────────────────────

function OptionRow({
  option, inUseCount,
  onRename, onRecolour, onRemove,
  onDragStart, onDragOver, onDrop,
}: {
  option:     ProjectOption;
  inUseCount: number;
  onRename:   (label: string) => void;
  onRecolour: (color: string) => void;
  onRemove:   () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop:     () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(option.label);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(option.label); }, [option.label]);
  useEffect(() => {
    if (!paletteOpen) return;
    function handler(e: MouseEvent) {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [paletteOpen]);

  function commit() {
    const v = draft.trim();
    if (v && v !== option.label) onRename(v);
    else                          setDraft(option.label);
    setEditing(false);
  }

  const canDelete = inUseCount === 0;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "5px 6px", borderRadius: 6,
        background: hovered ? "var(--color-surface-sunken)" : "transparent",
        transition: "background 0.1s ease",
      }}
    >
      <span
        style={{
          width: 16, height: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--color-text-tertiary)",
          cursor: "grab",
          opacity: hovered ? 1 : 0.5,
        }}
        title="Drag to reorder"
      >
        <GripVertical size={12} strokeWidth={1.75} />
      </span>

      <div ref={paletteRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setPaletteOpen((v) => !v)}
          aria-label="Change colour"
          title="Change colour"
          style={{
            width: 12, height: 12, borderRadius: 99,
            background: option.color,
            border: "0.5px solid rgba(0,0,0,0.10)",
            cursor: "pointer",
            display: "block",
          }}
        />
        {paletteOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 5px)", left: 0,
            zIndex: 10,
            background: "var(--color-surface-raised)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md)",
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: 5,
            width: 168,
          }}>
            {OPTION_PALETTE.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => { onRecolour(p.value); setPaletteOpen(false); }}
                title={p.name}
                aria-label={p.name}
                style={{
                  width: 20, height: 20, borderRadius: 99,
                  background: p.value,
                  border: option.color === p.value ? "1.5px solid var(--color-text-primary)" : "0.5px solid rgba(0,0,0,0.10)",
                  cursor: "pointer", padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {option.color === p.value && <Check size={10} strokeWidth={2.5} color="white" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter")  commit();
            if (e.key === "Escape") { setDraft(option.label); setEditing(false); }
          }}
          style={{
            flex: 1, fontSize: 12,
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--color-sage)",
            outline: "none",
            color: "var(--color-text-primary)",
            fontFamily: "inherit",
            padding: "1px 0",
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{
            flex: 1, fontSize: 12,
            color: "var(--color-text-primary)",
            cursor: "text",
          }}
        >
          {option.label}
        </span>
      )}

      {inUseCount > 0 && (
        <span
          title={`Used by ${inUseCount} project${inUseCount === 1 ? "" : "s"}`}
          style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}
        >
          {inUseCount}
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        disabled={!canDelete}
        aria-label="Delete option"
        title={canDelete ? "Delete option" : "Move or reassign the projects using this option first"}
        style={{
          width: 18, height: 18, borderRadius: 4,
          background: "transparent", border: "none",
          cursor: canDelete ? "pointer" : "not-allowed",
          opacity: hovered && canDelete ? 1 : 0.35,
          color: "var(--color-text-tertiary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "opacity 0.1s ease, color 0.1s ease",
        }}
        onMouseEnter={(e) => { if (canDelete) e.currentTarget.style.color = "var(--color-red-orange)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
      >
        <Trash2 size={11} strokeWidth={1.75} />
      </button>
    </div>
  );
}
