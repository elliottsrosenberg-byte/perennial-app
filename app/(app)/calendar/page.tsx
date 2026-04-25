import { createClient } from "@/lib/supabase/server";
import CalendarClient from "@/components/calendar/CalendarClient";
import ComingSoonOverlay from "@/components/layout/ComingSoonOverlay";
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

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
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
      />
      <ComingSoonOverlay
        module="Calendar"
        description="View deadlines, reminders, and upcoming events in a weekly calendar view with project integration."
      />
    </div>
  );
}
