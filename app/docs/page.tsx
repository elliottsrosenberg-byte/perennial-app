"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Project",
    items: [
      { id: "overview",  label: "Overview"      },
      { id: "modules",   label: "Modules"       },
      { id: "timeline",  label: "Timeline"      },
    ],
  },
  {
    label: "Ash",
    items: [
      { id: "ash-architecture", label: "Architecture"    },
      { id: "ash-context",      label: "Context Layer"   },
      { id: "ash-prompt",       label: "System Prompt"   },
      { id: "ash-tools",        label: "Tools"           },
    ],
  },
  {
    label: "Roadmap",
    items: [
      { id: "roadmap-done",   label: "Completed"   },
      { id: "roadmap-active", label: "Active"      },
      { id: "roadmap-next",   label: "Next up"     },
    ],
  },
  {
    label: "Testing",
    items: [
      { id: "testing-projects", label: "Projects"   },
      { id: "testing-ash",      label: "Ash"        },
    ],
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

type StatusState = "live" | "progress" | "stub" | "planned";

function Status({ state }: { state: StatusState }) {
  const cfg: Record<StatusState, { label: string; bg: string; color: string }> = {
    live:     { label: "Live",        bg: "rgba(141,208,71,0.15)", color: "#3d6b4f"                   },
    progress: { label: "In progress", bg: "rgba(232,197,71,0.18)", color: "#a07800"                   },
    stub:     { label: "Stub",        bg: "rgba(184,134,11,0.12)", color: "#b8860b"                   },
    planned:  { label: "Planned",     bg: "rgba(31,33,26,0.07)",   color: "var(--color-text-tertiary)" },
  };
  const c = cfg[state];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 9999,
      background: c.bg, color: c.color,
      textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
    }}>
      {c.label}
    </span>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ id, title, subtitle, children }: {
  id: string; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ padding: "52px 56px", borderBottom: "0.5px solid var(--color-border)" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: subtitle ? 6 : 32, lineHeight: 1.2 }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
          {subtitle}
        </p>
      )}
      {children}
    </section>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em",
        color: "var(--color-text-tertiary)", marginBottom: 16,
        paddingBottom: 10, borderBottom: "0.5px solid var(--color-border)",
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--color-surface-raised)", borderRadius: 10,
      border: "0.5px solid var(--color-border)", padding: "16px 20px", ...style,
    }}>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontSize: 11, fontFamily: "monospace",
      background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
      padding: "2px 7px", borderRadius: 5, color: "var(--color-ash-dark)",
    }}>
      {children}
    </code>
  );
}

// ─── Tool row ─────────────────────────────────────────────────────────────────

function ToolKind({ kind }: { kind: "read" | "write" }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 9999,
      background: kind === "read" ? "rgba(37,99,171,0.10)" : "rgba(155,163,122,0.12)",
      color: kind === "read" ? "var(--color-blue)" : "var(--color-ash-dark)",
      textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
    }}>
      {kind}
    </span>
  );
}

function ToolDivider({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em",
      color: "var(--color-text-tertiary)", padding: "14px 24px 4px",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span>{label}</span>
      <div style={{ flex: 1, height: "0.5px", background: "var(--color-border)" }} />
    </div>
  );
}

function PlannedChips({ tools }: { tools: string[] }) {
  return (
    <div style={{ padding: "10px 24px 6px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", flexShrink: 0 }}>Planned:</span>
      {tools.map((t) => (
        <span key={t} style={{
          fontSize: 10, fontFamily: "monospace", padding: "2px 7px", borderRadius: 4,
          background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
          color: "var(--color-text-tertiary)",
        }}>
          {t}
        </span>
      ))}
    </div>
  );
}

