"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";
const TOTAL_STEPS = 6;

const PRACTICE_OPTIONS = [
  "Furniture", "Objects & lighting", "Ceramics & glass", "Textiles",
  "Jewelry", "Painting", "Sculpture", "Printmaking", "Client-based work",
];

const WORK_TYPE_OPTIONS = [
  { id: "editions",    label: "Studio editions",         sub: "Small-batch objects, multiples, or prints" },
  { id: "bespoke",     label: "Bespoke commissions",      sub: "One-off pieces made to client specification" },
  { id: "client_work", label: "Client-based design work", sub: "Fees, retainers, or project-based client engagements" },
  { id: "wholesale",   label: "Wholesale / retail",       sub: "Selling through stockists, shops, or platforms" },
];

const CHANNEL_OPTIONS = [
  { id: "gallery",    label: "Gallery representation", sub: "Consignment or representation deals" },
  { id: "direct",     label: "Direct to collectors",   sub: "Studio sales, Instagram, newsletter, word of mouth" },
  { id: "fairs",      label: "Design fairs",           sub: "ICFF, Sight Unseen, PAD, Design Miami, etc." },
  { id: "trade",      label: "Trade clients",          sub: "Interior designers, hospitality, developers" },
  { id: "ecommerce",  label: "E-commerce",             sub: "Own website, 1stDibs, etc." },
  { id: "commissions",label: "Public / corporate commissions", sub: "Institutional or architectural projects" },
];

const PRICE_OPTIONS = [
  { id: "sub500",       label: "Under $500" },
  { id: "500_2k",       label: "$500 – $2,000" },
  { id: "2k_10k",       label: "$2,000 – $10,000" },
  { id: "10k_50k",      label: "$10,000 – $50,000" },
  { id: "over50k",      label: "$50,000+" },
];

const YEARS_OPTIONS = [
  { id: "starting",    label: "Just getting started", sub: "Under 1 year" },
  { id: "finding",     label: "Finding my footing",   sub: "1–3 years" },
  { id: "building",    label: "Building momentum",    sub: "3–7 years" },
  { id: "established", label: "Established practice", sub: "7+ years" },
];

const CHALLENGE_OPTIONS = [
  "Getting paid on time",
  "Finding new collectors or clients",
  "Pricing my work correctly",
  "Gallery representation",
  "Staying organized across projects",
  "Press and visibility",
  "Tracking time and profitability",
  "Managing client expectations",
];

const GOAL_OPTIONS = [
  { id: "projects",   label: "Track projects and deadlines",         icon: "🗂" },
  { id: "invoicing",  label: "Send professional invoices",           icon: "🧾" },
  { id: "time",       label: "Log time and understand profitability", icon: "⏱" },
  { id: "contacts",   label: "Build and maintain relationships",      icon: "👥" },
  { id: "outreach",   label: "Stay on top of gallery outreach",       icon: "📬" },
  { id: "presence",   label: "Track opportunities and visibility",    icon: "🌐" },
  { id: "ash",        label: "Use AI to think through decisions",     icon: "✦" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface OnboardingData {
  studioName:         string;
  city:               string;
  website:            string;
  practiceTypes:      string[];
  workTypes:          string[];
  sellingChannels:    string[];
  priceRange:         string;
  yearsInPractice:    string;
  challenges:         string[];
  goals:              string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Chip({
  selected, onClick, children, sub,
}: { selected: boolean; onClick: () => void; children: React.ReactNode; sub?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: sub ? "10px 14px" : "7px 14px",
        borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.1s ease", textAlign: "left",
        background: selected ? "var(--color-charcoal)" : "var(--color-off-white)",
        color:      selected ? "var(--color-warm-white)" : "#6b6860",
        border:     `0.5px solid ${selected ? "var(--color-charcoal)" : "var(--color-border)"}`,
        display: "flex", flexDirection: "column", gap: 2,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 500 }}>{children}</span>
      {sub && <span style={{ fontSize: 10, opacity: selected ? 0.7 : 0.8 }}>{sub}</span>}
    </button>
  );
}

function SingleChip({
  selected, onClick, children, sub,
}: { selected: boolean; onClick: () => void; children: React.ReactNode; sub?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: sub ? "10px 14px" : "7px 14px",
        borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.1s ease", textAlign: "left",
        background: selected ? "var(--color-charcoal)" : "var(--color-off-white)",
        color:      selected ? "var(--color-warm-white)" : "#6b6860",
        border:     `0.5px solid ${selected ? "var(--color-charcoal)" : "var(--color-border)"}`,
        display: "flex", flexDirection: "column", gap: 2,
        position: "relative",
      }}
    >
      {selected && (
        <span style={{ position: "absolute", top: 8, right: 10, fontSize: 10, opacity: 0.7 }}>✓</span>
      )}
      <span style={{ fontSize: 12, fontWeight: 500 }}>{children}</span>
      {sub && <span style={{ fontSize: 10, opacity: selected ? 0.7 : 0.8 }}>{sub}</span>}
    </button>
  );
}

