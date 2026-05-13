"use client";

// Sidebar widget above Settings. Always-visible richer card showing
// progress + the next module the user should explore. No click-to-expand.
// Collapses to a thin progress pill when the sidebar is collapsed.
// Hides entirely when fully visited or the user has dismissed the tour.

import { useState, useEffect } from "react";
import Link from "next/link";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type TourVisited, progress, nextUnvisited } from "@/lib/tour";

interface Props { expanded: boolean }

export default function GettingStartedWidget({ expanded }: Props) {
  const [visited,   setVisited]   = useState<TourVisited | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

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

  async function dismiss(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setDismissed(true);
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

  const pct  = Math.round((done / total) * 100);
  const next = nextUnvisited(visited);

  // Collapsed sidebar — show only a thin pill (with tooltip on hover)
  if (!expanded) {
    return (
      <div style={{ padding: "6px 7px" }}>
        <div
          aria-label={`Getting started: ${done} of ${total} modules visited`}
          title={`Getting started · ${done}/${total}${next ? ` · next: ${next.label}` : ""}`}
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
      <div
        style={{
          display: "flex", flexDirection: "column", gap: 10,
          width: "100%", padding: "10px 11px",
          background: "var(--sidebar-hover-bg)",
          border: "0.5px solid var(--sidebar-divider)",
          borderRadius: 8,
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        {/* Header: title + count + dismiss */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.95)" }}>
            Getting started
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{done}/{total}</span>
            <button
              onClick={dismiss}
              aria-label="Skip tour"
              title="Skip tour"
              style={{
                background: "none", border: "none", padding: 2, cursor: "pointer",
                color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center",
                borderRadius: 4,
              }}
            >
              <XIcon size={11} />
            </button>
          </div>
        </div>

        {/* Progress bar — darker track + warm fill for readability on sage */}
        <div style={{ height: 4, borderRadius: 4, width: "100%", background: "rgba(0,0,0,0.18)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "rgba(255,255,255,0.95)", transition: "width 0.3s ease" }} />
        </div>

        {/* Up next — the actionable bit. Hardcoded high-opacity whites for
            readable contrast on the sage sidebar background. */}
        {next && next.key !== "home" && (
          <Link
            href={next.href}
            style={{
              display: "flex", flexDirection: "column", gap: 3,
              textDecoration: "none", fontFamily: "inherit",
              padding: "8px 10px", margin: "-2px -2px 0",
              borderRadius: 6,
              background: "rgba(255,255,255,0.18)",
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.7)" }}>
              Up next
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.98)", lineHeight: 1.2 }}>
              {next.label} →
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.82)", lineHeight: 1.45 }}>
              {next.blurb}
            </span>
          </Link>
        )}

        {/* Special case: home not yet done — refer to the on-screen tour */}
        {next && next.key === "home" && (
          <div
            style={{
              display: "flex", flexDirection: "column", gap: 3,
              padding: "8px 10px", margin: "-2px -2px 0",
              borderRadius: 6,
              background: "rgba(255,255,255,0.18)",
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.7)" }}>
              Up next
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.98)", lineHeight: 1.2 }}>
              Dashboard tour
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.82)", lineHeight: 1.45 }}>
              Walk through the home dashboard to begin.
            </span>
          </div>
        )}

        {/* Explicit off-switch — also reachable from Settings → Preferences */}
        <button
          onClick={dismiss}
          style={{
            fontSize: 10, fontWeight: 500,
            color: "rgba(255,255,255,0.7)",
            background: "none", border: "none",
            padding: "2px 0",
            textDecoration: "underline",
            textDecorationColor: "rgba(255,255,255,0.3)",
            cursor: "pointer", fontFamily: "inherit",
            textAlign: "left", width: "fit-content",
          }}
        >
          Turn off all tips
        </button>
      </div>
    </div>
  );
}
