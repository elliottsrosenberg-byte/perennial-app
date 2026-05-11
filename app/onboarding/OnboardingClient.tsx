"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Layers, Users, Receipt, Send, Clock, Globe, BookOpen, UploadCloud, X as XIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AshMark from "@/components/ui/AshMark";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";
const TOTAL_STEPS = 8;

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
  { id: "gallery",     label: "Gallery representation", sub: "Consignment or representation deals" },
  { id: "direct",      label: "Direct to collectors",   sub: "Studio sales, Instagram, newsletter, word of mouth" },
  { id: "fairs",       label: "Design fairs",           sub: "ICFF, Sight Unseen, PAD, Design Miami, etc." },
  { id: "trade",       label: "Trade clients",          sub: "Interior designers, hospitality, developers" },
  { id: "ecommerce",   label: "E-commerce",             sub: "Own website, 1stDibs, etc." },
  { id: "commissions", label: "Public / corporate commissions", sub: "Institutional or architectural projects" },
  { id: "not_selling", label: "I don't really sell yet", sub: "Focused on developing my practice — Ash will lean into learning-oriented guidance" },
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

const GOAL_OPTIONS: { id: string; label: string; Icon: LucideIcon | null }[] = [
  { id: "projects",  label: "Track projects and deadlines",          Icon: Layers   },
  { id: "invoicing", label: "Send professional invoices",            Icon: Receipt  },
  { id: "time",      label: "Log time and understand profitability", Icon: Clock    },
  { id: "contacts",  label: "Build and maintain relationships",      Icon: Users    },
  { id: "outreach",  label: "Stay on top of gallery outreach",       Icon: Send     },
  { id: "presence",  label: "Track opportunities and visibility",    Icon: Globe    },
  { id: "learn",     label: "Learn how to run my studio",            Icon: BookOpen },
  { id: "ash",       label: "Use AI to think through decisions",     Icon: null     },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface StagedFile {
  id:          string;
  file:        File;
  name:        string;
  description: string;
}

interface OnboardingData {
  displayName:     string;
  studioName:      string;
  city:            string;
  website:         string;
  tagline:         string;
  bio:             string;
  practiceTypes:   string[];
  workTypes:       string[];
  sellingChannels: string[];
  priceRange:      string;
  yearsInPractice: string;
  challenges:      string[];
  businessIssues:  string;
  urgentNeeds:     string;
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
        background: selected ? "var(--color-sage)" : "var(--color-off-white)",
        color:      selected ? "var(--color-warm-white)" : "#6b6860",
        border:     `0.5px solid ${selected ? "var(--color-sage)" : "var(--color-border)"}`,
        display: "flex", flexDirection: "column", gap: 2,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 500 }}>{children}</span>
      {sub && <span style={{ fontSize: 10, opacity: selected ? 0.8 : 0.8 }}>{sub}</span>}
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
        background: selected ? "var(--color-sage)" : "var(--color-off-white)",
        color:      selected ? "var(--color-warm-white)" : "#6b6860",
        border:     `0.5px solid ${selected ? "var(--color-sage)" : "var(--color-border)"}`,
        display: "flex", flexDirection: "column", gap: 2,
        position: "relative",
      }}
    >
      {selected && (
        <span style={{ position: "absolute", top: 8, right: 10, fontSize: 10, opacity: 0.8 }}>✓</span>
      )}
      <span style={{ fontSize: 12, fontWeight: 500 }}>{children}</span>
      {sub && <span style={{ fontSize: 10, opacity: selected ? 0.8 : 0.8 }}>{sub}</span>}
    </button>
  );
}

