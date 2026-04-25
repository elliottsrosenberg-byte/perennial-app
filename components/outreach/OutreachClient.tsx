"use client";

import { useState } from "react";
import type { OutreachPipeline, PipelineStage, OutreachTarget } from "@/types/database";
import Topbar from "@/components/layout/Topbar";
import PipelineBoard from "./PipelineBoard";
import NewPipelineModal from "./NewPipelineModal";
import NewTargetModal from "./NewTargetModal";
import TargetDetailPanel from "./TargetDetailPanel";
import { Plus } from "lucide-react";

interface Props {
  initialPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  initialTargets: OutreachTarget[];
}

export default function OutreachClient({ initialPipelines, initialTargets }: Props) {
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [targets, setTargets]     = useState(initialTargets);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId]     = useState<string | null>(null);
  const [showNewPipeline, setShowNewPipeline]       = useState(false);
  const [showNewTarget, setShowNewTarget]           = useState(false);
  const [newTargetDefaults, setNewTargetDefaults]   = useState<{ pipelineId?: string; stageId?: string }>({});

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const selectedTarget   = targets.find((t) => t.id === selectedTargetId) ?? null;
  const targetPipeline   = selectedTarget ? pipelines.find((p) => p.id === selectedTarget.pipeline_id) ?? null : null;

  function openNewTarget(pipelineId?: string, stageId?: string) {
    setNewTargetDefaults({
      pipelineId: pipelineId ?? selectedPipelineId ?? undefined,
      stageId,
    });
    setShowNewTarget(true);
  }

  function handlePipelineCreated(pipeline: OutreachPipeline & { stages: PipelineStage[] }) {
    setPipelines((prev) => [...prev, pipeline]);
    setSelectedPipelineId(pipeline.id);
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

  const boardTargets = selectedPipeline
    ? targets.filter((t) => t.pipeline_id === selectedPipeline.id)
    : targets;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left nav */}
      <nav className="flex flex-col shrink-0 overflow-y-auto py-4"
        style={{ width: 188, borderRight: "0.5px solid var(--color-border)", background: "var(--color-off-white)" }}>
        <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-grey)" }}>
          Pipelines
        </p>

        {/* All */}
        <button
          type="button"
          onClick={() => setSelectedPipelineId(null)}
          className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-left transition-colors"
          style={{
            background: selectedPipelineId === null ? "var(--color-cream)" : "transparent",
            color: "var(--color-charcoal)",
            fontWeight: selectedPipelineId === null ? 500 : 400,
          }}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--color-charcoal)" }} />
          All
          <span className="ml-auto text-[10px]" style={{ color: "var(--color-grey)" }}>{targets.length}</span>
        </button>

        {/* Individual pipelines */}
        {pipelines.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedPipelineId(p.id)}
            className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-left transition-colors"
            style={{
              background: selectedPipelineId === p.id ? "var(--color-cream)" : "transparent",
              color: "var(--color-charcoal)",
              fontWeight: selectedPipelineId === p.id ? 500 : 400,
            }}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="text-[10px] shrink-0" style={{ color: "var(--color-grey)" }}>
              {targets.filter((t) => t.pipeline_id === p.id).length}
            </span>
          </button>
        ))}

        {/* New pipeline */}
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

      {/* Board */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          title={selectedPipeline?.name ?? "Outreach"}
          actions={
            <button
              type="button"
              onClick={() => openNewTarget()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white transition-opacity"
              style={{ background: selectedPipeline?.color ?? "var(--color-charcoal)" }}>
              <Plus size={13} />
              New target
            </button>
          }
        />
        <div className="flex-1 flex overflow-hidden">
          <PipelineBoard
            pipelines={pipelines}
            selectedPipeline={selectedPipeline}
            targets={boardTargets}
            onTargetClick={(t) => setSelectedTargetId(t.id)}
            onNewTarget={openNewTarget}
          />
        </div>
      </div>

      {/* Modals */}
      {showNewPipeline && (
        <NewPipelineModal
          onClose={() => setShowNewPipeline(false)}
          onCreated={handlePipelineCreated}
        />
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

      {/* Target detail panel */}
      {selectedTarget && targetPipeline && (
        <TargetDetailPanel
          target={selectedTarget}
          pipeline={targetPipeline}
          onClose={() => setSelectedTargetId(null)}
          onUpdated={handleTargetUpdated}
          onDeleted={handleTargetDeleted}
        />
      )}
    </div>
  );
}
