"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TimeEntry, Project } from "@/types/database";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Modal from "@/components/ui/Modal";

interface Props {
  projects: Pick<Project, "id" | "title" | "type" | "rate">[];
  onClose: () => void;
  onCreated: (entry: TimeEntry) => void;
  /** When provided, the modal opens in edit mode and PATCHes the row. */
  entry?: TimeEntry;
  onUpdated?: (entry: TimeEntry) => void;
}

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

export default function LogTimeModal({ projects, onClose, onCreated, entry, onUpdated }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const isEdit = !!entry;
  const initHrs = entry ? String(Math.floor(entry.duration_minutes / 60)) : "";
  const initMin = entry ? String(entry.duration_minutes % 60) : "";
  const [description, setDescription] = useState(entry?.description ?? "");
  const [projectId, setProjectId]     = useState(entry?.project_id ?? "");
  const [hours, setHours]             = useState(initHrs);
  const [minutes, setMinutes]         = useState(initMin);
  const [billable, setBillable]       = useState(entry?.billable ?? true);
  const [loggedAt, setLoggedAt]       = useState(entry?.logged_at ?? today);
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

    if (isEdit && entry) {
      // Scope the update by id AND user_id — defence in depth against
      // RLS misconfig. Returning the full row with project keeps the
      // parent's list update cheap.
      const { data, error: dbErr } = await supabase
        .from("time_entries")
        .update({
          project_id: projectId || null,
          description: description.trim(),
          duration_minutes: totalMinutes,
          billable,
          logged_at: loggedAt,
        })
        .eq("id", entry.id)
        .eq("user_id", user.id)
        .select("*, project:projects(id, title, type, rate)")
        .single();
      if (dbErr) { setError(dbErr.message); setLoading(false); return; }
      onUpdated?.(data as TimeEntry);
      onClose();
      return;
    }

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
    <Modal
      onClose={onClose}
      size="sm"
      title={isEdit ? "Edit time entry" : "Log time"}
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-[13px] rounded-lg"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>Cancel</button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading || totalMinutes < 1}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white disabled:opacity-50"
            style={{ background: "var(--color-sage)" }}>
            {loading ? "Saving…" : isEdit ? "Save changes" : "Log time"}
          </button>
        </>
      }
    >
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?" className={inputCls} style={inputStyle} autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>Project</label>
            <Select
              value={projectId}
              onChange={setProjectId}
              options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.title }))]}
              placeholder="No project"
            />
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
            <DatePicker
              value={loggedAt ? new Date(loggedAt + "T12:00:00") : null}
              onChange={(d) => {
                const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                setLoggedAt(`${y}-${m}-${day}`);
              }}
            />
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
    </Modal>
  );
}
