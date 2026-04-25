"use client";

import type { OutreachPipeline, PipelineStage, OutreachTarget, MetaStage } from "@/types/database";
import { Plus } from "lucide-react";

interface Props {
  pipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  selectedPipeline: (OutreachPipeline & { stages: PipelineStage[] }) | null;
  targets: OutreachTarget[];
  onTargetClick: (target: OutreachTarget) => void;
  onNewTarget: (pipelineId?: string, stageId?: string) => void;
}

const META_LABELS: Record<MetaStage, string> = {
  identify:    "Identify",
  submit:      "Submit",
  discuss:     "Discuss",
  make_happen: "Make It Happen",
  closed:      "Closed",
};
const META_ORDER: MetaStage[] = ["identify", "submit", "discuss", "make_happen", "closed"];

function fmtLastTouch(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TargetCard({
  target,
  pipelineBadge,
  onClick,
}: {
  target: OutreachTarget;
  pipelineBadge?: { name: string; color: string };
  onClick: () => void;
}) {
  const linkedLabel = target.contact
    ? `${target.contact.first_name} ${target.contact.last_name}`
    : target.company?.name ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl p-3 transition-colors"
      style={{ background: "var(--color-warm-white)", border: "0.5px solid var(--color-border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-cream)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-warm-white)")}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[13px] font-medium leading-snug flex-1" style={{ color: "var(--color-charcoal)" }}>
          {target.name}
        </p>
        {pipelineBadge && (
          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium mt-0.5"
            style={{ background: pipelineBadge.color + "20", color: pipelineBadge.color }}>
            {pipelineBadge.name}
          </span>
        )}
      </div>
      {linkedLabel && (
        <p className="text-[11px] mt-1" style={{ color: "var(--color-grey)" }}>{linkedLabel}</p>
      )}
      {target.location && (
        <p className="text-[11px] mt-0.5" style={{ color: "var(--color-grey)" }}>{target.location}</p>
      )}
      <p className="text-[10px] mt-2" style={{ color: "var(--color-grey)" }}>
        {fmtLastTouch(target.last_touched_at)}
      </p>
    </button>
  );
}

function Column({
  label,
  accentColor,
  targets,
  showPipelineBadge,
  allPipelines,
  onTargetClick,
  onAdd,
}: {
  label: string;
  accentColor?: string;
  targets: OutreachTarget[];
  showPipelineBadge: boolean;
  allPipelines: (OutreachPipeline & { stages: PipelineStage[] })[];
  onTargetClick: (t: OutreachTarget) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col min-w-[210px] w-[210px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {accentColor && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accentColor }} />}
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-charcoal)" }}>
            {label}
          </span>
          {targets.length > 0 && (
            <span className="text-[10px]" style={{ color: "var(--color-grey)" }}>{targets.length}</span>
          )}
        </div>
        <button type="button" onClick={onAdd}
          className="w-5 h-5 flex items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--color-grey)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-charcoal)";
            e.currentTarget.style.background = "var(--color-cream)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-grey)";
            e.currentTarget.style.background = "transparent";
          }}>
          <Plus size={12} />
        </button>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {targets.map((t) => {
          const tp = allPipelines.find((p) => p.id === t.pipeline_id);
          return (
            <TargetCard
              key={t.id}
              target={t}
              pipelineBadge={showPipelineBadge && tp ? { name: tp.name, color: tp.color } : undefined}
              onClick={() => onTargetClick(t)}
            />
          );
        })}
        {targets.length === 0 && (
          <div className="rounded-xl p-4 text-center"
            style={{ border: "1px dashed var(--color-border)" }}>
            <p className="text-[11px]" style={{ color: "var(--color-grey)" }}>Empty</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelineBoard({ pipelines, selectedPipeline, targets, onTargetClick, onNewTarget }: Props) {
  if (selectedPipeline) {
    const activeStages  = selectedPipeline.stages.filter((s) => !s.is_outcome);
    const outcomeStages = selectedPipeline.stages.filter((s) =>  s.is_outcome);

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div className="flex gap-4 p-6 min-h-full items-start" style={{ minWidth: "max-content" }}>
            {activeStages.map((stage) => {
              const stageTargets = targets.filter((t) => t.stage_id === stage.id);
              return (
                <Column
                  key={stage.id}
                  label={stage.name}
                  accentColor={selectedPipeline.color}
                  targets={stageTargets}
                  showPipelineBadge={false}
                  allPipelines={pipelines}
                  onTargetClick={onTargetClick}
                  onAdd={() => onNewTarget(selectedPipeline.id, stage.id)}
                />
              );
            })}
          </div>
        </div>

        {/* Outcomes strip */}
        {outcomeStages.length > 0 && (
          <div className="shrink-0 px-6 py-3 flex items-center gap-5 overflow-x-auto"
            style={{ borderTop: "0.5px solid var(--color-border)" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0"
              style={{ color: "var(--color-grey)" }}>
              Outcomes
            </span>
            {outcomeStages.map((stage) => {
              const count = targets.filter((t) => t.stage_id === stage.id).length;
              return (
                <div key={stage.id} className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[12px]" style={{ color: "var(--color-charcoal)" }}>{stage.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(31,33,26,0.07)", color: "var(--color-grey)" }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // All pipelines — meta-stage columns
  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto">
      <div className="flex gap-4 p-6 items-start" style={{ minWidth: "max-content", minHeight: "100%" }}>
        {META_ORDER.map((meta) => {
          const metaTargets = targets.filter((t) => {
            const tp = pipelines.find((p) => p.id === t.pipeline_id);
            const stage = tp?.stages.find((s) => s.id === t.stage_id);
            return stage?.meta_stage === meta;
          });
          return (
            <Column
              key={meta}
              label={META_LABELS[meta]}
              targets={metaTargets}
              showPipelineBadge={true}
              allPipelines={pipelines}
              onTargetClick={onTargetClick}
              onAdd={() => onNewTarget()}
            />
          );
        })}
      </div>
    </div>
  );
}
