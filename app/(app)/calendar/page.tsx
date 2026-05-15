import { createClient } from "@/lib/supabase/server";
import CalendarClient from "@/components/calendar/CalendarClient";
import type { Task, Contact } from "@/types/database";

export default async function CalendarPage() {
  const supabase = await createClient();

  const [
    { data: tasks },
    { data: projects },
    { data: contacts },
  ] = await Promise.all([
    // Calendar now reads from the tasks table directly — reminders were
    // merged into tasks. We pull open tasks for the user; the client owns
    // sorting and filtering by date window.
    supabase
      .from("tasks")
      .select("*, project:projects(id, title), contact:contacts(id, first_name, last_name)")
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("projects")
      .select("id, title, due_date, status")
      .order("title"),
    supabase
      .from("contacts")
      .select("id, first_name, last_name")
      .order("first_name"),
  ]);

  // Check if Google Calendar is connected
  const { data: gcalIntegration } = await supabase
    .from("integrations")
    .select("id, account_name, metadata, last_synced_at")
    .eq("provider", "google_calendar")
    .maybeSingle();

  return (
    <CalendarClient
      initialTasks={(tasks ?? []) as Task[]}
      initialProjects={
        (projects ?? []) as {
          id: string;
          title: string;
          due_date: string | null;
          status: string;
        }[]
      }
      initialContacts={(contacts ?? []) as Pick<Contact, "id" | "first_name" | "last_name">[]}
      gcalConnected={!!gcalIntegration}
      gcalAccountName={(gcalIntegration?.metadata as { email?: string } | null)?.email ?? gcalIntegration?.account_name ?? null}
    />
  );
}
