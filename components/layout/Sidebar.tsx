"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import type React from "react";
import {
  LayoutDashboard, Layers, Users, Send, FileText, Calendar,
  Receipt, Globe, FolderOpen, Settings, ChevronLeft, Palette,
  Sun, Moon, ChevronUp, LogOut, UserCog,
  Zap, BookOpen, MessageSquare, Share, ExternalLink, Hash, ChevronDown,
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
    { href: "/outreach",  label: "Outreach",  icon: Send,     soon: true     },
  ],
  [
    { href: "/notes",     label: "Notes",     icon: FileText                 },
    { href: "/calendar",  label: "Calendar",  icon: Calendar, soon: true     },
  ],
  [
    { href: "/finance",   label: "Finance",   icon: Receipt                  },
    { href: "/presence",  label: "Presence",  icon: Globe,    soon: true     },
    { href: "/resources", label: "Resources", icon: FolderOpen               },
  ],
];

// ─── App menu items ───────────────────────────────────────────────────────────

const APP_MENU: MenuContent[] = [
  { label: "What's new",         icon: Zap,            badge: "Soon",    disabled: true },
  { label: "Documentation",      icon: BookOpen,       badge: "Soon",    disabled: true },
  { label: "Keyboard shortcuts", icon: Hash,           badge: "Soon",    disabled: true },
  "divider",
  { label: "Give feedback",      icon: MessageSquare,  badge: "Soon",    disabled: true },
  { label: "Refer a friend",     icon: Share,          badge: "Soon",    disabled: true },
  "divider",
  { label: "perennial.design",   icon: ExternalLink,   external: true },
];

