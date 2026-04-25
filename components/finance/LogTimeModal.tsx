"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Project } from "@/types/database";
import { X } from "lucide-react";

interface Props {
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onClose: () => void;
  onCreated: (entry: TimeEntry) => void;
}

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function LogTimeModal({ projects, onClose, onCreated }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [description, setDescription] = useState("");
  const [projectId, setProjectId]     = useState("");
  const [hours, setHours]             = useState("");
  const [minutes, setMinutes]         = useState("");
  const [billable, setBillable]       = useState(true);
  const [loggedAt, setLoggedAt]       = useState(today);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const totalMinutes = (parseInt(hours || "0") * 60) + parseInt(minutes || "0");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalMinutes < 1) { setError("Enter at least 1 minute."); return; }
    setLoading(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated."); setLoading(false); return; }
    const { data, error: dbErr } = await supabase
      .from("time_entries")
      .insert({
        user_id: user.id,
        project_id: projectId || null,
        description: description.trim(),
        duration_minutes: totalMinutes,
        billable,
        logged_at: loggedAt,
      })
      .select("*, project:projects(id, title, type, rate)")
      .single();
    if (dbErr) { setError(dbErr.message); setLoading(false); return; }
    onCreated(data as TimeEntry);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(31,33,26,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-charcoal)" }}>Log time</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "var(--color-grey)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?" className={inputCls} style={inputStyle} autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Duration</label>
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <input type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)}
                  placeholder="0" className={inputCls} style={inputStyle} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: "var(--color-grey)" }}>hrs</span>
              </div>
              <div className="flex-1 relative">
                <input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)}
                  placeholder="0" className={inputCls} style={inputStyle} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: "var(--color-grey)" }}>min</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Date</label>
            <input type="date" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setBillable((v) => !v)}
              className="w-9 h-5 rounded-full transition-colors relative shrink-0"
              style={{ background: billable ? "var(--color-sage)" : "var(--color-border)" }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: billable ? "calc(100% - 18px)" : "2px" }} />
            </button>
            <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>Billable</span>
          </div>
          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "0.5px solid var(--color-border)" }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>Cancel</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || totalMinutes < 1}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: "var(--color-charcoal)" }}>
            {loading ? "Saving…" : "Log time"}
          </button>
        </div>
      </div>
    </div>
  );
}
