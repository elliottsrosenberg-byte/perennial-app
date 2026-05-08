import { createClient } from "@/lib/supabase/server";
import TasksClient from "@/components/tasks/TasksClient";
import type { Task } from "@/types/database";

export default async function TasksPage() {
  const supabase = await createClient();

  const TASK_SELECT = "*, project:projects(id, title), contact:contacts(id, first_name, last_name), opportunity:opportunities(id, title, category)";

  const [{ data: tasks }, { data: completed }, { data: projects }] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("completed", false).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("tasks").select(TASK_SELECT).eq("completed", true).order("created_at", { ascending: false }).limit(20),
    supabase.from("projects").select("id, title").order("title"),
  ]);

  return (
    <div className="flex flex-col h-full">
      <TasksClient
        initialTasks={(tasks ?? []) as Task[]}
        initialCompleted={(completed ?? []) as Task[]}
        projects={(projects ?? []) as { id: string; title: string }[]}
      />
    </div>
  );
}
