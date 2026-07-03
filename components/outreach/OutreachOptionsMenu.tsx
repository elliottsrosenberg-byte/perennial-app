"use client";

// Dropdown opened by the 3-dot button in the Outreach topbar. List-wide
// preferences that don't sit naturally inside a single pipeline or target.
// Mirrors the structure of ContactsOptionsMenu / OptionsMenu in Projects so
// the three modules feel like siblings.

import { useEffect, useRef } from "react";
import { Archive, Eye, Pencil } from "lucide-react";

interface Props {
  showOutcomes:    boolean;
  onToggleShowOutcomes: () => void;
  showClosed:      boolean;
  onToggleShowClosed: () => void;
  closedCount:     number;
  onClose: () => void;
  /** Per-pipeline actions — only rendered when the user is currently
   *  viewing a specific pipeline. The menu mixes global outreach prefs
   *  (below) with this pipeline's settings (above). */
  pipelineLabel?: string;
  onEditPipeline?: () => void;
  onArchivePipeline?: () => void;
}

export default function OutreachOptionsMenu({
  showOutcomes, onToggleShowOutcomes,
  showClosed, onToggleShowClosed, closedCount,
  onClose,
  pipelineLabel, onEditPipeline, onArchivePipeline,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", right: 0, top: "calc(100% + 6px)",
        width: 280, zIndex: 40,
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-overlay)",
        overflow: "hidden",
      }}
    >
      {pipelineLabel && (onEditPipeline || onArchivePipeline) && (
        <>
          <div style={{ padding: "10px 14px 6px" }}>
            <p style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
            }}>
              {pipelineLabel}
            </p>
          </div>
          <div style={{ padding: 6 }}>
            {onEditPipeline && (
              <ActionRow
                icon={<Pencil size={13} strokeWidth={1.75} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />}
                title="Edit pipeline"
                sub="Name, description, color"
                onClick={() => { onClose(); onEditPipeline(); }}
              />
            )}
            {onArchivePipeline && (
              <ActionRow
                icon={<Archive size={13} strokeWidth={1.75} style={{ color: "var(--color-red-orange)", flexShrink: 0 }} />}
                title="Archive pipeline"
                sub="Hide from the sidebar — targets and history stay intact"
                onClick={() => { onClose(); onArchivePipeline(); }}
                danger
              />
            )}
          </div>
          <div style={{ height: 1, background: "var(--color-border)" }} />
        </>
      )}

      <div style={{
        padding: "10px 14px 6px",
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "var(--color-text-tertiary)",
        }}>
          Outreach options
        </p>
      </div>

      <div style={{ padding: 6 }}>
        <Row
          icon={<Eye size={13} strokeWidth={1.75} style={{ color: showOutcomes ? "var(--color-sage)" : "var(--color-text-tertiary)", flexShrink: 0 }} />}
          title="Show outcome stages"
          sub="Closed-won, closed-lost columns inline with the active pipeline"
          active={showOutcomes}
          onClick={onToggleShowOutcomes}
        />
        <Row
          icon={<Archive size={13} strokeWidth={1.75} style={{ color: showClosed ? "var(--color-sage)" : "var(--color-text-tertiary)", flexShrink: 0 }} />}
          title="Show closed targets"
          sub={closedCount === 0
            ? "Nothing closed yet"
            : `${closedCount} closed · keep them in view`}
          active={showClosed}
          onClick={onToggleShowClosed}
        />
      </div>
    </div>
  );
}

function Row({ icon, title, sub, active, onClick }: {
  icon: React.ReactNode; title: string; sub: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 7, border: "none",
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{title}</p>
        <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>{sub}</p>
      </div>
      <span
        aria-checked={active}
        style={{
          flexShrink: 0,
          width: 26, height: 14, borderRadius: 999,
          background: active ? "var(--color-sage)" : "var(--color-border-strong)",
          position: "relative",
          transition: "background 0.15s ease",
        }}
      >
        <span style={{
          position: "absolute",
          top: 1, left: active ? 13 : 1,
          width: 12, height: 12, borderRadius: 999,
          background: "white",
          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
          transition: "left 0.15s ease",
        }} />
      </span>
    </button>
  );
}

function ActionRow({ icon, title, sub, onClick, danger }: {
  icon: React.ReactNode; title: string; sub: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px", borderRadius: 7, border: "none",
        background: "transparent", cursor: "pointer", fontFamily: "inherit",
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-sunken)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: danger ? "var(--color-red-orange)" : "var(--color-text-primary)" }}>{title}</p>
        <p style={{ fontSize: 10.5, color: "var(--color-text-tertiary)", marginTop: 1 }}>{sub}</p>
      </div>
    </button>
  );
}