function ToolRow({ name, status, kind, desc, inputs, note }: {
  name: string; status: StatusState; kind?: "read" | "write"; desc: string;
  inputs: { name: string; type: string; required?: boolean; note?: string }[];
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "0.5px solid var(--color-border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", padding: "12px 0", background: "none", border: "none",
          cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", width: 14, flexShrink: 0 }}>
          {open ? "▾" : "▸"}
        </span>
        <Tag>{name}</Tag>
        <Status state={status} />
        {kind && <ToolKind kind={kind} />}
        <span style={{ flex: 1, fontSize: 12, color: "var(--color-text-secondary)", marginLeft: 4, textAlign: "left" }}>
          {desc}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 24px 16px" }}>
          {note && (
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontStyle: "italic", marginBottom: 10 }}>
              {note}
            </p>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Parameter", "Type", "Required", "Description"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inputs.map((inp) => (
                <tr key={inp.name}>
                  <td style={{ padding: "6px 10px", border: "0.5px solid var(--color-border)", fontFamily: "monospace", fontSize: 11 }}>{inp.name}</td>
                  <td style={{ padding: "6px 10px", border: "0.5px solid var(--color-border)", fontFamily: "monospace", fontSize: 11, color: "var(--color-blue)" }}>{inp.type}</td>
                  <td style={{ padding: "6px 10px", border: "0.5px solid var(--color-border)", fontSize: 11, color: inp.required ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
                    {inp.required ? "yes" : "optional"}
                  </td>
                  <td style={{ padding: "6px 10px", border: "0.5px solid var(--color-border)", color: "var(--color-text-secondary)" }}>{inp.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Module row ───────────────────────────────────────────────────────────────

function ModuleRow({ name, status, features, ash }: {
  name: string; status: StatusState;
  features: string[]; ash: StatusState;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", gap: 16, padding: "14px 0", borderBottom: "0.5px solid var(--color-border)", alignItems: "start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{name}</span>
        <Status state={status} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {features.map((f) => (
          <span key={f} style={{ fontSize: 11, padding: "2px 9px", borderRadius: 9999, background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)", color: "var(--color-text-secondary)" }}>
            {f}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Ash:</span>
        <Status state={ash} />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const saved = (localStorage.getItem("perennial-theme") ?? "light") as "light" | "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("perennial-theme", next);
  }

  useEffect(() => {
    const allIds = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 }
    );
    allIds.forEach((id) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--color-surface-app)", overflow: "hidden" }}>

      {/* ── Left nav ── */}
      <nav style={{
        width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--color-surface-raised)", borderRight: "0.5px solid var(--color-border)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--color-border)", flexShrink: 0 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 12, fontSize: 11, color: "var(--color-text-tertiary)", textDecoration: "none", transition: "color 0.12s ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5"/></svg>
            Back to app
          </Link>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>perennial</span>
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>internal docs</span>
          </div>
          <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>v0.1 · updated Apr 2026</p>
        </div>

        {/* Sections */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--color-text-tertiary)", padding: "6px 20px 4px" }}>
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive = active === item.id;
                return (
                  <button key={item.id} onClick={() => scrollTo(item.id)} style={{
                    width: "100%", textAlign: "left", padding: "6px 20px",
                    fontSize: 12, border: "none", cursor: "pointer",
                    background: isActive ? "var(--color-surface-sunken)" : "transparent",
                    color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontWeight: isActive ? 500 : 400, fontFamily: "inherit",
                    borderLeft: `2px solid ${isActive ? "var(--color-charcoal)" : "transparent"}`,
                    transition: "all 0.1s ease",
                  }}>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
          <div style={{ height: "0.5px", background: "var(--color-border)", margin: "6px 12px" }} />
          <Link href="/design" style={{ display: "block", padding: "6px 20px", fontSize: 12, color: "var(--color-text-tertiary)", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}>
            → Design System
          </Link>
        </div>

        {/* Theme toggle */}
        <div style={{ padding: "12px 20px", borderTop: "0.5px solid var(--color-border)", flexShrink: 0 }}>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--color-border)" }}>
            {(["light", "dark"] as const).map((t) => (
              <button key={t} onClick={toggleTheme} style={{
                flex: 1, padding: "5px 0", fontSize: 11, fontWeight: theme === t ? 600 : 400,
                background: theme === t ? "var(--color-surface-sunken)" : "transparent",
                color: theme === t ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                border: "none", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
              }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <main style={{ flex: 1, overflowY: "auto" }}>

        {/* ════════════════════════ OVERVIEW ════════════════════════ */}
        <Section id="overview" title="Overview" subtitle="Perennial is a studio management platform for independent furniture designers, object makers, and artists. Beta target: NYCxDesign, May 2026.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[
              { label: "Target users",    value: "Independent furniture, object & art practitioners" },
              { label: "Beta launch",     value: "NYCxDesign · May 19–23, 2026" },
              { label: "Stack",           value: "Next.js 15 · Supabase · Tailwind CSS 4 · Claude API" },
              { label: "Core modules",    value: "Projects, Contacts, Notes, Finance, Resources" },
              { label: "Coming soon",     value: "Outreach, Calendar, Presence" },
              { label: "AI",             value: "Ash — claude-sonnet-4-6 with tool use + prompt caching" },
            ].map((item) => (
              <Card key={item.label}>
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>{item.label}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{item.value}</p>
              </Card>
            ))}
          </div>

          <Sub title="Key decisions">
            {[
              ["Multi-user SaaS with RLS from day one", "Supabase Auth + Row-Level Security on every table — no retrofitting needed as we add users."],
              ["Ash has full data access", "The AI assistant reads all user data in context, not just what the user pastes. This is the core differentiator."],
              ["Design system before module polish", "A /design viewer and component library (components/ui/) was built first so all modules share consistent primitives."],
              ["Prompt caching on the Ash system prompt", "The large static knowledge base (design industry context) is cached via cache_control: ephemeral, cutting per-call cost ~40%."],
            ].map(([title, detail]) => (
              <div key={title as string} style={{ padding: "12px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 3 }}>{title}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{detail}</p>
              </div>
            ))}
          </Sub>
        </Section>

        {/* ════════════════════════ MODULES ════════════════════════ */}
        <Section id="modules" title="Modules">
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", gap: 16, padding: "8px 0", borderBottom: "0.5px solid var(--color-border)" }}>
              {["Module", "Features", "Ash tools"].map((h) => (
                <p key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>{h}</p>
              ))}
            </div>
            <ModuleRow name="Projects"  status="live"     ash="live"     features={["CRUD","Status groups","Card grid","Task list","Detail panel","Time tracking","Linked contacts"]} />
            <ModuleRow name="Contacts"  status="live"     ash="live"     features={["CRUD","Tag filter","Search","Activity feed","Company linking","Bulk actions","Last contacted"]} />
            <ModuleRow name="Notes"     status="live"     ash="live"     features={["Rich text","Pin","Project link","Search","Word count"]} />
            <ModuleRow name="Finance"   status="live"     ash="live"     features={["Time tracking","Live timer","Expenses","Invoices","Overview dashboard","Project rate"]} />
            <ModuleRow name="Resources" status="progress" ash="planned"  features={["Category nav","Grid/list view","Health bar","Links tab","Upload modals — TODO"]} />
            <ModuleRow name="Outreach"  status="stub"     ash="planned"  features={["Kanban board","Pipeline mgmt","Stage tracking","Coming soon overlay"]} />
            <ModuleRow name="Calendar"  status="stub"     ash="planned"  features={["Week view","Reminders","Coming soon overlay"]} />
            <ModuleRow name="Presence"  status="stub"     ash="planned"  features={["Opportunities feed","Website/socials/newsletter tabs","Coming soon overlay"]} />
          </div>

          <Sub title="Home dashboard">
            <Card>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                All 5 home cards are wired to real Supabase data: <strong>Notes card</strong> (recent notes), <strong>Today card</strong> (reminders due today + overdue invoices), <strong>Finance card</strong> (billable hours + invoice totals), <strong>Projects card</strong> (active projects with due date badges), <strong>Contacts card</strong> (contacts not reached in 30+ days).
              </p>
            </Card>
          </Sub>
        </Section>

        {/* ════════════════════════ TIMELINE ════════════════════════ */}
        <Section id="timeline" title="Timeline">
          <Sub title="NYCxDesign countdown — ~4 weeks from project start">
            {[
              { week: "Week 1 (Apr 22–28)", title: "Foundation complete", items: ["Home dashboard wired to Supabase", "App shell, sidebar, auth", "All 5 core modules functional", "Design system + /design viewer", "components/ui/ library"] },
              { week: "Week 2 (Apr 29 – May 5)", title: "Ash Phase 1 + 2", items: ["Ash floating chat panel", "6 read tools + 2 write tools live", "Agentic loop with tool use", "Prompt caching on system prompt", "Full design industry knowledge in prompt"] },
              { week: "Week 3 (May 6–12)", title: "Module polish + educational layer", items: ["UI consistency pass across 5 modules", "Empty states + module explainers", "Resources modals", "Ash write tools per module", "Internal docs page"] },
              { week: "Week 4 (May 13–19)", title: "Beta launch prep", items: ["Onboarding flow", "Bug fixes + QA", "Beta access system", "Demo script for NYCxDesign"] },
            ].map((phase) => (
              <div key={phase.week} style={{ marginBottom: 20, padding: "16px 20px", background: "var(--color-surface-raised)", borderRadius: 10, border: "0.5px solid var(--color-border)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>{phase.week}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{phase.title}</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {phase.items.map((item) => (
                    <li key={item} style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ color: "var(--color-sage)", flexShrink: 0 }}>·</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Sub>
        </Section>

        {/* ════════════════════════ ASH ARCHITECTURE ════════════════════════ */}
        <Section id="ash-architecture" title="Ash — Architecture"
          subtitle="Ash is a Claude-powered copilot embedded throughout Perennial. It combines a rich context layer, a comprehensive system prompt, and tool use to act as a genuine business partner — not just a chatbot.">

          <Sub title="Three layers">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {[
                {
                  n: "1", title: "Context Layer",
                  desc: "Before every call, Ash fetches the user's live data: active projects, outstanding invoices, stale contacts, recent notes, upcoming reminders. This snapshot is injected as the dynamic part of the system prompt.",
                  file: "lib/ash/context.ts",
                },
                {
                  n: "2", title: "System Prompt",
                  desc: "A comprehensive static prompt (~2,000 tokens) covering: Ash's identity, who the users are, design industry knowledge, Perennial module reference, and communication guidelines. Cached via prompt caching — ~40% cost reduction.",
                  file: "lib/ash/system-prompt.ts",
                },
                {
                  n: "3", title: "Tool Use",
                  desc: "Ash runs an agentic loop (up to 5 turns). Claude can call tools mid-conversation — searching projects, fetching contact history, summarising finance — and continues streaming text after each result.",
                  file: "lib/ash/tools/index.ts",
                },
              ].map((layer) => (
                <Card key={layer.n}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--color-ash-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ash-dark)" }}>{layer.n}</span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{layer.title}</p>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>{layer.desc}</p>
                  <code style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-tertiary)" }}>{layer.file}</code>
                </Card>
              ))}
            </div>
          </Sub>

          <Sub title="Agentic loop (app/api/ash/route.ts)">
            <Card>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
                The API route runs a loop of up to 5 turns. Each turn: stream text deltas to the client, await <Tag>finalMessage()</Tag>, check <Tag>stop_reason</Tag>. If <Tag>tool_use</Tag>, execute all tool calls against Supabase, append results, loop. Otherwise break.
              </p>
              <div style={{ background: "var(--color-surface-sunken)", borderRadius: 8, padding: "12px 14px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                <div style={{ color: "var(--color-text-tertiary)" }}>// Simplified loop</div>
                {`while (turn < 5) {`}<br/>
                {`  const stream = anthropic.messages.stream({ tools, messages })`}<br/>
                {`  for await (event of stream) → send text deltas`}<br/>
                {`  const msg = await stream.finalMessage()`}<br/>
                {`  if (msg.stop_reason !== "tool_use") break`}<br/>
                {`  const results = await executeTools(msg.content)`}<br/>
                {`  messages = [...messages, assistant turn, tool results]`}<br/>
                {`}`}
              </div>
            </Card>
          </Sub>

          <Sub title="Model + cost">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Model",        value: "claude-sonnet-4-6" },
                { label: "Max tokens",   value: "2,048 / response" },
                { label: "Input cost",   value: "$3 / 1M tokens" },
                { label: "Est. per user",value: "~$0.75–1.20 / month" },
                { label: "Prompt cache", value: "~40% input savings" },
                { label: "Caching TTL",  value: "5 minutes (ephemeral)" },
                { label: "Max turns",    value: "5 per conversation" },
                { label: "History",      value: "Last 24 messages" },
              ].map((item) => (
                <Card key={item.label} style={{ padding: "12px 14px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 3 }}>{item.label}</p>
                  <p style={{ fontSize: 12, fontFamily: "monospace", color: "var(--color-text-primary)" }}>{item.value}</p>
                </Card>
              ))}
            </div>
          </Sub>
        </Section>

        {/* ════════════════════════ ASH CONTEXT LAYER ════════════════════════ */}
        <Section id="ash-context" title="Ash — Context Layer"
          subtitle="Before every call, Ash fetches a live snapshot of the user's data. This is the 'dynamic' part of the system prompt — never cached since it changes per user and per call.">

          <Sub title="What's in the context snapshot">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { field: "Active projects",        detail: "Up to 8, ordered by due date. Includes: title, status, priority, due_date." },
                { field: "Outstanding invoices",    detail: "All sent invoices — overdue (past due_at) and outstanding (not yet due). Includes amounts." },
                { field: "Billable hours (MTD)",    detail: "Sum of billable time_entries duration since month start." },
                { field: "Stale contacts",          detail: "Active contacts not reached in 30+ days, ordered by oldest. Up to 5, includes company." },
                { field: "Recent notes",            detail: "Last 3 notes updated. Includes title + 80-char preview of content." },
                { field: "Upcoming reminders",      detail: "Up to 5 reminders in the next 90 days. Includes title and due_date." },
                { field: "Current module",          detail: "Which page the user is on (home, projects, contacts, etc.) — affects which context is surfaced." },
                { field: "User email",              detail: "From Supabase auth — used to identify the user until profiles table is built." },
              ].map((item) => (
                <div key={item.field} style={{ padding: "12px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 3 }}>{item.field}</p>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{item.detail}</p>
                </div>
              ))}
            </div>
          </Sub>
        </Section>

        {/* ════════════════════════ ASH SYSTEM PROMPT ════════════════════════ */}
        <Section id="ash-prompt" title="Ash — System Prompt"
          subtitle="The static system prompt is ~2,000 tokens and cached. It defines Ash's character, knowledge base, and communication style. Edit it in lib/ash/system-prompt.ts.">

          <Sub title="What's covered (in order)">
            {[
              { topic: "Identity & role",         detail: "Ash is not a generic assistant — it's a domain expert with access to the user's actual data. Equal parts advisor, teacher, collaborator, operator." },
              { topic: "Who the users are",        detail: "Independent designers/makers: furniture, objects, lighting, ceramics, painting, sculpture, jewelry. Solo practices. Strong craft, variable business experience." },
              { topic: "Selling channels",         detail: "Galleries (40–60% commission), fairs (booth $3k–15k+), direct studio, commissions, trade, e-commerce. Economics of each explained." },
              { topic: "Fair calendar",            detail: "Sight Unseen Offsite, ICFF, Collective Design, Object & Thing, Design Miami (Dec + Basel), Salone del Mobile, PAD, 1stDibs Introspective." },
              { topic: "Gallery relationships",    detail: "Applications, commission structures, exclusivity terms, open calls, how to build relationships before applying." },
              { topic: "Press landscape",          detail: "Wallpaper*, Dezeen, Sight Unseen, AD, Elle Decor, Dwell, Galerie, Surface, T Magazine, Coveteur." },
              { topic: "Pricing fundamentals",     detail: "Why designers underprice. Cost-plus minimum. Commission structure (30–50% deposit standard). Edition vs. one-of-a-kind." },
              { topic: "Cash flow realities",      detail: "Project income creates feast-or-famine cycles. Invoice–payment gap. 3–6 months runway goal." },
              { topic: "Perennial module reference", detail: "What each module does, how they connect, and how Ash should think about each one." },
              { topic: "Communication guidelines", detail: "Direct, warm, references actual data. Proactive. Educational when it adds value. Concise unless depth needed." },
              { topic: "Educational role",         detail: "Many users lack PM/business training. Teach through their actual situation, not abstract advice." },
            ].map((item) => (
              <div key={item.topic} style={{ display: "flex", gap: 16, padding: "11px 0", borderBottom: "0.5px solid var(--color-border)", alignItems: "flex-start" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", width: 200, flexShrink: 0 }}>{item.topic}</span>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{item.detail}</span>
              </div>
            ))}
          </Sub>

          <Sub title="Things Ash doesn't know yet (to add to prompt)">
            <Card style={{ background: "rgba(232,197,71,0.06)", border: "0.5px solid rgba(232,197,71,0.25)" }}>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                These topics are not yet in the system prompt and should be added as we learn what users ask about:
              </p>
              <ul style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginTop: 8, paddingLeft: 16 }}>
                <li>Studio-specific onboarding data (practice type, primary sales channel, biggest challenge)</li>
                <li>Regional context (US-centric now — EU, UK, Asian fair/gallery ecosystems)</li>
                <li>Specific gallery names and their reputations</li>
                <li>Tax/accounting specifics for US self-employed artists</li>
                <li>Instagram, newsletter, and digital marketing strategy for makers</li>
              </ul>
            </Card>
          </Sub>
        </Section>

        {/* ════════════════════════ ASH TOOLS ════════════════════════ */}
        <Section id="ash-tools" title="Ash — Tools"
          subtitle="Organized by module. Read tools fire automatically when Claude needs more context. Write tools execute with a description of what Ash is doing. Stubs activate with one function body in lib/ash/tools/write.ts.">

          {/* ── Cross-module ── */}
          <Sub title="Cross-module — available from any page">
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12, fontStyle: "italic" }}>
              General search and summary tools. Read-only — no approval needed.
            </p>
            <ToolRow name="search_projects" status="live" kind="read"
              desc="Search projects by title, keyword, status, or priority."
              inputs={[
                { name: "query",    type: "string", required: false, note: "Text to search in titles and descriptions" },
                { name: "status",   type: "enum",   required: false, note: "in_progress | planning | on_hold | complete" },
                { name: "priority", type: "enum",   required: false, note: "high | medium | low" },
              ]}
            />
            <ToolRow name="search_contacts" status="live" kind="read"
              desc="Search contacts by name, company, title, or tag."
              inputs={[
                { name: "query",  type: "string", required: false, note: "Name, email, company, or title" },
                { name: "tag",    type: "string", required: false, note: "gallery | client | press | supplier | lead" },
                { name: "status", type: "enum",   required: false, note: "active | lead | inactive" },
              ]}
            />
            <ToolRow name="search_notes" status="live" kind="read"
              desc="Full-text search across all user notes by title or content."
              inputs={[
                { name: "query", type: "string", required: true, note: "Text to find in note titles and content" },
              ]}
            />
            <ToolRow name="get_finance_summary" status="live" kind="read"
              desc="Revenue snapshot: billable hours, invoice totals (outstanding/overdue/paid), expense breakdown by category."
              inputs={[
                { name: "period", type: "enum", required: false, note: "this_month | last_month | this_quarter | ytd" },
              ]}
            />
          </Sub>

          {/* ── Projects ── */}
          <Sub title="Projects">
            <ToolDivider label="Read" />
            <ToolRow name="get_project_details" status="live" kind="read"
              desc="Full project: all tasks, time logged, linked contacts, materials, and financial info."
              inputs={[
                { name: "project_id", type: "string", required: true, note: "UUID of the project" },
              ]}
            />
            <ToolDivider label="Write" />
            <ToolRow name="create_project" status="stub" kind="write"
              desc="Create a new project with type, priority, due date, and description."
              note="TODO — lib/ash/tools/write.ts: insert into projects table"
              inputs={[
                { name: "title",       type: "string", required: true  },
                { name: "type",        type: "enum",   required: false, note: "furniture | sculpture | painting | client_project" },
                { name: "priority",    type: "enum",   required: false, note: "high | medium | low" },
                { name: "due_date",    type: "string", required: false },
                { name: "description", type: "string", required: false },
              ]}
            />
            <ToolRow name="update_project_status" status="stub" kind="write"
              desc="Change a project's status (e.g. mark complete, put on hold)."
              note="TODO — lib/ash/tools/write.ts"
              inputs={[
                { name: "project_id", type: "string", required: true },
                { name: "status",     type: "enum",   required: true, note: "in_progress | planning | on_hold | complete" },
              ]}
            />
            <ToolRow name="add_task" status="stub" kind="write"
              desc="Add a task to a project."
              note="TODO — lib/ash/tools/write.ts"
              inputs={[
                { name: "project_id", type: "string", required: true },
                { name: "title",      type: "string", required: true },
              ]}
            />
            <PlannedChips tools={["set_project_priority", "add_contact_to_project", "link_note_to_project"]} />
          </Sub>

          {/* ── Contacts ── */}
          <Sub title="Contacts">
            <ToolDivider label="Read" />
            <ToolRow name="get_contact_details" status="live" kind="read"
              desc="Full contact: company, relationship status, last contact date, bio, and recent activity feed (last 8 interactions)."
              inputs={[
                { name: "contact_id", type: "string", required: true, note: "UUID of the contact" },
              ]}
            />
            <ToolDivider label="Write" />
            <ToolRow name="create_contact" status="stub" kind="write"
              desc="Create a new contact, optionally with company, tags, and status."
              note="TODO — lib/ash/tools/write.ts: may need companies table insert first"
              inputs={[
                { name: "first_name", type: "string",   required: true  },
                { name: "last_name",  type: "string",   required: true  },
                { name: "email",      type: "string",   required: false },
                { name: "company",    type: "string",   required: false },
                { name: "tags",       type: "string[]", required: false },
                { name: "status",     type: "enum",     required: false, note: "active | lead | inactive" },
              ]}
            />
            <ToolRow name="log_contact_activity" status="stub" kind="write"
              desc="Log an interaction against a contact: email, call, meeting, or note."
              note="TODO — lib/ash/tools/write.ts"
              inputs={[
                { name: "contact_id", type: "string", required: true },
                { name: "type",       type: "enum",   required: true, note: "email | call | meeting | note" },
                { name: "content",    type: "string", required: true },
              ]}
            />
            <PlannedChips tools={["update_contact_status", "merge_contacts", "update_last_contacted"]} />
          </Sub>

          {/* ── Notes ── */}
          <Sub title="Notes">
            <ToolDivider label="Write" />
            <ToolRow name="create_note" status="live" kind="write"
              desc="Create a note for the user, optionally linked to a project."
              inputs={[
                { name: "content",    type: "string", required: true,  note: "Note body" },
                { name: "title",      type: "string", required: false, note: "Optional title" },
                { name: "project_id", type: "string", required: false, note: "Link to a project" },
              ]}
            />
            <PlannedChips tools={["pin_note", "update_note", "search_notes_semantic"]} />
          </Sub>

          {/* ── Finance ── */}
          <Sub title="Finance">
            <ToolDivider label="Write" />
            <ToolRow name="log_time" status="stub" kind="write"
              desc="Log time worked on a project. Converted from hours/minutes to a time_entries record."
              note="TODO — lib/ash/tools/write.ts"
              inputs={[
                { name: "duration_minutes", type: "number",  required: true  },
                { name: "project_id",       type: "string",  required: false },
                { name: "description",      type: "string",  required: false },
                { name: "billable",         type: "boolean", required: false },
              ]}
            />
            <PlannedChips tools={["create_invoice", "mark_invoice_paid", "create_expense", "update_invoice_status"]} />
          </Sub>

          {/* ── Calendar & Reminders ── */}
          <Sub title="Calendar & Reminders">
            <ToolDivider label="Write" />
            <ToolRow name="create_reminder" status="live" kind="write"
              desc="Create a reminder with an optional due date and project link."
              inputs={[
                { name: "title",       type: "string", required: true,  note: "What to be reminded about" },
                { name: "due_date",    type: "string", required: false, note: "YYYY-MM-DD or ISO datetime" },
                { name: "description", type: "string", required: false },
                { name: "project_id",  type: "string", required: false },
              ]}
            />
            <PlannedChips tools={["mark_reminder_complete", "create_calendar_event", "reschedule_reminder"]} />
          </Sub>

          {/* ── Coming soon modules ── */}
          <Sub title="Coming soon modules — no tools yet">
            {[
              { module: "Outreach",  planned: ["create_outreach_target", "update_outreach_stage", "log_outreach_touch"] },
              { module: "Presence",  planned: ["save_opportunity", "update_opportunity_status", "draft_newsletter_section"] },
              { module: "Resources", planned: ["add_resource_link", "update_resource_status"] },
            ].map((m) => (
              <div key={m.module} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", width: 96, flexShrink: 0 }}>{m.module}</span>
                <PlannedChips tools={m.planned} />
              </div>
            ))}
          </Sub>
        </Section>

        {/* ════════════════════════ ROADMAP ════════════════════════ */}
        <Section id="roadmap-done" title="Roadmap — Completed">
          <Sub title="Phase 1 · Foundation">
            {["App shell + sidebar (sage, expanded default, logotype)", "Supabase auth (login, signup, RLS)", "All 5 core module UIs with real Supabase data", "Home dashboard wired to live data", "Design system viewer at /design (colors, type, spacing, shadows, icons, all components, Ash section)", "components/ui/ library (Button, Toggle, Checkbox, Select, DatePicker, NumberStepper, Badge, FilterTabs, Menu, AshMark)", "Dark/light mode with CSS variables + localStorage persistence", "Presence / Outreach / Calendar — Coming Soon overlays", "Settings page mock (Account, Studio, Preferences, Notifications, Billing, Integrations)"].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0", borderBottom: "0.5px solid var(--color-border)", fontSize: 12, color: "var(--color-text-secondary)" }}>
                <span style={{ color: "var(--color-green)", flexShrink: 0 }}>✓</span> {item}
              </div>
            ))}
          </Sub>
          <Sub title="Phase 2A · Ash infrastructure">
            {["Floating chat panel (360px / 680px expanded)", "Auto-expand on first message", "Chat history with recent conversation browser", "Markdown rendering in Ash responses (react-markdown + remark-gfm)", "6 read tools (projects, contacts, finance, notes)", "2 write tools live (create_note, create_reminder)", "6 write tool stubs with full schema", "Agentic tool-use loop (5 turns max)", "Prompt caching on static system prompt", "Tool indicator in panel while tool runs", "Conversation persistence in Supabase", "Internal docs at /docs"].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0", borderBottom: "0.5px solid var(--color-border)", fontSize: 12, color: "var(--color-text-secondary)" }}>
                <span style={{ color: "var(--color-green)", flexShrink: 0 }}>✓</span> {item}
              </div>
            ))}
          </Sub>
        </Section>

        <Section id="roadmap-active" title="Roadmap — Active">
          <Sub title="Phase 2B · Write tools per module">
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
              Each module gets its write tools activated as we do the UI consistency pass. Pattern: replace the TODO stub body in <Tag>lib/ash/tools/write.ts</Tag> with the Supabase operation.
            </p>
            {[
              { module: "Projects", tools: "create_project, update_project_status, add_task" },
              { module: "Contacts", tools: "create_contact, log_contact_activity" },
              { module: "Finance",  tools: "log_time, create_invoice, create_expense" },
              { module: "Resources", tools: "Resource modals (upload, link) + Ash indexing" },
            ].map((item) => (
              <div key={item.module} style={{ display: "flex", gap: 16, padding: "10px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", width: 100, flexShrink: 0 }}>{item.module}</span>
                <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{item.tools}</span>
              </div>
            ))}
          </Sub>
          <Sub title="UI consistency pass">
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Replacing native selects with <Tag>{"<Select />"}</Tag>, standardising button sizes and variants across all 5 modules, applying <Tag>leading-none</Tag> to button-styled links, ensuring dark mode works in every component. Then activating the write tools per module.
            </p>
          </Sub>
        </Section>

        <Section id="roadmap-next" title="Roadmap — Next up">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { phase: "Phase 3", title: "Onboarding", detail: "4-step wizard (name → studio → practice type → first project). Data stored in user_profiles table. Home dashboard and Ash system prompt adapt based on practice type." },
              { phase: "Phase 3", title: "Educational layer", detail: "First-visit module intros (dismissable overlay). Contextual ? button pre-primed with module context. Rich empty states with educational copy." },
              { phase: "Phase 3", title: "Proactive Ash insights", detail: "Ash surfaces patterns without being asked: overdue invoice alerts in Today card, stale relationship prompts in Contacts card, project deadline warnings." },
              { phase: "Phase 3", title: "Contacts: filtered view modes", detail: "Mode switcher (All / Leads / Follow-ups / Recent) on the Contacts page. Tag filter stays within the active mode." },
              { phase: "Phase 4", title: "MCP ecosystem", detail: "Google Calendar, Mailchimp, Figma, Stripe, QuickBooks. Each integration is 1–3 days of work once the MCP pattern is established. Priority by user request." },
              { phase: "Phase 4", title: "Outreach, Calendar, Presence", detail: "Remove Coming Soon overlays. Full module builds. Ash tools for each." },
              { phase: "Beta+", title: "Payments (Stripe)", detail: "Post-launch. Free beta → paid tier. Pricing TBD. Billing page in Settings is already mocked." },
            ].map((item) => (
              <Card key={item.title}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 9999, background: "rgba(37,99,171,0.10)", color: "var(--color-blue)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.phase}</span>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{item.title}</p>
                </div>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{item.detail}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ════════════════════════ TESTING — PROJECTS ════════════════════════ */}
        <Section id="testing-projects" title="Testing — Projects"
          subtitle="Run end-to-end in a logged-in session against live Supabase. Check off as you go. File lives at Test-Folder/functionality-tests.md.">

          {[
            {
              group: "Creation",
              tests: [
                "Create with each type: Furniture, Sculpture, Painting, Client",
                "Create with all fields — verify Supabase row matches exactly",
                "Create with only title — verify defaults (status: planning, priority: medium)",
                "DatePicker stores correct YYYY-MM-DD (not datetime)",
                "Modal closes on backdrop click and Escape key",
                "Cancel closes without creating",
                "Cannot submit without title",
              ],
            },
            {
              group: "Grid & Status",
              tests: [
                "New project appears at top of correct status group",
                "Status ordering: Planning → In Progress → On Hold → Complete → Cut",
                "Cut section hidden in 'All' view when empty",
                "Filter tabs show correct counts",
                "Filtering by each tab shows only matching projects",
              ],
            },
            {
              group: "Drag and Drop",
              tests: [
                "Drag Planning → In Progress: status updates in Supabase",
                "Drag to Cut: card appears at 65% opacity with red-orange bar",
                "Drag to Complete: accent bar turns green",
                "Drop zone appears with dashed border on hover",
                "Empty group shows 'Drop a project here' hint",
                "Optimistic update is immediate; write happens in background",
              ],
            },
            {
              group: "Detail Panel",
              tests: [
                "Opening card populates all fields from DB",
                "Edit title inline — saves on blur",
                "Edit description inline — saves on blur",
                "Change status dropdown — DB updates",
                "Change priority — card badge updates",
                "Edit type — type-specific fields show/hide correctly",
                "Edit due date — card deadline badge updates",
              ],
            },
            {
              group: "Tasks (Checklist)",
              tests: [
                "Tasks load from DB on panel open",
                "Add a task — persists in Supabase",
                "Check task complete — toggles in DB",
                "Task progress bar on card reflects completion ratio",
              ],
            },
            {
              group: "Reminders",
              tests: [
                "Create reminder from Reminders tab — appears in DB",
                "Reminder with due date shows in Today card on Home",
                "Reminder appears in Calendar module",
                "Toggle complete — updates DB",
              ],
            },
            {
              group: "Delete",
              tests: [
                "Delete shows confirmation dialog",
                "Confirm: project removed from DB and grid, panel closes",
                "Cancel: no change",
              ],
            },
          ].map(({ group, tests }) => (
            <Sub key={group} title={group}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {tests.map((t) => (
                  <div key={t} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--color-border)",
                      flexShrink: 0, marginTop: 1,
                    }} />
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{t}</span>
                  </div>
                ))}
              </div>
            </Sub>
          ))}
        </Section>

        {/* ════════════════════════ TESTING — ASH ════════════════════════ */}
        <Section id="testing-ash" title="Testing — Ash">
          <Sub title="Core behaviour">
            {[
              "Open panel — module-appropriate suggestions appear",
              "Send message — response streams correctly",
              "Panel auto-expands on first message",
              "History dropdown shows past conversations",
              "Load past conversation — messages restore",
              "Markdown renders: bold, italic, lists, code blocks",
              "Conversation persists in Supabase after session ends",
            ].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--color-border)", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </Sub>
          <Sub title="Read tools">
            {[
              "search_projects — fires when asking about a named project",
              "get_project_details — returns tasks and time data",
              "search_contacts — returns matching contacts by name/company",
              "get_contact_details — returns activity feed",
              "get_finance_summary — returns correct period totals",
              "search_notes — finds notes by content",
              "Tool indicator shows while tool is running",
            ].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--color-border)", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </Sub>
          <Sub title="Write tools (live)">
            {[
              "create_note — note appears in Notes module",
              "create_reminder — reminder appears in Calendar and Today card",
            ].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid var(--color-border)", flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{t}</span>
              </div>
            ))}
          </Sub>
        </Section>

        {/* Footer */}
        <div style={{ padding: "40px 56px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            Perennial Internal Docs · v0.1 · For Elliott's use during development
          </p>
        </div>

      </main>
    </div>
  );
}
