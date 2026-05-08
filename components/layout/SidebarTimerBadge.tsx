"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActiveTimer } from "@/types/database";

function fmtTimer(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

interface Props { expanded: boolean }

export default function SidebarTimerBadge({ expanded }: Props) {
  const [timer,   setTimer]   = useState<ActiveTimer | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch active timer on mount
  useEffect(() => {
    createClient()
      .from("active_timers")
      .select("*, project:projects(id, title, type, rate)")
      .maybeSingle()
      .then(({ data }) => { if (data) setTimer(data as ActiveTimer); });
  }, []);

  // Listen for timer events from any component
  useEffect(() => {
    function onStarted(e: Event) {
      setTimer((e as CustomEvent<ActiveTimer>).detail);
    }
    function onStopped() { setTimer(null); }
    window.addEventListener("perennial:timer-started", onStarted);
    window.addEventListener("perennial:timer-stopped", onStopped);
    return () => {
      window.removeEventListener("perennial:timer-started", onStarted);
      window.removeEventListener("perennial:timer-stopped", onStopped);
    };
  }, []);

  // Live tick
  useEffect(() => {
    if (timer) {
      const tick = () => setSeconds(Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000));
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setSeconds(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timer]);

  if (!timer) return null;

  async function stop() {
    if (!timer) return;
    setLoading(true);
    const durationMinutes = Math.max(1, Math.floor(seconds / 60));
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    await supabase.from("time_entries").insert({
      user_id: user.id,
      project_id: timer.project_id,
      description: timer.description || "Timer entry",
      duration_minutes: durationMinutes,
      billable: true,
      logged_at: new Date().toISOString().split("T")[0],
    });
    await supabase.from("active_timers").delete().eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("perennial:timer-stopped"));
    setTimer(null);
    setLoading(false);
  }

  // Collapsed: compact pill — cream card, green dot + time
  if (!expanded) {
    return (
      <div style={{
        margin: "4px 7px", borderRadius: 8, padding: "7px 8px",
        background: "var(--color-off-white)", border: "0.5px solid var(--color-border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-sage)", display: "block" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-charcoal)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {fmtTimer(seconds)}
        </span>
      </div>
    );
  }

  // Expanded: full card widget
  return (
    <div style={{
      margin: "4px 7px", borderRadius: 8, padding: "10px 10px 8px",
      background: "var(--color-off-white)", border: "0.5px solid var(--color-border)",
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    }}>
      {/* Header row: pulsing dot + description + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: timer.project?.title ? 3 : 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-sage)", flexShrink: 0, display: "inline-block" }} />
        <span style={{ flex: 1, fontSize: 11, color: "var(--color-charcoal)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {timer.description || "Timer running"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-sage)", fontVariantNumeric: "tabular-nums", flexShrink: 0, letterSpacing: "-0.01em" }}>
          {fmtTimer(seconds)}
        </span>
      </div>
      {/* Project label */}
      {timer.project?.title && (
        <p style={{ fontSize: 10, color: "var(--color-grey)", marginBottom: 8, paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {timer.project.title}
        </p>
      )}
      {/* Stop button */}
      <button
        onClick={stop} disabled={loading}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          padding: "5px 0", borderRadius: 5, border: "0.5px solid var(--color-border)",
          background: "var(--color-cream)", color: "var(--color-red-orange)",
          cursor: loading ? "wait" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500,
          transition: "background 0.1s ease",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.08)"}
        onMouseLeave={e => e.currentTarget.style.background = "var(--color-cream)"}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><rect width="8" height="8" rx="1.5"/></svg>
        {loading ? "Stopping…" : "Stop timer"}
      </button>
    </div>
  );
}
