import { createClient } from "@/lib/supabase/server";
import CalendarClient from "@/components/calendar/CalendarClient";
import type { Reminder } from "@/types/database";

export default async function CalendarPage() {
  const supabase = await createClient();

  const [{ data: reminders }, { data: projects }] = await Promise.all([
    supabase
      .from("reminders")
      .select("*")
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("projects")
      .select("id, title, due_date, status")
      .order("title"),
  ]);

  // Check if Google Calendar is connected
  const { data: gcalIntegration } = await supabase
    .from("integrations")
    .select("id, account_name, metadata, last_synced_at")
    .eq("provider", "google_calendar")
    .maybeSingle();

  return (
    <CalendarClient
      initialReminders={(reminders ?? []) as Reminder[]}
      initialProjects={
        (projects ?? []) as {
          id: string;
          title: string;
          due_date: string | null;
          status: string;
        }[]
      }
      gcalConnected={!!gcalIntegration}
      gcalAccountName={(gcalIntegration?.metadata as { email?: string } | null)?.email ?? gcalIntegration?.account_name ?? null}
    />
  );
}
