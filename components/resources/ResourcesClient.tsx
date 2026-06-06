"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AshInlineChat from "@/components/resources/AshInlineChat";
import type { Resource, ResourceLink, ResourceItemStatus, ResourceFolder } from "@/types/database";
import {
  LINKED_FILE_GROUPS,
  deepLinkForLinkedFile,
  type LinkedFile,
  type LinkedFileSource,
} from "@/lib/resources/linked-files";

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  accent: "var(--color-sage)", accentHex: "#9BA37A", accentL: "rgba(155,163,122,0.12)",
  blue:   "var(--color-sage)", blueL:     "rgba(155,163,122,0.12)",
  purple: "#6d4fa3",           purpleL:   "rgba(109,79,163,0.09)",
  amber:  "#b8860b",           amberL:    "rgba(184,134,11,0.10)",
  darkAccent: "#3d6b4f",       darkAccentL: "rgba(61,107,79,0.09)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
// CatId is what's selected in the left rail. The four seeded categories +
// "links" (Resource links) + one virtual id per cross-module file source
// ("linked-contact" / "linked-organization" / "linked-project"). The
// "linked-*" surfaces are read-only views of files owned by another module.
type CatId =
  | "all-files"
  | "operations" | "brand" | "press" | "design"
  | "links"
  | "linked-contact" | "linked-organization" | "linked-project"
  | "linked-invoice" | "linked-receipt" | "linked-studio";

// Coarse file kind for the unified "All files" filter, derived from MIME type
// or extension.
type FileKind = "image" | "pdf" | "doc" | "other";
function fileKind(name: string, type: string | null): FileKind {
  const t = (type ?? "").toLowerCase();
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (t.startsWith("image/") || ["png","jpg","jpeg","gif","webp","svg","heic","avif"].includes(ext)) return "image";
  if (t.includes("pdf") || ext === "pdf") return "pdf";
  if (t === "invoice" || t.includes("word") || t.includes("document") || t.includes("sheet") ||
      ["doc","docx","txt","rtf","md","pages","xls","xlsx","csv","numbers","ppt","pptx","key"].includes(ext)) return "doc";
  return "other";
}

/** A file from anywhere, normalized for the "All files" list. */
interface UnifiedFile {
  id:          string;
  name:        string;
  url:         string;
  kind:        FileKind;
  sourceLabel: string;
  href:        string;
  created_at:  string;
}

const LINKED_GROUP_LABEL: Record<LinkedFileSource, string> = Object.fromEntries(
  LINKED_FILE_GROUPS.map(g => [g.source, g.label]),
) as Record<LinkedFileSource, string>;

// Visibility key per rail group / sub-group. Persisted in localStorage so the
// user's left-rail config follows them across sessions.
const LINKED_VIS_KEY = "perennial:resources-linked-visibility";
const ONBOARD_BANNER_KEY = "perennial:resources-onboarding-banner-dismissed";

const LINKED_SOURCES: LinkedFileSource[] = ["contact", "organization", "project", "invoice", "receipt", "studio"];

function linkedCatId(s: LinkedFileSource): CatId {
  return `linked-${s}` as CatId;
}
function isLinkedCat(c: CatId): boolean {
  return typeof c === "string" && c.startsWith("linked-");
}
function linkedCatToSource(c: CatId): LinkedFileSource | null {
  if (!isLinkedCat(c)) return null;
  const s = c.slice("linked-".length) as LinkedFileSource;
  return LINKED_SOURCES.includes(s) ? s : null;
}

interface CardAction {
  label: string;
  variant?: "primary" | "ghost" | "finder";
  modal?: string;
}
interface ResourceCard {
  id: string;
  name: string;
  meta: string;
  itemType: "file" | "structured" | "link" | "alias";
  status: "complete" | "partial" | "empty" | "alias";
  previewType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previewData?: Record<string, any>;
  fields?: Record<string, unknown>;
  fileUrls: string[];
  externalUrl: string | null;
  actions: CardAction[];
  emptyWhy?: string;
  modalKey?: string;
}

type SeedCatId = "operations" | "brand" | "press" | "design";
const CAT_META: Record<SeedCatId, { label: string; sub: string; iconBg: string; iconColor: string; iconSvg: string }> = {
  operations: { label:"Operations", sub:"Legal, financial, and logistics documents",    iconBg:C.amberL,      iconColor:C.amber,  iconSvg:`<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 5h6M5 8h4M5 11h3"/>` },
  brand:      { label:"Brand",      sub:"Identity assets, positioning, and templates",   iconBg:C.purpleL,     iconColor:C.purple, iconSvg:`<circle cx="8" cy="8" r="5"/><path d="M8 4v2M8 10v2M4 8h2M10 8h2"/>` },
  press:      { label:"Press",      sub:"Media kit, pitch decks, and press coverage",   iconBg:C.accentL,     iconColor:C.darkAccent, iconSvg:`<path d="M2 2h12v9H2z"/><path d="M5 6h6M5 9h4"/>` },
  design:     { label:"Design",     sub:"Templates, product photos, and working files", iconBg:C.darkAccentL, iconColor:C.darkAccent, iconSvg:`<path d="M2 12L10 4l4 4-8 8-4 0 0-4z"/>` },
};
const CAT_IDS: SeedCatId[] = ["operations","brand","press","design"];

function resourceToCard(r: Resource): ResourceCard {
  return {
    id:          r.id,
    name:        r.name,
    meta:        r.meta,
    itemType:    r.item_type,
    status:      r.status,
    previewType: r.preview_type,
    previewData: r.preview_data as Record<string, unknown>,
    fields:      r.fields as Record<string, unknown>,
    fileUrls:    r.file_urls ?? [],
    externalUrl: r.external_url ?? null,
    actions:     r.actions as CardAction[],
    emptyWhy:    r.empty_why  ?? undefined,
    modalKey:    r.modal_key  ?? undefined,
  };
}

function catHealth(resources: Resource[], catId: string): [number, number] {
  const items = resources.filter(r => r.category === catId);
  return [items.filter(r => r.status === "complete").length, items.length];
}

interface ModalConfig {
  title: string;
  sub: string;
  iconBg: string;
  iconColor: string;
  why: string;
  prompts: { label: string; placeholder: string; rows: number }[];
}

