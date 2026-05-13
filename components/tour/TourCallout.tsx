"use client";

// Floating callout anchored to the sidebar nav item for the next unvisited
// module. Reads profile.tour_visited / tour_dismissed, listens to "tour-
// visited" + "tour-dismissed" events to update without a re-fetch. Repositions
// on window resize and on a small interval to catch sidebar expand/collapse.

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X as XIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TOUR_MODULES, nextUnvisited, type TourVisited } from "@/lib/tour";
import { TOUR_WAITING_KEY } from "@/components/tour/DashboardTour";

interface Pos { top: number; left: number }

export default function TourCallout() {
  const router   = useRouter();
  const pathname = usePathname();
  const [visited,    setVisited]    = useState<TourVisited | null>(null);
  const [dismissed,  setDismissed]  = useState<boolean | null>(null);
  const [pos,        setPos]        = useState<Pos | null>(null);
  const [hidden,     setHidden]     = useState(false);
  // Suppressed while the user is in the post-onboarding Ash conversation
  // (DashboardTour final step → Ash open → user hasn't closed Ash yet).
  const [waitingAsh, setWaitingAsh] = useState<boolean>(() =>
    typeof window !== "undefined" && sessionStorage.getItem(TOUR_WAITING_KEY) === "1"
  );

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

  // Update on tour events
  useEffect(() => {
    function onVisit(e: Event) {
      const detail = (e as CustomEvent<{ visited: TourVisited }>).detail;
      if (detail?.visited) setVisited(detail.visited);
    }
    function onDismiss()       { setDismissed(true); }
    function onWaitingAsh()    { setWaitingAsh(true); }
    function onAshClosed()     { setWaitingAsh(false); }
    window.addEventListener("tour-visited",     onVisit);
    window.addEventListener("tour-dismissed",   onDismiss);
    window.addEventListener("tour-waiting-ash", onWaitingAsh);
    window.addEventListener("tour-ash-closed",  onAshClosed);
    return () => {
      window.removeEventListener("tour-visited",     onVisit);
      window.removeEventListener("tour-dismissed",   onDismiss);
      window.removeEventListener("tour-waiting-ash", onWaitingAsh);
      window.removeEventListener("tour-ash-closed",  onAshClosed);
    };
  }, []);

  // "home" is owned by DashboardTour (no sidebar anchor). If it's the next
  // unvisited module, the sidebar callout stays hidden — the dashboard tour
  // is in charge until the user opens Ash from its final step.
  // Also hide if the user is already on the target page — the in-module
  // walkthrough is in charge there.
  const rawNext = visited && !dismissed && !waitingAsh ? nextUnvisited(visited) : null;
  const onTargetPage =
    rawNext != null && pathname != null &&
    (pathname === rawNext.href || (rawNext.href !== "/" && pathname.startsWith(rawNext.href + "/")));
  const next = rawNext && rawNext.key !== "home" && !onTargetPage ? rawNext : null;

  const reposition = useCallback(() => {
    if (!next) { setPos(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour-key="${next.key}"]`);
    if (!el) { setPos(null); return; }
    const r = el.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 14 });
  }, [next]);

  // Reposition whenever the target changes, on resize, and on a low-freq
  // poll (covers sidebar collapse/expand which doesn't fire an event we can
  // hook directly).
  useEffect(() => {
    reposition();
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    const interval = window.setInterval(reposition, 500);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(interval);
    };
  }, [reposition]);

  if (!next || !pos || hidden) return null;

  async function dismiss() {
    setHidden(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ tour_dismissed: true }).eq("user_id", user.id);
    window.dispatchEvent(new Event("tour-dismissed"));
  }

  return (
    <div
      role="dialog"
      aria-label={`Tour: ${next.label}`}
      style={{
        position: "fixed",
        top:  pos.top,
        left: pos.left,
        transform: "translateY(-50%)",
        zIndex: 50,
        width: 250,
        background: "var(--color-charcoal)",
        color: "var(--color-warm-white)",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(31,33,26,0.28), 0 2px 6px rgba(31,33,26,0.18)",
        padding: "12px 14px",
        fontFamily: "inherit",
      }}
    >
      {/* Pointer arrow toward the sidebar */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: -6,
          top: "50%", transform: "translateY(-50%) rotate(45deg)",
          width: 12, height: 12,
          background: "var(--color-charcoal)",
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(245,241,233,0.55)", marginBottom: 3 }}>
            Quick tour · {TOUR_MODULES.findIndex((m) => m.key === next.key) + 1} of {TOUR_MODULES.length}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(245,241,233,0.96)" }}>{next.label}</p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss tour"
          title="Dismiss tour"
          style={{
            background: "none", border: "none", padding: 4, cursor: "pointer",
            color: "rgba(245,241,233,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 4, flexShrink: 0,
          }}
        >
          <XIcon size={13} />
        </button>
      </div>

      <p style={{ fontSize: 11, color: "rgba(245,241,233,0.7)", lineHeight: 1.55, marginBottom: 10 }}>
        {next.blurb}
      </p>

      <button
        onClick={() => { router.push(next.href); }}
        style={{
          width: "100%", padding: "7px 0",
          fontSize: 11, fontWeight: 600,
          background: "var(--color-sage)", color: "var(--color-warm-white)",
          border: "none", borderRadius: 8, cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Open {next.label} →
      </button>
    </div>
  );
}
