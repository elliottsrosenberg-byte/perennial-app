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
    { data: openTasks },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, due_date, priority")
      .eq("user_id", userId)
      .neq("status", "complete")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),

    supabase
      .from("invoices")
      .select("id, number, due_at, line_items:invoice_line_items(amount)")
      .eq("user_id", userId)
      .eq("status", "sent"),

    supabase
      .from("time_entries")
      .select("duration_minutes, billable")
      .eq("user_id", userId)
      .gte("logged_at", monthStart),

    supabase
      .from("contacts")
      .select("first_name, last_name, last_contacted_at, company:companies(name)")
      .eq("user_id", userId)
      .eq("status", "active")
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo}`)
      .order("last_contacted_at", { ascending: true, nullsFirst: true })
      .limit(5),

    supabase
      .from("notes")
      .select("title, content, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(3),

    supabase
      .from("reminders")
      .select("title, due_date")
      .eq("user_id", userId)
      .eq("completed", false)
      .gte("due_date", today)
      .lte("due_date", ninetyDaysFromNow)
      .order("due_date", { ascending: true })
      .limit(5),

    supabase
      .from("tasks")
      .select("id, title, due_date, priority, project:projects(title)")
      .eq("user_id", userId)
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),

    supabase
      .from("profiles")
      .select("display_name, studio_name, tagline, bio, location, website, practice_types, work_types, selling_channels, price_range, years_in_practice, primary_challenges, business_issues, urgent_needs, perennial_goals, currency, hourly_rate")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  type RawInv = { id: string; number: number; due_at: string | null; line_items: { amount: number }[] };
  const invoices = (sentInvoices ?? []) as unknown as RawInv[];
  const invTotal = (inv: RawInv) => (inv.line_items ?? []).reduce((s, l) => s + Number(l.amount), 0);

  const overdueInvoices = invoices
    .filter((i) => i.due_at && i.due_at < today)
    .map((i) => ({ number: i.number, total: invTotal(i) }));

  const outstandingInvoices = invoices
    .filter((i) => !i.due_at || i.due_at >= today)
    .map((i) => ({ number: i.number, total: invTotal(i), due_at: i.due_at }));

  const billableMinutes = (timeEntries ?? [])
    .filter((t) => t.billable)
    .reduce((s, t) => s + t.duration_minutes, 0);

  type RawContact = {
    first_name: string; last_name: string;
    last_contacted_at: string | null;
    company: { name: string } | null;
  };
  const contacts = (staleContacts ?? []) as unknown as RawContact[];

  type RawTask = {
    id: string; title: string; due_date: string | null; priority: string | null;
    project: { title: string } | null;
  };
  const tasks = (openTasks ?? []) as unknown as RawTask[];

  type Prof = {
    display_name?: string; studio_name?: string; tagline?: string; bio?: string;
    location?: string;
    practice_types?: string[]; work_types?: string[]; selling_channels?: string[];
    price_range?: string; years_in_practice?: string;
    primary_challenges?: string[];
    business_issues?: string; urgent_needs?: string;
    perennial_goals?: string[];
    currency?: string; hourly_rate?: number;
  };
  const prof = profile as Prof | null;

  return {
    module,
    userEmail,
    studioName:         prof?.studio_name ?? null,
    displayName:        prof?.display_name ?? null,
    tagline:            prof?.tagline ?? null,
    bio:                prof?.bio ?? null,
    location:           prof?.location ?? null,
    practiceTypes:      prof?.practice_types ?? [],
    workTypes:          prof?.work_types ?? [],
    sellingChannels:    prof?.selling_channels ?? [],
    priceRange:         prof?.price_range ?? null,
    yearsInPractice:    prof?.years_in_practice ?? null,
    primaryChallenges:  prof?.primary_challenges ?? [],
    businessIssues:     prof?.business_issues ?? null,
    urgentNeeds:        prof?.urgent_needs ?? null,
    perennialGoals:     prof?.perennial_goals ?? [],
    currency:           prof?.currency ?? "USD",
    hourlyRate:         prof?.hourly_rate ?? null,
    projects:       (projects ?? []) as AshContext["projects"],
    outstandingInvoices,
    overdueInvoices,
    recentNotes:    (recentNotes ?? []) as AshContext["recentNotes"],
    staleContacts:  contacts.map((c) => ({
      first_name: c.first_name, last_name: c.last_name,
      last_contacted_at: c.last_contacted_at,
      company_name: c.company?.name ?? null,
    })),
    upcomingReminders: (upcomingReminders ?? []) as AshContext["upcomingReminders"],
    openTasks:      tasks.map((t) => ({
      title:    t.title,
      due_date: t.due_date,
      priority: t.priority,
      project:  (t.project as unknown as { title: string } | null)?.title ?? null,
    })),
    billableHoursThisMonth: billableMinutes / 60,
  };
}
