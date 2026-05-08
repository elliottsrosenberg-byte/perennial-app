"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Opportunity } from "@/types/database";

function openAsh(message: string) {
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface GA4Stats {
  connected?: boolean;
  sessions?: number;
  active_users?: number;
  bounce_rate?: number;
  avg_session_sec?: number;
  pageviews?: number;
  property_name?: string;
  property_id?: string;
  top_pages?: { path: string; title: string; pageviews: number; users: number; avg_sec: number }[];
  channels?: { channel: string; sessions: number; pct: number }[];
  last_fetched?: string;
  step?: string;
}

interface PropertyOption {
  property: string;
  displayName: string;
  account: string;
  propertyId: string;
}

// ─── Integration record ───────────────────────────────────────────────────────
interface Integration {
  id: string;
  provider: string;
  account_name: string | null;
  metadata: Record<string, unknown>;
  connected_at: string;
  last_synced_at: string | null;
}

// ─── Connect integration modal ────────────────────────────────────────────────
type ConnectProvider = "beehiiv" | "kit" | "mailchimp" | "substack";

const PROVIDER_META: Record<ConnectProvider, { label: string; color: string; bg: string; placeholder: string; needsDomain?: boolean; isManual?: boolean }> = {
  // plausible removed — replaced by GA4 (free, no API key needed)
  beehiiv:   { label:"Beehiiv",    color:"#FF6B35", bg:"rgba(255,107,53,0.1)", placeholder:"Enter your Beehiiv API key" },
  kit:       { label:"Kit",        color:"#FB6970", bg:"rgba(251,105,112,0.1)",placeholder:"Enter your Kit API key" },
  mailchimp: { label:"Mailchimp",  color:"#FFE01B", bg:"rgba(255,224,27,0.12)",placeholder:"Enter your Mailchimp API key (key-dc##)" },
  substack:  { label:"Substack",   color:"#FF6719", bg:"rgba(255,103,25,0.1)", placeholder:"", isManual:true },
};

function ConnectIntegrationModal({ provider, onClose, onConnected }: {
  provider: ConnectProvider;
  onClose: () => void;
  onConnected: (integration: Integration) => void;
}) {
  const cfg = PROVIDER_META[provider];
  const [apiKey,   setApiKey]   = useState("");
  const [domain,   setDomain]   = useState("");
  const [pubName,  setPubName]  = useState("");
  const [subCount, setSubCount] = useState("");
  const [openRate, setOpenRate] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleConnect() {
    setLoading(true); setError(null);
    try {
      const body: Record<string, unknown> = { provider, apiKey };
      if (cfg.needsDomain) body.domain = domain;
      if (cfg.isManual)    body.metadata = { publication_name: pubName, subscriber_count: parseInt(subCount) || null, open_rate: parseFloat(openRate) || null };

      const res = await fetch("/api/integrations/connect", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; error?: string; integration?: Integration };
      if (!res.ok || data.error) { setError(data.error ?? "Connection failed."); return; }
      onConnected(data.integration!);
      onClose();
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full px-3 py-2 text-[12px] rounded-lg focus:outline-none";
  const inputStyle = { background:"var(--color-warm-white)", border:"0.5px solid var(--color-border)", color:"var(--color-charcoal)", fontFamily:"inherit" };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(20,18,16,0.52)", backdropFilter:"blur(5px)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"var(--color-off-white)", borderRadius:12, boxShadow:"0 8px 40px rgba(0,0,0,0.18)", width:"100%", maxWidth:420, overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"0.5px solid var(--color-border)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:14, fontWeight:700, color:cfg.color }}>{cfg.label[0]}</span>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"var(--color-charcoal)" }}>Connect {cfg.label}</div>
              <div style={{ fontSize:11, color:"var(--color-grey)", marginTop:1 }}>
                {cfg.isManual ? "Enter your stats manually" : "Paste your API key to connect"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-grey)" }}><IcX /></button>
        </div>
        <div style={{ padding:20, display:"flex", flexDirection:"column", gap:12 }}>
          {cfg.isManual ? (
            <>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:500, color:"var(--color-charcoal)", marginBottom:4 }}>Publication name</label>
                <input value={pubName} onChange={e => setPubName(e.target.value)} placeholder="e.g. Perennial Notes" autoFocus className={inputCls} style={inputStyle} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label style={{ display:"block", fontSize:11, fontWeight:500, color:"var(--color-charcoal)", marginBottom:4 }}>Subscriber count</label>
                  <input value={subCount} onChange={e => setSubCount(e.target.value)} type="number" placeholder="312" className={inputCls} style={inputStyle} />
                </div>
                <div className="flex-1">
                  <label style={{ display:"block", fontSize:11, fontWeight:500, color:"var(--color-charcoal)", marginBottom:4 }}>Open rate (%)</label>
                  <input value={openRate} onChange={e => setOpenRate(e.target.value)} type="number" placeholder="44" className={inputCls} style={inputStyle} />
                </div>
              </div>
              <p style={{ fontSize:11, color:"var(--color-grey)", lineHeight:1.5 }}>
                Substack doesn&apos;t expose stats via API. Enter your numbers from your Substack dashboard. We&apos;ll add a reminder to update them monthly.
              </p>
            </>
          ) : (
            <>
              {cfg.needsDomain && (
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:500, color:"var(--color-charcoal)", marginBottom:4 }}>Your site domain *</label>
                  <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourdomain.com" autoFocus className={inputCls} style={inputStyle} />
                  <p style={{ fontSize:10, color:"var(--color-grey)", marginTop:4 }}>The domain as added to your Plausible dashboard (without https://)</p>
                </div>
              )}
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:500, color:"var(--color-charcoal)", marginBottom:4 }}>API key *</label>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password"
                  placeholder={cfg.placeholder} {...(!cfg.needsDomain ? { autoFocus: true } : {})}
                  onKeyDown={e => { if (e.key === "Enter") handleConnect(); }}
                  className={inputCls} style={inputStyle} />
                <p style={{ fontSize:10, color:"var(--color-grey)", marginTop:4 }}>
                  {provider === "beehiiv"    && "Find this in Beehiiv → Settings → API (already shown above)"}
                  {provider === "beehiiv"    && "Find this in Beehiiv → Settings → API"}
                  {provider === "kit"        && "Find this in Kit → Settings → Advanced → API Key"}
                  {provider === "mailchimp"  && "Find this in Mailchimp → Account → Extras → API keys. Key format: xxxxxxxx-usXX"}
                </p>
              </div>
            </>
          )}
          {error && <p style={{ fontSize:12, color:"var(--color-red-orange)" }}>{error}</p>}
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", padding:"12px 20px", borderTop:"0.5px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ padding:"7px 16px", fontSize:12, borderRadius:7, border:"0.5px solid var(--color-border)", background:"transparent", color:"var(--color-grey)", cursor:"pointer", fontFamily:"inherit" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Cancel</button>
          <button onClick={handleConnect} disabled={loading || (!cfg.isManual && !apiKey.trim()) || (cfg.needsDomain && !domain.trim())}
            style={{ padding:"7px 16px", fontSize:12, fontWeight:500, borderRadius:7, border:"none", background:"var(--color-sage)", color:"white", cursor:"pointer", fontFamily:"inherit", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Accent palette (wireframe colours, not in design tokens) ─────────────────
const C = {
  accent:  "#3d6b4f", accentL:  "rgba(61,107,79,0.09)",
  blue:    "#2563ab", blueL:    "rgba(37,99,171,0.09)",
  purple:  "#6d4fa3", purpleL:  "rgba(109,79,163,0.09)",
  amber:   "#b8860b", amberL:   "rgba(184,134,11,0.10)",
  teal:    "#148c8c", tealL:    "rgba(20,140,140,0.09)",
  red:     "#c0392b", redL:     "rgba(192,57,43,0.09)",
};

const catColor = (cat: string) => ({
  fair:      { dark: C.blue,   light: C.blueL   },
  openCall:  { dark: C.teal,   light: C.tealL   },
  grant:     { dark: C.purple, light: C.purpleL  },
  award:     { dark: C.amber,  light: C.amberL   },
  residency: { dark: C.accent, light: C.accentL  },
}[cat] ?? { dark: C.blue, light: C.blueL });

type Tab = "overview" | "website" | "socials" | "newsletter" | "opportunities";
type OppFilter = "all" | "fair" | "openCall" | "grant" | "award" | "residency";
type OppView = "list" | "calendar";

// ─── Date helpers ─────────────────────────────────────────────────────────────
const today = (): Date => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const parseDate = (s: string | null): Date | null => s ? new Date(s + "T00:00:00") : null;
const daysUntil = (d: Date) => Math.round((d.getTime() - today().getTime()) / 86400000);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function oppSection(o: Opportunity): "ongoing" | "actSoon" | "upcoming" | "later" | null {
  const start = parseDate(o.start_date);
  const end   = parseDate(o.end_date);
  const now   = today();

  // Fully past
  if (end && end < now) return null;
  if (!end && start && start < now) return null;

  // Long-running programs (>60 days) go to Ongoing
  const duration = start && end ? Math.round((end.getTime() - start.getTime()) / 86400000) : 0;
  if (duration > 60) {
    // Bubble to Act Soon if deadline closes within 30 days
    if (end && daysUntil(end) <= 30) return "actSoon";
    return "ongoing";
  }

  // Happening now
  if (start && start <= now) return "actSoon";

  // Application types: act soon if deadline within 45 days
  if (["award", "openCall", "grant", "residency"].includes(o.category) && end && daysUntil(end) <= 45) {
    return "actSoon";
  }

  const days = start ? daysUntil(start) : (end ? daysUntil(end) : 999);
  if (days <= 30)  return "actSoon";
  if (days <= 120) return "upcoming";
  return "later";
}

// ─── Calendar grid helpers ────────────────────────────────────────────────────
interface CalEvent { id: string; title: string; category: string; start: Date; end: Date; }

function getWeekRows(month: Date): Date[][] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay  = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const start    = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  const end = new Date(lastDay);
  end.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
  const weeks: Date[][] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(week);
  }
  return weeks;
}

interface WeekEvent { event: CalEvent; startCol: number; span: number; isStart: boolean; isEnd: boolean; lane: number; }

function getWeekEvents(week: Date[], events: CalEvent[]): WeekEvent[] {
  const ws = new Date(week[0]); ws.setHours(0,0,0,0);
  const we = new Date(week[6]); we.setHours(23,59,59,999);
  const overlapping = events
    .filter(e => e.start <= we && e.end >= ws)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime()));
  const result: WeekEvent[] = [];
  const laneEnd: number[] = [];
  for (const ev of overlapping) {
    const sc   = Math.max(0, Math.round((ev.start.getTime() - ws.getTime()) / 86400000));
    const ec   = Math.min(6, Math.round((ev.end.getTime()   - ws.getTime()) / 86400000));
    const span = Math.max(1, ec - sc + 1);
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] > sc) lane++;
    laneEnd[lane] = sc + span;
    result.push({ event: ev, startCol: sc, span, isStart: ev.start >= ws, isEnd: ev.end <= we, lane });
  }
  return result;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
