import { createClient } from "@/lib/supabase/server";
import FinanceClient from "@/components/finance/FinanceClient";
import type { TimeEntry, ActiveTimer, Expense, Invoice, Project } from "@/types/database";

export default async function FinancePage() {
  const supabase = await createClient();

  const [
    { data: timeEntries },
    { data: activeTimer },
    { data: expenses },
    { data: invoices },
    { data: projects },
  ] = await Promise.all([
    supabase
      .from("time_entries")
      .select("*, project:projects(id, title, type, rate)")
      .gte("logged_at", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0])
      .order("logged_at", { ascending: false }),
    supabase
      .from("active_timers")
      .select("*, project:projects(id, title, type, rate)")
      .maybeSingle(),
    supabase
      .from("expenses")
      .select("*, project:projects(id, title, type, rate)")
      .gte("date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0])
      .order("date", { ascending: false }),
    supabase
      .from("invoices")
      .select("*, client_contact:contacts(id, first_name, last_name), client_company:companies(id, name), project:projects(id, title, rate), line_items:invoice_line_items(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, title, type, rate")
      .order("title", { ascending: true }),
  ]);

  return (
    <div className="flex flex-col h-full">
      <FinanceClient
        initialTimeEntries={(timeEntries ?? []) as TimeEntry[]}
        initialActiveTimer={(activeTimer ?? null) as ActiveTimer | null}
        initialExpenses={(expenses ?? []) as Expense[]}
        initialInvoices={(invoices ?? []) as Invoice[]}
        projects={(projects ?? []) as Pick<Project, "id" | "title" | "type" | "rate">[]}
      />
    </div>
  );
}
