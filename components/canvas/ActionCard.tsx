"use client";

// An onboarding call-to-action card on the canvas. Clicking it either opens Ash
// with a starter prompt or routes to a module. Interactive, like the live cards:
// it stops pointer-down so a click fires the action instead of dragging the
// object. Colours come from the canvas palette / design tokens.

import { useRouter } from "next/navigation";
import {
  Leaf, FolderKanban, FileText, Users, Calendar, Sparkles, Compass, Plus, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CanvasObject, ActionContent, ActionIcon } from "./types";
import { swatch } from "./palette";

const FONT = "var(--font-sans)";

const ICONS: Record<ActionIcon, LucideIcon> = {
  ash:      Leaf,
  project:  FolderKanban,
  note:     FileText,
  contact:  Users,
  calendar: Calendar,
  sparkles: Sparkles,
  compass:  Compass,
  plus:     Plus,
};

function openAsh(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}

export default function ActionCard({ object }: { object: CanvasObject }) {
  const router = useRouter();
  const c  = object.content as ActionContent;
  const sw = swatch(c.color ?? "green");
  const Icon = ICONS[c.icon ?? "sparkles"] ?? Sparkles;

  function fire() {
    if (c.actionKind === "route" && c.href) router.push(c.href);
    else if (c.prompt) openAsh(c.prompt);
  }

  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={fire}
      title={c.label}
      style={{
        width: "100%",
        height: "100%",
        textAlign: "left",
        cursor: "pointer",
        background: "var(--color-surface-raised)",
        border: `0.5px solid ${sw.border}`,
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflow: "hidden",
        fontFamily: FONT,
        transition: "box-shadow 0.12s ease, transform 0.12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-lg)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flexShrink: 0,
            width: 30,
            height: 30,
            borderRadius: "var(--radius-md)",
            background: sw.fill,
            color: sw.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <ArrowRight size={15} strokeWidth={2} style={{ marginLeft: "auto", color: sw.accent }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.25 }}>
          {c.label}
        </span>
        {c.sublabel && (
          <span style={{ fontSize: 11.5, color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
            {c.sublabel}
          </span>
        )}
      </div>
    </button>
  );
}
