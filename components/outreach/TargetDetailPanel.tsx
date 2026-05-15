"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutreachTarget, OutreachPipeline, PipelineStage } from "@/types/database";
import { X, Maximize2, Minimize2, FileText, Trash2, Settings } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { getRichExtensions, RichToolbar, InlineAshPopover, submitInlineAsh } from "@/components/ui/RichEditor";
import type { AshPromptState } from "@/components/ui/RichEditor";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ── Canvas editor ─────────────────────────────────────────────────────────────

function TargetCanvasEditor({
  targetId, targetName, contactId, initialHtml,
}: {
  targetId:    string;
  targetName:  string;
  /** When the outreach target is a known contact, surface that id so Ash
   *  auto-links new tasks/activities to the person. */
  contactId:   string | null;
  initialHtml: string | null;
}) {
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [ashPrompt, setAshPrompt] = useState<AshPromptState>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAshTrigger = useCallback((pos: number, coords: { top: number; left: number; bottom: number }) => {
    setAshPrompt({ pos, anchor: coords });
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: getRichExtensions({ placeholder: "Canvas — notes, research, strategy for this target…", onAshTrigger: handleAshTrigger }),
    content: initialHtml ?? "",
    onUpdate({ editor }) { scheduleSave(editor.getHTML()); },
    editorProps: { attributes: { style: "outline: none; min-height: 300px; font-size: 14px; line-height: 1.8; color: #6b6860;" } },
  }, [targetId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        const html = editor?.getHTML() ?? "";
        createClient().from("outreach_targets").update({ canvas_html: html || null }).eq("id", targetId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  function scheduleSave(html: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true); setSaved(false);
    saveTimer.current = setTimeout(async () => {
      await createClient().from("outreach_targets").update({ canvas_html: html || null }).eq("id", targetId);
      setSaving(false); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }

  function handleAshSubmit(prompt: string) {
    return submitInlineAsh({
      prompt, editor, ashPrompt,
      surface: {
        type:        "outreach-target",
        target_id:   targetId,
        target_name: targetName,
        contact_id:  contactId ?? undefined,
      },
      clearPrompt: () => setAshPrompt(null),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", position: "relative" }}>
      <RichToolbar editor={editor} />
      <div style={{ flex: 1, overflowY: "auto", background: "var(--color-off-white)" }}>
        <div style={{ maxWidth: 760, padding: "36px 60px 80px" }}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "5px 20px", borderTop: "0.5px solid var(--color-border)", background: "var(--color-off-white)", flexShrink: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>
        {saving && "Saving…"}
        {!saving && saved && <span style={{ color: "var(--color-sage)" }}>✓ Saved</span>}
      </div>
      {ashPrompt && <InlineAshPopover anchor={ashPrompt.anchor} onSubmit={handleAshSubmit} onClose={() => setAshPrompt(null)} />}
    </div>
  );
}

// ── AshStrip ──────────────────────────────────────────────────────────────────

function TargetAshStrip({ target, pipeline }: { target: OutreachTarget; pipeline: OutreachPipeline & { stages: PipelineStage[] } }) {
  const stage = pipeline.stages.find(s => s.id === target.stage_id);
  const stageName = stage?.name ?? "first stage";
  const stale = daysSince(target.last_touched_at);
  const name = target.name;

  function generateContent(): { prompt: string; action: string; buttonLabel: string } {
    if (stage?.is_outcome) return {
      prompt:      `${name} is at an outcome stage. Want a quick note on what happened?`,
      action:      `Write a brief summary of what happened with ${name} — the outcome, key context, and any follow-on actions.`,
      buttonLabel: "Summarize outcome",
    };
    if (stale > 30) return {
      prompt:      `${name} hasn't been touched in ${stale} days. Time to re-engage?`,
      action:      `Draft a re-engagement message for ${name}. It's been ${stale} days — keep it natural and give them an easy reason to respond.`,
      buttonLabel: "Re-engage",
    };
    if (stale > 14) return {
      prompt:      `You last touched ${name} ${stale} days ago. A follow-up could keep this moving.`,
      action:      `Draft a follow-up message for ${name}. It's been ${stale} days — be concise, reference past context, and suggest a clear next step.`,
      buttonLabel: "Follow up",
    };
    if (stage?.meta_stage === "identify") return {
      prompt:      `${name} is at ${stageName}. I can help you research them and craft a strong opener.`,
      action:      `Help me prepare to reach out to ${name} in the ${pipeline.name} pipeline. What should I know about them, and what's the best opening message?`,
      buttonLabel: "Prepare outreach",
    };
    if (stage?.meta_stage === "submit") return {
      prompt:      `${name} is at ${stageName}. I can draft your pitch or submission.`,
      action:      `Draft a compelling pitch or submission message for ${name} in the ${pipeline.name} pipeline. Keep it targeted and professional.`,
      buttonLabel: "Draft pitch",
    };
    if (stage?.meta_stage === "discuss") return {
      prompt:      `You're in discussion with ${name}. I can help you move toward a decision.`,
      action:      `How do I move my conversation with ${name} forward? We're at ${stageName}. Give me a clear next move to advance toward a yes or no.`,
      buttonLabel: "Move forward",
    };
    return {
      prompt:      `I can help you think through your next move with ${name}.`,
      action:      `What's the best next step with ${name} in my ${pipeline.name} pipeline? Give me a specific action and the message to send.`,
      buttonLabel: "Next step",
    };
  }

  const { prompt, action, buttonLabel } = generateContent();

  function handleContextual() {
    window.dispatchEvent(new CustomEvent("open-ash", {
      detail: { message: action, pipeline: { name: pipeline.name, color: pipeline.color } },
    }));
  }
  function handleOpenAsh() {
    window.dispatchEvent(new CustomEvent("open-ash", {
      detail: { pipeline: { name: pipeline.name, color: pipeline.color } },
    }));
  }

  return (
    <div style={{
      flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
      padding: "0 18px", height: 56,
      background: "linear-gradient(135deg, #7a9a55 0%, #5a7a38 45%, #3a5228 100%)",
    }}>
      <img src="/Ash-Logomak.svg" alt="" style={{ width: 16, height: 16, flexShrink: 0, filter: "brightness(0) invert(1)", opacity: 0.9, animation: "ash-shimmer 4s ease-in-out infinite" }} />
      <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.88)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {prompt}
      </span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={handleContextual}
          style={{ fontSize: 11, fontWeight: 700, color: "white", background: "rgba(255,255,255,0.22)", border: "0.5px solid rgba(255,255,255,0.35)", borderRadius: 9999, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.32)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}>
          {buttonLabel} →
        </button>
        <button onClick={handleOpenAsh}
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.75)", background: "transparent", border: "0.5px solid rgba(255,255,255,0.25)", borderRadius: 9999, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", lineHeight: 1 }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "white"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}>
          Ask Ash
        </button>
      </div>
    </div>
  );
}

// ── EditableField ─────────────────────────────────────────────────────────────

function EditableField({ label, value, placeholder = "—", onSave }: {
  label: string; value: string | null; placeholder?: string; onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() {
    setEditing(false);
    const v = draft.trim() || null;
    if (v !== (value || null)) onSave(v);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid var(--color-border)" }}>
      <span style={{ fontSize: 11, color: "var(--color-grey)", width: 72, flexShrink: 0 }}>{label}</span>
      {editing
        ? <input value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
            autoFocus style={{ flex: 1, fontSize: 12, background: "transparent", border: "none", outline: "none", color: "var(--color-charcoal)", fontFamily: "inherit", borderBottom: "1px solid var(--color-sage)" }} />
        : <span onClick={() => setEditing(true)} style={{ flex: 1, fontSize: 12, color: value ? "#6b6860" : "var(--color-grey)", cursor: "text" }}>
            {value || placeholder}
          </span>
      }
    </div>
  );
}

// ── Props / main component ────────────────────────────────────────────────────

interface Props {
  target: OutreachTarget;
  pipeline: OutreachPipeline & { stages: PipelineStage[] };
  onClose: () => void;
  onUpdated: (target: OutreachTarget) => void;
  onDeleted: (targetId: string) => void;
}

type SectionTab = "canvas";

export default function TargetDetailPanel({ target: initialTarget, pipeline, onClose, onUpdated, onDeleted }: Props) {
  const supabase = createClient();

  const [target,       setTarget]       = useState(initialTarget);
  const [canvasHtml,   setCanvasHtml]   = useState<string | null | undefined>(undefined);
  const [activeTab,    setActiveTab]    = useState<SectionTab>("canvas");
  const [maximized,    setMaximized]    = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeStages  = pipeline.stages.filter(s => !s.is_outcome);
  const outcomeStages = pipeline.stages.filter(s =>  s.is_outcome);

  // Load canvas on open
  useEffect(() => {
    setTarget(initialTarget);
    setActiveTab("canvas");
    setSettingsOpen(false);
    setCanvasHtml(undefined);
    supabase.from("outreach_targets").select("canvas_html").eq("id", initialTarget.id).single()
      .then(({ data }) => setCanvasHtml(data?.canvas_html ?? null));
  }, [initialTarget.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide floating Ash FAB in scrim mode
  useEffect(() => {
    if (!maximized) {
      const style = document.createElement("style");
      style.id = "target-panel-ash-hide";
      style.textContent = ".ash-fab { opacity: 0 !important; pointer-events: none !important; }";
      document.head.appendChild(style);
    }
    return () => { document.getElementById("target-panel-ash-hide")?.remove(); };
  }, [maximized]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmDelete) { setConfirmDelete(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirmDelete]);

  // ── Field saves ─────────────────────────────────────────────────────────────

  async function saveField(updates: Partial<OutreachTarget>) {
    const { data } = await supabase
      .from("outreach_targets")
      .update({ ...updates, last_touched_at: new Date().toISOString() })
      .eq("id", target.id)
      .select("*, pipeline:outreach_pipelines(*), stage:pipeline_stages(*), contact:contacts(*, company:companies(*)), company:companies(*)")
      .single();
    if (data) { setTarget(data as OutreachTarget); onUpdated(data as OutreachTarget); }
  }

  async function changeStage(stageId: string) {
    await saveField({ stage_id: stageId });
  }

  async function handleDelete() {
    await supabase.from("outreach_targets").delete().eq("id", target.id);
    onDeleted(target.id);
    onClose();
  }

  const linkedLabel = target.contact
    ? `${target.contact.first_name} ${target.contact.last_name}`
    : target.company?.name ?? null;

  const currentStage = pipeline.stages.find(s => s.id === target.stage_id);

  const NAV_ITEMS: { key: SectionTab; label: string; icon: React.ReactNode }[] = [
    { key: "canvas", label: "Canvas", icon: <FileText size={13} strokeWidth={1.75} /> },
  ];

  const ASH_PROMPTS = [
    `How should I approach ${target.name}?`,
    `What's my next move with ${target.name}?`,
    `Draft a message for ${target.name}.`,
  ];

  return (
    <>
      {/* Scrim */}
      {!maximized && (
        <div className="fixed inset-0 z-10 cursor-pointer"
          style={{ background: "rgba(20,18,16,0.52)", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)" }}
          onClick={onClose} />
      )}

      {/* Panel */}
      <div className="fixed z-20 flex overflow-hidden" style={{
        top:    maximized ? 0 : "52px",
        bottom: maximized ? 0 : "32px",
        left:   maximized ? 0 : "calc(56px + 32px)",
        right:  maximized ? 0 : "32px",
        background:   "var(--color-off-white)",
        borderRadius: maximized ? 0 : 12,
        boxShadow:    "0 8px 40px rgba(0,0,0,0.22)",
        border:       "0.5px solid var(--color-border)",
        transition:   "top 0.2s ease, bottom 0.2s ease, left 0.2s ease, right 0.2s ease, border-radius 0.2s ease",
      }}>

        {/* ── Left sidebar ── */}
        <div style={{
          width: 252, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: "0.5px solid var(--color-border)", background: "var(--color-warm-white)",
          borderRadius: maximized ? 0 : "12px 0 0 12px",
        }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px 12px" }}>

            {/* Identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0, background: pipeline.color + "18", color: pipeline.color }}>
                {target.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-charcoal)", lineHeight: 1.2 }}>
                  <EditableField label="" value={target.name} placeholder="Target name" onSave={v => v && saveField({ name: v })} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 9999, background: pipeline.color + "18", color: pipeline.color }}>
                  {pipeline.name}
                </span>
              </div>
            </div>

            {/* Stage */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 6 }}>Stage</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {activeStages.map(s => (
                  <button key={s.id} onClick={() => changeStage(s.id)} style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 9999,
                    background: target.stage_id === s.id ? pipeline.color : "var(--color-cream)",
                    color: target.stage_id === s.id ? "white" : "#6b6860",
                    border: `0.5px solid ${target.stage_id === s.id ? pipeline.color : "var(--color-border)"}`,
                    cursor: "pointer", fontFamily: "inherit", fontWeight: target.stage_id === s.id ? 600 : 400,
                  }}>
                    {s.name}
                  </button>
                ))}
              </div>
              {outcomeStages.length > 0 && (
                <>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginTop: 10, marginBottom: 6 }}>Outcome</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {outcomeStages.map(s => (
                      <button key={s.id} onClick={() => changeStage(s.id)} style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 9999,
                        background: target.stage_id === s.id ? "rgba(31,33,26,0.12)" : "var(--color-cream)",
                        color: target.stage_id === s.id ? "var(--color-charcoal)" : "#6b6860",
                        border: `0.5px solid ${target.stage_id === s.id ? "rgba(31,33,26,0.25)" : "var(--color-border)"}`,
                        cursor: "pointer", fontFamily: "inherit", fontWeight: target.stage_id === s.id ? 600 : 400,
                      }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Details */}
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Details</p>
              <EditableField label="Location" value={target.location} placeholder="—" onSave={v => saveField({ location: v })} />
              {linkedLabel && (
                <div style={{ display: "flex", alignItems: "center", padding: "4px 0", borderBottom: "0.5px solid var(--color-border)" }}>
                  <span style={{ fontSize: 11, color: "var(--color-grey)", width: 72, flexShrink: 0 }}>
                    {target.contact ? "Contact" : "Company"}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b6860" }}>{linkedLabel}</span>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 11, color: "var(--color-grey)", width: 72, flexShrink: 0 }}>Touched</span>
                <span style={{ fontSize: 12, color: daysSince(target.last_touched_at) > 14 ? "#b8860b" : "#6b6860" }}>
                  {fmtDate(target.last_touched_at)}
                </span>
              </div>
            </div>

            {/* Navigation */}
            <div style={{ borderTop: "0.5px solid var(--color-border)", paddingTop: 10, marginTop: 8 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Workspace</p>
              {NAV_ITEMS.map(item => {
                const active = activeTab === item.key;
                return (
                  <button key={item.key} onClick={() => setActiveTab(item.key)} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                    borderRadius: 7, border: "none", background: active ? "var(--color-surface-raised)" : "transparent",
                    cursor: "pointer", fontFamily: "inherit", marginBottom: 1,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ color: active ? "#5a7040" : "var(--color-grey)" }}>{item.icon}</span>
                    <span style={{ fontSize: 12, flex: 1, textAlign: "left", color: active ? "#5a7040" : "var(--color-grey)", fontWeight: active ? 500 : 400 }}>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Ask Ash */}
            <div style={{ marginTop: 14, borderTop: "0.5px solid var(--color-border)", paddingTop: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-grey)", marginBottom: 4 }}>Ask Ash</p>
              {ASH_PROMPTS.map(prompt => (
                <button key={prompt}
                  onClick={() => window.dispatchEvent(new CustomEvent("open-ash", { detail: { message: prompt } }))}
                  style={{ width: "100%", textAlign: "left", fontSize: 11, padding: "5px 8px", borderRadius: 7, background: "transparent", border: "none", cursor: "pointer", color: "#6b6860", fontFamily: "inherit" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(155,163,122,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div style={{ borderTop: "0.5px solid var(--color-border)", padding: "4px 8px 8px", flexShrink: 0 }}>
            {settingsOpen && (
              <div style={{ paddingBottom: 4 }}>
                {confirmDelete ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px" }}>
                    <span style={{ fontSize: 12, color: "var(--color-charcoal)", flex: 1 }}>Delete this target?</span>
                    <button onClick={handleDelete} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--color-red-orange)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                    <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "transparent", color: "#6b6860", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", color: "var(--color-red-orange)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(220,62,13,0.07)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Trash2 size={13} strokeWidth={1.75} />
                    <span style={{ fontSize: 12 }}>Delete target</span>
                  </button>
                )}
              </div>
            )}
            <button onClick={() => setSettingsOpen(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: "none", background: settingsOpen ? "var(--color-surface-raised)" : "transparent", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { if (!settingsOpen) e.currentTarget.style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (!settingsOpen) e.currentTarget.style.background = "transparent"; }}>
              <Settings size={13} strokeWidth={1.75} style={{ color: settingsOpen ? "var(--color-charcoal)" : "var(--color-grey)" }} />
              <span style={{ fontSize: 12, color: settingsOpen ? "var(--color-charcoal)" : "var(--color-grey)", fontWeight: settingsOpen ? 500 : 400 }}>Settings</span>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ marginLeft: "auto", color: "var(--color-grey)", transform: settingsOpen ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }}>
                <path d="M2 1l4 3-4 3"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Right: main area ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Top bar */}
          <div style={{
            height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 14px", borderBottom: "0.5px solid var(--color-border)", background: "var(--color-off-white)",
            borderRadius: maximized ? 0 : "0 12px 0 0",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)" }}>
              {NAV_ITEMS.find(n => n.key === activeTab)?.label}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={() => setMaximized(v => !v)}
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {maximized ? <Minimize2 size={13} strokeWidth={1.75} /> : <Maximize2 size={13} strokeWidth={1.75} />}
              </button>
              <button onClick={onClose}
                style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-sunken)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {activeTab === "canvas" && (
              canvasHtml === undefined
                ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--color-grey)" }}>Loading…</div>
                : <TargetCanvasEditor
                    key={target.id}
                    targetId={target.id}
                    targetName={target.name}
                    contactId={target.contact_id}
                    initialHtml={canvasHtml}
                  />
            )}
          </div>

          {/* Ash strip — scrim mode only */}
          {!maximized && <TargetAshStrip target={target} pipeline={pipeline} />}
        </div>
      </div>
    </>
  );
}
