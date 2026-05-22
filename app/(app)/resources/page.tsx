import { createClient } from "@/lib/supabase/server";
import ResourcesClient from "@/components/resources/ResourcesClient";
import ResourcesIntroModal from "@/components/tour/resources/ResourcesIntroModal";
import ResourcesTooltipTour from "@/components/tour/resources/ResourcesTooltipTour";
import type { Resource, ResourceLink } from "@/types/database";

export default async function ResourcesPage() {
  const supabase = await createClient();

  const [{ data: resources }, { data: links }] = await Promise.all([
    supabase.from("resources").select("*").order("position", { ascending: true }),
    supabase.from("resource_links").select("*").order("created_at", { ascending: true }),
  ]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ResourcesClient
        initialResources={(resources ?? []) as Resource[]}
        initialLinks={(links ?? []) as ResourceLink[]}
      />
      <ResourcesIntroModal />
      <ResourcesTooltipTour />
    </div>
  );
}
