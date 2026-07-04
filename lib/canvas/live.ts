// Live data for interactive canvas cards (project / contact / note / task
// list). Cards fetch fresh on mount (per user preference) and some mutate.

import { createClient } from "@/lib/supabase/client";

// ── project ────────────────────────────────────────────────────────────────
export interface LiveProject {
  title: string;
  status: string | null;
  dueDate: string | null;
  total: number;
  done: number;
  tasks: { id: string; title: string; completed: boolean }[];
}

export async function fetchProject(id: string): Promise<LiveProject | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, title, status, due_date, tasks(id, title, completed)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const tasks = (data.tasks ?? []) as { id: string; title: string; completed: boolean }[];
  return {
    title: data.title,
    status: data.status ?? null,
    dueDate: data.due_date ?? null,
    total: tasks.length,
    done: tasks.filter((t) => t.completed).length,
    tasks,
  };
}

// ── contact ────────────────────────────────────────────────────────────────
export interface LiveContact {
  name: string;
  org: string | null;
  initials: string;
  activities: { id: string; type: string; content: string | null; when: string | null }[];
}

export async function fetchContact(id: string): Promise<LiveContact | null> {
  const supabase = createClient();
  const [{ data: c }, { data: acts }] = await Promise.all([
    supabase.from("contacts").select("first_name, last_name, organization:organizations(name)").eq("id", id).maybeSingle(),
    supabase
      .from("contact_activities")
      .select("id, type, content, occurred_at")
      .eq("contact_id", id)
      .order("occurred_at", { ascending: false })
      .limit(4),
  ]);
  if (!c) return null;
  const org = c.organization as unknown as { name: string } | null;
  return {
    name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed",
    org: org?.name ?? null,
    initials: `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.toUpperCase() || "?",
    activities: (acts ?? []).map((a) => ({ id: a.id, type: a.type, content: a.content, when: a.occurred_at })),
  };
}

// ── note ───────────────────────────────────────────────────────────────────
export interface LiveNote {
  title: string | null;
  content: string | null;
}
export async function fetchNote(id: string): Promise<LiveNote | null> {
  const supabase = createClient();
  const { data } = await supabase.from("notes").select("title, content").eq("id", id).maybeSingle();
  return data ? { title: data.title, content: data.content } : null;
}
export async function saveNote(id: string, content: string): Promise<void> {
  await createClient().from("notes").update({ content }).eq("id", id);
}

// ── task list (scoped to a project or contact) ───────────────────────────────
export type TaskScope = "project" | "contact";
export interface LiveTask {
  id: string;
  title: string;
  completed: boolean;
}

export async function fetchScopeTasks(scope: TaskScope, scopeId: string): Promise<LiveTask[]> {
  const supabase = createClient();
  const col = scope === "contact" ? "contact_id" : "project_id";
  const { data } = await supabase
    .from("tasks")
    .select("id, title, completed")
    .eq(col, scopeId)
    .order("completed", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(40);
  return (data ?? []) as LiveTask[];
}

export async function toggleTask(id: string, completed: boolean): Promise<void> {
  await createClient().from("tasks").update({ completed }).eq("id", id);
}

export async function addScopeTask(scope: TaskScope, scopeId: string, title: string): Promise<LiveTask | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const col = scope === "contact" ? "contact_id" : "project_id";
  const { data } = await supabase
    .from("tasks")
    .insert({ user_id: user.id, [col]: scopeId, title, completed: false })
    .select("id, title, completed")
    .single();
  return (data as LiveTask) ?? null;
}
