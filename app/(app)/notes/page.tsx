import { createClient } from "@/lib/supabase/server";
import NotesClient from "@/components/notes/NotesClient";
import type { Note, NoteFolder, NoteFolderItem } from "@/types/database";

const NOTE_SELECT = "*, project:projects(id,title), contact:contacts(id,first_name,last_name), opportunity:opportunities(id,title,category)";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const supabase = await createClient();
  const params   = await searchParams;

  const [{ data: notes }, { data: projects }, { data: folders }, { data: folderItems }] = await Promise.all([
    supabase.from("notes").select(NOTE_SELECT).order("updated_at", { ascending: false }),
    supabase.from("projects").select("id, title").order("title"),
    supabase.from("note_folders").select("*").order("position", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("note_folder_items").select("*"),
  ]);

  return (
    <NotesClient
      initialNotes={(notes ?? []) as Note[]}
      projects={(projects ?? []) as { id: string; title: string }[]}
      initialFolders={(folders ?? []) as NoteFolder[]}
      initialFolderItems={(folderItems ?? []) as NoteFolderItem[]}
      initialSelectedId={params.id}
    />
  );
}
