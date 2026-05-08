"use client";

import { useState, useEffect } from "react";
import AshMark from "@/components/ui/AshMark";
import { createClient } from "@/lib/supabase/client";
import { X } from "lucide-react";

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";

const GOAL_LABELS: Record<string, string> = {
  projects:  "track your projects",
  invoicing: "send professional invoices",
  time:      "log time and understand profitability",
  contacts:  "build and maintain relationships",
  outreach:  "stay on top of gallery outreach",
  presence:  "catch opportunities and build visibility",
  ash:       "use AI to think through business decisions",
};

const CHALLENGE_MODULES: Record<string, { label: string; href: string }> = {
  "Getting paid on time":           { label: "Finance", href: "/finance" },
  "Finding new collectors or clients": { label: "Outreach", href: "/outreach" },
  "Pricing my work correctly":       { label: "Finance", href: "/finance" },
  "Gallery representation":          { label: "Outreach", href: "/outreach" },
  "Staying organized across projects": { label: "Projects", href: "/projects" },
  "Press and visibility":            { label: "Presence", href: "/presence" },
  "Tracking time and profitability": { label: "Finance", href: "/finance" },
  "Managing client expectations":    { label: "Contacts", href: "/contacts" },
};

export default function WelcomeBanner() {
  const [visible,    setVisible]    = useState(false);
  const [dismissed,  setDismissed]  = useState(false);
  const [studioName, setStudioName] = useState<string | null>(null);
  const [goals,      setGoals]      = useState<string[]>([]);
  const [challenges, setChallenges] = useState<string[]>([]);

  useEffect(() => {
    if (!localStorage.getItem("perennial-just-onboarded")) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("studio_name, perennial_goals, primary_challenges")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (prof) {
        setStudioName(prof.studio_name ?? null);
        setGoals(prof.perennial_goals ?? []);
        setChallenges(prof.primary_challenges ?? []);
      }
      setVisible(true);
    });
  }, []);

  function dismiss() {
    setDismissed(true);
    localStorage.removeItem("perennial-just-onboarded");
  }

  function openAsh(msg: string) {
    window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: msg } }));
  }

  if (!visible || dismissed) return null;

  const firstName = studioName
    ? studioName.split(" ").slice(0, 2).join(" ")
    : null;

  const topChallenge = challenges[0] ? CHALLENGE_MODULES[challenges[0]] : null;
  const topGoalLabel = goals[0] ? GOAL_LABELS[goals[0]] : null;

  const ashPrompt = [
    studioName ? `I just finished setting up ${studioName} in Perennial.` : "I just finished setting up my studio in Perennial.",
    goals.length > 0 ? `My main goals are: ${goals.map(g => GOAL_LABELS[g] ?? g).join(", ")}.` : "",
    challenges.length > 0 ? `My biggest challenges right now: ${challenges.join("; ")}.` : "",
    "Give me a concrete, specific plan for my first week. What should I set up first? Walk me through it step by step.",
  ].filter(Boolean).join(" ");

  return (
    <div
      style={{
        borderRadius: 14, overflow: "hidden", marginBottom: 4,
        background: ASH_GRADIENT,
        border: "0.5px solid rgba(255,255,255,0.08)",
        position: "relative",
      }}
    >
      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white" }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
      >
        <X size={13} strokeWidth={2} />
      </button>

      <div style={{ padding: "20px 24px 18px" }}>
        {/* Ash + heading */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AshMark size={17} variant="on-dark" animate />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "white", lineHeight: 1.2 }}>
              {firstName ? `Welcome, ${firstName}.` : "You're in."}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.2 }}>
              Ash is ready with a personalized plan for your first week.
            </p>
          </div>
        </div>

        {/* Context chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
          {goals.slice(0, 3).map(g => (
            <span key={g} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 999, background: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.85)", border: "0.5px solid rgba(255,255,255,0.2)" }}>
              {GOAL_LABELS[g] ?? g}
            </span>
          ))}
          {challenges.slice(0, 2).map(c => (
            <span key={c} style={{ fontSize: 10, padding: "3px 9px", borderRadius: 999, background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.7)", border: "0.5px solid rgba(255,255,255,0.15)" }}>
              {c}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => openAsh(ashPrompt)}
            style={{ fontSize: 11, fontWeight: 700, color: "white", background: "rgba(255,255,255,0.22)", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.32)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
          >
            <AshMark size={12} variant="on-dark" />
            Get my first-week plan →
          </button>

          {topChallenge && (
            <a
              href={topChallenge.href}
              style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.8)", background: "transparent", border: "0.5px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", textDecoration: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.color = "white"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)"; }}
            >
              Go to {topChallenge.label}
            </a>
          )}

          {topGoalLabel && !topChallenge && (
            <button
              onClick={() => openAsh(`Help me get started with: ${topGoalLabel}. Walk me through setting this up in Perennial.`)}
              style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.8)", background: "transparent", border: "0.5px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "white"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
            >
              Start: {topGoalLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
