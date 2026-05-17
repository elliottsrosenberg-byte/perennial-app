"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─── Version ──────────────────────────────────────────────────────────────────

const APP_VERSION = "0.9.0 — Beta";
const DOCS_UPDATED = "May 16, 2026";

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Start here",
    items: [
      { id: "welcome",   label: "Welcome"             },
      { id: "setup",     label: "Setup & onboarding"  },
      { id: "concepts",  label: "Core concepts"       },
    ],
  },
  {
    label: "Modules",
    items: [
      { id: "modules",          label: "Module overview"     },
      { id: "module-projects",  label: "Projects & Tasks"    },
      { id: "module-contacts",  label: "Contacts & Outreach" },
      { id: "module-notes",     label: "Notes"               },
      { id: "module-finance",   label: "Finance"             },
      { id: "module-calendar",  label: "Calendar"            },
      { id: "module-presence",  label: "Presence"            },
      { id: "module-resources", label: "Resources"           },
    ],
  },
  {
    label: "Ash · your AI partner",
    items: [
      { id: "ash-overview", label: "What Ash is"      },
      { id: "ash-using",    label: "How to use Ash"   },
      { id: "ash-tools",    label: "What Ash can do"  },
      { id: "ash-privacy",  label: "Privacy & data"   },
    ],
  },
  {
    label: "Integrations",
    items: [
      { id: "int-overview",  label: "Overview"          },
      { id: "int-google",    label: "Google"            },
      { id: "int-microsoft", label: "Microsoft"         },
      { id: "int-banking",   label: "Banking"           },
      { id: "int-social",    label: "Social & web"      },
      { id: "int-email",     label: "Invoice email"     },
    ],
  },
  {
    label: "Roadmap",
    items: [
      { id: "roadmap-done",   label: "Shipped"      },
      { id: "roadmap-active", label: "In progress"  },
      { id: "roadmap-next",   label: "Coming next"  },
    ],
  },
  {
    label: "Support",
    items: [
      { id: "faq",             label: "FAQ"              },
      { id: "troubleshooting", label: "Troubleshooting"  },
      { id: "shortcuts",       label: "Keyboard shortcuts" },
      { id: "tooling",         label: "Under the hood"   },
      { id: "version-history", label: "Version history"  },
      { id: "contact",         label: "Contact us"       },
    ],
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

type StatusState = "live" | "progress" | "stub" | "planned";

function Status({ state }: { state: StatusState }) {
  const cfg: Record<StatusState, { label: string; bg: string; color: string }> = {
    live:     { label: "Live",        bg: "rgba(141,208,71,0.15)", color: "#3d6b4f"                   },
    progress: { label: "In progress", bg: "rgba(232,197,71,0.18)", color: "#a07800"                   },
    stub:     { label: "Preview",     bg: "rgba(184,134,11,0.12)", color: "#b8860b"                   },
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
    <section id={id} style={{ padding: "52px 56px", borderBottom: "0.5px solid var(--color-border)", scrollMarginTop: 24 }}>
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
    <div style={{ padding: "16px 18px", background: "var(--color-surface-raised)", borderRadius: 10, border: "0.5px solid var(--color-border)", ...style }}>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontFamily: "monospace", padding: "1px 6px",
      background: "var(--color-surface-sunken)", border: "0.5px solid var(--color-border)",
      borderRadius: 4, color: "var(--color-text-secondary)",
    }}>
      {children}
    </span>
  );
}

function ToolKind({ kind }: { kind: "read" | "write" }) {
  const cfg = kind === "read"
    ? { label: "Read",  bg: "rgba(37,99,171,0.10)",  color: "var(--color-blue)"   }
    : { label: "Write", bg: "rgba(232,133,13,0.12)", color: "var(--color-orange)" };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 9999,
      background: cfg.bg, color: cfg.color,
      textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

function ToolDivider({ label }: { label: string }) {
  return (
    <p style={{
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
      color: "var(--color-text-tertiary)", margin: "16px 0 6px",
    }}>
      {label}
    </p>
  );
}

function PlannedChips({ tools }: { tools: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
      {tools.map((t) => (
        <span key={t} style={{
          fontSize: 11, fontFamily: "monospace", padding: "2px 8px", borderRadius: 9999,
          background: "var(--color-surface-sunken)", border: "0.5px dashed var(--color-border)",
          color: "var(--color-text-tertiary)",
        }}>
          {t}
        </span>
      ))}
    </div>
  );
}

function ToolRow({ name, status, kind, desc, inputs, note }: {
  name: string; status: StatusState; kind: "read" | "write";
  desc: string;
  inputs?: { name: string; type: string; required?: boolean; note?: string }[];
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "0.5px solid var(--color-border)", padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: inputs?.length ? "pointer" : "default" }}
        onClick={() => inputs?.length && setOpen(!open)}>
        <code style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: "var(--color-text-primary)" }}>{name}</code>
        <Status state={status} />
        <ToolKind kind={kind} />
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", flex: 1, lineHeight: 1.5 }}>{desc}</p>
        {inputs?.length ? (
          <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{open ? "−" : "+"}</span>
        ) : null}
      </div>
      {open && inputs?.length ? (
        <div style={{ marginTop: 10, marginLeft: 4, padding: "10px 12px", background: "var(--color-surface-sunken)", borderRadius: 8 }}>
          {inputs.map((inp) => (
            <div key={inp.name} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 11 }}>
              <code style={{ fontFamily: "monospace", color: "var(--color-text-primary)", minWidth: 130 }}>
                {inp.name}{inp.required ? "*" : ""}
              </code>
              <span style={{ fontFamily: "monospace", color: "var(--color-text-tertiary)", minWidth: 70 }}>{inp.type}</span>
              {inp.note && <span style={{ color: "var(--color-text-secondary)" }}>{inp.note}</span>}
            </div>
          ))}
          {note && <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8, fontStyle: "italic" }}>{note}</p>}
        </div>
      ) : null}
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

// ─── Module guide block (user-facing how-to) ──────────────────────────────────

