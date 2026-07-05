"use client";

// Short, required sign-up modal (4 slides). Collects only what the app needs to
// feel personalized from the first screen — name, studio, what they make, and
// how they want to use Perennial. Everything deeper (work types, channels,
// challenges, bio, integrations, uploads) is deferred to the conversational Ash
// onboarding, triggered later from the home canvas. See the two-flag state model:
//   onboarding_complete   → finished this modal (gates the /onboarding redirect)
//   profile_setup_complete → finished the Ash-driven deep setup (starts false)

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Layers, Users, Receipt, Send, Clock, Globe, BookOpen,
  Armchair, Lamp, Diamond, Gem, Palette, Hammer, PenTool, Briefcase,
  Boxes, Pencil, Video, Monitor, Code2, Shapes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PALETTE, paletteColorForKey } from "@/lib/ui/palette";
import AshMark from "@/components/ui/AshMark";

// ─── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4;

const PRACTICE_OPTIONS = [
  "Furniture", "Objects & lighting", "Ceramics & glass", "Textiles",
  "Jewelry", "Painting", "Illustration", "Sculpture", "Printmaking",
  "Video", "Graphic design", "Websites", "Software", "Client-based work",
];

// Stable key + palette colour per practice option so the Projects board can
// default to a type list that mirrors how the user describes their work. Colours
// are named from the canonical user-pick palette (lib/ui/palette.ts) — the same
// source tags, pipeline stages, and project accents draw from — so no raw hex
// lives here and users can recolour any type later. Order here is canonical; the
// user's selection order determines which types appear first on their board.
const PRACTICE_TO_PROJECT_TYPE: Record<string, { key: string; palette: string }> = {
  "Furniture":          { key: "furniture",      palette: "Brown"  },
  "Objects & lighting": { key: "objects",        palette: "Orange" },
  "Ceramics & glass":   { key: "ceramics",       palette: "Olive"  },
  "Textiles":           { key: "textiles",       palette: "Purple" },
  "Jewelry":            { key: "jewelry",        palette: "Rose"   },
  "Painting":           { key: "painting",       palette: "Red"    },
  "Illustration":       { key: "illustration",   palette: "Blue"   },
  "Sculpture":          { key: "sculpture",      palette: "Grey"   },
  "Printmaking":        { key: "printmaking",    palette: "Yellow" },
  "Video":              { key: "video",          palette: "Green"  },
  "Graphic design":     { key: "graphic_design", palette: "Purple" },
  "Websites":           { key: "websites",       palette: "Blue"   },
  "Software":           { key: "software",        palette: "Grey"   },
  "Client-based work":  { key: "client_project", palette: "Blue"   },
};

const PALETTE_HEX_BY_NAME: Record<string, string> =
  Object.fromEntries(PALETTE.map(c => [c.name, c.hex]));

function paletteHex(name: string): string {
  return PALETTE_HEX_BY_NAME[name] ?? PALETTE_HEX_BY_NAME["Grey"];
}

function buildProjectTypeOptions(practiceTypes: string[]) {
  // The user's picked practice types become the priority list — their first
  // pick anchors the Projects board's default type.
  const seen = new Set<string>();
  const out: { key: string; label: string; color: string }[] = [];
  for (const p of practiceTypes) {
    const map = PRACTICE_TO_PROJECT_TYPE[p];
    if (map && !seen.has(map.key)) {
      out.push({ key: map.key, label: p, color: paletteHex(map.palette) });
      seen.add(map.key);
    } else if (!map && !seen.has(p.toLowerCase())) {
      // Custom "Other"-added practice — deterministic palette colour by name.
      out.push({ key: p.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: p, color: paletteColorForKey(p).hex });
      seen.add(p.toLowerCase());
    }
  }
  // Always keep a "Client" type available if client-style work was picked, so
  // client projects have somewhere to live.
  if (practiceTypes.includes("Client-based work") && !seen.has("client_project")) {
    out.push({ key: "client_project", label: "Client", color: paletteHex("Blue") });
  }
  return out;
}

const PRACTICE_ICONS: Record<string, LucideIcon> = {
  "Furniture":          Armchair,
  "Objects & lighting": Lamp,
  "Ceramics & glass":   Diamond,
  "Textiles":           Boxes,
  "Jewelry":            Gem,
  "Painting":           Palette,
  "Illustration":       Pencil,
  "Sculpture":          Hammer,
  "Printmaking":        PenTool,
  "Video":              Video,
  "Graphic design":     Shapes,
  "Websites":           Monitor,
  "Software":           Code2,
  "Client-based work":  Briefcase,
};

