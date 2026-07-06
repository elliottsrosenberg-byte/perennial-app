"use client";

// Short, required sign-up (3 screens), centered and colourful so it holds weight
// for the whole flow. Collects only what the app needs to feel personalized —
// name, what they make, and how much they want Perennial to guide them (their
// guidance level). Everything deeper is gathered later by Ash. State model:
//   onboarding_complete    → finished this modal (gates the /onboarding redirect)
//   profile_setup_complete → finished the Ash-guided deep setup (starts false)
//   guidance_level         → guided | balanced | expert (drives Ash + the board)

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Armchair, Lamp, Diamond, Gem, Palette, Hammer, PenTool, Briefcase,
  Boxes, Pencil, Video, Monitor, Code2, Shapes, Sprout, Compass, Rocket, Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PALETTE, paletteColorForKey, hexToRgba } from "@/lib/ui/palette";

// ─── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

const PRACTICE_OPTIONS = [
  "Furniture", "Objects & lighting", "Ceramics & glass", "Textiles",
  "Jewelry", "Painting", "Illustration", "Sculpture", "Printmaking",
  "Video", "Graphic design", "Websites", "Software", "Client-based work",
];

// Stable key + palette colour per practice option so the Projects board can
// default to a type list that mirrors how the user describes their work — and so
// each chip carries its own colour here. Colours are named from the canonical
// user-pick palette (lib/ui/palette.ts).
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

/** The colour for a practice chip — its mapped palette hue, or a deterministic
 *  palette colour for a custom "Other" entry. */
function practiceHex(opt: string): string {
  const map = PRACTICE_TO_PROJECT_TYPE[opt];
  return map ? paletteHex(map.palette) : paletteColorForKey(opt).hex;
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
const GUIDANCE_OPTIONS: {
  id: GuidanceLevel; title: string; sub: string; payoff: string; Icon: LucideIcon; palette: string;
}[] = [
  { id: "guided",   title: "I'm just getting started", sub: "New to the business side — it's mostly in my head or scattered notes.", payoff: "Great — I'll keep things hands-on and teach as we go.",   Icon: Sprout,  palette: "Green"  },
  { id: "balanced", title: "I'm finding my footing",   sub: "I've got some systems, but they're patchy and don't always stick.",   payoff: "Perfect — I'll guide where it helps and move fast where it doesn't.", Icon: Compass, palette: "Blue"   },
  { id: "expert",   title: "I've got this down",       sub: "I already run on real tools — I just want it all in one place.",       payoff: "Got it — I'll keep it fast and skip the basics.",         Icon: Rocket,  palette: "Purple" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

interface OnboardingData {
  firstName:     string;
  lastName:      string;
  studioName:    string;
  practiceTypes: string[];
  guidanceLevel: GuidanceLevel | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Centered, clear 3-step progress: filled + elongated for the current step,
// with a small "N / 3" label.
function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 6, borderRadius: 99,
            width: i === current - 1 ? 30 : 6,
            background: i < current ? "var(--color-sage)" : "var(--color-border-strong)",
            transition: "all 0.25s ease",
          }}
        />
      ))}
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", marginLeft: 6, letterSpacing: "0.02em" }}>
        {current} / {total}
      </span>
    </div>
  );
}

function BigInput({
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
        width: "100%", padding: "13px 16px", fontSize: 15,
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)", borderRadius: 12,
        color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none",
        boxSizing: "border-box" as const, textAlign: "center",
        transition: "border-color 0.12s ease, box-shadow 0.12s ease",
      }}
      onFocus={e => { e.target.style.borderColor = "var(--color-sage)"; e.target.style.boxShadow = "0 0 0 3px rgba(var(--color-sage-rgb),0.15)"; }}
      onBlur={e => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
    />
  );
}

