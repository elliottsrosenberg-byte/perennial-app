"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  { id: "sub500",  label: "Under $500" },
  { id: "500_2k",  label: "$500 – $2,000" },
  { id: "2k_10k",  label: "$2,000 – $10,000" },
  { id: "10k_50k", label: "$10,000 – $50,000" },
  { id: "over50k", label: "$50,000+" },
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
  { id: "projects",  label: "Track projects and deadlines",          icon: "🗂" },
  { id: "invoicing", label: "Send professional invoices",            icon: "🧾" },
  { id: "time",      label: "Log time and understand profitability", icon: "⏱" },
  { id: "contacts",  label: "Build and maintain relationships",      icon: "👥" },
  { id: "outreach",  label: "Stay on top of gallery outreach",       icon: "📬" },
  { id: "presence",  label: "Track opportunities and visibility",    icon: "🌐" },
  { id: "ash",       label: "Use AI to think through decisions",     icon: "✦" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface OnboardingData {
  studioName:      string;
  city:            string;
  website:         string;
  practiceTypes:   string[];
  workTypes:       string[];
  sellingChannels: string[];
  priceRange:      string;
  yearsInPractice: string;
  challenges:      string[];
  goals:           string[];
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

// ─── Main page component ──────────────────────────────────────────────────────

export default function OnboardingClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep]     = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    studioName: "", city: "", website: "",
    practiceTypes: [], workTypes: [], sellingChannels: [],
    priceRange: "", yearsInPractice: "", challenges: [], goals: [],
  });

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 150);
  }, [step]);

  function toggle<K extends keyof OnboardingData>(key: K, value: string) {
    setData(d => {
      const arr = d[key] as string[];
      return { ...d, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }

  function set<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData(d => ({ ...d, [key]: value }));
  }

  async function handleFinish() {
    setSaving(true);
    const supabase = createClient();
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
    localStorage.setItem("perennial-just-onboarded", "1");
    router.push("/");
    router.refresh();
  }

  async function handleSkip() {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("profiles").upsert({
      user_id:             userId,
      studio_name:         data.studioName || null,
      onboarding_complete: true,
      updated_at:          new Date().toISOString(),
    });
    router.push("/");
    router.refresh();
  }

  const canAdvance1 = data.studioName.trim().length > 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-warm-white)",
        display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Botanical accent */}
      <img
        src="/botanicals/Botanical Illustrations-4.png"
        aria-hidden="true"
        alt=""
        style={{
          position: "absolute", bottom: "-12%", right: "-10%",
          width: 620, height: "auto",
          opacity: 0.05, mixBlendMode: "multiply",
          pointerEvents: "none", userSelect: "none",
        }}
      />

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px", borderBottom: "0.5px solid var(--color-border)",
        position: "relative", zIndex: 1, flexShrink: 0,
        background: "var(--color-warm-white)",
      }}>
        <Image src="/Logotype.svg" alt="Perennial" width={120} height={28} style={{ height: "auto", opacity: 0.85 }} />
        {step > 1 && (
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <StepProgress current={step - 1} total={TOTAL_STEPS - 1} />
          </div>
        )}
        <button
          onClick={handleSkip}
          disabled={saving}
          style={{
            fontSize: 12, color: "var(--color-grey)",
            background: "none", border: "none", cursor: saving ? "default" : "pointer",
            fontFamily: "inherit", padding: "6px 10px",
          }}
        >
          Skip for now
        </button>
      </header>

      {/* Step content */}
      <main style={{
        flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "32px 24px 48px", position: "relative", zIndex: 1,
        overflowY: "auto",
      }}>
        <div style={{ width: "100%", maxWidth: 560 }}>

          {/* ── Step 1: Welcome ──────────────────────────────────────────────── */}
          {step === 1 && (
            <div style={{
              background: "var(--color-off-white)", borderRadius: 20,
              border: "0.5px solid var(--color-border)",
              boxShadow: "var(--shadow-card)",
              overflow: "hidden",
            }}>
              <div style={{ background: ASH_GRADIENT, padding: "40px 40px 32px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.18)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AshMark size={30} variant="on-dark" animate />
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: "white", fontFamily: "var(--font-display)", marginBottom: 8, letterSpacing: "-0.02em" }}>
                  Welcome to Perennial.
                </h1>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.65, maxWidth: 380, margin: "0 auto" }}>
                  Studio management for independent designers. Built around the way you actually work — not around spreadsheets.
                </p>
              </div>

              <div style={{ padding: "28px 40px 0" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { icon: "🗂", label: "Projects",  body: "Every piece of work you're making, selling, or pitching — tracked with tasks, timelines, linked contacts, and value." },
                    { icon: "👥", label: "Contacts",  body: "Galleries, collectors, press, clients, fabricators. Know who you know and when you last connected." },
                    { icon: "💰", label: "Finance",   body: "Time tracking, expenses, and invoicing in one place. Understand what you're earning and what you're owed." },
                    { icon: "📬", label: "Outreach",  body: "Pipeline management for gallery submissions, press pitches, fair applications, and client pursuits." },
                    { icon: "✦",  label: "Ash",       body: "Your AI business partner — Ash has full context on your studio and can answer questions, create records, and help you think.", ash: true },
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

              <div style={{ padding: "24px 40px 32px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setStep(2)}
                  style={{ padding: "10px 28px", fontSize: 13, fontWeight: 600, background: "var(--color-charcoal)", color: "var(--color-warm-white)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  Set up my studio →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Studio identity ─────────────────────────────────────── */}
          {step === 2 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>Your studio</h2>
              <p style={subtitleStyle}>
                This appears in the sidebar and on your invoices. Ash uses it to personalize advice.
              </p>

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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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

              <StepFooter onBack={() => setStep(1)} onSkip={() => setStep(3)} onNext={() => setStep(3)} nextDisabled={!canAdvance1} />
            </div>
          )}

          {/* ── Step 3: How you work ─────────────────────────────────────────── */}
          {step === 3 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>How you work</h2>
              <p style={subtitleStyle}>
                Select all that describe your practice. This shapes how your modules are set up.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {WORK_TYPE_OPTIONS.map(opt => (
                  <Chip key={opt.id} selected={data.workTypes.includes(opt.id)} onClick={() => toggle("workTypes", opt.id)} sub={opt.sub}>
                    {opt.label}
                  </Chip>
                ))}
              </div>

              <StepFooter onBack={() => setStep(2)} onSkip={() => setStep(4)} onNext={() => setStep(4)} />
            </div>
          )}

          {/* ── Step 4: How you sell ─────────────────────────────────────────── */}
          {step === 4 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>How you sell</h2>
              <p style={subtitleStyle}>
                Select all that apply. Ash uses this to give you relevant outreach and pricing advice.
              </p>

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

              <StepFooter onBack={() => setStep(3)} onSkip={() => setStep(5)} onNext={() => setStep(5)} />
            </div>
          )}

          {/* ── Step 5: Where you are ────────────────────────────────────────── */}
          {step === 5 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>Where you are</h2>
              <p style={subtitleStyle}>
                Helps Ash calibrate its advice to your stage and what you&apos;re actually dealing with.
              </p>

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

              <StepFooter onBack={() => setStep(4)} onSkip={() => setStep(6)} onNext={() => setStep(6)} />
            </div>
          )}

          {/* ── Step 6: Goals + Ash ──────────────────────────────────────────── */}
          {step === 6 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>What do you want from Perennial?</h2>
              <p style={subtitleStyle}>
                Select your priorities. Ash will start here with you.
              </p>

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
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: sel ? "rgba(255,255,255,0.12)" : "var(--color-cream)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
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

              <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(155,163,122,0.08)", border: "0.5px solid rgba(155,163,122,0.22)", marginBottom: 20 }}>
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

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "0.5px solid var(--color-border)", marginTop: 16 }}>
                <button onClick={() => setStep(5)} style={backLinkStyle}>← Back</button>
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
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// ─── Inline style constants ───────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "var(--color-off-white)", borderRadius: 20,
  border: "0.5px solid var(--color-border)",
  boxShadow: "var(--shadow-card)",
  padding: "36px 40px 28px",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22, fontWeight: 700, color: "var(--color-charcoal)",
  fontFamily: "var(--font-display)", marginBottom: 6, letterSpacing: "-0.01em",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--color-grey)", lineHeight: 1.6, marginBottom: 22,
};

const backLinkStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--color-grey)",
  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
};

function StepFooter({
  onBack, onSkip, onNext, nextDisabled = false,
}: { onBack: () => void; onSkip: () => void; onNext: () => void; nextDisabled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16, borderTop: "0.5px solid var(--color-border)", marginTop: 24 }}>
      <button onClick={onBack} style={backLinkStyle}>← Back</button>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onSkip} style={backLinkStyle}>Skip</button>
        <button
          onClick={onNext}
          disabled={nextDisabled}
          style={{
            padding: "9px 22px", fontSize: 12, fontWeight: 600,
            background: nextDisabled ? "var(--color-cream)" : "var(--color-charcoal)",
            color: nextDisabled ? "var(--color-grey)" : "var(--color-warm-white)",
            border: "none", borderRadius: 9,
            cursor: nextDisabled ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