function OtherInput({
  values, knownIds, onAdd, placeholder = "Add your own",
}: { values: string[]; knownIds: string[]; onAdd: (v: string) => void; placeholder?: string }) {
  const [val, setVal] = useState("");
  function submit() {
    const v = val.trim();
    if (!v) return;
    if (knownIds.includes(v) || values.includes(v)) { setVal(""); return; }
    onAdd(v);
    setVal("");
  }
  const ready = val.trim().length > 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
      <span style={{ fontSize: 11, color: "var(--color-grey)", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Other</span>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder={placeholder}
        style={{
          flex: 1, padding: "7px 11px", fontSize: 12,
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)", borderRadius: 9,
          color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
        onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!ready}
        style={{
          fontSize: 11, fontWeight: 600,
          background: ready ? "var(--color-sage)" : "var(--color-cream)",
          color: ready ? "var(--color-warm-white)" : "var(--color-grey)",
          border: "none", borderRadius: 8, padding: "7px 14px",
          cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
        }}
      >
        Add
      </button>
    </div>
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
    displayName: "",
    studioName: "", city: "", website: "", tagline: "", bio: "",
    practiceTypes: [], workTypes: [], sellingChannels: [],
    priceRange: "", yearsInPractice: "", challenges: [],
    businessIssues: "", urgentNeeds: "",
    goals: [],
  });

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function addFiles(incoming: File[]) {
    setUploadError(null);
    const next: StagedFile[] = incoming.map(file => ({
      id:          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name:        file.name.replace(/\.[^.]+$/, ""),
      description: "",
    }));
    setStagedFiles(prev => [...prev, ...next]);
  }
  function updateStagedFile(id: string, patch: Partial<StagedFile>) {
    setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }
  function removeStagedFile(id: string) {
    setStagedFiles(prev => prev.filter(f => f.id !== id));
  }

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
    setUploadError(null);
    const supabase = createClient();

    // Upload staged files to Supabase Storage and create one Resource row each.
    // Skipped silently if nothing was staged — keeps the no-files path fast.
    if (stagedFiles.length > 0) {
      try {
        for (const f of stagedFiles) {
          const safeName = f.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path     = `${userId}/${f.id}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("resources")
            .upload(path, f.file, { cacheControl: "3600", upsert: false });
          if (upErr) throw upErr;
          const { data: urlData } = supabase.storage.from("resources").getPublicUrl(path);
          await supabase.from("resources").insert({
            user_id:      userId,
            category:     "brand",
            item_type:    "file",
            status:       "complete",
            name:         f.name.trim() || f.file.name,
            meta:         f.description.trim() || "",
            file_urls:    [urlData.publicUrl],
            preview_type: "file",
          });
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Couldn't upload one or more files. Onboarding will continue.");
        // Don't block onboarding completion on a partial upload failure.
      }
    }

    await supabase.from("profiles").upsert({
      user_id:             userId,
      display_name:        data.displayName || null,
      studio_name:         data.studioName || null,
      tagline:             data.tagline || null,
      bio:                 data.bio || null,
      location:            data.city || null,
      website:             data.website || null,
      practice_types:      data.practiceTypes,
      work_types:          data.workTypes,
      selling_channels:    data.sellingChannels,
      price_range:         data.priceRange || null,
      years_in_practice:   data.yearsInPractice || null,
      primary_challenges:  data.challenges,
      business_issues:     data.businessIssues || null,
      urgent_needs:        data.urgentNeeds || null,
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
      display_name:        data.displayName || null,
      studio_name:         data.studioName || null,
      tagline:             data.tagline || null,
      bio:                 data.bio || null,
      onboarding_complete: true,
      updated_at:          new Date().toISOString(),
    });
    router.push("/");
    router.refresh();
  }

  const canAdvance2 = data.displayName.trim().length > 0;
  const canAdvance3 = data.studioName.trim().length > 0;

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
              {/* Hero — charcoal panel with botanical, matches login */}
              <div style={{ position: "relative", background: "#1f211a", padding: "44px 40px 40px", textAlign: "center", overflow: "hidden" }}>
                <img
                  src="/botanicals/Botanical Illustrations.png"
                  aria-hidden="true"
                  alt=""
                  style={{
                    position: "absolute", bottom: "-30%", right: "-20%",
                    width: 460, height: "auto", opacity: 0.5,
                    pointerEvents: "none", userSelect: "none",
                  }}
                />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <Image
                    src="/Logotype.svg" alt="Perennial"
                    width={140} height={32}
                    style={{ height: "auto", opacity: 0.95, margin: "0 auto 20px", display: "block" }}
                  />
                  <h1 style={{
                    fontFamily: "var(--font-newsreader)",
                    fontSize: 30, fontWeight: 400, lineHeight: 1.15,
                    color: "#f5f1e9", letterSpacing: "-0.01em",
                    marginBottom: 10,
                  }}>
                    Welcome to Perennial.
                  </h1>
                  <p style={{ fontSize: 13, color: "rgba(245,241,233,0.65)", lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}>
                    Studio management for independent designers and makers.
                  </p>
                </div>
              </div>

              <div style={{ padding: "28px 40px 0" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { Icon: Layers,  label: "Projects", body: "Every piece of work you're making, selling, or pitching — tracked with tasks, timelines, linked contacts, and value." },
                    { Icon: Users,   label: "Contacts", body: "Galleries, collectors, press, clients, fabricators. Know who you know and when you last connected." },
                    { Icon: Receipt, label: "Finance",  body: "Time tracking, expenses, and invoicing in one place. Understand what you're earning and what you're owed." },
                    { Icon: Send,    label: "Outreach", body: "Pipeline management for gallery submissions, press pitches, fair applications, and client pursuits." },
                    { Icon: null,    label: "Ash",      body: "Your AI business partner — Ash has full context on your studio and can answer questions, create records, and help you think.", ash: true },
                  ].map(({ Icon, label, body, ash }) => (
                    <div key={label} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                        background: ash ? "rgba(155,163,122,0.12)" : "var(--color-cream)",
                        border: `0.5px solid ${ash ? "rgba(155,163,122,0.25)" : "var(--color-border)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: ash ? "var(--color-sage)" : "var(--color-charcoal)",
                      }}>
                        {ash ? <AshMark size={19} variant="on-light" /> : Icon && <Icon size={17} strokeWidth={1.5} />}
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
                  style={{ padding: "11px 26px", fontSize: 13, fontWeight: 600, background: "var(--color-sage)", color: "var(--color-warm-white)", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.15s ease" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  Let&apos;s get started →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: About you ────────────────────────────────────────────── */}
          {step === 2 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>About you</h2>
              <p style={subtitleStyle}>
                Ash addresses you by name. You can add more about yourself in Settings later.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <FieldLabel>Your name *</FieldLabel>
                  <input
                    ref={firstInputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={data.displayName}
                    onChange={e => set("displayName", e.target.value)}
                    placeholder="e.g. Elliott Rosenberg"
                    onKeyDown={e => { if (e.key === "Enter" && canAdvance2) setStep(3); }}
                    style={{ width: "100%", padding: "9px 13px", fontSize: 13, background: "var(--color-off-white)", border: "0.5px solid var(--color-border)", borderRadius: 9, color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
                    onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
                  />
                </div>
              </div>

              <StepFooter onBack={() => setStep(1)} onSkip={() => setStep(3)} onNext={() => setStep(3)} nextDisabled={!canAdvance2} />
            </div>
          )}

          {/* ── Step 3: Studio identity ─────────────────────────────────────── */}
          {step === 3 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>Your studio</h2>
              <p style={subtitleStyle}>
                This appears in the sidebar and on your invoices. Ash uses it to personalize advice.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <FieldLabel>Studio or practice name *</FieldLabel>
                  <input
                    type="text"
                    value={data.studioName}
                    onChange={e => set("studioName", e.target.value)}
                    placeholder="e.g. Atelier Rosenberg"
                    onKeyDown={e => { if (e.key === "Enter" && canAdvance3) setStep(4); }}
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
                  <FieldLabel>Studio tagline</FieldLabel>
                  <TextInput
                    value={data.tagline}
                    onChange={v => set("tagline", v)}
                    placeholder="A one-line description of your work"
                  />
                </div>
                <div>
                  <FieldLabel>Studio bio / statement</FieldLabel>
                  <textarea
                    value={data.bio}
                    onChange={e => set("bio", e.target.value)}
                    placeholder="Paste your artist statement, studio bio, or a longer description of your practice. Ash will use this to write about your work, draft pitches, and stay on-voice."
                    rows={5}
                    style={{
                      width: "100%", padding: "10px 13px", fontSize: 13,
                      background: "var(--color-off-white)",
                      border: "0.5px solid var(--color-border)", borderRadius: 9,
                      color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
                      boxSizing: "border-box", resize: "vertical", lineHeight: 1.55,
                    }}
                    onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
                    onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
                  />
                </div>
                <div>
                  <FieldLabel>What do you make?</FieldLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {PRACTICE_OPTIONS.map(opt => (
                      <Chip key={opt} selected={data.practiceTypes.includes(opt)} onClick={() => toggle("practiceTypes", opt)}>
                        {opt}
                      </Chip>
                    ))}
                    {data.practiceTypes.filter(v => !PRACTICE_OPTIONS.includes(v)).map(v => (
                      <Chip key={v} selected onClick={() => toggle("practiceTypes", v)}>
                        {v}
                      </Chip>
                    ))}
                  </div>
                  <OtherInput
                    values={data.practiceTypes}
                    knownIds={PRACTICE_OPTIONS}
                    onAdd={v => set("practiceTypes", [...data.practiceTypes, v])}
                  />
                </div>
              </div>

              <StepFooter onBack={() => setStep(2)} onSkip={() => setStep(4)} onNext={() => setStep(4)} nextDisabled={!canAdvance3} />
            </div>
          )}

          {/* ── Step 4: How you work ─────────────────────────────────────────── */}
          {step === 4 && (
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
                {data.workTypes.filter(v => !WORK_TYPE_OPTIONS.some(o => o.id === v)).map(v => (
                  <Chip key={v} selected onClick={() => toggle("workTypes", v)}>
                    {v}
                  </Chip>
                ))}
              </div>
              <OtherInput
                values={data.workTypes}
                knownIds={WORK_TYPE_OPTIONS.map(o => o.id)}
                onAdd={v => set("workTypes", [...data.workTypes, v])}
              />

              <StepFooter onBack={() => setStep(3)} onSkip={() => setStep(5)} onNext={() => setStep(5)} />
            </div>
          )}

          {/* ── Step 5: How you sell ─────────────────────────────────────────── */}
          {step === 5 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>How you sell</h2>
              <p style={subtitleStyle}>
                Select all that apply. Ash uses this to give you relevant outreach and pricing advice.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {CHANNEL_OPTIONS.map(opt => (
                  <Chip key={opt.id} selected={data.sellingChannels.includes(opt.id)} onClick={() => toggle("sellingChannels", opt.id)} sub={opt.sub}>
                    {opt.label}
                  </Chip>
                ))}
                {data.sellingChannels.filter(v => !CHANNEL_OPTIONS.some(o => o.id === v)).map(v => (
                  <Chip key={v} selected onClick={() => toggle("sellingChannels", v)}>
                    {v}
                  </Chip>
                ))}
              </div>
              <div style={{ marginBottom: 20 }}>
                <OtherInput
                  values={data.sellingChannels}
                  knownIds={CHANNEL_OPTIONS.map(o => o.id)}
                  onAdd={v => set("sellingChannels", [...data.sellingChannels, v])}
                />
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

              <StepFooter onBack={() => setStep(4)} onSkip={() => setStep(6)} onNext={() => setStep(6)} />
            </div>
          )}

          {/* ── Step 6: Where you are ────────────────────────────────────────── */}
          {step === 6 && (
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
                  {data.challenges.filter(v => !CHALLENGE_OPTIONS.includes(v)).map(v => (
                    <Chip key={v} selected onClick={() => toggle("challenges", v)}>
                      {v}
                    </Chip>
                  ))}
                </div>
                <OtherInput
                  values={data.challenges}
                  knownIds={CHALLENGE_OPTIONS}
                  onAdd={v => {
                    if (data.challenges.length >= 3) return;
                    set("challenges", [...data.challenges, v]);
                  }}
                />
              </div>

              <div style={{ marginTop: 20 }}>
                <FieldLabel>What&apos;s broken in your business right now?</FieldLabel>
                <textarea
                  value={data.businessIssues}
                  onChange={e => set("businessIssues", e.target.value)}
                  placeholder="Recurring problems, things that frustrate you, blockers in your workflow. Be candid — Ash will use this to suggest where to start."
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 13px", fontSize: 13,
                    background: "var(--color-off-white)",
                    border: "0.5px solid var(--color-border)", borderRadius: 9,
                    color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box", resize: "vertical", lineHeight: 1.55,
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
                  onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <FieldLabel>Anything urgent on your plate?</FieldLabel>
                <textarea
                  value={data.urgentNeeds}
                  onChange={e => set("urgentNeeds", e.target.value)}
                  placeholder="Pending invoices, deadlines this week, a pitch you owe someone, a contract you need to send. Things you'd like off your plate first."
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 13px", fontSize: 13,
                    background: "var(--color-off-white)",
                    border: "0.5px solid var(--color-border)", borderRadius: 9,
                    color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box", resize: "vertical", lineHeight: 1.55,
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
                  onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
                />
              </div>

              <StepFooter onBack={() => setStep(5)} onSkip={() => setStep(7)} onNext={() => setStep(7)} />
            </div>
          )}

          {/* ── Step 7: Goals + Ash ──────────────────────────────────────────── */}
          {step === 7 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>What do you want from Perennial?</h2>
              <p style={subtitleStyle}>
                Select your priorities. Ash will start here with you.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {GOAL_OPTIONS.map(opt => {
                  const sel = data.goals.includes(opt.id);
                  const Icon = opt.Icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggle("goals", opt.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "12px 14px",
                        borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                        background: sel ? "var(--color-sage)" : "var(--color-off-white)",
                        border: `0.5px solid ${sel ? "var(--color-sage)" : "var(--color-border)"}`,
                        transition: "all 0.1s ease",
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: sel ? "rgba(255,255,255,0.2)" : "var(--color-cream)",
                        border: sel ? "none" : "0.5px solid var(--color-border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: sel ? "var(--color-warm-white)" : "var(--color-charcoal)",
                      }}>
                        {Icon === null
                          ? <AshMark size={16} variant={sel ? "on-dark" : "on-light"} />
                          : <Icon size={15} strokeWidth={1.5} />}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: sel ? "var(--color-warm-white)" : "#6b6860" }}>
                        {opt.label}
                      </span>
                      {sel && <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>✓</span>}
                    </button>
                  );
                })}
                {data.goals.filter(v => !GOAL_OPTIONS.some(o => o.id === v)).map(v => (
                  <button
                    key={v}
                    onClick={() => toggle("goals", v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "12px 14px",
                      borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      background: "var(--color-sage)",
                      border: "0.5px solid var(--color-sage)",
                    }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-warm-white)" }}>{v}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>✓</span>
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 24 }}>
                <OtherInput
                  values={data.goals}
                  knownIds={GOAL_OPTIONS.map(o => o.id)}
                  onAdd={v => set("goals", [...data.goals, v])}
                />
              </div>

              <StepFooter onBack={() => setStep(6)} onSkip={() => setStep(8)} onNext={() => setStep(8)} />
            </div>
          )}

          {/* ── Step 8: Studio resources upload ──────────────────────────────── */}
          {step === 8 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>Bring in your studio materials</h2>
              <p style={subtitleStyle}>
                Drop in artist statements, bios, press, lookbooks, contracts — anything that defines your studio. Ash reads these to stay on-voice and reference your work. They land in <strong style={{ color: "var(--color-charcoal)", fontWeight: 600 }}>Resources</strong> so you can find them later.
              </p>

              <FileDropzone
                files={stagedFiles}
                onAdd={addFiles}
                onUpdate={updateStagedFile}
                onRemove={removeStagedFile}
                uploadError={uploadError}
              />

              <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(155,163,122,0.08)", border: "0.5px solid rgba(155,163,122,0.22)", marginTop: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: ASH_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <AshMark size={13} variant="on-dark" animate />
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>Ash is ready</p>
                </div>
                <p style={{ fontSize: 11, color: "#6b6860", lineHeight: 1.6 }}>
                  When you finish, Ash will open with a personalized response based on everything you&apos;ve shared — your practice, goals, challenges, and any documents you uploaded. It will walk you through where to start.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "0.5px solid var(--color-border)", marginTop: 16 }}>
                <button onClick={() => setStep(7)} style={backLinkStyle}>← Back</button>
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

