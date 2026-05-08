import { createClient } from "@/lib/supabase/server";
import NotesClient from "@/components/notes/NotesClient";
import type { Note } from "@/types/database";

const NOTE_SELECT = "*, project:projects(id,title), contact:contacts(id,first_name,last_name), opportunity:opportunities(id,title,category)";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const supabase = await createClient();
  const params   = await searchParams;

  const [{ data: notes }, { data: projects }] = await Promise.all([
    supabase.from("notes").select(NOTE_SELECT).order("updated_at", { ascending: false }),
    supabase.from("projects").select("id, title").order("title"),
  ]);

  return (
    <NotesClient
      initialNotes={(notes ?? []) as Note[]}
      projects={(projects ?? []) as { id: string; title: string }[]}
      initialSelectedId={params.id}
    />
  );
}
