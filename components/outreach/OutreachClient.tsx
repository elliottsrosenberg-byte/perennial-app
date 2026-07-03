"use client";

import { useState, useEffect, useRef } from "react";
import type { OutreachPipeline, PipelineStage, OutreachTarget, Contact } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import Topbar from "@/components/layout/Topbar";
import PipelineBoard from "./PipelineBoard";
import LeadsBoard from "./LeadsBoard";
import FollowUpsBoard from "./FollowUpsBoard";
import NewPipelineModal from "./NewPipelineModal";
import EditPipelineModal from "./EditPipelineModal";
import NewTargetModal from "./NewTargetModal";
import TargetDetailPanel from "./TargetDetailPanel";
import NewContactModal from "@/components/network/NewContactModal";
import ContactDetailPanel from "@/components/network/ContactDetailPanel";
import { Plus, MoreHorizontal } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import OutreachIntroModal from "@/components/tour/outreach/OutreachIntroModal";
import OutreachTooltipTour from "@/components/tour/outreach/OutreachTooltipTour";
import OutreachOptionsMenu from "./OutreachOptionsMenu";
import { ProjectOptionsProvider } from "@/lib/projects/options";

type ActiveSection = "leads" | "followups" | "pipeline" | "all-ether";

interface Props {
  initialPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  initialTargets: OutreachTarget[];
  initialContacts: Contact[];
}

// TargetDetailPanel's "promote to project" flow reads project options from
// the shared context. Wrap the whole module so the panel can mount safely.
export default function OutreachClient(props: Props) {
  return (
    <ProjectOptionsProvider>
      <OutreachClientInner {...props} />
    </ProjectOptionsProvider>
  );
}

