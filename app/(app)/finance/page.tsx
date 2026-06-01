import { createClient } from "@/lib/supabase/server";
import FinanceClient from "@/components/finance/FinanceClient";
import type { TimeEntry, ActiveTimer, Expense, Invoice, Project } from "@/types/database";

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ tab?: string; invoice?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: timeEntries },
    { data: activeTimer },
    { data: expenses },
    { data: invoices },
    { data: projects },
    { data: profile },
    { data: stripeRows },
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
      .select("*, client_contact:contacts(id, first_name, last_name, email, phone, location), client_organization:organizations(id, name, email, phone, location), project:projects(id, title, rate), line_items:invoice_line_items(*), attachments:invoice_attachments(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, title, type, rate")
      .order("title", { ascending: true }),
    user
      ? supabase.from("profiles").select("invoice_prefix").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Stripe is foundational to invoicing — the Invoices tab gates on it.
    // Pull every non-disconnected Stripe row so we can report the live
    // connection health (active vs error) to the client.
    user
      ? supabase
          .from("integrations")
          .select("status, account_id, account_name")
          .eq("user_id", user.id)
          .eq("provider", "stripe")
          .neq("status", "disconnected")
          .order("connected_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ]);

  // Collapse to a single status the Invoices tab can act on. `connected`
  // means a healthy, payable account; `error` means a row exists but the
  // connection is broken; otherwise it's treated as not connected.
  const stripeRow = ((stripeRows ?? []) as { status: string; account_id: string | null; account_name: string | null }[])[0] ?? null;
  const stripeStatus = {
    connected:   !!stripeRow && stripeRow.status === "active" && !!stripeRow.account_id,
    status:      stripeRow?.status ?? null,
    accountName: stripeRow?.account_name ?? null,
  };

  return (
    <div className="flex flex-col h-full">
      <FinanceClient
        initialTimeEntries={(timeEntries ?? []) as TimeEntry[]}
        initialActiveTimer={(activeTimer ?? null) as ActiveTimer | null}
        initialExpenses={(expenses ?? []) as Expense[]}
        initialInvoices={(invoices ?? []) as Invoice[]}
        projects={(projects ?? []) as Pick<Project, "id" | "title" | "type" | "rate">[]}
        invoicePrefix={(profile as { invoice_prefix?: string | null } | null)?.invoice_prefix ?? null}
        stripeStatus={stripeStatus}
        initialTab={sp.tab ?? null}
        initialInvoiceId={sp.invoice ?? null}
      />
    </div>
  );
}