function ModuleGuide({ id, title, status, lede, sections }: {
  id: string; title: string; status: StatusState; lede: string;
  sections: { heading: string; body: string; bullets?: string[] }[];
}) {
  return (
    <Section id={id} title={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, marginTop: -16 }}>
        <Status state={status} />
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
          Module status as of {DOCS_UPDATED}
        </span>
      </div>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 28 }}>
        {lede}
      </p>
      {sections.map((s) => (
        <Sub key={s.heading} title={s.heading}>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: s.bullets ? 12 : 0 }}>
            {s.body}
          </p>
          {s.bullets && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {s.bullets.map((b) => (
                <li key={b} style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "flex", alignItems: "baseline", gap: 8, lineHeight: 1.6 }}>
                  <span style={{ color: "var(--color-sage)", flexShrink: 0 }}>·</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </Sub>
      ))}
    </Section>
  );
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "0.5px solid var(--color-border)" }}>
      <button onClick={() => setOpen(!open)} style={{
        width: "100%", textAlign: "left", padding: "14px 0",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{q}</span>
        <span style={{ fontSize: 14, color: "var(--color-text-tertiary)", flexShrink: 0 }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 16, paddingRight: 32 }}>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
            {a}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Integration row ──────────────────────────────────────────────────────────

function IntegrationRow({ name, status, scopes, purpose, where }: {
  name: string; status: StatusState; scopes: string; purpose: string; where: string;
}) {
  return (
    <div style={{ padding: "14px 0", borderBottom: "0.5px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{name}</span>
        <Status state={status} />
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4, lineHeight: 1.6 }}>{purpose}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>
        <span><strong style={{ color: "var(--color-text-secondary)" }}>Access:</strong> {scopes}</span>
        <span><strong style={{ color: "var(--color-text-secondary)" }}>Where to connect:</strong> {where}</span>
      </div>
    </div>
  );
}

// ─── Roadmap item ─────────────────────────────────────────────────────────────

function RoadmapItem({ icon, title, detail, color }: {
  icon: string; title: string; detail: string; color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: "0.5px solid var(--color-border)" }}>
      <span style={{ color, flexShrink: 0, fontSize: 12, fontFamily: "monospace" }}>{icon}</span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 2 }}>{title}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{detail}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [active, setActive] = useState("welcome");

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
        width: 240, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
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
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>docs</span>
          </div>
          <p style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>v{APP_VERSION} · {DOCS_UPDATED}</p>
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
            → Design system
          </Link>
          <Link href="/settings" style={{ display: "block", padding: "6px 20px", fontSize: 12, color: "var(--color-text-tertiary)", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-tertiary)")}>
            → Settings
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

        {/* ════════════════════════ WELCOME ════════════════════════ */}
        <Section id="welcome" title="Welcome to Perennial"
          subtitle="Perennial is a studio management app built for independent furniture designers, object makers, and artists. It's the operations layer for a creative practice — projects, contacts, finance, calendar, and an AI partner that knows your studio.">

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            {[
              { label: "Version",          value: `v${APP_VERSION}` },
              { label: "Public beta",      value: "Launched at NYCxDesign, May 19, 2026" },
              { label: "Built for",        value: "Independent furniture, object & art studios" },
              { label: "Core modules",     value: "Projects · Tasks · Contacts · Notes · Finance · Calendar · Resources" },
              { label: "AI partner",       value: "Ash — Claude Sonnet 4.6 with tool use" },
              { label: "Your data",        value: "Stored in your private Supabase row · encrypted at rest" },
            ].map((item) => (
              <Card key={item.label}>
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>{item.label}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>{item.value}</p>
              </Card>
            ))}
          </div>

          <Sub title="What you can do today">
            {[
              ["Track every project from sketch to invoice", "Projects, tasks, time, materials and linked contacts all live in one place. Drag cards between status columns; everything saves as you go."],
              ["Manage relationships like a real CRM", "Contacts with companies, tags, last-contacted dates, activity feed, and a separate Outreach pipeline for galleries, press and clients."],
              ["Run your finances", "Time tracking with a sidebar timer, expenses by category, invoices with PDF export and email sending, and a banking tab via Teller for transaction import."],
              ["Write and share notes", "Rich-text editor, pin notes, link to projects, and generate a public share link for any note."],
              ["Get a working partner, not a chatbot", "Ash sees your live data and can read or modify it on your behalf — searching projects, logging time, creating contacts, drafting reminders."],
            ].map(([title, detail]) => (
              <div key={title as string} style={{ padding: "12px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 3 }}>{title}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{detail}</p>
              </div>
            ))}
          </Sub>

          <Sub title="How to read these docs">
            <Card>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                <strong>Start here</strong> is for first-run setup. <strong>Modules</strong> walks through every page in the app. <strong>Ash</strong> covers how the AI partner works and what it&apos;s allowed to touch. <strong>Integrations</strong> explains every external connection. <strong>Roadmap</strong> shows what&apos;s shipped, what&apos;s being built, and what&apos;s next. <strong>Support</strong> has FAQ, troubleshooting, keyboard shortcuts, and a transparent &ldquo;under the hood&rdquo; section if you want to know how the app is built.
              </p>
            </Card>
          </Sub>
        </Section>

        {/* ════════════════════════ SETUP ════════════════════════ */}
        <Section id="setup" title="Setup & onboarding"
          subtitle="Everything you need to do once, when you first land in Perennial.">

          <Sub title="1 · Create your account">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Sign in with email + password at <Tag>app.perennial.design</Tag>. Email is verified automatically. Forgot your password? Use the &ldquo;reset password&rdquo; link on the login page — Perennial sends a magic link that lets you set a new one.
            </p>
          </Sub>

          <Sub title="2 · Complete onboarding">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
              A 3-step modal runs the first time you sign in. Skip any step you don&apos;t want to fill in right now — you can edit everything later from <Link href="/settings" style={{ color: "var(--color-text-primary)" }}>Settings</Link>.
            </p>
            <ol style={{ paddingLeft: 18, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><strong>Welcome</strong> — introduces what Perennial is and what to expect.</li>
              <li><strong>Studio setup</strong> — studio name, your name, practice type(s) (furniture, sculpture, ceramics, painting, jewelry, lighting, etc.), default hourly rate, and currency. Ash uses this data to personalize advice.</li>
              <li><strong>Meet Ash</strong> — explains the AI partner and what it can do. Opens the chat panel so you can ask your first question.</li>
            </ol>
          </Sub>

          <Sub title="3 · Connect your services (optional but recommended)">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
              Head to <Link href="/settings" style={{ color: "var(--color-text-primary)" }}>Settings → Integrations</Link> to wire up the services that matter for your practice. See the <a href="#int-overview" onClick={(e) => { e.preventDefault(); scrollTo("int-overview"); }} style={{ color: "var(--color-text-primary)" }}>Integrations section</a> for the full list and what each one does.
            </p>
            <Card>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                <strong>Most useful first connections:</strong> Google Calendar (so Perennial&apos;s Calendar module shows your real events), Google Contacts (one-click contact import), and your bank via Teller (so the Banking tab in Finance shows real transactions).
              </p>
            </Card>
          </Sub>

          <Sub title="4 · Start with one real project">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Pick a current or upcoming project and add it to <Link href="/projects" style={{ color: "var(--color-text-primary)" }}>Projects</Link>. Log a few tasks, link the relevant contacts, and start the timer when you sit down to work. Within a day or two you&apos;ll have a real picture of where your time is going.
            </p>
          </Sub>
        </Section>

        {/* ════════════════════════ CORE CONCEPTS ════════════════════════ */}
        <Section id="concepts" title="Core concepts"
          subtitle="A few patterns appear everywhere in Perennial. Once they click, the rest of the app is faster to learn.">

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              {
                title: "Detail panel",
                body: "Clicking a card (project, contact, opportunity, task) opens a side-panel over a blurred backdrop. Inline editing — change a field, tab away or click out, it saves. Esc or backdrop click closes the panel.",
              },
              {
                title: "Status & priority",
                body: "Projects and outreach targets move through stages. Drag a card between columns to change status — the change persists immediately, no save button.",
              },
              {
                title: "Linking",
                body: "Notes can link to projects. Activities can link to contacts. Tasks can link to projects, contacts, or opportunities. These links surface in both directions.",
              },
              {
                title: "Ask Ash button",
                body: "Most module topbars have an Ask Ash button that opens the chat panel pre-primed with the current context (e.g. asking from a project panel tells Ash which project you mean).",
              },
              {
                title: "Empty states",
                body: "When a list is empty you'll see a short explainer about what the module is for and a CTA to create your first item. Each empty state is hand-written for that module.",
              },
              {
                title: "Live timer",
                body: "Start a timer on any project from the project panel or sidebar quick-timer. It floats in the sidebar across pages and logs a time entry when you stop it.",
              },
            ].map((c) => (
              <Card key={c.title}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>{c.title}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{c.body}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ════════════════════════ MODULES OVERVIEW ════════════════════════ */}
        <Section id="modules" title="Module overview"
          subtitle="The full list of modules, what's live, and how much Ash knows about each one.">

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 100px", gap: 16, padding: "8px 0", borderBottom: "0.5px solid var(--color-border)" }}>
              {["Module", "What it does", "Ash"].map((h) => (
                <p key={h} style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)" }}>{h}</p>
              ))}
            </div>
            <ModuleRow name="Home"      status="live"     ash="live"     features={["Dashboard","Notes card","Today / tasks","Finance snapshot","Active projects","Stale contacts"]} />
            <ModuleRow name="Projects"  status="live"     ash="live"     features={["Drag-drop status","Detail panel","Tasks checklist","Time tracking","Linked contacts","Finance section","Notes tab"]} />
            <ModuleRow name="Tasks"     status="live"     ash="live"     features={["All tasks list","Project / contact / opportunity links","Due dates","Calendar surface"]} />
            <ModuleRow name="Contacts"  status="live"     ash="live"     features={["Search & tags","Activity feed","Company linking","Leads toggle","Bulk actions","Cross-module finance"]} />
            <ModuleRow name="Outreach"  status="live"     ash="live"     features={["Pipeline board","Leads board","Follow-ups board","Stage tracking","Per-target activity"]} />
            <ModuleRow name="Notes"     status="live"     ash="live"     features={["Rich editor","Pin","Project link","Public share link","Markdown export"]} />
            <ModuleRow name="Finance"   status="live"     ash="live"     features={["Overview","Time tracking + timer","Expenses","Invoices + PDF","Banking via Teller","Send invoice email"]} />
            <ModuleRow name="Calendar"  status="live"     ash="progress" features={["Week view","Tasks on calendar","Project deadlines","Google Calendar sync"]} />
            <ModuleRow name="Presence"  status="live"     ash="progress" features={["Opportunities feed","Saved / dismissed","GA4 stats","Instagram stats"]} />
            <ModuleRow name="Resources" status="progress" ash="planned"  features={["Category nav","Studio brand assets","Health bar","Storage uploads — coming"]} />
            <ModuleRow name="Settings"  status="live"     ash="planned"  features={["Account","Studio profile","Integrations","Notifications","Billing — coming"]} />
          </div>

          <Sub title="Home dashboard">
            <Card>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                The Home dashboard is a <em>lens</em> — every card surfaces real data from another module and links into it. Five cards: <strong>Notes</strong> (recent + pinned), <strong>Today</strong> (tasks due today + overdue invoices), <strong>Finance</strong> (billable hours + outstanding invoice totals), <strong>Projects</strong> (active projects with due-date badges), <strong>Contacts</strong> (people you haven&apos;t reached in 30+ days).
              </p>
            </Card>
          </Sub>
        </Section>

        {/* ════════════════════════ MODULE: PROJECTS & TASKS ════════════════════════ */}
        <ModuleGuide
          id="module-projects"
          title="Projects & Tasks"
          status="live"
          lede="Projects are the anchor of Perennial. Every piece of work — a coffee table commission, a gallery show, a press write-up — lives as a project, and tasks, time, contacts, notes and invoices hang off it."
          sections={[
            {
              heading: "Creating a project",
              body: "Click + New project on the Projects page. Required: title. Optional: type, priority, due date, description. Type matters — it changes the panel layout slightly (furniture and sculpture get materials and dimensions fields; client_project gets a deliverables field).",
              bullets: [
                "Status defaults to Planning. Priority defaults to Medium.",
                "Drag the card between columns (Planning → In Progress → On Hold → Complete) to change status. The change saves immediately.",
                "Cards in the Cut column dim to 65% opacity and show a red-orange accent bar.",
              ],
            },
            {
              heading: "Inside a project (the detail panel)",
              body: "Click any project card to open its panel. Every field is inline-editable: tap to edit, tab away to save. The panel shows tasks, linked contacts, materials, hours logged, billable summary, linked notes, and invoice totals.",
              bullets: [
                "Tasks tab: add tasks, check them off, set due dates. Checked tasks update the progress bar on the card.",
                "Contacts: link any contact to a project. Linked contacts show up on the contact's panel too.",
                "Finance section in the panel: hours logged, billable amount, and a count of invoices issued against this project.",
                "Notes tab: a list of notes linked to this project. Create a new note from here with one click.",
              ],
            },
            {
              heading: "Tasks module",
              body: "Tasks live in their own module too — Tasks shows every task across all projects, plus tasks linked to contacts or opportunities. Use it as a single to-do list when you don't want to think in projects.",
              bullets: [
                "A task with a due date shows in your Today card on Home and as an all-day strip on the Calendar.",
                "Toggle complete from anywhere — the Calendar popover, the project panel, the Tasks list, or Home — and it syncs everywhere.",
              ],
            },
            {
              heading: "Time tracking",
              body: "Start the timer on any project from the project panel or from the sidebar quick-timer button. The timer floats in the sidebar across pages so you don't lose track of it. Stop the timer and Perennial logs a time entry with the project, duration, and billable flag set to true by default.",
            },
          ]}
        />

        {/* ════════════════════════ MODULE: CONTACTS & OUTREACH ════════════════════════ */}
        <ModuleGuide
          id="module-contacts"
          title="Contacts & Outreach"
          status="live"
          lede="Contacts is your address book — galleries, clients, press, suppliers, leads. Outreach is the active layer on top: kanban boards for relationships you're actively building."
          sections={[
            {
              heading: "Contacts",
              body: "Every contact has a name, optional company, tags, status (active / lead / inactive), and a free-text bio. Open the detail panel for an activity feed of every email, call, meeting, or note logged against them.",
              bullets: [
                "Tags are user-defined — common ones: gallery, client, press, supplier, lead, fabricator, peer.",
                "Companies are first-class — multiple contacts at the same company share a Company row.",
                "The Leads toggle filters the page to contacts with status=lead.",
                "Bulk-tag or bulk-archive multiple contacts at once from the action bar.",
              ],
            },
            {
              heading: "Activity log",
              body: "Every interaction is a row in the contact's activity feed: type (email / call / meeting / note), content, date. Adding an activity bumps the contact's last_contacted_at — that's what powers the Stale Contacts card on Home and the Follow-ups board in Outreach.",
            },
            {
              heading: "Outreach",
              body: "Outreach has three views: Pipelines (custom kanban for active opportunities), Leads (contacts with status=lead, organized by lead stage), and Follow-ups (contacts you haven't reached in 30+ days).",
              bullets: [
                "Create as many pipelines as you want — gallery applications, press outreach, retail accounts, commissions.",
                "Each pipeline has custom stages. Drag a target card between stages to move it forward.",
                "Targets can be contacts, companies, or opportunities (a press piece, a fair, a commission lead).",
                "Logging a follow-up on a target also writes to the underlying contact's activity feed.",
              ],
            },
            {
              heading: "Importing contacts",
              body: "Connect Google Contacts in Settings → Integrations and Perennial will import your full Google contact list with names, emails, phones, companies, and titles. CSV import with column mapping is on the roadmap.",
            },
          ]}
        />

        {/* ════════════════════════ MODULE: NOTES ════════════════════════ */}
        <ModuleGuide
          id="module-notes"
          title="Notes"
          status="live"
          lede="A rich-text notebook with pinning, project linking, and per-note public share links. Use it for everything a notebook gets used for: meeting notes, ideas, drafts, reference, journaling."
          sections={[
            {
              heading: "Writing",
              body: "The editor supports bold, italic, headings, lists, code blocks, links, and embedded images. Type / on a new line to open the block menu. Every keystroke saves automatically.",
            },
            {
              heading: "Linking",
              body: "Link a note to a project from the note header — that note then appears in the project's Notes tab. Notes can also be unlinked (general studio notes).",
            },
            {
              heading: "Pinning",
              body: "Pin a note to keep it at the top of the Notes list. Pinned notes also surface in the Notes card on the Home dashboard.",
            },
            {
              heading: "Sharing",
              body: "Generate a public share link from the note's Share menu. Anyone with the link can read the note — no Perennial account required. Revoke the link at any time; the public page goes 404 immediately. Markdown export is also available from the Share menu.",
            },
          ]}
        />

        {/* ════════════════════════ MODULE: FINANCE ════════════════════════ */}
        <ModuleGuide
          id="module-finance"
          title="Finance"
          status="live"
          lede="Time tracking, expenses, invoices, and banking — everything money-shaped your studio does. Five tabs: Overview, Time, Expenses, Invoices, Banking."
          sections={[
            {
              heading: "Overview",
              body: "Dashboard view: billable hours this month, total outstanding invoice amount, count of overdue invoices, and a breakdown of expenses by category. Per-tab Ask Ash buttons let you ask things like 'what's my burn rate this quarter?' or 'how much did I spend on materials last month?'",
            },
            {
              heading: "Time",
              body: "Manual entry or live timer. Each entry has a project, duration in minutes, description, and a billable flag. The sidebar timer floats across pages so you can keep tracking while you navigate.",
              bullets: [
                "Billable rate defaults to your studio hourly rate from Settings.",
                "Override the rate per entry if needed.",
                "Time entries roll up into the project's hours-logged total.",
              ],
            },
            {
              heading: "Expenses",
              body: "Log expenses with category, amount, date, vendor, and an optional project link. Categories: materials, fabrication, shipping, software, marketing, travel, studio (rent / utilities), professional services, other.",
            },
            {
              heading: "Invoices",
              body: "Build an invoice from scratch or convert logged time + expenses into one. Each invoice has a number (auto-incremented), line items, total, due date, status, and a unique print URL. Export as PDF or send by email (once your email integration is set up).",
              bullets: [
                "Sending: connect your sending domain in Settings → Email. Right now invoice emails ship from a default address until your studio domain is verified.",
                "Mark invoices Paid manually or via Teller transaction matching once banking is wired up.",
                "Statuses: draft, sent, paid, overdue. Overdue is automatic based on due date.",
              ],
            },
            {
              heading: "Banking",
              body: "Connect a real bank account through Teller. Imported transactions show in the Banking tab and can be categorized and tagged to projects. The connection uses Teller's encrypted credential flow — Perennial never sees your bank password.",
            },
          ]}
        />

        {/* ════════════════════════ MODULE: CALENDAR ════════════════════════ */}
        <ModuleGuide
          id="module-calendar"
          title="Calendar"
          status="live"
          lede="A week view of your tasks, project deadlines, and Google Calendar events. The week starts on Sunday."
          sections={[
            {
              heading: "What appears",
              body: "Tasks with due dates appear as all-day strips on their due day. Project deadlines (from the project's due_date) appear as deadline pills. Once Google Calendar is connected, your real calendar events appear in their time-blocked slots.",
            },
            {
              heading: "Click-to-create",
              body: "Click any day to open the new-task popover with the date pre-filled. The full time-blocked event create (drag a time range, choose calendar, etc.) is on the roadmap once we round-trip events with Google.",
            },
            {
              heading: "Sync direction",
              body: "Today: Google → Perennial (we read your events). Perennial → Google (we push tasks as events) is on the roadmap.",
            },
          ]}
        />

        {/* ════════════════════════ MODULE: PRESENCE ════════════════════════ */}
        <ModuleGuide
          id="module-presence"
          title="Presence"
          status="live"
          lede="Your public visibility layer: opportunities you've discovered or been pitched, plus stats from your website (GA4 / Plausible), Instagram, and newsletter (Mailchimp / Beehiiv)."
          sections={[
            {
              heading: "Opportunities feed",
              body: "A flat list of opportunities you want to track — open calls, residencies, fairs, press pitches, retail accounts. Save or dismiss each one; saved opportunities show up in Outreach as a target type.",
            },
            {
              heading: "Stats",
              body: "Once you've connected GA4 or Plausible, Perennial shows website traffic. Connect Instagram for follower counts and recent post performance. Connect Mailchimp or Beehiiv for newsletter open and click rates.",
            },
          ]}
        />

        {/* ════════════════════════ MODULE: RESOURCES ════════════════════════ */}
        <ModuleGuide
          id="module-resources"
          title="Resources"
          status="progress"
          lede="The studio's library: brand assets (logos, statements, bios, headshots), templates, press kits, reference, and lookbooks. Some upload paths are still in progress — full Storage uploads ship with the post-beta update."
          sections={[
            {
              heading: "Categories",
              body: "Brand (statement, bio, logos, headshots), Templates (invoice templates, contracts), Press (clippings, press kit), Reference (research material), Lookbooks (image collections).",
            },
            {
              heading: "Health bar",
              body: "The header shows how complete your studio library is — e.g. 'brand statement missing, logo set complete'. Use it as a checklist when you're preparing for a gallery application or press pitch.",
            },
            {
              heading: "Coming next",
              body: "Drag-and-drop file upload into any category, integrated with Supabase Storage (per-user RLS). The onboarding flow will also gain a final 'drop in your studio docs' step.",
            },
          ]}
        />

        {/* ════════════════════════ ASH OVERVIEW ════════════════════════ */}
        <Section id="ash-overview" title="What Ash is"
          subtitle="Ash is a working partner, not a chatbot. It sees your live data — projects, contacts, finance, notes — and can read or modify it to help you get things done.">

          <Sub title="What makes Ash different from ChatGPT">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                {
                  t: "It has your real data",
                  d: "Before every reply, Ash pulls a snapshot of your active projects, outstanding invoices, stale contacts, recent notes and upcoming tasks. You don't need to paste anything in.",
                },
                {
                  t: "It knows your industry",
                  d: "The system prompt covers fair calendars, gallery economics, commission structures, press landscape, pricing fundamentals, and cash-flow realities for independent makers.",
                },
                {
                  t: "It can do things",
                  d: "Ash has tool access — it can search projects, log time, create contacts, add tasks, log a meeting against a contact. You see exactly what tool ran in the chat.",
                },
                {
                  t: "It teaches",
                  d: "Many users come to Perennial without PM or business training. Ash explains concepts through your own situation, not abstract advice.",
                },
              ].map((c) => (
                <Card key={c.t}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>{c.t}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{c.d}</p>
                </Card>
              ))}
            </div>
          </Sub>

          <Sub title="What Ash sees about you">
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
              On every message, Ash gets a fresh snapshot of:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { field: "Active projects",        detail: "Up to 8, ordered by due date — title, status, priority, due date." },
                { field: "Outstanding invoices",   detail: "Sent, overdue, and outstanding amounts." },
                { field: "Billable hours this month", detail: "Sum of billable time entries since the 1st." },
                { field: "Stale contacts",         detail: "Up to 5 contacts you haven't reached in 30+ days." },
                { field: "Recent notes",           detail: "Last 3 updated — title + 80-char preview." },
                { field: "Open tasks",             detail: "Your open task list with due dates." },
                { field: "Studio profile",        detail: "Studio name, your name, practice types, hourly rate, currency." },
                { field: "Current module",        detail: "Which page you're on — affects which context is surfaced first." },
              ].map((item) => (
                <div key={item.field} style={{ padding: "10px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 3 }}>{item.field}</p>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{item.detail}</p>
                </div>
              ))}
            </div>
          </Sub>
        </Section>

        {/* ════════════════════════ ASH USING ════════════════════════ */}
        <Section id="ash-using" title="How to use Ash"
          subtitle="Ash is always one click away. The faster you get used to asking, the more value you get out of Perennial.">

          <Sub title="Opening the chat panel">
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[
                "Click the floating Ash mark in the bottom-right corner of any page.",
                "Use the Ask Ash button in any module topbar — opens the panel with that module's context already loaded.",
                "Inside a project, contact, or task panel, the Ash section in the left sidebar opens the chat scoped to that item.",
              ].map((b) => (
                <li key={b} style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "6px 0", display: "flex", alignItems: "baseline", gap: 8, lineHeight: 1.6 }}>
                  <span style={{ color: "var(--color-sage)" }}>·</span> {b}
                </li>
              ))}
            </ul>
          </Sub>

          <Sub title="Things to try">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                "What's the most overdue thing on my plate?",
                "How much have I billed this month vs. last month?",
                "Draft a follow-up email to [contact name] — they haven't replied in 3 weeks.",
                "I had a 45-minute call with [contact] about the dining table commission — log it.",
                "Create a task: prep portfolio for ICFF, due May 30.",
                "Summarize where the Carlyle commission stands.",
                "I'm pricing a new edition of 8 stools — walk me through cost-plus.",
                "Which clients have I not invoiced this quarter?",
              ].map((q) => (
                <Card key={q}>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6, fontStyle: "italic" }}>
                    &ldquo;{q}&rdquo;
                  </p>
                </Card>
              ))}
            </div>
          </Sub>

          <Sub title="Conversation history">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Past conversations live in the history dropdown at the top of the chat panel. Click any past conversation to load it. Conversations persist forever in your account — they&apos;re your data, not training material.
            </p>
          </Sub>

          <Sub title="Limits">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Max conversation length", value: "Last 24 messages" },
                { label: "Turns per response",      value: "Up to 5 tool calls per reply" },
                { label: "Response length",         value: "Up to 2,048 tokens" },
                { label: "Estimated cost",          value: "$0.75–1.20 / user / month" },
                { label: "Latency",                 value: "Streams immediately, full reply 2–8s" },
                { label: "Beta caveat",             value: "Tool errors will be visible — please report them" },
              ].map((m) => (
                <Card key={m.label} style={{ padding: "12px 14px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 3 }}>{m.label}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{m.value}</p>
                </Card>
              ))}
            </div>
          </Sub>
        </Section>

        {/* ════════════════════════ ASH TOOLS ════════════════════════ */}
        <Section id="ash-tools" title="What Ash can do"
          subtitle="A transparent list of every tool Ash has access to. Read tools fire automatically. Write tools change your data — Ash describes what it's doing before each one runs.">

          <Sub title="Cross-module — read tools">
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12, fontStyle: "italic" }}>
              Ash uses these to look things up before answering. Fully automatic.
            </p>
            <ToolRow name="search_projects" status="live" kind="read"
              desc="Search projects by title, keyword, status, or priority."
              inputs={[
                { name: "query",    type: "string", note: "Text to search in titles and descriptions" },
                { name: "status",   type: "enum",   note: "planning | in_progress | on_hold | complete" },
                { name: "priority", type: "enum",   note: "high | medium | low" },
              ]}
            />
            <ToolRow name="search_contacts" status="live" kind="read"
              desc="Search contacts by name, company, title, or tag."
              inputs={[
                { name: "query",  type: "string", note: "Name, email, company, or title" },
                { name: "tag",    type: "string", note: "gallery | client | press | supplier | lead | …" },
                { name: "status", type: "enum",   note: "active | lead | inactive" },
              ]}
            />
            <ToolRow name="search_notes" status="live" kind="read"
              desc="Full-text search across all notes."
              inputs={[{ name: "query", type: "string", required: true }]}
            />
            <ToolRow name="get_finance_summary" status="live" kind="read"
              desc="Revenue snapshot: billable hours, invoice totals (outstanding/overdue/paid), expenses by category."
              inputs={[{ name: "period", type: "enum", note: "this_month | last_month | this_quarter | ytd" }]}
            />
            <ToolRow name="get_tasks" status="live" kind="read"
              desc="Your open task list, filterable by due date or linked entity."
              inputs={[
                { name: "due_within_days", type: "number" },
                { name: "project_id",      type: "string" },
                { name: "contact_id",      type: "string" },
              ]}
            />
            <ToolRow name="get_outreach_summary" status="live" kind="read"
              desc="Your active outreach pipelines, with target counts per stage."
            />
            <ToolRow name="get_opportunities" status="live" kind="read"
              desc="Saved opportunities from Presence — open calls, fairs, retail leads, press."
              inputs={[{ name: "status", type: "enum", note: "saved | dismissed | applied" }]}
            />
          </Sub>

          <Sub title="Projects">
            <ToolDivider label="Read" />
            <ToolRow name="get_project_details" status="live" kind="read"
              desc="Full project: tasks, time logged, linked contacts, materials, and financial summary."
              inputs={[{ name: "project_id", type: "string", required: true }]}
            />
            <ToolDivider label="Write" />
            <ToolRow name="create_project" status="live" kind="write"
              desc="Create a new project with type, priority, due date, and description."
              inputs={[
                { name: "title",       type: "string", required: true  },
                { name: "type",        type: "enum",   note: "furniture | sculpture | painting | client_project" },
                { name: "priority",    type: "enum",   note: "high | medium | low" },
                { name: "due_date",    type: "string" },
                { name: "description", type: "string" },
              ]}
            />
            <ToolRow name="update_project_status" status="live" kind="write"
              desc="Move a project to a different status (mark complete, put on hold, etc.)."
              inputs={[
                { name: "project_id", type: "string", required: true },
                { name: "status",     type: "enum",   required: true, note: "planning | in_progress | on_hold | complete" },
              ]}
            />
            <ToolRow name="add_task" status="live" kind="write"
              desc="Add a task to a project."
              inputs={[
                { name: "project_id", type: "string", required: true },
                { name: "title",      type: "string", required: true },
                { name: "due_date",   type: "string" },
              ]}
            />
            <PlannedChips tools={["set_project_priority", "add_contact_to_project", "link_note_to_project"]} />
          </Sub>

          <Sub title="Contacts">
            <ToolDivider label="Read" />
            <ToolRow name="get_contact_details" status="live" kind="read"
              desc="Full contact: company, relationship status, last contact date, bio, recent activity feed."
              inputs={[{ name: "contact_id", type: "string", required: true }]}
            />
            <ToolDivider label="Write" />
            <ToolRow name="create_contact" status="live" kind="write"
              desc="Create a new contact, optionally with company, tags, and lead status."
              inputs={[
                { name: "first_name", type: "string",   required: true  },
                { name: "last_name",  type: "string",   required: true  },
                { name: "email",      type: "string"   },
                { name: "phone",      type: "string"   },
                { name: "company",    type: "string"   },
                { name: "tags",       type: "string[]" },
                { name: "is_lead",    type: "boolean"  },
              ]}
            />
            <ToolRow name="log_contact_activity" status="live" kind="write"
              desc="Log an interaction with a contact: email, call, meeting, or note."
              inputs={[
                { name: "contact_id", type: "string", required: true },
                { name: "type",       type: "enum",   required: true, note: "email | call | meeting | note" },
                { name: "content",    type: "string", required: true },
              ]}
            />
            <PlannedChips tools={["update_contact_status", "archive_contact", "merge_contacts"]} />
          </Sub>

          <Sub title="Notes">
            <ToolDivider label="Write" />
            <ToolRow name="create_note" status="live" kind="write"
              desc="Create a note, optionally linked to a project."
              inputs={[
                { name: "content",    type: "string", required: true },
                { name: "title",      type: "string" },
                { name: "project_id", type: "string" },
              ]}
            />
            <PlannedChips tools={["pin_note", "update_note", "share_note"]} />
          </Sub>

          <Sub title="Finance">
            <ToolDivider label="Write" />
            <ToolRow name="log_time" status="live" kind="write"
              desc="Log time worked on a project — converted to a time entry."
              inputs={[
                { name: "duration_minutes", type: "number",  required: true  },
                { name: "project_id",       type: "string" },
                { name: "description",      type: "string" },
                { name: "billable",         type: "boolean" },
              ]}
            />
            <PlannedChips tools={["create_invoice", "mark_invoice_paid", "create_expense", "categorize_transaction"]} />
          </Sub>

          <Sub title="Outreach (planned)">
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 8 }}>
              Write tools shipping in the post-beta update.
            </p>
            <PlannedChips tools={["create_outreach_target", "update_outreach_stage", "log_outreach_touch", "save_opportunity"]} />
          </Sub>
        </Section>

        {/* ════════════════════════ ASH PRIVACY ════════════════════════ */}
        <Section id="ash-privacy" title="Ash · privacy & data"
          subtitle="Plain answers to the questions you should be asking about an AI partner with this much access.">

          {[
            {
              q: "Where is my data stored?",
              a: "In your private row in Perennial's Supabase database, protected by Postgres Row-Level Security. Other Perennial users — and Perennial staff — cannot read your data through the app. Encrypted at rest, encrypted in transit.",
            },
            {
              q: "Does Anthropic (Claude) train on my conversations?",
              a: "No. Perennial's Anthropic API calls are sent under the standard API terms, which means no training on your data and no human review unless required by law. Conversations are stored in your Perennial account so you can scroll back through them, not used for model training.",
            },
            {
              q: "Who can read my Ash chat history?",
              a: "You. Conversations are stored against your user ID and RLS prevents any other user from reading them. The Perennial team can technically inspect database rows for debugging, but we don't do this casually — we'll only do it if you ask us to investigate a specific issue.",
            },
            {
              q: "What does Ash send to Claude on each message?",
              a: "Three things: (1) the static system prompt with industry knowledge, (2) a fresh snapshot of your live data (active projects, invoices, stale contacts, recent notes, open tasks, studio profile), and (3) your conversation history (last 24 messages) plus your new message. The static system prompt is prompt-cached to reduce cost.",
            },
            {
              q: "Can I delete a conversation?",
              a: "Yes — delete any past conversation from the history dropdown. Coming soon: bulk delete and an account-wide 'delete all Ash conversations' action.",
            },
            {
              q: "Can Ash do something destructive?",
              a: "Today, no. Ash's write tools create or update — they don't delete projects, contacts, notes, invoices, or time entries. Anything destructive (delete, archive, mark-paid-on-an-invoice-that-wasn't-paid) you do yourself in the UI.",
            },
          ].map((f) => <FAQItem key={f.q} q={f.q} a={f.a} />)}
        </Section>

        {/* ════════════════════════ INTEGRATIONS OVERVIEW ════════════════════════ */}
        <Section id="int-overview" title="Integrations"
          subtitle="Perennial connects to the services your studio already uses. Everything is OAuth where possible — no passwords stored. Manage all connections in Settings → Integrations.">

          <Sub title="What's available today">
            <IntegrationRow name="Google · Sign-in (OIDC)"     status="live"
              scopes="email, profile, openid"
              purpose="Sign in with your Google account."
              where="Login page" />
            <IntegrationRow name="Google · Calendar"           status="live"
              scopes="calendar.readonly"
              purpose="Surface your real calendar events in Perennial's Calendar week view."
              where="Settings → Integrations" />
            <IntegrationRow name="Google · Contacts"           status="live"
              scopes="contacts.readonly"
              purpose="One-click import of your Google contacts into the Contacts module."
              where="Settings → Integrations" />
            <IntegrationRow name="Google · Gmail"              status="progress"
              scopes="gmail.readonly (production approval pending)"
              purpose="Auto-log emails as activity against matched contacts. Currently in testing mode — limited to invited testers."
              where="Settings → Integrations" />
            <IntegrationRow name="Google · Analytics (GA4)"    status="live"
              scopes="analytics.readonly"
              purpose="Show your website traffic in the Presence module."
              where="Settings → Integrations" />
            <IntegrationRow name="Microsoft · Outlook"          status="live"
              scopes="User.Read, Mail.Read, Calendars.Read, Contacts.Read"
              purpose="Outlook equivalent of the Google trio — sign-in, mail, calendar, contacts."
              where="Settings → Integrations" />
            <IntegrationRow name="Apple · iCloud"               status="progress"
              scopes="App-specific password"
              purpose="Calendar + contact sync for iCloud users."
              where="Settings → Integrations" />
            <IntegrationRow name="Teller · Banking"             status="live"
              scopes="Transactions, balances (read-only)"
              purpose="Pull real transactions into the Banking tab of Finance. Teller's encrypted flow — Perennial never sees your bank password."
              where="Finance → Banking" />
            <IntegrationRow name="Instagram"                    status="live"
              scopes="Basic Display API"
              purpose="Follower counts and recent post performance in Presence."
              where="Settings → Integrations" />
            <IntegrationRow name="Mailchimp"                    status="live"
              scopes="audiences:read, campaigns:read"
              purpose="Newsletter open and click rates in Presence."
              where="Settings → Integrations" />
            <IntegrationRow name="Beehiiv"                      status="live"
              scopes="publications:read"
              purpose="Beehiiv equivalent of Mailchimp for newsletter stats."
              where="Settings → Integrations" />
            <IntegrationRow name="Plausible"                    status="live"
              scopes="Site stats (read-only)"
              purpose="Privacy-friendly alternative to GA4 for website traffic."
              where="Settings → Integrations" />
            <IntegrationRow name="Resend · Invoice email"       status="progress"
              scopes="Sending only"
              purpose="Send invoices by email from your own studio domain. Blocked on per-domain verification — currently uses a Perennial-default sender."
              where="Settings → Email" />
          </Sub>

          <Sub title="Disconnecting">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Every integration has a Disconnect button in Settings → Integrations. Disconnecting revokes Perennial&apos;s access token immediately. Already-imported data (e.g. contacts that were imported from Google Contacts) stays — those are your records now. You can also revoke access at the provider end at any time; Perennial detects the revocation on the next sync and shows the integration as needing reconnect.
            </p>
          </Sub>
        </Section>

        {/* ════════════════════════ INT GOOGLE ════════════════════════ */}
        <Section id="int-google" title="Google"
          subtitle="One OAuth flow grants Perennial access to Calendar, Contacts, and (in testing) Gmail. You'll see the consent screen list each scope and you can decline any individual scope.">

          <Sub title="Connecting">
            <ol style={{ paddingLeft: 18, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.9 }}>
              <li>Go to Settings → Integrations → Google.</li>
              <li>Click <strong>Connect Google</strong>.</li>
              <li>Choose which scopes to grant. You can connect with just Calendar, just Contacts, or all three.</li>
              <li>You&apos;re redirected back to Perennial — the integration card now shows connected status with the granted scopes.</li>
            </ol>
          </Sub>

          <Sub title="What we use each scope for">
            <Card>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                <li><strong>openid, email, profile</strong> — identify which Google account is connected, label the integration card.</li>
                <li><strong>calendar.readonly</strong> — read your calendar events to show in Perennial&apos;s Calendar module. We never write to your Google Calendar (yet).</li>
                <li><strong>contacts.readonly</strong> — read your Google Contacts so you can one-click import them. Only runs when you trigger an import.</li>
                <li><strong>gmail.readonly</strong> — read message headers (From / To / Subject / Date) to auto-log emails as activity on matched contacts. Currently in testing mode pending Google&apos;s restricted-scope verification.</li>
              </ul>
            </Card>
          </Sub>

          <Sub title="Gmail testing mode — what it means for you">
            <Card style={{ background: "rgba(232,197,71,0.06)", border: "0.5px solid rgba(232,197,71,0.25)" }}>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                Gmail (gmail.readonly) is a Google &ldquo;restricted&rdquo; scope, which means it requires both standard verification and an annual third-party security audit. Calendar and Contacts are &ldquo;sensitive&rdquo; scopes which need only standard verification. We&apos;re shipping Calendar + Contacts at beta, and Gmail will follow once the audit is complete. If you&apos;re an invited tester, you may see an &ldquo;unverified app&rdquo; warning during the Gmail consent — that&apos;s expected. Non-testers won&apos;t see the Gmail option until full approval.
              </p>
            </Card>
          </Sub>
        </Section>

        {/* ════════════════════════ INT MICROSOFT ════════════════════════ */}
        <Section id="int-microsoft" title="Microsoft"
          subtitle="Outlook equivalent of the Google integration — same flow, same data shape.">

          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
            Connect from Settings → Integrations → Microsoft. Single OAuth grants read access to Mail, Calendars, and Contacts. The integration tracks <Tag>offline_access</Tag> so Perennial can refresh the token without you re-consenting every hour. Disconnect any time — same Disconnect button in Settings.
          </p>
        </Section>

        {/* ════════════════════════ INT BANKING ════════════════════════ */}
        <Section id="int-banking" title="Banking · Teller"
          subtitle="Connect a real US bank account and Perennial pulls transactions into the Banking tab of Finance.">

          <Sub title="How it works">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Teller is a banking API used by Perennial. It runs an encrypted credential flow inside an iframe — Perennial never sees your bank login. Teller exchanges your credentials for a long-lived account token, which it stores; we only get read-only access to transactions and balances for the account(s) you select.
            </p>
          </Sub>

          <Sub title="What gets imported">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Transaction date, description, amount, category</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Running balance per account</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Pending vs. posted status</li>
            </ul>
            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 10, fontStyle: "italic" }}>
              Beta is on Teller&apos;s development environment — supported banks are limited. Production environment switch happens immediately post-beta.
            </p>
          </Sub>
        </Section>

        {/* ════════════════════════ INT SOCIAL ════════════════════════ */}
        <Section id="int-social" title="Social & web stats">

          <Sub title="Instagram">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Uses Instagram&apos;s Basic Display API — read-only access to your account&apos;s media list and follower count. Perennial cannot post on your behalf. Connect from Settings → Integrations.
            </p>
          </Sub>

          <Sub title="Newsletter — Mailchimp or Beehiiv">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Read-only access to your audience and campaign stats. Open and click rates appear in Presence. Connect either provider — Mailchimp via OAuth, Beehiiv via API key.
            </p>
          </Sub>

          <Sub title="Website traffic — GA4 or Plausible">
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              Both options give a privacy-conscious read-only view of your website traffic in Presence. GA4 uses OAuth; Plausible uses a site-level API key. Pick whichever your site already runs.
            </p>
          </Sub>
        </Section>

        {/* ════════════════════════ INT EMAIL ════════════════════════ */}
        <Section id="int-email" title="Invoice email · Resend"
          subtitle="Send invoices directly from Perennial. Status: in progress for custom domains, working today via a Perennial-default sender.">

          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
            Invoice email is powered by Resend. For studios that want emails to come from <Tag>invoices@yourstudio.com</Tag>, we need to verify your sending domain with Resend — that requires you to add three DNS records to your domain provider. Until your studio domain is verified, invoices send from a Perennial-default address with your studio name in the From field.
          </p>
          <Card>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              <strong>To verify your domain:</strong> Settings → Email → Add sending domain → follow the DNS record instructions. Verification takes 1–10 minutes after the DNS records propagate.
            </p>
          </Card>
        </Section>

        {/* ════════════════════════ ROADMAP — DONE ════════════════════════ */}
        <Section id="roadmap-done" title="Shipped"
          subtitle="Features live in production as of the current beta release.">

          <Sub title="Phase 1 · Foundation">
            {[
              "Multi-user SaaS with Supabase Auth + Row-Level Security from day one",
              "App shell, sidebar, dark/light mode with persistence",
              "All 9 modules wired to real Supabase data — no Coming Soon overlays",
              "Design system viewer at /design with full token reference",
              "components/ui/ primitive library (Button, Select, DatePicker, Toggle, Checkbox, etc.)",
              "Settings page fully wired (Account, Studio, Integrations, Notifications)",
              "Profiles table with auto-create trigger on signup",
              "3-step onboarding modal (Welcome → Studio → Meet Ash)",
            ].map((item) => (
              <RoadmapItem key={item} icon="✓" color="var(--color-green)" title={item} detail="" />
            ))}
          </Sub>

          <Sub title="Phase 2 · Ash">
            {[
              "Floating chat panel with auto-expand on first message",
              "Conversation persistence + history dropdown",
              "Agentic tool loop (up to 5 turns per response)",
              "Prompt caching on the static system prompt (~40% cost savings)",
              "Module-aware suggestions and Ask Ash buttons in topbars",
              "9 read tools + 7 write tools live",
              "Markdown rendering in Ash responses",
            ].map((item) => (
              <RoadmapItem key={item} icon="✓" color="var(--color-green)" title={item} detail="" />
            ))}
          </Sub>

          <Sub title="Phase 3 · Module depth">
            {[
              "Tasks as a dedicated module + Calendar surface",
              "Project Finance section in the detail panel (hours, billable, invoices)",
              "Contact Finance summary in the detail panel",
              "Outreach: Pipelines, Leads, Follow-ups boards",
              "Rich-text Notes with pinning, project links, public share links",
              "Finance: timer, banking tab, invoice PDF export",
              "Empty states with educational copy in every module",
            ].map((item) => (
              <RoadmapItem key={item} icon="✓" color="var(--color-green)" title={item} detail="" />
            ))}
          </Sub>

          <Sub title="Phase 4 · Integrations">
            {[
              "Google OAuth (Calendar, Contacts, Gmail in testing)",
              "Microsoft OAuth (Mail, Calendar, Contacts)",
              "Teller banking integration",
              "Instagram Basic Display",
              "Mailchimp + Beehiiv newsletter stats",
              "GA4 + Plausible website traffic",
              "Resend invoice email (default sender)",
            ].map((item) => (
              <RoadmapItem key={item} icon="✓" color="var(--color-green)" title={item} detail="" />
            ))}
          </Sub>
        </Section>

        {/* ════════════════════════ ROADMAP — ACTIVE ════════════════════════ */}
        <Section id="roadmap-active" title="In progress"
          subtitle="Work happening now, expected to ship in the first few weeks of beta.">

          <RoadmapItem icon="●" color="var(--color-warm-yellow)"
            title="Gmail production approval"
            detail="Google's verification + CASA audit for the restricted gmail.readonly scope. Currently in testing mode with invited testers." />
          <RoadmapItem icon="●" color="var(--color-warm-yellow)"
            title="Resources file uploads"
            detail="Drag-and-drop file uploads into Resources categories, backed by Supabase Storage with per-user RLS." />
          <RoadmapItem icon="●" color="var(--color-warm-yellow)"
            title="Domain verification for invoice email"
            detail="Per-user DNS-verified sending domains via Resend — invoices send from your own studio address." />
          <RoadmapItem icon="●" color="var(--color-warm-yellow)"
            title="Apple iCloud calendar + contacts"
            detail="App-specific-password based integration for iCloud users." />
          <RoadmapItem icon="●" color="var(--color-warm-yellow)"
            title="Onboarding Phase 2"
            detail="Module-tour popups, sidebar getting-started progress bar, per-module empty-state walkthroughs." />
        </Section>

        {/* ════════════════════════ ROADMAP — NEXT ════════════════════════ */}
        <Section id="roadmap-next" title="Coming next">

          <Sub title="Soon">
            <RoadmapItem icon="→" color="var(--color-blue)"
              title="Outreach drag-and-drop"
              detail="Replace click-to-change-stage with full drag-and-drop on outreach kanban boards." />
            <RoadmapItem icon="→" color="var(--color-blue)"
              title="Calendar click-to-create events"
              detail="Notion Calendar–style: click or drag a time range to open an inline event popover. Requires a calendar_events table separate from tasks." />
            <RoadmapItem icon="→" color="var(--color-blue)"
              title="Two-way Google Calendar sync"
              detail="Perennial → Google: push tasks and events back to your Google Calendar." />
            <RoadmapItem icon="→" color="var(--color-blue)"
              title="CSV contact import with column mapping"
              detail="Multi-step import flow: pick file → map columns → preview → confirm." />
            <RoadmapItem icon="→" color="var(--color-blue)"
              title="Contacts filtered view modes"
              detail="Top-level mode switcher: All / Leads / Follow-ups / Recent, with the tag filter strip nested inside." />
            <RoadmapItem icon="→" color="var(--color-blue)"
              title="Lead vs. contact distinction in add flow"
              detail="Separate flows for adding a lead (no existing relationship) vs. a contact (someone you know)." />
          </Sub>

          <Sub title="Later">
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Inline Ash prompts in editors"
              detail="Press Space on a blank line in any text editor to open an inline Ash popover (Notion AI–style)." />
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Auto-save project chats as notes"
              detail="Chats opened from a project context auto-save into that project's Notes tab with an Ash badge." />
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Proactive Ash insights"
              detail="Ash surfaces patterns without being asked — overdue invoice alerts, stale-relationship prompts, deadline warnings." />
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Contact archive"
              detail="Archived field on contacts + dedicated archive UI." />
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Activity ↔ Outreach pipeline link"
              detail="Logging a contact activity also bumps the related outreach target's last_touched_at." />
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Custom Ash icon set"
              detail="Replace emoji used in Ash responses with a Perennial-native icon set." />
          </Sub>

          <Sub title="Post-beta">
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Stripe billing"
              detail="Free beta → paid tier post-launch. Pricing TBD. Billing page in Settings is already mocked." />
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="MCP server ecosystem"
              detail="Pluggable connector framework so studios can wire in Figma, QuickBooks, Notion, custom services." />
            <RoadmapItem icon="→" color="var(--color-text-tertiary)"
              title="Team / studio collaboration"
              detail="Invite collaborators to a studio account, with per-row permissions on top of RLS." />
          </Sub>
        </Section>

        {/* ════════════════════════ FAQ ════════════════════════ */}
        <Section id="faq" title="FAQ"
          subtitle="The questions people ask in the first week.">

          {[
            {
              q: "Is the beta free?",
              a: "Yes. The full app is free during beta. We'll introduce a paid tier post-beta with a clear heads-up — no surprise charges. Pricing isn't set yet; current direction is a single all-features tier under $20/month for solo studios.",
            },
            {
              q: "Where is my data stored?",
              a: "In Perennial's Supabase Postgres database, in a row keyed to your user ID, protected by Row-Level Security. No other user — and no Perennial team member through the app — can read your data. Encrypted at rest and in transit.",
            },
            {
              q: "Can I export my data?",
              a: "A full export to JSON + CSV is on the roadmap for the first few weeks of beta. Until then, individual modules support export: notes export to Markdown, invoices export to PDF, transactions export to CSV from Banking. Ask in support and we can pull a manual export for you.",
            },
            {
              q: "What happens to my data if I cancel or delete my account?",
              a: "Delete from Settings → Account → Delete account. Your data is removed from the database immediately and from all backups within 30 days. We don't keep a copy.",
            },
            {
              q: "Does Ash work without an internet connection?",
              a: "No. Ash relies on the Claude API and your live data, both of which require network. The rest of the app needs network too — your data lives in Supabase, not on your device.",
            },
            {
              q: "Why do I have to verify my domain for invoice email?",
              a: "Email providers (Gmail, Outlook, etc.) flag email from unverified senders as spam. Verifying your sending domain with Resend (via three DNS records) is what makes invoice emails land in clients' inboxes. Until you verify, invoices send from a Perennial-default address.",
            },
            {
              q: "Can I use Perennial as a team?",
              a: "Not yet — every account is single-user. Studio collaboration is on the roadmap. If you have a partner or assistant who needs access, they can sign up with their own email and you can both work in your own accounts for now.",
            },
            {
              q: "I'm not a furniture designer — does Perennial work for me?",
              a: "If you're an independent maker / artist / studio who runs a creative business — yes. The system prompt and onboarding lean toward design, but the underlying modules (projects, contacts, finance, calendar) work for any solo or small studio practice. Ash adapts to your stated practice type.",
            },
            {
              q: "Where do I report a bug?",
              a: <span>Email <a href="mailto:elliott@waitingmag.com" style={{ color: "var(--color-text-primary)" }}>elliott@waitingmag.com</a> with a short description and a screenshot if you can. During beta, response time is usually within a day.</span>,
            },
          ].map((f) => <FAQItem key={f.q} q={f.q} a={f.a} />)}
        </Section>

        {/* ════════════════════════ TROUBLESHOOTING ════════════════════════ */}
        <Section id="troubleshooting" title="Troubleshooting"
          subtitle="Common things that can go sideways and how to fix them.">

          {[
            {
              q: "My Google integration disconnected itself",
              a: "Google revokes OAuth tokens after 7 days for apps in testing mode. Once we get production approval, this stops. Until then: just reconnect from Settings → Integrations.",
            },
            {
              q: "Ash isn't responding / says 'tool error'",
              a: "Try sending the message again. If it persists, check Settings → Account to confirm your session is still active. If you see a specific tool error message (e.g. 'log_time failed'), please screenshot it and email support — we want to see those.",
            },
            {
              q: "My invoice email isn't getting through",
              a: "Check Settings → Email. If you haven't verified your domain, emails go from a Perennial-default sender that some inboxes treat as cold. Verify your domain (three DNS records) to fix deliverability. Also check your client's spam folder.",
            },
            {
              q: "The timer stopped on its own",
              a: "The timer keeps running as long as the page is open. If you closed the tab, the timer pauses at the last heartbeat (every 60 seconds). When you reopen Perennial, you'll see a 'resume timer?' prompt. Soon: background-tab persistence so this stops happening.",
            },
            {
              q: "A contact won't delete",
              a: "Contacts linked to invoices, time entries, or outreach targets can't be deleted — the dependencies would break. Archive them instead (coming soon) or unlink them from those records first.",
            },
            {
              q: "Dark mode broke a panel / element",
              a: "Some module surfaces are still mid-polish for dark mode. Toggle back to light mode from the sidebar bottom-left for now, and report the broken surface so we can fix it.",
            },
            {
              q: "I can't sign in",
              a: "Try the password reset link. If the reset email doesn't arrive within 2 minutes, check spam. If still nothing, email support — we can confirm your account exists and re-trigger the reset.",
            },
          ].map((f) => <FAQItem key={f.q} q={f.q} a={f.a} />)}
        </Section>

        {/* ════════════════════════ SHORTCUTS ════════════════════════ */}
        <Section id="shortcuts" title="Keyboard shortcuts"
          subtitle="A small set of shortcuts work today; a fuller pass is on the roadmap.">

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { keys: "Esc",           action: "Close any open panel or modal" },
              { keys: "⌘ / Ctrl + K",  action: "Open Ash chat panel (coming soon)" },
              { keys: "/",             action: "Inside the Notes editor, open the block menu" },
              { keys: "Tab",           action: "Move between fields in detail panels — saves the previous field" },
              { keys: "Enter",         action: "Submit any inline-edited field" },
              { keys: "Shift + Enter", action: "New line inside multi-line text fields" },
              { keys: "Space",         action: "On a blank line in Notes, opens the inline Ash prompt (coming soon)" },
            ].map((s) => (
              <Card key={s.keys}>
                <p style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>{s.keys}</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{s.action}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ════════════════════════ UNDER THE HOOD ════════════════════════ */}
        <Section id="tooling" title="Under the hood"
          subtitle="A transparent look at what powers Perennial. Optional reading — you don't need any of this to use the app.">

          <Sub title="Stack">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "Framework",     value: "Next.js 16 (App Router)" },
                { label: "Frontend",      value: "React 19, Tailwind CSS 4" },
                { label: "Language",      value: "TypeScript 5.9" },
                { label: "Database",      value: "Supabase Postgres + RLS" },
                { label: "Auth",          value: "Supabase Auth (email + OAuth)" },
                { label: "Hosting",       value: "Vercel · app.perennial.design" },
                { label: "AI model",      value: "Claude Sonnet 4.6" },
                { label: "Banking",       value: "Teller" },
                { label: "Email",         value: "Resend" },
              ].map((item) => (
                <Card key={item.label} style={{ padding: "12px 14px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 3 }}>{item.label}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-primary)", fontFamily: "monospace" }}>{item.value}</p>
                </Card>
              ))}
            </div>
          </Sub>

          <Sub title="How Ash works (three layers)">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {[
                {
                  n: "1", title: "Context layer",
                  desc: "Before every message, Perennial fetches a fresh snapshot of your data — active projects, outstanding invoices, stale contacts, recent notes, open tasks, studio profile — and injects it as the dynamic part of the prompt.",
                },
                {
                  n: "2", title: "System prompt",
                  desc: "A static prompt (~2,000 tokens) covering Ash's identity, who its users are, the design industry, gallery / fair / press landscape, and pricing fundamentals. Prompt-cached for ~40% cost savings.",
                },
                {
                  n: "3", title: "Tool use",
                  desc: "Ash runs an agentic loop (up to 5 turns). Claude can call tools mid-conversation — searching projects, fetching contact history, logging time — and continues streaming text after each result.",
                },
              ].map((layer) => (
                <Card key={layer.n}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--color-ash-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ash-dark)" }}>{layer.n}</span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{layer.title}</p>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{layer.desc}</p>
                </Card>
              ))}
            </div>
          </Sub>

          <Sub title="Security posture">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Row-Level Security on every table — a user can only read or modify their own rows</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> All traffic over TLS</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Encrypted at rest in Supabase</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Bank credentials never touch our servers (Teller iframe)</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> OAuth tokens stored in an encrypted vault, never exposed to the client</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Anthropic API terms: no training on your data, no human review absent legal compulsion</li>
            </ul>
          </Sub>
        </Section>

        {/* ════════════════════════ VERSION HISTORY ════════════════════════ */}
        <Section id="version-history" title="Version history">

          <Sub title="v0.9.0 — Beta · May 16, 2026">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Gmail sync pipeline + manual Sync Now button</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Unified Google OAuth across Gmail / Calendar / Contacts</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Hardened OAuth callback against silent 500s</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Documented opt-in full-body storage for contact-matched emails (privacy)</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Docs page rewritten for end-users</li>
            </ul>
          </Sub>

          <Sub title="v0.8 — May 10, 2026">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> 3-step onboarding modal (Welcome → Studio → Meet Ash)</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Profiles table with auto-create trigger</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Empty states pass across every module</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Ash context expanded — studio profile, open tasks, hourly rate</li>
            </ul>
          </Sub>

          <Sub title="v0.7 — May 5, 2026">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Tasks as a standalone module with project / contact / opportunity links</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> All Ash write-tool stubs wired (create_project, add_task, create_contact, log_time, log_contact_activity, update_project_status)</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> New Ash read tools: get_tasks, get_outreach_summary, get_opportunities</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Project + Contact panels: cross-module Finance section</li>
            </ul>
          </Sub>

          <Sub title="v0.6 — April 27, 2026">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Contacts cleaned up: Leads + Follow-ups moved into Outreach panel</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Reminders consolidated into Calendar</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Settings fully wired to profiles table</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Note sharing — public /share/[token] page with revocable link</li>
            </ul>
          </Sub>

          <Sub title="v0.5 — April 22, 2026">
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Initial Ash launch — chat panel, 6 read tools, 2 write tools, prompt caching</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> All 9 modules wired to real Supabase data</li>
              <li><span style={{ color: "var(--color-sage)" }}>·</span> Design system viewer at /design</li>
            </ul>
          </Sub>
        </Section>

        {/* ════════════════════════ CONTACT ════════════════════════ */}
        <Section id="contact" title="Contact us"
          subtitle="During beta, support is direct — you'll hear back from a real person, usually within a day.">

          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>Bug reports & support</p>
                <p style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
                  <a href="mailto:elliott@waitingmag.com" style={{ color: "var(--color-text-primary)" }}>elliott@waitingmag.com</a>
                </p>
                <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>Include a screenshot if you can. We see Sentry logs, but your description always helps.</p>
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>Feature requests</p>
                <p style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
                  Same address — title your email <Tag>feature:</Tag> so it lands in the right bucket.
                </p>
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>Status & incidents</p>
                <p style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
                  We&apos;ll post outage notices to the login page and email anyone affected. A status page is on the roadmap.
                </p>
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-text-tertiary)", marginBottom: 5 }}>Privacy & data requests</p>
                <p style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
                  Email the same address with subject <Tag>privacy:</Tag>. We&apos;ll respond within 5 business days.
                </p>
              </div>
            </div>
          </Card>
        </Section>

        {/* Footer */}
        <div style={{ padding: "40px 56px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            Perennial · v{APP_VERSION} · Docs updated {DOCS_UPDATED}
          </p>
        </div>

      </main>
    </div>
  );
}
