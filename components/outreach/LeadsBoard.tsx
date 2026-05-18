"use client";

import { useState, useEffect, useMemo } from "react";
import type { Contact, LeadStage } from "@/types/database";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Users } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";

// Pipeline membership chip — surfaces "is this lead in a pipeline?" so the
// Target↔Lead unification is visible. Click opens the linked target via a
// custom event handled by OutreachClient.
interface LeadPipelineRef {
  target_id:     string;
  pipeline_id:   string;
  pipeline_name: string;
  pipeline_color: string;
}

function initials(c: Contact) {
  return (c.first_name[0] + (c.last_name[0] ?? "")).toUpperCase();
}

function lastContactedDisplay(date: string | null): { label: string; color: string } {
  if (!date) return { label: "Never", color: "var(--color-grey)" };
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return { label: "Today",        color: "var(--color-sage)" };
  if (days < 7)  return { label: `${days}d ago`,  color: "var(--color-sage)" };
  if (days < 14) return { label: `${Math.floor(days / 7)}w ago`, color: "var(--color-charcoal)" };
  if (days < 60) return { label: `${Math.floor(days / 7)}w ago`, color: "#b8860b" };
  return { label: `${Math.floor(days / 30)}mo ago`, color: "var(--color-red-orange)" };
}

const LEAD_STAGE_CONFIG: Record<LeadStage, { color: string; label: string }> = {
  new:             { color: "#9a9690", label: "New"            },
  reached_out:     { color: "#2563ab", label: "Reached out"    },
  in_conversation: { color: "#148c8c", label: "In conversation" },
  proposal_sent:   { color: "#6d4fa3", label: "Proposal sent"  },
  qualified:       { color: "#3d6b4f", label: "Qualified"      },
  nurturing:       { color: "#b8860b", label: "Nurturing"      },
  lost:            { color: "#dc3e0d", label: "Lost"           },
};
const LEAD_STAGES: LeadStage[] = ["new", "reached_out", "in_conversation", "proposal_sent", "qualified", "nurturing", "lost"];

