"use client";

import { useState } from "react";
import type { OutreachPipeline, PipelineStage, OutreachTarget, Contact } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import Topbar from "@/components/layout/Topbar";
import PipelineBoard from "./PipelineBoard";
import LeadsBoard from "./LeadsBoard";
import FollowUpsBoard from "./FollowUpsBoard";
import NewPipelineModal from "./NewPipelineModal";
import NewTargetModal from "./NewTargetModal";
import TargetDetailPanel from "./TargetDetailPanel";
import NewContactModal from "@/components/contacts/NewContactModal";
import ContactDetailPanel from "@/components/contacts/ContactDetailPanel";
import { Plus } from "lucide-react";
import AshMark from "@/components/ui/AshMark";

type ActiveSection = "leads" | "followups" | "pipeline";

const ASH_GRADIENT = "linear-gradient(145deg, #a8b886 0%, #7d9456 60%, #4a6232 100%)";
function openAsh(message: string) {
  window.dispatchEvent(new CustomEvent("open-ash", { detail: { message } }));
}
function AshBtn({ message }: { message: string }) {
  return (
    <button
      onClick={() => openAsh(message)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", fontSize: 11, fontWeight: 500, borderRadius: 6, background: "transparent", color: "var(--color-ash-dark)", border: "0.5px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s ease" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-ash-tint)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: ASH_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <AshMark size={9} variant="on-dark" />
      </div>
      Ask Ash
    </button>
  );
}

interface Props {
  initialPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  initialTargets: OutreachTarget[];
  initialContacts: Contact[];
}

export default function OutreachClient({ initialPipelines, initialTargets, initialContacts }: Props) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [targets, setTargets]     = useState(initialTargets);
  const [contacts, setContacts]   = useState(initialContacts);

  const [activeSection, setActiveSection]           = useState<ActiveSection>("pipeline");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId]     = useState<string | null>(null);
  const [openContact, setOpenContact]               = useState<Contact | null>(null);

  const [showNewPipeline, setShowNewPipeline]   = useState(false);
  const [showNewTarget, setShowNewTarget]       = useState(false);
  const [showNewLead, setShowNewLead]           = useState(false);
  const [newTargetDefaults, setNewTargetDefaults] = useState<{ pipelineId?: string; stageId?: string }>({});

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const selectedTarget   = targets.find((t) => t.id === selectedTargetId) ?? null;
  const targetPipeline   = selectedTarget ? pipelines.find((p) => p.id === selectedTarget.pipeline_id) ?? null : null;

  const leads     = contacts.filter(c => c.is_lead);
  const followUps = contacts.filter(c => {
    if (c.is_lead) return false;
    const days = c.last_contacted_at
      ? (Date.now() - new Date(c.last_contacted_at).getTime()) / 86400000
      : Infinity;
    return days > 30;
  });

  function openNewTarget(pipelineId?: string, stageId?: string) {
    setNewTargetDefaults({ pipelineId: pipelineId ?? selectedPipelineId ?? undefined, stageId });
    setShowNewTarget(true);
  }

  function switchSection(section: ActiveSection) {
    setActiveSection(section);
    if (section !== "pipeline") setSelectedPipelineId(null);
  }

  function selectPipeline(id: string | null) {
    setActiveSection("pipeline");
    setSelectedPipelineId(id);
  }

  function handlePipelineCreated(pipeline: OutreachPipeline & { stages: PipelineStage[] }) {
    setPipelines((prev) => [...prev, pipeline]);
    selectPipeline(pipeline.id);
  }

  function handleTargetCreated(target: OutreachTarget) {
    setTargets((prev) => [...prev, target]);
  }

  function handleTargetUpdated(updated: OutreachTarget) {
    setTargets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function handleTargetDeleted(targetId: string) {
    setTargets((prev) => prev.filter((t) => t.id !== targetId));
    setSelectedTargetId(null);
  }

  function handleContactCreated(contact: Contact) {
    setContacts(prev => [contact, ...prev]);
  }

  function handleContactUpdated(contact: Contact) {
    setContacts(prev => prev.map(c => c.id === contact.id ? contact : c));
    if (openContact?.id === contact.id) setOpenContact(contact);
  }

  function handleContactArchived(id: string) {
    setContacts(prev => prev.filter(c => c.id !== id));
    if (openContact?.id === id) setOpenContact(null);
  }

  async function handleStageChange(targetId: string, newStageId: string) {
    const now = new Date().toISOString();
    setTargets(prev => prev.map(t => t.id === targetId ? { ...t, stage_id: newStageId, last_touched_at: now } : t));
    await createClient().from("outreach_targets").update({ stage_id: newStageId, last_touched_at: now }).eq("id", targetId);
  }

  async function handleLeadStageChange(contactId: string, newStage: import("@/types/database").LeadStage) {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, lead_stage: newStage } : c));
    await createClient().from("contacts").update({ lead_stage: newStage }).eq("id", contactId);
  }

  async function handleFollowUp(targetId: string) {
    const now = new Date().toISOString();
    setTargets(prev => prev.map(t => t.id === targetId ? { ...t, last_touched_at: now } : t));
    await createClient().from("outreach_targets").update({ last_touched_at: now }).eq("id", targetId);
  }

  const boardTargets = selectedPipeline
    ? targets.filter((t) => t.pipeline_id === selectedPipeline.id)
    : targets;

  const topbarTitle =
    activeSection === "leads"     ? "Leads"
    : activeSection === "followups" ? "Follow-ups"
    : selectedPipeline?.name ?? "Outreach";

  const topbarActions = activeSection === "leads" ? (
    <>
      <AshBtn message="Who are my strongest leads right now and who should I follow up with?" />
      <button
        type="button"
        onClick={() => setShowNewLead(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 14px", fontSize: 11, fontWeight: 500, borderRadius: 6, background: "rgba(184,134,11,0.10)", color: "#b8860b", border: "0.5px solid rgba(184,134,11,0.35)", cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s ease" }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(184,134,11,0.18)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(184,134,11,0.10)")}>
        <Plus size={12} />
        New lead
      </button>
    </>
  ) : activeSection === "pipeline" ? (
    <>
      <AshBtn message="How is my outreach going? Which pipelines need attention and what should I prioritize?" />
      <button
        type="button"
        onClick={() => openNewTarget()}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 14px", fontSize: 11, fontWeight: 500, borderRadius: 6, background: "var(--color-sage)", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s ease" }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--color-sage-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "var(--color-sage)")}>
        <Plus size={12} />
        New target
      </button>
    </>
  ) : (
    <AshBtn message="Who in my network needs a follow-up? Who have I not reached out to in a while?" />
  );

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left nav ── */}
      <nav className="flex flex-col shrink-0 overflow-y-auto py-4"
        style={{ width: 188, borderRight: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>

        {/* Leads section */}
        <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-grey)" }}>
          Leads
        </p>

        <NavItem
          label="Leads"
          count={leads.length}
          dot="#b8860b"
          active={activeSection === "leads"}
          onClick={() => switchSection("leads")}
        />
        <NavItem
          label="Follow-ups"
          count={followUps.length}
          dot="var(--color-red-orange)"
          active={activeSection === "followups"}
          onClick={() => switchSection("followups")}
        />

        {/* Pipelines section */}
        <p className="px-4 mt-5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-grey)" }}>
          Pipelines
        </p>

        <NavItem
          label="All"
          count={targets.length}
          dot="var(--color-charcoal)"
          active={activeSection === "pipeline" && selectedPipelineId === null}
          onClick={() => selectPipeline(null)}
        />

        {pipelines.map((p) => (
          <NavItem
            key={p.id}
            label={p.name}
            count={targets.filter((t) => t.pipeline_id === p.id).length}
            dot={p.color}
            active={activeSection === "pipeline" && selectedPipelineId === p.id}
            onClick={() => selectPipeline(p.id)}
          />
        ))}

        <button
          type="button"
          onClick={() => setShowNewPipeline(true)}
          className="mt-2 mx-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] transition-colors"
          style={{ color: "var(--color-grey)", border: "0.5px solid var(--color-border)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <Plus size={12} />
          New pipeline
        </button>
      </nav>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={topbarTitle} actions={topbarActions} />
        <div className="flex-1 flex overflow-hidden">
          {activeSection === "leads" && (
            <LeadsBoard contacts={leads} onOpen={setOpenContact} onStageChange={handleLeadStageChange} />
          )}
          {activeSection === "followups" && (
            <FollowUpsBoard contacts={followUps} onOpen={setOpenContact} />
          )}
          {activeSection === "pipeline" && (
            <PipelineBoard
              pipelines={pipelines}
              selectedPipeline={selectedPipeline}
              targets={boardTargets}
              onTargetClick={(t) => setSelectedTargetId(t.id)}
              onNewTarget={openNewTarget}
              onStageChange={handleStageChange}
              onFollowUp={handleFollowUp}
            />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showNewPipeline && (
        <NewPipelineModal onClose={() => setShowNewPipeline(false)} onCreated={handlePipelineCreated} />
      )}
      {showNewTarget && pipelines.length > 0 && (
        <NewTargetModal
          pipelines={pipelines}
          defaultPipelineId={newTargetDefaults.pipelineId}
          defaultStageId={newTargetDefaults.stageId}
          onClose={() => setShowNewTarget(false)}
          onCreated={handleTargetCreated}
        />
      )}
      {showNewTarget && pipelines.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(31,33,26,0.5)" }}
          onClick={() => setShowNewTarget(false)}>
          <div className="rounded-2xl px-8 py-6 text-center"
            style={{ background: "var(--color-off-white)", border: "0.5px solid var(--color-border)" }}>
            <p className="text-[14px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No pipelines yet</p>
            <p className="text-[12px] mb-4" style={{ color: "var(--color-grey)" }}>Create a pipeline first to add targets.</p>
            <button onClick={() => { setShowNewTarget(false); setShowNewPipeline(true); }}
              className="px-4 py-2 text-[13px] font-medium rounded-lg text-white"
              style={{ background: "var(--color-charcoal)" }}>
              Create pipeline
            </button>
          </div>
        </div>
      )}
      {showNewLead && (
        <NewContactModal
          isLead={true}
          onClose={() => setShowNewLead(false)}
          onCreated={handleContactCreated}
        />
      )}

      {/* ── Target detail panel ── */}
      {selectedTarget && targetPipeline && (
        <TargetDetailPanel
          target={selectedTarget}
          pipeline={targetPipeline}
          onClose={() => setSelectedTargetId(null)}
          onUpdated={handleTargetUpdated}
          onDeleted={handleTargetDeleted}
        />
      )}

      {/* ── Contact detail panel (leads / follow-ups) ── */}
      {openContact && (
        <ContactDetailPanel
          contact={openContact}
          onClose={() => setOpenContact(null)}
          onUpdated={handleContactUpdated}
          onArchived={handleContactArchived}
        />
      )}
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({ label, count, dot, active, onClick }: {
  label: string; count: number; dot: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-left transition-colors"
      style={{
        background: active ? "var(--color-cream)" : "transparent",
        color: "var(--color-charcoal)",
        fontWeight: active ? 500 : 400,
        border: "none",
        fontFamily: "inherit",
        cursor: "pointer",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--color-cream)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-[10px] shrink-0" style={{ color: "var(--color-grey)" }}>{count}</span>
    </button>
  );
}