const GOAL_OPTIONS: { id: string; label: string; Icon: LucideIcon | null }[] = [
  { id: "projects",  label: "Track projects and deadlines",          Icon: Layers   },
  { id: "invoicing", label: "Send professional invoices",            Icon: Receipt  },
  { id: "time",      label: "Log time and understand profitability", Icon: Clock    },
  { id: "contacts",  label: "Build and maintain relationships",      Icon: Users    },
  { id: "outreach",  label: "Stay on top of outreach",               Icon: Send     },
  { id: "presence",  label: "Track opportunities and visibility",    Icon: Globe    },
  { id: "learn",     label: "Learn how to run my studio",            Icon: BookOpen },
  { id: "ash",       label: "Use AI to think through decisions",     Icon: null     },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

interface OnboardingData {
  firstName:     string;
  lastName:      string;
  studioName:    string;
  city:          string;
  practiceTypes: string[];
  goals:         string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Chip({
  selected, onClick, children,
}: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.1s ease", textAlign: "left",
        background: selected ? "var(--color-sage)" : "var(--color-off-white)",
        color:      selected ? "var(--color-warm-white)" : "var(--color-text-secondary)",
        border:     `0.5px solid ${selected ? "var(--color-sage)" : "var(--color-border)"}`,
        fontSize: 12, fontWeight: 500,
      }}
    >
      {children}
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
  value, onChange, placeholder, onEnter, inputRef, type = "text",
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  onEnter?: () => void; inputRef?: React.RefObject<HTMLInputElement>; type?: string;
}) {
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
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
  // Step mirrors a ?step= query param so a refresh keeps the user in place.
  const [step, _setStep] = useState<Step>(() => {
    if (typeof window === "undefined") return 1;
    const n = parseInt(new URLSearchParams(window.location.search).get("step") ?? "1", 10);
    return (n >= 1 && n <= TOTAL_STEPS ? n : 1) as Step;
  });
  function setStep(next: Step) {
    _setStep(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", String(next));
      window.history.replaceState({}, "", url.toString());
    }
  }
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    firstName: "", lastName: "",
    studioName: "", city: "",
    practiceTypes: [], goals: [],
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

  const canAdvance1 = data.firstName.trim().length > 0;
  const canAdvance2 = data.studioName.trim().length > 0;
  const canAdvance3 = data.practiceTypes.length > 0;

  async function handleFinish() {
    setSaving(true);
    const supabase = createClient();

    // Seed the user's project_options.type from their practice picks so the
    // Projects board defaults to a type list that matches their work. Merge with
    // any existing project_options (status / priority) so we don't clobber other
    // dimensions the signup trigger may have seeded.
    const projectTypeOptions = buildProjectTypeOptions(data.practiceTypes);
    let projectOptionsPatch: Record<string, unknown> = {};
    if (projectTypeOptions.length > 0) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("project_options")
        .eq("user_id", userId)
        .maybeSingle();
      const merged = { ...(existing?.project_options as Record<string, unknown> ?? {}), type: projectTypeOptions };
      projectOptionsPatch = { project_options: merged };
    }

    await supabase.from("profiles").upsert({
      user_id:                userId,
      display_name:           [data.firstName, data.lastName].map(s => s.trim()).filter(Boolean).join(" ") || null,
      studio_name:            data.studioName || null,
      location:               data.city || null,
      practice_types:         data.practiceTypes,
      perennial_goals:        data.goals,
      onboarding_complete:    true,   // finished the required sign-up modal
      profile_setup_complete: false,  // deep Ash-driven setup still to come
      ...projectOptionsPatch,
      // Reset the post-onboarding tour state so a fresh onboarding always
      // triggers the home canvas walkthrough. (Real users only onboard once;
      // this matters mostly for testing.)
      tour_visited:           {},
      tour_dismissed:         false,
      updated_at:             new Date().toISOString(),
    });
    localStorage.setItem("perennial-just-onboarded", "1");
    // Kick off Ash's background research on the user's niche (fire-and-forget).
    // Practice types + goals are enough signal to warm the knowledge base while
    // the user explores the canvas.
    void fetch("/api/ash/research", { method: "POST" }).catch(() => {});
    router.push("/");
    router.refresh();
  }

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
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <StepProgress current={step} total={TOTAL_STEPS} />
        </div>
      </header>

      {/* Step content */}
      <main style={{
        flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "48px 24px", position: "relative", zIndex: 1,
        overflowY: "auto",
      }}>
        <div style={{ width: "100%", maxWidth: 560 }}>

          {/* ── Step 1: Your name ────────────────────────────────────────────── */}
          {step === 1 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>First, your name</h2>
              <p style={subtitleStyle}>
                Ash addresses you by name. This takes under a minute — you&apos;ll be on your board shortly.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <FieldLabel>First name *</FieldLabel>
                  <TextInput
                    inputRef={firstInputRef as React.RefObject<HTMLInputElement>}
                    value={data.firstName}
                    onChange={v => set("firstName", v)}
                    placeholder="What should Ash call you?"
                    onEnter={() => { if (canAdvance1) setStep(2); }}
                  />
                </div>
                <div>
                  <FieldLabel>Last name</FieldLabel>
                  <TextInput
                    value={data.lastName}
                    onChange={v => set("lastName", v)}
                    placeholder="Surname (optional)"
                    onEnter={() => { if (canAdvance1) setStep(2); }}
                  />
                </div>
              </div>

              <StepFooter onNext={() => setStep(2)} nextDisabled={!canAdvance1} />
            </div>
          )}

          {/* ── Step 2: Your studio ──────────────────────────────────────────── */}
          {step === 2 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>Your studio</h2>
              <p style={subtitleStyle}>
                This appears in the sidebar and on your invoices. You can add a bio, logo, and billing details later in Settings.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <FieldLabel>Studio or practice name *</FieldLabel>
                  <TextInput
                    inputRef={firstInputRef as React.RefObject<HTMLInputElement>}
                    value={data.studioName}
                    onChange={v => set("studioName", v)}
                    placeholder="Your studio or practice name"
                    onEnter={() => { if (canAdvance2) setStep(3); }}
                  />
                </div>
                <div>
                  <FieldLabel>Where are you based?</FieldLabel>
                  <TextInput
                    value={data.city}
                    onChange={v => set("city", v)}
                    placeholder="e.g. New York, NY (optional)"
                    onEnter={() => { if (canAdvance2) setStep(3); }}
                  />
                </div>
              </div>

              <StepFooter onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!canAdvance2} />
            </div>
          )}

          {/* ── Step 3: What you make ────────────────────────────────────────── */}
          {step === 3 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>What do you make?</h2>
              <p style={subtitleStyle}>
                Pick everything that fits. Your top picks become the default project types on your Projects board.
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PRACTICE_OPTIONS.map(opt => {
                  const Icon = PRACTICE_ICONS[opt];
                  const selected = data.practiceTypes.includes(opt);
                  return (
                    <Chip key={opt} selected={selected} onClick={() => toggle("practiceTypes", opt)}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {Icon && <Icon size={12} strokeWidth={1.75} style={{ opacity: selected ? 0.95 : 0.75 }} />}
                        {opt}
                      </span>
                    </Chip>
                  );
                })}
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

              <StepFooter onBack={() => setStep(2)} onNext={() => setStep(4)} nextDisabled={!canAdvance3} />
            </div>
          )}

          {/* ── Step 4: How you want to use Perennial ────────────────────────── */}
          {step === 4 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>How do you want to use Perennial?</h2>
              <p style={subtitleStyle}>
                Pick what matters most — Ash will start here with you. You can change this any time.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                      <span style={{ fontSize: 12, fontWeight: 500, color: sel ? "var(--color-warm-white)" : "var(--color-text-secondary)" }}>
                        {opt.label}
                      </span>
                      {sel && <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>✓</span>}
                    </button>
                  );
                })}
              </div>

              <StepFooter
                onBack={() => setStep(3)}
                onNext={handleFinish}
                nextLabel={saving ? "Setting up…" : "Enter Perennial"}
                nextDisabled={saving}
                ash
              />
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
  fontSize: 24, fontWeight: 700, color: "var(--color-charcoal)",
  fontFamily: "var(--font-display)", marginBottom: 6, letterSpacing: "-0.01em",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 22,
};

const backLinkStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--color-grey)",
  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
};

function StepFooter({
  onBack, onNext, nextDisabled = false, nextLabel = "Continue →", ash = false,
}: {
  onBack?: () => void; onNext: () => void;
  nextDisabled?: boolean; nextLabel?: string; ash?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16, borderTop: "0.5px solid var(--color-border)", marginTop: 24 }}>
      {onBack
        ? <button onClick={onBack} style={backLinkStyle}>← Back</button>
        : <span />}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          padding: "9px 22px", fontSize: 12, fontWeight: 600,
          background: nextDisabled ? "var(--color-cream)" : "var(--color-sage)",
          color: nextDisabled ? "var(--color-grey)" : "var(--color-warm-white)",
          border: "none", borderRadius: 9,
          cursor: nextDisabled ? "not-allowed" : "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        {ash && !nextDisabled && <AshMark size={14} variant="on-dark" />}
        {nextLabel}
      </button>
    </div>
  );
}