function OtherInput({
  values, knownIds, onAdd,
}: { values: string[]; knownIds: string[]; onAdd: (v: string) => void }) {
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, maxWidth: 340, marginInline: "auto" }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder="Add your own…"
        style={{
          flex: 1, padding: "9px 13px", fontSize: 13,
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border)", borderRadius: 10,
          color: "var(--color-charcoal)", fontFamily: "inherit", outline: "none", textAlign: "center",
        }}
        onFocus={e => (e.target.style.borderColor = "var(--color-sage)")}
        onBlur={e => (e.target.style.borderColor = "var(--color-border)")}
      />
      <button
        type="button" onClick={submit} disabled={!ready}
        style={{
          fontSize: 12, fontWeight: 600,
          background: ready ? "var(--color-sage)" : "var(--color-cream)",
          color: ready ? "var(--color-warm-white)" : "var(--color-grey)",
          border: "none", borderRadius: 9, padding: "9px 16px",
          cursor: ready ? "pointer" : "not-allowed", fontFamily: "inherit",
        }}
      >
        Add
      </button>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function OnboardingClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    firstName: "", lastName: "", studioName: "", practiceTypes: [], guidanceLevel: null,
  });

  const firstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => firstInputRef.current?.focus(), 150); }, [step]);

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

  const canAdvance1 = data.firstName.trim().length > 0 && data.lastName.trim().length > 0;
  const canAdvance2 = data.practiceTypes.length > 0;
  const canFinish   = data.guidanceLevel !== null;

  async function handleFinish() {
    if (!canFinish) return;
    setSaving(true);
    const supabase = createClient();

    const projectTypeOptions = buildProjectTypeOptions(data.practiceTypes);
    let projectOptionsPatch: Record<string, unknown> = {};
    if (projectTypeOptions.length > 0) {
      const { data: existing } = await supabase
        .from("profiles").select("project_options").eq("user_id", userId).maybeSingle();
      const merged = { ...(existing?.project_options as Record<string, unknown> ?? {}), type: projectTypeOptions };
      projectOptionsPatch = { project_options: merged };
    }

    await supabase.from("profiles").upsert({
      user_id:                userId,
      display_name:           [data.firstName, data.lastName].map(s => s.trim()).filter(Boolean).join(" ") || null,
      studio_name:            data.studioName.trim() || null,
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
    void fetch("/api/ash/research", { method: "POST" }).catch(() => {});
    router.push("/");
    router.refresh();
  }

  function goNext() {
    if (step === 1 && canAdvance1) setStep(2);
    else if (step === 2 && canAdvance2) setStep(3);
    else if (step === 3) handleFinish();
  }

  const nextDisabled =
    (step === 1 && !canAdvance1) ||
    (step === 2 && !canAdvance2) ||
    (step === 3 && (!canFinish || saving));
  const nextLabel = step === 3 ? (saving ? "Setting up…" : "Enter Perennial") : "Continue";
  const maxW = step === 3 ? 780 : step === 2 ? 640 : 420;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-warm-white)",
        display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* Soft, blurred colour blobs for depth + engagement. */}
      <Blob hex={paletteHex("Green")}  size={520} top="-14%"  left="-10%" alpha={0.20} />
      <Blob hex={paletteHex("Blue")}   size={460} top="8%"    right="-12%" alpha={0.16} />
      <Blob hex={paletteHex("Purple")} size={440} bottom="-16%" left="14%" alpha={0.14} />
      <Blob hex={paletteHex("Orange")} size={360} bottom="-12%" right="6%" alpha={0.12} />

      {/* Wordmark, top-left */}
      <div style={{ position: "absolute", top: 24, left: 32, zIndex: 2 }}>
        <Image src="/Logotype.svg" alt="Perennial" width={112} height={26} style={{ height: "auto", opacity: 0.85 }} />
      </div>

      {/* Centered content */}
      <main style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "80px 24px 48px", position: "relative", zIndex: 1,
      }}>
        <div style={{ width: "100%", maxWidth: maxW, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>

          <StepProgress current={step} total={TOTAL_STEPS} />

          {/* ── Step 1: Welcome + name ───────────────────────────────────────── */}
          {step === 1 && (
            <>
              <Header
                title="Welcome to Perennial"
                subtitle="First things first, tell us a bit about yourself."
              />
              <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}>
                <BigInput
                  inputRef={firstInputRef as React.RefObject<HTMLInputElement>}
                  value={data.firstName}
                  onChange={v => set("firstName", v)}
                  placeholder="First name"
                  onEnter={goNext}
                />
                <BigInput
                  value={data.lastName}
                  onChange={v => set("lastName", v)}
                  placeholder="Last name"
                  onEnter={goNext}
                />
                <BigInput
                  value={data.studioName}
                  onChange={v => set("studioName", v)}
                  placeholder="Studio or practice name (optional)"
                  onEnter={goNext}
                />
              </div>
            </>
          )}

          {/* ── Step 2: What you make ────────────────────────────────────────── */}
          {step === 2 && (
            <>
              <Header
                title="What do you make?"
                subtitle="Pick everything that fits — your top picks shape your board."
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                {PRACTICE_OPTIONS.map(opt => {
                  const Icon = PRACTICE_ICONS[opt];
                  const selected = data.practiceTypes.includes(opt);
                  const hex = practiceHex(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggle("practiceTypes", opt)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 16px", borderRadius: 999, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
                        background: selected ? hex : hexToRgba(hex, 0.08),
                        color: selected ? "#fff" : "var(--color-text-secondary)",
                        border: `1px solid ${selected ? hex : hexToRgba(hex, 0.35)}`,
                        transition: "all 0.12s ease",
                      }}
                    >
                      {Icon && <Icon size={15} strokeWidth={1.9} style={{ color: selected ? "#fff" : hex }} />}
                      {opt}
                    </button>
                  );
                })}
                {data.practiceTypes.filter(v => !PRACTICE_OPTIONS.includes(v)).map(v => {
                  const hex = practiceHex(v);
                  return (
                    <button
                      key={v}
                      onClick={() => toggle("practiceTypes", v)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "10px 16px", borderRadius: 999, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13.5, fontWeight: 500,
                        background: hex, color: "#fff", border: `1px solid ${hex}`,
                      }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              <OtherInput
                values={data.practiceTypes}
                knownIds={PRACTICE_OPTIONS}
                onAdd={v => set("practiceTypes", [...data.practiceTypes, v])}
              />
            </>
          )}

          {/* ── Step 3: How you work today (guidance level) ──────────────────── */}
          {step === 3 && (
            <>
              <Header
                title="How do you work today?"
                subtitle="So Perennial fits you — there's no wrong answer."
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, width: "100%" }}>
                {GUIDANCE_OPTIONS.map(opt => {
                  const sel = data.guidanceLevel === opt.id;
                  const hex = paletteHex(opt.palette);
                  const Icon = opt.Icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => set("guidanceLevel", opt.id)}
                      style={{
                        position: "relative",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                        padding: "26px 18px 22px", borderRadius: 16, cursor: "pointer",
                        fontFamily: "inherit", textAlign: "center", minHeight: 220,
                        background: sel ? hexToRgba(hex, 0.08) : "var(--color-surface-raised)",
                        border: `1.5px solid ${sel ? hex : "var(--color-border)"}`,
                        boxShadow: sel ? `0 8px 28px ${hexToRgba(hex, 0.20)}` : "var(--shadow-sm)",
                        transition: "all 0.14s ease",
                      }}
                    >
                      {/* Check, top-right */}
                      <span style={{
                        position: "absolute", top: 12, right: 12,
                        width: 20, height: 20, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: sel ? hex : "transparent",
                        border: sel ? "none" : "1.5px solid var(--color-border-strong)",
                        color: "#fff",
                      }}>
                        {sel && <Check size={12} strokeWidth={3} />}
                      </span>

                      <div style={{
                        width: 54, height: 54, borderRadius: 14,
                        background: hexToRgba(hex, 0.14), color: hex,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon size={26} strokeWidth={1.6} />
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-charcoal)", lineHeight: 1.25 }}>
                        {opt.title}
                      </span>
                      <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--color-grey)" }}>
                        {opt.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ minHeight: 18 }}>
                {data.guidanceLevel && (
                  <p style={{ fontSize: 13, color: "var(--color-sage-text)", textAlign: "center", lineHeight: 1.5 }}>
                    {GUIDANCE_OPTIONS.find(o => o.id === data.guidanceLevel)?.payoff}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Continue + Back */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 4 }}>
            <button
              onClick={goNext}
              disabled={nextDisabled}
              style={{
                minWidth: 240, padding: "13px 28px", fontSize: 14, fontWeight: 600,
                background: nextDisabled ? "var(--color-cream)" : "var(--color-sage)",
                color: nextDisabled ? "var(--color-grey)" : "var(--color-warm-white)",
                border: "none", borderRadius: 12,
                cursor: nextDisabled ? "not-allowed" : "pointer", fontFamily: "inherit",
                boxShadow: nextDisabled ? "none" : "0 6px 20px rgba(var(--color-sage-rgb),0.32)",
                transition: "opacity 0.12s ease",
              }}
            >
              {nextLabel}
            </button>
            {step > 1 && (
              <button
                onClick={() => setStep((step - 1) as Step)}
                style={{ fontSize: 12.5, color: "var(--color-grey)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}
              >
                ← Back
              </button>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

// ─── Presentational bits ──────────────────────────────────────────────────────

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ textAlign: "center", maxWidth: 520 }}>
      <h1 style={{
        fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 500,
        color: "var(--color-charcoal)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 8,
      }}>
        {title}
      </h1>
      <p style={{ fontSize: 15, color: "var(--color-text-secondary)", lineHeight: 1.55 }}>
        {subtitle}
      </p>
    </div>
  );
}

// A soft, heavily-blurred colour circle in the background.
function Blob({
  hex, size, alpha, top, left, right, bottom,
}: {
  hex: string; size: number; alpha: number;
  top?: string; left?: string; right?: string; bottom?: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", top, left, right, bottom,
        width: size, height: size, borderRadius: "50%",
        background: hexToRgba(hex, alpha),
        filter: "blur(90px)",
        pointerEvents: "none", zIndex: 0,
      }}
    />
  );
}