// ─── File dropzone ────────────────────────────────────────────────────────────

function FileDropzone({
  files, onAdd, onUpdate, onRemove, uploadError,
}: {
  files:       StagedFile[];
  onAdd:       (fs: File[]) => void;
  onUpdate:    (id: string, patch: Partial<StagedFile>) => void;
  onRemove:    (id: string) => void;
  uploadError: string | null;
}) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setHover(false);
    if (!e.dataTransfer.files?.length) return;
    onAdd(Array.from(e.dataTransfer.files));
  }

  return (
    <>
      <div
        onDragOver={e => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "28px 24px",
          borderRadius: 12,
          border: `1px dashed ${hover ? "var(--color-sage)" : "var(--color-border)"}`,
          background: hover ? "rgba(155,163,122,0.06)" : "var(--color-off-white)",
          textAlign: "center", cursor: "pointer",
          transition: "all 0.12s ease",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={e => {
            if (e.target.files?.length) onAdd(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        <UploadCloud size={22} strokeWidth={1.5} style={{ color: "var(--color-grey)", margin: "0 auto 8px", display: "block" }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-charcoal)", marginBottom: 2 }}>
          Drag files here or click to browse
        </p>
        <p style={{ fontSize: 11, color: "var(--color-grey)" }}>
          PDFs, images, docs — anything that describes your studio
        </p>
      </div>

      {uploadError && (
        <p style={{ fontSize: 12, color: "var(--color-red-orange)", marginTop: 10 }}>
          {uploadError}
        </p>
      )}

      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {files.map(f => (
            <div key={f.id} style={{
              padding: 12, borderRadius: 10,
              background: "var(--color-off-white)",
              border: "0.5px solid var(--color-border)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                <input
                  type="text"
                  value={f.name}
                  onChange={e => onUpdate(f.id, { name: e.target.value })}
                  placeholder="Title for this file"
                  style={{
                    flex: 1, padding: "6px 10px", fontSize: 13, fontWeight: 500,
                    background: "var(--color-warm-white)",
                    border: "0.5px solid var(--color-border)", borderRadius: 7,
                    color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
                  onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
                />
                <button
                  type="button"
                  onClick={() => onRemove(f.id)}
                  aria-label="Remove file"
                  style={{
                    background: "none", border: "none", padding: 6, cursor: "pointer",
                    color: "var(--color-grey)", borderRadius: 6, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <XIcon size={14} />
                </button>
              </div>
              <textarea
                value={f.description}
                onChange={e => onUpdate(f.id, { description: e.target.value })}
                placeholder="What is this? (e.g. 'Studio bio used for gallery submissions, last updated 2026')"
                rows={2}
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12,
                  background: "var(--color-warm-white)",
                  border: "0.5px solid var(--color-border)", borderRadius: 7,
                  color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
                  boxSizing: "border-box", resize: "vertical", lineHeight: 1.5,
                }}
                onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
                onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
              />
              <p style={{ fontSize: 10, color: "var(--color-grey)", marginTop: 6 }}>
                {f.file.name} · {(f.file.size / 1024).toFixed(0)} KB
              </p>
            </div>
          ))}
        </div>
      )}
    </>
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
            background: nextDisabled ? "var(--color-cream)" : "var(--color-sage)",
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