function OutreachClientInner({ initialPipelines, initialTargets, initialContacts }: Props) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [targets, setTargets]     = useState(initialTargets);
  const [contacts, setContacts]   = useState(initialContacts);

  // Freeze "had pipelines at tour-start?" — passed to the tooltip tour so it
  // can skip the pipeline-creation steps for users with seed pipelines.
  const [hadPipelinesAtMount] = useState(initialPipelines.length > 0);

  const [activeSection, setActiveSection]           = useState<ActiveSection>("pipeline");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId]     = useState<string | null>(null);
  const [openContact, setOpenContact]               = useState<Contact | null>(null);

  const [showNewPipeline, setShowNewPipeline]   = useState(false);
  const [showEditPipeline, setShowEditPipeline] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showNewTarget, setShowNewTarget]       = useState(false);
  const [showNewLead, setShowNewLead]           = useState(false);
  const [newTargetDefaults, setNewTargetDefaults] = useState<{ pipelineId?: string; stageId?: string }>({});
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Display preferences (currently UI-only — wired through to the board's
  // `selectedPipeline` filter below). Future commits can persist these in
  // profiles.outreach_preferences without changing the surface.
  const [showOutcomes, setShowOutcomes] = useState(true);
  const [showClosed,   setShowClosed]   = useState(true);
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!optionsOpen) return;
    function handler(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setOptionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [optionsOpen]);

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

  // Open a specific target from anywhere in the module (e.g. lead card chip
  // → "in {pipeline}" → opens the linked target). The event is fired by
  // LeadsBoard's pipeline chip; we switch to the pipeline section and pop
  // the detail panel.
  useEffect(() => {
    function onOpenTarget(e: Event) {
      const detail = (e as CustomEvent<{ target_id?: string; pipeline_id?: string }>).detail;
      if (!detail?.target_id) return;
      if (detail.pipeline_id) {
        setActiveSection("pipeline");
        setSelectedPipelineId(detail.pipeline_id);
      }
      setSelectedTargetId(detail.target_id);
    }
    window.addEventListener("outreach:open-target", onOpenTarget);
    return () => window.removeEventListener("outreach:open-target", onOpenTarget);
  }, []);

  // Notify the tooltip tour when the new-pipeline / new-target modals open
  // and when the target detail panel opens.
  useEffect(() => {
    if (showNewPipeline) window.dispatchEvent(new Event("outreach:new-pipeline-opened"));
  }, [showNewPipeline]);
  useEffect(() => {
    if (showNewTarget) window.dispatchEvent(new Event("outreach:new-target-opened"));
  }, [showNewTarget]);
  useEffect(() => {
    if (selectedTargetId) window.dispatchEvent(new Event("outreach:target-detail-opened"));
  }, [selectedTargetId]);

  function switchSection(section: ActiveSection) {
    setActiveSection(section);
    if (section !== "pipeline") setSelectedPipelineId(null);
    if (section !== "pipeline" && section !== "all-ether") setSelectedTargetId(null);
  }

  function selectPipeline(id: string | null) {
    setActiveSection("pipeline");
    setSelectedPipelineId(id);
  }

  function handlePipelineCreated(pipeline: OutreachPipeline & { stages: PipelineStage[] }) {
    setPipelines((prev) => [...prev, pipeline]);
    selectPipeline(pipeline.id);
    window.dispatchEvent(new CustomEvent("outreach:pipeline-created", {
      detail: { id: pipeline.id, name: pipeline.name },
    }));
  }

  function handlePipelineUpdated(pipeline: OutreachPipeline & { stages: PipelineStage[] }) {
    setPipelines((prev) => prev.map(p => p.id === pipeline.id ? { ...pipeline, stages: p.stages } : p));
  }

  async function handlePipelineArchive() {
    if (!selectedPipeline) return;
    const id = selectedPipeline.id;
    await createClient().from("outreach_pipelines").update({ archived: true }).eq("id", id);
    setPipelines(prev => prev.filter(p => p.id !== id));
    setSelectedPipelineId(null);
    setActiveSection("pipeline");
    setShowArchiveConfirm(false);
  }

  function handleTargetCreated(target: OutreachTarget) {
    setTargets((prev) => [...prev, target]);
    const pipeline     = pipelines.find(p => p.id === target.pipeline_id);
    const pipelineName = pipeline?.name ?? null;
    // First target landing in a seeded pipeline → clear the seeded flag so
    // the "Suggested" pill goes away (and stays away across reloads).
    if (pipeline?.seeded) {
      setPipelines(prev => prev.map(p => p.id === pipeline.id ? { ...p, seeded: false } : p));
      createClient().from("outreach_pipelines").update({ seeded: false }).eq("id", pipeline.id);
    }
    window.dispatchEvent(new CustomEvent("outreach:target-created", {
      detail: { id: target.id, name: target.name, pipeline_name: pipelineName },
    }));
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

  async function handleStageRename(stageId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPipelines(prev => prev.map(p => ({
      ...p,
      stages: p.stages.map(s => s.id === stageId ? { ...s, name: trimmed } : s),
    })));
    await createClient().from("pipeline_stages").update({ name: trimmed }).eq("id", stageId);
  }

  async function handleStageDelete(stageId: string, moveTargetsToStageId: string | null) {
    const supabase = createClient();
    if (moveTargetsToStageId) {
      // Reassign targets in this stage to the chosen destination before
      // the row goes away. Local + remote both kept in sync.
      setTargets(prev => prev.map(t => t.stage_id === stageId ? { ...t, stage_id: moveTargetsToStageId } : t));
      await supabase.from("outreach_targets").update({ stage_id: moveTargetsToStageId }).eq("stage_id", stageId);
    }
    setPipelines(prev => prev.map(p => ({ ...p, stages: p.stages.filter(s => s.id !== stageId) })));
    await supabase.from("pipeline_stages").delete().eq("id", stageId);
  }

  async function handleStageCreate(pipelineId: string, isOutcome: boolean): Promise<import("@/types/database").PipelineStage | null> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return null;
    // Place the new stage at the end of its own section. We compute against
    // the full ordered list so the position stays globally monotonic.
    const sectionStages = pipeline.stages.filter(s => s.is_outcome === isOutcome);
    const lastPos = sectionStages.length > 0
      ? Math.max(...sectionStages.map(s => s.position))
      : (pipeline.stages.length > 0 ? Math.max(...pipeline.stages.map(s => s.position)) : -1);
    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        pipeline_id: pipelineId,
        user_id:     user.id,
        name:        isOutcome ? "New outcome" : "New stage",
        position:    lastPos + 1,
        is_outcome:  isOutcome,
        meta_stage:  isOutcome ? "closed" : "submit",
      })
      .select("*").single();
    if (error || !data) return null;
    const stage = data as import("@/types/database").PipelineStage;
    setPipelines(prev => prev.map(p => p.id === pipelineId
      ? { ...p, stages: [...p.stages, stage] }
      : p));
    return stage;
  }

  async function handleStageChange(targetId: string, newStageId: string) {
    const now = new Date().toISOString();
    // Moving to a new column counts as a touch, and clears any follow-up the
    // user logged in the prior stage (a stage advance is a fresh chapter).
    setTargets(prev => prev.map(t => t.id === targetId
      ? { ...t, stage_id: newStageId, last_touched_at: now, last_followup_at: null }
      : t,
    ));
    await createClient()
      .from("outreach_targets")
      .update({ stage_id: newStageId, last_touched_at: now, last_followup_at: null })
      .eq("id", targetId);
  }

  async function handleLeadStageChange(contactId: string, newStage: import("@/types/database").LeadStage) {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, lead_stage: newStage } : c));
    await createClient().from("contacts").update({ lead_stage: newStage }).eq("id", contactId);
  }

  async function handleEtherToggle(targetId: string, ether: boolean, newStageId?: string) {
    const now = new Date().toISOString();
    // Optimistic local update — Supabase round-trip lands underneath.
    setTargets(prev => prev.map(t => t.id === targetId
      ? {
          ...t,
          ether,
          stage_id: newStageId ?? t.stage_id,
          last_touched_at: now,
          // Un-ethering into a new stage is a fresh chapter — drop any old
          // follow-up state, mirroring how a normal stage-change behaves.
          last_followup_at: newStageId ? null : t.last_followup_at,
        }
      : t,
    ));
    const update: Record<string, unknown> = { ether, last_touched_at: now };
    if (newStageId) {
      update.stage_id = newStageId;
      update.last_followup_at = null;
    }
    await createClient().from("outreach_targets").update(update).eq("id", targetId);
  }

  async function handleFollowUp(targetId: string) {
    const now = new Date().toISOString();
    // Bump BOTH last_touched_at (general staleness) and last_followup_at
    // (specific action — drives the "logged today" treatment on the card).
    setTargets(prev => prev.map(t => t.id === targetId
      ? { ...t, last_touched_at: now, last_followup_at: now }
      : t,
    ));
    await createClient()
      .from("outreach_targets")
      .update({ last_touched_at: now, last_followup_at: now })
      .eq("id", targetId);
  }

  // Outcome / closed filters are applied here so the toggles in the options
  // menu visibly affect the board without each board having to know about them.
  // - In the All Ether view, surface only ether targets across all pipelines.
  // - In a specific pipeline, pass all that pipeline's targets (the board
  //   splits them into stage columns vs the Ether section internally).
  // - In the meta-stage "All" view, pass everything — PipelineBoard splits
  //   ether-vs-not internally so the Ether section shows up there too.
  const boardTargets = (activeSection === "all-ether"
    ? targets.filter(t => t.ether)
    : selectedPipeline
      ? targets.filter(t => t.pipeline_id === selectedPipeline.id)
      : targets
  ).filter((t) => {
    if (showClosed) return true;
    const tp = pipelines.find(p => p.id === t.pipeline_id);
    const stage = tp?.stages.find(s => s.id === t.stage_id);
    return !stage?.is_outcome;
  });

  // Hide outcome columns themselves when the toggle is off — done by passing
  // a "stripped" pipeline down so the board renders just the active stages.
  const boardPipeline = selectedPipeline && !showOutcomes
    ? { ...selectedPipeline, stages: selectedPipeline.stages.filter(s => !s.is_outcome) }
    : selectedPipeline;

  const topbarTitle =
    activeSection === "leads"     ? "Leads"
    : activeSection === "followups" ? "Follow-ups"
    : activeSection === "all-ether" ? "All Ether"
    : selectedPipeline?.name ?? "Outreach";

  // Active (non-ether) target counts feed the left-rail counts so "ICFF · 12"
  // means 12 active, not 12 including parked.
  const activeTargets = targets.filter(t => !t.ether);
  const etherCount    = targets.length - activeTargets.length;

  // Count of closed/outcome targets across all pipelines — feeds the options
  // menu subtitle so "Show closed targets" reads as a real toggle.
  const closedCount = targets.filter(t => {
    const tp = pipelines.find(p => p.id === t.pipeline_id);
    const stage = tp?.stages.find(s => s.id === t.stage_id);
    return stage?.is_outcome === true;
  }).length;

  // Settings-menu button — appears on every section so the structural
  // placeholder is consistent. The Ash inline button has been removed; the
  // floating Ash FAB remains for general "ask anything" access.
  const optionsButton = (
    <div ref={optionsRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOptionsOpen(v => !v)}
        aria-label="Outreach options"
        title="Outreach options"
        style={{
          width: 28, height: 28, borderRadius: 7,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: optionsOpen ? "var(--color-surface-sunken)" : "transparent",
          border: "none", cursor: "pointer",
          color: "var(--color-text-secondary)",
          transition: "background 0.12s ease",
        }}
        onMouseEnter={e => { if (!optionsOpen) e.currentTarget.style.background = "var(--color-surface-sunken)"; }}
        onMouseLeave={e => { if (!optionsOpen) e.currentTarget.style.background = "transparent"; }}
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </button>
      {optionsOpen && (
        <OutreachOptionsMenu
          showOutcomes={showOutcomes}
          onToggleShowOutcomes={() => setShowOutcomes(v => !v)}
          showClosed={showClosed}
          onToggleShowClosed={() => setShowClosed(v => !v)}
          closedCount={closedCount}
          onClose={() => setOptionsOpen(false)}
          pipelineLabel={activeSection === "pipeline" && selectedPipeline ? selectedPipeline.name : undefined}
          onEditPipeline={activeSection === "pipeline" && selectedPipeline ? () => setShowEditPipeline(true) : undefined}
          onArchivePipeline={activeSection === "pipeline" && selectedPipeline ? () => setShowArchiveConfirm(true) : undefined}
        />
      )}
    </div>
  );

  const topbarActions = (
    <>
      {optionsButton}
      {activeSection === "leads" && (
        <span data-tour-target="outreach.new-lead-button">
          <button
            type="button"
            onClick={() => setShowNewLead(true)}
            style={{
              padding: "7px 20px", fontSize: 12, fontWeight: 500,
              borderRadius: 8, border: "none", cursor: "pointer",
              background: "#b8860b", color: "white",
              fontFamily: "inherit",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#a07800")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#b8860b")}
          >
            + New lead
          </button>
        </span>
      )}
      {activeSection === "pipeline" && (
        <span data-tour-target="outreach.new-target-button">
          <Button onClick={() => openNewTarget()}>+ New target</Button>
        </span>
      )}
    </>
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
          count={activeTargets.length}
          dot="var(--color-charcoal)"
          active={activeSection === "pipeline" && selectedPipelineId === null}
          onClick={() => selectPipeline(null)}
        />

        {pipelines.map((p) => {
          const pipelineTargets = targets.filter(t => t.pipeline_id === p.id);
          return (
            <NavItem
              key={p.id}
              label={p.name}
              count={activeTargets.filter((t) => t.pipeline_id === p.id).length}
              dot={p.color}
              active={activeSection === "pipeline" && selectedPipelineId === p.id}
              onClick={() => selectPipeline(p.id)}
              suggestedPill={p.seeded && pipelineTargets.length === 0}
            />
          );
        })}

        {/* All Ether — cross-pipeline cleanup view. Hidden when zero parked
            targets exist, to keep the rail uncluttered for users not using
            the feature yet. */}
        {etherCount > 0 && (
          <NavItem
            label="All Ether"
            count={etherCount}
            dot="#5386c4"
            active={activeSection === "all-ether"}
            onClick={() => { setActiveSection("all-ether"); setSelectedPipelineId(null); }}
          />
        )}

        <button
          data-tour-target="outreach.new-pipeline-button"
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
        {activeSection === "pipeline" && selectedPipeline && (
          <PipelineDescriptionBar
            pipeline={selectedPipeline}
            onUpdated={(p) => setPipelines(prev => prev.map(x => x.id === p.id ? { ...x, description: p.description } : x))}
          />
        )}
        <div className="flex-1 flex overflow-hidden">
          {activeSection === "leads" && (
            <LeadsBoard
              contacts={leads}
              onOpen={setOpenContact}
              onStageChange={handleLeadStageChange}
              onNewLead={() => setShowNewLead(true)}
            />
          )}
          {activeSection === "followups" && (
            <FollowUpsBoard contacts={followUps} onOpen={setOpenContact} />
          )}
          {activeSection === "pipeline" && (
            <PipelineBoard
              pipelines={pipelines}
              selectedPipeline={boardPipeline}
              targets={boardTargets}
              onTargetClick={(t) => setSelectedTargetId(t.id)}
              onNewTarget={openNewTarget}
              onNewPipeline={() => setShowNewPipeline(true)}
              onStageChange={handleStageChange}
              onStageRename={handleStageRename}
              onStageDelete={handleStageDelete}
              onStageCreate={handleStageCreate}
              onFollowUp={handleFollowUp}
              onEtherToggle={handleEtherToggle}
            />
          )}
          {activeSection === "all-ether" && (
            <PipelineBoard
              pipelines={pipelines}
              selectedPipeline={null}
              targets={boardTargets}
              onTargetClick={(t) => setSelectedTargetId(t.id)}
              onNewTarget={openNewTarget}
              onNewPipeline={() => setShowNewPipeline(true)}
              onStageChange={handleStageChange}
              onFollowUp={handleFollowUp}
              onEtherToggle={handleEtherToggle}
              etherView
            />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showNewPipeline && (
        <div data-tour-target="outreach.new-pipeline-modal">
          <NewPipelineModal onClose={() => setShowNewPipeline(false)} onCreated={handlePipelineCreated} />
        </div>
      )}
      {showEditPipeline && selectedPipeline && (
        <EditPipelineModal
          pipeline={selectedPipeline}
          onClose={() => setShowEditPipeline(false)}
          onUpdated={handlePipelineUpdated}
        />
      )}
      {showArchiveConfirm && selectedPipeline && (
        <ArchivePipelineConfirm
          pipelineName={selectedPipeline.name}
          targetCount={targets.filter(t => t.pipeline_id === selectedPipeline.id).length}
          onCancel={() => setShowArchiveConfirm(false)}
          onConfirm={handlePipelineArchive}
        />
      )}
      {showNewTarget && pipelines.length > 0 && (
        <div data-tour-target="outreach.new-target-modal">
          <NewTargetModal
            pipelines={pipelines}
            defaultPipelineId={newTargetDefaults.pipelineId}
            defaultStageId={newTargetDefaults.stageId}
            onClose={() => setShowNewTarget(false)}
            onCreated={handleTargetCreated}
          />
        </div>
      )}
      {showNewTarget && pipelines.length === 0 && (
        <Modal onClose={() => setShowNewTarget(false)} size="sm" bodyStyle={{ padding: "24px 32px", textAlign: "center" }}>
          <p className="text-[14px] font-medium mb-1" style={{ color: "var(--color-charcoal)" }}>No pipelines yet</p>
          <p className="text-[12px] mb-4" style={{ color: "var(--color-grey)" }}>Create a pipeline first to add targets.</p>
          <button onClick={() => { setShowNewTarget(false); setShowNewPipeline(true); }}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white"
            style={{ background: "var(--color-charcoal)" }}>
            Create pipeline
          </button>
        </Modal>
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

      {/* ── Walkthrough: intro modal first, then progressive tooltips ── */}
      <OutreachIntroModal />
      <OutreachTooltipTour hasPipelinesAtStart={hadPipelinesAtMount} />
    </div>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({ label, count, dot, active, onClick, suggestedPill }: {
  label: string; count: number; dot: string; active: boolean; onClick: () => void;
  /** Small "Suggested" indicator for seed pipelines that haven't yet been
   *  populated with a target. Disappears as soon as the user adds one. */
  suggestedPill?: boolean;
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
      {suggestedPill && (
        <span
          title="Auto-suggested from your onboarding answers — disappears once you add a target."
          style={{
            fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
            padding: "1px 5px", borderRadius: 9999,
            background: "rgba(125,148,86,0.16)", color: "#5a7040",
            border: "0.5px solid rgba(125,148,86,0.35)",
            flexShrink: 0,
          }}>
          Sug
        </span>
      )}
      <span className="text-[10px] shrink-0" style={{ color: "var(--color-grey)" }}>{count}</span>
    </button>
  );
}

// ── Archive confirm ──────────────────────────────────────────────────────────
// Lightweight confirm modal — no shared confirm primitive lives in /ui yet
// and inlining keeps OutreachClient self-contained for this small interaction.

function ArchivePipelineConfirm({
  pipelineName, targetCount, onCancel, onConfirm,
}: {
  pipelineName: string;
  targetCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      onClose={onCancel}
      size="sm"
      bodyStyle={{ padding: 0 }}
      footer={
        <>
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-[13px] rounded-lg"
            style={{ color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="px-4 py-2 text-[13px] font-medium rounded-lg text-white"
            style={{ background: "var(--color-red-orange)", border: "none" }}>
            Archive
          </button>
        </>
      }
    >
      <div className="px-6 py-5">
        <p className="text-[14px] font-semibold mb-2" style={{ color: "var(--color-charcoal)" }}>
          Archive “{pipelineName}”?
        </p>
        <p className="text-[12px]" style={{ color: "var(--color-grey)", lineHeight: 1.55 }}>
          The pipeline disappears from your sidebar.
          {targetCount > 0
            ? ` Its ${targetCount} target${targetCount === 1 ? "" : "s"} stay intact — you can restore the pipeline later from settings.`
            : " You can restore it later from settings."}
        </p>
      </div>
    </Modal>
  );
}

// ── Pipeline description bar ─────────────────────────────────────────────────
// Sits below the Topbar on a single-pipeline view. Click to edit; blur or
// Cmd/Ctrl+Enter to save. Empty state shows a subtle "+ Add description"
// prompt so users know the surface exists.

function PipelineDescriptionBar({
  pipeline, onUpdated,
}: {
  pipeline: OutreachPipeline & { stages: PipelineStage[] };
  onUpdated: (p: OutreachPipeline) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(pipeline.description ?? "");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Reset draft when the pipeline switches, so we don't carry one pipeline's
  // unsaved edit into another's view.
  useEffect(() => { setDraft(pipeline.description ?? ""); setEditing(false); }, [pipeline.id, pipeline.description]);

  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      // Place caret at the end rather than selecting everything — feels less
      // destructive when the user just wants to append a line.
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  async function commit() {
    setEditing(false);
    const next = draft.trim() || null;
    if ((next ?? "") === (pipeline.description ?? "")) return;
    const { data } = await createClient()
      .from("outreach_pipelines")
      .update({ description: next })
      .eq("id", pipeline.id)
      .select("*").single();
    if (data) onUpdated(data as OutreachPipeline);
  }

  return (
    <div
      style={{
        padding: "8px 20px",
        borderBottom: "0.5px solid var(--color-border)",
        background: "var(--color-off-white)",
      }}>
      {editing ? (
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setDraft(pipeline.description ?? ""); setEditing(false); }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { commit(); }
          }}
          placeholder={`What this pipeline is for — priorities, criteria, who you're chasing…`}
          rows={Math.min(6, Math.max(2, draft.split("\n").length))}
          style={{
            width: "100%",
            background: "var(--color-warm-white)",
            border: `0.5px solid ${pipeline.color}55`,
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--color-charcoal)",
            fontFamily: "inherit",
            outline: "none",
            resize: "vertical",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to edit description"
          style={{
            width: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            cursor: "text",
            padding: "2px 0",
            fontSize: 12,
            lineHeight: 1.55,
            color: pipeline.description ? "var(--color-text-secondary)" : "var(--color-grey)",
            fontStyle: pipeline.description ? "normal" : "italic",
            whiteSpace: "pre-wrap",
          }}>
          {pipeline.description || "+ Add description — priorities, criteria, reminders"}
        </button>
      )}
    </div>
  );
}
