"use client";

import { useState, useMemo } from "react";
import type { Opportunity } from "@/types/database";

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
const cardHeadTitle: React.CSSProperties = { fontSize: 12, fontWeight: 650, flex: 1, color: "var(--color-charcoal)" };
const blueLink: React.CSSProperties = { fontSize: 11, color: C.blue, cursor: "pointer" };

function card(cn = "") { return `rounded-xl overflow-hidden ${cn}`; }

function StatCard({ label, value, sub, subUp = false, detail, helpText, askAsh, onClick, badge, badgeWarn }: {
  label: string; value: string; sub: string; subUp?: boolean; detail?: string;
  helpText?: string; askAsh?: boolean; onClick?: () => void; badge?: string; badgeWarn?: boolean;
}) {
  return (
    <div onClick={onClick} className="flex flex-col gap-1 rounded-xl p-4 flex-1 shrink-0" style={{ ...cardStyle, cursor: onClick ? "pointer" : "default" }}>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: 10, color: "var(--color-grey)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>{label}</span>
        {badge && <span className="rounded-full" style={{ fontSize: 9, padding: "1px 6px", fontWeight: 600, background: badgeWarn ? C.amberL : C.accentL, color: badgeWarn ? C.amber : C.accent }}>{badge}</span>}
        {helpText && <div title={helpText} className="flex items-center justify-center rounded-full shrink-0" style={{ width: 14, height: 14, background: "var(--color-cream)", border: "0.5px solid rgba(31,33,26,0.13)", color: "var(--color-grey)", fontSize: 9, fontWeight: 700, cursor: "help" }}>?</div>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: subUp ? C.accent : "var(--color-grey)" }}>{sub}</div>
      {detail && <><hr style={{ border: "none", borderTop: "0.5px solid var(--color-border)", margin: "4px 0" }} /><div style={{ fontSize: 11, color: "var(--color-grey)" }}>{detail}</div></>}
      {askAsh && <button className="text-left mt-1" style={{ fontSize: 10, color: C.accent, background: "none", border: "none", padding: 0, cursor: "pointer" }}>Ask Ash how to improve →</button>}
    </div>
  );
}

