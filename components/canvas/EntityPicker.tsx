"use client";

// Modal for choosing an entity (project/task/note/contact/event) to drop on the
// canvas as a reference card. Debounced search across the active type.

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  searchEntities,
  ENTITY_KINDS,
  type EntityKind,
  type EntityResult,
} from "@/lib/canvas/entities";

interface Props {
  initialKind: EntityKind;
  onPick: (r: EntityResult) => void;
  onClose: () => void;
}

export default function EntityPicker({ initialKind, onPick, onClose }: Props) {
  const [kind, setKind] = useState<EntityKind>(initialKind);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntityResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchEntities(kind, query);
        if (!cancelled) setResults(r);
      } catch (e) {
        console.error("entity search failed", e);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [kind, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 11px",
    borderRadius: "var(--radius-full)",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: 12,
    fontWeight: 500,
    background: active ? "rgba(var(--color-sage-rgb), 0.16)" : "transparent",
    color: active ? "var(--color-sage-text)" : "var(--color-text-secondary)",
  });

  return (
    <div
      onPointerDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0, 0, 0, 0.28)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "calc(100vw - 48px)",
          maxHeight: "72vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface-raised)",
          border: "0.5px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", gap: 4, padding: "10px 12px", borderBottom: "0.5px solid var(--color-border)" }}>
          {ENTITY_KINDS.map((k) => (
            <button key={k.kind} onClick={() => setKind(k.kind)} style={tabStyle(kind === k.kind)}>
              {k.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid var(--color-border)" }}>
          <Search size={15} style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "var(--font-sans)",
              fontSize: 14,
              color: "var(--color-text-primary)",
            }}
          />
        </div>

        <div style={{ overflowY: "auto", padding: 6 }}>
          {loading ? (
            <div style={{ padding: 16, color: "var(--color-text-tertiary)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 16, color: "var(--color-text-tertiary)", fontSize: 13, fontFamily: "var(--font-sans)" }}>
              Nothing found.
            </div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.refType}-${r.refId}`}
                onClick={() => onPick(r)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                  width: "100%",
                  padding: "9px 10px",
                  border: "none",
                  background: "transparent",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {r.content.title}
                </span>
                {(r.content.subtitle || r.content.meta) && (
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {[r.content.subtitle, r.content.meta].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
