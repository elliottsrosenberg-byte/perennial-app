"use client";

// Mobile top bar + slide-in nav drawer. Shown below md breakpoint only.
// The desktop Sidebar is hidden on mobile; this is the entire mobile chrome.

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Layers, Users, Send, FileText, CheckSquare,
  Calendar as CalendarIcon, Receipt, Globe, FolderOpen,
  Settings, LogOut, Menu, X as XIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/",          label: "Home",      icon: LayoutDashboard },
  { href: "/projects",  label: "Projects",  icon: Layers          },
  { href: "/contacts",  label: "Contacts",  icon: Users           },
  { href: "/outreach",  label: "Outreach",  icon: Send            },
  { href: "/notes",     label: "Notes",     icon: FileText        },
  { href: "/tasks",     label: "Tasks",     icon: CheckSquare     },
  { href: "/calendar",  label: "Calendar",  icon: CalendarIcon    },
  { href: "/finance",   label: "Finance",   icon: Receipt         },
  { href: "/presence",  label: "Presence",  icon: Globe           },
  { href: "/resources", label: "Resources", icon: FolderOpen      },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [studioName,  setStudioName]  = useState<string | null>(null);
  const pathname = usePathname();
  const router   = useRouter();

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Load profile name for the header
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, studio_name")
        .eq("user_id", data.user.id)
        .maybeSingle();
      setProfileName(prof?.display_name ?? null);
      setStudioName(prof?.studio_name  ?? null);
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Top bar */}
      <header
        className="md:hidden flex items-center justify-between px-4 shrink-0"
        style={{
          height: 52,
          background: "var(--color-off-white)",
          borderBottom: "0.5px solid var(--color-border)",
        }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          style={{
            background: "none", border: "none", padding: 8, cursor: "pointer",
            color: "var(--color-charcoal)", display: "flex", alignItems: "center", justifyContent: "center",
            marginLeft: -8,
          }}
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>

        <Image src="/Logotype.svg" alt="Perennial" width={100} height={24} style={{ height: "auto", opacity: 0.9 }} />

        <div style={{ width: 36 }} /> {/* spacer for visual balance */}
      </header>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          style={{
            position: "fixed", inset: 0, zIndex: 90,
            background: "rgba(31,33,26,0.45)",
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* Drawer — matches desktop sidebar tokens so the visual language is identical */}
      <aside
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0, bottom: 0, left: 0,
          width: 280, maxWidth: "85vw",
          background: "var(--color-sidebar-bg)",
          color: "var(--sidebar-text)",
          zIndex: 100,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.22s ease",
          display: "flex", flexDirection: "column",
          boxShadow: open ? "0 0 32px rgba(0,0,0,0.4)" : "none",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 16px",
            borderBottom: "0.5px solid var(--sidebar-divider)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--sidebar-text-active)" }}>
              {profileName ?? "Loading…"}
            </span>
            {studioName && (
              <span style={{ fontSize: 11, color: "var(--sidebar-soon-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {studioName}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            style={{
              background: "none", border: "none", padding: 6, cursor: "pointer",
              color: "var(--sidebar-text-hover)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, flexShrink: 0,
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Nav list */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13, fontWeight: 500,
                  fontFamily: "inherit", textDecoration: "none",
                  background: active ? "var(--sidebar-active-bg)" : "transparent",
                  color: active ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
                }}
              >
                <Icon size={17} strokeWidth={1.75} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "10px", borderTop: "0.5px solid var(--sidebar-divider)", display: "flex", flexDirection: "column", gap: 2 }}>
          <Link
            href="/settings"
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", textDecoration: "none",
              color: "var(--sidebar-text)",
            }}
          >
            <Settings size={17} strokeWidth={1.75} />
            <span>Settings</span>
          </Link>
          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", border: "none", cursor: "pointer",
              background: "transparent", color: "var(--sidebar-text)",
              width: "100%", textAlign: "left",
            }}
          >
            <LogOut size={17} strokeWidth={1.75} />
            <span>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
