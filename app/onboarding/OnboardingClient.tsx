"use client";

// Short, required sign-up (3 screens). Collects only what the app needs to feel
// personalized from the first screen — name, what they make, and how much they
// want Perennial to guide them (their guidance level). Everything deeper is
// gathered later by Ash, conversationally. See the state model:
//   onboarding_complete    → finished this modal (gates the /onboarding redirect)
//   profile_setup_complete → finished the Ash-guided deep setup (starts false)
//   guidance_level         → guided | balanced | expert (drives Ash + the board)

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Armchair, Lamp, Diamond, Gem, Palette, Hammer, PenTool, Briefcase,
  Boxes, Pencil, Video, Monitor, Code2, Shapes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PALETTE, paletteColorForKey } from "@/lib/ui/palette";

// ─── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

const PRACTICE_OPTIONS = [
  "Furniture", "Objects & lighting", "Ceramics & glass", "Textiles",
  "Jewelry", "Painting", "Illustration", "Sculpture", "Printmaking",
  "Video", "Graphic design", "Websites", "Software", "Client-based work",
];

// Stable key + palette colour per practice option so the Projects board can
// default to a type list that mirrors how the user describes their work. Colours
// are named from the canonical user-pick palette (lib/ui/palette.ts).
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
  const seen = new Set<string>();
  const out: { key: string; label: string; color: string }[] = [];
  for (const p of practiceTypes) {
    const map = PRACTICE_TO_PROJECT_TYPE[p];
    if (map && !seen.has(map.key)) {
      out.push({ key: map.key, label: p, color: paletteHex(map.palette) });
      seen.add(map.key);
    } else if (!map && !seen.has(p.toLowerCase())) {
      out.push({ key: p.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: p, color: paletteColorForKey(p).hex });
      seen.add(p.toLowerCase());
    }
  }
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

type GuidanceLevel = "guided" | "balanced" | "expert";
const GUIDANCE_OPTIONS: { id: GuidanceLevel; title: string; sub: string; payoff: string }[] = [
  { id: "guided",   title: "I'm just getting started", sub: "New to the business side — it's mostly in my head or scattered notes.", payoff: "Great — I'll keep things hands-on and teach as we go." },
  { id: "balanced", title: "I'm finding my footing",   sub: "I've got some systems, but they're patchy and don't always stick.",   payoff: "Perfect — I'll guide where it helps and move fast where it doesn't." },
  { id: "expert",   title: "I've got this down",       sub: "I already run on real tools — I just want it all in one place.",       payoff: "Got it — I'll keep it fast and skip the basics." },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface OnboardingData {
  firstName:     string;
  lastName:      string;
  practiceTypes: string[];
  guidanceLevel: GuidanceLevel | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Chip({
  selected, onClick, children,
}: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 15px",
        borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.1s ease", textAlign: "left",
        background: selected ? "var(--color-sage)" : "var(--color-off-white)",
        color:      selected ? "var(--color-warm-white)" : "var(--color-text-secondary)",
        border:     `0.5px solid ${selected ? "var(--color-sage)" : "var(--color-border)"}`,
        fontSize: 12.5, fontWeight: 500,
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
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
  value, onChange, placeholder, onEnter, inputRef,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  onEnter?: () => void; inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "10px 13px", fontSize: 13,
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
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    firstName: "", lastName: "", practiceTypes: [], guidanceLevel: null,
  });

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 150);
  }, [step]);

  // Prefill the name from the OAuth identity (Google/Microsoft) so most users
  // just confirm rather than type. Only fills empty fields.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const m = (user?.user_metadata ?? {}) as Record<string, string>;
      const given  = m.given_name  || m.first_name;
      const family = m.family_name || m.last_name;
      const full   = m.full_name   || m.name;
      setData(d => {
        if (d.firstName || d.lastName) return d;
        if (given || family) return { ...d, firstName: given ?? "", lastName: family ?? "" };
        if (full) {
          const [f, ...r] = String(full).trim().split(/\s+/);
          return { ...d, firstName: f ?? "", lastName: r.join(" ") };
        }
        return d;
      });
    })();
  }, []);

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
  const canAdvance2 = data.practiceTypes.length > 0;
  const canFinish   = data.guidanceLevel !== null;

  async function handleFinish() {
    if (!canFinish) return;
    setSaving(true);
    const supabase = createClient();

    // Seed project_options.type from their practice picks so the Projects board
    // defaults to a type list that matches their work. Merge with any existing
    // project_options so we don't clobber status/priority.
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
      practice_types:         data.practiceTypes,
      guidance_level:         data.guidanceLevel,
      onboarding_complete:    true,
      profile_setup_complete: false,
      ...projectOptionsPatch,
      tour_visited:           {},
      tour_dismissed:         false,
      updated_at:             new Date().toISOString(),
    });
    localStorage.setItem("perennial-just-onboarded", "1");
    // Warm Ash's background research on their niche (fire-and-forget).
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

          {/* ── Step 1: Welcome + name ───────────────────────────────────────── */}
          {step === 1 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>Welcome to Perennial</h2>
              <p style={subtitleStyle}>
                First things first — tell us a bit about yourself. This takes under a minute.
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

          {/* ── Step 2: What you make ────────────────────────────────────────── */}
          {step === 2 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>What do you make?</h2>
              <p style={subtitleStyle}>
                Pick everything that fits. Your top picks become the default project types on your board.
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PRACTICE_OPTIONS.map(opt => {
                  const Icon = PRACTICE_ICONS[opt];
                  const selected = data.practiceTypes.includes(opt);
                  return (
                    <Chip key={opt} selected={selected} onClick={() => toggle("practiceTypes", opt)}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {Icon && <Icon size={13} strokeWidth={1.75} style={{ opacity: selected ? 0.95 : 0.75 }} />}
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

              <StepFooter onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!canAdvance2} />
            </div>
          )}

          {/* ── Step 3: How you work today (guidance level) ──────────────────── */}
          {step === 3 && (
            <div style={panelStyle}>
              <h2 style={titleStyle}>How do you work today?</h2>
              <p style={subtitleStyle}>
                So Perennial fits you — no wrong answer, and you can change this any time.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {GUIDANCE_OPTIONS.map(opt => {
                  const sel = data.guidanceLevel === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => set("guidanceLevel", opt.id)}
                      style={{
                        display: "flex", flexDirection: "column", gap: 3,
                        padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                        fontFamily: "inherit", textAlign: "left",
                        background: sel ? "var(--color-sage)" : "var(--color-off-white)",
                        border: `0.5px solid ${sel ? "var(--color-sage)" : "var(--color-border)"}`,
                        transition: "all 0.1s ease",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: sel ? "var(--color-warm-white)" : "var(--color-charcoal)" }}>
                        {opt.title}
                      </span>
                      <span style={{ fontSize: 12, lineHeight: 1.5, color: sel ? "rgba(255,255,255,0.85)" : "var(--color-grey)" }}>
                        {opt.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {data.guidanceLevel && (
                <p style={{ fontSize: 12, color: "var(--color-sage-text)", marginTop: 14, lineHeight: 1.5 }}>
                  {GUIDANCE_OPTIONS.find(o => o.id === data.guidanceLevel)?.payoff}
                </p>
              )}

              <StepFooter
                onBack={() => setStep(2)}
                onNext={handleFinish}
                nextLabel={saving ? "Setting up…" : "Enter Perennial"}
                nextDisabled={!canFinish || saving}
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
  onBack, onNext, nextDisabled = false, nextLabel = "Continue →",
}: {
  onBack?: () => void; onNext: () => void;
  nextDisabled?: boolean; nextLabel?: string;
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
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}
