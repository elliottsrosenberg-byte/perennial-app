"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActiveTimer, Project } from "@/types/database";

interface Props {
  initialTimer: ActiveTimer | null;
  projects: Pick<Project, "id" | "title" | "rate">[];
}

function fmtTimer(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function TimerWidget({ initialTimer, projects }: Props) {
  const [timer,       setTimer]       = useState<ActiveTimer | null>(initialTimer);
  const [seconds,     setSeconds]     = useState(0);
  const [description, setDesc]        = useState("");
  const [projectId,   setProjectId]   = useState(projects[0]?.id ?? "");
  const [billable,    setBillable]    = useState(true);
  const [loading,     setLoading]     = useState(false);
  const [justStopped, setJustStopped] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

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
    setJustStopped(fmtDuration(durationMinutes));
    setTimer(null);
    setDesc("");
    setLoading(false);
    setTimeout(() => setJustStopped(null), 3000);
  }

  return (
    <div className="flex flex-col rounded-xl overflow-hidden"
      style={{ background: "var(--color-off-white)", boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)" }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-[14px] py-[10px]"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}>
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Timer</span>
        {timer && (
          <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--color-sage)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-sage)", display: "inline-block" }} />
            Running
          </span>
        )}
      </div>

      {/* Running state */}
      {timer ? (
        <div className="px-[14px] py-3 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-charcoal)" }}>
                {timer.description || "Timer running"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>
                {timer.project?.title ?? "No project"}
              </p>
            </div>
            <span className="text-[20px] font-bold tabular-nums shrink-0 leading-none mt-0.5"
              style={{ color: "var(--color-sage)", fontVariantNumeric: "tabular-nums" }}>
              {fmtTimer(seconds)}
            </span>
          </div>
          <button onClick={stop} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{ background: "rgba(220,62,13,0.08)", color: "var(--color-red-orange)", border: "0.5px solid rgba(220,62,13,0.2)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.14)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(220,62,13,0.08)"}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="10" height="10" rx="2"/></svg>
            {loading ? "Stopping…" : "Stop timer"}
          </button>
        </div>
      ) : (
        <div className="px-[14px] py-3 flex flex-col gap-2.5">
          {/* Just-stopped confirmation */}
          {justStopped && (
            <div className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[11px]"
              style={{ background: "rgba(61,107,79,0.08)", color: "var(--color-sage)" }}>
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {justStopped} logged
            </div>
          )}

          {/* Description */}
          <input
            ref={inputRef}
            type="text"
            value={description}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") start(); }}
            placeholder="What are you working on?"
            className="w-full text-[12px] px-3 py-2 rounded-lg focus:outline-none"
            style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" }}
          />

          {/* Project + billable */}
          <div className="flex gap-2 items-center">
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg focus:outline-none"
              style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)", fontFamily: "inherit" }}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button type="button" onClick={() => setBillable(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] shrink-0 transition-colors"
              style={{ background: billable ? "rgba(61,107,79,0.08)" : "transparent", color: billable ? "var(--color-sage)" : "var(--color-grey)", border: `0.5px solid ${billable ? "rgba(61,107,79,0.2)" : "var(--color-border)"}` }}>
              {billable ? "Billable" : "Internal"}
            </button>
          </div>

          {/* Start */}
          <button onClick={start} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: "var(--color-sage)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--color-sage-hover)"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--color-sage)"}>
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><path d="M0 0l10 6-10 6z"/></svg>
            {loading ? "Starting…" : "Start timer"}
          </button>
        </div>
      )}
    </div>
  );
}
