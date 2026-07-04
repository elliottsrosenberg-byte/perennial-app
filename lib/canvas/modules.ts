// Live summary stats for canvas "module cards" (a lightweight echo of the old
// dashboard cards). Each card fetches its module's summary on mount.

import { createClient } from "@/lib/supabase/client";
import type { ModuleKey } from "@/components/canvas/types";

export interface ModuleStat {
  label: string;
  value: string;
}
export interface ModuleSummary {
  stats: ModuleStat[];
}

export const MODULE_META: Record<ModuleKey, { label: string; href: string }> = {
  tasks: { label: "Tasks", href: "/tasks" },
  projects: { label: "Projects", href: "/projects" },
  finance: { label: "Finance", href: "/finance" },
  contacts: { label: "Network", href: "/network" },
  notes: { label: "Notes", href: "/notes" },
  calendar: { label: "Calendar", href: "/calendar" },
};

const iso = (d: Date) => d.toISOString().split("T")[0];
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export async function fetchModuleSummary(key: ModuleKey): Promise<ModuleSummary> {
  const supabase = createClient();
  const now = new Date();
  const today = iso(now);
  const in7 = iso(new Date(now.getTime() + 7 * 86400000));
  const thirtyAgo = iso(new Date(now.getTime() - 30 * 86400000));

  switch (key) {
    case "tasks": {
      const [open, due] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("completed", false),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("completed", false)
          .not("due_date", "is", null)
          .lte("due_date", in7),
      ]);
      return {
        stats: [
          { label: "Open", value: String(open.count ?? 0) },
          { label: "Due this week", value: String(due.count ?? 0) },
        ],
      };
    }
    case "projects": {
      const { data } = await supabase
        .from("projects")
        .select("id, due_date")
        .neq("status", "complete")
        .order("due_date", { ascending: true, nullsFirst: false });
      const rows = data ?? [];
      const next = rows.find((p) => p.due_date);
      return {
        stats: [
          { label: "Active", value: String(rows.length) },
          { label: "Next deadline", value: next?.due_date ? fmtDate(next.due_date) : "—" },
        ],
      };
    }
    case "finance": {
      const { data } = await supabase
        .from("invoices")
        .select("id, line_items:invoice_line_items(amount)")
        .eq("status", "sent");
      const rows = (data ?? []) as { line_items: { amount: number }[] }[];
      const outstanding = rows.reduce(
        (s, i) => s + (i.line_items ?? []).reduce((a, l) => a + Number(l.amount), 0),
        0,
      );
      return {
        stats: [
          { label: "Outstanding", value: money(outstanding) },
          { label: "Unpaid invoices", value: String(rows.length) },
        ],
      };
    }
    case "contacts": {
      const [total, follow] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("archived", false),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("archived", false)
          .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyAgo}`),
      ]);
      return {
        stats: [
          { label: "Contacts", value: String(total.count ?? 0) },
          { label: "Need follow-up", value: String(follow.count ?? 0) },
        ],
      };
    }
    case "notes": {
      const { data } = await supabase
        .from("notes")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(5);
      const rows = data ?? [];
      return {
        stats: [
          { label: "Recent notes", value: String(rows.length) },
          { label: "Latest", value: rows[0] ? rows[0].title || "Untitled" : "—" },
        ],
      };
    }
    case "calendar": {
      const [proj, task] = await Promise.all([
        supabase
          .from("projects")
          .select("id", { count: "exact", head: true })
          .not("due_date", "is", null)
          .gte("due_date", today)
          .lte("due_date", in7),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("completed", false)
          .not("due_date", "is", null)
          .gte("due_date", today)
          .lte("due_date", in7),
      ]);
      return {
        stats: [{ label: "Due this week", value: String((proj.count ?? 0) + (task.count ?? 0)) }],
      };
    }
  }
}
