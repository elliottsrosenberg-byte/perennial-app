import { createClient } from "@/lib/supabase/server";
import ResourcesClient from "@/components/resources/ResourcesClient";
import ResourcesIntroModal from "@/components/tour/resources/ResourcesIntroModal";
import ResourcesTooltipTour from "@/components/tour/resources/ResourcesTooltipTour";
import type { Resource, ResourceLink } from "@/types/database";
import {
  hydrateResourcesFromProfile,
  type HydrationProfile,
} from "@/lib/resources/onboarding-hydrate";
import type { LinkedFile } from "@/lib/resources/linked-files";

export default async function ResourcesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fan-out parallel reads:
  //  - resources / resource_links (owned by user via RLS)
  //  - profiles (drives onboarding hydration + the "continue your brand" banner)
  //  - contact_files / organization_files / project_files (cross-module file index)
  // The cross-module rows include a join to the parent so we can render
  // human-readable source names ("Files attached to: <name>") in the rail.
  const [
    { data: resources },
    { data: links },
    { data: profile },
    { data: contactFiles },
    { data: orgFiles },
    { data: projectFiles },
  ] = await Promise.all([
    supabase.from("resources").select("*").order("position", { ascending: true }),
    supabase.from("resource_links").select("*").order("created_at", { ascending: true }),
    user
      ? supabase.from("profiles").select(
          "studio_name, display_name, tagline, bio, location, practice_types, selling_channels, work_types, perennial_goals",
        ).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("contact_files")
      .select("id, name, url, file_type, created_at, contact_id, contact:contacts(id, first_name, last_name)")
      .order("created_at", { ascending: false }),
    supabase.from("organization_files")
      .select("id, name, url, file_type, created_at, organization_id, organization:organizations(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("project_files")
      .select("id, name, url, file_type, created_at, project_id, project:projects(id, title)")
      .order("created_at", { ascending: false }),
  ]);

  // Server-side onboarding hydration: fill empty resource fields from the
  // profile answers (never overwrite user edits). Hydrated rows graduate from
  // "empty" → "partial" so the user sees they have a head start.
  let hydratedResources = (resources ?? []) as Resource[];
  if (profile && user) {
    hydratedResources = await hydrateResourcesFromProfile(
      supabase,
      hydratedResources,
      profile as HydrationProfile,
      user.id,
    );
  }

  // Flatten cross-module files into a single LinkedFile[] list. The client
  // groups by source for rail display; we keep the shape uniform here so the
  // client doesn't need to know about each underlying table.
  const linkedFiles: LinkedFile[] = [
    ...(contactFiles ?? []).map((f): LinkedFile => {
      // Supabase relational selects may type joined rows as arrays — normalize.
      const c = Array.isArray(f.contact) ? f.contact[0] : f.contact;
      const name = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "Contact";
      return {
        id: `contact:${f.id}`,
        source: "contact",
        source_id: f.contact_id,
        source_name: name || "Contact",
        file_name: f.name,
        file_url: f.url,
        file_type: f.file_type,
        created_at: f.created_at,
      };
    }),
    ...(orgFiles ?? []).map((f): LinkedFile => {
      const o = Array.isArray(f.organization) ? f.organization[0] : f.organization;
      return {
        id: `organization:${f.id}`,
        source: "organization",
        source_id: f.organization_id,
        source_name: o?.name ?? "Organization",
        file_name: f.name,
        file_url: f.url,
        file_type: f.file_type,
        created_at: f.created_at,
      };
    }),
    ...(projectFiles ?? []).map((f): LinkedFile => {
      const p = Array.isArray(f.project) ? f.project[0] : f.project;
      return {
        id: `project:${f.id}`,
        source: "project",
        source_id: f.project_id,
        source_name: p?.title ?? "Project",
        file_name: f.name,
        file_url: f.url,
        file_type: f.file_type,
        created_at: f.created_at,
      };
    }),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // Whether to surface the "Continue your brand setup" banner. We let the
  // client decide based on localStorage; the server flag is just "is there
  // anything in onboarding to surface in the first place?".
  const showOnboardingBanner = Boolean(
    profile &&
      ((profile as HydrationProfile).studio_name ||
        ((profile as HydrationProfile).practice_types?.length ?? 0) > 0),
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ResourcesClient
        initialResources={hydratedResources}
        initialLinks={(links ?? []) as ResourceLink[]}
        initialLinkedFiles={linkedFiles}
        showOnboardingBanner={showOnboardingBanner}
        studioName={(profile as HydrationProfile | null)?.studio_name ?? null}
      />
      <ResourcesIntroModal />
      <ResourcesTooltipTour />
    </div>
  );
}
