"use client";

// Sidebar widget that sits above Settings and shows getting-started progress.
// Collapses to a tiny one-line bar; expands on click to a checklist of all
// modules with visit checkmarks. Hides entirely when fully visited or the
// user has dismissed the tour.

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TOUR_MODULES, type TourVisited, progress } from "@/lib/tour";

interface Props { expanded: boolean }

export default function GettingStartedWidget({ expanded }: Props) {
  const [visited,   setVisited]   = useState<TourVisited | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [open,      setOpen]      = useState(false);

  // Initial load
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("tour_visited, tour_dismissed")
        .eq("user_id", user.id)
        .maybeSingle();
      setVisited((data?.tour_visited ?? {}) as TourVisited);
      setDismissed(Boolean(data?.tour_dismissed));
    })();
  }, []);

  // React to visit events fired by TourTracker
  useEffect(() => {
    function onVisit(e: Event) {
      const detail = (e as CustomEvent<{ visited: TourVisited }>).detail;
      if (detail?.visited) setVisited(detail.visited);
    }
    window.addEventListener("tour-visited", onVisit);
    return () => window.removeEventListener("tour-visited", onVisit);
  }, []);

  async function dismiss() {
    setDismissed(true);
    setOpen(false);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ tour_dismissed: true }).eq("user_id", user.id);
    window.dispatchEvent(new Event("tour-dismissed"));
  }

  if (visited === null || dismissed === null) return null;
  if (dismissed) return null;
  const { done, total } = progress(visited);
  if (done >= total) return null;

  const pct = Math.round((done / total) * 100);

  // Collapsed sidebar — show a thin pill only
  if (!expanded) {
    return (
      <div style={{ padding: "6px 7px" }}>
        <div
          aria-label={`Getting started: ${done} of ${total} modules visited`}
          title={`Getting started: ${done}/${total}`}
          style={{
            height: 4, borderRadius: 4, width: "100%",
            background: "var(--sidebar-divider)", overflow: "hidden",
          }}
        >
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-sage)" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "6px 7px 8px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", flexDirection: "column", gap: 6,
          width: "100%", padding: "8px 10px",
          background: "var(--sidebar-hover-bg)",
          border: "0.5px solid var(--sidebar-divider)",
          borderRadius: 8, cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--sidebar-text-hover)" }}>Getting started</span>
          <span style={{ fontSize: 10, color: "var(--sidebar-soon-text)" }}>{done}/{total}</span>
        </div>
        <div style={{ height: 4, borderRadius: 4, width: "100%", background: "var(--sidebar-divider)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-sage)", transition: "width 0.3s ease" }} />
        </div>
      </button>

      {open && (
        <div
          style={{
            marginTop: 8, padding: "10px 6px 6px",
            background: "var(--sidebar-active-bg)",
            border: "0.5px solid var(--sidebar-divider)",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "0 8px 10px", gap: 8 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--sidebar-soon-text)", marginBottom: 4 }}>
                Your first week
              </p>
              <p style={{ fontSize: 10, color: "var(--sidebar-soon-text)", lineHeight: 1.5 }}>
                Visit each module to see what it does. Ash learns from where you spend time.
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(); }}
              aria-label="Skip tour"
              title="Skip tour"
              style={{
                background: "none", border: "none", padding: 2, cursor: "pointer",
                color: "var(--sidebar-soon-text)", display: "flex", alignItems: "center",
                flexShrink: 0,
              }}
            >
              <XIcon size={11} />
            </button>
          </div>
          {TOUR_MODULES.map((m) => {
            const done = Boolean(visited[m.key]);
            return (
              <Link
                key={m.key}
                href={m.href}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "7px 8px", borderRadius: 6,
                  fontFamily: "inherit", textDecoration: "none",
                }}
              >
                <div
                  style={{
                    width: 14, height: 14, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    background: done ? "var(--color-sage)" : "transparent",
                    border: done ? "none" : "1px solid var(--sidebar-divider)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {done && <Check size={9} strokeWidth={3} color="white" />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    fontSize: 11, fontWeight: 500, lineHeight: 1.3,
                    color: done ? "var(--sidebar-soon-text)" : "var(--sidebar-text-hover)",
                    textDecoration: done ? "line-through" : "none",
                  }}>
                    {m.label}
                  </p>
                  {!done && (
                    <p style={{ fontSize: 10, color: "var(--sidebar-soon-text)", lineHeight: 1.4, marginTop: 2 }}>
                      {m.blurb}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