function AshCard({ text, buttonLabel = "Draft with Ash" }: { text: string; buttonLabel?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: C.accentL, border: `0.5px solid rgba(61,107,79,0.18)` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 22, height: 22, background: C.accent }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M12 22c0 0-6-4-6-10a6 6 0 0 1 12 0c0 6-6 10-6 10z"/><path d="M12 12c-2-1.5-3-3-2-5"/><path d="M12 12c2-1.5 3-3 2-5"/></svg>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>Ash</span>
      </div>
      <p style={{ fontSize: 11, color: C.accent, lineHeight: 1.5, marginBottom: 10 }}>{text}</p>
      <button className="rounded" style={{ background: C.accent, color: "white", border: "none", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>{buttonLabel}</button>
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
function BtnPrimary({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return <button style={{ background:"var(--color-charcoal)", color:"var(--color-off-white)", border:"none", borderRadius:6, padding:small?"3px 8px":"5px 11px", fontSize:small?10:11, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>;
}
function BtnAccent({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return <button style={{ background:C.accent, color:"white", border:"none", borderRadius:6, padding:small?"3px 8px":"5px 11px", fontSize:small?10:11, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}>{children}</button>;
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
function OverviewTab({ onTabChange, opps }: { onTabChange: (t: Tab) => void; opps: Opportunity[] }) {
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
        <StatCard label="Website"       value="1,240" sub="↑ 18% vs March" subUp detail="Top referral: Sight Unseen feature" badge="Connected" helpText="How many times your site was loaded." askAsh onClick={() => onTabChange("website")} />
        <StatCard label="Socials"       value="8,400" sub="↑ 940 followers this month" subUp detail="4.2% engagement · 6 posts in Apr" badge="Connected" helpText="Your follower count and engagement rate." askAsh onClick={() => onTabChange("socials")} />
        <StatCard label="Newsletter"    value="47%"   sub="Open rate · last send Apr 9" subUp detail="312 subscribers · +14 this month" badge="Connected" helpText="What percentage of subscribers opened your most recent email." askAsh onClick={() => onTabChange("newsletter")} />
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
function WebsiteTab() {
  const bars = [18,22,15,25,30,340,28,20,18,24,22,26,20,18,22,24,20,25,28,22,19];
  const maxH = Math.max(...bars);
  return (
    <div className="flex-1 overflow-y-auto" style={{ display:"flex", flexDirection:"column" }}>
      <div style={{ background:"var(--color-off-white)", borderBottom:"0.5px solid var(--color-border)", padding:"10px 24px", display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:C.accent }} />
          <span style={{ fontWeight:600 }}>perennial.design</span>
          <span style={{ color:"var(--color-grey)" }}>Squarespace</span>
        </div>
        <span style={{ color:"var(--color-grey)" }}>Connected</span>
        <span style={blueLink}>Manage ↗</span>
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
          <StatCard label="Visits"          value="1,240" sub="↑ 18% vs March" subUp detail="This month so far" helpText="How many times your site was loaded." askAsh />
          <StatCard label="Unique visitors" value="840"   sub="↑ 12% vs March" subUp detail="Different people visiting" helpText="Unique browsers that landed on your site." askAsh />
          <StatCard label="Avg session"     value="2:34"  sub="↓ 8% vs March"              detail="Time spent per visit" helpText="Longer sessions suggest people are exploring your work." askAsh />
          <StatCard label="Bounce rate"     value="58%"   sub="vs 62% March" subUp          detail="Lower is generally better" helpText="Visitors who left after one page. Under 60% is solid for a portfolio site." askAsh />
        </div>
        <div style={{ display:"flex", gap:16, flex:1, minHeight:0 }}>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:12, minWidth:0 }}>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Daily traffic · Apr 2026</span><span style={{ fontSize:10, color:"var(--color-grey)" }}>1,240 total</span></div>
              <div style={{ padding:15, borderBottom:"0.5px solid var(--color-border)" }}>
                <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:80, marginBottom:4 }}>
                  {bars.map((h,i) => <div key={i} style={{ flex:1, minWidth:0, background:h===maxH?C.blue:C.blueL, borderRadius:"4px 4px 0 0", height:`${(h/maxH)*100}%` }} />)}
                </div>
                <div style={{ fontSize:10, color:"var(--color-grey)", textAlign:"right" }}>Apr 7 spike: 340 visits (Sight Unseen feature)</div>
              </div>
            </div>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Top pages</span></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 72px 72px 44px", gap:12, padding:"8px 15px", borderBottom:"0.5px solid var(--color-border)", fontSize:10, color:"var(--color-grey)", textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600 }}><span>Page</span><span>Views</span><span>Avg time</span><span></span></div>
              {[
                { name:"Home",         path:"/",                    views:"412", time:"1:48", change:"+22%", up:true,  spike:false },
                { name:"Brass series", path:"/work/brass-series",   views:"318", time:"3:12", change:"Spike ↑", up:false, spike:true },
                { name:"Walnut slab",  path:"/work/walnut-slab",    views:"201", time:"2:55", change:"+8%",  up:true,  spike:false },
                { name:"Contact",      path:"/contact",              views:"138", time:"0:52", change:"",     up:false, spike:false },
                { name:"About",        path:"/about",                views:"104", time:"2:10", change:"-3%",  up:false, spike:false },
              ].map(p => (
                <div key={p.path} style={{ display:"grid", gridTemplateColumns:"1fr 72px 72px 44px", gap:12, padding:"9px 15px", borderBottom:"0.5px solid var(--color-border)", cursor:"pointer", alignItems:"center" }}>
                  <div><div style={{ fontSize:12, fontWeight:600 }}>{p.name}</div><div style={{ fontSize:10, color:"var(--color-grey)" }}>{p.path}</div></div>
                  <span style={{ fontSize:12 }}>{p.views}</span>
                  <span style={{ fontSize:11, color:"var(--color-grey)" }}>{p.time}</span>
                  <span style={{ fontSize:11, textAlign:"right", color:p.spike?C.red:p.up?C.accent:"var(--color-grey)", fontWeight:p.spike?600:400 }}>{p.change}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", gap:12 }}>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Traffic sources</span></div>
              {[{label:"Organic search",pct:42,color:C.blue},{label:"Social",pct:28,color:C.purple},{label:"Direct",pct:18,color:C.accent},{label:"Referral",pct:12,color:C.amber}].map(s => (
                <div key={s.label} style={{ display:"grid", gridTemplateColumns:"88px 1fr 40px", gap:12, alignItems:"center", padding:"11px 15px", borderBottom:"0.5px solid var(--color-border)" }}>
                  <span style={{ fontSize:11, fontWeight:600, color:"var(--color-grey)" }}>{s.label}</span>
                  <div style={{ height:5, background:"var(--color-cream)", borderRadius:2, overflow:"hidden" }}><div style={{ height:"100%", borderRadius:2, background:s.color, width:`${s.pct}%` }} /></div>
                  <span style={{ fontSize:12, fontWeight:600, textAlign:"right" }}>{s.pct}%</span>
                </div>
              ))}
            </div>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Top referrers</span></div>
              {[{domain:"sightunseen.com",count:"286",spike:true},{domain:"google.com",count:"118",spike:false},{domain:"instagram.com/l/",count:"84",spike:false},{domain:"newsletter",count:"42",spike:false}].map(r => (
                <div key={r.domain} className="flex items-center gap-3" style={{ padding:"11px 15px", borderBottom:"0.5px solid var(--color-border)", cursor:"pointer" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--color-cream)", flexShrink:0 }} />
                  <span style={{ fontSize:11, flex:1 }}>{r.domain}</span>
                  {r.spike && <span className="rounded-full" style={{ fontSize:9, fontWeight:600, textTransform:"uppercase", padding:"2px 7px", background:C.redL, color:C.red }}>Spike</span>}
                  <span style={{ fontSize:11, color:"var(--color-grey)", flexShrink:0 }}>{r.count}</span>
                </div>
              ))}
            </div>
            <div className={card()} style={cardStyle}>
              <div style={cardHeadStyle}><span style={cardHeadTitle}>Shop</span></div>
              {[{label:"Revenue this month",value:"$1,280"},{label:"Orders",value:"4"},{label:"Avg order value",value:"$320"}].map(s => (
                <div key={s.label} style={{ display:"grid", gridTemplateColumns:"1fr 60px", gap:12, padding:"11px 15px", borderBottom:"0.5px solid var(--color-border)", alignItems:"center" }}>
                  <span style={{ fontSize:11, color:"var(--color-grey)" }}>{s.label}</span>
                  <span style={{ fontSize:12, fontWeight:600, textAlign:"right" }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOCIALS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function SocialsTab() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ display:"flex", flexDirection:"column" }}>
      <div style={{ display:"flex", gap:8, padding:"12px 24px", borderBottom:"0.5px solid var(--color-border)", flexWrap:"wrap", alignItems:"center", background:"var(--color-off-white)" }}>
        <div className="flex items-center gap-2 rounded-full" style={{ padding:"7px 12px", border:`0.5px solid ${C.accent}`, background:C.accentL, cursor:"pointer" }}>
          <div className="flex items-center justify-center rounded-md" style={{ width:18, height:18, background:C.purpleL }}><span style={{ color:C.purple }}><IcIG /></span></div>
          <div><div style={{ fontSize:11, fontWeight:600 }}>@perennial.design</div><div style={{ fontSize:10, color:"var(--color-grey)" }}>4,820 followers</div></div>
          <div style={{ width:6, height:6, borderRadius:"50%", background:C.accent }} />
        </div>
        {["TikTok","Facebook","LinkedIn","YouTube"].map(p => (
          <div key={p} className="flex items-center gap-2 rounded-full" style={{ padding:"7px 12px", border:"0.5px solid rgba(31,33,26,0.13)", background:"var(--color-cream)", cursor:"default", opacity:0.65 }}>
            <span style={{ fontSize:11, fontWeight:600, color:"var(--color-grey)" }}>{p}</span>
            <span style={{ fontSize:10, color:"var(--color-grey)" }}>Not connected</span>
          </div>
        ))}
        <div className="flex items-center gap-1 rounded-full ml-auto" style={{ padding:"5px 10px", border:`0.5px dashed ${C.accent}`, color:C.accent, cursor:"pointer", fontSize:11 }}>+ Connect</div>
      </div>
      <div style={{ display:"flex", gap:4, padding:"10px 24px", borderBottom:"0.5px solid var(--color-border)", background:"var(--color-off-white)" }}>
        <div style={{ padding:"5px 12px", borderRadius:"10px 10px 0 0", border:`0.5px solid ${C.accent}`, borderBottom:`2px solid ${C.accent}`, fontSize:11, color:C.accent, fontWeight:500, cursor:"pointer" }}>Instagram</div>
        {["TikTok","Facebook","LinkedIn","YouTube"].map(p => (
          <div key={p} title="Connect to view" style={{ padding:"5px 12px", borderRadius:10, border:"0.5px solid rgba(31,33,26,0.1)", fontSize:11, color:"var(--color-grey)", cursor:"not-allowed", opacity:0.5 }}>{p}</div>
        ))}
      </div>
      <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:18, flex:1 }}>
        <div style={{ display:"flex", gap:12 }}>
          <StatCard label="Followers"  value="4,820" sub="↑ 940 this month" subUp detail="@perennial.design · Instagram" helpText="Total people following you." askAsh />
          <StatCard label="Reach"      value="8,400" sub="Accounts reached · Apr" detail="↑ 22% vs March" helpText="How many accounts saw at least one of your posts." askAsh />
          <StatCard label="Engagement" value="4.2%"  sub="Avg per post · Apr" subUp detail="Industry avg: 1.8%" helpText="Likes + comments as a percentage of reach." askAsh />
          <StatCard label="Posts"      value="6"     sub="Published in Apr" detail="Next scheduled: Apr 18" helpText="How many times you published this month." askAsh />
        </div>
        <div style={{ display:"flex", gap:16, flex:1, minHeight:0 }}>
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
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEWSLETTER TAB
// ═══════════════════════════════════════════════════════════════════════════════
function NewsletterTab() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ display:"flex", flexDirection:"column" }}>
      <div style={{ background:"var(--color-off-white)", borderBottom:"0.5px solid var(--color-border)", padding:"10px 24px", display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
        <div className="flex items-center justify-center rounded-md" style={{ width:18, height:18, background:C.amberL, color:C.amber }}><IcMail /></div>
        <span style={{ fontWeight:600 }}>Perennial Notes</span>
        <span style={{ color:"var(--color-grey)" }}>Substack</span>
        <div className="flex items-center gap-2" style={{ marginLeft:"auto", color:C.accent, fontSize:11 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:C.accent }} />
          <span>Connected</span>
        </div>
        <span style={blueLink}>Open Substack ↗</span>
      </div>
      <div style={{ padding:"22px 24px", display:"flex", flexDirection:"column", gap:18, flex:1 }}>
        <div style={{ display:"flex", gap:12 }}>
          <StatCard label="Subscribers"     value="312"  sub="↑ 14 this month" subUp detail="Total active subscribers" helpText="Your owned channel." askAsh />
          <StatCard label="Avg open rate"   value="44%"  sub="Industry avg: 21%" subUp detail="Last send: 47%" helpText="Percentage who opened your email. Above 30% is strong." askAsh />
          <StatCard label="Avg click rate"  value="3.0%" sub="Industry avg: 2.6%" subUp detail="Last send: 3.1%" helpText="Percentage who clicked a link inside the email." askAsh />
          <StatCard label="Sends this year" value="8"    sub="Last sent Apr 9" detail="Approx every 2 weeks" helpText="How many newsletters you've sent." askAsh />
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
function OppDetail({ opp, onClose, onDismiss }: { opp: Opportunity; onClose: () => void; onDismiss: (id: string) => void }) {
  const start = parseDate(opp.start_date);
  const end   = parseDate(opp.end_date);
  const { dark, light } = catColor(opp.category);

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
            <button style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, border:"0.5px solid var(--color-border)", background:"var(--color-cream)", cursor:"pointer", fontSize:12, color:"var(--color-charcoal)", fontFamily:"inherit", textAlign:"left" }}>
              <span style={{ color:C.accent, flexShrink:0 }}><IcFileSm /></span>
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
              <button key={s} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, cursor:"pointer", border:`0.5px solid ${opp.user_status===s?dark:"rgba(31,33,26,0.13)"}`, background:opp.user_status===s?light:"transparent", color:opp.user_status===s?dark:"var(--color-grey)", fontFamily:"inherit", textTransform:"capitalize" }}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop:"0.5px solid var(--color-border)", padding:"12px 16px" }}>
        <button
          onClick={() => { onDismiss(opp.id); onClose(); }}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:6, border:"0.5px solid rgba(31,33,26,0.13)", background:"transparent", color:"var(--color-grey)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}
        >
          <IcEyeOff /> Not interested — hide from feed
        </button>
      </div>
    </div>
  );
}

function OpportunitiesTab({ opps }: { opps: Opportunity[] }) {
  const [filter, setFilter]       = useState<OppFilter>("all");
  const [view, setView]           = useState<OppView>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]));

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
            {filtered.length === 0 && (
              <div className="flex-1 flex items-center justify-center" style={{ color:"var(--color-grey)", fontSize:13 }}>No opportunities match this filter.</div>
            )}
          </div>
          {selectedOpp && (
            <OppDetail opp={selectedOpp} onClose={() => setSelectedId(null)} onDismiss={dismiss} />
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

  const now = new Date();
  const period = now.toLocaleString("en-US", { month:"short", year:"numeric" });

  const upcomingOpps = useMemo(() =>
    initialOpportunities.filter(o => oppSection(o) !== null),
    [initialOpportunities]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="flex items-stretch shrink-0" style={{ height:44, borderBottom:"0.5px solid rgba(31,33,26,0.18)", background:"var(--color-off-white)" }}>
        <div className="flex items-center gap-3 shrink-0" style={{ padding:"0 20px", borderRight:"0.5px solid rgba(31,33,26,0.13)" }}>
          <span style={{ fontSize:14, fontWeight:650, color:"var(--color-charcoal)" }}>Presence</span>
          <span style={{ fontSize:11, color:"var(--color-grey)" }}>{period}</span>
        </div>
        <div className="flex items-stretch flex-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:"0 18px", fontSize:12, color:tab===t.key?"var(--color-charcoal)":"var(--color-grey)", cursor:"pointer", borderBottom:tab===t.key?"1.5px solid var(--color-charcoal)":"1.5px solid transparent", borderRight:"0.5px solid rgba(31,33,26,0.07)", borderTop:"none", borderLeft:"none", background:"transparent", fontWeight:tab===t.key?600:400, whiteSpace:"nowrap", fontFamily:"inherit" }}>{t.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0" style={{ padding:"0 16px" }}>{TAB_ACTIONS[tab]}</div>
      </header>

      {tab === "overview"      && <OverviewTab onTabChange={setTab} opps={upcomingOpps} />}
      {tab === "website"       && <WebsiteTab />}
      {tab === "socials"       && <SocialsTab />}
      {tab === "newsletter"    && <NewsletterTab />}
      {tab === "opportunities" && <OpportunitiesTab opps={upcomingOpps} />}
    </div>
  );
}
