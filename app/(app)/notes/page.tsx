import { createClient } from "@/lib/supabase/server";
import NotesClient from "@/components/notes/NotesClient";
import type { Note } from "@/types/database";

export default async function NotesPage() {
  const supabase = await createClient();

  const [{ data: notes }, { data: projects }] = await Promise.all([
    supabase.from("notes").select("*").order("updated_at", { ascending: false }),
    supabase.from("projects").select("id, title").order("title"),
  ]);

  return (
    <NotesClient
      initialNotes={(notes ?? []) as Note[]}
      projects={(projects ?? []) as { id: string; title: string }[]}
    />
  );
}
