import type { SupabaseClient } from "@supabase/supabase-js";
import type { AshContext } from "./system-prompt";

export async function buildAshContext(
  userId: string,
  module: string,
  userEmail: string | null,
  supabase: SupabaseClient,
): Promise<AshContext> {
  const now        = new Date();
  const today      = now.toISOString().split("T")[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0];

  const [
    { data: projects },
    { data: sentInvoices },
    { data: timeEntries },
    { data: staleContacts },
    { data: recentNotes },
    { data: upcomingReminders },
  ] = await Promise.all([
    // Active projects
    supabase
      .from("projects")
      .select("id, title, status, due_date, priority")
      .eq("user_id", userId)
      .neq("status", "complete")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),

    // Sent invoices (outstanding + overdue)
    supabase
      .from("invoices")
      .select("id, number, due_at, line_items:invoice_line_items(amount)")
      .eq("user_id", userId)
      .eq("status", "sent"),

    // Billable time this month
    supabase
      .from("time_entries")
      .select("duration_minutes, billable")
      .eq("user_id", userId)
      .gte("logged_at", monthStart),

    // Contacts not reached in 30+ days
    supabase
      .from("contacts")
      .select("first_name, last_name, last_contacted_at, company:companies(name)")
      .eq("user_id", userId)
      .eq("status", "active")
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo}`)
      .order("last_contacted_at", { ascending: true, nullsFirst: true })
      .limit(5),

    // Recent notes
    supabase
      .from("notes")
      .select("title, content, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(3),

    // Upcoming reminders (next 90 days)
    supabase
      .from("reminders")
      .select("title, due_date")
      .eq("user_id", userId)
      .eq("completed", false)
      .gte("due_date", today)
      .lte("due_date", ninetyDaysFromNow)
      .order("due_date", { ascending: true })
      .limit(5),
  ]);

  // Invoice calculations
  type RawInv = { id: string; number: number; due_at: string | null; line_items: { amount: number }[] };
  const invoices = (sentInvoices ?? []) as unknown as RawInv[];
  const invTotal = (inv: RawInv) => (inv.line_items ?? []).reduce((s, l) => s + Number(l.amount), 0);

  const overdueInvoices = invoices
    .filter((i) => i.due_at && i.due_at < today)
    .map((i) => ({ number: i.number, total: invTotal(i) }));

  const outstandingInvoices = invoices
    .filter((i) => !i.due_at || i.due_at >= today)
    .map((i) => ({ number: i.number, total: invTotal(i), due_at: i.due_at }));

  // Billable hours
  const billableMinutes = (timeEntries ?? [])
    .filter((t) => t.billable)
    .reduce((s, t) => s + t.duration_minutes, 0);

  // Stale contacts — flatten the company join
  type RawContact = {
    first_name: string;
    last_name: string;
    last_contacted_at: string | null;
    company: { name: string } | null;
  };
  const contacts = (staleContacts ?? []) as unknown as RawContact[];

  return {
    module,
    userEmail,
    projects: (projects ?? []) as AshContext["projects"],
    outstandingInvoices,
    overdueInvoices,
    recentNotes: (recentNotes ?? []) as AshContext["recentNotes"],
    staleContacts: contacts.map((c) => ({
      first_name: c.first_name,
      last_name:  c.last_name,
      last_contacted_at: c.last_contacted_at,
      company_name: c.company?.name ?? null,
    })),
    upcomingReminders: (upcomingReminders ?? []) as AshContext["upcomingReminders"],
    billableHoursThisMonth: billableMinutes / 60,
  };
}
