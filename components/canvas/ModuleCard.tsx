"use client";

// A live module-summary card on the canvas (echoes the old dashboard cards).
// Fetches its module's stats on mount.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ListChecks,
  FolderKanban,
  DollarSign,
  Users,
  FileText,
  Calendar,
  ArrowUpRight,
} from "lucide-react";
import type { CanvasObject, ModuleContent, ModuleKey } from "./types";
import { fetchModuleSummary, MODULE_META, type ModuleSummary } from "@/lib/canvas/modules";

const ICON: Record<ModuleKey, React.ReactNode> = {
  tasks: <ListChecks size={16} strokeWidth={1.75} />,
  projects: <FolderKanban size={16} strokeWidth={1.75} />,
  finance: <DollarSign size={16} strokeWidth={1.75} />,
  contacts: <Users size={16} strokeWidth={1.75} />,
  notes: <FileText size={16} strokeWidth={1.75} />,
  calendar: <Calendar size={16} strokeWidth={1.75} />,
};

const FONT = "var(--font-sans)";

export default function ModuleCard({ object }: { object: CanvasObject }) {
  const key = (object.content as ModuleContent).moduleKey;
  const meta = MODULE_META[key];
  const [summary, setSummary] = useState<ModuleSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchModuleSummary(key);
        if (!cancelled) setSummary(s);
      } catch (e) {
        console.error("module summary failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--color-surface-raised)",
        border: "0.5px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: "var(--radius-md)",
            background: "rgba(var(--color-sage-rgb), 0.16)",
            color: "var(--color-sage-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {ICON[key]}
        </div>
        <span style={{ flex: 1, fontFamily: FONT, fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {meta.label}
        </span>
        <Link
          href={meta.href}
          onPointerDown={(e) => e.stopPropagation()}
          title={`Open ${meta.label}`}
          style={{ display: "flex", color: "var(--color-text-tertiary)" }}
        >
          <ArrowUpRight size={16} strokeWidth={1.75} />
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {loading ? (
          <span style={{ fontFamily: FONT, fontSize: 12, color: "var(--color-text-tertiary)" }}>Loading…</span>
        ) : (
          (summary?.stats ?? []).map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontFamily: FONT, fontSize: 12, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.value}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
