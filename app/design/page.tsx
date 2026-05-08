"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  // Navigation
  LayoutDashboard, Layers, Users, Send, FileText, Calendar, Receipt, Globe, FolderOpen, Settings, Palette, Compass,
  // Actions
  Plus, PlusCircle, Pencil, Trash2, Search, Filter, Download, Upload, Copy, Share, X, Check,
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ExternalLink, RefreshCw, RotateCcw, Move,
  // Status & Feedback
  CheckCircle, XCircle, AlertCircle, AlertTriangle, Info, Clock, Bell, BellOff, Loader2, Zap, Timer, Star,
  // Files & Objects
  File, FilePlus, Folder, Image, Link2, Paperclip, Tag, Bookmark, BookOpen, Archive, Package,
  // Finance & Business
  DollarSign, CreditCard, TrendingUp, TrendingDown, BarChart2, PieChart, Wallet, CircleDollarSign,
  // Communication
  Mail, Phone, MessageSquare, AtSign, Hash, Wifi,
  // UI Controls
  MoreHorizontal, MoreVertical, GripVertical, Maximize2, Minimize2, Eye, EyeOff, Lock, Unlock, SlidersHorizontal, Grip, Heart,
} from "lucide-react";

// ─── Nav structure ─────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Foundation",
    items: [
      { id: "colors",     label: "Colors"     },
      { id: "typography", label: "Typography" },
      { id: "spacing",    label: "Spacing"    },
      { id: "shadows",    label: "Shadows"    },
      { id: "icons",      label: "Icons"      },
    ],
  },
  {
    label: "Components",
    items: [
      { id: "buttons",      label: "Buttons"       },
      { id: "badges",       label: "Badges & Tags"  },
      { id: "inputs",       label: "Inputs"        },
      { id: "filter-tabs",  label: "Filter Tabs"   },
      { id: "cards",        label: "Cards"         },
      { id: "tables",       label: "Tables"        },
      { id: "modals",       label: "Modals"        },
      { id: "panels",       label: "Panels"        },
      { id: "empty-states", label: "Empty States"  },
      { id: "status",       label: "Status"        },
    ],
  },
  {
    label: "Patterns",
    items: [
      { id: "layouts", label: "Page Layouts" },
    ],
  },
  {
    label: "Generative",
    items: [
      { id: "ash", label: "Ash" },
    ],
  },
];

// ─── Color data ────────────────────────────────────────────────────────────────
const COLOR_GROUPS = [
  {
    title: "Brand",
    colors: [
      { name: "Charcoal",   token: "--color-charcoal",   hex: "#1f211a",  note: "Primary text, buttons, UI chrome" },
      { name: "Sage",       token: "--color-sage",        hex: "#9BA37A",  note: "Brand accent, primary action" },
      { name: "Warm White", token: "--color-warm-white",  hex: "#f9faf4",  note: "Page background" },
      { name: "Off White",  token: "--color-off-white",   hex: "#fffefc",  note: "Card & panel surface" },
      { name: "Cream",      token: "--color-cream",       hex: "#eff0e7",  note: "Inputs, wells, table headers" },
      { name: "Grey",       token: "--color-grey",        hex: "#9a9690",  note: "Tertiary text, icons" },
    ],
  },
  {
    title: "Status",
    colors: [
      { name: "Green",       token: "--color-green",       hex: "#8dd047",  note: "Success, complete" },
      { name: "Warm Yellow", token: "--color-warm-yellow", hex: "#e8c547",  note: "In progress, warning" },
      { name: "Orange",      token: "--color-orange",      hex: "#e8850d",  note: "Highlight, attention" },
      { name: "Red Orange",  token: "--color-red-orange",  hex: "#dc3e0d",  note: "Alert, overdue, error" },
      { name: "Blue",        token: "--color-blue",        hex: "#2563ab",  note: "Links, info, 'Sent' badges" },
    ],
  },
];

// ─── Type scale ────────────────────────────────────────────────────────────────
const TYPE_SCALE = [
  { token: "--text-5xl", px: 36, weight: 700, family: "display", label: "5XL · 36px · Display Bold",   sample: "Perennial Studio" },
  { token: "--text-4xl", px: 28, weight: 700, family: "display", label: "4XL · 28px · Display Bold",   sample: "Active projects" },
  { token: "--text-3xl", px: 22, weight: 700, family: "display", label: "3XL · 22px · Display Bold",   sample: "Your finances at a glance" },
  { token: "--text-2xl", px: 18, weight: 700, family: "display", label: "2XL · 18px · Display Bold",   sample: "Free Beta — You're all set" },
  { token: "--text-xl",  px: 15, weight: 600, family: "sans",    label: "XL · 15px · Sans Semibold",   sample: "Good morning. Wednesday · Apr 23" },
  { token: "--text-lg",  px: 14, weight: 600, family: "sans",    label: "LG · 14px · Sans Semibold",   sample: "Settings — Manage your account" },
  { token: "--text-md",  px: 13, weight: 500, family: "sans",    label: "MD · 13px · Sans Medium",     sample: "The quick brown fox jumps over the lazy dog" },
  { token: "--text-base",px: 12, weight: 400, family: "sans",    label: "Base · 12px · Sans Regular",  sample: "Invoice #003 · $1,400 · Due Apr 28 · Sent to Sarah Chen" },
  { token: "--text-sm",  px: 11, weight: 400, family: "sans",    label: "SM · 11px · Sans Regular",    sample: "Last contacted 3 weeks ago · Gallery · Lead · View all →" },
  { token: "--text-xs",  px: 10, weight: 600, family: "sans",    label: "XS · 10px · Sans Semibold",   sample: "ACTIVE PROJECTS · IN PROGRESS · OVERDUE · STATUS" },
];

// ─── Spacing data ──────────────────────────────────────────────────────────────
const SPACING_SCALE = [
  { token: "--space-1",  px: 4,   label: "1" },
  { token: "--space-2",  px: 8,   label: "2" },
  { token: "--space-3",  px: 12,  label: "3" },
  { token: "--space-4",  px: 16,  label: "4" },
  { token: "--space-5",  px: 20,  label: "5" },
  { token: "--space-6",  px: 24,  label: "6" },
  { token: "--space-8",  px: 32,  label: "8" },
  { token: "--space-10", px: 40,  label: "10" },
  { token: "--space-12", px: 48,  label: "12" },
  { token: "--space-14", px: 56,  label: "14" },
];

const RADIUS_SCALE = [
  { token: "--radius-sm",   px: 6,    label: "SM · 6px",    desc: "Buttons (small), tags" },
  { token: "--radius-md",   px: 8,    label: "MD · 8px",    desc: "Buttons, inputs, dropdowns" },
  { token: "--radius-lg",   px: 12,   label: "LG · 12px",   desc: "Cards, panels, filter tabs" },
  { token: "--radius-xl",   px: 16,   label: "XL · 16px",   desc: "Modals, large cards" },
  { token: "--radius-2xl",  px: 20,   label: "2XL · 20px",  desc: "Auth cards, settings cards" },
  { token: "--radius-full", px: 9999, label: "Full",         desc: "Pills, tags, avatars" },
];

// ─── Shadow data ───────────────────────────────────────────────────────────────
const SHADOW_SCALE = [
  { token: "--shadow-sm",      label: "SM",      usage: "Subtle elements, tooltips",         value: "0 1px 2px rgba(0,0,0,0.05)" },
  { token: "--shadow-card",    label: "Card",    usage: "Cards, panels, home dashboard",     value: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)" },
  { token: "--shadow-md",      label: "MD",      usage: "Dropdowns, menus, popovers",        value: "0 4px 16px rgba(0,0,0,0.10)" },
  { token: "--shadow-lg",      label: "LG",      usage: "Modals, side panels",               value: "0 8px 32px rgba(0,0,0,0.14)" },
  { token: "--shadow-overlay", label: "Overlay", usage: "Full-screen modals, drawers",       value: "0 16px 48px rgba(0,0,0,0.20)" },
];

// ─── Badge data ────────────────────────────────────────────────────────────────
const STATUS_BADGES = [
  { label: "Complete",    bg: "rgba(141,208,71,0.15)",  color: "#3d6b4f"                   },
  { label: "In Progress", bg: "rgba(155,163,122,0.18)", color: "var(--color-sage)"         },
  { label: "Planning",    bg: "rgba(31,33,26,0.07)",    color: "var(--color-text-tertiary)" },
  { label: "On Hold",     bg: "rgba(232,197,71,0.18)",  color: "#a07800"                   },
  { label: "Overdue",     bg: "rgba(220,62,13,0.12)",   color: "var(--color-red-orange)"   },
  { label: "Draft",       bg: "rgba(31,33,26,0.07)",    color: "var(--color-text-tertiary)" },
  { label: "Sent",        bg: "rgba(37,99,171,0.12)",   color: "#2563ab"                   },
  { label: "Paid",        bg: "rgba(141,208,71,0.15)",  color: "#3d6b4f"                   },
  { label: "Active",      bg: "rgba(155,163,122,0.18)", color: "#5a7040"                   },
  { label: "Lead",        bg: "rgba(184,134,11,0.12)",  color: "#b8860b"                   },
  { label: "Inactive",    bg: "rgba(31,33,26,0.07)",    color: "var(--color-text-tertiary)" },
  { label: "Beta",        bg: "rgba(141,208,71,0.12)",  color: "#3d6b4f"                   },
  { label: "Soon",        bg: "rgba(155,163,122,0.15)", color: "var(--color-sage)"         },
];

const TAG_COLORS = [
  { label: "gallery",   bg: "rgba(37,99,171,0.10)",   color: "#2563ab" },
  { label: "client",    bg: "rgba(61,107,79,0.10)",   color: "#3d6b4f" },
  { label: "supplier",  bg: "rgba(184,134,11,0.10)",  color: "#b8860b" },
  { label: "press",     bg: "rgba(109,79,163,0.10)",  color: "#6d4fa3" },
  { label: "lead",      bg: "rgba(154,150,144,0.10)", color: "#6b6860" },
  { label: "event",     bg: "rgba(20,140,140,0.10)",  color: "#148c8c" },
  { label: "residency", bg: "rgba(220,62,13,0.10)",   color: "#dc3e0d" },
  { label: "award",     bg: "rgba(232,133,13,0.10)",  color: "#c06200" },
];

