"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SidebarTimerBadge from "./SidebarTimerBadge";
import GettingStartedWidget from "@/components/tour/GettingStartedWidget";
import { useState, useEffect, useRef } from "react";
import type React from "react";
import {
  LayoutDashboard, Layers, Users, Send, FileText, Calendar,
  Receipt, Globe, FolderOpen, Settings, ChevronLeft, Palette,
  Sun, Moon, ChevronUp, LogOut, UserCog,
  Zap, BookOpen, MessageSquare, Share, ExternalLink, Hash, ChevronDown,
  CheckSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Menu, { type MenuContent } from "@/components/ui/Menu";

// ─── Nav groups ───────────────────────────────────────────────────────────────

type NavItem = { href: string; label: string; icon: React.ElementType; soon?: true };

const NAV_GROUPS: NavItem[][] = [
  [
    { href: "/",          label: "Home",      icon: LayoutDashboard          },
    { href: "/projects",  label: "Projects",  icon: Layers                   },
    { href: "/contacts",  label: "Contacts",  icon: Users                    },
    { href: "/outreach",  label: "Outreach",  icon: Send                     },
  ],
  [
    { href: "/notes",     label: "Notes",     icon: FileText                 },
    { href: "/tasks",     label: "Tasks",     icon: CheckSquare              },
    { href: "/calendar",  label: "Calendar",  icon: Calendar                 },
  ],
  [
    { href: "/finance",   label: "Finance",   icon: Receipt                  },
    { href: "/presence",  label: "Presence",  icon: Globe                    },
    { href: "/resources", label: "Resources", icon: FolderOpen               },
  ],
];

const APP_MENU: MenuContent[] = [
  { label: "What's new",         icon: Zap,           badge: "Soon", disabled: true },
  { label: "Documentation",      icon: BookOpen,      badge: "Soon", disabled: true },
  { label: "Keyboard shortcuts", icon: Hash,          badge: "Soon", disabled: true },
  "divider",
  { label: "Give feedback",      icon: MessageSquare, badge: "Soon", disabled: true },
  { label: "Refer a friend",     icon: Share,         badge: "Soon", disabled: true },
  "divider",
  { label: "perennial.design",   icon: ExternalLink,  external: true },
];

// ─── Tokens ───────────────────────────────────────────────────────────────────

const C = {
  activeBg:   "var(--sidebar-active-bg)",
  hoverBg:    "var(--sidebar-hover-bg)",
  activeText: "var(--sidebar-text-active)",
  hoverText:  "var(--sidebar-text-hover)",
  dimText:    "var(--sidebar-text)",
  soonText:   "var(--sidebar-soon-text)",
  soonBadge:  "var(--sidebar-soon-bg)",
  divider:    "var(--sidebar-divider)",
};

const itemBase: React.CSSProperties = {
  gap: 9, padding: "7px 8px",
  display: "flex", alignItems: "center",
  borderRadius: 8, cursor: "pointer",
  transition: "background 0.12s ease, color 0.12s ease",
  width: "100%", border: "none", fontFamily: "inherit",
  textDecoration: "none", background: "transparent",
};

// ─── New logomark (inline, colors adapted for sidebar) ────────────────────────

function PerennialMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="7 9 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rounded container */}
      <path
        d="M7 29C7 17.9543 15.9543 9 27 9H87C98.0457 9 107 17.9543 107 29V89C107 100.046 98.0457 109 87 109H27C15.9543 109 7 100.046 7 89V29Z"
        fill="rgba(255,255,255,0.15)"
      />
      {/* P letterform */}
      <path
        d="M41 33.3434H47.711V36.0244C51.4851 33.6786 54.6729 32 60.2115 32C71.9565 32 80.4291 40.885 80.0938 51.9471C79.8429 56.8077 78.2475 61.8375 74.809 65.4422C70.1949 70.3874 64.3239 72.3136 58.7853 71.8124C54.9267 71.4772 51.1526 69.9677 47.711 66.8673V85.4533L42.677 86.7092H41V33.3434ZM59.7915 34.8501C54.0021 34.8501 51.4034 36.4412 47.711 39.3757C47.8802 48.5958 47.711 51.9471 47.711 63.7667C47.711 63.7667 49.8081 65.9464 53.2467 67.2868C58.3623 69.2975 63.3118 68.7963 66.2487 67.2868C70.7782 64.941 74.386 60.8321 74.386 51.7808C74.386 43.231 68.2612 34.8501 59.7886 34.8501H59.7915Z"
        fill="rgba(255,255,255,0.90)"
      />
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface TooltipState { label: string; top: number; soon?: boolean }

export default function Sidebar() {
  const pathname = usePathname();

  const [expanded,    setExpanded]    = useState(true);
  const [theme,       setTheme]       = useState<"light" | "dark">("light");
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [profileName,  setProfileName]  = useState<string | null>(null);
  const [studioName,   setStudioName]   = useState<string | null>(null);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null);

  const appMenuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = (localStorage.getItem("perennial-theme") ?? "light") as "light" | "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserEmail(data.user.email ?? null);
      const { data: prof } = await supabase
        .from("profiles")
        .select("studio_name, display_name")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (prof?.studio_name)  setStudioName(prof.studio_name);
      if (prof?.display_name) setProfileName(prof.display_name);
    });
  }, []);

  // Listen for profile updates from Settings
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ studio_name?: string }>).detail;
      if (detail?.studio_name !== undefined) setStudioName(detail.studio_name || null);
    }
    window.addEventListener("profile-updated", handler);
    return () => window.removeEventListener("profile-updated", handler);
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (appMenuRef.current && !appMenuRef.current.contains(e.target as Node)) setAppMenuOpen(false);
    }
    if (appMenuOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [appMenuOpen]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    if (profileOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [profileOpen]);

  // Close tooltip when expanding
  useEffect(() => { if (expanded) setTooltip(null); }, [expanded]);

  function setThemeMode(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("perennial-theme", next);
  }

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  // Show tooltip on hover in collapsed mode
  function tip(e: React.MouseEvent<HTMLElement>, label: string, soon?: boolean) {
    if (expanded) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, soon });
  }
  const hideTip = () => setTooltip(null);

  const displayName = profileName
    ?? (userEmail ? userEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Loading…");
  const userInitial = (profileName?.[0] ?? userEmail?.[0] ?? "—").toUpperCase();

  const PROFILE_MENU: MenuContent[] = [
    { label: "Edit profile",     icon: UserCog, href: "/settings" },
    "divider",
    { label: "Switch workspace", icon: Users,   badge: "Soon", disabled: true },
    "divider",
    { label: "Log out",          icon: LogOut,  danger: true, onClick: handleLogout },
  ];

  return (
    <>
      <aside
        style={{
          display: "flex", flexDirection: "column", height: "100%", flexShrink: 0,
          width:       expanded ? 200 : 52,
          background:  "var(--color-sidebar-bg)",
          borderRight: `0.5px solid ${C.divider}`,
          transition:  "width 0.2s ease-out",
          overflow:    "hidden",
          position:    "relative",
        }}
      >
        {/* ── App menu dropdown ── */}
        {appMenuOpen && expanded && (
          <div ref={appMenuRef} style={{ position: "absolute", top: 56, left: 7, right: 7, zIndex: 50 }}>
            <Menu items={APP_MENU} onClose={() => setAppMenuOpen(false)} />
          </div>
        )}

        {/* ── Header ── */}
        <button
          onClick={() => expanded && setAppMenuOpen((v) => !v)}
          style={{
            height: 52, flexShrink: 0, width: "100%",
            display: "flex", alignItems: "center",
            padding: expanded ? "0 12px" : "0 13px", gap: 8,
            borderBottom: `0.5px solid ${C.divider}`,
            background: appMenuOpen ? "rgba(255,255,255,0.08)" : "transparent",
            border: "none",
            cursor: expanded ? "pointer" : "default",
            transition: "background 0.12s ease",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { if (expanded) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = appMenuOpen ? "rgba(255,255,255,0.08)" : "transparent"; }}
        >
          {expanded ? (
            <>
              <img
                src="/Logotype.svg"
                alt="perennial"
                style={{ height: 22, width: "auto", objectFit: "contain", objectPosition: "left center", display: "block", flex: 1 }}
              />
              <ChevronDown
                size={12} strokeWidth={2}
                style={{ flexShrink: 0, color: C.dimText, transition: "transform 0.15s ease", transform: appMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </>
          ) : (
            <PerennialMark size={26} />
          )}
        </button>

        {/* ── Nav ── */}
        <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "6px 0" }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div style={{ height: "0.5px", background: C.divider, margin: "5px 11px" }} />}
              <div style={{ padding: "0 7px", display: "flex", flexDirection: "column", gap: 1 }}>
                {group.map(({ href, label, icon: Icon, soon }) => {
                  const active = isActive(href);
                  if (soon) {
                    return (
                      <Link
                        key={href} href={href}
                        style={{ ...itemBase, color: C.dimText, opacity: 0.55 }}
                        onMouseEnter={(e) => {
                          tip(e, label, true);
                          e.currentTarget.style.background = C.hoverBg;
                          e.currentTarget.style.color      = C.hoverText;
                          e.currentTarget.style.opacity    = "1";
                        }}
                        onMouseLeave={(e) => {
                          hideTip();
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color      = C.dimText;
                          e.currentTarget.style.opacity    = "0.55";
                        }}
                      >
                        <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                        {expanded && (
                          <>
                            <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", flex: 1 }}>{label}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 5px", borderRadius: 4, background: C.soonBadge, color: C.soonText, flexShrink: 0 }}>Soon</span>
                          </>
                        )}
                      </Link>
                    );
                  }
                  // Strip leading slash for the tour key ("/projects" → "projects")
                  const tourKey = href.startsWith("/") ? href.slice(1) : href;
                  return (
                    <Link
                      key={href} href={href}
                      data-tour-key={tourKey}
                      style={{ ...itemBase, background: active ? C.activeBg : "transparent", color: active ? C.activeText : C.dimText }}
                      onMouseEnter={(e) => {
                        tip(e, label);
                        if (!active) { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; }
                      }}
                      onMouseLeave={(e) => {
                        hideTip();
                        if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; }
                      }}
                    >
                      <Icon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                      {expanded && <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden" }}>{label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Timer badge (shows only when running) ── */}
        <SidebarTimerBadge expanded={expanded} />

        {/* ── Getting started tour progress (shown until dismissed or done) ── */}
        <GettingStartedWidget expanded={expanded} />

        {/* ── Bottom utilities ── */}
        <div style={{ padding: "6px 7px 6px", borderTop: `0.5px solid ${C.divider}`, display: "flex", flexDirection: "column", gap: 1 }}>
          <Link
            href="/settings"
            style={{ ...itemBase, color: C.dimText }}
            onMouseEnter={(e) => { tip(e, "Settings"); e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; }}
            onMouseLeave={(e) => { hideTip(); e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; }}
          >
            <Settings size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {expanded && <span style={{ fontSize: 12, fontWeight: 500 }}>Settings</span>}
          </Link>

          <Link
            href="/design"
            style={{ ...itemBase, color: C.dimText, opacity: 0.65 }}
            onMouseEnter={(e) => { tip(e, "Design system"); e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { hideTip(); e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; e.currentTarget.style.opacity = "0.65"; }}
          >
            <Palette size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {expanded && <span style={{ fontSize: 12, fontWeight: 500 }}>Design system</span>}
          </Link>

          <Link
            href="/docs"
            style={{ ...itemBase, color: C.dimText, opacity: 0.65 }}
            onMouseEnter={(e) => { tip(e, "Docs"); e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { hideTip(); e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; e.currentTarget.style.opacity = "0.65"; }}
          >
            <BookOpen size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {expanded && <span style={{ fontSize: 12, fontWeight: 500 }}>Docs</span>}
          </Link>

          <button
            onClick={() => setExpanded(!expanded)}
            style={{ ...itemBase, color: C.dimText }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; }}
          >
            <ChevronLeft size={14} strokeWidth={2} style={{ flexShrink: 0, transition: "transform 0.2s ease", transform: expanded ? "rotate(0deg)" : "rotate(180deg)" }} />
            {expanded && <span style={{ fontSize: 11 }}>Collapse</span>}
          </button>

          {expanded ? (
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `0.5px solid ${C.divider}`, margin: "3px 1px 1px" }}>
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setThemeMode(t)}
                  style={{
                    flex: 1, padding: "5px 0", fontSize: 11, fontWeight: theme === t ? 600 : 400,
                    background: theme === t ? "rgba(255,255,255,0.16)" : "transparent",
                    color: theme === t ? C.activeText : C.dimText,
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    textTransform: "capitalize", transition: "all 0.12s ease",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  }}
                >
                  {t === "light" ? <Sun size={11} strokeWidth={1.75} /> : <Moon size={11} strokeWidth={1.75} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setThemeMode(theme === "light" ? "dark" : "light")}
              style={{ ...itemBase, color: C.dimText, justifyContent: "center" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; }}
            >
              {theme === "light" ? <Moon size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} /> : <Sun size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />}
            </button>
          )}
        </div>

        {/* ── Profile footer ── */}
        <div ref={profileRef} style={{ position: "relative", padding: "6px 7px 8px", borderTop: `0.5px solid ${C.divider}` }}>
          {profileOpen && expanded && (
            <Menu
              items={PROFILE_MENU}
              onClose={() => setProfileOpen(false)}
              style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 7, right: 7 }}
            />
          )}
          <button
            onClick={() => expanded && setProfileOpen((v) => !v)}
            style={{
              ...itemBase,
              color:      C.dimText,
              background: profileOpen ? C.activeBg : "transparent",
              cursor:     expanded ? "pointer" : "default",
            }}
            onMouseEnter={(e) => {
              tip(e, displayName);
              if (expanded) { e.currentTarget.style.background = profileOpen ? C.activeBg : C.hoverBg; e.currentTarget.style.color = C.hoverText; }
            }}
            onMouseLeave={(e) => {
              hideTip();
              e.currentTarget.style.background = profileOpen ? C.activeBg : "transparent";
              e.currentTarget.style.color = C.dimText;
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              background: "rgba(255,255,255,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: C.activeText,
            }}>
              {userInitial}
            </div>
            {expanded && (
              <>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: C.activeText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
                    {displayName}
                  </p>
                  <p style={{ fontSize: 9, color: C.dimText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
                    {studioName ?? "Add studio name →"}
                  </p>
                </div>
                <ChevronUp size={12} strokeWidth={2} style={{ flexShrink: 0, color: C.dimText, transition: "transform 0.15s ease", transform: profileOpen ? "rotate(0deg)" : "rotate(180deg)" }} />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Hover tooltip (collapsed mode only, rendered outside overflow:hidden aside) ── */}
      {tooltip && !expanded && (
        <div
          style={{
            position:      "fixed",
            top:           tooltip.top,
            left:          60,
            transform:     "translateY(-50%)",
            zIndex:        100,
            pointerEvents: "none",
            display:       "flex",
            alignItems:    "center",
            gap:           4,
          }}
        >
          {/* Left-pointing arrow */}
          <div style={{
            width: 0, height: 0,
            borderTop:    "4px solid transparent",
            borderBottom: "4px solid transparent",
            borderRight:  "4px solid var(--color-border)",
          }} />
          <div style={{
            background:  "var(--color-surface-raised)",
            border:      "0.5px solid var(--color-border)",
            borderRadius: 6,
            padding:     "5px 10px",
            fontSize:    12,
            fontWeight:  500,
            color:       "var(--color-text-primary)",
            whiteSpace:  "nowrap",
            boxShadow:   "var(--shadow-md)",
            display:     "flex",
            alignItems:  "center",
            gap:         6,
          }}>
            {tooltip.label}
            {tooltip.soon && (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                background: "rgba(155,163,122,0.15)", color: "var(--color-sage)",
              }}>
                Soon
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
