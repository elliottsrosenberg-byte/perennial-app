// Smart seeded pipelines from onboarding answers.
//
// On first visit to Outreach (and only then — the function is idempotent and
// short-circuits if any pipeline already exists), we read the user's
// onboarding profile and seed two pipelines tuned to their practice. The
// goal is to give the user a meaningful starting board instead of an empty
// "+ New pipeline" call to action.
//
// Pipelines are flagged `seeded=true` so the UI can show a "Suggested" pill
// that disappears as soon as the user adds their first target.

import { createClient } from "@/lib/supabase/server";

type TemplateKey = "gallery" | "press" | "events" | "sales" | "client" | "wholesale" | "collectors";

interface StageSpec {
  name:        string;
  meta_stage:  "identify" | "submit" | "discuss" | "make_happen" | "closed";
  is_outcome:  boolean;
}

interface Template {
  name:   string;
  color:  string;
  stages: StageSpec[];
}

// Templates mirror the in-modal options in NewPipelineModal but two are new
// here: wholesale and collectors. When/if the modal gains those templates,
// re-share them — for now we duplicate the shape locally so the seeder can
// stand alone without a circular import.
const TEMPLATES: Record<TemplateKey, Template> = {
  gallery: {
    name:  "Galleries",
    color: "#6d4fa3",
    stages: [
      { name: "Identified",   meta_stage: "identify", is_outcome: false },
      { name: "Intro Sent",   meta_stage: "submit",   is_outcome: false },
      { name: "Meeting",      meta_stage: "discuss",  is_outcome: false },
      { name: "Represented",  meta_stage: "closed",   is_outcome: true  },
      { name: "No Response",  meta_stage: "closed",   is_outcome: true  },
      { name: "Wrong Fit",    meta_stage: "closed",   is_outcome: true  },
    ],
  },
  press: {
    name:  "Press",
    color: "#148c8c",
    stages: [
      { name: "Identified",   meta_stage: "identify", is_outcome: false },
      { name: "Pitched",      meta_stage: "submit",   is_outcome: false },
      { name: "Under Review", meta_stage: "discuss",  is_outcome: false },
      { name: "Published",    meta_stage: "closed",   is_outcome: true  },
      { name: "Passed",       meta_stage: "closed",   is_outcome: true  },
    ],
  },
  events: {
    name:  "Fairs & events",
    color: "#b8860b",
    stages: [
      { name: "Identified",   meta_stage: "identify",    is_outcome: false },
      { name: "Applied",      meta_stage: "submit",      is_outcome: false },
      { name: "Accepted",     meta_stage: "discuss",     is_outcome: false },
      { name: "Planning",     meta_stage: "make_happen", is_outcome: false },
      { name: "Completed",    meta_stage: "closed",      is_outcome: true  },
      { name: "Declined",     meta_stage: "closed",      is_outcome: true  },
    ],
  },
  sales: {
    name:  "Sales",
    color: "#3d6b4f",
    stages: [
      { name: "Identified",   meta_stage: "identify", is_outcome: false },
      { name: "Quoted",       meta_stage: "submit",   is_outcome: false },
      { name: "Negotiating",  meta_stage: "discuss",  is_outcome: false },
      { name: "Sold",         meta_stage: "closed",   is_outcome: true  },
      { name: "Lost",         meta_stage: "closed",   is_outcome: true  },
    ],
  },
  client: {
    name:  "Client pursuits",
    color: "#2563ab",
    stages: [
      { name: "Prospecting",  meta_stage: "identify",    is_outcome: false },
      { name: "Intro Call",   meta_stage: "submit",      is_outcome: false },
      { name: "Proposal",     meta_stage: "discuss",     is_outcome: false },
      { name: "Contract",     meta_stage: "make_happen", is_outcome: false },
      { name: "Active",       meta_stage: "closed",      is_outcome: true  },
      { name: "Closed",       meta_stage: "closed",      is_outcome: true  },
      { name: "Lost",         meta_stage: "closed",      is_outcome: true  },
    ],
  },
  wholesale: {
    name:  "Wholesale / shops",
    color: "#dc3e0d",
    stages: [
      { name: "Identified",   meta_stage: "identify", is_outcome: false },
      { name: "Pitched",      meta_stage: "submit",   is_outcome: false },
      { name: "Sampling",     meta_stage: "discuss",  is_outcome: false },
      { name: "Stocked",      meta_stage: "closed",   is_outcome: true  },
      { name: "Passed",       meta_stage: "closed",   is_outcome: true  },
    ],
  },
  collectors: {
    name:  "Collectors",
    color: "#9BA37A",
    stages: [
      { name: "Identified",   meta_stage: "identify",    is_outcome: false },
      { name: "Reached out",  meta_stage: "submit",      is_outcome: false },
      { name: "Studio visit", meta_stage: "discuss",     is_outcome: false },
      { name: "Acquired",     meta_stage: "closed",      is_outcome: true  },
      { name: "Cold",         meta_stage: "closed",      is_outcome: true  },
    ],
  },
};