function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 3, borderRadius: 99,
            width: i < current ? 24 : 8,
            background: i < current ? "var(--color-charcoal)" : "var(--color-border)",
            transition: "all 0.2s ease",
          }}
        />
      ))}
      <span style={{ fontSize: 10, color: "var(--color-grey)", marginLeft: 4 }}>
        {current} of {total}
      </span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--color-grey)", marginBottom: 8 }}>
      {children}
    </p>
  );
}

function TextInput({
  value, onChange, placeholder, type = "text",
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "9px 13px", fontSize: 13,
        background: "var(--color-off-white)",
        border: "0.5px solid var(--color-border)", borderRadius: 9,
        color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
        boxSizing: "border-box" as const,
      }}
      onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
      onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
    />
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function OnboardingModal() {
  const [show,   setShow]  = useState(false);
  const [step,   setStep]  = useState<Step>(1);
  const [saving, setSaving]= useState(false);
  const [userId, setUserId]= useState<string | null>(null);

  const [data, setData] = useState<OnboardingData>({
    studioName: "", city: "", website: "",
    practiceTypes: [], workTypes: [], sellingChannels: [],
    priceRange: "", yearsInPractice: "", challenges: [], goals: [],
  });

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (localStorage.getItem("perennial-onboarded")) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: authData }) => {
      if (!authData.user) return;
      setUserId(authData.user.id);
      const { data: prof } = await supabase
        .from("profiles")
        .select("onboarding_complete, studio_name")
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (prof?.onboarding_complete) {
        localStorage.setItem("perennial-onboarded", "1");
      } else {
        setShow(true);
      }
    });
  }, []);

  useEffect(() => {
    if (show) setTimeout(() => firstInputRef.current?.focus(), 150);
  }, [show, step]);

  function toggle<K extends keyof OnboardingData>(key: K, value: string) {
    setData(d => {
      const arr = d[key] as string[];
      return { ...d, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData(d => ({ ...d, [key]: value }));
  }

  function buildAshOpeningMessage(): string {
    const parts: string[] = [];
    if (data.studioName) parts.push(`I just set up ${data.studioName} in Perennial.`);
    else parts.push("I just signed up for Perennial.");

    if (data.practiceTypes.length > 0) parts.push(`I work in ${data.practiceTypes.join(", ").toLowerCase()}.`);
    if (data.workTypes.length > 0) {
      const wt = data.workTypes.map(w => ({ editions: "studio editions", bespoke: "bespoke commissions", client_work: "client-based design work", wholesale: "wholesale/retail" }[w] ?? w));
      parts.push(`My work includes ${wt.join(" and ")}.`);
    }
    if (data.sellingChannels.length > 0) {
      const ch = data.sellingChannels.map(c => ({ gallery: "gallery representation", direct: "direct to collectors", fairs: "design fairs", trade: "trade clients", ecommerce: "e-commerce", commissions: "public commissions" }[c] ?? c));
      parts.push(`I sell through ${ch.join(", ")}.`);
    }
    if (data.yearsInPractice) {
      const yMap: Record<string, string> = { starting: "just getting started (under 1 year)", finding: "1–3 years in", building: "3–7 years in", established: "7+ years established" };
      parts.push(`I'm ${yMap[data.yearsInPractice] ?? data.yearsInPractice}.`);
    }
    if (data.challenges.length > 0) parts.push(`My biggest challenges right now: ${data.challenges.join("; ").toLowerCase()}.`);
    if (data.goals.length > 0) {
      const gMap: Record<string, string> = { projects: "track projects", invoicing: "professional invoicing", time: "time tracking", contacts: "relationship management", outreach: "gallery outreach", presence: "opportunities & visibility", ash: "AI-assisted decision making" };
      const gs = data.goals.map(g => gMap[g] ?? g);
      parts.push(`I want Perennial to help me with: ${gs.join(", ")}.`);
    }
    parts.push("Based on all of this, what should I set up first and what should I focus on in my first week with Perennial?");
    return parts.join(" ");
  }

  async function handleFinish() {
    setSaving(true);
    const supabase = createClient();
    if (userId) {
      await supabase.from("profiles").upsert({
        user_id:             userId,
        studio_name:         data.studioName || null,
        location:            data.city || null,
        website:             data.website || null,
        practice_types:      data.practiceTypes,
        work_types:          data.workTypes,
        selling_channels:    data.sellingChannels,
        price_range:         data.priceRange || null,
        years_in_practice:   data.yearsInPractice || null,
        primary_challenges:  data.challenges,
        perennial_goals:     data.goals,
        onboarding_complete: true,
        updated_at:          new Date().toISOString(),
      });
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: { studio_name: data.studioName } }));
    }
    localStorage.setItem("perennial-onboarded", "1");
    localStorage.setItem("perennial-just-onboarded", "1");
    setSaving(false);
    setShow(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: buildAshOpeningMessage() } }));
    }, 500);
  }

  function handleSkip() {
    if (userId) {
      const supabase = createClient();
      supabase.from("profiles").upsert({
        user_id: userId,
        studio_name: data.studioName || null,
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      }).then(() => {
        if (data.studioName) window.dispatchEvent(new CustomEvent("profile-updated", { detail: { studio_name: data.studioName } }));
      });
    }
    localStorage.setItem("perennial-onboarded", "1");
    setShow(false);
  }

  if (!show) return null;

  const canAdvance1 = data.studioName.trim().length > 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(31,33,26,0.6)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "ob-bg-in 0.25s ease-out",
      }}
    >
      <div
        style={{
          background: "var(--color-warm-white)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 20,
          boxShadow: "var(--shadow-overlay)",
          width: "100%", maxWidth: 560,
          maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          animation: "ob-modal-in 0.22s ease-out",
        }}
      >

        {/* ── Step 1: Welcome ─────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div style={{ background: ASH_GRADIENT, padding: "36px 40px 32px", textAlign: "center", flexShrink: 0 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.18)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AshMark size={30} variant="on-dark" animate />
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "white", fontFamily: "var(--font-display)", marginBottom: 8, letterSpacing: "-0.02em" }}>
                Welcome to Perennial.
              </h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.65, maxWidth: 380, margin: "0 auto" }}>
                Studio management for independent designers. Built around the way you actually work — not around spreadsheets.
              </p>
            </div>

            <div style={{ overflowY: "auto", padding: "28px 40px 0" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { icon: "🗂", label: "Projects", body: "Every piece of work you're making, selling, or pitching — tracked with tasks, timelines, linked contacts, and value." },
                  { icon: "👥", label: "Contacts", body: "Galleries, collectors, press, clients, fabricators. Know who you know and when you last connected." },
                  { icon: "💰", label: "Finance", body: "Time tracking, expenses, and invoicing in one place. Understand what you're earning and what you're owed." },
                  { icon: "📬", label: "Outreach", body: "Pipeline management for gallery submissions, press pitches, fair applications, and client pursuits." },
                  { icon: "✦",  label: "Ash", body: "Your AI business partner — Ash has full context on your studio and can answer questions, create records, and help you think.", ash: true },
                ].map(({ icon, label, body, ash }) => (
                  <div key={label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: ash ? "rgba(155,163,122,0.12)" : "var(--color-off-white)", border: `0.5px solid ${ash ? "rgba(155,163,122,0.25)" : "var(--color-border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {ash ? <AshMark size={19} variant="on-light" /> : icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 2 }}>{label}</p>
                      <p style={{ fontSize: 11, color: "var(--color-grey)", lineHeight: 1.55 }}>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: "24px 40px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <button onClick={handleSkip} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Skip setup
              </button>
              <button onClick={() => setStep(2)} style={{ padding: "10px 28px", fontSize: 13, fontWeight: 600, background: "var(--color-charcoal)", color: "var(--color-warm-white)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                Set up my studio →
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Studio identity ─────────────────────────────────────── */}
        {step === 2 && (
          <>
            <div style={{ padding: "28px 40px 0", flexShrink: 0 }}>
              <StepProgress current={1} total={TOTAL_STEPS} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-charcoal)", fontFamily: "var(--font-display)", marginTop: 14, marginBottom: 4, letterSpacing: "-0.01em" }}>
                Your studio
              </h2>
              <p style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 22 }}>
                This appears in the sidebar and on your invoices. Ash uses it to personalize advice.
              </p>
            </div>

            <div style={{ overflowY: "auto", padding: "0 40px 8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <FieldLabel>Studio or practice name *</FieldLabel>
                  <input
                    ref={firstInputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={data.studioName}
                    onChange={e => set("studioName", e.target.value)}
                    placeholder="e.g. Atelier Rosenberg"
                    onKeyDown={e => { if (e.key === "Enter" && canAdvance1) setStep(3); }}
                    style={{ width: "100%", padding: "9px 13px", fontSize: 13, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 9, color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
                    onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>City</FieldLabel>
                    <TextInput value={data.city} onChange={v => set("city", v)} placeholder="e.g. New York, NY" />
                  </div>
                  <div>
                    <FieldLabel>Website</FieldLabel>
                    <TextInput value={data.website} onChange={v => set("website", v)} placeholder="https://" type="url" />
                  </div>
                </div>
                <div>
                  <FieldLabel>What do you make?</FieldLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {PRACTICE_OPTIONS.map(opt => (
                      <Chip key={opt} selected={data.practiceTypes.includes(opt)} onClick={() => toggle("practiceTypes", opt)}>
                        {opt}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "20px 40px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderTop: "0.5px solid var(--color-border)", marginTop: 16 }}>
              <button onClick={() => setStep(1)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(3)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Skip</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canAdvance1}
                  style={{ padding: "9px 22px", fontSize: 12, fontWeight: 600, background: canAdvance1 ? "var(--color-charcoal)" : "var(--color-cream)", color: canAdvance1 ? "var(--color-warm-white)" : "var(--color-grey)", border: "none", borderRadius: 9, cursor: canAdvance1 ? "pointer" : "not-allowed", fontFamily: "inherit" }}
                >
                  Continue →
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: How you work ─────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <div style={{ padding: "28px 40px 0", flexShrink: 0 }}>
              <StepProgress current={2} total={TOTAL_STEPS} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-charcoal)", fontFamily: "var(--font-display)", marginTop: 14, marginBottom: 4, letterSpacing: "-0.01em" }}>
                How you work
              </h2>
              <p style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 22 }}>
                Select all that describe your practice. This shapes how your modules are set up.
              </p>
            </div>

            <div style={{ overflowY: "auto", padding: "0 40px 8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {WORK_TYPE_OPTIONS.map(opt => (
                  <Chip key={opt.id} selected={data.workTypes.includes(opt.id)} onClick={() => toggle("workTypes", opt.id)} sub={opt.sub}>
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div style={{ padding: "20px 40px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderTop: "0.5px solid var(--color-border)", marginTop: 16 }}>
              <button onClick={() => setStep(2)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(4)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Skip</button>
                <button onClick={() => setStep(4)} style={{ padding: "9px 22px", fontSize: 12, fontWeight: 600, background: "var(--color-charcoal)", color: "var(--color-warm-white)", border: "none", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>
                  Continue →
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 4: How you sell ─────────────────────────────────────────── */}
        {step === 4 && (
          <>
            <div style={{ padding: "28px 40px 0", flexShrink: 0 }}>
              <StepProgress current={3} total={TOTAL_STEPS} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-charcoal)", fontFamily: "var(--font-display)", marginTop: 14, marginBottom: 4, letterSpacing: "-0.01em" }}>
                How you sell
              </h2>
              <p style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 22 }}>
                Select all that apply. Ash uses this to give you relevant outreach and pricing advice.
              </p>
            </div>

            <div style={{ overflowY: "auto", padding: "0 40px 8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {CHANNEL_OPTIONS.map(opt => (
                  <Chip key={opt.id} selected={data.sellingChannels.includes(opt.id)} onClick={() => toggle("sellingChannels", opt.id)} sub={opt.sub}>
                    {opt.label}
                  </Chip>
                ))}
              </div>

              <div>
                <FieldLabel>Typical price point of your work</FieldLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {PRICE_OPTIONS.map(opt => (
                    <SingleChip key={opt.id} selected={data.priceRange === opt.id} onClick={() => set("priceRange", data.priceRange === opt.id ? "" : opt.id)}>
                      {opt.label}
                    </SingleChip>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: "20px 40px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderTop: "0.5px solid var(--color-border)", marginTop: 16 }}>
              <button onClick={() => setStep(3)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(5)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Skip</button>
                <button onClick={() => setStep(5)} style={{ padding: "9px 22px", fontSize: 12, fontWeight: 600, background: "var(--color-charcoal)", color: "var(--color-warm-white)", border: "none", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>
                  Continue →
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 5: Where you are ────────────────────────────────────────── */}
        {step === 5 && (
          <>
            <div style={{ padding: "28px 40px 0", flexShrink: 0 }}>
              <StepProgress current={4} total={TOTAL_STEPS} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-charcoal)", fontFamily: "var(--font-display)", marginTop: 14, marginBottom: 4, letterSpacing: "-0.01em" }}>
                Where you are
              </h2>
              <p style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 22 }}>
                Helps Ash calibrate its advice to your stage and what you're actually dealing with.
              </p>
            </div>

            <div style={{ overflowY: "auto", padding: "0 40px 8px" }}>
              <div style={{ marginBottom: 20 }}>
                <FieldLabel>How long have you been practicing?</FieldLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {YEARS_OPTIONS.map(opt => (
                    <SingleChip key={opt.id} selected={data.yearsInPractice === opt.id} onClick={() => set("yearsInPractice", data.yearsInPractice === opt.id ? "" : opt.id)} sub={opt.sub}>
                      {opt.label}
                    </SingleChip>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel>Biggest challenges right now <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(pick up to 3)</span></FieldLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CHALLENGE_OPTIONS.map(opt => (
                    <Chip
                      key={opt}
                      selected={data.challenges.includes(opt)}
                      onClick={() => {
                        if (!data.challenges.includes(opt) && data.challenges.length >= 3) return;
                        toggle("challenges", opt);
                      }}
                    >
                      {opt}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: "20px 40px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderTop: "0.5px solid var(--color-border)", marginTop: 16 }}>
              <button onClick={() => setStep(4)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(6)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Skip</button>
                <button onClick={() => setStep(6)} style={{ padding: "9px 22px", fontSize: 12, fontWeight: 600, background: "var(--color-charcoal)", color: "var(--color-warm-white)", border: "none", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}>
                  Continue →
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Step 6: Goals + Ash ──────────────────────────────────────────── */}
        {step === 6 && (
          <>
            <div style={{ padding: "28px 40px 0", flexShrink: 0 }}>
              <StepProgress current={5} total={TOTAL_STEPS} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-charcoal)", fontFamily: "var(--font-display)", marginTop: 14, marginBottom: 4, letterSpacing: "-0.01em" }}>
                What do you want from Perennial?
              </h2>
              <p style={{ fontSize: 12, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 22 }}>
                Select your priorities. Ash will start here with you.
              </p>
            </div>

            <div style={{ overflowY: "auto", padding: "0 40px 8px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {GOAL_OPTIONS.map(opt => {
                  const sel = data.goals.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggle("goals", opt.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "12px 14px",
                        borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                        background: sel ? "var(--color-charcoal)" : "var(--color-off-white)",
                        border: `0.5px solid ${sel ? "var(--color-charcoal)" : "var(--color-border)"}`,
                        transition: "all 0.1s ease",
                      }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: sel ? "rgba(255,255,255,0.12)" : "var(--color-cream)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: opt.icon === "✦" ? 16 : 16 }}>
                        {opt.icon === "✦" ? <AshMark size={16} variant={sel ? "on-dark" : "on-light"} /> : opt.icon}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: sel ? "var(--color-warm-white)" : "#6b6860" }}>
                        {opt.label}
                      </span>
                      {sel && <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Ash preview */}
              <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(155,163,122,0.08)", border: "0.5px solid rgba(155,163,122,0.22)", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: ASH_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <AshMark size={13} variant="on-dark" animate />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>Ash is ready</p>
                </div>
                <p style={{ fontSize: 11, color: "#6b6860", lineHeight: 1.6 }}>
                  When you finish, Ash will open with a personalized plan based on everything you&apos;ve shared — your practice type, selling channels, challenges, and goals. It can create your first project, add contacts, or walk you through any part of the app.
                </p>
              </div>
            </div>

            <div style={{ padding: "20px 40px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, borderTop: "0.5px solid var(--color-border)", marginTop: 16 }}>
              <button onClick={() => setStep(5)} style={{ fontSize: 12, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
              <button
                onClick={handleFinish}
                disabled={saving}
                style={{
                  padding: "10px 24px", fontSize: 13, fontWeight: 600,
                  background: ASH_GRADIENT, color: "white",
                  border: "none", borderRadius: 10, cursor: saving ? "not-allowed" : "pointer",
                  fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
                  opacity: saving ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={e => (e.currentTarget.style.opacity = saving ? "0.7" : "1")}
              >
                <AshMark size={14} variant="on-dark" />
                {saving ? "Saving…" : "Open Ash & get started"}
              </button>
            </div>
          </>
        )}

      </div>

      <style>{`
        @keyframes ob-bg-in   { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ob-modal-in { from { opacity: 0; transform: scale(0.96) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}