const cardStyle = { background: "var(--color-off-white)", boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)" };
const cardHeadStyle: React.CSSProperties = { padding: "10px 14px", borderBottom: "0.5px solid var(--color-border)", display: "flex", alignItems: "center", gap: 8 };
const cardHeadTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, flex: 1, color: "var(--color-charcoal)" };
const blueLink: React.CSSProperties = { fontSize: 11, color: "var(--color-sage)", cursor: "pointer" };

function card(cn = "") { return `rounded-xl overflow-hidden ${cn}`; }

function StatCard({ label, value, sub, subUp = false, detail, helpText, askAsh, ashMessage, onClick, badge, badgeWarn }: {
  label: string; value: string; sub: string; subUp?: boolean; detail?: string;
  helpText?: string; askAsh?: boolean; ashMessage?: string; onClick?: () => void; badge?: string; badgeWarn?: boolean;
}) {
  return (
    <div onClick={onClick} className="flex flex-col gap-1 rounded-xl p-4 flex-1 shrink-0" style={{ ...cardStyle, cursor: onClick ? "pointer" : "default" }}>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: 10, color: "var(--color-grey)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>{label}</span>
        {badge && <span className="rounded-full" style={{ fontSize: 9, padding: "1px 6px", fontWeight: 600, background: badgeWarn ? C.amberL : C.accentL, color: badgeWarn ? C.amber : C.accent }}>{badge}</span>}
        {helpText && <div title={helpText} className="flex items-center justify-center rounded-full shrink-0" style={{ width: 14, height: 14, background: "var(--color-cream)", border: "0.5px solid rgba(31,33,26,0.13)", color: "var(--color-grey)", fontSize: 9, fontWeight: 700, cursor: "help" }}>?</div>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: subUp ? C.accent : "var(--color-grey)" }}>{sub}</div>
      {detail && <><hr style={{ border: "none", borderTop: "0.5px solid var(--color-border)", margin: "4px 0" }} /><div style={{ fontSize: 11, color: "var(--color-grey)" }}>{detail}</div></>}
      {askAsh && <button className="text-left mt-1" onClick={() => openAsh(ashMessage ?? `How can I improve my ${label.toLowerCase()}?`)} style={{ fontSize: 10, color: "var(--color-sage)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>Ask Ash how to improve →</button>}
    </div>
  );
}

function AshCard({ text, buttonLabel = "Draft with Ash" }: { text: string; buttonLabel?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(155,163,122,0.1)", border: "0.5px solid rgba(155,163,122,0.25)" }}>
      <div className="flex items-center gap-2 mb-2">
        <img src="/Ash-Logomak.svg" alt="" style={{ width: 18, height: 18, filter: "none", opacity: 0.8 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-sage)" }}>Ash</span>
      </div>
      <p style={{ fontSize: 11, color: "#5a7040", lineHeight: 1.5, marginBottom: 10 }}>{text}</p>
      <button onClick={() => openAsh(text)} className="rounded" style={{ background: "var(--color-sage)", color: "white", border: "none", fontSize: 10, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>{buttonLabel}</button>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IcGlobe  = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2c0 0-3 2.5-3 6s3 6 3 6"/><path d="M8 2c0 0 3 2.5 3 6s-3 6-3 6"/><path d="M2 8h12"/></svg>;
const IcIG     = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="3.5"/><circle cx="8" cy="8" r="2.5"/><circle cx="11.5" cy="4.5" r=".75" fill="currentColor" stroke="none"/></svg>;
const IcMail   = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l6 5 6-5"/><rect x="1" y="3" width="14" height="10" rx="2"/></svg>;
const IcTrend  = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="2 10 6 5 9 8 14 3"/></svg>;
const IcClock  = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/></svg>;
const IcTrash  = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 4h12M6 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M3 4l1 10a1 1 0 001 1h6a1 1 0 001-1l1-10"/><path d="M6.5 7v4M9.5 7v4"/></svg>;
const IcEdit   = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 13h10M11.6 2.4l-9 9M10 1.2L14.8 6"/></svg>;
const IcImage  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
const IcPlus   = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v12M2 8h12"/></svg>;
const IcList   = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="3" x2="14" y2="3"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="13" x2="14" y2="13"/></svg>;
const IcCalSm  = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="11" rx="2"/><path d="M1 7h14"/><path d="M5 1v3M11 1v3"/></svg>;
const IcChevL  = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 12L6 8l4-4"/></svg>;
const IcChevR  = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 4l4 4-4 4"/></svg>;
const IcX      = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4L4 12M4 4l8 8"/></svg>;
const IcExtLink= () => <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9"/><path d="M10 2h4v4M14 2L8 8"/></svg>;
const IcMapPin = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M8 14s-5-4.5-5-8a5 5 0 1110 0c0 3.5-5 8-5 8z"/><circle cx="8" cy="6" r="1.5"/></svg>;
const IcFileSm = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4M5 9h6M5 12h4"/></svg>;
const IcEyeOff = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M2 2l12 12M6.9 6.9A2 2 0 009.1 9.1M4 4.5C2.8 5.5 2 7 2 8c0 0 2.2 4 6 4 .8 0 1.6-.2 2.3-.5M12.3 10.8C13.3 9.8 14 8.5 14 8c0 0-2.2-4-6-4-1 0-1.9.3-2.7.7"/></svg>;
const IcImgSm  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;

// ─── Btn helpers ──────────────────────────────────────────────────────────────
function BtnGhost({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return <button style={{ background:"transparent", border:"0.5px solid rgba(31,33,26,0.18)", borderRadius:6, padding:small?"3px 8px":"5px 11px", fontSize:small?10:11, color:"var(--color-grey)", cursor:"pointer", fontFamily:"inherit" }}>{children}</button>;
}
function BtnPrimary({ children, small, onClick }: { children: React.ReactNode; small?: boolean; onClick?: () => void }) {
  return <button onClick={onClick} style={{ background:"var(--color-sage)", color:"white", border:"none", borderRadius:6, padding:small?"3px 8px":"5px 11px", fontSize:small?10:11, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>;
}
function BtnAccent({ children, small, onClick }: { children: React.ReactNode; small?: boolean; onClick?: () => void }) {
  return <button onClick={onClick} style={{ background:"var(--color-sage)", color:"white", border:"none", borderRadius:6, padding:small?"3px 8px":"5px 11px", fontSize:small?10:11, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>;
}

function DateBlock({ month, day }: { month: string; day: string }) {
  return (
    <div className="flex flex-col items-center justify-center shrink-0 rounded-lg" style={{ width:44, background:"var(--color-cream)", padding:"5px 0", textAlign:"center" }}>
      <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--color-grey)" }}>{month}</div>
      <div style={{ fontSize:18, fontWeight:700, lineHeight:1.1, color:"var(--color-charcoal)" }}>{day}</div>
    </div>
  );
}

function TypeBadge({ type, category }: { type: string; category: string }) {
  const { dark, light } = catColor(category);
  return <span className="rounded-full shrink-0" style={{ fontSize:9, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", padding:"2px 8px", background:light, color:dark }}>{type}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    attending:  { bg: C.accentL, color: C.accent },
    exhibiting: { bg: C.accent,  color: "white" },
    saved:      { bg: "var(--color-cream)", color: "var(--color-grey)" },
    applied:    { bg: C.blueL,   color: C.blue },
  };
  const s = cfg[status] ?? cfg.saved;
  return <span className="rounded-full shrink-0" style={{ fontSize:9, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.04em", padding:"3px 8px", background:s.bg, color:s.color }}>{status}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ onTabChange, opps, instagram, plausible, newsletter, onConnect }: {
  onTabChange: (t: Tab) => void;
  opps: Opportunity[];
  instagram: Integration | null;
  plausible: Integration | null;
  newsletter: Integration | null;
  onConnect: (p: ConnectProvider) => void;
}) {
  const nextOpp = opps.find(o => {
    const s = parseDate(o.start_date);
    return s && daysUntil(s) >= 0;
  });
  const deadlineSoon = opps.filter(o => {
    const e = parseDate(o.end_date);
    return e && daysUntil(e) <= 14 && daysUntil(e) >= 0;
  }).length;

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:18 }}>
      {/* Connected accounts strip */}
      <div className={card()} style={cardStyle}>
        <div style={{ display:"flex", gap:8, padding:"12px 15px", flexWrap:"wrap", alignItems:"center" }}>
          {[
            { icon:<IcGlobe />, color:C.blue,   name:"perennial.design",  handle:"Squarespace" },
            { icon:<IcIG />,    color:C.purple,  name:"@perennial.design", handle:"Instagram" },
            { icon:<IcMail />,  color:C.amber,   name:"Perennial Notes",   handle:"Substack · 312 subscribers" },
          ].map(({ icon, color, name, handle }) => (
            <div key={name} className="flex items-center gap-2 rounded-full" style={{ padding:"5px 10px", border:"0.5px solid rgba(31,33,26,0.13)", background:"var(--color-cream)", cursor:"pointer" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:C.accent, flexShrink:0 }} />
              <span style={{ color, display:"flex" }}>{icon}</span>
              <span style={{ fontSize:11, fontWeight:500 }}>{name}</span>
              <span style={{ fontSize:10, color:"var(--color-grey)" }}>{handle}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-full" style={{ padding:"5px 10px", border:`0.5px dashed rgba(37,99,171,0.4)`, background:"transparent", cursor:"pointer", color:C.blue }}>
            <IcPlus /><span style={{ fontSize:11 }}>Connect account</span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display:"flex", gap:12 }}>
        {/* Website stat — real data if Plausible connected */}
        {plausible ? (
          <StatCard label="Website" value={plausible.metadata.sessions ? String(plausible.metadata.sessions) : plausible.metadata.visitors_30d ? String(plausible.metadata.visitors_30d) : "—"} sub="Sessions · last 30 days" subUp detail={plausible.metadata.property_name as string ?? plausible.account_name ?? ""} badge="Connected" helpText="Sessions from Google Analytics." askAsh ashMessage="How can I drive more traffic to my website?" onClick={() => onTabChange("website")} />
        ) : (
          <div onClick={() => window.location.href = "/api/auth/google-analytics"} className="flex flex-col gap-1 rounded-xl p-4 flex-1 shrink-0 cursor-pointer" style={{ background:"var(--color-warm-white)", boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)" }}>
            <span style={{ fontSize:10, color:"var(--color-grey)", fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase" }}>Website</span>
            <div style={{ fontSize:22, fontWeight:700, color:"var(--color-grey)", opacity:0.3 }}>—</div>
            <div style={{ fontSize:11, color:"var(--color-sage)", fontWeight:500 }}>Connect Google Analytics →</div>
          </div>
        )}
        {/* Socials stat — real data if Instagram connected */}
        {instagram ? (
          <StatCard label="Socials" value={instagram.metadata.followers_count ? String(instagram.metadata.followers_count) : "—"} sub={instagram.metadata.engagement_rate ? `${instagram.metadata.engagement_rate}% engagement rate` : "Followers"} subUp detail={instagram.account_name ?? "@instagram"} badge="Connected" helpText="Your follower count and engagement rate." askAsh ashMessage="How can I grow my Instagram following as a designer?" onClick={() => onTabChange("socials")} />
        ) : (
          <div onClick={() => window.location.href = "/api/auth/instagram"} className="flex flex-col gap-1 rounded-xl p-4 flex-1 shrink-0 cursor-pointer" style={{ background:"var(--color-warm-white)", boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)" }}>
            <span style={{ fontSize:10, color:"var(--color-grey)", fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase" }}>Socials</span>
            <div style={{ fontSize:22, fontWeight:700, color:"var(--color-grey)", opacity:0.3 }}>—</div>
            <div style={{ fontSize:11, color:"var(--color-sage)", fontWeight:500 }}>Connect Instagram →</div>
          </div>
        )}
        {/* Newsletter stat — real data if any newsletter connected */}
        {newsletter ? (
          <StatCard label="Newsletter"
            value={newsletter.metadata.open_rate ? `${newsletter.metadata.open_rate}%` : newsletter.metadata.subscriber_count ? String(newsletter.metadata.subscriber_count) : "—"}
            sub={newsletter.metadata.open_rate ? "Open rate" : "Subscribers"}
            subUp
            detail={`${newsletter.metadata.subscriber_count ? `${newsletter.metadata.subscriber_count} subscribers · ` : ""}${newsletter.account_name ?? ""}`}
            badge="Connected"
            helpText="Newsletter open rate and subscriber count."
            askAsh ashMessage="What topics should I write about to grow my newsletter as a designer?"
            onClick={() => onTabChange("newsletter")} />
        ) : (
          <div onClick={() => onConnect("beehiiv")} className="flex flex-col gap-1 rounded-xl p-4 flex-1 shrink-0 cursor-pointer" style={{ background:"var(--color-warm-white)", boxShadow:"0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)" }}>
            <span style={{ fontSize:10, color:"var(--color-grey)", fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase" }}>Newsletter</span>
            <div style={{ fontSize:22, fontWeight:700, color:"var(--color-grey)", opacity:0.3 }}>—</div>
            <div style={{ fontSize:11, color:"var(--color-sage)", fontWeight:500 }}>Connect newsletter →</div>
          </div>
        )}
        <StatCard label="Opportunities" value={String(opps.length)} sub={nextOpp ? `Next: ${nextOpp.title.split(" ")[0]} · ${nextOpp.start_date?.slice(5).replace("-", "/")}` : "No upcoming"} detail="Perennial Feed" badge={deadlineSoon > 0 ? `${deadlineSoon} deadline soon` : undefined} badgeWarn helpText="Upcoming fairs, open calls, grants, and awards." askAsh onClick={() => onTabChange("opportunities")} />
      </div>

      {/* Two-column layout */}
      <div style={{ display:"flex", gap:16, flex:1, minHeight:0 }}>
        {/* Activity feed */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>
          <div className={card()} style={cardStyle}>
            <div style={cardHeadStyle}><span style={cardHeadTitle}>Recent activity</span><span style={blueLink}>View all →</span></div>
            {[
              { icon:<IcIG />, iconBg:C.purpleL, iconColor:C.purple, type:"Post", typeColor:C.purple, channel:"Instagram", time:"2 days ago", text:'"Walnut slab detail — new series in the studio. Grain like this only comes around once."', meta:["↑ 312 likes","28 comments","4.8% engagement"], metaUp:[true,false,false] },
              { icon:<IcMail />, iconBg:C.amberL, iconColor:C.amber, type:"Newsletter", typeColor:C.amber, channel:"Substack", time:"Apr 9", text:"April dispatch — pricing your work as a collectible maker", meta:["47% open rate","3.1% click-through","312 delivered"], metaUp:[true,false,false] },
              { icon:<IcTrend />, iconBg:C.blueL, iconColor:C.blue, type:"Traffic spike", typeColor:C.blue, channel:"perennial.design", time:"Apr 7", text:"340 visits in one day — 6× daily average", meta:["Source: Sight Unseen feature","Top page: /work/brass-series"], metaUp:[false,true] },
              { icon:<IcIG />, iconBg:C.purpleL, iconColor:C.purple, type:"Post", typeColor:C.purple, channel:"Instagram", time:"Apr 3", text:'"ICFF booth sneak peek — see you in New York, May 19–23."', meta:["248 likes","19 comments"], metaUp:[false,false] },
              { icon:<IcMail />, iconBg:C.amberL, iconColor:C.amber, type:"Newsletter", typeColor:C.amber, channel:"Substack", time:"Mar 26", text:"March dispatch — what I learned exhibiting at NYCxDesign", meta:["41% open rate","2.8% click-through"], metaUp:[false,false] },
            ].map((item, i) => (
              <div key={i} className="flex gap-3" style={{ padding:"11px 15px", borderBottom:"0.5px solid var(--color-border)", cursor:"pointer" }}>
                <div className="flex items-center justify-center rounded-lg shrink-0 mt-px" style={{ width:28, height:28, background:item.iconBg, color:item.iconColor }}>{item.icon}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", color:item.typeColor }}>{item.type}</span>
                    <span style={{ fontSize:10, color:"var(--color-grey)" }}>{item.channel}</span>
                    <span style={{ fontSize:10, color:"var(--color-grey)", marginLeft:"auto", whiteSpace:"nowrap", flexShrink:0 }}>{item.time}</span>
                  </div>
                  <div style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.text}</div>
                  <div style={{ fontSize:10, color:"var(--color-grey)", marginTop:2 }}>
                    {item.meta.map((m,j) => <span key={j} style={{ display:"inline-block", marginRight:10, color:item.metaUp[j] ? C.accent : "var(--color-grey)" }}>{m}</span>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", gap:12 }}>
          {/* Coming up */}
          <div className={card()} style={cardStyle}>
            <div style={cardHeadStyle}><span style={cardHeadTitle}>Coming up</span><span style={blueLink} onClick={() => onTabChange("opportunities")}>View all →</span></div>
            {opps.slice(0, 4).map((o, i) => {
              const start = parseDate(o.start_date);
              const isLast = i === 3;
              return (
                <div key={o.id} className="flex items-start gap-3" style={{ padding:"11px 15px", borderBottom: isLast ? "none" : "0.5px solid var(--color-border)", cursor:"pointer" }}>
                  <DateBlock month={start ? start.toLocaleString("en-US",{month:"short"}) : "—"} day={start ? String(start.getDate()) : "—"} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{o.title}</div>
                    <div style={{ fontSize:10, color:"var(--color-grey)" }}>{o.location}</div>
                  </div>
                  {o.user_status && <StatusBadge status={o.user_status} />}
                </div>
              );
            })}
            <div style={{ padding:"9px 15px", borderTop:"0.5px solid var(--color-border)" }}><span style={blueLink}>+ Add event</span></div>
          </div>

          {/* Ash card */}
          <AshCard text={opps[0] ? `${opps[0].title} is coming up${opps[0].start_date ? " on " + new Date(opps[0].start_date+"T00:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric"}) : ""}. Want me to help you prepare?` : "No upcoming opportunities right now. Want me to look for relevant open calls based on your work?"} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBSITE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function WebsiteTab({ integration, onConnect, onDisconnect }: {
  integration: Integration | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [step, setStep]                     = useState<"idle"|"select_property"|"connected">("idle");
  const [properties, setProperties]         = useState<PropertyOption[]>([]);
  const [selectedPropId, setSelectedPropId] = useState("");
  const [loadingProps, setLoadingProps]     = useState(false);
  const [savingProp,   setSavingProp]       = useState(false);
  const [stats, setStats]                   = useState<GA4Stats | null>(null);
  const [loadingStats, setLoadingStats]     = useState(false);
  const [propError, setPropError]           = useState<string | null>(null);

  // Detect OAuth callback redirect
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("step") === "select-property") {
      setStep("select_property");
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname + "?tab=website");
    }
  }, []);

  // Load properties list when in select_property step
  useEffect(() => {
    if (step !== "select_property") return;
    setLoadingProps(true);
    fetch("/api/integrations/ga4/properties")
      .then(r => r.json())
      .then((d: { properties?: PropertyOption[]; error?: string }) => {
        if (d.error) { setPropError(d.error); }
        else { setProperties(d.properties ?? []); if (d.properties?.[0]) setSelectedPropId(d.properties[0].propertyId); }
        setLoadingProps(false);
      })
      .catch(() => { setPropError("Failed to load properties."); setLoadingProps(false); });
  }, [step]);

  // Load stats when fully connected
  useEffect(() => {
    const meta = integration?.metadata as Record<string, unknown> | undefined;
    if (!integration || meta?.step === "select_property") {
      if (meta?.step === "select_property") setStep("select_property");
      return;
    }
    setStep("connected");
    // Use cached stats if fresh (< 30 min)
    const lastFetched = meta?.last_fetched as string | undefined;
    if (lastFetched && Date.now() - new Date(lastFetched).getTime() < 30 * 60 * 1000) {
      setStats(meta as GA4Stats);
      return;
    }
    setLoadingStats(true);
    fetch("/api/integrations/ga4/stats")
      .then(r => r.json())
      .then((d: GA4Stats & { step?: string }) => {
        if (d.step === "select_property") { setStep("select_property"); return; }
        if (d.connected) setStats(d);
        setLoadingStats(false);
      })
      .catch(() => setLoadingStats(false));
  }, [integration]);

  async function saveProperty() {
    if (!selectedPropId) return;
    setSavingProp(true);
    const prop = properties.find(p => p.propertyId === selectedPropId);
    const res = await fetch("/api/integrations/ga4/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: selectedPropId, displayName: prop?.displayName ?? selectedPropId }),
    });
    if (res.ok) {
      setStep("connected");
      setLoadingStats(true);
      fetch("/api/integrations/ga4/stats").then(r => r.json()).then((d: GA4Stats) => { if (d.connected) setStats(d); setLoadingStats(false); });
    }
    setSavingProp(false);
  }

  function fmtDuration(s: number) {
    const m = Math.floor(s / 60); const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ display:"flex", flexDirection:"column" }}>

      {/* ── Not connected ── */}
      {!integration && step !== "select_property" && (
        <div style={{ padding:"60px 24px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, flex:1 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:"rgba(66,133,244,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="26" height="26" viewBox="0 0 48 48" fill="none"><path d="M43.6 20H24v8.4h11.2C33.6 33.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l6-6C34.5 6.3 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19-7.2 19-20 0-1.3-.1-2.7-.4-4z" fill="#4285F4"/><path d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3 0 5.8 1.1 7.9 3l6-6C34.5 6.3 29.5 4 24 4 16.4 4 9.9 8.4 6.3 14.7z" fill="#34A853"/><path d="M24 44c5.4 0 10-1.8 13.4-4.8l-6.2-5.2C29.2 35.6 26.8 36.4 24 36.4c-5.2 0-9.6-3.5-11.2-8.3l-7 5.4C9.5 39.7 16.2 44 24 44z" fill="#FBBC05"/><path d="M43.6 20H24v8.4h11.2c-.8 2.3-2.2 4.2-4.2 5.5l6.2 5.2C40.9 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z" fill="#EA4335"/></svg>
          </div>
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:15, fontWeight:700, color:"var(--color-charcoal)", marginBottom:8 }}>Connect Google Analytics</p>
            <p style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.7, maxWidth:380 }}>
              See real visitor data from your site — sessions, active users, top pages, and where your traffic comes from. Google Analytics is free, and you almost certainly already have it installed.
            </p>
          </div>
          <button onClick={onConnect}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 22px", fontSize:13, fontWeight:500, borderRadius:8, border:"0.5px solid rgba(0,0,0,0.18)", background:"white", color:"#3c4043", cursor:"pointer", fontFamily:"inherit", boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f8f9fa"}
            onMouseLeave={e => e.currentTarget.style.background = "white"}>
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none"><path d="M43.6 20H24v8.4h11.2C33.6 33.4 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l6-6C34.5 6.3 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19-7.2 19-20 0-1.3-.1-2.7-.4-4z" fill="#4285F4"/></svg>
            Sign in with Google
          </button>
          <p style={{ fontSize:11, color:"var(--color-grey)" }}>
            Don&apos;t have Analytics yet?{" "}
            <a href="https://analytics.google.com" target="_blank" rel="noreferrer" style={{ color:"var(--color-sage)" }}>Set it up free →</a>
          </p>
        </div>
      )}

      {/* ── Property picker (after OAuth) ── */}
      {step === "select_property" && (
        <div style={{ padding:"60px 24px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, flex:1 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:"rgba(66,133,244,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <IcGlobe />
          </div>
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:15, fontWeight:700, color:"var(--color-charcoal)", marginBottom:6 }}>Which website?</p>
            <p style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.6 }}>Pick the GA4 property you want to track in Perennial.</p>
          </div>
          {loadingProps ? (
            <p style={{ fontSize:12, color:"var(--color-grey)" }}>Loading your properties…</p>
          ) : propError ? (
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:12, color:"var(--color-red-orange)", marginBottom:8 }}>{propError}</p>
              <button onClick={onConnect} style={{ fontSize:12, color:"var(--color-sage)", background:"none", border:"none", cursor:"pointer" }}>Try connecting again →</button>
            </div>
          ) : properties.length === 0 ? (
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:12, color:"var(--color-grey)", marginBottom:8 }}>No GA4 properties found. Make sure you&apos;ve set up Google Analytics 4 (not Universal Analytics).</p>
              <a href="https://analytics.google.com" target="_blank" rel="noreferrer" style={{ fontSize:12, color:"var(--color-sage)" }}>Set up GA4 →</a>
            </div>
          ) : (
            <div style={{ width:"100%", maxWidth:400, display:"flex", flexDirection:"column", gap:10 }}>
              <select value={selectedPropId} onChange={e => setSelectedPropId(e.target.value)}
                style={{ width:"100%", padding:"10px 14px", fontSize:13, borderRadius:8, border:"0.5px solid var(--color-border)", background:"var(--color-off-white)", color:"var(--color-charcoal)", fontFamily:"inherit", outline:"none" }}>
                {properties.map(p => (
                  <option key={p.propertyId} value={p.propertyId}>{p.displayName} ({p.account})</option>
                ))}
              </select>
              <button onClick={saveProperty} disabled={savingProp || !selectedPropId}
                style={{ padding:"10px 0", fontSize:13, fontWeight:500, borderRadius:8, border:"none", background:"var(--color-sage)", color:"white", cursor:"pointer", fontFamily:"inherit", opacity: savingProp ? 0.6 : 1 }}>
                {savingProp ? "Connecting…" : "Connect this property"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Connected: real stats ── */}
      {step === "connected" && (
      <>
      <div style={{ background:"var(--color-off-white)", borderBottom:"0.5px solid var(--color-border)", padding:"10px 24px", display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--color-sage)" }} />
          <span style={{ fontWeight:600 }}>{(integration?.metadata?.property_name as string) ?? integration?.account_name ?? "Google Analytics"}</span>
          <span style={{ color:"var(--color-grey)" }}>GA4</span>
        </div>
        <span style={{ color:"var(--color-sage)", fontSize:11 }}>Connected</span>
        <button onClick={onDisconnect} style={{ fontSize:11, color:"var(--color-grey)", background:"none", border:"none", cursor:"pointer" }}>Disconnect</button>
      </div>
      <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:18, flex:1 }}>
        <div className="rounded-xl" style={{ border:"0.5px solid var(--color-border)", padding:"12px 16px", display:"flex", gap:12, ...cardStyle }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:8, flex:1 }}>
            <div style={{ color:C.accent, flexShrink:0, marginTop:2 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22c0 0-6-4-6-10a6 6 0 0 1 12 0c0 6-6 10-6 10z"/><path d="M12 12c-2-1.5-3-3-2-5"/><path d="M12 12c2-1.5 3-3 2-5"/></svg>
            </div>
            <div>
              <div style={{ fontSize:10, textTransform:"uppercase", color:"var(--color-grey)", fontWeight:600, letterSpacing:"0.04em" }}>Ash Insight</div>
              <div style={{ fontSize:13, color:"var(--color-charcoal)", lineHeight:1.5, marginTop:2 }}>Traffic spike on Apr 7 was 6× your daily average — Sight Unseen featured your brass series. Consider reaching out to thank the editor; it can warm the relationship for future coverage.</div>
            </div>
          </div>
          <span style={{ ...blueLink, whiteSpace:"nowrap", flexShrink:0, alignSelf:"flex-start" }}>Ask Ash →</span>
        </div>
        <div style={{ display:"flex", gap:12 }}>
          {loadingStats ? (
            [1,2,3,4].map(i => (
              <div key={i} className="flex flex-col gap-1 rounded-xl p-4 flex-1" style={{ background:"var(--color-warm-white)", border:"0.5px solid var(--color-border)" }}>
                <div style={{ height:10, width:"60%", background:"var(--color-cream)", borderRadius:3 }} />
                <div style={{ height:24, width:"40%", background:"var(--color-cream)", borderRadius:3, marginTop:4 }} />
              </div>
            ))
          ) : (
            <>
              <StatCard label="Sessions"    value={stats?.sessions ? stats.sessions.toLocaleString() : "—"} sub="Last 30 days" detail="Total visits to your site" helpText="A session is a visit to your site." askAsh ashMessage="How can I get more visitors to my design portfolio?" />
              <StatCard label="Active users" value={stats?.active_users ? stats.active_users.toLocaleString() : "—"} sub="Last 30 days" detail="Unique people" helpText="Distinct people who visited." askAsh />
              <StatCard label="Avg session"  value={stats?.avg_session_sec ? fmtDuration(stats.avg_session_sec) : "—"} sub="Time on site" detail="Longer = more engaged" helpText="Time spent per visit. 2+ min is strong for a portfolio." askAsh />
              <StatCard label="Bounce rate"  value={stats?.bounce_rate ? `${stats.bounce_rate}%` : "—"} sub="Single-page visits" detail="Under 60% is solid" helpText="Visitors who left after one page." askAsh />
            </>
          )}
        </div>
        <div style={{ display:"flex", gap:16, flex:1, minHeight:0 }}>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}>
                <span style={cardHeadTitle}>Sessions · last 30 days</span>
                {stats?.sessions && <span style={{ fontSize:10, color:"var(--color-grey)" }}>{stats.sessions.toLocaleString()} total</span>}
              </div>
              <div style={{ padding:"16px 15px", display:"flex", alignItems:"center", justifyContent:"center", height:96 }}>
                {loadingStats
                  ? <p style={{ fontSize:12, color:"var(--color-grey)" }}>Loading…</p>
                  : stats?.sessions
                    ? <p style={{ fontSize:24, fontWeight:700, color:"var(--color-charcoal)" }}>{stats.sessions.toLocaleString()} sessions</p>
                    : <p style={{ fontSize:12, color:"var(--color-grey)" }}>Data loading…</p>}
              </div>
            </div>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Top pages · 30 days</span></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 72px 72px", gap:12, padding:"8px 15px", borderBottom:"0.5px solid var(--color-border)", fontSize:10, color:"var(--color-grey)", textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600 }}>
                <span>Page</span><span>Views</span><span>Avg time</span>
              </div>
              {(stats?.top_pages ?? []).length === 0 && !loadingStats ? (
                <p style={{ padding:"16px 15px", fontSize:12, color:"var(--color-grey)" }}>No page data yet.</p>
              ) : (stats?.top_pages ?? []).map(p => (
                <div key={p.path} style={{ display:"grid", gridTemplateColumns:"1fr 72px 72px", gap:12, padding:"9px 15px", borderBottom:"0.5px solid var(--color-border)", cursor:"pointer", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.title || p.path}</div>
                    <div style={{ fontSize:10, color:"var(--color-grey)" }}>{p.path}</div>
                  </div>
                  <span style={{ fontSize:12 }}>{p.pageviews.toLocaleString()}</span>
                  <span style={{ fontSize:11, color:"var(--color-grey)" }}>{fmtDuration(Math.round(p.avg_sec))}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", gap:12 }}>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Traffic channels</span></div>
              {(stats?.channels ?? []).length === 0 && !loadingStats ? (
                <p style={{ padding:"16px 15px", fontSize:12, color:"var(--color-grey)" }}>No channel data yet.</p>
              ) : (stats?.channels ?? []).map((ch, i) => {
                const COLORS_CYCLE = [C.blue, C.purple, C.accent, C.amber, C.teal];
                const color = COLORS_CYCLE[i % COLORS_CYCLE.length];
                return (
                  <div key={ch.channel} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 40px", gap:12, alignItems:"center", padding:"11px 15px", borderBottom:"0.5px solid var(--color-border)" }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--color-grey)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ch.channel}</span>
                    <div style={{ height:5, background:"var(--color-cream)", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:2, background:color, width:`${Math.min(100, ch.pct)}%` }} />
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, textAlign:"right" }}>{ch.pct}%</span>
                  </div>
                );
              })}
            </div>
            {stats?.last_fetched && (
              <div style={{ padding:"10px 14px", borderRadius:8, background:"var(--color-cream)", fontSize:11, color:"var(--color-grey)" }}>
                Last synced {new Date(stats.last_fetched).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
              </div>
            )}
          </div>
        </div>
      </div>
      </>)}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOCIALS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function SocialsTab({ instagram, onConnect, onDisconnect }: {
  instagram: Integration | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", gap:8, padding:"12px 24px", borderBottom:"0.5px solid var(--color-border)", flexWrap:"wrap", alignItems:"center", background:"var(--color-off-white)" }}>
        {instagram ? (
          <div className="flex items-center gap-2 rounded-full" style={{ padding:"7px 12px", border:"0.5px solid rgba(155,163,122,0.4)", background:"rgba(155,163,122,0.08)", cursor:"pointer" }}>
            <div className="flex items-center justify-center rounded-md" style={{ width:18, height:18, background:C.purpleL }}><span style={{ color:C.purple }}><IcIG /></span></div>
            <div>
              <div style={{ fontSize:11, fontWeight:600 }}>{instagram.account_name ?? "@instagram"}</div>
              <div style={{ fontSize:10, color:"var(--color-grey)" }}>{instagram.metadata.followers_count ? `${instagram.metadata.followers_count.toLocaleString()} followers` : "Instagram"}</div>
            </div>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--color-sage)" }} />
          </div>
        ) : null}
        {["TikTok","Pinterest","LinkedIn"].map(p => (
          <div key={p} className="flex items-center gap-2 rounded-full" style={{ padding:"7px 12px", border:"0.5px solid rgba(31,33,26,0.13)", background:"var(--color-cream)", cursor:"default", opacity:0.65 }}>
            <span style={{ fontSize:11, fontWeight:600, color:"var(--color-grey)" }}>{p}</span>
            <span style={{ fontSize:10, color:"var(--color-grey)" }}>Coming soon</span>
          </div>
        ))}
        {!instagram ? (
          <button onClick={onConnect} className="flex items-center gap-1 rounded-full" style={{ padding:"7px 14px", border:"0.5px dashed var(--color-sage)", color:"var(--color-sage)", cursor:"pointer", fontSize:11, background:"none", fontFamily:"inherit" }}>
            <IcPlus /> Connect Instagram
          </button>
        ) : (
          <button onClick={onDisconnect} className="ml-auto rounded-full" style={{ padding:"5px 10px", border:"0.5px solid var(--color-border)", color:"var(--color-grey)", cursor:"pointer", fontSize:10, background:"none", fontFamily:"inherit" }}>Disconnect</button>
        )}
      </div>

      {!instagram ? (
        <div style={{ padding:"60px 24px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
          <div className="flex items-center justify-center rounded-xl" style={{ width:48, height:48, background:C.purpleL }}><span style={{ color:C.purple }}><IcIG /></span></div>
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:14, fontWeight:600, color:"var(--color-charcoal)", marginBottom:6 }}>Connect your Instagram</p>
            <p style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.6, maxWidth:340 }}>See your follower count, engagement rate, and top posts — pulled directly from your business or creator account.</p>
          </div>
          <button onClick={onConnect} style={{ padding:"8px 20px", fontSize:12, fontWeight:500, borderRadius:8, border:"none", background:"var(--color-sage)", color:"white", cursor:"pointer", fontFamily:"inherit" }}>
            Connect with Instagram
          </button>
          <p style={{ fontSize:11, color:"var(--color-grey)" }}>Requires a business or creator account</p>
        </div>
      ) : (

      <div style={{ display:"flex", gap:4, padding:"10px 24px", borderBottom:"0.5px solid var(--color-border)", background:"var(--color-off-white)" }}>
        <div style={{ padding:"5px 12px", borderRadius:"10px 10px 0 0", border:"0.5px solid rgba(155,163,122,0.4)", borderBottom:"2px solid var(--color-sage)", fontSize:11, color:"var(--color-sage)", fontWeight:500, cursor:"pointer" }}>Instagram</div>
      </div>
      )}
      {instagram && (
      <>
      <div style={{ padding:"14px 24px", display:"flex", gap:12 }}>
        <StatCard label="Followers"  value={instagram.metadata.followers_count ? String(instagram.metadata.followers_count) : "—"} sub={instagram.account_name ?? "Instagram"} detail="Total followers" helpText="Total people following you." askAsh ashMessage="How can I grow my Instagram following as a designer?" />
        <StatCard label="Engagement" value={instagram.metadata.engagement_rate ? `${instagram.metadata.engagement_rate}%` : "—"} sub="Avg engagement rate" subUp={!!instagram.metadata.engagement_rate} detail="Industry avg: 1.8%" helpText="Likes + comments as % of followers." askAsh />
        <StatCard label="Media"      value={instagram.metadata.media_count ? String(instagram.metadata.media_count) : "—"} sub="Total posts" helpText="Posts on your account." askAsh />
        <StatCard label="Last synced" value={instagram.last_synced_at ? new Date(instagram.last_synced_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—"} sub="Stats refresh" detail="Pull latest from Instagram" />
      </div>
        <div style={{ display:"flex", gap:16, flex:1, minHeight:0, padding:"0 24px 24px" }}>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Post queue</span></div>
              <div style={{ display:"flex", gap:6, padding:"10px 15px", borderBottom:"0.5px solid var(--color-border)" }}>
                {[["Scheduled (2)",true],["Drafts (1)",false],["Published",false]].map(([label, active]) => (
                  <div key={label as string} style={{ padding:"4px 10px", borderRadius:10, border:"0.5px solid rgba(31,33,26,0.12)", fontSize:11, cursor:"pointer", background:active?C.blueL:"transparent", color:active?C.blue:"var(--color-grey)", borderColor:active?C.blueL:"rgba(31,33,26,0.12)" }}>{label}</div>
                ))}
              </div>
              {[
                { caption:"New work in the studio — the walnut slab series is coming together. Full reveal at ICFF, May 19–23 in New York. 🌿", when:"Tomorrow · Apr 18 · 7:30 PM" },
                { caption:"Five years of making, distilled into a body of work. The brass wall series is the most resolved thing I've made yet.", when:"Apr 22 · 6:00 PM" },
              ].map((post,i) => (
                <div key={i} className="flex items-start gap-3" style={{ padding:"11px 15px", borderBottom:"0.5px solid var(--color-border)" }}>
                  <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width:56, height:56, background:"var(--color-cream)", color:"var(--color-grey)" }}><IcImage /></div>
                  <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:4 }}>
                    <div style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>{post.caption}</div>
                    <div style={{ fontSize:10, color:"var(--color-grey)" }}>{post.when}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-full" style={{ fontSize:9, fontWeight:600, padding:"2px 7px", background:C.blueL, color:C.blue }}>Scheduled</span>
                    <button style={{ background:"none", border:"none", color:"var(--color-grey)", cursor:"pointer", padding:4 }}><IcEdit /></button>
                    <button style={{ background:"none", border:"none", color:"var(--color-grey)", cursor:"pointer", padding:4 }}><IcTrash /></button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-center gap-2 cursor-pointer" style={{ padding:"11px 15px", border:"0.5px dashed rgba(31,33,26,0.15)", borderRadius:8, margin:"0 15px 12px", color:"var(--color-grey)", fontSize:12 }}><IcPlus /> Schedule new post</div>
            </div>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Quick compose</span></div>
              <div style={{ padding:"12px 15px" }}>
                <textarea readOnly placeholder="What's happening in the studio..." style={{ width:"100%", minHeight:72, padding:12, borderRadius:8, border:"0.5px solid var(--color-border)", background:"var(--color-cream)", color:"var(--color-charcoal)", fontSize:12, fontFamily:"inherit", resize:"none" }} />
                <div className="flex items-center gap-2 mt-2">
                  <BtnGhost small>Add image</BtnGhost>
                  <BtnGhost small>Add hashtags</BtnGhost>
                  <span style={{ fontSize:11, color:"var(--color-grey)", marginLeft:"auto" }}>0 / 2,200</span>
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ padding:"12px 15px", borderTop:"0.5px solid var(--color-border)" }}><BtnGhost small>Save as draft</BtnGhost><BtnPrimary small>Schedule →</BtnPrimary></div>
            </div>
          </div>
          <div style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", gap:12 }}>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Top post · Apr</span></div>
              <div className="flex items-center justify-center" style={{ height:100, background:"var(--color-cream)", borderBottom:"0.5px solid var(--color-border)", color:"var(--color-grey)", fontSize:11, fontStyle:"italic" }}>Walnut slab detail</div>
              <div style={{ padding:"12px 15px" }}>
                <div style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.4, marginBottom:8 }}>Walnut slab detail — new series in the studio. Grain like this only comes around once.</div>
                <div className="flex gap-4" style={{ fontSize:10, color:"var(--color-grey)", paddingBottom:8, borderBottom:"0.5px solid var(--color-border)" }}>
                  <span>312 likes</span><span>28 comments</span><span>4.8% engagement</span>
                </div>
                <div style={{ fontSize:10, color:"var(--color-grey)", paddingTop:8 }}>Posted Apr 13 · <span style={blueLink}>View on Instagram →</span></div>
              </div>
            </div>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Follower growth</span><span style={{ fontSize:10, color:"var(--color-grey)" }}>Last 6 months</span></div>
              <div style={{ padding:"12px 15px" }}>
                <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:60, marginBottom:12 }}>
                  {[30,28,35,40,44,55].map((h,i) => <div key={i} style={{ flex:1, borderRadius:"2px 2px 0 0", height:`${h}px`, background:i===5?C.purple:C.purpleL }} />)}
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:C.accent }}>+940 this month</div>
                <div style={{ fontSize:11, color:"var(--color-grey)" }}>4,820 total</div>
              </div>
            </div>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Best times to post</span></div>
              <div style={{ padding:"0 15px" }}>
                {[{day:"Tuesday & Wednesday",hours:"7–9 PM",best:true},{day:"Saturday",hours:"10 AM–12 PM",best:false},{day:"Sunday",hours:"6–8 PM",best:false}].map(t => (
                  <div key={t.day} className="flex items-center gap-2" style={{ padding:"9px 0", borderBottom:"0.5px solid var(--color-border)" }}>
                    <IcClock />
                    <span style={{ fontSize:11, color:"var(--color-grey)", flex:1 }}>{t.day}</span>
                    <span style={{ fontSize:11, color:"var(--color-grey)" }}>{t.hours}</span>
                    {t.best && <span className="rounded-full" style={{ fontSize:8, fontWeight:600, padding:"2px 6px", background:C.accentL, color:C.accent }}>Best</span>}
                  </div>
                ))}
                <div style={{ fontSize:10, color:"var(--color-grey)", fontStyle:"italic", padding:"8px 0" }}>Based on your last 30 posts</div>
              </div>
            </div>
          </div>
        </div>
      </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEWSLETTER TAB
// ═══════════════════════════════════════════════════════════════════════════════
function NewsletterTab({ integration, onConnect, onDisconnect }: {
  integration: Integration | null;
  onConnect: (p: ConnectProvider) => void;
  onDisconnect: (p: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ display:"flex", flexDirection:"column" }}>
      {!integration ? (
        /* ── No newsletter connected ── */
        <div style={{ padding:"40px 24px", display:"flex", flexDirection:"column", gap:20, flex:1 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"32px 0 24px" }}>
            <div className="flex items-center justify-center rounded-xl" style={{ width:48, height:48, background:C.amberL, color:C.amber }}><IcMail /></div>
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:14, fontWeight:600, color:"var(--color-charcoal)", marginBottom:6 }}>Connect your newsletter</p>
              <p style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.6, maxWidth:360 }}>See subscriber counts, open rates, and campaign performance — pulled directly from your newsletter platform.</p>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, maxWidth:400, margin:"0 auto", width:"100%" }}>
            {(["beehiiv","kit","mailchimp","substack"] as ConnectProvider[]).map(p => (
              <button key={p} onClick={() => onConnect(p)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", borderRadius:10, border:"0.5px solid var(--color-border)", background:"var(--color-off-white)", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--color-sage)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)"}>
                <div style={{ width:28, height:28, borderRadius:7, background:PROVIDER_META[p].bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:PROVIDER_META[p].color }}>{PROVIDER_META[p].label[0]}</span>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:"var(--color-charcoal)" }}>{PROVIDER_META[p].label}</div>
                  <div style={{ fontSize:10, color:"var(--color-grey)" }}>{p === "substack" ? "Manual entry" : "API key"}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── Newsletter connected ── */
        <>
        <div style={{ background:"var(--color-off-white)", borderBottom:"0.5px solid var(--color-border)", padding:"10px 24px", display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
          <div className="flex items-center justify-center rounded-md" style={{ width:18, height:18, background:C.amberL, color:C.amber }}><IcMail /></div>
          <span style={{ fontWeight:600 }}>{integration.account_name ?? "Newsletter"}</span>
          <span style={{ color:"var(--color-grey)", textTransform:"capitalize" }}>{integration.provider}</span>
          <div className="flex items-center gap-2" style={{ marginLeft:"auto", color:"var(--color-sage)", fontSize:11 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--color-sage)" }} />
            <span>Connected</span>
          </div>
          <button onClick={() => onDisconnect(integration.provider)} style={{ fontSize:11, color:"var(--color-grey)", background:"none", border:"none", cursor:"pointer" }}>Disconnect</button>
        </div>
        <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:18, flex:1 }}>
        <div style={{ display:"flex", gap:12 }}>
          <StatCard label="Subscribers"
            value={integration.metadata.subscriber_count ? String(integration.metadata.subscriber_count) : integration.metadata.total_subscribers ? String(integration.metadata.total_subscribers) : integration.metadata.subscribers ? String(integration.metadata.subscribers) : "—"}
            sub="Active subscribers" subUp
            detail="Your owned audience"
            helpText="Total active subscribers on your list."
            askAsh ashMessage="How can I grow my newsletter subscriber count as a designer?" />
          <StatCard label="Open rate"
            value={integration.metadata.open_rate ? `${integration.metadata.open_rate}%` : "—"}
            sub="Industry avg: 21%"
            subUp={!!integration.metadata.open_rate}
            detail="Above 30% is strong"
            helpText="What percentage open your emails."
            askAsh />
          <StatCard label="Platform"    value={String(PROVIDER_META[integration.provider as ConnectProvider]?.label ?? integration.provider)} sub={integration.account_name ?? ""} />
          <StatCard label="Last synced" value={integration.last_synced_at ? new Date(integration.last_synced_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—"} sub="Stats last refreshed" />
        </div>
        <div style={{ display:"flex", gap:16, flex:1, minHeight:0 }}>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Campaigns</span><span style={{ fontSize:10, color:"var(--color-grey)" }}>All time</span><BtnAccent small>+ New</BtnAccent></div>
              {[
                { subject:"Pricing your work as a collectible maker",          date:"Apr 9",  open:"47%", click:"3.1%", sent:"312", best:true  },
                { subject:"The gallery relationship — what they actually want", date:"Mar 12", open:"52%", click:"2.9%", sent:"298", best:true  },
                { subject:"What I learned exhibiting at NYCxDesign",           date:"Mar 26", open:"41%", click:"3.3%", sent:"305", best:false },
                { subject:"Studio update: brass series complete",               date:"Feb 28", open:"38%", click:"2.2%", sent:"291", best:false },
                { subject:"Open calls worth applying to this spring",           date:"Feb 14", open:"44%", click:"2.8%", sent:"278", best:false },
              ].map(c => (
                <div key={c.date} style={{ padding:"11px 15px", borderBottom:"0.5px solid var(--color-border)", cursor:"pointer" }}>
                  <div className="flex items-baseline gap-2 mb-1"><span style={{ fontSize:12, fontWeight:500, flex:1 }}>{c.subject}</span><span style={{ fontSize:10, color:"var(--color-grey)", whiteSpace:"nowrap" }}>{c.date}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full" style={{ fontSize:10, fontWeight:600, padding:"2px 8px", background:Number(c.open)>=45?C.accentL:"var(--color-cream)", color:Number(c.open)>=45?C.accent:"var(--color-grey)" }}>{c.open}</span>
                    <span style={{ fontSize:10, color:"var(--color-grey)" }}>{c.click} · {c.sent} sent</span>
                    {c.best && <span className="rounded-full ml-auto" style={{ fontSize:9, fontWeight:600, padding:"2px 7px", background:C.amberL, color:C.amber }}>Best ↑</span>}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-center" style={{ padding:"11px 15px", borderTop:"0.5px dashed var(--color-border)", color:"var(--color-grey)", fontSize:11, cursor:"pointer" }}>+ New campaign</div>
            </div>
            <div className={card()} style={{ ...cardStyle, padding:15 }}>
              <div className="flex items-center gap-2 mb-3"><span style={{ ...cardHeadTitle, flex:1 }}>Next send</span><span className="rounded-full" style={{ fontSize:10, fontWeight:600, padding:"3px 10px", background:C.blueL, color:C.blue }}>Drafting</span></div>
              <div style={{ marginBottom:12 }}><div style={{ fontSize:10, color:"var(--color-grey)", textTransform:"uppercase", fontWeight:600, letterSpacing:"0.04em", marginBottom:4 }}>Subject</div><div style={{ background:"var(--color-cream)", borderRadius:6, padding:"6px 10px", fontSize:12, border:"0.5px solid var(--color-border)" }}>May dispatch</div></div>
              <div style={{ marginBottom:8, fontSize:11, color:"var(--color-grey)" }}><span style={{ fontWeight:600, color:"var(--color-charcoal)" }}>May 14</span> · 9:00 AM &nbsp;·&nbsp; All subscribers · 312</div>
              <div className="flex items-center gap-2"><BtnGhost small>Edit draft</BtnGhost><BtnGhost small>Preview</BtnGhost><BtnGhost small>Send test</BtnGhost></div>
            </div>
          </div>
          <div style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", gap:12 }}>
            <div className={card()} style={{ ...cardStyle, padding:15 }}>
              <div className="flex items-center gap-2 mb-3"><span style={cardHeadTitle}>Subscriber growth</span><span style={{ fontSize:10, color:"var(--color-grey)" }}>Last 6 months</span></div>
              <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:6, height:80, marginBottom:4 }}>
                {[28,32,30,38,44,46,52].map((h,i) => <div key={i} style={{ flex:1, borderRadius:"2px 2px 0 0", height:`${h}px`, background:i===6?C.amber:C.amberL }} />)}
              </div>
              <div className="flex justify-between" style={{ fontSize:9, color:"var(--color-grey)", marginBottom:12 }}>
                {["Oct","Nov","Dec","Jan","Feb","Mar","Apr"].map(m => <span key={m}>{m}</span>)}
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:C.accent }}>+14 this month</div>
              <div style={{ fontSize:11, color:"var(--color-grey)" }}>312 total</div>
              <div style={{ fontSize:10, color:"var(--color-grey)", marginTop:8 }}>Unsubscribes this month: 2</div>
            </div>
            <div className={card()} style={{ ...cardStyle, padding:15 }}>
              <div style={{ ...cardHeadTitle, marginBottom:12 }}>Audience</div>
              {[
                { label:"Avg read time",            value:"4m 12s" },
                { label:"Most engaged segment",     value:<span className="rounded-full" style={{ fontSize:10, fontWeight:600, padding:"2px 8px", background:C.accentL, color:C.accent }}>Past clients</span> },
                { label:"Top location",             value:"New York, NY" },
                { label:"Platform",                 value:"Substack Web (64%) · Email (36%)" },
                { label:"Paid subscribers",         value:<span>0 (Free) <span style={blueLink}>Upgrade</span></span> },
              ].map((r,i) => (
                <div key={i} className="flex justify-between items-center" style={{ padding:"9px 0", borderBottom:"0.5px solid var(--color-border)" }}>
                  <span style={{ fontSize:11, color:"var(--color-grey)" }}>{r.label}</span>
                  <span style={{ fontSize:11, fontWeight:500 }}>{r.value}</span>
                </div>
              ))}
            </div>
            <AshCard text="Your 'gallery relationship' send had your highest open rate (52%). Want me to outline a follow-up piece on pitching collectors directly?" />
          </div>
        </div>
        </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MONTHLY CALENDAR VIEW
// ═══════════════════════════════════════════════════════════════════════════════
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MAX_LANES = 3;
const LANE_H = 22;
const DAY_NUM_H = 28;
const MIN_ROW_H = 110;

// More opaque colors for calendar bars
const calBg: Record<string, string> = {
  fair:      "rgba(37,99,171,0.18)",
  openCall:  "rgba(20,140,140,0.18)",
  grant:     "rgba(109,79,163,0.18)",
  award:     "rgba(184,134,11,0.20)",
  residency: "rgba(61,107,79,0.18)",
};

function MonthCalendar({ opps }: { opps: Opportunity[] }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const now = today();

  const calEvents: CalEvent[] = useMemo(() =>
    opps.filter(o => o.start_date).map(o => ({
      id:       o.id,
      title:    o.title,
      category: o.category,
      start:    parseDate(o.start_date)!,
      end:      parseDate(o.end_date) ?? parseDate(o.start_date)!,
    })),
    [opps]
  );

  const weekRows = useMemo(() => getWeekRows(month), [month]);

  const prevMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ padding:"0 24px 24px" }}>
      {/* Calendar header */}
      <div className="flex items-center gap-3 shrink-0" style={{ padding:"16px 0 12px" }}>
        <button onClick={prevMonth} className="flex items-center justify-center rounded-md" style={{ width:28, height:28, background:"var(--color-cream)", border:"0.5px solid var(--color-border)", cursor:"pointer" }}><IcChevL /></button>
        <span style={{ fontSize:14, fontWeight:600, flex:1 }}>{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <button onClick={nextMonth} className="flex items-center justify-center rounded-md" style={{ width:28, height:28, background:"var(--color-cream)", border:"0.5px solid var(--color-border)", cursor:"pointer" }}><IcChevR /></button>
        {/* Legend */}
        <div className="flex items-center gap-3" style={{ marginLeft:8 }}>
          {[["fair","Fairs"],["openCall","Open Calls"],["award","Awards"],["grant","Grants"]].map(([cat, label]) => {
            const { dark } = catColor(cat);
            return <div key={cat} className="flex items-center gap-1" style={{ fontSize:10, color:"var(--color-grey)" }}><div style={{ width:10, height:10, borderRadius:2, background:calBg[cat], border:`1.5px solid ${dark}` }} />{label}</div>;
          })}
        </div>
      </div>

      {/* Day-of-week header */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", borderTop:"0.5px solid var(--color-border)", borderLeft:"0.5px solid var(--color-border)", borderRadius:"8px 8px 0 0", overflow:"hidden", flexShrink:0, background:"var(--color-cream)" }}>
        {DAYS_SHORT.map((d,i) => (
          <div key={d} style={{ padding:"6px 0", textAlign:"center", fontSize:10, fontWeight:600, color:"var(--color-grey)", letterSpacing:"0.04em", borderRight:"0.5px solid var(--color-border)", borderBottom:"0.5px solid var(--color-border)", textTransform:"uppercase", background:i===0||i===6?"rgba(0,0,0,0.02)":undefined }}>{d}</div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex-1 overflow-y-auto" style={{ borderLeft:"0.5px solid var(--color-border)", borderBottom:"0.5px solid var(--color-border)", borderRadius:"0 0 8px 8px", background:"var(--color-off-white)" }}>
        {weekRows.map((week, wi) => {
          const weekEvents = getWeekEvents(week, calEvents);
          const maxLane = weekEvents.length > 0 ? Math.max(...weekEvents.map(e => e.lane)) : -1;
          const rowH = Math.max(MIN_ROW_H, DAY_NUM_H + Math.min(maxLane + 1, MAX_LANES) * LANE_H + 8);

          return (
            <div key={wi} style={{ position:"relative", display:"grid", gridTemplateColumns:"repeat(7, 1fr)", minHeight:rowH, borderBottom: wi < weekRows.length - 1 ? "0.5px solid var(--color-border)" : undefined }}>
              {/* Day cells */}
              {week.map((day, di) => {
                const inMonth = day.getMonth() === month.getMonth();
                const isToday = sameDay(day, now);
                return (
                  <div key={di} style={{ padding:"5px 7px", borderRight:"0.5px solid var(--color-border)", background:di===0||di===6?"rgba(0,0,0,0.018)":undefined, minHeight:rowH }}>
                    <span style={{
                      display:"inline-flex", alignItems:"center", justifyContent:"center",
                      width:24, height:24, borderRadius:"50%",
                      fontSize:12, fontWeight:isToday?700:400,
                      color:isToday?"var(--color-off-white)":inMonth?"var(--color-charcoal)":"var(--color-grey)",
                      background:isToday?"var(--color-charcoal)":undefined,
                    }}>{day.getDate()}</span>
                  </div>
                );
              })}

              {/* Event bars (absolutely positioned) */}
              {weekEvents.map((we, ei) => {
                if (we.lane >= MAX_LANES) return null;
                const { dark } = catColor(we.event.category);
                const bg = calBg[we.event.category] ?? calBg.fair;
                const leftPct = (we.startCol / 7) * 100;
                const widthPct = (we.span / 7) * 100;
                const top = DAY_NUM_H + we.lane * LANE_H;
                return (
                  <div
                    key={ei}
                    title={we.event.title}
                    style={{
                      position:"absolute",
                      left:`calc(${leftPct}% + ${we.isStart?3:0}px)`,
                      width:`calc(${widthPct}% - ${we.isStart?3:0}px - ${we.isEnd?4:0}px)`,
                      top,
                      height:LANE_H - 4,
                      background:bg,
                      borderLeft:we.isStart?`3px solid ${dark}`:"none",
                      borderRadius:we.isStart&&we.isEnd?"4px":we.isStart?"4px 0 0 4px":we.isEnd?"0 4px 4px 0":"0",
                      padding:"2px 6px",
                      fontSize:10,
                      fontWeight:600,
                      color:dark,
                      whiteSpace:"nowrap",
                      overflow:"hidden",
                      textOverflow:"ellipsis",
                      cursor:"pointer",
                      zIndex:2,
                    }}
                  >
                    {we.isStart ? we.event.title : ""}
                  </div>
                );
              })}

              {/* "+N more" overflow indicator — one per day column */}
              {week.map((_, di) => {
                const colEvents = weekEvents.filter(we => we.startCol <= di && we.startCol + we.span > di);
                const overflow = colEvents.filter(we => we.lane >= MAX_LANES).length;
                if (overflow === 0) return null;
                return (
                  <div key={`ov-${di}`} style={{ position:"absolute", left:`calc(${(di/7)*100}% + 4px)`, top: DAY_NUM_H + MAX_LANES * LANE_H, fontSize:9, color:"var(--color-grey)", zIndex:3 }}>+{overflow} more</div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPPORTUNITIES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function OppRow({ opp, onClick, selected }: { opp: Opportunity; onClick: () => void; selected?: boolean }) {
  const start = parseDate(opp.start_date);
  const end   = parseDate(opp.end_date);
  const isNow = start && end && start <= today() && end >= today();
  const section = oppSection(opp);
  const deadlineLabel = isNow ? "Happening now"
    : section === "actSoon" && end ? `Deadline ${end.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`
    : null;

  return (
    <div
      onClick={onClick}
      style={{ cursor:"pointer", background:selected?"var(--color-cream)":undefined, borderRadius:selected?8:undefined, margin:selected?"0 -8px":undefined, padding:selected?"0 8px":undefined, transition:"background 0.1s" }}
    >
      <div className="flex items-start gap-4" style={{ padding:"14px 0", borderBottom: selected ? "none" : "0.5px solid var(--color-border)" }}>
        <DateBlock month={start ? start.toLocaleString("en-US",{month:"short"}) : "—"} day={start ? String(start.getDate()) : "—"} />
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize:13, fontWeight:600 }}>{opp.title}</span>
            <TypeBadge type={opp.event_type} category={opp.category} />
          </div>
          <div style={{ fontSize:11, color:"var(--color-grey)" }}>
            {opp.end_date && opp.start_date !== opp.end_date
              ? `${start?.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${end?.toLocaleDateString("en-US",{month:"short",day:"numeric"})} · `
              : ""}
            {opp.location}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {deadlineLabel && <span className="rounded-full" style={{ fontSize:10, fontWeight:600, padding:"2px 8px", background:isNow?C.accentL:C.redL, color:isNow?C.accent:C.red }}>{deadlineLabel}</span>}
            {opp.user_status && <StatusBadge status={opp.user_status} />}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span style={{ fontSize:11, color:"var(--color-grey)" }}>View →</span>
        </div>
      </div>
      {opp.ash_note && !selected && (
        <div style={{ background:C.amberL, borderLeft:`3px solid ${C.amber}`, padding:"9px 12px", margin:"0 0 4px 58px", borderRadius:4, fontSize:11, color:C.amber }}>
          <strong>Ash:</strong> {opp.ash_note}
        </div>
      )}
    </div>
  );
}

// ─── Opportunity detail panel ─────────────────────────────────────────────────
function OppDetail({ opp, onClose, onDismiss, onStatusChange }: {
  opp: Opportunity; onClose: () => void;
  onDismiss: (id: string) => void;
  onStatusChange: (id: string, status: string | null) => void;
}) {
  const start = parseDate(opp.start_date);
  const end   = parseDate(opp.end_date);
  const { dark, light } = catColor(opp.category);

  async function setStatus(s: string) {
    const newStatus = opp.user_status === s ? null : s;
    onStatusChange(opp.id, newStatus);
    await createClient().from("opportunities").update({ user_status: newStatus }).eq("id", opp.id);
  }

  async function handleDismiss() {
    await createClient().from("opportunities").update({ user_status: "hidden" }).eq("id", opp.id);
    onDismiss(opp.id);
    onClose();
  }

  const dateStr = (() => {
    if (!start && !end) return "Dates TBD";
    if (!start && end) return `Deadline ${end.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}`;
    if (!end || opp.start_date === opp.end_date) return start!.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    return `${start!.toLocaleDateString("en-US",{month:"long",day:"numeric"})} – ${end.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}`;
  })();

  return (
    <div style={{ width:340, flexShrink:0, borderLeft:"0.5px solid var(--color-border)", background:"var(--color-off-white)", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 16px", borderBottom:"0.5px solid var(--color-border)", display:"flex", alignItems:"flex-start", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:650, lineHeight:1.35, marginBottom:6 }}>{opp.title}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={opp.event_type} category={opp.category} />
            {opp.user_status && <StatusBadge status={opp.user_status} />}
          </div>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-grey)", padding:2, flexShrink:0, marginTop:1 }}><IcX /></button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding:"16px" }}>
        {/* Date + Location */}
        <div style={{ marginBottom:14, display:"flex", flexDirection:"column", gap:5 }}>
          <div className="flex items-center gap-6 flex-wrap" style={{ fontSize:12, color:"var(--color-grey)" }}>
            <span className="flex items-center gap-1"><IcCalSm />{dateStr}</span>
            {opp.location && <span className="flex items-center gap-1"><IcMapPin />{opp.location}</span>}
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-2" style={{ marginBottom:16 }}>
          {opp.website_url && (
            <a href={opp.website_url} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:6, border:`0.5px solid ${dark}`, background:light, color:dark, fontSize:11, fontWeight:500, textDecoration:"none" }}>
              <IcExtLink /> Visit website
            </a>
          )}
          {opp.registration_url && (
            <a href={opp.registration_url} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:6, background:"var(--color-charcoal)", color:"var(--color-off-white)", fontSize:11, fontWeight:500, textDecoration:"none" }}>
              Apply / Register ↗
            </a>
          )}
        </div>

        {/* About */}
        {opp.about && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--color-grey)", marginBottom:6 }}>About</div>
            <p style={{ fontSize:12, color:"var(--color-grey)", lineHeight:1.65, margin:0 }}>{opp.about}</p>
          </div>
        )}

        {/* Ash note */}
        {opp.ash_note && (
          <div style={{ background:C.amberL, border:`0.5px solid rgba(184,134,11,0.25)`, borderLeft:`3px solid ${C.amber}`, borderRadius:6, padding:"10px 12px", marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:600, color:C.amber, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:4 }}>Ash Note</div>
            <p style={{ fontSize:12, color:C.amber, lineHeight:1.5, margin:0 }}>{opp.ash_note}</p>
          </div>
        )}

        {/* Work on this */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--color-grey)", marginBottom:8 }}>Work on this</div>
          <div className="flex flex-col gap-2">
            <button onClick={() => openAsh(`Help me draft an application for ${opp.title}. I need to write a compelling statement, proposal, or cover letter that showcases my work as a designer.`)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, border:"0.5px solid var(--color-border)", background:"var(--color-cream)", cursor:"pointer", fontSize:12, color:"var(--color-charcoal)", fontFamily:"inherit", textAlign:"left" }}>
              <span style={{ color:"var(--color-sage)", flexShrink:0 }}><IcFileSm /></span>
              <div>
                <div style={{ fontWeight:500 }}>Draft application with Ash</div>
                <div style={{ fontSize:10, color:"var(--color-grey)", marginTop:1 }}>Write a statement, proposal, or cover letter</div>
              </div>
            </button>
            <button style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, border:"0.5px solid var(--color-border)", background:"var(--color-cream)", cursor:"pointer", fontSize:12, color:"var(--color-charcoal)", fontFamily:"inherit", textAlign:"left" }}>
              <span style={{ color:"var(--color-grey)", flexShrink:0 }}><IcImgSm /></span>
              <div>
                <div style={{ fontWeight:500 }}>Attach work samples</div>
                <div style={{ fontSize:10, color:"var(--color-grey)", marginTop:1 }}>Link images from your projects</div>
              </div>
            </button>
          </div>
        </div>

        {/* Status */}
        <div>
          <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--color-grey)", marginBottom:8 }}>My status</div>
          <div className="flex flex-wrap gap-2">
            {(["saved","attending","exhibiting","applied"] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, cursor:"pointer", border:`0.5px solid ${opp.user_status===s?dark:"rgba(31,33,26,0.13)"}`, background:opp.user_status===s?light:"transparent", color:opp.user_status===s?dark:"var(--color-grey)", fontFamily:"inherit", textTransform:"capitalize" }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop:"0.5px solid var(--color-border)", padding:"12px 16px" }}>
        <button
          onClick={handleDismiss}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:6, border:"0.5px solid rgba(31,33,26,0.13)", background:"transparent", color:"var(--color-grey)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
        >
          <IcEyeOff /> Not interested — hide from feed
        </button>
      </div>
    </div>
  );
}

function OpportunitiesTab({ opps: initialOpps }: { opps: Opportunity[] }) {
  const [filter, setFilter]       = useState<OppFilter>("all");
  const [view, setView]           = useState<OppView>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [localOpps, setLocalOpps] = useState<Opportunity[]>(initialOpps);

  const opps = localOpps;
  const dismiss = (id: string) => { setDismissed(prev => new Set([...prev, id])); setLocalOpps(prev => prev.filter(o => o.id !== id)); };
  function handleStatusChange(id: string, status: string | null) {
    setLocalOpps(prev => prev.map(o => o.id === id ? { ...o, user_status: status } : o));
  }

  const FILTERS: { key: OppFilter; label: string }[] = [
    { key:"all",       label:"All" },
    { key:"fair",      label:"Fairs & Shows" },
    { key:"openCall",  label:"Open Calls" },
    { key:"award",     label:"Awards" },
    { key:"grant",     label:"Grants" },
    { key:"residency", label:"Residencies" },
  ];

  const visible  = useMemo(() => opps.filter(o => !dismissed.has(o.id)), [opps, dismissed]);
  const filtered = visible.filter(o => filter === "all" || o.category === filter);
  const actSoon  = filtered.filter(o => oppSection(o) === "actSoon");
  const upcoming = filtered.filter(o => oppSection(o) === "upcoming");
  const later    = filtered.filter(o => oppSection(o) === "later");
  const ongoing  = filtered.filter(o => oppSection(o) === "ongoing");

  const selectedOpp = selectedId ? visible.find(o => o.id === selectedId) ?? null : null;

  const SectionHead = ({ label, count, color }: { label: string; count: number; color: string }) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 0 8px 12px", borderLeft:`4px solid ${color}`, marginBottom:4 }}>
      <span style={{ fontSize:12, fontWeight:700, color }}>{label}</span>
      <span className="rounded-full" style={{ fontSize:10, fontWeight:600, padding:"2px 8px", background:color+"18", color }}>{count}</span>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Filter bar */}
      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"10px 24px", background:"var(--color-off-white)", borderBottom:"0.5px solid var(--color-border)", flexShrink:0 }}>
        <div className="flex items-center gap-2 shrink-0">
          <span style={{ fontSize:11, color:"var(--color-grey)", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600 }}>Perennial Feed</span>
          <div title="Curated opportunities for designers" style={{ width:14, height:14, borderRadius:"50%", border:"0.5px solid rgba(31,33,26,0.13)", fontSize:9, color:"var(--color-grey)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"help" }}>i</div>
        </div>
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding:"4px 11px", borderRadius:20, fontSize:11, cursor:"pointer", border:`0.5px solid ${filter===f.key?"var(--color-charcoal)":"rgba(31,33,26,0.13)"}`, background:filter===f.key?"var(--color-charcoal)":"transparent", color:filter===f.key?"var(--color-off-white)":"var(--color-grey)", fontFamily:"inherit", whiteSpace:"nowrap" }}>{f.label}</button>
          ))}
        </div>
        {/* View toggle */}
        <div className="flex shrink-0" style={{ background:"var(--color-cream)", border:"0.5px solid var(--color-border)", borderRadius:6 }}>
          {(["list","calendar"] as OppView[]).map((v,i) => (
            <button key={v} onClick={() => setView(v)} title={v === "list" ? "List view" : "Calendar view"} style={{ padding:"4px 10px", background:view===v?"var(--color-off-white)":"transparent", border:view===v?"0.5px solid rgba(31,33,26,0.13)":"none", borderRadius:5, color:view===v?"var(--color-charcoal)":"var(--color-grey)", cursor:"pointer", display:"flex", alignItems:"center", boxShadow:view===v?"0 1px 3px rgba(0,0,0,0.06)":"none", borderRight:i===0?"0.5px solid var(--color-border)":undefined }}>
              {v === "list" ? <IcList /> : <IcCalSm />}
            </button>
          ))}
        </div>
      </div>

      {/* List view */}
      {view === "list" && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto" style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:20 }}>
            {actSoon.length > 0 && (
              <div>
                <SectionHead label="Act soon" count={actSoon.length} color={C.red} />
                {actSoon.map(o => <OppRow key={o.id} opp={o} onClick={() => setSelectedId(o.id === selectedId ? null : o.id)} selected={o.id === selectedId} />)}
              </div>
            )}
            {upcoming.length > 0 && (
              <div>
                <SectionHead label="Upcoming" count={upcoming.length} color={C.accent} />
                {upcoming.map(o => <OppRow key={o.id} opp={o} onClick={() => setSelectedId(o.id === selectedId ? null : o.id)} selected={o.id === selectedId} />)}
              </div>
            )}
            {later.length > 0 && (
              <div>
                <SectionHead label="Later this year" count={later.length} color="var(--color-grey)" />
                {later.map(o => <OppRow key={o.id} opp={o} onClick={() => setSelectedId(o.id === selectedId ? null : o.id)} selected={o.id === selectedId} />)}
              </div>
            )}
            {ongoing.length > 0 && (
              <div>
                <SectionHead label="Ongoing" count={ongoing.length} color={C.blue} />
                <p style={{ fontSize:11, color:"var(--color-grey)", margin:"0 0 8px 16px" }}>Year-round programs — apply anytime</p>
                {ongoing.map(o => <OppRow key={o.id} opp={o} onClick={() => setSelectedId(o.id === selectedId ? null : o.id)} selected={o.id === selectedId} />)}
              </div>
            )}
            {filtered.length === 0 && localOpps.length === 0 && (
              <div style={{ padding: "40px 24px", textAlign: "center", maxWidth: 440, margin: "0 auto" }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>🗓</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-charcoal)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
                  Opportunities feed is loading
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.7, color: "var(--color-grey)", marginBottom: 20 }}>
                  Perennial curates upcoming art fairs, open calls, grants, residencies, and awards for independent designers. The feed is populated by the Perennial team and updates regularly.
                </p>
                <button
                  onClick={() => openAsh("What opportunities — art fairs, open calls, grants, residencies — should I be aware of as an independent designer right now?")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", fontSize: 12, fontWeight: 500, borderRadius: 8, background: "rgba(155,163,122,0.1)", color: "#5a7040", border: "0.5px solid rgba(155,163,122,0.3)", cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(155,163,122,0.18)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(155,163,122,0.1)")}
                >
                  Ask Ash about opportunities →
                </button>
              </div>
            )}
            {filtered.length === 0 && localOpps.length > 0 && (
              <div className="flex-1 flex items-center justify-center" style={{ color:"var(--color-grey)", fontSize:13 }}>No opportunities match this filter.</div>
            )}
          </div>
          {selectedOpp && (
            <OppDetail opp={selectedOpp} onClose={() => setSelectedId(null)} onDismiss={dismiss} onStatusChange={handleStatusChange} />
          )}
        </div>
      )}

      {/* Calendar view */}
      {view === "calendar" && <MonthCalendar opps={filter === "all" ? visible : visible.filter(o => o.category === filter)} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
const TABS: { key: Tab; label: string }[] = [
  { key:"overview",      label:"Overview" },
  { key:"website",       label:"Website" },
  { key:"socials",       label:"Socials" },
  { key:"newsletter",    label:"Newsletter" },
  { key:"opportunities", label:"Opportunities" },
];

const TAB_ACTIONS: Record<Tab, React.ReactNode> = {
  overview:      <><BtnGhost>Connect account</BtnGhost><BtnPrimary>+ New post</BtnPrimary></>,
  website:       <BtnGhost>View site ↗</BtnGhost>,
  socials:       <><BtnGhost>Schedule</BtnGhost><BtnPrimary>+ New post</BtnPrimary></>,
  newsletter:    <><BtnGhost>View on Substack ↗</BtnGhost><BtnPrimary>+ New campaign</BtnPrimary></>,
  opportunities: <><BtnGhost>Sync calendar</BtnGhost><BtnPrimary>+ Add opportunity</BtnPrimary></>,
};

export default function PresenceClient({ initialOpportunities }: { initialOpportunities: Opportunity[] }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [connectModal, setConnectModal] = useState<ConnectProvider | null>(null);

  const now = new Date();
  const period = now.toLocaleString("en-US", { month:"short", year:"numeric" });

  const upcomingOpps = useMemo(() =>
    initialOpportunities.filter(o => oppSection(o) !== null),
    [initialOpportunities]
  );

  // Load connected integrations on mount
  useEffect(() => {
    createClient()
      .from("integrations")
      .select("id, provider, account_name, metadata, connected_at, last_synced_at")
      .then(({ data }) => setIntegrations((data ?? []) as Integration[]));
  }, []);

  function getInt(provider: string): Integration | null {
    return integrations.find(i => i.provider === provider) ?? null;
  }

  function handleIntegrationConnected(integration: Integration) {
    setIntegrations(prev => [...prev.filter(i => i.provider !== integration.provider), integration]);
  }

  async function disconnectIntegration(provider: string) {
    await fetch(`/api/integrations/connect?provider=${provider}`, { method: "DELETE" });
    setIntegrations(prev => prev.filter(i => i.provider !== provider));
  }

  const instagram  = getInt("instagram");
  const plausible  = getInt("ga4");
  const newsletter = (["beehiiv","kit","mailchimp","substack"] as const)
    .map(p => getInt(p)).find(Boolean) ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-stretch shrink-0" style={{ height:44, borderBottom:"0.5px solid rgba(31,33,26,0.18)", background:"var(--color-off-white)" }}>
        <div className="flex items-center gap-3 shrink-0" style={{ padding:"0 20px", borderRight:"0.5px solid rgba(31,33,26,0.13)" }}>
          <span style={{ fontSize:14, fontWeight:650, color:"var(--color-charcoal)" }}>Presence</span>
          <span style={{ fontSize:11, color:"var(--color-grey)" }}>{period}</span>
        </div>
        <div className="flex items-stretch flex-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:"0 18px", fontSize:12, color:tab===t.key?"var(--color-charcoal)":"var(--color-grey)", cursor:"pointer", borderBottom:tab===t.key?"2px solid var(--color-sage)":"2px solid transparent", borderRight:"0.5px solid rgba(31,33,26,0.07)", borderTop:"none", borderLeft:"none", background:"transparent", fontWeight:tab===t.key?600:400, whiteSpace:"nowrap", fontFamily:"inherit" }}>{t.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0" style={{ padding:"0 16px" }}>{TAB_ACTIONS[tab]}</div>
      </header>

      {tab === "overview"      && (
        <OverviewTab
          onTabChange={setTab}
          opps={upcomingOpps}
          instagram={instagram}
          plausible={plausible}
          newsletter={newsletter}
          onConnect={setConnectModal}
        />
      )}
      {tab === "website"       && (
        <WebsiteTab
          integration={plausible}
          onConnect={() => window.location.href = "/api/auth/google-analytics"}
          onDisconnect={() => disconnectIntegration("ga4")}
        />
      )}
      {tab === "socials"       && (
        <SocialsTab
          instagram={instagram}
          onConnect={() => window.location.href = "/api/auth/instagram"}
          onDisconnect={() => disconnectIntegration("instagram")}
        />
      )}
      {tab === "newsletter"    && (
        <NewsletterTab
          integration={newsletter}
          onConnect={setConnectModal}
          onDisconnect={(p) => disconnectIntegration(p)}
        />
      )}
      {tab === "opportunities" && <OpportunitiesTab opps={upcomingOpps} />}

      {connectModal && (
        <ConnectIntegrationModal
          provider={connectModal}
          onClose={() => setConnectModal(null)}
          onConnected={handleIntegrationConnected}
        />
      )}
    </div>
  );
}
