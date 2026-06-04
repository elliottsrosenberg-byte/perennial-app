import { createClient } from "@/lib/supabase/server";
import CalendarClient from "@/components/calendar/CalendarClient";
import type { Task, Contact, Opportunity } from "@/types/database";

export default async function CalendarPage() {
  const supabase = await createClient();

  const [
    { data: tasks },
    { data: projects },
    { data: contacts },
    { data: integrations },
    { data: opportunities },
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
      .eq("archived", false)
      .order("first_name"),
    supabase
      .from("integrations")
      .select("provider, account_name, status, scopes, metadata, last_synced_at")
      .in("provider", ["google_calendar", "google", "microsoft"]),
    // Opportunities the user is engaged with (saved/attending/applied/exhibiting)
    // OR Perennial-feed picks with dates. Filter at the DB so the calendar
    // page doesn't ship every opportunity in the world.
    supabase
      .from("opportunities")
      .select("id, title, event_type, category, start_date, end_date, location, user_status, tags")
      .not("start_date", "is", null),
  ]);

  // The user's practice types → discipline tags, so the calendar can filter
  // opportunities to "Recommended".
  const { data: { user } } = await supabase.auth.getUser();
  let practiceTypes: string[] = [];
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("practice_types").eq("id", user.id).maybeSingle();
    practiceTypes = (profile?.practice_types as string[] | null) ?? [];
  }

  // Collapse the per-row integrations into per-provider connection
  // summaries the CalendarClient uses to render its status panel and
  // tour hint. A user might have:
  //   - the legacy `google_calendar` standalone connection
  //   - the unified `google` integration with the calendar sub-scope
  //   - the unified `microsoft` integration with the calendar sub-scope
  // Any one of these counts as "Google connected" or "Outlook connected".
  type Conn = { kind: "google" | "outlook"; accountName: string | null };
  const conns: Conn[] = [];
  for (const intg of integrations ?? []) {
    const scopes = (intg.scopes ?? {}) as Record<string, boolean>;
    const meta   = (intg.metadata ?? {}) as { email?: string };
    const name   = meta.email ?? intg.account_name ?? null;
    if (intg.provider === "google_calendar") {
      conns.push({ kind: "google", accountName: name });
    } else if (intg.provider === "google" && intg.status === "active" && scopes.calendar) {
      conns.push({ kind: "google", accountName: name });
    } else if (intg.provider === "microsoft" && intg.status === "active" && scopes.calendar) {
      conns.push({ kind: "outlook", accountName: name });
    }
  }

  const googleConn  = conns.find((c) => c.kind === "google")  ?? null;
  const outlookConn = conns.find((c) => c.kind === "outlook") ?? null;

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
      initialOpportunities={(opportunities ?? []) as Pick<Opportunity, "id" | "title" | "event_type" | "category" | "start_date" | "end_date" | "location" | "user_status" | "tags">[]}
      practiceTypes={practiceTypes}
      googleConnected={!!googleConn}
      googleAccountName={googleConn?.accountName ?? null}
      outlookConnected={!!outlookConn}
      outlookAccountName={outlookConn?.accountName ?? null}
    />
  );
}