const MODALS: Record<string, ModalConfig> = {
  missionvision: {
    title:"Mission & Vision", sub:"Guided prompts · ~15 min · or let Ash draft it in 2",
    iconBg:C.darkAccentL, iconColor:C.darkAccent,
    why:"Mission & Vision tells galleries, press, and collectors who you are beyond the work itself. A clear statement makes pitching faster and positions you for long-term representation.",
    prompts:[
      { label:"What do you make?", placeholder:"Describe your practice in one or two sentences. What medium, category, or approach?", rows:2 },
      { label:"Who is it for?", placeholder:"Who collects, commissions, or champions your work?", rows:2 },
      { label:"What makes your work distinct?", placeholder:"Process, materials, perspective — what no one else brings.", rows:3 },
      { label:"What are you building toward?", placeholder:"Your 5–10 year vision. Museum collection? Gallery representation?", rows:2 },
      { label:"Core values (2–3 words)", placeholder:"e.g. Materiality · Restraint · Longevity", rows:1 },
    ],
  },
  shipping: {
    title:"Shipping & Logistics", sub:"Key contacts, procedures, and specs",
    iconBg:C.amberL, iconColor:C.amber,
    why:"Having your preferred shipper, crating specs, and insurance contacts documented means you're ready when a gallery or collector asks — not scrambling for a week.",
    prompts:[
      { label:"Preferred shipper(s)", placeholder:"Who do you use for local, domestic, and international? Any account numbers?", rows:2 },
      { label:"Crating specs", placeholder:"Standard crate dimensions, materials, build time, and who builds them.", rows:2 },
      { label:"Insurance provider", placeholder:"Company, policy number, and what's covered.", rows:2 },
      { label:"International procedures", placeholder:"Customs broker, ATA carnet process, countries you commonly ship to.", rows:2 },
    ],
  },
  bizplan: {
    title:"Business Plan & Strategy", sub:"Goals, revenue targets, and growth direction",
    iconBg:C.accentL, iconColor:C.darkAccent,
    why:"A business plan focuses your decisions and is often required for grants, loans, or residencies. Even a short version helps you allocate time and money toward what matters.",
    prompts:[
      { label:"Revenue goal this year", placeholder:"Target number and how you plan to get there.", rows:2 },
      { label:"Top 3 priorities", placeholder:"What are you optimizing for in the next 12 months?", rows:2 },
      { label:"Biggest constraint", placeholder:"Studio space? Time? Capital? Production capacity?", rows:2 },
      { label:"Key milestones", placeholder:"First gallery show, price point increase, hire, new market…", rows:2 },
    ],
  },
  proposal: {
    title:"Proposal Template", sub:"A reusable starting point for quoting client work",
    iconBg:C.purpleL, iconColor:C.purple,
    why:"A strong proposal sets professional expectations from the start. Having a polished template saves hours per project and signals confidence to clients.",
    prompts:[
      { label:"What you typically scope", placeholder:"What does a standard engagement with a client look like?", rows:2 },
      { label:"Rate structure", placeholder:"Hourly, flat-fee, milestone-based — or a mix?", rows:2 },
      { label:"Payment terms", placeholder:"Deposit %, schedule, what's due on delivery.", rows:2 },
      { label:"What's excluded", placeholder:"Revisions beyond X, fabrication, travel, etc.", rows:2 },
    ],
  },
  mediakit: {
    title:"Media Kit", sub:"A press-ready package for galleries and editors",
    iconBg:C.accentL, iconColor:C.darkAccent,
    why:"A media kit is the first thing a gallery or editor asks for when they're interested. Having one ready means you can respond in minutes, not days.",
    prompts:[
      { label:"Short bio (100 words)", placeholder:"Where you're based, what you make, notable shows or clients.", rows:3 },
      { label:"Practice description", placeholder:"The 2–3 sentence version of your work that you use in pitches.", rows:3 },
      { label:"Recent highlights", placeholder:"Shows, features, awards, or commissions from the last 2 years.", rows:2 },
      { label:"Press contact", placeholder:"Name, email, and any rep or PR contact.", rows:1 },
    ],
  },
  pressrelease: {
    title:"Press Release Template", sub:"A reusable announcement format",
    iconBg:C.accentL, iconColor:C.darkAccent,
    why:"A polished press release template means you can announce a show, product, or collaboration in under an hour.",
    prompts:[
      { label:"Headline style", placeholder:"Announcement style (\"Perennial announces...\") or editorial (\"New work from...\")?", rows:1 },
      { label:"Boilerplate about you", placeholder:"Standard 2–3 sentence 'about' paragraph that ends every release.", rows:3 },
    ],
  },
  positioning: {
    title:"Positioning Statement", sub:"Define your market position and voice",
    iconBg:C.amberL, iconColor:C.amber,
    why:"A clear positioning statement makes every pitch faster: to galleries, press, grant committees, and collectors. It's the foundation Ash uses when writing on your behalf.",
    prompts:[
      { label:"Target audience", placeholder:"Who are you most trying to reach?", rows:2 },
      { label:"Value proposition", placeholder:"What do you offer that they can't get elsewhere?", rows:2 },
      { label:"Key differentiators", placeholder:"The 2–3 things that make your work genuinely distinct.", rows:2 },
      { label:"Tone of voice", placeholder:"How you want to come across: confident, poetic, direct, conceptual…", rows:2 },
      { label:"Tagline (optional)", placeholder:"A one-liner that could anchor your bio and site header.", rows:1 },
    ],
  },
  bizinfo: {
    title:"Business Information", sub:"Core entity details for legal and financial use",
    iconBg:C.amberL, iconColor:C.amber,
    why:"Having your business info on hand means you can fill out grant applications, W-9s, and vendor forms in seconds.",
    prompts:[
      { label:"Registered agent", placeholder:"Name and address of your registered agent.", rows:1 },
      { label:"Fiscal year end", placeholder:"Calendar year (Dec 31) or custom?", rows:1 },
    ],
  },
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const IcSearch   = () => <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>;
const IcGrid     = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>;
const IcListRows = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="3" y1="4" x2="13" y2="4"/><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="12" x2="13" y2="12"/></svg>;
const IcFile     = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const IcFileSm   = () => <svg width="11" height="13" viewBox="0 0 11 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6.5 1H1.5a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V4.5z"/><path d="M6.5 1v3.5h3"/></svg>;
const IcDocSm    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>;
const IcImageSm  = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>;
const IcLink     = () => <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9"/><path d="M10 2h4v4M14 2L8 8"/></svg>;
const IcFolderSm = () => <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 4a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z"/></svg>;
const IcPlus     = () => <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>;
const IcX        = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4L4 12M4 4l8 8"/></svg>;
const IcTruck    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="5" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v4h-7V8z"/><circle cx="5" cy="18" r="2"/><circle cx="19.5" cy="18" r="2"/></svg>;
const IcChart    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 17 8 12 13 14 21 6"/><polyline points="17 6h4v4"/></svg>;
const IcTarget   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>;

// ─── Health pip ───────────────────────────────────────────────────────────────
function HealthPip({ filled, total }: { filled: number; total: number }) {
  const pct = filled / total;
  const color = pct >= 0.8 ? C.darkAccent : pct >= 0.35 ? C.amber : "rgba(31,33,26,0.22)";
  return <div style={{ width:5, height:5, borderRadius:"50%", background:color, flexShrink:0 }} />;
}

// ─── Action button ────────────────────────────────────────────────────────────
// Action semantics:
//   - variant="finder"  → opens the OS file picker and calls onUpload with the
//     chosen file. (Used for cards that store uploads in Supabase Storage.)
//   - variant="primary" or default + action.label looks like "Open" / "View" /
//     "Download" → opens `openUrl` in a new tab when present.
//   - otherwise → opens `action.modal` if set.
function ActionBtn({ action, onOpenModal, onUpload, openUrl }: {
  action: CardAction;
  onOpenModal: (k: string) => void;
  onUpload?: (file: File) => void;
  openUrl?: string;
}) {
  const fileInputId = `res-file-${Math.random().toString(36).slice(2, 9)}`;
  const labelLooksLikeOpen = /^(open|view|download|preview)\b/i.test(action.label.trim());

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (action.modal) { onOpenModal(action.modal); return; }
    if (labelLooksLikeOpen && openUrl) {
      window.open(openUrl, "_blank", "noopener,noreferrer");
      return;
    }
  };

  if (action.variant === "finder") {
    return (
      <>
        <input
          id={fileInputId}
          type="file"
          style={{ display:"none" }}
          onClick={e => e.stopPropagation()}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f && onUpload) onUpload(f);
            e.target.value = "";
          }}
        />
        <label htmlFor={fileInputId} onClick={e => e.stopPropagation()} title="Upload your file"
          style={{ display:"flex", alignItems:"center", gap:3, padding:"3px 8px", fontSize:10, borderRadius:5, cursor:"pointer", border:"0.5px solid var(--color-border)", background:"transparent", color:"var(--color-grey)", fontFamily:"inherit" }}>
          <IcFolderSm /> {action.label}
        </label>
      </>
    );
  }
  if (action.variant === "primary") {
    return (
      <button onClick={handleClick}
        style={{ padding:"3px 9px", fontSize:10, borderRadius:5, cursor:"pointer", border:"none", background:"var(--color-sage)", color:"white", fontFamily:"inherit", fontWeight:500, whiteSpace:"nowrap" }}>
        {action.label}
      </button>
    );
  }
  return (
    <button onClick={handleClick}
      style={{ padding:"3px 9px", fontSize:10, borderRadius:5, cursor:"pointer", border:"0.5px solid var(--color-border)", background:"transparent", color:"var(--color-grey)", fontFamily:"inherit", whiteSpace:"nowrap" }}>
      {action.label}
    </button>
  );
}