// Maps onboarding answers → two pipeline templates. First match wins. Order
// matters: more specific patterns are listed first.
function pickTemplates(practice: string[], channels: string[]): [TemplateKey, TemplateKey] {
  const p = new Set(practice.map(s => s.toLowerCase()));
  const c = new Set(channels.map(s => s.toLowerCase()));

  const hasFurniture  = p.has("furniture") || p.has("objects & lighting");
  const hasCeramic    = p.has("ceramics & glass") || p.has("textiles");
  const hasPainting   = p.has("painting") || p.has("illustration") || p.has("sculpture") || p.has("printmaking");
  const hasClient     = p.has("client-based work") || c.has("trade") || c.has("commissions");
  const hasCommerce   = c.has("ecommerce") || c.has("direct");
  const hasWholesale  = c.has("ecommerce") || c.has("direct") || hasCeramic;

  if (hasFurniture)            return ["gallery",   "press"];
  if (hasCeramic)              return ["gallery",   "wholesale"];
  if (hasClient)               return ["client",    "press"];
  if (hasPainting)             return ["gallery",   "collectors"];
  if (hasCommerce && hasWholesale) return ["wholesale", "press"];

  return ["gallery", "client"];
}

/**
 * Idempotent seeding. Skips if the user already has any outreach pipelines.
 * Cheap enough to call on every Outreach page load thanks to the guard.
 */
export async function ensureSeedPipelines(userId: string): Promise<void> {
  const supabase = await createClient();

  // Bail if any pipelines exist — single round-trip via count.
  const { count } = await supabase
    .from("outreach_pipelines")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return;

  // Read onboarding answers. If the profile row is missing or onboarding
  // isn't complete, fall back to the default pair so the user still gets a
  // working starting board.
  const { data: profile } = await supabase
    .from("profiles")
    .select("practice_types, selling_channels, onboarding_complete")
    .eq("user_id", userId)
    .maybeSingle();

  const practice = (profile?.practice_types  as string[] | null) ?? [];
  const channels = (profile?.selling_channels as string[] | null) ?? [];

  const [a, b] = pickTemplates(practice, channels);
  const picks = [TEMPLATES[a], TEMPLATES[b]];

  // Insert pipelines first to get their ids, then insert all stages in one
  // round-trip. The `seeded` column drives the "Suggested" pill in the UI.
  for (let i = 0; i < picks.length; i++) {
    const tpl = picks[i];
    const { data: pipeline } = await supabase
      .from("outreach_pipelines")
      .insert({
        user_id:  userId,
        name:     tpl.name,
        color:    tpl.color,
        position: i,
        seeded:   true,
      })
      .select("*")
      .single();
    if (!pipeline) continue;

    const stageRows = tpl.stages.map((s, idx) => ({
      pipeline_id: pipeline.id,
      user_id:     userId,
      name:        s.name,
      position:    idx,
      is_outcome:  s.is_outcome,
      meta_stage:  s.meta_stage,
    }));
    await supabase.from("pipeline_stages").insert(stageRows);
  }
}
