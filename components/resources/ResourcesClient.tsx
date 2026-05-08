"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Resource, ResourceLink } from "@/types/database";

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  accent: "var(--color-sage)", accentHex: "#9BA37A", accentL: "rgba(155,163,122,0.12)",
  blue:   "var(--color-sage)", blueL:     "rgba(155,163,122,0.12)",
  purple: "#6d4fa3",           purpleL:   "rgba(109,79,163,0.09)",
  amber:  "#b8860b",           amberL:    "rgba(184,134,11,0.10)",
  darkAccent: "#3d6b4f",       darkAccentL: "rgba(61,107,79,0.09)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type CatId = "operations" | "brand" | "press" | "design" | "links";

interface CardAction {
  label: string;
  variant?: "primary" | "ghost" | "finder";
  modal?: string;
}
interface ResourceCard {
  id: string;
  name: string;
  meta: string;
  status: "complete" | "partial" | "empty" | "alias";
  previewType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previewData?: Record<string, any>;
  actions: CardAction[];
  emptyWhy?: string;
  modalKey?: string;
}

const CAT_META: Record<Exclude<CatId,"links">, { label: string; sub: string; iconBg: string; iconColor: string; iconSvg: string }> = {
  operations: { label:"Operations", sub:"Legal, financial, and logistics documents",    iconBg:C.amberL,      iconColor:C.amber,  iconSvg:`<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 5h6M5 8h4M5 11h3"/>` },
  brand:      { label:"Brand",      sub:"Identity assets, positioning, and templates",   iconBg:C.purpleL,     iconColor:C.purple, iconSvg:`<circle cx="8" cy="8" r="5"/><path d="M8 4v2M8 10v2M4 8h2M10 8h2"/>` },
  press:      { label:"Press",      sub:"Media kit, pitch decks, and press coverage",   iconBg:C.accentL,     iconColor:C.darkAccent, iconSvg:`<path d="M2 2h12v9H2z"/><path d="M5 6h6M5 9h4"/>` },
  design:     { label:"Design",     sub:"Templates, product photos, and working files", iconBg:C.darkAccentL, iconColor:C.darkAccent, iconSvg:`<path d="M2 12L10 4l4 4-8 8-4 0 0-4z"/>` },
};
const CAT_IDS: Exclude<CatId,"links">[] = ["operations","brand","press","design"];