// ─── Shared primitives (to be extracted to components/ui/) ──────────────────────

function DSButton({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "primary" | "dark" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);

  const SIZES = {
    sm: { padding: "5px 14px",  fontSize: 11, borderRadius: 6 },
    md: { padding: "7px 20px",  fontSize: 12, borderRadius: 8 },
    lg: { padding: "9px 24px",  fontSize: 13, borderRadius: 8 },
  };
  const BASE: Record<string, React.CSSProperties> = {
    primary:   { background: "var(--color-sage)",     color: "white",                         border: "none" },
    dark:      { background: "var(--color-charcoal)", color: "var(--color-warm-white)",        border: "none" },
    secondary: { background: "transparent",           color: "var(--color-text-secondary)",    border: "1px solid rgba(31,33,26,0.22)" },
    ghost:     { background: "transparent",           color: "var(--color-text-tertiary)",     border: "none" },
    danger:    { background: "transparent",           color: "var(--color-red-orange)",        border: "0.5px solid rgba(220,62,13,0.35)" },
  };
  const HOVER_BG: Record<string, string> = {
    primary:   "var(--color-sage-hover)",
    dark:      "rgba(31,33,26,0.82)",
    secondary: "var(--color-surface-sunken)",
    ghost:     "var(--color-surface-sunken)",
    danger:    "rgba(220,62,13,0.08)",
  };

  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...SIZES[size],
        ...BASE[variant],
        background: hov && !disabled ? HOVER_BG[variant] : BASE[variant].background,
        fontFamily: "inherit",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.40 : 1,
        transition: "background 0.12s ease, opacity 0.12s ease",
        outline: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

function DSToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        position: "relative", width: 36, height: 20,
        borderRadius: 9999, border: "none", cursor: "pointer",
        background: checked ? "var(--color-sage)" : "rgba(31,33,26,0.18)",
        transition: "background 0.15s ease", padding: 0, flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute", top: 2,
          left: checked ? "calc(100% - 18px)" : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: "white", transition: "left 0.15s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}

function DSCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 16, height: 16, borderRadius: 4, cursor: "pointer",
        background: checked ? "var(--color-sage)" : "transparent",
        border: checked ? "1.5px solid var(--color-sage)" : "1.5px solid rgba(31,33,26,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.12s ease", flexShrink: 0,
      }}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({ id, title, description, children }: {
  id: string; title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{ padding: "52px 56px", borderBottom: "0.5px solid var(--color-border)" }}
    >
      <h2 style={{
        fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700,
        color: "var(--color-text-primary)", marginBottom: description ? 6 : 36, lineHeight: 1.2,
      }}>
        {title}
      </h2>
      {description && (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 36, lineHeight: 1.6 }}>
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
        color: "var(--color-text-tertiary)", marginBottom: 16,
        paddingBottom: 10, borderBottom: "0.5px solid var(--color-border)",
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 32, marginBottom: 16 }}>
      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

// ─── Colors ───────────────────────────────────────────────────────────────────

function ColorsSection() {
  return (
    <Section id="colors" title="Colors" description="All color tokens. CSS variable is the source of truth — hex shown for reference. Purple is reserved for user-selected tag colors only.">
      {COLOR_GROUPS.map((group) => (
        <SubSection key={group.title} title={group.title}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 16 }}>
            {group.colors.map((c) => (
              <div key={c.token}>
                <div style={{ height: 60, borderRadius: 10, marginBottom: 10, background: `var(${c.token})`, border: "0.5px solid var(--color-border)" }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>{c.name}</p>
                <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)" }}>{c.token}</p>
                <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", marginBottom: 2 }}>{c.hex}</p>
                <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{c.note}</p>
              </div>
            ))}
          </div>
        </SubSection>
      ))}

      {/* Text colors — shown as text samples to reveal contrast differences */}
      <SubSection title="Text">
        <div style={{ borderRadius: 10, border: "0.5px solid var(--color-border)", overflow: "hidden", background: "var(--color-surface-raised)" }}>
          {[
            { name: "Primary",   token: "--color-text-primary",   hex: "#1f211a", note: "Headings, primary content" },
            { name: "Secondary", token: "--color-text-secondary", hex: "#6b6860", note: "Body text, labels" },
            { name: "Tertiary",  token: "--color-text-tertiary",  hex: "#9a9690", note: "Placeholders, captions, timestamps" },
          ].map((c, i, arr) => (
            <div key={c.token} style={{ padding: "16px 20px", borderBottom: i < arr.length - 1 ? "0.5px solid var(--color-border)" : "none" }}>
              <p style={{ color: `var(${c.token})`, fontSize: 14, fontWeight: 500, marginBottom: 4, lineHeight: 1.3 }}>
                {c.name} — The quick brown fox jumps over the lazy dog
              </p>
              <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)" }}>
                {c.token} · {c.hex} · {c.note}
              </p>
            </div>
          ))}
        </div>
      </SubSection>

      {/* Surfaces — nested to reveal the hierarchy */}
      <SubSection title="Surfaces">
        <div style={{ padding: 20, background: "var(--color-surface-app)", borderRadius: 12, border: "0.5px solid var(--color-border)" }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
            Surface App · #f9faf4 · Page background
          </p>
          <div style={{ padding: 16, background: "var(--color-surface-raised)", borderRadius: 10, border: "0.5px solid var(--color-border)" }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              Surface Raised · #fffefc · Cards, panels, modals
            </p>
            <div style={{ padding: 14, background: "var(--color-surface-sunken)", borderRadius: 8, border: "0.5px solid var(--color-border)" }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>
                Surface Sunken · #eff0e7 · Inputs, table headers, wells
              </p>
            </div>
          </div>
        </div>
      </SubSection>

      {/* Borders — shown on a sunken bg so both are visible */}
      <SubSection title="Borders">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { token: "--color-border",        label: "Border",        val: "rgba(31,33,26,0.10)", note: "Default — cards, dividers, inputs" },
            { token: "--color-border-strong",  label: "Border Strong", val: "rgba(31,33,26,0.20)", note: "Emphasized — selected, active, hover" },
          ].map((b) => (
            <div key={b.token} style={{ padding: "20px 24px", background: "var(--color-surface-sunken)", border: `1.5px solid var(${b.token})`, borderRadius: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 3 }}>{b.label}</p>
              <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", marginBottom: 2 }}>{b.token}</p>
              <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", marginBottom: 4 }}>{b.val}</p>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{b.note}</p>
            </div>
          ))}
        </div>
      </SubSection>
    </Section>
  );
}

// ─── Typography ───────────────────────────────────────────────────────────────

function TypographySection() {
  return (
    <Section id="typography" title="Typography" description="Albert Sans for UI, Newsreader for display. The type scale is defined in --text-* tokens.">
      <SubSection title="Font Families">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 8 }}>
          <div style={{ padding: 24, background: "var(--color-surface-raised)", borderRadius: 12, border: "0.5px solid var(--color-border)" }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              Display — Newsreader
            </p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.15, marginBottom: 8 }}>
              Aa Bb Cc Dd Ee Ff
            </p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              The quick brown fox jumps over the lazy dog. 0123456789
            </p>
            <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", marginTop: 12 }}>--font-display · Georgia fallback</p>
          </div>
          <div style={{ padding: 24, background: "var(--color-surface-raised)", borderRadius: 12, border: "0.5px solid var(--color-border)" }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              Interface — Albert Sans
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 32, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.15, marginBottom: 8 }}>
              Aa Bb Cc Dd Ee Ff
            </p>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              The quick brown fox jumps over the lazy dog. 0123456789
            </p>
            <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", marginTop: 12 }}>--font-sans · system-ui fallback</p>
          </div>
        </div>
      </SubSection>

      <SubSection title="Type Scale">
        {TYPE_SCALE.map((t) => (
          <div
            key={t.token}
            style={{ display: "flex", alignItems: "baseline", gap: 20, padding: "14px 0", borderBottom: "0.5px solid var(--color-border)" }}
          >
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", width: 200, flexShrink: 0 }}>
              {t.label}
            </span>
            <span
              style={{
                fontSize: t.px,
                fontWeight: t.weight,
                fontFamily: t.family === "display" ? "var(--font-display)" : "var(--font-sans)",
                color: "var(--color-text-primary)",
                flex: 1,
                lineHeight: 1.3,
              }}
            >
              {t.sample}
            </span>
          </div>
        ))}
      </SubSection>
    </Section>
  );
}

// ─── Spacing ──────────────────────────────────────────────────────────────────

