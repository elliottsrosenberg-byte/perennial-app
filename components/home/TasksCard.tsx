"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import VisitButton from "@/components/ui/VisitButton";

export interface HomeTask {
  id:        string;
  title:     string;
  due_date:  string | null;
  priority:  string | null;
  completed: boolean;
  project:   { id: string; title: string } | null;
}

function dueBadge(iso: string | null) {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days < 0)  return { label: `${Math.abs(days)}d ago`, color: "var(--color-red-orange)", bg: "rgba(220,62,13,0.10)" };
  if (days === 0) return { label: "Today",                 color: "#a07800",                 bg: "rgba(232,197,71,0.15)" };
  if (days === 1) return { label: "Tomorrow",              color: "#a07800",                 bg: "rgba(232,197,71,0.15)" };
  if (days < 7)  return { label: `In ${days}d`,            color: "var(--color-grey)",       bg: "var(--color-cream)" };
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][target.getMonth()];
  return { label: `${m} ${target.getDate()}`, color: "var(--color-grey)", bg: "var(--color-cream)" };
}

export default function TasksCard({ initialTasks }: { initialTasks: HomeTask[] }) {
  const [tasks, setTasks] = useState<HomeTask[]>(initialTasks);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function quickAdd() {
    const title = draft.trim();
    if (!title || saving) return;
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data, error } = await supabase
      .from("tasks")
      .insert({ user_id: user.id, title })
      .select("id, title, due_date, priority, completed")
      .single();
    setSaving(false);
    if (!error && data) {
      setTasks((t) => [{ ...data, project: null } as HomeTask, ...t]);
      setDraft("");
      inputRef.current?.focus();
    }
  }

  async function toggleDone(id: string) {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const next = !target.completed;
    setTasks((arr) => arr.map((t) => t.id === id ? { ...t, completed: next } : t));
    const supabase = createClient();
    await supabase.from("tasks").update({ completed: next }).eq("id", id);
    if (next) {
      // Remove from list after a beat so the check animation reads
      setTimeout(() => setTasks((arr) => arr.filter((t) => t.id !== id)), 250);
    }
  }

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--color-off-white)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-[14px] py-[10px] shrink-0"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <span className="text-[12px] font-semibold flex-1" style={{ color: "var(--color-charcoal)" }}>Tasks</span>
        {tasks.length > 0 && (
          <span
            className="text-[10px] px-[7px] py-[1px] rounded-full"
            style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)", color: "var(--color-grey)" }}
          >
            {tasks.length}
          </span>
        )}
        <VisitButton href="/tasks" />
      </div>

      {/* Quick add */}
      <div
        className="flex items-center gap-2 px-[14px] py-[9px] shrink-0"
        style={{ borderBottom: "0.5px solid var(--color-border)" }}
      >
        <div className="w-3.5 h-3.5 rounded-[4px] shrink-0" style={{ border: "1px solid var(--color-border)" }} />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }}
          placeholder="Add a task…"
          disabled={saving}
          className="flex-1 bg-transparent outline-none text-[12px]"
          style={{ color: "var(--color-charcoal)" }}
        />
      </div>

      {/* List */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-8 px-4 text-center">
            <p className="text-[12px] font-medium mb-0.5" style={{ color: "var(--color-charcoal)" }}>
              Nothing on your plate
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
              Add a quick task above, or open the Tasks module.
            </p>
          </div>
        ) : (
          tasks.map((t) => {
            const badge = dueBadge(t.due_date);
            return (
              <button
                key={t.id}
                onClick={() => toggleDone(t.id)}
                className="flex items-center gap-2 px-[14px] py-[9px] text-left transition-colors"
                style={{ borderBottom: "0.5px solid var(--color-border)", background: t.completed ? "rgba(141,208,71,0.06)" : "transparent" }}
                onMouseEnter={(e) => { if (!t.completed) e.currentTarget.style.background = "var(--color-cream)"; }}
                onMouseLeave={(e) => { if (!t.completed) e.currentTarget.style.background = "transparent"; }}
              >
                <div
                  className="w-3.5 h-3.5 rounded-[4px] shrink-0 flex items-center justify-center"
                  style={{
                    border: t.completed ? "none" : "1px solid var(--color-border)",
                    background: t.completed ? "var(--color-sage)" : "transparent",
                  }}
                >
                  {t.completed && (
                    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8l3.5 3.5L13 4.5" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[12px] truncate block"
                    style={{
                      color: t.completed ? "var(--color-grey)" : "var(--color-charcoal)",
                      textDecoration: t.completed ? "line-through" : "none",
                    }}
                  >
                    {t.title}
                  </span>
                  {t.project && (
                    <span className="text-[10px] truncate block" style={{ color: "var(--color-grey)" }}>
                      {t.project.title}
                    </span>
                  )}
                </div>
                {badge && (
                  <span
                    className="text-[9px] font-semibold px-[6px] py-[2px] rounded-full shrink-0"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