function resourceToCard(r: Resource): ResourceCard {
  return {
    id:          r.id,
    name:        r.name,
    meta:        r.meta,
    status:      r.status,
    previewType: r.preview_type,
    previewData: r.preview_data as Record<string, unknown>,
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
function ActionBtn({ action, onOpenModal }: { action: CardAction; onOpenModal: (k: string) => void }) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (action.modal) onOpenModal(action.modal);
  };
  if (action.variant === "finder") {
    return (
      <button onClick={handleClick} title="Upload your file"
        style={{ display:"flex", alignItems:"center", gap:3, padding:"3px 8px", fontSize:10, borderRadius:5, cursor:"pointer", border:"0.5px solid var(--color-border)", background:"transparent", color:"var(--color-grey)", fontFamily:"inherit" }}>
        <IcFolderSm /> {action.label}
      </button>
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

  if (type === "linked") return (
    <div style={{ ...base, background:C.accentL, flexDirection:"column", gap:4 }}>
      <span style={{ color:C.darkAccent }}><IcLink /></span>
      <span style={{ fontSize:10, color:C.darkAccent, fontWeight:500 }}>{d.service}</span>
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
function ResourceCardItem({ card, onOpenModal }: { card: ResourceCard; onOpenModal: (k: string) => void }) {
  const isEmpty = card.status === "empty";
  return (
    <div
      onClick={() => card.modalKey && onOpenModal(card.modalKey)}
      className="flex flex-col overflow-hidden"
      style={{
        background: isEmpty ? "transparent" : "var(--color-off-white)",
        border: isEmpty ? "0.5px dashed var(--color-border)" : "none",
        borderRadius:12,
        boxShadow: isEmpty ? "none" : "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
        cursor: card.modalKey ? "pointer" : "default",
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
            {card.actions.map((a, i) => <ActionBtn key={i} action={a} onOpenModal={onOpenModal} />)}
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
function SetupModal({ modalKey, onClose }: { modalKey: string; onClose: () => void }) {
  const [showManual, setShowManual] = useState(false);
  const cfg = MODALS[modalKey];
  if (!cfg) return null;

  function openAsh() {
    window.dispatchEvent(new CustomEvent("open-ash", {
      detail: { message: `Help me draft a ${cfg.title} for my design studio. Walk me through it with questions, then write a polished first draft.` }
    }));
    onClose();
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(20,18,16,0.52)", backdropFilter:"blur(5px)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"var(--color-off-white)", borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.07)", width:"100%", maxWidth:540, maxHeight:"82vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
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
          <div style={{ background:C.darkAccentL, border:"0.5px solid rgba(61,107,79,0.18)", borderRadius:8, padding:"12px 14px", fontSize:11, color:"var(--color-grey)", lineHeight:1.55, marginBottom:18 }}>
            {cfg.why}
          </div>

          {/* Ash CTA */}
          <button onClick={openAsh} style={{ display:"flex", alignItems:"center", gap:14, padding:"16px 18px", background:"linear-gradient(135deg, #7a9a55 0%, #5a7a38 45%, #3a5228 100%)", borderRadius:12, cursor:"pointer", marginBottom:10, width:"100%", border:"none", fontFamily:"inherit", textAlign:"left" }}>
            <img src="/Ash-Logomak.svg" alt="" style={{ width:28, height:28, filter:"brightness(0) invert(1)", opacity:0.9, flexShrink:0 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"white" }}>Draft this with Ash</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:2 }}>Answer a few quick questions and Ash writes a first draft — takes about 2 minutes</div>
            </div>
            <div style={{ color:"rgba(255,255,255,0.5)", fontSize:18 }}>→</div>
          </button>

          {/* Or divider */}
          <div style={{ display:"flex", alignItems:"center", gap:10, margin:"12px 0" }}>
            <div style={{ flex:1, height:"0.5px", background:"var(--color-border)" }} />
            <span style={{ fontSize:10, color:"var(--color-grey)" }}>or fill in manually</span>
            <div style={{ flex:1, height:"0.5px", background:"var(--color-border)" }} />
          </div>

          <button onClick={() => setShowManual(v => !v)} style={{ display:"block", width:"100%", textAlign:"center", fontSize:11, color:"var(--color-grey)", cursor:"pointer", padding:6, borderRadius:6, background:"none", border:"0.5px solid var(--color-border)", fontFamily:"inherit" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}>
            {showManual ? "Hide prompts ↑" : "Fill in manually →"}
          </button>

          {/* Manual prompts */}
          {showManual && (
            <div style={{ marginTop:16, paddingTop:16, borderTop:"0.5px solid var(--color-border)" }}>
              {cfg.prompts.map((p, i) => (
                <div key={i} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"var(--color-charcoal)", marginBottom:4 }}>{p.label}</div>
                  <textarea placeholder={p.placeholder} rows={p.rows} style={{ width:"100%", background:"var(--color-cream)", border:"0.5px solid var(--color-border)", borderRadius:6, padding:"7px 10px", fontSize:11, color:"var(--color-charcoal)", fontFamily:"inherit", lineHeight:1.4, resize:"none", outline:"none" }} />
                </div>
              ))}
              <div style={{ margin:"16px 0", height:"0.5px", background:"var(--color-border)" }} />
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.07em", color:"var(--color-grey)", marginBottom:8 }}>Or upload an existing document</div>
              <label style={{ display:"block", border:"0.5px dashed var(--color-border)", borderRadius:8, padding:16, textAlign:"center", cursor:"pointer" }}>
                <input type="file" accept=".pdf,.doc,.docx,.pages,.txt" style={{ display:"none" }} />
                <div style={{ fontSize:11, color:"var(--color-grey)" }}>Click to upload</div>
                <div style={{ fontSize:10, color:"var(--color-grey)", marginTop:2 }}>PDF, Word, Pages, or plain text</div>
              </label>
            </div>
          )}
        </div>

        <div style={{ padding:"12px 20px", borderTop:"0.5px solid var(--color-border)", display:"flex", gap:7 }}>
          <button onClick={onClose} style={{ flex:1, padding:"7px 0", fontSize:11, border:"0.5px solid var(--color-border)", borderRadius:6, background:"transparent", color:"var(--color-grey)", cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
          <button onClick={onClose} style={{ flex:1.5, padding:"7px 0", fontSize:11, border:"none", borderRadius:6, background:"var(--color-sage)", color:"white", fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>Done</button>
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
function CategoryNav({ active, resources, links, onSelect, search, onSearchChange }: {
  active: CatId; resources: Resource[]; links: ResourceLink[];
  onSelect: (id: CatId) => void; search: string; onSearchChange: (v: string) => void;
}) {
  return (
    <div style={{ width:204, flexShrink:0, background:"var(--color-off-white)", borderRight:"0.5px solid var(--color-border)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 16px 10px", borderBottom:"0.5px solid var(--color-border)", flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"var(--color-charcoal)" }}>Resources</div>
        <div style={{ fontSize:11, color:"var(--color-grey)", marginTop:2 }}>Your business, in one place</div>
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

      <div style={{ flex:1, overflowY:"auto", padding:"8px 0" }}>
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

        <div onClick={() => onSelect("links")} className="flex items-center gap-2"
          style={{ padding:"8px 14px", cursor:"pointer", borderLeft:`2.5px solid ${active==="links"?"var(--color-sage)":"transparent"}`, background:active==="links"?"var(--color-cream)":undefined }}
          onMouseEnter={e => { if (active !== "links") (e.currentTarget as HTMLElement).style.background = "var(--color-cream)"; }}
          onMouseLeave={e => { if (active !== "links") (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          <div style={{ width:22, height:22, borderRadius:5, background:"var(--color-cream)", color:"var(--color-grey)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <IcLink />
          </div>
          <span style={{ fontSize:12, flex:1, fontWeight:active==="links"?600:400, color:active==="links"?"var(--color-charcoal)":"var(--color-grey)" }}>Links</span>
          <span style={{ fontSize:9, color:"var(--color-grey)" }}>{links.length}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ResourcesClient({ initialResources, initialLinks }: { initialResources: Resource[]; initialLinks: ResourceLink[] }) {
  const [cat, setCat]           = useState<CatId>("operations");
  const [view, setView]         = useState<"grid" | "list">("grid");
  const [modal, setModal]       = useState<string | null>(null);
  const [showAddLink, setShowAddLink] = useState(false);
  const [links, setLinks]       = useState<ResourceLink[]>(initialLinks);
  const [search, setSearch]     = useState("");

  const isLinks = cat === "links";
  const catKey  = cat as Exclude<CatId, "links">;
  const catMeta = !isLinks ? CAT_META[catKey] : null;

  const allCatCards = !isLinks ? initialResources.filter(r => r.category === cat).map(resourceToCard) : [];

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

  const [healthFilled, healthTotal] = !isLinks ? catHealth(initialResources, cat) : [0, 0];

  const sectionMeta: Record<CatId, { title: string; sub: string }> = {
    operations: { title:"Operations", sub:"Legal, financial, and logistics documents" },
    brand:      { title:"Brand",      sub:"Identity assets, positioning, and templates" },
    press:      { title:"Press",      sub:"Media kit, pitch decks, and press coverage" },
    design:     { title:"Design",     sub:"Templates, product photos, and working files" },
    links:      { title:"Links",      sub:"External URLs and references" },
  };

  return (
    <div className="flex h-full overflow-hidden">
      <CategoryNav
        active={cat} resources={initialResources} links={links}
        onSelect={id => { setCat(id); setSearch(""); }}
        search={search} onSearchChange={setSearch}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 20px", borderBottom:"0.5px solid var(--color-border)", background:"var(--color-off-white)", flexShrink:0, height:52 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"var(--color-charcoal)" }}>{sectionMeta[cat].title}</div>
            <div style={{ fontSize:11, color:"var(--color-grey)" }}>{sectionMeta[cat].sub}</div>
          </div>
          {!isLinks && (
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
          {isLinks && (
            <LinksView
              links={filteredLinks}
              onAddLink={() => setShowAddLink(true)}
            />
          )}

          {!isLinks && catMeta && (
            <>
              {/* Health bar */}
              <div className="flex items-center gap-3" style={{ padding:"10px 14px", background:"var(--color-off-white)", borderRadius:8, boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)", marginBottom:18 }}>
                <span style={{ fontSize:11, color:"var(--color-grey)", flex:1 }}>{catMeta.label} profile</span>
                <div style={{ flex:2, height:4, background:"var(--color-cream)", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:3, background:"var(--color-sage)", width:`${healthTotal > 0 ? (healthFilled/healthTotal)*100 : 0}%`, transition:"width 0.3s ease" }} />
                </div>
                <span style={{ fontSize:11, fontWeight:600, color:"var(--color-grey)" }}>{healthFilled} / {healthTotal}</span>
                <button onClick={() => { const empty = catCards.find(c => c.status === "empty" && c.modalKey); if (empty?.modalKey) setModal(empty.modalKey); }}
                  style={{ fontSize:11, color:"var(--color-sage)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:0 }}>
                  Fill in →
                </button>
              </div>

              {/* Search results label */}
              {search && (
                <p style={{ fontSize:11, color:"var(--color-grey)", marginBottom:12 }}>
                  {catCards.length === 0 ? "No matches" : `${catCards.length} result${catCards.length !== 1 ? "s" : ""} for "${search}"`}
                </p>
              )}

              {view === "grid" && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:12 }}>
                  {catCards.map(card => (
                    <ResourceCardItem key={card.id} card={card} onOpenModal={setModal} />
                  ))}
                </div>
              )}

              {view === "list" && (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {catCards.map(card => (
                    <div key={card.id} onClick={() => card.modalKey && setModal(card.modalKey)} className="flex items-center gap-4"
                      style={{ padding:"11px 15px", background:"var(--color-off-white)", borderRadius:10, boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)", cursor:card.modalKey?"pointer":"default" }}>
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
                        {card.actions[0] && <ActionBtn action={card.actions[0]} onOpenModal={setModal} />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {modal     && <SetupModal  modalKey={modal} onClose={() => setModal(null)} />}
      {showAddLink && (
        <AddLinkModal
          onClose={() => setShowAddLink(false)}
          onCreated={link => setLinks(prev => [...prev, link])}
        />
      )}
    </div>
  );
}