function SpacingSection() {
  const CORE_SPACING = [4, 8, 12, 16, 24, 32, 48];
  const CORE_RADIUS = [
    { px: 8,    label: "MD · 8px",   desc: "Buttons, inputs, dropdowns",    token: "--radius-md"   },
    { px: 12,   label: "LG · 12px",  desc: "Cards, panels, filter tabs",    token: "--radius-lg"   },
    { px: 16,   label: "XL · 16px",  desc: "Modals, large cards",           token: "--radius-xl"   },
    { px: 20,   label: "2XL · 20px", desc: "Auth cards, settings cards",    token: "--radius-2xl"  },
    { px: 9999, label: "Full",        desc: "Pills, tags, avatars, toggles", token: "--radius-full" },
  ];

  return (
    <Section id="spacing" title="Spacing & Radius" description="4px base grid. Use these consistently — don't introduce arbitrary values.">
      <SubSection title="Spacing">
        {CORE_SPACING.map((px) => (
          <div key={px} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", width: 36, flexShrink: 0 }}>{px}px</span>
            <div style={{ height: 16, borderRadius: 3, background: "var(--color-sage)", opacity: 0.55, width: px * 2.5 }} />
          </div>
        ))}
      </SubSection>

      <SubSection title="Radius">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
          {CORE_RADIUS.map((r) => (
            <div key={r.token}>
              <div style={{ width: "100%", aspectRatio: "1.4", background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", borderRadius: r.px, marginBottom: 10 }} />
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>{r.label}</p>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </SubSection>
    </Section>
  );
}

// ─── Shadows ──────────────────────────────────────────────────────────────────

function ShadowsSection() {
  return (
    <Section id="shadows" title="Shadows" description="Elevation scale from subtle to overlay. Use the token — never hardcode shadow values.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 24 }}>
        {SHADOW_SCALE.map((s) => (
          <div key={s.token}>
            <div
              style={{
                background: "var(--color-surface-raised)",
                borderRadius: 12,
                padding: 24,
                boxShadow: `var(${s.token})`,
                marginBottom: 16,
                minHeight: 80,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>{s.label}</span>
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>--shadow-{s.label.toLowerCase()}</p>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 4 }}>{s.usage}</p>
            <p style={{ fontSize: 9, fontFamily: "monospace", color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>{s.value}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconsSection() {
  const [size, setSize]   = useState(20);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(name: string) {
    navigator.clipboard?.writeText(name);
    setCopied(name);
    setTimeout(() => setCopied(null), 1400);
  }

  type IconEntry = { name: string; Icon: React.ElementType };
  const GROUPS: { title: string; icons: IconEntry[] }[] = [
    {
      title: "Navigation",
      icons: [
        { name: "LayoutDashboard", Icon: LayoutDashboard },
        { name: "Layers",          Icon: Layers          },
        { name: "Users",           Icon: Users           },
        { name: "Send",            Icon: Send            },
        { name: "FileText",        Icon: FileText        },
        { name: "Calendar",        Icon: Calendar        },
        { name: "Receipt",         Icon: Receipt         },
        { name: "Globe",           Icon: Globe           },
        { name: "FolderOpen",      Icon: FolderOpen      },
        { name: "Settings",        Icon: Settings        },
        { name: "Palette",         Icon: Palette         },
        { name: "Compass",         Icon: Compass         },
      ],
    },
    {
      title: "Actions",
      icons: [
        { name: "Plus",         Icon: Plus         },
        { name: "PlusCircle",   Icon: PlusCircle   },
        { name: "Pencil",       Icon: Pencil       },
        { name: "Trash2",       Icon: Trash2       },
        { name: "Search",       Icon: Search       },
        { name: "Filter",       Icon: Filter       },
        { name: "Download",     Icon: Download     },
        { name: "Upload",       Icon: Upload       },
        { name: "Copy",         Icon: Copy         },
        { name: "Share",        Icon: Share        },
        { name: "X",            Icon: X            },
        { name: "Check",        Icon: Check        },
        { name: "ArrowLeft",    Icon: ArrowLeft    },
        { name: "ArrowRight",   Icon: ArrowRight   },
        { name: "ChevronLeft",  Icon: ChevronLeft  },
        { name: "ChevronRight", Icon: ChevronRight },
        { name: "ChevronDown",  Icon: ChevronDown  },
        { name: "ChevronUp",    Icon: ChevronUp    },
        { name: "ExternalLink", Icon: ExternalLink },
        { name: "RefreshCw",    Icon: RefreshCw    },
        { name: "RotateCcw",    Icon: RotateCcw    },
        { name: "Move",         Icon: Move         },
      ],
    },
    {
      title: "Status & Feedback",
      icons: [
        { name: "CheckCircle",   Icon: CheckCircle   },
        { name: "XCircle",       Icon: XCircle       },
        { name: "AlertCircle",   Icon: AlertCircle   },
        { name: "AlertTriangle", Icon: AlertTriangle },
        { name: "Info",          Icon: Info          },
        { name: "Clock",         Icon: Clock         },
        { name: "Timer",         Icon: Timer         },
        { name: "Bell",          Icon: Bell          },
        { name: "BellOff",       Icon: BellOff       },
        { name: "Loader2",       Icon: Loader2       },
        { name: "Zap",           Icon: Zap           },
        { name: "Star",          Icon: Star          },
        { name: "Heart",         Icon: Heart         },
      ],
    },
    {
      title: "Files & Objects",
      icons: [
        { name: "File",       Icon: File       },
        { name: "FilePlus",   Icon: FilePlus   },
        { name: "Folder",     Icon: Folder     },
        { name: "Image",      Icon: Image      },
        { name: "Link2",      Icon: Link2      },
        { name: "Paperclip",  Icon: Paperclip  },
        { name: "Tag",        Icon: Tag        },
        { name: "Bookmark",   Icon: Bookmark   },
        { name: "BookOpen",   Icon: BookOpen   },
        { name: "Archive",    Icon: Archive    },
        { name: "Package",    Icon: Package    },
      ],
    },
    {
      title: "Finance & Business",
      icons: [
        { name: "DollarSign",      Icon: DollarSign      },
        { name: "CreditCard",      Icon: CreditCard      },
        { name: "CircleDollarSign",Icon: CircleDollarSign},
        { name: "Wallet",          Icon: Wallet          },
        { name: "TrendingUp",      Icon: TrendingUp      },
        { name: "TrendingDown",    Icon: TrendingDown    },
        { name: "BarChart2",       Icon: BarChart2       },
        { name: "PieChart",        Icon: PieChart        },
      ],
    },
    {
      title: "Communication",
      icons: [
        { name: "Mail",          Icon: Mail          },
        { name: "Phone",         Icon: Phone         },
        { name: "MessageSquare", Icon: MessageSquare },
        { name: "AtSign",        Icon: AtSign        },
        { name: "Hash",          Icon: Hash          },
        { name: "Wifi",          Icon: Wifi          },
      ],
    },
    {
      title: "UI Controls",
      icons: [
        { name: "MoreHorizontal",   Icon: MoreHorizontal   },
        { name: "MoreVertical",     Icon: MoreVertical     },
        { name: "Grip",             Icon: Grip             },
        { name: "GripVertical",     Icon: GripVertical     },
        { name: "SlidersHorizontal",Icon: SlidersHorizontal},
        { name: "Maximize2",        Icon: Maximize2        },
        { name: "Minimize2",        Icon: Minimize2        },
        { name: "Eye",              Icon: Eye              },
        { name: "EyeOff",           Icon: EyeOff           },
        { name: "Lock",             Icon: Lock             },
        { name: "Unlock",           Icon: Unlock           },
      ],
    },
  ];

  return (
    <Section id="icons" title="Icons" description="Lucide React — open source, stroke-based. Use strokeWidth={1.5} throughout. Click any icon to copy its name.">
      {/* Size + stroke controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>Size</span>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--color-border)" }}>
            {[16, 20, 24].map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                style={{
                  padding: "5px 12px", fontSize: 11, border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: size === s ? "var(--color-surface-sunken)" : "transparent",
                  color: size === s ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  fontWeight: size === s ? 600 : 400,
                  transition: "all 0.1s ease",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          import {"{"} IconName {"}"} from &apos;lucide-react&apos;
        </span>
      </div>

      {GROUPS.map((group) => (
        <SubSection key={group.title} title={group.title}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 4 }}>
            {group.icons.map(({ name, Icon }) => {
              const isCopied = copied === name;
              return (
                <button
                  key={name}
                  onClick={() => copy(name)}
                  title={`Copy "${name}"`}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "12px 6px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: isCopied ? "rgba(155,163,122,0.12)" : "transparent",
                    gap: 8, transition: "background 0.1s ease", fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { if (!isCopied) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                  onMouseLeave={(e) => { if (!isCopied) e.currentTarget.style.background = "transparent"; }}
                >
                  {isCopied
                    ? <Check size={size} strokeWidth={1.5} color="var(--color-sage)" />
                    : <Icon  size={size} strokeWidth={1.5} color="var(--color-text-secondary)"
                        style={["Maximize2","Minimize2"].includes(name) ? { transform: "scaleX(-1)" } : undefined}
                      />
                  }
                  <span style={{
                    fontSize: 9, color: isCopied ? "var(--color-sage)" : "var(--color-text-tertiary)",
                    textAlign: "center", lineHeight: 1.3, wordBreak: "break-all",
                    fontWeight: isCopied ? 600 : 400,
                  }}>
                    {isCopied ? "Copied" : name}
                  </span>
                </button>
              );
            })}
          </div>
        </SubSection>
      ))}
    </Section>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

function ButtonsSection() {
  const VARIANTS: { key: "primary"|"dark"|"secondary"|"ghost"|"danger"; label: string; note: string }[] = [
    { key: "primary",   label: "Primary",   note: "Sage bg · white text · main CTA. Hover: lighter sage." },
    { key: "dark",      label: "Dark",      note: "Charcoal bg · cream text · strong action." },
    { key: "secondary", label: "Secondary", note: "Transparent · visible border · secondary action." },
    { key: "ghost",     label: "Ghost",     note: "Transparent · no border · low-priority actions." },
    { key: "danger",    label: "Danger",    note: "Red-orange border + text · destructive actions." },
  ];

  return (
    <Section id="buttons" title="Buttons" description="5 variants × 3 sizes. Hover states are live.">
      <SubSection title="Variants with spec">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 20, marginBottom: 8 }}>
          {VARIANTS.map((v) => (
            <div key={v.key}>
              <div style={{ marginBottom: 10 }}>
                <DSButton variant={v.key}>{v.label}</DSButton>
              </div>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.55 }}>{v.note}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <DSButton variant="primary" disabled>Disabled — any variant at opacity 0.4</DSButton>
        </div>
      </SubSection>

      <SubSection title="Sizes">
        {(["primary","secondary","dark"] as const).map((v) => (
          <Row key={v} label={v}>
            <DSButton variant={v} size="sm">Small</DSButton>
            <DSButton variant={v} size="md">Medium</DSButton>
            <DSButton variant={v} size="lg">Large</DSButton>
          </Row>
        ))}
      </SubSection>
    </Section>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function BadgesSection() {
  return (
    <Section id="badges" title="Badges & Tags" description="Status badges, contact tags, count indicators, and label pills.">
      <SubSection title="Status Badges">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {STATUS_BADGES.map((b) => (
            <span
              key={b.label}
              style={{
                fontSize: 10, fontWeight: 700, padding: "3px 8px",
                borderRadius: 9999, background: b.bg, color: b.color,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}
            >
              {b.label}
            </span>
          ))}
        </div>
      </SubSection>

      <SubSection title="Contact Tags">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TAG_COLORS.map((t) => (
            <span
              key={t.label}
              style={{
                fontSize: 11, fontWeight: 500, padding: "3px 10px",
                borderRadius: 9999, background: t.bg, color: t.color,
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </SubSection>

      <SubSection title="Count & Label Indicators">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {[3, 12, 99].map((n) => (
            <div key={n} style={{
              width: 20, height: 20, borderRadius: "50%",
              background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)",
            }}>
              {n > 9 ? "9+" : n}
            </div>
          ))}
          <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />
          {["New", "Pro", "↑18%", "— 3d"].map((l) => (
            <span key={l} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 4,
              background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
              color: "var(--color-text-tertiary)", fontWeight: 500,
            }}>
              {l}
            </span>
          ))}
        </div>
      </SubSection>
    </Section>
  );
}

// ─── Custom Select ────────────────────────────────────────────────────────────

function CustomSelect({
  value, onChange, options, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const trigBase: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 12,
    background: "var(--color-surface-sunken)",
    border: open ? "0.5px solid var(--color-sage)" : "0.5px solid var(--color-border)",
    boxShadow: open ? "0 0 0 3px var(--color-focus-ring)" : "none",
    borderRadius: 8, color: selected ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
    fontFamily: "inherit", cursor: "pointer", outline: "none",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    transition: "border-color 0.12s ease, box-shadow 0.12s ease",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={trigBase}>
        <span>{selected?.label ?? placeholder ?? "Select…"}</span>
        <svg
          width="10" height="10" viewBox="0 0 16 16" fill="none"
          stroke="var(--color-text-secondary)" strokeWidth="2.5"
          style={{ flexShrink: 0, transition: "transform 0.12s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 10, boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          {options.map((o) => {
            const isActive = o.value === value;
            return (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 12,
                  textAlign: "left", border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: isActive ? "rgba(155,163,122,0.10)" : "transparent",
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  fontWeight: isActive ? 500 : 400,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  transition: "background 0.08s ease",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {o.label}
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--color-sage)" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2 8l4.5 4.5L14 4"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Date Picker ──────────────────────────────────────────────────────────────

function DSDatePicker({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(value ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const yr = view.getFullYear();
  const mo = view.getMonth();
  const today = new Date();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const firstDow    = new Date(yr, mo, 1).getDay();

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DOW    = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isSel = (d: number) =>
    !!value && value.getDate() === d && value.getMonth() === mo && value.getFullYear() === yr;
  const isTo = (d: number) =>
    today.getDate() === d && today.getMonth() === mo && today.getFullYear() === yr;

  const label = value
    ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Pick a date…";

  const trigBase: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 12,
    background: "var(--color-surface-sunken)",
    border: open ? "0.5px solid var(--color-sage)" : "0.5px solid var(--color-border)",
    boxShadow: open ? "0 0 0 3px var(--color-focus-ring)" : "none",
    borderRadius: 8, color: value ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
    fontFamily: "inherit", cursor: "pointer", outline: "none",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    transition: "border-color 0.12s ease",
  };
  const navBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 6,
    border: "0.5px solid var(--color-border)", background: "transparent",
    cursor: "pointer", color: "var(--color-text-secondary)", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={trigBase}>
        <span>{label}</span>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
          <rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v2M11 1v2M2 7h12"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50, width: 252,
          background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)",
          borderRadius: 12, boxShadow: "var(--shadow-md)", padding: 14,
        }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={() => setView(new Date(yr, mo - 1, 1))} style={navBtn}>‹</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {MONTHS[mo]} {yr}
            </span>
            <button onClick={() => setView(new Date(yr, mo + 1, 1))} style={navBtn}>›</button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
            {DOW.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "3px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) =>
              day === null ? (
                <div key={`e${i}`} />
              ) : (
                <button
                  key={day}
                  onClick={() => { onChange(new Date(yr, mo, day)); setOpen(false); }}
                  style={{
                    width: "100%", aspectRatio: "1", borderRadius: 6, border: "none",
                    fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                    fontWeight: isSel(day) ? 600 : 400,
                    background: isSel(day) ? "var(--color-sage)" : "transparent",
                    color: isSel(day) ? "white" : isTo(day) ? "var(--color-sage)" : "var(--color-text-primary)",
                    outline: isTo(day) && !isSel(day) ? "1.5px solid var(--color-sage)" : "none",
                    outlineOffset: -1,
                    transition: "background 0.08s ease",
                  }}
                  onMouseEnter={(e) => { if (!isSel(day)) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
                  onMouseLeave={(e) => { if (!isSel(day)) e.currentTarget.style.background = "transparent"; }}
                >
                  {day}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Number Stepper ───────────────────────────────────────────────────────────

function NumberStepper({
  value, onChange, min = 0, max = 9999, step = 1, prefix = "", suffix = "",
}: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; prefix?: string; suffix?: string;
}) {
  const btn: React.CSSProperties = {
    width: 36, flexShrink: 0, border: "none", background: "transparent",
    cursor: "pointer", fontSize: 18, lineHeight: 1,
    color: "var(--color-text-secondary)", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.08s ease",
  };
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", height: 36,
      background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
      borderRadius: 8, overflow: "hidden",
    }}>
      <button
        style={{ ...btn, opacity: value <= min ? 0.3 : 1 }}
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-app)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        −
      </button>
      <div style={{ width: 1, height: "55%", background: "var(--color-border)" }} />
      <div style={{ minWidth: 60, textAlign: "center", fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", padding: "0 14px" }}>
        {prefix}{value}{suffix}
      </div>
      <div style={{ width: 1, height: "55%", background: "var(--color-border)" }} />
      <button
        style={{ ...btn, opacity: value >= max ? 0.3 : 1 }}
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-app)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        +
      </button>
    </div>
  );
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

function InputsSection() {
  const [text, setText]       = useState("Brass Table Lamp");
  const [search, setSearch]   = useState("");
  const [select, setSelect]   = useState("furniture");
  const [textarea, setTextarea] = useState("Initial sketches look promising. The proportions feel right — might push the base a bit wider.\n\nNext: material samples.");
  const [tog1, setTog1]       = useState(true);
  const [tog2, setTog2]       = useState(false);
  const [ch1, setCh1]         = useState(true);
  const [ch2, setCh2]         = useState(false);
  const [date, setDate]       = useState<Date | null>(null);
  const [qty, setQty]         = useState(1);
  const [rate, setRate]       = useState(150);
  const [duration, setDuration] = useState(90);

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 12,
    background: "var(--color-surface-sunken)",
    border: "0.5px solid var(--color-border)",
    borderRadius: 8, color: "var(--color-text-primary)",
    fontFamily: "inherit", outline: "none",
    transition: "border-color 0.12s ease",
  };

  return (
    <Section id="inputs" title="Inputs" description="All input types with live interaction. Focus states use the sage focus ring.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <div>
          <SubSection title="Text Input">
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                Project title
              </label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px var(--color-focus-ring)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                Disabled
              </label>
              <input value="Read-only value" disabled style={{ ...inputStyle, opacity: 0.55, cursor: "not-allowed" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-red-orange)", marginBottom: 6 }}>
                Error state
              </label>
              <input
                value=""
                placeholder="This field is required"
                style={{ ...inputStyle, borderColor: "var(--color-red-orange)" }}
                onFocus={(e) => { e.target.style.boxShadow = "0 0 0 3px rgba(220,62,13,0.15)"; }}
                onBlur={(e)  => { e.target.style.boxShadow = "none"; }}
                onChange={() => {}}
              />
              <p style={{ fontSize: 10, color: "var(--color-red-orange)", marginTop: 4 }}>This field is required</p>
            </div>
          </SubSection>

          <SubSection title="Search">
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts, notes, projects…"
                style={{ ...inputStyle, paddingLeft: 30 }}
                onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px var(--color-focus-ring)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </SubSection>

          <SubSection title="Select (custom dropdown)">
            <CustomSelect
              value={select}
              onChange={setSelect}
              options={[
                { value: "furniture",      label: "Furniture"      },
                { value: "sculpture",      label: "Sculpture"      },
                { value: "painting",       label: "Painting"       },
                { value: "client_project", label: "Client project" },
                { value: "ceramics",       label: "Ceramics"       },
              ]}
              placeholder="Select project type…"
            />
          </SubSection>
        </div>

        <div>
          <SubSection title="Textarea">
            <textarea
              value={textarea}
              onChange={(e) => setTextarea(e.target.value)}
              rows={5}
              style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }}
              onFocus={(e) => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px var(--color-focus-ring)"; }}
              onBlur={(e)  => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
            />
          </SubSection>

          <SubSection title="Toggles">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Email notifications", sub: "Receive updates at your email", val: tog1, set: () => setTog1(v => !v) },
                { label: "Weekly summary",      sub: "Every Monday at 9 AM",          val: tog2, set: () => setTog2(v => !v) },
              ].map((t) => (
                <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--color-surface-raised)", borderRadius: 8, border: "0.5px solid var(--color-border)" }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{t.label}</p>
                    <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{t.sub}</p>
                  </div>
                  <DSToggle checked={t.val} onChange={t.set} />
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Checkboxes">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Send invoice to client", val: ch1, set: () => setCh1(v => !v) },
                { label: "Mark as billable",       val: ch2, set: () => setCh2(v => !v) },
              ].map((c) => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={c.set}>
                  <DSCheckbox checked={c.val} onChange={c.set} />
                  <span style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{c.label}</span>
                </div>
              ))}
            </div>
          </SubSection>
        </div>
      </div>

      {/* Date Picker + Number Stepper — full width below the 2-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 8 }}>
        <SubSection title="Date Picker">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
              Due date
            </label>
            <DSDatePicker value={date} onChange={setDate} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
              Project type
            </label>
            <CustomSelect
              value={select}
              onChange={setSelect}
              options={[
                { value: "furniture",      label: "Furniture"      },
                { value: "sculpture",      label: "Sculpture"      },
                { value: "painting",       label: "Painting"       },
                { value: "client_project", label: "Client project" },
                { value: "ceramics",       label: "Ceramics"       },
              ]}
            />
          </div>
        </SubSection>

        <SubSection title="Number Stepper">
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 8 }}>
              Quantity
            </label>
            <NumberStepper value={qty} onChange={setQty} min={1} max={50} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 8 }}>
              Hourly rate
            </label>
            <NumberStepper value={rate} onChange={setRate} min={0} max={9999} step={25} prefix="$" suffix="/hr" />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 8 }}>
              Duration (minutes)
            </label>
            <NumberStepper value={duration} onChange={setDuration} min={15} max={480} step={15} suffix=" min" />
          </div>
        </SubSection>
      </div>
    </Section>
  );
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────

function FilterTabsSection() {
  const [tab1, setTab1] = useState("all");
  const [tab2, setTab2] = useState("overview");

  const TABS_1 = [
    { key: "all", label: "All", count: 14 },
    { key: "in_progress", label: "In Progress", count: 5 },
    { key: "planning", label: "Planning", count: 4 },
    { key: "on_hold", label: "On Hold", count: 2 },
    { key: "complete", label: "Complete", count: 3 },
  ];

  const TABS_2 = ["Overview", "Time", "Expenses", "Invoices"].map(l => ({ key: l.toLowerCase(), label: l }));

  function TabBar({ tabs, active, onSelect, showCount = false }: {
    tabs: { key: string; label: string; count?: number }[]; active: string; onSelect: (k: string) => void; showCount?: boolean;
  }) {
    return (
      <div style={{ display: "flex", gap: 2, padding: "6px", background: "rgba(155,163,122,0.08)", borderRadius: 10, border: "0.5px solid rgba(155,163,122,0.20)", width: "fit-content" }}>
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              style={{
                padding: "5px 14px", borderRadius: 7, fontSize: 12, border: "none", cursor: "pointer",
                background: isActive ? "var(--color-surface-raised)" : "transparent",
                color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: isActive ? 600 : 400,
                fontFamily: "inherit",
                transition: "all 0.12s ease",
                display: "flex", alignItems: "center", gap: 5,
                boxShadow: isActive ? "var(--shadow-sm)" : "none",
              }}
            >
              {t.label}
              {showCount && "count" in t && (
                <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <Section id="filter-tabs" title="Filter Tabs" description="Tab navigation pattern. Used in Projects, Finance, Notes, and more.">
      <SubSection title="With Counts (Projects, Contacts)">
        <TabBar tabs={TABS_1} active={tab1} onSelect={setTab1} showCount />
      </SubSection>
      <SubSection title="Without Counts (Finance, Presence)">
        <TabBar tabs={TABS_2} active={tab2} onSelect={setTab2} />
      </SubSection>
    </Section>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function CardsSection() {
  return (
    <Section id="cards" title="Cards" description="Card pattern used across the home dashboard, project grid, and detail panels.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {/* Standard card */}
        <div style={{ background: "var(--color-surface-raised)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid var(--color-border)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: "var(--color-text-primary)" }}>Standard Card</span>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 9999, background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", color: "var(--color-text-tertiary)" }}>
              Apr 2026
            </span>
          </div>
          {["Row one · detail", "Row two · detail", "Row three · detail"].map((r, i, arr) => (
            <div key={r} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", fontSize: 12, borderBottom: i < arr.length - 1 ? "0.5px solid var(--color-border)" : "none" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>{r.split(" · ")[0]}</span>
              <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{r.split(" · ")[1]}</span>
            </div>
          ))}
        </div>

        {/* Project card */}
        <div style={{ background: "var(--color-surface-raised)", borderRadius: 14, boxShadow: "var(--shadow-card)", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 9999, background: "rgba(37,99,171,0.10)", color: "#2563ab" }}>Client</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 9999, background: "rgba(141,208,71,0.15)", color: "#3d6b4f" }}>In Progress</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>Foster Apartment</p>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12 }}>Interior furniture spec · 3 pieces</p>
          <div style={{ height: 4, borderRadius: 2, background: "var(--color-surface-sunken)", marginBottom: 8 }}>
            <div style={{ height: "100%", width: "65%", borderRadius: 2, background: "var(--color-sage)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-tertiary)" }}>
            <span>3 of 5 tasks</span>
            <span style={{ color: "#a07800" }}>Due May 14</span>
          </div>
        </div>

        {/* Home dashboard stat card */}
        <div style={{ background: "var(--color-surface-raised)", borderRadius: 14, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid var(--color-border)" }}>
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: "var(--color-text-primary)" }}>Needs attention</span>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 9999, background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", color: "var(--color-text-tertiary)" }}>3</span>
          </div>
          {[
            { name: "Sarah Chen", org: "Lehman Gallery", ago: "Never", color: "var(--color-red-orange)" },
            { name: "James Porter", org: "—", ago: "8w ago", color: "#b8860b" },
            { name: "Alice Morris", org: "ICFF", ago: "6w ago", color: "#b8860b" },
          ].map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "0.5px solid var(--color-border)" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                {c.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</p>
                <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{c.org}</p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: c.color, flexShrink: 0 }}>{c.ago}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────────────

function TablesSection() {
  const [selected, setSelected] = useState<Set<number>>(new Set([0]));
  const COLS = "32px 2.4fr 1.6fr 1.2fr 0.9fr 1fr";
  const ROWS = [
    { name: "Sarah Chen",  co: "Lehman Gallery",   tags: ["gallery","client"], status: "active", lc: "Today"  },
    { name: "James Porter",co: "—",                tags: ["lead"],             status: "lead",   lc: "8w ago" },
    { name: "Alice Morris",co: "ICFF",             tags: ["event"],            status: "active", lc: "6w ago" },
    { name: "Wei Tanaka",  co: "Studio Wabi",      tags: ["supplier"],         status: "active", lc: "2d ago" },
  ];
  const TAG_MAP: Record<string, { bg: string; color: string }> = {
    gallery:  { bg: "rgba(37,99,171,0.10)",   color: "#2563ab" },
    client:   { bg: "rgba(61,107,79,0.10)",   color: "#3d6b4f" },
    lead:     { bg: "rgba(154,150,144,0.10)", color: "#6b6860" },
    event:    { bg: "rgba(20,140,140,0.10)",  color: "#148c8c" },
    supplier: { bg: "rgba(184,134,11,0.10)",  color: "#b8860b" },
  };
  const STATUS_MAP: Record<string, { dot: string; label: string }> = {
    active: { dot: "var(--color-sage)", label: "Active" },
    lead:   { dot: "#b8860b",           label: "Lead"   },
  };

  return (
    <Section id="tables" title="Tables" description="Row-based data layout. Used in Contacts, Invoices, and Expenses.">
      <div style={{ border: "0.5px solid var(--color-border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "8px 20px", background: "var(--color-surface-sunken)", borderBottom: "0.5px solid var(--color-border)" }}>
          <div />
          {["Name", "Company", "Tags", "Status", "Last contact"].map((h) => (
            <div key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>{h}</div>
          ))}
        </div>
        {ROWS.map((r, i) => {
          const isSel = selected.has(i);
          return (
            <div
              key={r.name}
              style={{
                display: "grid", gridTemplateColumns: COLS, padding: "0 20px", minHeight: 48,
                alignItems: "center", cursor: "pointer",
                background: isSel ? "rgba(155,163,122,0.07)" : "var(--color-surface-raised)",
                borderBottom: i < ROWS.length - 1 ? "0.5px solid var(--color-border)" : "none",
              }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "var(--color-surface-raised)"; }}
              onClick={() => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })}
            >
              <DSCheckbox checked={isSel} onChange={() => {}} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 8px 0" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                  {r.name.split(" ").map(n => n[0]).join("")}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{r.name}</span>
              </div>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.co}</span>
              <div style={{ display: "flex", gap: 4 }}>
                {r.tags.map((t) => (
                  <span key={t} style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 9999, background: TAG_MAP[t].bg, color: TAG_MAP[t].color }}>{t}</span>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_MAP[r.status].dot }} />
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{STATUS_MAP[r.status].label}</span>
              </div>
              <span style={{ fontSize: 11, color: r.lc === "Today" ? "var(--color-sage)" : r.lc.includes("w") ? "#b8860b" : "var(--color-text-tertiary)" }}>{r.lc}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ModalsSection() {
  return (
    <Section id="modals" title="Modals" description="Centered dialog for creation, editing, and confirmation. Max-width 480px standard.">
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Full modal mockup */}
        <div style={{ flex: 2, background: "var(--color-surface-sunken)", borderRadius: 16, padding: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--color-surface-raised)", borderRadius: 16, border: "0.5px solid var(--color-border)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 400, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "0.5px solid var(--color-border)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>New project</h3>
              <button style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l10 10M13 3L3 13"/></svg>
              </button>
            </div>
            {/* Body */}
            <div style={{ padding: "20px 20px 8px" }}>
              {[
                { label: "Title", placeholder: "e.g. Brass Table Lamp" },
                { label: "Type", placeholder: "Select type…", isSelect: true },
                { label: "Due date", placeholder: "Pick a date…" },
              ].map((f) => (
                <div key={f.label} style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                    {f.label}
                  </label>
                  <div style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", borderRadius: 8, color: "var(--color-text-tertiary)" }}>
                    {f.placeholder}
                  </div>
                </div>
              ))}
            </div>
            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px 16px", borderTop: "0.5px solid var(--color-border)" }}>
              <DSButton variant="secondary" size="sm">Cancel</DSButton>
              <DSButton variant="primary" size="sm">Create project</DSButton>
            </div>
          </div>
        </div>

        {/* Anatomy notes */}
        <div style={{ flex: 1 }}>
          <SubSection title="Anatomy">
            {[
              { part: "Container", spec: "bg: surface-raised · radius-xl · shadow-lg · border" },
              { part: "Header",    spec: "14px semibold · close button · border-bottom" },
              { part: "Body",      spec: "20px padding · form fields with 16px gap" },
              { part: "Footer",    spec: "border-top · flex end · gap-2 buttons" },
            ].map((a) => (
              <div key={a.part} style={{ padding: "10px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>{a.part}</p>
                <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>{a.spec}</p>
              </div>
            ))}
          </SubSection>
        </div>
      </div>
    </Section>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function PanelsSection() {
  return (
    <Section id="panels" title="Panels" description="Right-edge detail panels slide in over content. Used in Projects, Contacts, Outreach.">
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 2, background: "var(--color-surface-sunken)", borderRadius: 16, padding: "0 0 0 32px", display: "flex", overflow: "hidden", minHeight: 360 }}>
          {/* Simulated page content */}
          <div style={{ flex: 1, padding: "24px 16px 24px 0", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignContent: "start" }}>
            {[0,1,2,3,4,5].map((i) => (
              <div key={i} style={{ height: 72, borderRadius: 10, background: "var(--color-surface-raised)", border: "0.5px solid var(--color-border)", opacity: 0.6 }} />
            ))}
          </div>
          {/* Panel */}
          <div style={{ width: 300, background: "var(--color-surface-raised)", borderLeft: "0.5px solid var(--color-border)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "0.5px solid var(--color-border)" }}>
              <button style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M10 3L5 8l5 5"/></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: "var(--color-text-primary)" }}>Brass Table Lamp</span>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 9999, background: "rgba(141,208,71,0.15)", color: "#3d6b4f", fontWeight: 600 }}>In Progress</span>
            </div>
            <div style={{ flex: 1, padding: "16px", overflow: "auto" }}>
              {[
                { label: "Type", value: "Furniture" },
                { label: "Priority", value: "High" },
                { label: "Due date", value: "May 14, 2026" },
                { label: "Est. value", value: "$2,400" },
              ].map((r) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--color-border)", fontSize: 12 }}>
                  <span style={{ color: "var(--color-text-tertiary)" }}>{r.label}</span>
                  <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <SubSection title="Anatomy">
            {[
              { part: "Container",  spec: "bg: surface-raised · border-left · shadow-lg · fixed width (320–400px)" },
              { part: "Header",     spec: "back chevron · title (13px semibold) · status badge · border-bottom" },
              { part: "Body",       spec: "16px padding · key-value rows at 12px · border-bottom on each row" },
              { part: "Sections",   spec: "Grouped by: details, tasks, notes, activity" },
            ].map((a) => (
              <div key={a.part} style={{ padding: "10px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>{a.part}</p>
                <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>{a.spec}</p>
              </div>
            ))}
          </SubSection>
        </div>
      </div>
    </Section>
  );
}

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyStatesSection() {
  return (
    <Section id="empty-states" title="Empty States" description="Module-level and list-level empty states. Always include a CTA and enough context to orient the user.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Module-level */}
        <div style={{ background: "var(--color-surface-raised)", borderRadius: 14, border: "0.5px solid var(--color-border)", padding: "64px 48px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(155,163,122,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>No projects yet</h3>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.6, marginBottom: 20, maxWidth: 240 }}>
            Projects are the core of your studio. Add your first to start tracking work, time, and value.
          </p>
          <DSButton variant="primary" size="md">+ New project</DSButton>
        </div>

        {/* List-level (inline in a table/list) */}
        <div style={{ background: "var(--color-surface-raised)", borderRadius: 14, border: "0.5px solid var(--color-border)", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "0.5px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>Recent notes</span>
            <span style={{ fontSize: 11, color: "#2563ab" }}>View all →</span>
          </div>
          <div style={{ padding: "48px 32px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>No notes yet</p>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 16 }}>Use the quick compose above to capture your first thought.</p>
          </div>
        </div>

        {/* All caught up */}
        <div style={{ background: "var(--color-surface-raised)", borderRadius: 14, border: "0.5px solid var(--color-border)", padding: "40px 48px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(141,208,71,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#3d6b4f" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8l4 4 8-8"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>You&apos;re all caught up</h3>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>No overdue items today.</p>
        </div>

        {/* No search results */}
        <div style={{ background: "var(--color-surface-raised)", borderRadius: 14, border: "0.5px solid var(--color-border)", padding: "40px 48px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>No results match</h3>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Try adjusting your search or filters.</p>
        </div>
      </div>
    </Section>
  );
}

// ─── Status ───────────────────────────────────────────────────────────────────

function StatusSection() {
  return (
    <Section id="status" title="Status" description="Status dots, due date badges, and priority indicators used throughout the app.">
      <SubSection title="Status Dots">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {[
            { label: "In Progress", color: "var(--color-sage)",       stroke: false },
            { label: "Planning",    color: "var(--color-grey)",        stroke: true  },
            { label: "On Hold",     color: "var(--color-warm-yellow)", stroke: false },
            { label: "Complete",    color: "var(--color-green)",       stroke: false },
            { label: "Active",      color: "var(--color-sage)",        stroke: false },
            { label: "Inactive",    color: "var(--color-grey)",        stroke: true  },
            { label: "Lead",        color: "#b8860b",                  stroke: false },
            { label: "Overdue",     color: "var(--color-red-orange)",  stroke: false },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                background: s.stroke ? "transparent" : s.color,
                border: s.stroke ? `1.5px solid ${s.color}` : "none",
              }} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </SubSection>

      <SubSection title="Due Date Badges">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { label: "Overdue",    bg: "rgba(220,62,13,0.10)", color: "var(--color-red-orange)" },
            { label: "Today",      bg: "rgba(232,197,71,0.18)", color: "#a07800" },
            { label: "Tomorrow",   bg: "rgba(232,197,71,0.12)", color: "#a07800" },
            { label: "3d",         bg: "rgba(232,197,71,0.10)", color: "#a07800" },
            { label: "May 14",     bg: "rgba(31,33,26,0.06)",  color: "var(--color-text-tertiary)" },
            { label: "Jun 1",      bg: "rgba(31,33,26,0.06)",  color: "var(--color-text-tertiary)" },
          ].map((d) => (
            <span key={d.label} style={{
              fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 9999,
              background: d.bg, color: d.color, textTransform: "uppercase", letterSpacing: "0.03em",
            }}>
              {d.label}
            </span>
          ))}
        </div>
      </SubSection>

      <SubSection title="Priority">
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "High",   color: "var(--color-red-orange)",    bg: "rgba(220,62,13,0.10)",   d: "M4 1L7 6H1z"  },
            { label: "Medium", color: "#b8860b",                    bg: "rgba(184,134,11,0.10)",  d: "M1 4h6"       },
            { label: "Low",    color: "var(--color-text-tertiary)", bg: "rgba(31,33,26,0.07)",   d: "M4 6L1 1h6z"  },
          ].map((p) => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 9999, background: p.bg }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}>
                {p.label === "Medium"
                  ? <path d={p.d} stroke={p.color} strokeWidth="1.8" strokeLinecap="round"/>
                  : <path d={p.d} fill={p.color}/>
                }
              </svg>
              <span style={{ fontSize: 11, fontWeight: 600, color: p.color }}>{p.label}</span>
            </div>
          ))}
        </div>
      </SubSection>
    </Section>
  );
}

// ─── Layouts ──────────────────────────────────────────────────────────────────

function LayoutsSection() {
  const BOX = (color: string, label?: string, style?: React.CSSProperties) => (
    <div style={{ background: color, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
      {label && <span style={{ fontSize: 8, fontWeight: 600, color: "white", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>}
    </div>
  );

  const layouts = [
    {
      name: "Home Dashboard",
      desc: "3-col grid · spanning cards · Home",
      diagram: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr", gridTemplateRows: "1fr 1fr 0.6fr", gap: 4, width: "100%", height: 120 }}>
          {BOX("rgba(155,163,122,0.5)", "Notes", { gridColumn: "span 2", gridRow: "span 2" })}
          {BOX("rgba(155,163,122,0.35)", "Today", { gridRow: "span 2" })}
          {BOX("rgba(155,163,122,0.25)", "Finance")}
          {BOX("rgba(155,163,122,0.25)", "Projects")}
          {BOX("rgba(155,163,122,0.25)", "Contacts")}
        </div>
      ),
    },
    {
      name: "Card Grid",
      desc: "3-col cards · status groups · Projects",
      diagram: (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, height: 120 }}>
          <div style={{ height: 10, background: "rgba(155,163,122,0.25)", borderRadius: 3 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, flex: 1 }}>
            {[...Array(6)].map((_, i) => <div key={i} style={{ background: "rgba(155,163,122,0.35)", borderRadius: 4 }} />)}
          </div>
        </div>
      ),
    },
    {
      name: "Table",
      desc: "Full-width rows · header · Contacts",
      diagram: (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, height: 120 }}>
          {BOX("rgba(155,163,122,0.4)", "Header", { height: 20 })}
          {[...Array(4)].map((_, i) => <div key={i} style={{ flex: 1, background: "rgba(155,163,122,0.2)", borderRadius: 4 }} />)}
        </div>
      ),
    },
    {
      name: "List + Panel",
      desc: "List col · detail panel · Contacts, Notes",
      diagram: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 4, height: 120 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[...Array(4)].map((_, i) => <div key={i} style={{ flex: 1, background: "rgba(155,163,122,0.25)", borderRadius: 4 }} />)}
          </div>
          {BOX("rgba(155,163,122,0.45)", "Detail")}
        </div>
      ),
    },
    {
      name: "Two-Column Admin",
      desc: "Left nav · content · Settings, Resources",
      diagram: (
        <div style={{ display: "grid", gridTemplateColumns: "0.5fr 1fr", gap: 4, height: 120 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {BOX("rgba(155,163,122,0.4)", "Nav", { flex: 1 })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[...Array(3)].map((_, i) => <div key={i} style={{ flex: 1, background: "rgba(155,163,122,0.2)", borderRadius: 4 }} />)}
          </div>
        </div>
      ),
    },
    {
      name: "Kanban",
      desc: "Horizontal columns · drag-to-stage · Outreach",
      diagram: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, height: 120 }}>
          {["Identify","Submit","Discuss","Closed"].map((col) => (
            <div key={col} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {BOX("rgba(155,163,122,0.4)", col, { height: 14 })}
              {[...Array(2)].map((_, i) => <div key={i} style={{ flex: 1, background: "rgba(155,163,122,0.2)", borderRadius: 4 }} />)}
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <Section id="layouts" title="Page Layouts" description="The 6 layout patterns used across Perennial. The sidebar (56px collapsed / 200px expanded) is always present.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {layouts.map((l) => (
          <div key={l.name} style={{ background: "var(--color-surface-raised)", borderRadius: 12, border: "0.5px solid var(--color-border)", padding: 16 }}>
            <div style={{ marginBottom: 12 }}>{l.diagram}</div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 2 }}>{l.name}</p>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{l.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Ash ──────────────────────────────────────────────────────────────────────

function AshSection() {
  const [_thinking] = useState(false);

  // Gradient helpers
  const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";
  const ASH_GRADIENT_SOFT = "linear-gradient(135deg, rgba(155,163,122,0.18) 0%, rgba(107,138,78,0.10) 50%, rgba(155,163,122,0.16) 100%)";
  const ASH_WAVE_BG = {
    background: `linear-gradient(135deg,
      rgba(155,163,122,0.14) 0%,
      rgba(141,208,71,0.07)  25%,
      rgba(155,163,122,0.18) 50%,
      rgba(107,138,78,0.10)  75%,
      rgba(155,163,122,0.14) 100%)`,
    backgroundSize: "300% 300%",
    animation: "ash-wave 6s ease infinite",
  };

  // Streaming text skeleton widths
  const STREAM_LINES = ["92%", "85%", "78%", "60%"];

  return (
    <Section
      id="ash"
      title="Ash"
      description="Visual language for Ash — Perennial's generative AI layer. The mark, its animations, and all embedded patterns."
    >

      {/* ── Logomark ── */}
      <SubSection title="Logomark">
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
          {/* On light */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 16 }}>
              On light surfaces
            </p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
              {[14, 20, 28, 40].map((size) => (
                <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <img src="/Ash-Logomak.svg" alt="Ash" style={{ width: size, height: size }} />
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--color-text-tertiary)" }}>{size}px</span>
                </div>
              ))}
            </div>
          </div>

          {/* On dark / gradient */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 16 }}>
              On dark / gradient
            </p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 20, padding: "16px 24px", borderRadius: 12, background: ASH_GRADIENT }}>
              {[14, 20, 28, 40].map((size) => (
                <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <img
                    src="/Ash-Logomak.svg" alt="Ash"
                    style={{ width: size, height: size, filter: "brightness(0) invert(1)", opacity: 0.92 }}
                  />
                  <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>{size}px</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SubSection>

      {/* ── Floating Button ── */}
      <SubSection title="Floating Button">
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          {/* Live demo */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: ASH_GRADIENT,
                boxShadow: "0 2px 10px rgba(155,163,122,0.38), 0 1px 3px rgba(0,0,0,0.12)",
                animation: "ash-glow 4.5s ease-in-out infinite",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <img src="/Ash-Logomak.svg" alt="Ash" style={{ width: 26, height: 26, filter: "brightness(0) invert(1)", opacity: 0.92, animation: "ash-shimmer 4.5s ease-in-out infinite" }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Resting</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                background: ASH_GRADIENT,
                boxShadow: "0 6px 24px rgba(155,163,122,0.65), 0 2px 6px rgba(0,0,0,0.15)",
                transform: "scale(1.07)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <img src="/Ash-Logomak.svg" alt="Ash" style={{ width: 26, height: 26, filter: "brightness(0) invert(1)" }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Hover</span>
          </div>

          {/* Spec */}
          <div style={{ padding: "16px 20px", background: "var(--color-surface-raised)", borderRadius: 10, border: "0.5px solid var(--color-border)", fontSize: 12 }}>
            <p style={{ fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>Floating button spec</p>
            {[
              ["Size",       "44 × 44px, circle"],
              ["Background", "ash gradient 145°"],
              ["Animation",  "ash-glow, 4.5s ease infinite"],
              ["Position",   "fixed bottom-6 right-6"],
              ["z-index",    "20"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                <span style={{ color: "var(--color-text-tertiary)", width: 90, flexShrink: 0 }}>{k}</span>
                <span style={{ color: "var(--color-text-primary)", fontFamily: "monospace", fontSize: 11 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </SubSection>

      {/* ── Inline Elements ── */}
      <SubSection title="Inline Elements">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
          {/* Ask Ash chip */}
          <button style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 9999, border: "none",
            background: ASH_GRADIENT, color: "white",
            fontSize: 11, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 1px 5px rgba(155,163,122,0.45)",
            lineHeight: 1, fontFamily: "inherit",
          }}>
            <img src="/Ash-Logomak.svg" alt="" style={{ width: 11, height: 11, filter: "brightness(0) invert(1)", opacity: 0.9 }} />
            Ask Ash
          </button>

          {/* Ash attribution */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 9999,
            background: "var(--color-ash-tint)",
            border: "0.5px solid var(--color-ash-border)",
            fontSize: 10, fontWeight: 600, color: "var(--color-ash-dark)",
            lineHeight: 1,
          }}>
            <img src="/Ash-Logomak.svg" alt="" style={{ width: 10, height: 10 }} />
            Generated by Ash
          </span>

          {/* Ash powered pill */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 9999,
            background: "transparent",
            border: "0.5px solid var(--color-ash-border)",
            fontSize: 10, fontWeight: 600, color: "var(--color-ash)",
            lineHeight: 1,
          }}>
            <img src="/Ash-Logomak.svg" alt="" style={{ width: 10, height: 10, animation: "ash-shimmer 4s ease-in-out infinite" }} />
            Powered by Ash
          </span>

          {/* Inline suggestion badge */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 7px", borderRadius: 4,
            background: "var(--color-ash-tint)",
            fontSize: 10, fontWeight: 600, color: "var(--color-ash-dark)",
            letterSpacing: "0.04em", textTransform: "uppercase",
            lineHeight: 1,
          }}>
            Ash
          </span>
        </div>

        {/* Ash button — full variants */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {[
            { label: "Primary",  bg: ASH_GRADIENT,       color: "white",                   border: "none",         shadow: "0 1px 5px rgba(155,163,122,0.45)" },
            { label: "Outline",  bg: "transparent",       color: "var(--color-ash)",         border: "1px solid var(--color-ash-border)", shadow: "none" },
            { label: "Ghost",    bg: "var(--color-ash-tint)", color: "var(--color-ash-dark)", border: "none",       shadow: "none" },
          ].map((v) => (
            <button key={v.label} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 18px", borderRadius: 8,
              background: v.bg, color: v.color, border: v.border,
              boxShadow: v.shadow,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              lineHeight: 1, fontFamily: "inherit",
            }}>
              <img src="/Ash-Logomak.svg" alt="" style={{
                width: 13, height: 13,
                filter: v.label === "Primary" ? "brightness(0) invert(1)" : undefined,
                opacity: v.label === "Primary" ? 0.9 : 1,
              }} />
              {v.label}
            </button>
          ))}
        </div>
      </SubSection>

      {/* ── Generating States ── */}
      <SubSection title="Generating States">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>

          {/* Idle / ambient */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 16px", background: "var(--color-surface-raised)", borderRadius: 12, border: "0.5px solid var(--color-border)" }}>
            <div style={{ position: "relative", width: 44, height: 44 }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: ASH_GRADIENT,
                boxShadow: "0 2px 10px rgba(155,163,122,0.38)",
                animation: "ash-glow 4.5s ease-in-out infinite",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <img src="/Ash-Logomak.svg" alt="" style={{ width: 26, height: 26, filter: "brightness(0) invert(1)", opacity: 0.92, animation: "ash-shimmer 4.5s ease-in-out infinite" }} />
              </div>
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>Idle</p>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", lineHeight: 1.5 }}>Breathing glow · 4.5s · ash-glow</p>
          </div>

          {/* Thinking — pulsing rings + slow spin */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 16px", background: "var(--color-surface-raised)", borderRadius: 12, border: "0.5px solid var(--color-border)" }}>
            <div style={{ position: "relative", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Diffuse halo — radial gradient blob, no hard edge */}
              <div style={{
                position: "absolute",
                inset: -6,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(155,163,122,0.45) 0%, rgba(155,163,122,0.15) 50%, transparent 72%)",
                filter: "blur(3px)",
                animation: "ash-ring 2.6s ease-out 0s infinite",
              }} />
              {/* Drifting mark */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: ASH_GRADIENT,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <img
                  src="/Ash-Logomak.svg" alt=""
                  style={{ width: 26, height: 26, filter: "brightness(0) invert(1)", opacity: 0.92, animation: "ash-think 4.5s ease-in-out infinite" }}
                />
              </div>
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>Thinking</p>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", lineHeight: 1.5 }}>Spin + ring pulse · ash-think · ash-ring</p>
          </div>

          {/* Typing */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "24px 16px", background: "var(--color-surface-raised)", borderRadius: 12, border: "0.5px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 14px", borderRadius: 10, background: "rgba(155,163,122,0.14)", border: "0.5px solid var(--color-ash-border)" }}>
              <img src="/Ash-Logomak.svg" alt="" style={{ width: 15, height: 15, animation: "ash-shimmer 2s ease-in-out infinite" }} />
              <div style={{ display: "flex", gap: 5, alignItems: "center", paddingBottom: 1 }}>
                {[0, 0.22, 0.44].map((d) => (
                  <div key={d} style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "var(--color-ash-mid)",
                    animation: `ash-dot 1.4s ease-in-out ${d}s infinite`,
                  }} />
                ))}
              </div>
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>Typing</p>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", lineHeight: 1.5 }}>Sequential bounce · ash-dot · 0.2s stagger</p>
          </div>

          {/* Streaming */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: "24px 16px", background: "var(--color-surface-raised)", borderRadius: 12, border: "0.5px solid var(--color-border)", width: "100%" }}>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7 }}>
              {STREAM_LINES.map((w, i) => (
                <div key={i} style={{
                  height: 10, borderRadius: 5, width: w,
                  background: `linear-gradient(90deg, rgba(155,163,122,0.07) 0%, rgba(155,163,122,0.07) 30%, rgba(195,222,155,0.70) 50%, rgba(155,163,122,0.07) 70%, rgba(155,163,122,0.07) 100%)`,
                  backgroundSize: "280% 100%",
                  animation: `ash-stream 2.4s ease-in-out ${i * 0.22}s infinite`,
                }} />
              ))}
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>Streaming</p>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>Horizontal shimmer · ash-stream · staggered</p>
          </div>
        </div>
      </SubSection>

      {/* ── Suggestion Strip ── */}
      <SubSection title="Suggestion Strip">
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 16 }}>
          Ash surfaces contextual suggestions at the base of cards and modules. Always dismissable.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Passive suggestion */}
          <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-card)", background: "var(--color-surface-raised)" }}>
            <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>Recent notes</span>
              <span style={{ fontSize: 11, color: "var(--color-blue)" }}>View all →</span>
            </div>
            <div style={{ padding: "10px 14px 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {["Brass finish notes", "ICFF booth layout", "Pricing structure"].map((n) => (
                <div key={n} style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border)", color: "var(--color-text-secondary)" }}>{n}</div>
              ))}
            </div>
            {/* Ash strip at footer */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 14px",
              ...ASH_WAVE_BG,
              borderTop: "0.5px solid var(--color-ash-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <img src="/Ash-Logomak.svg" alt="" style={{ width: 13, height: 13, animation: "ash-shimmer 4s ease-in-out infinite" }} />
                <span style={{ fontSize: 11, color: "var(--color-ash-dark)" }}>Want to summarise these notes into action items?</span>
              </div>
              <button style={{ fontSize: 11, fontWeight: 600, color: "var(--color-ash)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>
                Go →
              </button>
            </div>
          </div>

          {/* Active/expanded suggestion */}
          <div style={{
            padding: "12px 14px", borderRadius: 10,
            ...ASH_WAVE_BG,
            border: "0.5px solid var(--color-ash-border)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: ASH_GRADIENT, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/Ash-Logomak.svg" alt="" style={{ width: 16, height: 16, filter: "brightness(0) invert(1)", opacity: 0.92 }} />
            </div>
            <p style={{ flex: 1, fontSize: 12, color: "var(--color-ash-dark)", lineHeight: 1.5 }}>
              You have 3 invoices unpaid and your busiest quarter starts in 6 weeks. Want me to draft a follow-up email?
            </p>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: ASH_GRADIENT, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>Draft</button>
              <button style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, background: "transparent", color: "var(--color-text-tertiary)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>Later</button>
            </div>
          </div>
        </div>
      </SubSection>

      {/* ── Chat Bubble ── */}
      <SubSection title="Response Bubble">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 }}>
          {/* User */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ padding: "10px 14px", borderRadius: "12px 12px 4px 12px", background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", fontSize: 13, color: "var(--color-text-primary)", maxWidth: "75%" }}>
              What&apos;s my most profitable project this year?
            </div>
          </div>
          {/* Ash response */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: ASH_GRADIENT, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/Ash-Logomak.svg" alt="" style={{ width: 16, height: 16, filter: "brightness(0) invert(1)", opacity: 0.92 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ padding: "10px 14px", borderRadius: "4px 12px 12px 12px", background: "var(--color-surface-raised)", border: "0.5px solid var(--color-ash-border)", fontSize: 13, color: "var(--color-text-primary)", lineHeight: 1.6 }}>
                <strong>Foster Apartment</strong> — $8,400 billed, 42 hours logged. Effective rate $200/hr, well above your $150 average.
                <br /><br />
                Lehman Table is second at $5,200, though materials ran 18% over estimate.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, paddingLeft: 2 }}>
                <img src="/Ash-Logomak.svg" alt="" style={{ width: 9, height: 9, opacity: 0.5 }} />
                <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Ash · from your finance data</span>
              </div>
            </div>
          </div>
          {/* Typing state */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: ASH_GRADIENT, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src="/Ash-Logomak.svg" alt="" style={{ width: 16, height: 16, filter: "brightness(0) invert(1)", opacity: 0.92, animation: "ash-think 3s linear infinite" }} />
            </div>
            <div style={{ padding: "10px 14px", borderRadius: "4px 12px 12px 12px", background: "var(--color-surface-raised)", border: "0.5px solid var(--color-ash-border)", display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 0.2, 0.4].map((d) => (
                <div key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-ash)", animation: `ash-dot 1.4s ease-in-out ${d}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      </SubSection>

      {/* ── Gradients ── */}
      <SubSection title="Gradient Palette">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { label: "Primary (145°)",   bg: "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)" },
            { label: "Soft (135°)",      bg: "linear-gradient(135deg, rgba(155,163,122,0.30) 0%, rgba(107,138,78,0.18) 100%)" },
            { label: "Radial glow",      bg: "radial-gradient(circle at 35% 40%, rgba(155,163,122,0.40) 0%, transparent 70%)" },
            { label: "Wave (animated)",  bg: ASH_WAVE_BG.background, extra: ASH_WAVE_BG },
          ].map((g) => (
            <div key={g.label}>
              <div style={{
                height: 56, borderRadius: 10, marginBottom: 8,
                ...("extra" in g && g.extra ? { ...g.extra, backgroundSize: "300% 300%" } : { background: g.bg }),
                border: "0.5px solid var(--color-border)",
              }} />
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>{g.label}</p>
            </div>
          ))}
        </div>
      </SubSection>

      {/* ── Token reference ── */}
      <SubSection title="Tokens">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { name: "--color-ash",        val: "#9BA37A",              usage: "Primary mark color"          },
            { name: "--color-ash-dark",   val: "#4a6232",              usage: "Text on light, deep tones"   },
            { name: "--color-ash-mid",    val: "#6b8a4e",              usage: "Mid gradient stop"           },
            { name: "--color-ash-tint",   val: "rgba(155,163,122,.10)",usage: "Backgrounds, chips"          },
            { name: "--color-ash-border", val: "rgba(155,163,122,.28)",usage: "Borders around Ash elements" },
            { name: "--color-ash-glow",   val: "rgba(155,163,122,.50)",usage: "Box-shadow glow color"       },
          ].map((t) => (
            <div key={t.name} style={{ padding: "10px 12px", background: "var(--color-surface-raised)", borderRadius: 8, border: "0.5px solid var(--color-border)" }}>
              <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-ash-dark)", marginBottom: 3 }}>{t.name}</p>
              <p style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", marginBottom: 4 }}>{t.val}</p>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{t.usage}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--color-surface-raised)", borderRadius: 8, border: "0.5px solid var(--color-border)" }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 8 }}>Animations</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {[
              ["ash-glow",    "4.5s ease infinite", "Floating button breathing"],
              ["ash-shimmer", "4.5s ease infinite", "Mark opacity oscillation"],
              ["ash-think",   "3s linear infinite", "Rotating mark while processing"],
              ["ash-dot",     "1.4s ease infinite", "Typing dots, 0.2s stagger"],
              ["ash-stream",  "1.8s ease infinite", "Streaming text shimmer"],
              ["ash-wave",    "6s ease infinite",   "Background gradient wave"],
              ["ash-ring",    "2s ease-out infinite","Expanding pulse rings"],
            ].map(([name, timing, usage]) => (
              <div key={name} style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-ash-dark)", width: 110, flexShrink: 0 }}>{name}</span>
                <div>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)", display: "block" }}>{timing}</span>
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{usage}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SubSection>
    </Section>
  );
}

// ─── Left Nav ─────────────────────────────────────────────────────────────────

function LeftNav({ active, theme, onTheme }: {
  active: string; theme: "light" | "dark"; onTheme: () => void;
}) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      style={{
        width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--color-surface-raised)",
        borderRight: "0.5px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <Link
          href="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 12,
            fontSize: 11, color: "var(--color-text-tertiary)", textDecoration: "none",
            transition: "color 0.12s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5"/>
          </svg>
          Back to app
        </Link>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>
            perennial
          </span>
          <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>design system</span>
        </div>
        <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>v0.1 · internal</p>
      </div>

      {/* Section links */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--color-text-tertiary)", padding: "6px 20px 4px" }}>
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  style={{
                    width: "100%", textAlign: "left", padding: "6px 20px",
                    fontSize: 12, border: "none", cursor: "pointer",
                    background: isActive ? "var(--color-surface-sunken)" : "transparent",
                    color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontWeight: isActive ? 500 : 400,
                    fontFamily: "inherit",
                    borderLeft: `2px solid ${isActive ? "var(--color-sage)" : "transparent"}`,
                    transition: "all 0.1s ease",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Theme toggle */}
      <div style={{ padding: "16px 20px", borderTop: "0.5px solid var(--color-border)", flexShrink: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 10 }}>
          Theme
        </p>
        <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--color-border)" }}>
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onTheme()}
              style={{
                flex: 1, padding: "7px 0", fontSize: 11, fontWeight: theme === t ? 600 : 400,
                background: theme === t ? "var(--color-surface-sunken)" : "transparent",
                color: theme === t ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                textTransform: "capitalize", transition: "all 0.12s ease",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeSection, setActiveSection] = useState("colors");
  const contentRef = useRef<HTMLDivElement>(null);

  // Persist theme in localStorage
  useEffect(() => {
    const saved = (localStorage.getItem("perennial-theme") ?? "light") as "light" | "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("perennial-theme", next);
  }

  // Track active section via scroll
  useEffect(() => {
    const allIds = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 }
    );
    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--color-surface-app)", overflow: "hidden" }}>
      <LeftNav active={activeSection} theme={theme} onTheme={toggleTheme} />

      <main ref={contentRef} style={{ flex: 1, overflowY: "auto", position: "relative" }}>

        {/* Botanical decorations */}
        <img src="/botanicals/Botanical Illustrations-3.png" aria-hidden="true" alt=""
          style={{ position: "absolute", top: "-5%", right: "-10%", width: 700, height: "auto",
            opacity: 0.06, mixBlendMode: "multiply", pointerEvents: "none", userSelect: "none", zIndex: 0 }} />
        <img src="/botanicals/Botanical Illustrations-7.png" aria-hidden="true" alt=""
          style={{ position: "absolute", top: "28%", left: "-8%", width: 560, height: "auto",
            opacity: 0.055, mixBlendMode: "multiply", pointerEvents: "none", userSelect: "none", zIndex: 0 }} />
        <img src="/botanicals/Botanical Illustrations-1.png" aria-hidden="true" alt=""
          style={{ position: "absolute", top: "62%", right: "-6%", width: 620, height: "auto",
            opacity: 0.06, mixBlendMode: "multiply", pointerEvents: "none", userSelect: "none", zIndex: 0 }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <ColorsSection />
          <TypographySection />
          <SpacingSection />
          <ShadowsSection />
          <IconsSection />
          <ButtonsSection />
          <BadgesSection />
          <InputsSection />
          <FilterTabsSection />
          <CardsSection />
          <TablesSection />
          <ModalsSection />
          <PanelsSection />
          <EmptyStatesSection />
          <StatusSection />
          <LayoutsSection />
          <AshSection />

          {/* Footer */}
          <div style={{ padding: "40px 56px", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              Perennial Design System · v0.1 · Internal use only · All tokens defined in{" "}
              <code style={{ fontFamily: "monospace", fontSize: 10 }}>app/globals.css</code>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
