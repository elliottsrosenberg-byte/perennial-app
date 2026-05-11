import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/layout/Topbar";
import NotesCard from "@/components/home/NotesCard";
import TodayCard from "@/components/home/TodayCard";
import CalendarCard, { type CalendarItem } from "@/components/home/CalendarCard";
import FinanceCard from "@/components/home/FinanceCard";
import ProjectsCard from "@/components/home/ProjectsCard";
import ContactsCard from "@/components/home/ContactsCard";
import WelcomeBanner from "@/components/home/WelcomeBanner";

// ─── Types ────────────────────────────────────────────────────────────────────

type HomeNote    = { id: string; title: string | null; content: string | null; updated_at: string };
type HomeReminder = { id: string; title: string; due_date: string | null };
type RawInvoice  = { id: string; number: number; due_at: string | null; line_items: { amount: number }[] };
type HomeTimeEntry = { duration_minutes: number; billable: boolean; project: { rate: number | null } | null };
type HomeProject = { id: string; title: string; status: string; due_date: string | null; priority: string };
type HomeContact = { id: string; first_name: string; last_name: string; last_contacted_at: string | null; company: { name: string } | null };

function invoiceTotal(inv: RawInvoice) {
  return (inv.line_items ?? []).reduce((s, l) => s + Number(l.amount), 0);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase   = await createClient();

  // Force onboarding before the dashboard renders. The proxy guarantees a user
  // session here, so we only need to check completion.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.onboarding_complete) redirect("/onboarding");
  }

  const now        = new Date();
  const today      = now.toISOString().split("T")[0];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];

  const [
    { data: rawNotes },
    { data: rawReminders },
    { data: rawSentInvoices },
    { data: rawTimeEntries },
    { data: rawExpenses },
    { data: rawProjects },
    { data: rawContacts },
  ] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, content, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("reminders")
      .select("id, title, due_date")
      .eq("completed", false)
      .lte("due_date", endOfToday)
      .order("due_date", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, number, due_at, line_items:invoice_line_items(amount)")
      .eq("status", "sent"),
    supabase
      .from("time_entries")
      .select("duration_minutes, billable, project:projects(rate)")
      .gte("logged_at", monthStart),
    supabase
      .from("expenses")
      .select("amount")
      .gte("date", monthStart),
    supabase
      .from("projects")
      .select("id, title, status, due_date, priority")
      .neq("status", "complete")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, last_contacted_at, company:companies(name)")
      .eq("status", "active")
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo}`)
      .order("last_contacted_at", { ascending: true, nullsFirst: true })
      .limit(4),
  ]);

  // ── Finance calculations ───────────────────────────────────────────────────

  const sentInvoices = (rawSentInvoices ?? []) as unknown as RawInvoice[];
  const overdueInvoices = sentInvoices
    .filter((i) => i.due_at && i.due_at < today)
    .map((i) => ({ id: i.id, number: i.number, total: invoiceTotal(i) }));

  const outstandingTotal = sentInvoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const overdueTotal     = overdueInvoices.reduce((s, i) => s + i.total, 0);

  const timeEntries   = (rawTimeEntries ?? []) as unknown as HomeTimeEntry[];
  const billableMinutes = timeEntries.filter((t) => t.billable).reduce((s, t) => s + t.duration_minutes, 0);
  const billableAmount  = timeEntries
    .filter((t) => t.billable && (t.project as { rate: number | null } | null)?.rate)
    .reduce((s, t) => {
      const rate = (t.project as { rate: number } | null)?.rate ?? 0;
      return s + (t.duration_minutes / 60) * rate;
    }, 0);

  const expensesTotal = (rawExpenses ?? []).reduce((s, e) => s + Number((e as { amount: number }).amount), 0);

  // Build the Calendar card feed: project deadlines + reminders, future-first
  const projectsTyped = (rawProjects ?? []) as HomeProject[];
  const remindersTyped = (rawReminders ?? []) as HomeReminder[];
  const calendarItems: CalendarItem[] = [
    ...projectsTyped
      .filter((p) => p.due_date)
      .map((p) => ({ id: p.id, title: p.title, date: p.due_date as string, kind: "deadline" as const })),
    ...remindersTyped
      .filter((r) => r.due_date)
      .map((r) => ({ id: r.id, title: r.title, date: r.due_date as string, kind: "reminder" as const })),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        title="Home"
        greeting
        actions={
          <>
            <Link
              href="/notes"
              className="px-[13px] py-[5px] text-[11px] font-medium rounded-md text-white transition-opacity hover:opacity-90 inline-flex items-center leading-none"
              style={{ background: "var(--color-sage)" }}
            >
              + Quick note
            </Link>
            <Link
              href="/projects"
              className="px-[13px] py-[5px] text-[11px] font-medium rounded-md transition-colors inline-flex items-center leading-none"
              style={{ background: "transparent", color: "#6b6860", border: "0.5px solid var(--color-border)" }}
            >
              + New project
            </Link>
          </>
        }
      />

      <div
        className="flex-1 min-h-0 flex flex-col gap-[14px] p-5"
        style={{ background: "var(--color-warm-white)" }}
      >
        {/* Row 1 — Ash insights / welcome banner */}
        <div className="flex-shrink-0">
          <WelcomeBanner />
        </div>

        {/* Row 2 — Notes / Reminders / Calendar */}
        <div
          className="flex-1 min-h-0 grid gap-[14px]"
          style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
        >
          <NotesCard notes={(rawNotes ?? []) as HomeNote[]} />
          <TodayCard
            reminders={remindersTyped}
            overdueInvoices={overdueInvoices}
          />
          <CalendarCard items={calendarItems} />
        </div>

        {/* Row 3 — Finance / Projects / Contacts */}
        <div
          className="flex-1 min-h-0 grid gap-[14px]"
          style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
        >
          <FinanceCard
            billableHours={billableMinutes / 60}
            billableAmount={billableAmount}
            outstandingTotal={outstandingTotal}
            outstandingCount={sentInvoices.length}
            overdueTotal={overdueTotal}
            overdueCount={overdueInvoices.length}
            overdueInvoiceNumber={overdueInvoices[0]?.number ?? null}
            expensesTotal={expensesTotal}
          />
          <ProjectsCard projects={projectsTyped} />
          <ContactsCard contacts={(rawContacts ?? []) as unknown as HomeContact[]} />
        </div>
      </div>

    </div>
  );
}
