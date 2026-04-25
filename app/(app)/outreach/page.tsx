import { createClient } from "@/lib/supabase/server";
import OutreachClient from "@/components/outreach/OutreachClient";
import ComingSoonOverlay from "@/components/layout/ComingSoonOverlay";
import type { OutreachPipeline, PipelineStage, OutreachTarget } from "@/types/database";

export default async function OutreachPage() {
  const supabase = await createClient();

  const [{ data: pipelines }, { data: targets }] = await Promise.all([
    supabase
      .from("outreach_pipelines")
      .select("*, stages:pipeline_stages(*)")
      .order("position", { ascending: true }),
    supabase
      .from("outreach_targets")
      .select("*, pipeline:outreach_pipelines(*), stage:pipeline_stages(*), contact:contacts(*, company:companies(*)), company:companies(*)")
      .order("last_touched_at", { ascending: false }),
  ]);

  // Sort stages by position within each pipeline
  const pipelinesWithSortedStages = (pipelines ?? []).map((p) => ({
    ...p,
    stages: [...(p.stages ?? [])].sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
  }));

  return (
    <div className="relative flex flex-col h-full">
      <OutreachClient
        initialPipelines={pipelinesWithSortedStages as (OutreachPipeline & { stages: PipelineStage[] })[]}
        initialTargets={(targets ?? []) as OutreachTarget[]}
      />
      <ComingSoonOverlay
        module="Outreach"
        description="Manage gallery, press, and client outreach with a customizable pipeline board and contact tracking."
      />
    </div>
  );
}
