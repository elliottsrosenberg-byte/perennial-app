import { createClient } from "@/lib/supabase/server";
import Topbar from "@/components/layout/Topbar";
import ProjectsClient from "@/components/projects/ProjectsClient";
import type { Project } from "@/types/database";

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("*, tasks(*)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Projects" />
      <ProjectsClient initialProjects={(projects ?? []) as Project[]} />
    </div>
  );
}