// ─── CSS var tokens ───────────────────────────────────────────────────────────

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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();

  const [expanded,    setExpanded]    = useState(true);
  const [theme,       setTheme]       = useState<"light" | "dark">("light");
  const [userEmail,   setUserEmail]   = useState<string | null>(null);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const appMenuRef  = useRef<HTMLDivElement>(null);
  const profileRef  = useRef<HTMLDivElement>(null);

  // Sync theme from localStorage
  useEffect(() => {
    const saved = (localStorage.getItem("perennial-theme") ?? "light") as "light" | "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  // Fetch user
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  // Click-outside for app menu
  useEffect(() => {
    function h(e: MouseEvent) {
      if (appMenuRef.current && !appMenuRef.current.contains(e.target as Node)) setAppMenuOpen(false);
    }
    if (appMenuOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [appMenuOpen]);

  // Click-outside for profile menu
  useEffect(() => {
    function h(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    if (profileOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [profileOpen]);

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

  const userInitial = userEmail ? userEmail[0].toUpperCase() : "—";
  const displayName = userEmail
    ? userEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Loading…";

  // Profile dropdown items
  const PROFILE_MENU: MenuContent[] = [
    { label: "Edit profile",       icon: UserCog,  href: "/settings" },
    "divider",
    { label: "Switch workspace",   icon: Users,    badge: "Soon", disabled: true },
    "divider",
    { label: "Log out",            icon: LogOut,   danger: true, onClick: handleLogout },
  ];

  return (
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
          <Menu
            items={APP_MENU}
            onClose={() => setAppMenuOpen(false)}
          />
        </div>
      )}

      {/* ── Header ── */}
      <button
        onClick={() => expanded && setAppMenuOpen((v) => !v)}
        title={!expanded ? "perennial" : undefined}
        style={{
          height: 52, flexShrink: 0, width: "100%",
          display: "flex", alignItems: "center",
          padding: expanded ? "0 14px" : "0 13px", gap: 8,
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
              style={{ width: 110, height: 26, objectFit: "contain", objectPosition: "left center", display: "block", flex: 1 }}
            />
            <ChevronDown
              size={12} strokeWidth={2}
              style={{
                flexShrink: 0, color: C.dimText,
                transition: "transform 0.15s ease",
                transform: appMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </>
        ) : (
          <div
            style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              background: "rgba(255,255,255,0.14)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 28 28" fill="none" width="18" height="18" style={{ color: "var(--sidebar-icon)" }}>
              <path d="M14 22V12"                                       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M14 16C14 16 11 14 10 11C12 11 14 12.5 14 16Z" fill="currentColor"/>
              <path d="M14 14C14 14 17 12 18 9C16 9 14 10.5 14 14Z"   fill="currentColor"/>
            </svg>
          </div>
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
                      title={!expanded ? `${label} — coming soon` : undefined}
                      style={{ ...itemBase, color: C.dimText, opacity: 0.55 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; e.currentTarget.style.opacity = "1"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; e.currentTarget.style.opacity = "0.55"; }}
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
                return (
                  <Link
                    key={href} href={href}
                    title={!expanded ? label : undefined}
                    style={{ ...itemBase, background: active ? C.activeBg : "transparent", color: active ? C.activeText : C.dimText }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; } }}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; } }}
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

      {/* ── Bottom utilities ── */}
      <div style={{ padding: "6px 7px 6px", borderTop: `0.5px solid ${C.divider}`, display: "flex", flexDirection: "column", gap: 1 }}>
        {/* Settings */}
        <Link
          href="/settings" title={!expanded ? "Settings" : undefined}
          style={{ ...itemBase, color: C.dimText }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; }}
        >
          <Settings size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: 12, fontWeight: 500 }}>Settings</span>}
        </Link>

        {/* Design system */}
        <Link
          href="/design" title={!expanded ? "Design system" : undefined}
          style={{ ...itemBase, color: C.dimText, opacity: 0.65 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; e.currentTarget.style.opacity = "0.65"; }}
        >
          <Palette size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: 12, fontWeight: 500 }}>Design system</span>}
        </Link>

        {/* Internal docs */}
        <Link
          href="/docs" title={!expanded ? "Docs" : undefined}
          style={{ ...itemBase, color: C.dimText, opacity: 0.65 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; e.currentTarget.style.opacity = "1"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; e.currentTarget.style.opacity = "0.65"; }}
        >
          <BookOpen size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
          {expanded && <span style={{ fontSize: 12, fontWeight: 500 }}>Docs</span>}
        </Link>

        {/* Collapse */}
        <button
          onClick={() => setExpanded(!expanded)} title={expanded ? "Collapse" : "Expand"}
          style={{ ...itemBase, color: C.dimText }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.hoverText; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dimText; }}
        >
          <ChevronLeft size={14} strokeWidth={2} style={{ flexShrink: 0, transition: "transform 0.2s ease", transform: expanded ? "rotate(0deg)" : "rotate(180deg)" }} />
          {expanded && <span style={{ fontSize: 11 }}>Collapse</span>}
        </button>

        {/* Theme toggle — below collapse, above profile */}
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
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
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
        {/* Profile dropdown (anchored upward) */}
        {profileOpen && expanded && (
          <Menu
            items={PROFILE_MENU}
            onClose={() => setProfileOpen(false)}
            style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 7, right: 7 }}
          />
        )}

        <button
          onClick={() => expanded && setProfileOpen((v) => !v)}
          title={!expanded ? (userEmail ?? "Profile") : undefined}
          style={{
            ...itemBase,
            color:      C.dimText,
            background: profileOpen ? C.activeBg : "transparent",
            cursor:     expanded ? "pointer" : "default",
          }}
          onMouseEnter={(e) => { if (expanded) { e.currentTarget.style.background = profileOpen ? C.activeBg : C.hoverBg; e.currentTarget.style.color = C.hoverText; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = profileOpen ? C.activeBg : "transparent"; e.currentTarget.style.color = C.dimText; }}
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
                  Studio name
                </p>
              </div>
              <ChevronUp size={12} strokeWidth={2} style={{ flexShrink: 0, color: C.dimText, transition: "transform 0.15s ease", transform: profileOpen ? "rotate(0deg)" : "rotate(180deg)" }} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
