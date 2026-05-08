"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActiveTimer, Project } from "@/types/database";

function fmtTimer(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

interface Props {
  initialTimer: ActiveTimer | null;
  projects: Pick<Project, "id" | "title" | "rate">[];
}

export default function QuickTimerButton({ initialTimer, projects }: Props) {
  const [timer,       setTimer]     = useState<ActiveTimer | null>(initialTimer);
  const [seconds,     setSeconds]   = useState(0);
  const [open,        setOpen]      = useState(false);
  const [projectId,   setProjectId] = useState(projects[0]?.id ?? "");
  const [description, setDesc]      = useState("");
  const [billable,    setBillable]  = useState(true);
  const [loading,     setLoading]   = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modalRef    = useRef<HTMLDivElement>(null);

  // Listen for timer events
  useEffect(() => {
    function onStarted(e: Event) { setTimer((e as CustomEvent<ActiveTimer>).detail); }
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

  // Close modal on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function start() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("active_timers")
      .upsert({ user_id: user.id, project_id: projectId || null, description: description.trim(), started_at: new Date().toISOString() })
      .select("*, project:projects(id, title, type, rate)")
      .single();
    if (data) {
      const t = data as ActiveTimer;
      setTimer(t);
      window.dispatchEvent(new CustomEvent("perennial:timer-started", { detail: t }));
    }
    setOpen(false);
    setLoading(false);
  }

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
      billable,
      logged_at: new Date().toISOString().split("T")[0],
    });
    await supabase.from("active_timers").delete().eq("user_id", user.id);
    window.dispatchEvent(new CustomEvent("perennial:timer-stopped"));
    setTimer(null);
    setLoading(false);
  }

  const inputCls = "w-full px-3 py-2 text-[12px] rounded-lg focus:outline-none";
  const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" };

  // Running — show compact live timer + stop button
  if (timer) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 7, background: "rgba(155,163,122,0.12)", border: "0.5px solid rgba(155,163,122,0.3)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-sage)", display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--color-sage)", fontWeight: 500, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {timer.description || timer.project?.title || "Timer"}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-sage)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {fmtTimer(seconds)}
          </span>
        </div>
        <button
          onClick={stop} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 7, background: "rgba(220,62,13,0.08)", border: "0.5px solid rgba(220,62,13,0.25)", color: "var(--color-red-orange)", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500 }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.14)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(220,62,13,0.08)"}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><rect width="8" height="8" rx="1.5"/></svg>
          Stop
        </button>
      </div>
    );
  }

  // Idle — play button + modal
  return (
    <div style={{ position: "relative" }} ref={modalRef}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
          borderRadius: 6, border: "0.5px solid var(--color-border)",
          background: open ? "var(--color-cream)" : "transparent",
          color: "#6b6860", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 500,
          transition: "background 0.1s ease",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "var(--color-cream)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor"><path d="M0 0l9 5-9 5z"/></svg>
        Start timer
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100,
          background: "var(--color-off-white)", border: "0.5px solid var(--color-border)",
          borderRadius: 12, boxShadow: "0 8px 32px rgba(31,33,26,0.18)",
          padding: "20px", width: 280,
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-charcoal)", marginBottom: 14 }}>New time entry</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className={inputCls} style={inputStyle}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>

            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(); }}
              placeholder="Notes (optional)"
              rows={2}
              className={inputCls} style={{ ...inputStyle, resize: "none" }}
            />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button type="button" onClick={() => setBillable(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: billable ? "var(--color-sage)" : "var(--color-grey)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ width: 28, height: 16, borderRadius: 8, background: billable ? "var(--color-sage)" : "var(--color-border)", position: "relative", flexShrink: 0, transition: "background 0.15s ease" }}>
                  <div style={{ position: "absolute", top: 2, left: billable ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "white", transition: "left 0.15s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
                </div>
                {billable ? "Billable" : "Internal"}
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setOpen(false)}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "0.5px solid var(--color-border)", background: "transparent", color: "#6b6860", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-cream)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  Cancel
                </button>
                <button onClick={start} disabled={loading}
                  style={{ padding: "6px 16px", borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1 }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-sage-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-sage)"}>
                  {loading ? "Starting…" : "Start"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