function LeadCard({ contact, isDragging, onClick, pipelineRefs, onPipelineChipClick }: {
  contact: Contact;
  isDragging: boolean;
  onClick: () => void;
  pipelineRefs: LeadPipelineRef[];
  onPipelineChipClick: (ref: LeadPipelineRef) => void;
}) {
  const [hov, setHov] = useState(false);
  const lc = lastContactedDisplay(contact.last_contacted_at);
  // First pipeline drives the chip; if there are more, append "+N".
  const firstRef = pipelineRefs[0];
  const extra    = pipelineRefs.length - 1;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", textAlign: "left", padding: "10px 12px",
        borderRadius: 10,
        border: `0.5px solid ${hov && !isDragging ? "var(--color-border-strong)" : "var(--color-border)"}`,
        background: isDragging ? "var(--color-cream)" : "var(--color-off-white)",
        cursor: "inherit", fontFamily: "inherit",
        boxShadow: isDragging ? "0 8px 24px rgba(31,33,26,0.18)" : hov ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
        transition: "box-shadow 0.1s ease, border-color 0.1s ease",
        outline: "none",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, background: "rgba(184,134,11,0.10)", color: "#b8860b", overflow: "hidden" }}>
          {contact.avatar_url
            ? <img src={contact.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials(contact)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-charcoal)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {contact.first_name} {contact.last_name}
          </div>
        </div>
      </div>
      {(contact.company?.name || contact.title) && (
        <p style={{ fontSize: 10, color: "var(--color-grey)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[contact.title, contact.company?.name].filter(Boolean).join(" · ")}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: lc.color }}>{lc.label}</span>
        {contact.email && (
          <span style={{ fontSize: 10, color: "var(--color-grey)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
            {contact.email}
          </span>
        )}
      </div>
      {firstRef && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onPipelineChipClick(firstRef); }}
          title={extra > 0 ? `${firstRef.pipeline_name} + ${extra} more` : `Open in ${firstRef.pipeline_name}`}
          style={{
            marginTop: 6,
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 9, fontWeight: 600,
            padding: "2px 7px", borderRadius: 9999,
            background: firstRef.pipeline_color + "18",
            color: firstRef.pipeline_color,
            border: `0.5px solid ${firstRef.pipeline_color}33`,
            cursor: "pointer",
            fontFamily: "inherit",
          }}>
          <span style={{ width: 4, height: 4, borderRadius: 99, background: firstRef.pipeline_color }} />
          in {firstRef.pipeline_name}{extra > 0 && ` +${extra}`}
        </button>
      )}
    </div>
  );
}

interface Props {
  contacts: Contact[];
  onOpen: (c: Contact) => void;
  onStageChange: (contactId: string, newStage: LeadStage) => void;
  /** Routes the "+ New lead" CTA in the empty state. Optional so the board
   *  also renders standalone, but expected when called from OutreachClient. */
  onNewLead?: () => void;
}

export default function LeadsBoard({ contacts, onOpen, onStageChange, onNewLead }: Props) {
  // Map of contact_id → ordered list of pipeline refs. Re-fetched when the
  // set of lead ids changes. Single round-trip; the result is small (one row
  // per linked target).
  const [refsByContact, setRefsByContact] = useState<Record<string, LeadPipelineRef[]>>({});
  const leadIds = useMemo(() => contacts.map(c => c.id), [contacts]);

  useEffect(() => {
    if (leadIds.length === 0) { setRefsByContact({}); return; }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("outreach_targets")
        .select("id, contact_id, pipeline:outreach_pipelines(id, name, color)")
        .in("contact_id", leadIds)
        .eq("ether", false);
      if (cancelled) return;
      const next: Record<string, LeadPipelineRef[]> = {};
      type Row = { id: string; contact_id: string | null; pipeline: { id: string; name: string; color: string } | null };
      for (const row of ((data ?? []) as unknown as Row[])) {
        if (!row.contact_id || !row.pipeline) continue;
        const list = next[row.contact_id] ?? (next[row.contact_id] = []);
        // De-dupe by pipeline_id — a contact may have multiple targets in one
        // pipeline; we show that pipeline once.
        if (list.some(r => r.pipeline_id === row.pipeline!.id)) continue;
        list.push({
          target_id:      row.id,
          pipeline_id:    row.pipeline.id,
          pipeline_name:  row.pipeline.name,
          pipeline_color: row.pipeline.color,
        });
      }
      setRefsByContact(next);
    })();
    return () => { cancelled = true; };
  }, [leadIds]);

  function handlePipelineChipClick(ref: LeadPipelineRef) {
    // Routed through a custom event so OutreachClient can switch sections
    // and open the target detail panel without LeadsBoard needing those
    // setters.
    window.dispatchEvent(new CustomEvent("outreach:open-target", {
      detail: { target_id: ref.target_id, pipeline_id: ref.pipeline_id },
    }));
  }

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStage = destination.droppableId as LeadStage;
    const contact = contacts.find(c => c.id === draggableId);
    if (!contact || (contact.lead_stage ?? "new") === newStage) return;
    onStageChange(draggableId, newStage);
  }

  // Whole-board empty state — no leads anywhere. Per-column "—" placeholders
  // (below) handle the case where a stage is just empty.
  if (contacts.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto", padding: "24px", background: "var(--color-warm-white)" }}>
        <div style={{ width: "100%", maxWidth: 520 }}>
          <EmptyState
            icon={<Users size={22} strokeWidth={1.5} color="#b8860b" />}
            heading="Start your lead pipeline"
            body="Leads are the people you're chasing — galleries you'd love to show with, press you want covering you, collectors you're warming up. Each lead moves through stages from New to Qualified so you always know who's where."
            action={onNewLead ? {
              label:           "+ New lead",
              onClick:         onNewLead,
              background:      "#b8860b",
              backgroundHover: "#a07800",
            } : undefined}
            ashPrompt="Help me identify leads to add to my outreach pipeline based on my practice."
            tips={[
              "Add anyone you'd like to do work with but haven't yet — galleries, press, collectors, collaborators.",
              "Drag a lead between stages (New → Reached out → In conversation → Qualified) to keep your funnel honest.",
              "When a lead becomes a real relationship, convert them in their detail panel — they move to Contacts with history intact.",
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div style={{ display: "flex", gap: 10, padding: "16px 20px", flex: 1, overflowX: "auto", overflowY: "hidden", alignItems: "flex-start", background: "var(--color-warm-white)" }}>
        {LEAD_STAGES.map(stage => {
          const cfg   = LEAD_STAGE_CONFIG[stage];
          const items = contacts.filter(c => (c.lead_stage ?? "new") === stage);
          return (
            <div key={stage} style={{ minWidth: 200, width: 220, flexShrink: 0, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, padding: "0 2px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-charcoal)" }}>{cfg.label}</span>
                <span style={{ fontSize: 10, color: "var(--color-grey)", marginLeft: "auto" }}>{items.length}</span>
              </div>
              <Droppable droppableId={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      display: "flex", flexDirection: "column", gap: 6,
                      minHeight: 56, overflowY: "auto",
                      borderRadius: 10,
                      padding: snapshot.isDraggingOver ? 6 : 0,
                      background: snapshot.isDraggingOver ? `${cfg.color}12` : "transparent",
                      border: snapshot.isDraggingOver ? `1px dashed ${cfg.color}55` : "1px solid transparent",
                      transition: "background 0.15s ease, border 0.15s ease, padding 0.15s ease",
                    }}
                  >
                    {items.length === 0 && !snapshot.isDraggingOver && (
                      <div style={{ padding: "16px 12px", borderRadius: 10, border: "0.5px dashed var(--color-border)", textAlign: "center", fontSize: 11, color: "var(--color-grey)" }}>—</div>
                    )}
                    {items.map((c, index) => (
                      <Draggable key={c.id} draggableId={c.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              cursor: dragSnapshot.isDragging ? "grabbing" : "grab",
                            }}
                          >
                            <LeadCard
                              contact={c}
                              isDragging={dragSnapshot.isDragging}
                              onClick={() => { if (!dragSnapshot.isDragging) onOpen(c); }}
                              pipelineRefs={refsByContact[c.id] ?? []}
                              onPipelineChipClick={handlePipelineChipClick}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