// ─── Preview renderer ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CardPreview({ type, data }: { type: string; data?: Record<string, any> }) {
  const d = data ?? {};
  const base: React.CSSProperties = { height:80, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", flexShrink:0 };

  const badge = (text: string, color: string, bg: string) => (
    <div style={{ position:"absolute", top:8, right:8, fontSize:8, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", padding:"2px 7px", borderRadius:10, background:bg, color, display:"flex", alignItems:"center", gap:3 }}>
      <div style={{ width:5, height:5, borderRadius:"50%", background:color }} />{text}
    </div>
  );

  if (type === "file") return (
    <div style={{ ...base, background:d.bg, flexDirection:"column", gap:5 }}>
      <span style={{ color:d.color }}><IcFile /></span>
      <span style={{ fontSize:9, color:d.color, fontWeight:600 }}>{d.label}</span>
      {badge("Stored", d.color, d.bg?.replace("0.06","0.14"))}
    </div>
  );

  if (type === "files") return (
    <div style={{ ...base, background:"var(--color-cream)", flexDirection:"column", alignItems:"flex-start", gap:4, padding:"10px 14px" }}>
      {(d.files as string[]).map((f: string, i: number) => (
        <div key={i} className="flex items-center gap-2" style={{ fontSize:9, color:"var(--color-grey)" }}>
          <IcFileSm /><span>{f}</span>
        </div>
      ))}
      {d.extra > 0 && <div style={{ fontSize:9, color:"var(--color-grey)", fontStyle:"italic" }}>+{d.extra} more</div>}
      {badge(`${d.count} files`, C.darkAccent, C.darkAccentL)}
    </div>
  );

  if (type === "partial") return (
    <div style={{ ...base, background:C.amberL, flexDirection:"column", alignItems:"flex-start", padding:"12px 14px", gap:5 }}>
      <div style={{ fontSize:10, color:C.amber, fontWeight:600 }}>{d.filled} of {d.total} fields complete</div>
      <div style={{ width:"100%", height:3, background:"var(--color-cream)", borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:"100%", borderRadius:2, background:C.amber, width:`${(d.filled/d.total)*100}%` }} />
      </div>
      <div style={{ fontSize:9, color:"var(--color-grey)", lineHeight:1.4 }}>
        <span>{d.done}</span><br />
        <span style={{ color:C.amber }}>Missing: {d.missing}</span>
      </div>
    </div>
  );

  if (type === "colors") return (
    <div style={{ ...base, background:"var(--color-cream)", padding:"0 14px" }}>
      <div style={{ display:"flex", gap:5, width:"100%" }}>
        {(d.swatches as string[]).map((hex: string, i: number) => (
          <div key={i} style={{ flex:1, height:28, borderRadius:4, background:hex, border:hex==="#f5f4f1"?"0.5px solid rgba(0,0,0,0.1)":undefined }} />
        ))}
      </div>
    </div>
  );

  if (type === "typography") return (
    <div style={{ ...base, background:"var(--color-cream)", flexDirection:"column", alignItems:"flex-start", padding:"12px 16px", gap:3 }}>
      <div style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.02em", lineHeight:1, color:"var(--color-charcoal)" }}>Aa</div>
      <div style={{ fontSize:11, fontWeight:500 }}>{d.display}</div>
      <div style={{ fontSize:10, color:"var(--color-grey)" }}>+ {d.body} · body</div>
    </div>
  );

  if (type === "logos") return (
    <div style={{ ...base, background:"var(--color-cream)", gap:10 }}>
      <div style={{ width:34, height:34, background:"var(--color-charcoal)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ color:"var(--color-off-white)", fontSize:12, fontWeight:800, letterSpacing:"-0.03em" }}>P</span>
      </div>
      <div style={{ width:26, height:26, borderRadius:"50%", background:"var(--color-charcoal)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ color:"var(--color-off-white)", fontSize:9, fontWeight:800 }}>P</span>
      </div>
      <div style={{ width:44, height:14, borderRadius:3, background:"var(--color-charcoal)", opacity:0.85 }} />
      {badge("3 files", C.darkAccent, C.darkAccentL)}
    </div>
  );

  if (type === "alias") return (
    <div style={{ ...base, background:d.bg, flexDirection:"column", gap:4 }}>
      <span style={{ color:d.color, fontSize:11, fontWeight:600 }}>→ {d.target}</span>
      <div style={{ position:"absolute", top:8, right:8, fontSize:8, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", padding:"2px 7px", borderRadius:10, background:"rgba(255,255,255,0.7)", color:"var(--color-grey)" }}>Alias</div>
    </div>
  );

  if (type === "linked" || type === "external_url") return (
    <div style={{ ...base, background:C.accentL, flexDirection:"column", gap:4 }}>
      {d.icon_url
        ? <img src={d.icon_url as string} alt="" style={{ width:18, height:18 }} />
        : <span style={{ color:C.darkAccent }}><IcLink /></span>}
      <span style={{ fontSize:10, color:C.darkAccent, fontWeight:500 }}>
        {d.service ?? (d.source === "google_drive" ? "Google Drive" : "External link")}
      </span>
      <div style={{ position:"absolute", top:8, right:8, fontSize:8, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", padding:"2px 7px", borderRadius:10, background:"rgba(255,255,255,0.7)", color:"var(--color-grey)", display:"flex", alignItems:"center", gap:3 }}>
        <IcLink />Linked
      </div>
    </div>
  );

  if (type === "text") return (
    <div style={{ ...base, background:"var(--color-cream)", padding:"10px 14px", alignItems:"flex-start" }}>
      <p style={{ fontSize:10, color:"var(--color-grey)", lineHeight:1.5, margin:0, display:"-webkit-box", WebkitLineClamp:4, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>{d.preview}</p>
    </div>
  );

  const icons: Record<string, React.ReactNode> = {
    truck: <IcTruck />, chart: <IcChart />, target: <IcTarget />, doc: <IcDocSm />, image: <IcImageSm />,
  };
  return (
    <div style={{ ...base, background:"transparent", height:60 }}>
      <div style={{ width:36, height:36, borderRadius:9, background:"var(--color-cream)", border:"0.5px dashed var(--color-border)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--color-grey)" }}>
        {icons[d.icon] ?? <IcDocSm />}
      </div>
    </div>
  );
}

// ─── Resource card ────────────────────────────────────────────────────────────
function ResourceCardItem({ card, onOpenModal, onUploadFile, tourTarget }: {
  card: ResourceCard;
  onOpenModal: (k: string) => void;
  onUploadFile: (cardId: string, file: File) => Promise<void>;
  tourTarget?: string;
}) {
  const isEmpty = card.status === "empty";

  // Click behaviour: prefer the setup modal if there is one. Otherwise, open
  // the underlying file or external link in a new tab so the card is
  // actually useful at a glance.
  function handleClick() {
    if (card.modalKey) { onOpenModal(card.modalKey); return; }
    const url = card.fileUrls[0] ?? card.externalUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const clickable = Boolean(card.modalKey || card.fileUrls[0] || card.externalUrl);

  return (
    <div
      onClick={handleClick}
      data-tour-target={tourTarget}
      className="flex flex-col overflow-hidden"
      style={{
        background: isEmpty ? "transparent" : "var(--color-off-white)",
        border: isEmpty ? "0.5px dashed var(--color-border)" : "none",
        borderRadius:12,
        boxShadow: isEmpty ? "none" : "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
        cursor: clickable ? "pointer" : "default",
        transition:"box-shadow 0.12s",
      }}
    >
      <CardPreview type={card.previewType} data={card.previewData} />
      <div style={{ padding:"11px 13px", display:"flex", flexDirection:"column", gap:3, flex:1 }}>
        <div style={{ fontSize:12, fontWeight:600, color: isEmpty ? "var(--color-grey)" : "var(--color-charcoal)" }}>{card.name}</div>
        {card.meta
          ? <div style={{ fontSize:10, color:"var(--color-grey)" }}>{card.meta}</div>
          : card.emptyWhy && <div style={{ fontSize:10, color:"var(--color-grey)", lineHeight:1.45 }}>{card.emptyWhy}</div>
        }
        {card.actions.length > 0 && (
          <div className="flex flex-wrap gap-1" style={{ marginTop:6 }}>
            {card.actions.map((a, i) => (
              <ActionBtn
                key={i}
                action={a}
                onOpenModal={onOpenModal}
                onUpload={file => onUploadFile(card.id, file)}
                openUrl={card.fileUrls[0] ?? card.externalUrl ?? undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add link modal ───────────────────────────────────────────────────────────
function AddLinkModal({ onClose, onCreated }: { onClose: () => void; onCreated: (link: ResourceLink) => void }) {
  const [name, setName]     = useState("");
  const [url, setUrl]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) { setError("Both name and URL are required."); return; }
    const fullUrl = url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`;
    setLoading(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }
    const { data, error: dbErr } = await supabase.from("resource_links")
      .insert({ user_id: user.id, name: name.trim(), url: fullUrl })
      .select().single();
    if (dbErr) { setError(dbErr.message); setLoading(false); return; }
    onCreated(data as ResourceLink);
    onClose();
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(20,18,16,0.52)", backdropFilter:"blur(5px)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"var(--color-off-white)", borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.07)", width:"100%", maxWidth:420, overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"0.5px solid var(--color-border)" }}>
          <div style={{ fontSize:14, fontWeight:600, color:"var(--color-charcoal)" }}>Add link</div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-grey)" }}><IcX /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding:20, display:"flex", flexDirection:"column", gap:12 }}>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:500, color:"var(--color-charcoal)", marginBottom:4 }}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="e.g. Portfolio PDF, Studio Dropbox"
              style={{ width:"100%", padding:"8px 12px", fontSize:12, borderRadius:8, border:"0.5px solid var(--color-border)", background:"var(--color-warm-white)", color:"var(--color-charcoal)", fontFamily:"inherit", outline:"none" }} />
          </div>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:500, color:"var(--color-charcoal)", marginBottom:4 }}>URL *</label>
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              style={{ width:"100%", padding:"8px 12px", fontSize:12, borderRadius:8, border:"0.5px solid var(--color-border)", background:"var(--color-warm-white)", color:"var(--color-charcoal)", fontFamily:"inherit", outline:"none" }} />
          </div>
          {error && <p style={{ fontSize:11, color:"var(--color-red-orange)" }}>{error}</p>}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", paddingTop:4 }}>
            <button type="button" onClick={onClose}
              style={{ padding:"7px 16px", fontSize:12, borderRadius:7, border:"0.5px solid var(--color-border)", background:"transparent", color:"var(--color-grey)", cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Cancel</button>
            <button type="submit" disabled={loading || !name.trim() || !url.trim()}
              style={{ padding:"7px 16px", fontSize:12, fontWeight:500, borderRadius:7, border:"none", background:"var(--color-sage)", color:"white", cursor:"pointer", fontFamily:"inherit", opacity: loading || !name.trim() || !url.trim() ? 0.5 : 1 }}>
              {loading ? "Saving…" : "Save link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Setup modal ──────────────────────────────────────────────────────────────
// Tied to a specific resource row. Reads existing `fields` on open, lets the
// user fill them in (or upload a document), and writes back to the resources
// table when Done is clicked. Also bumps `status` based on what was filled.
function SetupModal({ resource, onClose, onSaved }: {
  resource: Resource;
  onClose: () => void;
  onSaved: (updated: Resource) => void;
}) {
  const modalKey = resource.modal_key ?? "";
  const cfg = MODALS[modalKey];
  // Snapshot field values keyed by prompt label. We store as a flat
  // Record<string, string> in `resources.fields` to keep the schema simple.
  const initialFields = useMemo(() => {
    const f = (resource.fields ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    if (cfg) for (const p of cfg.prompts) out[p.label] = typeof f[p.label] === "string" ? f[p.label] as string : "";
    return out;
  }, [resource.fields, cfg]);
  const [fields, setFields]   = useState<Record<string, string>>(initialFields);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!cfg) return null;

  async function handleUpload(file: File) {
    setUploading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not authenticated."); return; }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${resource.id}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("resources")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { setError(upErr.message); return; }
      const { data: urlData } = supabase.storage.from("resources").getPublicUrl(path);
      const nextUrls = [...(resource.file_urls ?? []), urlData.publicUrl];
      const { data, error: dbErr } = await supabase.from("resources")
        .update({ file_urls: nextUrls, meta: resource.meta || file.name, status: "complete" })
        .eq("id", resource.id).select().single();
      if (dbErr) { setError(dbErr.message); return; }
      onSaved(data as Resource);
    } finally {
      setUploading(false);
    }
  }

  async function handleDone() {
    setSaving(true); setError(null);
    try {
      const supabase = createClient();
      // Merge in case there were keys outside the prompt set we don't want to
      // clobber (e.g. fields written by Ash or by a future schema change).
      const merged = { ...((resource.fields ?? {}) as Record<string, unknown>), ...fields };
      const filledCount = Object.values(fields).filter(v => v.trim().length > 0).length;
      const total       = cfg.prompts.length;
      const hasFiles    = (resource.file_urls?.length ?? 0) > 0;
      const status: ResourceItemStatus =
        filledCount === total || (filledCount > 0 && hasFiles) ? "complete"
        : filledCount > 0 || hasFiles                          ? "partial"
        : "empty";
      // For structured cards, mirror progress into preview_data so the card
      // surface updates without a page reload.
      const previewData = resource.preview_type === "partial" || (status === "partial" && resource.item_type === "structured")
        ? { ...(resource.preview_data as Record<string, unknown>), filled: filledCount, total }
        : resource.preview_data;
      const previewType = (status === "partial" && resource.item_type === "structured") ? "partial" : resource.preview_type;
      const { data, error: dbErr } = await supabase.from("resources")
        .update({ fields: merged, status, preview_data: previewData, preview_type: previewType })
        .eq("id", resource.id).select().single();
      if (dbErr) { setError(dbErr.message); return; }
      onSaved(data as Resource);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const currentFiles = resource.file_urls ?? [];

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(20,18,16,0.52)", backdropFilter:"blur(5px)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"var(--color-off-white)", borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.07)", width:"100%", maxWidth:780, maxHeight:"88vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"18px 20px 14px", borderBottom:"0.5px solid var(--color-border)" }}>
          <div style={{ width:36, height:36, borderRadius:9, background:cfg.iconBg, display:"flex", alignItems:"center", justifyContent:"center", color:cfg.iconColor, flexShrink:0 }}>
            <IcDocSm />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--color-charcoal)" }}>{cfg.title}</div>
            <div style={{ fontSize:11, color:"var(--color-grey)", marginTop:2 }}>{cfg.sub}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-grey)", padding:2, marginTop:2 }}><IcX /></button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:20 }}>
          {/* Why card */}
          <div style={{ background:C.darkAccentL, border:"0.5px solid rgba(61,107,79,0.18)", borderRadius:8, padding:"12px 14px", fontSize:11, color:"var(--color-grey)", lineHeight:1.55, marginBottom:16 }}>
            {cfg.why}
          </div>

          {/* In-modal Ash conversation — work on responses here, then drop them
              into the fields below. */}
          <AshInlineChat
            title={cfg.title}
            fieldLabels={cfg.prompts.map(p => p.label)}
            onInsert={(label, text) => setFields(f => ({ ...f, [label]: f[label]?.trim() ? `${f[label]}\n\n${text}` : text }))}
          />

          {/* Prompts — always visible below the conversation. */}
          <div style={{ marginTop:18, paddingTop:16, borderTop:"0.5px solid var(--color-border)" }}>
              {cfg.prompts.map((p, i) => (
                <div key={i} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--color-charcoal)", marginBottom:4 }}>{p.label}</div>
                  <textarea
                    value={fields[p.label] ?? ""}
                    onChange={e => setFields(f => ({ ...f, [p.label]: e.target.value }))}
                    placeholder={p.placeholder} rows={p.rows}
                    style={{ width:"100%", background:"var(--color-cream)", border:"0.5px solid var(--color-border)", borderRadius:6, padding:"7px 10px", fontSize:11, color:"var(--color-charcoal)", fontFamily:"inherit", lineHeight:1.4, resize:"vertical", outline:"none" }} />
                </div>
              ))}

              {currentFiles.length > 0 && (
                <>
                  <div style={{ margin:"16px 0", height:"0.5px", background:"var(--color-border)" }} />
                  <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"var(--color-grey)", marginBottom:8 }}>Stored files</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                    {currentFiles.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 9px", background:"var(--color-cream)", border:"0.5px solid var(--color-border)", borderRadius:6, fontSize:11, color:"var(--color-charcoal)", textDecoration:"none" }}>
                        <IcFileSm />
                        <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{url.split("/").pop()}</span>
                        <span style={{ fontSize:10, color:C.darkAccent }}>Open ↗</span>
                      </a>
                    ))}
                  </div>
                </>
              )}

              <div style={{ margin:"16px 0", height:"0.5px", background:"var(--color-border)" }} />
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"var(--color-grey)", marginBottom:8 }}>
                {currentFiles.length > 0 ? "Add another file" : "Or upload an existing document"}
              </div>
              <label style={{ display:"block", border:"0.5px dashed var(--color-border)", borderRadius:8, padding:16, textAlign:"center", cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1 }}>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.pages,.txt,.png,.jpg,.jpeg,.svg,.gif,.webp"
                  style={{ display:"none" }}
                  disabled={uploading}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <div style={{ fontSize:11, color:"var(--color-grey)" }}>{uploading ? "Uploading…" : "Click to upload"}</div>
                <div style={{ fontSize:10, color:"var(--color-grey)", marginTop:2 }}>PDF, Word, Pages, plain text, or images</div>
              </label>
          </div>

          {error && <p style={{ fontSize:11, color:"var(--color-red-orange)", marginTop:10 }}>{error}</p>}
        </div>

        <div style={{ padding:"12px 20px", borderTop:"0.5px solid var(--color-border)", display:"flex", gap:7 }}>
          <button onClick={onClose} disabled={saving || uploading} style={{ flex:1, padding:"7px 0", fontSize:11, border:"0.5px solid var(--color-border)", borderRadius:6, background:"transparent", color:"var(--color-grey)", cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
          <button onClick={handleDone} disabled={saving || uploading} style={{ flex:1.5, padding:"7px 0", fontSize:11, border:"none", borderRadius:6, background:"var(--color-sage)", color:"white", fontWeight:500, cursor:"pointer", fontFamily:"inherit", opacity: saving || uploading ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Links view ───────────────────────────────────────────────────────────────
function LinksView({ links, onAddLink }: { links: ResourceLink[]; onAddLink: () => void }) {
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", marginBottom:12 }}>
        <span style={{ fontSize:12, color:"var(--color-grey)" }}>{links.length} saved link{links.length !== 1 ? "s" : ""}</span>
        <button onClick={onAddLink}
          style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", fontSize:11, border:"0.5px solid var(--color-border)", borderRadius:6, background:"transparent", color:"var(--color-grey)", cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <IcPlus /> Add link
        </button>
      </div>
      {links.length === 0 ? (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:180, gap:8, color:"var(--color-grey)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.4"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          <p style={{ fontSize:12 }}>No saved links yet</p>
          <p style={{ fontSize:11 }}>Add links to Dropbox, portfolio sites, Google Drive, and more</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {links.map(link => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-3"
              style={{ padding:"11px 15px", background:"var(--color-off-white)", borderRadius:10, boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)", cursor:"pointer", textDecoration:"none", display:"flex", alignItems:"center", gap:12, transition:"box-shadow 0.1s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.1)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)"}>
              <div style={{ width:28, height:28, borderRadius:7, background:C.accentL, display:"flex", alignItems:"center", justifyContent:"center", color:C.darkAccent, flexShrink:0 }}><IcLink /></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"var(--color-charcoal)" }}>{link.name}</div>
                <div style={{ fontSize:10, color:"var(--color-grey)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{link.url}</div>
              </div>
              <span style={{ fontSize:10, color:"var(--color-grey)", flexShrink:0 }}>{new Date(link.created_at).toLocaleDateString("en-US",{month:"short",year:"numeric"})}</span>
              <span style={{ fontSize:11, color:C.darkAccent, flexShrink:0 }}>Open ↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Category nav ─────────────────────────────────────────────────────────────
function CategoryNav({
  active, resources, links, linkedFiles,
  linkedVisible, onToggleLinked, onSelect, search, onSearchChange,
  onSelectEntity, activeEntity,
  folders, activeFolderId, onSelectFolder, onCreateFolder,
}: {
  active: CatId;
  resources: Resource[];
  links: ResourceLink[];
  linkedFiles: LinkedFile[];
  folders: ResourceFolder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string) => void;
  /** Per-source visibility map for "Linked from elsewhere" sub-groups. */
  linkedVisible: Record<LinkedFileSource, boolean>;
  onToggleLinked: (source: LinkedFileSource) => void;
  onSelect: (id: CatId) => void;
  search: string;
  onSearchChange: (v: string) => void;
  /** Drill into a single entity's files (e.g. one project, one contact). */
  onSelectEntity: (source: LinkedFileSource, id: string, name: string) => void;
  /** `${source}:${id}` of the entity currently being browsed, if any. */
  activeEntity: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<LinkedFileSource>>(new Set());
  const [newFolder, setNewFolder] = useState<string | null>(null); // null = not creating
  // Count by source so the rail can hide groups with zero files (unless the
  // user has explicitly pinned the group visible).
  const countBySource = Object.fromEntries(
    LINKED_FILE_GROUPS.map(g => [g.source, linkedFiles.filter(f => f.source === g.source).length]),
  ) as Record<LinkedFileSource, number>;
  const anyLinked = linkedFiles.length > 0;
  const allFilesCount = resources.reduce((n, r) => n + (r.file_urls?.length ?? 0), 0) + linkedFiles.length;
  return (
    <div style={{ width:204, flexShrink:0, background:"var(--color-off-white)", borderRight:"0.5px solid var(--color-border)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 16px 10px", borderBottom:"0.5px solid var(--color-border)", flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"var(--color-charcoal)" }}>Resources</div>
        <div style={{ fontSize:11, color:"var(--color-grey)", marginTop:2 }}>Your studio&apos;s reference library</div>
        <div className="flex items-center gap-2" style={{ marginTop:10, background:"var(--color-cream)", border:"0.5px solid var(--color-border)", borderRadius:6, padding:"5px 9px" }}>
          <span style={{ color:"var(--color-grey)" }}><IcSearch /></span>
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search resources…"
            style={{ background:"none", border:"none", outline:"none", fontSize:11, color:"var(--color-charcoal)", width:"100%", fontFamily:"inherit" }}
          />
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }} data-tour-target="resources.categories">
        {/* All files — unified index across the whole workspace. */}
        <div onClick={() => onSelect("all-files")} className="flex items-center gap-2"
          style={{ padding:"8px 14px", cursor:"pointer", borderLeft:`2.5px solid ${active==="all-files"?"var(--color-sage)":"transparent"}`, background:active==="all-files"?"var(--color-cream)":undefined }}
          onMouseEnter={e => { if (active !== "all-files") (e.currentTarget as HTMLElement).style.background = "var(--color-cream)"; }}
          onMouseLeave={e => { if (active !== "all-files") (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          <div style={{ width:22, height:22, borderRadius:5, background:"var(--color-cream)", color:"var(--color-grey)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <IcFileSm />
          </div>
          <span style={{ fontSize:12, flex:1, fontWeight:active==="all-files"?600:400, color:active==="all-files"?"var(--color-charcoal)":"var(--color-grey)" }}>All files</span>
          <span style={{ fontSize:9, color:"var(--color-grey)" }}>{allFilesCount}</span>
        </div>

        <div style={{ height:"0.5px", background:"var(--color-border)", margin:"6px 12px" }} />
        <div style={{ fontSize:9, fontWeight:600, color:"var(--color-grey)", textTransform:"uppercase", letterSpacing:"0.07em", padding:"8px 14px 3px" }}>Categories</div>

        {CAT_IDS.map(id => {
          const m = CAT_META[id];
          const [filled, total] = catHealth(resources, id);
          return (
            <div key={id} onClick={() => onSelect(id)} className="flex items-center gap-2"
              style={{ padding:"8px 14px", cursor:"pointer", borderLeft:`2.5px solid ${active===id?"var(--color-sage)":"transparent"}`, background:active===id?"var(--color-cream)":undefined }}
              onMouseEnter={e => { if (active !== id) (e.currentTarget as HTMLElement).style.background = "var(--color-cream)"; }}
              onMouseLeave={e => { if (active !== id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <div style={{ width:22, height:22, borderRadius:5, background:m.iconBg, color:m.iconColor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" dangerouslySetInnerHTML={{ __html: m.iconSvg }} />
              </div>
              <span style={{ fontSize:12, flex:1, fontWeight:active===id?600:400, color:active===id?"var(--color-charcoal)":"var(--color-grey)" }}>{m.label}</span>
              <HealthPip filled={filled} total={total} />
              <span style={{ fontSize:9, color:"var(--color-grey)" }}>{filled}/{total}</span>
            </div>
          );
        })}

        <div style={{ height:"0.5px", background:"var(--color-border)", margin:"6px 12px" }} />
        <div style={{ fontSize:9, fontWeight:600, color:"var(--color-grey)", textTransform:"uppercase", letterSpacing:"0.07em", padding:"8px 14px 3px" }}>Linked</div>

        <div data-tour-target="resources.links-nav" onClick={() => onSelect("links")} className="flex items-center gap-2"
          style={{ padding:"8px 14px", cursor:"pointer", borderLeft:`2.5px solid ${active==="links"?"var(--color-sage)":"transparent"}`, background:active==="links"?"var(--color-cream)":undefined }}
          onMouseEnter={e => { if (active !== "links") (e.currentTarget as HTMLElement).style.background = "var(--color-cream)"; }}
          onMouseLeave={e => { if (active !== "links") (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          <div style={{ width:22, height:22, borderRadius:5, background:"var(--color-cream)", color:"var(--color-grey)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <IcLink />
          </div>
          <span style={{ fontSize:12, flex:1, fontWeight:active==="links"?600:400, color:active==="links"?"var(--color-charcoal)":"var(--color-grey)" }}>Links</span>
          <span style={{ fontSize:9, color:"var(--color-grey)" }}>{links.length}</span>
        </div>

        {/* Folders — user-created containers. */}
        <div style={{ height:"0.5px", background:"var(--color-border)", margin:"6px 12px" }} />
        <div className="flex items-center" style={{ padding:"8px 14px 3px", gap:6 }}>
          <div style={{ fontSize:9, fontWeight:600, color:"var(--color-grey)", textTransform:"uppercase", letterSpacing:"0.07em", flex:1 }}>Folders</div>
          <button onClick={() => setNewFolder("")} title="New folder"
            style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-grey)", padding:0, display:"flex" }}>
            <IcPlus />
          </button>
        </div>
        {folders.map(f => {
          const count = resources.filter(r => r.folder_id === f.id).length;
          const fActive = activeFolderId === f.id;
          return (
            <div key={f.id} onClick={() => onSelectFolder(f.id)} className="flex items-center gap-2"
              style={{ padding:"7px 14px", cursor:"pointer", borderLeft:`2.5px solid ${fActive?"var(--color-sage)":"transparent"}`, background:fActive?"var(--color-cream)":undefined }}
              onMouseEnter={e => { if (!fActive) (e.currentTarget as HTMLElement).style.background = "var(--color-cream)"; }}
              onMouseLeave={e => { if (!fActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
              <div style={{ width:18, height:18, borderRadius:5, background:"var(--color-cream)", color:"var(--color-grey)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <IcFolderSm />
              </div>
              <span style={{ fontSize:11, flex:1, fontWeight:fActive?600:400, color:fActive?"var(--color-charcoal)":"var(--color-grey)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
              <span style={{ fontSize:9, color:"var(--color-grey)" }}>{count}</span>
            </div>
          );
        })}
        {newFolder !== null && (
          <div style={{ padding:"4px 14px 4px 14px" }}>
            <input
              autoFocus value={newFolder}
              onChange={e => setNewFolder(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newFolder.trim()) { onCreateFolder(newFolder.trim()); setNewFolder(null); }
                if (e.key === "Escape") setNewFolder(null);
              }}
              onBlur={() => { if (newFolder.trim()) onCreateFolder(newFolder.trim()); setNewFolder(null); }}
              placeholder="Folder name…"
              style={{ width:"100%", fontSize:11, padding:"5px 8px", borderRadius:6, border:"0.5px solid var(--color-sage)", background:"var(--color-warm-white)", color:"var(--color-charcoal)", outline:"none", fontFamily:"inherit" }}
            />
          </div>
        )}

        {/* Linked from elsewhere — cross-module file index.
            Sub-groups are hidden when their count is 0 unless the user has
            pinned them visible (eye-toggle). Pattern mirrors how Tasks groups
            collapse empty buckets. */}
        {(anyLinked || Object.values(linkedVisible).some(Boolean)) && (
          <>
            <div style={{ height:"0.5px", background:"var(--color-border)", margin:"6px 12px" }} />
            <div className="flex items-center" style={{ padding:"8px 14px 3px", gap:6 }}>
              <div style={{ fontSize:9, fontWeight:600, color:"var(--color-grey)", textTransform:"uppercase", letterSpacing:"0.07em", flex:1 }}>
                Linked from elsewhere
              </div>
            </div>
            {LINKED_FILE_GROUPS.map(g => {
              const count = countBySource[g.source];
              const visiblePref = linkedVisible[g.source];
              // Hide groups with zero files unless the user has toggled them on.
              if (count === 0 && !visiblePref) return null;
              const id = linkedCatId(g.source);
              // Distinct parent entities within this source (one project, one
              // contact, …) so the user can browse files by entity.
              const entMap = new Map<string, { id: string; name: string; count: number }>();
              for (const f of linkedFiles) {
                if (f.source !== g.source) continue;
                const e = entMap.get(f.source_id) ?? { id: f.source_id, name: f.source_name, count: 0 };
                e.count++; entMap.set(f.source_id, e);
              }
              const entities = [...entMap.values()].sort((a, b) => a.name.localeCompare(b.name));
              const canExpand = entities.length > 1;
              const isOpen = expanded.has(g.source);
              const groupActive = active === id && !activeEntity;
              return (
                <div key={g.source}>
                  <div onClick={() => onSelect(id)} className="flex items-center gap-2"
                    style={{ padding:"7px 14px", cursor:"pointer", borderLeft:`2.5px solid ${groupActive?"var(--color-sage)":"transparent"}`, background:groupActive?"var(--color-cream)":undefined }}
                    onMouseEnter={e => { if (!groupActive) (e.currentTarget as HTMLElement).style.background = "var(--color-cream)"; }}
                    onMouseLeave={e => { if (!groupActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    {canExpand ? (
                      <button onClick={e => { e.stopPropagation(); setExpanded(prev => { const n = new Set(prev); n.has(g.source) ? n.delete(g.source) : n.add(g.source); return n; }); }}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-grey)", padding:0, width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition:"transform .12s" }}><path d="M5 3l6 5-6 5"/></svg>
                      </button>
                    ) : (
                      <div style={{ width:18, height:18, borderRadius:5, background:"var(--color-cream)", color:"var(--color-grey)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <IcFolderSm />
                      </div>
                    )}
                    <span style={{ fontSize:11, flex:1, fontWeight:groupActive?600:400, color:groupActive?"var(--color-charcoal)":"var(--color-grey)" }}>{g.label}</span>
                    <span style={{ fontSize:9, color:"var(--color-grey)" }}>{count}</span>
                    <button
                      onClick={e => { e.stopPropagation(); onToggleLinked(g.source); }}
                      title={visiblePref ? "Hide when empty" : "Always show"}
                      style={{ background:"none", border:"none", color: visiblePref ? "var(--color-sage)" : "var(--color-grey)", cursor:"pointer", opacity: visiblePref ? 1 : 0.5, padding:2 }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                        <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5S1 8 1 8z"/>
                        <circle cx="8" cy="8" r="2"/>
                      </svg>
                    </button>
                  </div>
                  {canExpand && isOpen && entities.map(ent => {
                    const entKey = `${g.source}:${ent.id}`;
                    const entActive = activeEntity === entKey;
                    return (
                      <div key={entKey} onClick={() => onSelectEntity(g.source, ent.id, ent.name)} className="flex items-center gap-2"
                        style={{ padding:"5px 14px 5px 34px", cursor:"pointer", borderLeft:`2.5px solid ${entActive?"var(--color-sage)":"transparent"}`, background:entActive?"var(--color-cream)":undefined }}
                        onMouseEnter={e => { if (!entActive) (e.currentTarget as HTMLElement).style.background = "var(--color-cream)"; }}
                        onMouseLeave={e => { if (!entActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                        <span style={{ fontSize:11, flex:1, fontWeight:entActive?600:400, color:entActive?"var(--color-charcoal)":"var(--color-grey)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ent.name}</span>
                        <span style={{ fontSize:9, color:"var(--color-grey)" }}>{ent.count}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Category-level upload affordance ─────────────────────────────────────────
// Prominent "+ Upload file" / "+ Add link" row pinned to the top of every
// category view. When the user drags a file from their OS, the row turns into
// a drop zone. The chosen file gets uploaded to the `resources` Storage bucket
// and registered as a brand-new file resource in the current category — so
// the user doesn't need to find the exact card their file belongs in.
//
// `onCategoryUpload` is wired in the main component. It inserts a `resources`
// row (item_type="file", status="complete") and returns the new row so the UI
// can append it. The card surface then renders identically to a seeded file
// card, with the same Open / replace affordances.
function CategoryUploadBar({
  category, onUploaded, onAddLink, empty, folderId,
}: {
  category: string;
  onUploaded: (resource: Resource) => void;
  onAddLink: () => void;
  /** Render the bigger drag-drop empty-state when the category has no resources. */
  empty?: boolean;
  /** When set, the upload lands inside this folder instead of loose. */
  folderId?: string;
}) {
  const [dragOver, setDragOver]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const inputId = "resources-cat-upload";

  async function handleFile(file: File) {
    setUploading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Not authenticated."); return; }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const prefix = folderId ? `folder-${folderId}` : `cat-${category}`;
      const path = `${user.id}/${prefix}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("resources")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { setError(upErr.message); return; }
      const { data: urlData } = supabase.storage.from("resources").getPublicUrl(path);
      // Insert a brand-new file resource. We give it a sensible preview_type
      // ("file") and let CardPreview render the generic file tile.
      const { data, error: dbErr } = await supabase.from("resources")
        .insert({
          user_id:      user.id,
          category:     folderId ? "folder" : category,
          folder_id:    folderId ?? null,
          name:         file.name,
          meta:         "",
          item_type:    "file",
          status:       "complete",
          preview_type: "file",
          preview_data: { label: file.name.split(".").pop()?.toUpperCase() ?? "FILE", color: C.darkAccent, bg: C.darkAccentL },
          fields:       {},
          file_urls:    [urlData.publicUrl],
          actions:      [{ label: "Open", variant: "primary" }],
          position:     9999,
        })
        .select().single();
      if (dbErr) { setError(dbErr.message); return; }
      onUploaded(data as Resource);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  // Compact pinned row when the category has some resources, fuller
  // drag-drop tile when empty.
  if (empty) {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          marginBottom: 18,
          padding: "28px 20px",
          border: `1px dashed ${dragOver ? "var(--color-sage)" : "var(--color-border)"}`,
          background: dragOver ? "rgba(155,163,122,0.08)" : "var(--color-cream)",
          borderRadius: 12,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          transition: "background 0.12s",
        }}
      >
        <div style={{ width:40, height:40, borderRadius:10, background:"var(--color-off-white)", border:"0.5px solid var(--color-border)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--color-grey)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3v14M5 10l7-7 7 7M5 21h14"/></svg>
        </div>
        <div style={{ fontSize:13, fontWeight:600, color:"var(--color-charcoal)" }}>
          Drag and drop a file, or click to upload
        </div>
        <div style={{ fontSize:11, color:"var(--color-grey)" }}>
          PDF, Word, Pages, images — anything you want to keep in this section
        </div>
        <div className="flex" style={{ gap:8, marginTop:6 }}>
          <input id={inputId} type="file" style={{ display:"none" }} disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          <label htmlFor={inputId}
            style={{ padding:"6px 12px", fontSize:12, fontWeight:500, borderRadius:7, cursor: uploading ? "default" : "pointer", border:"none", background:"var(--color-sage)", color:"white", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "Uploading…" : "+ Upload file"}
          </label>
          <button onClick={onAddLink}
            style={{ padding:"6px 12px", fontSize:12, fontWeight:500, borderRadius:7, cursor:"pointer", border:"0.5px solid var(--color-border)", background:"transparent", color:"var(--color-grey)", fontFamily:"inherit" }}>
            + Add link
          </button>
        </div>
        {error && <p style={{ fontSize:11, color:"var(--color-red-orange)", marginTop:4 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className="flex items-center"
      style={{
        marginBottom: 14,
        padding: "10px 14px",
        border: `0.5px dashed ${dragOver ? "var(--color-sage)" : "var(--color-border)"}`,
        background: dragOver ? "rgba(155,163,122,0.08)" : "var(--color-off-white)",
        borderRadius: 10,
        gap: 12,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div style={{ width:28, height:28, borderRadius:7, background:"var(--color-cream)", color:"var(--color-grey)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3v14M5 10l7-7 7 7"/></svg>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:"var(--color-charcoal)" }}>Add to this section</div>
        <div style={{ fontSize:10, color:"var(--color-grey)" }}>Drop a file anywhere on this row, or use the buttons</div>
      </div>
      <input id={inputId} type="file" style={{ display:"none" }} disabled={uploading}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      <label htmlFor={inputId}
        style={{ padding:"5px 11px", fontSize:11, fontWeight:500, borderRadius:6, cursor: uploading ? "default" : "pointer", border:"none", background:"var(--color-sage)", color:"white", opacity: uploading ? 0.6 : 1, whiteSpace:"nowrap" }}>
        {uploading ? "Uploading…" : "+ Upload file"}
      </label>
      <button onClick={onAddLink}
        style={{ padding:"5px 11px", fontSize:11, fontWeight:500, borderRadius:6, cursor:"pointer", border:"0.5px solid var(--color-border)", background:"transparent", color:"var(--color-grey)", fontFamily:"inherit", whiteSpace:"nowrap" }}>
        + Add link
      </button>
      {error && <span style={{ fontSize:10, color:"var(--color-red-orange)" }}>{error}</span>}
    </div>
  );
}

// ─── Linked-files view ────────────────────────────────────────────────────────
// Read-only list of files owned by other modules. Click filename → open. The
// "View in <Source>" link jumps to the parent entity's panel so the user can
// edit / delete the file at its source of truth.
const SOURCE_LABEL: Record<LinkedFileSource, string> = {
  contact: "Contact", organization: "Organization", project: "Project",
  invoice: "Invoice", receipt: "Finance", studio: "Settings",
};

function isImageFile(url: string, type: string | null): boolean {
  if ((type ?? "").toLowerCase().startsWith("image/")) return true;
  const path = url.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|avif|heic)$/.test(path);
}

// Tinted icon block for non-image files, color-keyed by kind.
function FileTypeThumb({ kind }: { kind: FileKind }) {
  const map: Record<FileKind, { bg: string; fg: string; label: string }> = {
    image: { bg: C.darkAccentL, fg: C.darkAccent, label: "IMG" },
    pdf:   { bg: "rgba(220,62,13,0.10)", fg: "#c0420d", label: "PDF" },
    doc:   { bg: C.accentL, fg: C.darkAccent, label: "DOC" },
    other: { bg: "var(--color-cream)", fg: "var(--color-grey)", label: "FILE" },
  };
  const m = map[kind];
  return (
    <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, background:m.bg, color:m.fg }}>
      <IcDocSm />
      <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.06em" }}>{m.label}</span>
    </div>
  );
}

// A previewable file card — image thumbnail when possible, typed block
// otherwise. Used by the linked-file (invoices/receipts/…) grids.
function FilePreviewCard({ name, url, fileType, caption, deepLink, deepLabel, kind }: {
  name: string; url: string; fileType: string | null; caption: string;
  deepLink?: string; deepLabel?: string;
  /** Override the derived kind (used by the unified All-files list). */
  kind?: FileKind;
}) {
  const resolvedKind = kind ?? fileKind(name, fileType);
  const img = kind ? kind === "image" : isImageFile(url, fileType);
  return (
    <div style={{ display:"flex", flexDirection:"column", background:"var(--color-off-white)", borderRadius:10, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)" }}>
      <a href={url} target="_blank" rel="noreferrer" style={{ display:"block", height:124, background:"var(--color-cream)", textDecoration:"none" }}>
        {img
          ? <img src={url} alt={name} loading="lazy" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
          : <FileTypeThumb kind={resolvedKind} />}
      </a>
      <div style={{ padding:"9px 11px" }}>
        <div style={{ fontSize:12, fontWeight:600, color:"var(--color-charcoal)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
        <div style={{ fontSize:10, color:"var(--color-grey)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:1 }}>{caption}</div>
        {deepLink && (
          <a href={deepLink} style={{ display:"inline-block", marginTop:7, fontSize:10, color:"var(--color-grey)", textDecoration:"none", padding:"3px 8px", border:"0.5px solid var(--color-border)", borderRadius:6 }}>
            {deepLabel ?? "View in source"} →
          </a>
        )}
      </div>
    </div>
  );
}

function LinkedFilesView({ source, files }: { source: LinkedFileSource; files: LinkedFile[] }) {
  const sourceLabel = SOURCE_LABEL[source] ?? "Source";
  if (files.length === 0) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:200, gap:8, color:"var(--color-grey)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
        <p style={{ fontSize:12 }}>Nothing here yet</p>
        <p style={{ fontSize:11 }}>Files from this source will appear here automatically.</p>
      </div>
    );
  }
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:12 }}>
      {files.map(f => (
        <FilePreviewCard
          key={f.id}
          name={f.file_name}
          url={f.file_url}
          fileType={f.file_type}
          caption={`${f.source_name} · ${new Date(f.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`}
          deepLink={deepLinkForLinkedFile(f)}
          deepLabel={`View in ${sourceLabel}`}
        />
      ))}
    </div>
  );
}

// ─── Folder header menu (rename / delete) ─────────────────────────────────────
const folderMenuItem: React.CSSProperties = { display:"block", width:"100%", textAlign:"left", padding:"8px 12px", fontSize:12, background:"none", border:"none", cursor:"pointer", color:"var(--color-charcoal)", fontFamily:"inherit" };
function FolderMenu({ folder, onRename, onDelete }: { folder: ResourceFolder; onRename: (name: string) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (renaming !== null) {
    return (
      <input autoFocus value={renaming} onChange={e => setRenaming(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && renaming.trim()) { onRename(renaming.trim()); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }}
        onBlur={() => { if (renaming.trim()) onRename(renaming.trim()); setRenaming(null); }}
        style={{ fontSize:12, padding:"5px 8px", borderRadius:6, border:"0.5px solid var(--color-sage)", background:"var(--color-warm-white)", color:"var(--color-charcoal)", outline:"none", fontFamily:"inherit", width:170 }} />
    );
  }
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)} title="Folder options"
        style={{ background:"none", border:"0.5px solid var(--color-border)", borderRadius:6, cursor:"pointer", color:"var(--color-grey)", padding:"3px 9px", fontSize:14, lineHeight:1 }}>⋯</button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", right:0, zIndex:30, background:"var(--color-off-white)", border:"0.5px solid var(--color-border)", borderRadius:8, boxShadow:"0 6px 24px rgba(0,0,0,0.12)", overflow:"hidden", minWidth:130 }}>
          <button onClick={() => { setRenaming(folder.name); setOpen(false); }} style={folderMenuItem}>Rename</button>
          <button onClick={() => { setConfirm(true); setOpen(false); }} style={{ ...folderMenuItem, color:"var(--color-red-orange)" }}>Delete folder</button>
        </div>
      )}
      <ConfirmDialog open={confirm} title="Delete this folder?"
        body="The folder is removed. Files inside it move back to loose files — they're not deleted."
        confirmLabel="Delete folder" tone="danger"
        onConfirm={() => { setConfirm(false); onDelete(); }} onCancel={() => setConfirm(false)} />
    </div>
  );
}

// ─── All files — unified, searchable, type-filterable index ───────────────────
function AllFilesView({ files, search, filter, onFilter, view }: {
  files: UnifiedFile[]; search: string;
  filter: "all" | FileKind; onFilter: (f: "all" | FileKind) => void;
  view: "grid" | "list";
}) {
  const q = search.trim().toLowerCase();
  const searched = q
    ? files.filter(f => f.name.toLowerCase().includes(q) || f.sourceLabel.toLowerCase().includes(q))
    : files;
  const counts: Record<string, number> = { all: searched.length, image: 0, pdf: 0, doc: 0, other: 0 };
  for (const f of searched) counts[f.kind]++;
  const shown = filter === "all" ? searched : searched.filter(f => f.kind === filter);
  const PILLS: { key: "all" | FileKind; label: string }[] = [
    { key: "all", label: "All" }, { key: "image", label: "Images" },
    { key: "pdf", label: "PDFs" }, { key: "doc", label: "Documents" }, { key: "other", label: "Other" },
  ];
  return (
    <div>
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {PILLS.map(p => {
          const active = filter === p.key;
          return (
            <button key={p.key} onClick={() => onFilter(p.key)}
              style={{ padding:"5px 11px", fontSize:11, borderRadius:999, cursor:"pointer", fontFamily:"inherit",
                border: active ? "none" : "0.5px solid var(--color-border)",
                background: active ? "var(--color-charcoal)" : "var(--color-off-white)",
                color: active ? "white" : "var(--color-grey)" }}>
              {p.label} <span style={{ opacity:0.65 }}>{counts[p.key] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:200, gap:8, color:"var(--color-grey)" }}>
          <IcFileSm />
          <p style={{ fontSize:12 }}>{q ? "No files match your search" : "No files yet — upload one in any category"}</p>
        </div>
      ) : view === "grid" ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:12 }}>
          {shown.map(f => (
            <FilePreviewCard key={f.id} name={f.name} url={f.url} fileType={null} kind={f.kind} caption={f.sourceLabel} />
          ))}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {shown.map(f => (
            <a key={f.id} href={f.href} target="_blank" rel="noreferrer" className="flex items-center gap-3"
              style={{ padding:"11px 15px", background:"var(--color-off-white)", borderRadius:10, boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)", textDecoration:"none", color:"inherit" }}>
              <div style={{ width:28, height:28, borderRadius:7, background:C.darkAccentL, color:C.darkAccent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <IcFileSm />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"var(--color-charcoal)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                <div style={{ fontSize:10, color:"var(--color-grey)" }}>{f.sourceLabel}</div>
              </div>
              <span style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.04em", color:"var(--color-grey)", flexShrink:0 }}>
                {f.kind === "other" ? "file" : f.kind}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Onboarding hand-off banner ───────────────────────────────────────────────
// Surfaces at the top of any category view when the user has onboarding data
// we can hydrate from. Reminds them where they left off and offers a one-click
// jump into the brand-identity setup.
function OnboardingBanner({ studioName, onDismiss, onJumpToBrand }: {
  studioName: string | null; onDismiss: () => void; onJumpToBrand: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        marginBottom: 14,
        padding: "12px 16px",
        background: "linear-gradient(135deg, rgba(155,163,122,0.16) 0%, rgba(155,163,122,0.06) 100%)",
        border: "0.5px solid rgba(155,163,122,0.4)",
        borderRadius: 10,
      }}
    >
      <div style={{ width:30, height:30, borderRadius:8, background:"var(--color-off-white)", color:"var(--color-sage)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v6M12 22v-6M2 12h6M22 12h-6M4.93 4.93l4.24 4.24M19.07 4.93l-4.24 4.24M19.07 19.07l-4.24-4.24M4.93 19.07l4.24-4.24"/></svg>
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, fontWeight:600, color:"var(--color-charcoal)" }}>
          {studioName ? `Continue building ${studioName}` : "Continue building your brand"}
        </div>
        <div style={{ fontSize:11, color:"var(--color-grey)", marginTop:1 }}>
          We&apos;ve pre-filled what you told us in onboarding. Pick up where you left off.
        </div>
      </div>
      <button onClick={onJumpToBrand}
        style={{ padding:"5px 11px", fontSize:11, fontWeight:500, borderRadius:6, cursor:"pointer", border:"none", background:"var(--color-sage)", color:"white", fontFamily:"inherit" }}>
        Open brand →
      </button>
      <button onClick={onDismiss} title="Dismiss"
        style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-grey)", padding:4 }}>
        <IcX />
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ResourcesClient({
  initialResources, initialLinks, initialFolders = [],
  initialLinkedFiles = [], showOnboardingBanner = false, studioName = null,
  initialCat = null,
}: {
  initialResources: Resource[];
  initialLinks: ResourceLink[];
  initialFolders?: ResourceFolder[];
  /** Cross-module file index, server-aggregated from contact/org/project files. */
  initialLinkedFiles?: LinkedFile[];
  /** Optional `?cat=` deep link target (e.g. the Press playbook → press). */
  initialCat?: string | null;
  /** True if the user has onboarding data we can surface as a "continue your
   *  brand setup" prompt. The client decides whether to actually show the
   *  banner based on a localStorage dismissal flag. */
  showOnboardingBanner?: boolean;
  studioName?: string | null;
}) {
  const DEEP_LINK_CATS: CatId[] = ["all-files", "operations", "brand", "press", "design", "links"];
  const [cat, setCat]           = useState<CatId>(
    initialCat && (DEEP_LINK_CATS as string[]).includes(initialCat) ? (initialCat as CatId) : "operations",
  );
  const [view, setView]         = useState<"grid" | "list">("grid");
  // Track the active resource row so SetupModal can read its fields and
  // write back to the right id. We resolve the row from modal_key when a
  // card is clicked.
  const [activeResourceId, setActiveResourceId] = useState<string | null>(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [links, setLinks]       = useState<ResourceLink[]>(initialLinks);
  const [search, setSearch]     = useState("");
  const [fileFilter, setFileFilter] = useState<"all" | FileKind>("all");
  const [entityFilter, setEntityFilter] = useState<{ source: LinkedFileSource; id: string; name: string } | null>(null);
  const [folders, setFolders]   = useState<ResourceFolder[]>(initialFolders);
  const [folderId, setFolderId] = useState<string | null>(null);

  async function createFolder(name: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("resource_folders")
      .insert({ user_id: user.id, name: name.trim() || "New folder", position: folders.length })
      .select().single();
    if (data) { setFolders(prev => [...prev, data as ResourceFolder]); setFolderId((data as ResourceFolder).id); }
  }
  async function renameFolder(id: string, name: string) {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
    await createClient().from("resource_folders").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function deleteFolder(id: string) {
    setFolders(prev => prev.filter(f => f.id !== id));
    // Files in the folder fall back to loose-in-category (folder_id → null).
    setResources(prev => prev.map(r => r.folder_id === id ? { ...r, folder_id: null } : r));
    if (folderId === id) setFolderId(null);
    await createClient().from("resource_folders").delete().eq("id", id);
  }

  // Per-source visibility for the "Linked from elsewhere" rail. Persisted in
  // localStorage. Defaults to all-false: groups only appear when they have
  // files OR when the user has explicitly pinned them visible.
  const [linkedVisible, setLinkedVisible] = useState<Record<LinkedFileSource, boolean>>({
    contact: false, organization: false, project: false,
    invoice: false, receipt: false, studio: false,
  });
  // Onboarding banner dismissal flag (localStorage).
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LINKED_VIS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setLinkedVisible(v => ({ ...v, ...parsed }));
      }
    } catch {}
    if (localStorage.getItem(ONBOARD_BANNER_KEY) === "1") setBannerDismissed(true);
  }, []);

  function toggleLinkedVis(source: LinkedFileSource) {
    setLinkedVisible(prev => {
      const next = { ...prev, [source]: !prev[source] };
      try { localStorage.setItem(LINKED_VIS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function dismissBanner() {
    setBannerDismissed(true);
    try { localStorage.setItem(ONBOARD_BANNER_KEY, "1"); } catch {}
  }

  const isLinks      = cat === "links";
  const isLinkedView = isLinkedCat(cat);
  const catKey       = !isLinks && !isLinkedView ? (cat as SeedCatId) : null;
  const catMeta      = catKey ? CAT_META[catKey] : null;

  const allCatCards = catKey ? resources.filter(r => r.category === catKey && !r.folder_id).map(resourceToCard) : [];

  // Resources inside the selected folder.
  const activeFolder = folderId ? folders.find(f => f.id === folderId) ?? null : null;
  const folderCards = useMemo(() => {
    if (!folderId) return [];
    const list = resources.filter(r => r.folder_id === folderId).map(resourceToCard);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(q) || c.meta.toLowerCase().includes(q));
  }, [resources, folderId, search]);

  // Upload a file straight into the active folder.
  async function uploadFileToFolder(file: File) {
    if (!folderId) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/folder-${folderId}-${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("resources").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return;
    const { data: urlData } = supabase.storage.from("resources").getPublicUrl(path);
    const { data } = await supabase.from("resources").insert({
      user_id: user.id, category: "folder", folder_id: folderId,
      name: file.name, meta: "", item_type: "file", status: "complete",
      preview_type: "file",
      preview_data: { label: file.name.split(".").pop()?.toUpperCase() ?? "FILE", color: C.darkAccent, bg: C.darkAccentL },
      fields: {}, file_urls: [urlData.publicUrl],
      actions: [{ label: "Open", variant: "primary" }], position: 9999,
    }).select().single();
    if (data) setResources(prev => [...prev, data as Resource]);
  }

  // Cross-module files for the currently selected linked sub-group.
  const linkedSourceForCat = linkedCatToSource(cat);
  const visibleLinkedFiles = useMemo(() => {
    if (!linkedSourceForCat) return [];
    let list = initialLinkedFiles.filter(f => f.source === linkedSourceForCat);
    // Drill into a single entity when one is selected in the rail.
    if (entityFilter && entityFilter.source === linkedSourceForCat) {
      list = list.filter(f => f.source_id === entityFilter.id);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(f => f.file_name.toLowerCase().includes(q) || f.source_name.toLowerCase().includes(q));
  }, [initialLinkedFiles, linkedSourceForCat, search, entityFilter]);

  // Search filtering
  const catCards = useMemo(() => {
    if (!search.trim()) return allCatCards;
    const q = search.toLowerCase();
    return allCatCards.filter(c => c.name.toLowerCase().includes(q) || c.meta.toLowerCase().includes(q));
  }, [allCatCards, search]);

  const filteredLinks = useMemo(() => {
    if (!search.trim()) return links;
    const q = search.toLowerCase();
    return links.filter(l => l.name.toLowerCase().includes(q) || l.url.toLowerCase().includes(q));
  }, [links, search]);

  // Unified file index for the "All files" view — every actual file in the
  // workspace: the Resources module's own uploads + the cross-module linked
  // files (contacts, projects, invoices, receipts, …). Links live in their
  // own category, so they're not folded in here.
  const allFiles = useMemo<UnifiedFile[]>(() => {
    const folderName = new Map(folders.map(f => [f.id, f.name]));
    const out: UnifiedFile[] = [];
    for (const r of resources) {
      const urls = r.file_urls ?? [];
      urls.forEach((url, i) => {
        const label = r.folder_id
          ? (folderName.get(r.folder_id) ?? "Folder")
          : (CAT_META[r.category as SeedCatId]?.label ?? r.category ?? "Resources");
        out.push({
          id: `res:${r.id}:${i}`,
          name: urls.length > 1 ? `${r.name} (${i + 1})` : r.name,
          url,
          kind: fileKind(url, null),
          sourceLabel: `Resources · ${label}`,
          href: url,
          created_at: r.updated_at ?? r.created_at,
        });
      });
    }
    for (const f of initialLinkedFiles) {
      out.push({
        id: f.id,
        name: f.file_name,
        url: f.file_url,
        kind: fileKind(f.file_name, f.file_type),
        sourceLabel: LINKED_GROUP_LABEL[f.source] ?? "Linked",
        href: f.file_url,
        created_at: f.created_at,
      });
    }
    return out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [resources, initialLinkedFiles, folders]);

  const [healthFilled, healthTotal] = catKey ? catHealth(resources, catKey) : [0, 0];

  const activeResource = activeResourceId ? resources.find(r => r.id === activeResourceId) ?? null : null;

  // Open the SetupModal for a card given its modal_key. Each modal_key
  // currently maps to exactly one row per user (see migration), so a name
  // lookup is unambiguous, but we also scope by category to be safe.
  function openModalByKey(modalKey: string) {
    const match = resources.find(r => r.modal_key === modalKey);
    if (match) setActiveResourceId(match.id);
  }

  // Upload a file straight from a card-level Action button. Bypasses the
  // SetupModal — used for cards whose primary affordance is "drop a file".
  async function uploadFileToResource(resourceId: string, file: File) {
    const target = resources.find(r => r.id === resourceId);
    if (!target) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${target.id}-${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from("resources")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return;
    const { data: urlData } = supabase.storage.from("resources").getPublicUrl(path);
    const nextUrls = [...(target.file_urls ?? []), urlData.publicUrl];
    const { data } = await supabase.from("resources")
      .update({ file_urls: nextUrls, status: "complete" })
      .eq("id", target.id).select().single();
    if (data) setResources(prev => prev.map(r => r.id === target.id ? data as Resource : r));
  }

  const sectionMeta: Record<CatId, { title: string; sub: string }> = {
    "all-files": { title:"All files", sub:"Every file across your workspace, in one place" },
    operations: { title:"Operations", sub:"Legal, financial, and logistics documents" },
    brand:      { title:"Brand",      sub:"Identity assets, positioning, and templates" },
    press:      { title:"Press",      sub:"Media kit, pitch decks, and press coverage" },
    design:     { title:"Design",     sub:"Templates, product photos, and working files" },
    links:      { title:"Links",      sub:"External URLs and references" },
    "linked-contact":      { title:"From contacts",      sub:"Files attached to a contact in your network — view in Contacts to edit" },
    "linked-organization": { title:"From organizations", sub:"Files attached to an organization — view in Organizations to edit" },
    "linked-project":      { title:"From projects",      sub:"Files attached to a project — view in Projects to edit" },
    "linked-invoice":      { title:"From invoices",      sub:"Invoices and their attachments — manage in Finance" },
    "linked-receipt":      { title:"Receipts",           sub:"Receipts on expenses and bank transactions — manage in Finance" },
    "linked-studio":       { title:"Studio brand",       sub:"Your logo and brand assets — manage in Settings" },
  };

  function handleResourceSaved(updated: Resource) {
    setResources(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  return (
    <div className="flex h-full overflow-hidden">
      <CategoryNav
        active={cat} resources={resources} links={links}
        linkedFiles={initialLinkedFiles}
        linkedVisible={linkedVisible}
        onToggleLinked={toggleLinkedVis}
        onSelect={id => { setCat(id); setSearch(""); setEntityFilter(null); setFolderId(null); }}
        search={search} onSearchChange={setSearch}
        onSelectEntity={(source, id, name) => { setCat(linkedCatId(source)); setEntityFilter({ source, id, name }); setSearch(""); setFolderId(null); }}
        activeEntity={entityFilter ? `${entityFilter.source}:${entityFilter.id}` : null}
        folders={folders}
        activeFolderId={folderId}
        onSelectFolder={id => { setFolderId(id); setSearch(""); }}
        onCreateFolder={createFolder}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 20px", borderBottom:"0.5px solid var(--color-border)", background:"var(--color-off-white)", flexShrink:0, height:52 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--color-charcoal)" }}>
              {activeFolder ? activeFolder.name : entityFilter && isLinkedView ? entityFilter.name : sectionMeta[cat].title}
            </div>
            <div style={{ fontSize:11, color:"var(--color-grey)" }}>
              {activeFolder
                ? "Folder · drop files here to organize them"
                : entityFilter && isLinkedView
                  ? `Files from this ${(SOURCE_LABEL[entityFilter.source] ?? "source").toLowerCase()}`
                  : sectionMeta[cat].sub}
            </div>
          </div>
          {activeFolder && (
            <FolderMenu
              folder={activeFolder}
              onRename={name => renameFolder(activeFolder.id, name)}
              onDelete={() => deleteFolder(activeFolder.id)}
            />
          )}
          {(catKey || cat === "all-files" || !!activeFolder) && (
            <div style={{ display:"flex", border:"0.5px solid var(--color-border)", borderRadius:6, overflow:"hidden" }}>
              {(["grid","list"] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{ padding:"4px 9px", fontSize:11, color:view===v?"var(--color-charcoal)":"var(--color-grey)", cursor:"pointer", background:view===v?"var(--color-cream)":"transparent", border:"none", display:"flex", alignItems:"center" }}>
                  {v === "grid" ? <IcGrid /> : <IcListRows />}
                </button>
              ))}
            </div>
          )}
          {isLinks && (
            <button onClick={() => setShowAddLink(true)}
              style={{ padding:"5px 12px", fontSize:11, borderRadius:6, cursor:"pointer", border:"none", background:"var(--color-sage)", color:"white", fontFamily:"inherit", fontWeight:500 }}>
              + Add link
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding:20 }}>
          {/* Folder view — upload bar + the folder's file cards. */}
          {activeFolder && (
            <>
              <CategoryUploadBar
                category=""
                folderId={activeFolder.id}
                empty={folderCards.length === 0 && !search}
                onAddLink={() => setShowAddLink(true)}
                onUploaded={r => setResources(prev => [...prev, r])}
              />
              {search && (
                <p style={{ fontSize:11, color:"var(--color-grey)", marginBottom:12 }}>
                  {folderCards.length === 0 ? "No matches" : `${folderCards.length} result${folderCards.length !== 1 ? "s" : ""} for "${search}"`}
                </p>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:12 }}>
                {folderCards.map(card => {
                  const url = card.fileUrls[0] ?? card.externalUrl ?? "";
                  return <FilePreviewCard key={card.id} name={card.name} url={url} fileType={null} caption={(card.name.split(".").pop() ?? "file").toUpperCase()} />;
                })}
              </div>
            </>
          )}

          {/* Onboarding hand-off banner — visible on any category view */}
          {!activeFolder && showOnboardingBanner && !bannerDismissed && catKey && (
            <OnboardingBanner
              studioName={studioName}
              onDismiss={dismissBanner}
              onJumpToBrand={() => setCat("brand")}
            />
          )}

          {!activeFolder && cat === "all-files" && (
            <AllFilesView files={allFiles} search={search} filter={fileFilter} onFilter={setFileFilter} view={view} />
          )}

          {!activeFolder && isLinks && (
            <LinksView
              links={filteredLinks}
              onAddLink={() => setShowAddLink(true)}
            />
          )}

          {!activeFolder && isLinkedView && linkedSourceForCat && (
            <LinkedFilesView source={linkedSourceForCat} files={visibleLinkedFiles} />
          )}

          {!activeFolder && catKey && catMeta && (
            <>
              {/* Health bar */}
              <div data-tour-target="resources.health" className="flex items-center gap-3" style={{ padding:"10px 14px", background:"var(--color-off-white)", borderRadius:8, boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)", marginBottom:18 }}>
                <span style={{ fontSize:11, color:"var(--color-grey)", flex:1 }}>{catMeta.label} profile</span>
                <div style={{ flex:2, height:4, background:"var(--color-cream)", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:3, background:"var(--color-sage)", width:`${healthTotal > 0 ? (healthFilled/healthTotal)*100 : 0}%`, transition:"width 0.3s ease" }} />
                </div>
                <span style={{ fontSize:11, fontWeight:600, color:"var(--color-grey)" }}>{healthFilled} / {healthTotal}</span>
                <button onClick={() => { const empty = catCards.find(c => c.status === "empty" && c.modalKey); if (empty?.modalKey) openModalByKey(empty.modalKey); }}
                  style={{ fontSize:11, color:"var(--color-sage)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:0 }}>
                  Fill in →
                </button>
              </div>

              {/* Prominent upload + add-link affordance pinned above the cards. */}
              {catKey && (
                <CategoryUploadBar
                  category={catKey}
                  empty={catCards.length === 0 && !search}
                  onAddLink={() => setShowAddLink(true)}
                  onUploaded={r => setResources(prev => [...prev, r])}
                />
              )}

              {/* Search results label */}
              {search && (
                <p style={{ fontSize:11, color:"var(--color-grey)", marginBottom:12 }}>
                  {catCards.length === 0 ? "No matches" : `${catCards.length} result${catCards.length !== 1 ? "s" : ""} for "${search}"`}
                </p>
              )}

              {view === "grid" && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:12 }}>
                  {catCards.map((card, i) => (
                    <ResourceCardItem
                      key={card.id}
                      card={card}
                      onOpenModal={openModalByKey}
                      onUploadFile={uploadFileToResource}
                      tourTarget={i === 0 ? "resources.first-card" : undefined}
                    />
                  ))}
                </div>
              )}

              {view === "list" && (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {catCards.map((card, i) => {
                    const url = card.fileUrls[0] ?? card.externalUrl;
                    const handleRowClick = () => {
                      if (card.modalKey) openModalByKey(card.modalKey);
                      else if (url) window.open(url, "_blank", "noopener,noreferrer");
                    };
                    const clickable = Boolean(card.modalKey || url);
                    return (
                      <div key={card.id} onClick={handleRowClick}
                        data-tour-target={i === 0 ? "resources.first-card" : undefined}
                        className="flex items-center gap-4"
                        style={{ padding:"11px 15px", background:"var(--color-off-white)", borderRadius:10, boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)", cursor:clickable?"pointer":"default" }}>
                        <div style={{ width:36, height:36, borderRadius:8, background:"var(--color-cream)", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--color-grey)" }}>
                          {card.status === "empty" ? <IcDocSm /> : card.status === "alias" ? <IcLink /> : <IcFile />}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:"var(--color-charcoal)" }}>{card.name}</div>
                          <div style={{ fontSize:10, color:"var(--color-grey)" }}>{card.meta || card.emptyWhy}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span style={{ fontSize:9, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", padding:"2px 7px", borderRadius:10,
                            background: card.status==="complete"?C.darkAccentL : card.status==="partial"?C.amberL : card.status==="alias"?C.accentL : "var(--color-cream)",
                            color: card.status==="complete"?C.darkAccent : card.status==="partial"?C.amber : card.status==="alias"?C.darkAccent : "var(--color-grey)",
                          }}>{card.status}</span>
                          {card.actions[0] && (
                            <ActionBtn
                              action={card.actions[0]}
                              onOpenModal={openModalByKey}
                              onUpload={file => uploadFileToResource(card.id, file)}
                              openUrl={url ?? undefined}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeResource && (
        <SetupModal
          resource={activeResource}
          onClose={() => setActiveResourceId(null)}
          onSaved={handleResourceSaved}
        />
      )}
      {showAddLink && (
        <AddLinkModal
          onClose={() => setShowAddLink(false)}
          onCreated={link => setLinks(prev => [...prev, link])}
        />
      )}
    </div>
  );
}
