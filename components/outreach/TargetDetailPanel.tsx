"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachTarget, OutreachPipeline, PipelineStage } from "@/types/database";
import { X, Trash2 } from "lucide-react";

interface Props {
  target: OutreachTarget;
  pipeline: OutreachPipeline & { stages: PipelineStage[] };
  onClose: () => void;
  onUpdated: (target: OutreachTarget) => void;
  onDeleted: (targetId: string) => void;
}

const inputCls = "w-full px-3 py-2 text-[13px] rounded-lg border transition-colors focus:outline-none";
const inputStyle = { background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)", color: "var(--color-charcoal)" };

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TargetDetailPanel({ target, pipeline, onClose, onUpdated, onDeleted }: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(target.name);
  const [editLocation, setEditLocation] = useState(target.location ?? "");
  const [editDescription, setEditDescription] = useState(target.description ?? "");
  const [editStageId, setEditStageId] = useState(target.stage_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeStages = pipeline.stages.filter((s) => !s.is_outcome);
  const outcomeStages = pipeline.stages.filter((s) => s.is_outcome);

  // Sync state when target prop changes
  useEffect(() => {
    setEditName(target.name);
    setEditLocation(target.location ?? "");
    setEditDescription(target.description ?? "");
    setEditStageId(target.stage_id ?? "");
  }, [target.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmDelete) { setConfirmDelete(false); return; }
        if (editing) { cancelEdit(); return; }
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [editing, confirmDelete, onClose]);

  function cancelEdit() {
    setEditName(target.name);
    setEditLocation(target.location ?? "");
    setEditDescription(target.description ?? "");
    setEditStageId(target.stage_id ?? "");
    setEditing(false);
    setError(null);
  }

  async function saveEdits() {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: dbErr } = await supabase
      .from("outreach_targets")
      .update({
        name: editName.trim(),
        location: editLocation.trim() || null,
        description: editDescription.trim() || null,
        stage_id: editStageId || null,
        last_touched_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .select("*, pipeline:outreach_pipelines(*), stage:pipeline_stages(*), contact:contacts(*, company:companies(*)), company:companies(*)")
      .single();

    if (dbErr) { setError(dbErr.message); setSaving(false); return; }
    onUpdated(data as OutreachTarget);
    setEditing(false);
    setSaving(false);
  }

  async function changeStage(stageId: string) {
    const supabase = createClient();
    const { data, error: dbErr } = await supabase
      .from("outreach_targets")
      .update({ stage_id: stageId, last_touched_at: new Date().toISOString() })
      .eq("id", target.id)
      .select("*, pipeline:outreach_pipelines(*), stage:pipeline_stages(*), contact:contacts(*, company:companies(*)), company:companies(*)")
      .single();
    if (!dbErr && data) {
      onUpdated(data as OutreachTarget);
      setEditStageId(stageId);
    }
  }

  async function handleDelete() {
    const supabase = createClient();
    await supabase.from("outreach_targets").delete().eq("id", target.id);
    onDeleted(target.id);
    onClose();
  }

  const currentStageId = editing ? editStageId : (target.stage_id ?? "");
  const linkedLabel = target.contact
    ? `${target.contact.first_name} ${target.contact.last_name}`
    : target.company?.name ?? null;

  return (
    <div
      className="fixed z-40"
      style={{ inset: 0, left: "56px", background: "rgba(31,33,26,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !editing) onClose(); }}
    >
      <div
        className="absolute flex flex-col overflow-hidden rounded-2xl"
        style={{
          top: 48, bottom: 48, left: 48, right: 48,
          background: "var(--color-off-white)",
          border: "0.5px solid var(--color-border)",
          boxShadow: "0 8px 40px rgba(31,33,26,0.18)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 shrink-0"
          style={{ borderBottom: "0.5px solid var(--color-border)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: pipeline.color }}>
            {target.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-[15px] font-semibold bg-transparent border-b focus:outline-none w-full"
                style={{ color: "var(--color-charcoal)", borderColor: "var(--color-border)" }}
              />
            ) : (
              <h2 className="text-[15px] font-semibold truncate" style={{ color: "var(--color-charcoal)" }}>
                {target.name}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: pipeline.color + "20", color: pipeline.color }}>
                {pipeline.name}
              </span>
              {linkedLabel && (
                <span className="text-[11px] truncate" style={{ color: "var(--color-grey)" }}>{linkedLabel}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                <button type="button" onClick={cancelEdit}
                  className="px-3 py-1.5 text-[12px] rounded-lg"
                  style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}>
                  Cancel
                </button>
                <button type="button" onClick={saveEdits} disabled={saving}
                  className="px-3 py-1.5 text-[12px] font-medium rounded-lg text-white disabled:opacity-50"
                  style={{ background: pipeline.color }}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-[12px] rounded-lg"
                style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}>
                Edit
              </button>
            )}
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ color: "var(--color-grey)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Active stage selector */}
          <div>
            <p className="text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>Stage</p>
            <div className="flex flex-wrap gap-1.5">
              {activeStages.map((s) => {
                const isActive = currentStageId === s.id;
                return (
                  <button key={s.id} type="button"
                    onClick={() => editing ? setEditStageId(s.id) : changeStage(s.id)}
                    className="px-3 py-1 rounded-full text-[11px] transition-colors"
                    style={{
                      background: isActive ? pipeline.color : "var(--color-cream)",
                      color: isActive ? "white" : "#6b6860",
                      border: "0.5px solid var(--color-border)",
                    }}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>Location</p>
            {editing ? (
              <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)}
                placeholder="New York, NY" className={inputCls} style={inputStyle} />
            ) : (
              <p className="text-[13px]" style={{ color: target.location ? "var(--color-charcoal)" : "var(--color-grey)" }}>
                {target.location ?? "—"}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>Notes</p>
            {editing ? (
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Context, next steps, background…" rows={5}
                className={inputCls} style={{ ...inputStyle, resize: "none" }} />
            ) : (
              <p className="text-[13px] whitespace-pre-wrap"
                style={{ color: target.description ? "var(--color-charcoal)" : "var(--color-grey)" }}>
                {target.description ?? "—"}
              </p>
            )}
          </div>

          {/* Linked entity */}
          {(target.contact ?? target.company) && (
            <div>
              <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--color-charcoal)" }}>
                {target.contact ? "Contact" : "Company"}
              </p>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--color-cream)", border: "0.5px solid var(--color-border)" }}>
                <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-semibold"
                  style={{ background: pipeline.color + "20", color: pipeline.color }}>
                  {target.contact
                    ? (target.contact.first_name[0] + target.contact.last_name[0]).toUpperCase()
                    : target.company!.name[0].toUpperCase()}
                </div>
                <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>{linkedLabel}</span>
              </div>
            </div>
          )}

          {/* Outcome stages */}
          {outcomeStages.length > 0 && (
            <div>
              <p className="text-[11px] font-medium mb-2" style={{ color: "var(--color-charcoal)" }}>Outcome</p>
              <div className="flex flex-wrap gap-1.5">
                {outcomeStages.map((s) => {
                  const isActive = currentStageId === s.id;
                  return (
                    <button key={s.id} type="button"
                      onClick={() => editing ? setEditStageId(s.id) : changeStage(s.id)}
                      className="px-3 py-1 rounded-full text-[11px] transition-colors"
                      style={{
                        background: isActive ? "rgba(31,33,26,0.12)" : "var(--color-cream)",
                        color: isActive ? "var(--color-charcoal)" : "#6b6860",
                        border: "0.5px solid var(--color-border)",
                        fontWeight: isActive ? 500 : 400,
                      }}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>
            Last touched {fmtDate(target.last_touched_at)}
          </p>

          {error && <p className="text-[12px]" style={{ color: "var(--color-red-orange)" }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ borderTop: "0.5px solid var(--color-border)" }}>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>Delete this target?</span>
              <button onClick={handleDelete}
                className="px-3 py-1 text-[12px] rounded-lg text-white"
                style={{ background: "var(--color-red-orange)" }}>
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="px-3 py-1 text-[12px] rounded-lg"
                style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--color-red-orange)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(220,62,13,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <Trash2 size={13} />
              Delete target
            </button>
          )}
          <span className="text-[11px]" style={{ color: "var(--color-grey)" }}>
            Added {new Date(target.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>
    </div>
  );
}
