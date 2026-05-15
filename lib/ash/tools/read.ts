// ─── Read Tools ────────────────────────────────────────────────────────────────
//
// All read-only. No approval needed. These fire whenever Claude needs more
// context than the initial snapshot — specific projects, contact history, etc.

import type { AshToolDefinition, ToolContext } from "./types";

// ─── search_projects ───────────────────────────────────────────────────────────

async function search_projects(
  input: { query?: string; status?: string; priority?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  let q = supabase
    .from("projects")
    .select("id, title, status, priority, due_date, est_value, listing_price, description")
    .eq("user_id", userId);

  if (input.status) q = q.eq("status", input.status);
  if (input.priority) q = q.eq("priority", input.priority);

  const { data } = await q.order("updated_at", { ascending: false }).limit(12);
  if (!data?.length) return "No projects found matching that criteria.";

  // Client-side filter on query if provided
  const results = input.query
    ? data.filter((p) =>
        p.title?.toLowerCase().includes(input.query!.toLowerCase()) ||
        p.description?.toLowerCase().includes(input.query!.toLowerCase())
      )
    : data;

  if (!results.length) return `No projects found matching "${input.query}".`;

  return JSON.stringify(results.map((p) => ({
    id:       p.id,
    title:    p.title,
    status:   p.status,
    priority: p.priority,
    due_date: p.due_date,
    value:    p.listing_price ?? p.est_value,
    description: p.description?.slice(0, 120),
  })));
}

export const searchProjectsTool: AshToolDefinition = {
  name: "search_projects",
  description:
    "Search the user's projects by title, keyword, status, or priority. " +
    "Use this when the user asks about specific projects, wants to find projects, " +
    "or mentions a project name that isn't in the current context snapshot. " +
    "Returns title, status, due date, priority, and estimated value.",
  input_schema: {
    type: "object",
    properties: {
      query:    { type: "string",  description: "Text to search in project titles and descriptions" },
      status:   { type: "string",  enum: ["in_progress", "planning", "on_hold", "complete"], description: "Filter by status" },
      priority: { type: "string",  enum: ["high", "medium", "low"],                          description: "Filter by priority" },
    },
    required: [],
  },
  handler: search_projects,
};

// ─── get_project_details ───────────────────────────────────────────────────────

async function get_project_details(
  input: { project_id: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const [{ data: project }, { data: tasks }, { data: timeEntries }] = await Promise.all([
    supabase
      .from("projects")
      .select("*, tasks(*)")
      .eq("id", input.project_id)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("tasks")
      .select("id, title, completed")
      .eq("project_id", input.project_id)
      .eq("user_id", userId),
    supabase
      .from("time_entries")
      .select("duration_minutes, billable, description, logged_at")
      .eq("project_id", input.project_id)
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(10),
  ]);

  if (!project) return `Project ${input.project_id} not found.`;

  const totalHours = (timeEntries ?? []).reduce((s, t) => s + t.duration_minutes, 0) / 60;
  const completedTasks = (tasks ?? []).filter((t) => t.completed).length;

  return JSON.stringify({
    ...project,
    tasks: tasks ?? [],
    tasks_summary: `${completedTasks}/${(tasks ?? []).length} complete`,
    total_hours_logged: Math.round(totalHours * 10) / 10,
    recent_time_entries: timeEntries ?? [],
  });
}

export const getProjectDetailsTool: AshToolDefinition = {
  name: "get_project_details",
  description:
    "Get complete details for a specific project including all tasks, time logged, " +
    "materials, dimensions, and financial info. Use when the user wants to discuss " +
    "a specific project in depth or when you need task-level detail.",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "The UUID of the project" },
    },
    required: ["project_id"],
  },
  handler: get_project_details,
};

// ─── search_contacts ───────────────────────────────────────────────────────────

async function search_contacts(
  input: { query?: string; tag?: string; status?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  let q = supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, title, tags, status, last_contacted_at, location, company:companies(name)")
    .eq("user_id", userId);

  if (input.status) q = q.eq("status", input.status);

  const { data } = await q.order("last_name").limit(20);
  if (!data?.length) return "No contacts found.";

  let results = data as unknown as Array<{
    id: string; first_name: string; last_name: string;
    email: string | null; tags: string[]; status: string;
    last_contacted_at: string | null; title: string | null;
    company: { name: string } | null;
  }>;

  if (input.query) {
    const q = input.query.toLowerCase();
    results = results.filter((c) =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.company?.name?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q)
    );
  }

  if (input.tag) {
    results = results.filter((c) =>
      c.tags?.some((t) => t.toLowerCase().includes(input.tag!.toLowerCase()))
    );
  }

  if (!results.length) return `No contacts found matching "${input.query ?? input.tag}".`;

  return JSON.stringify(results.map((c) => ({
    id:   c.id,
    name: `${c.first_name} ${c.last_name}`,
    company: c.company?.name,
    title: c.title,
    tags: c.tags,
    status: c.status,
    last_contacted_at: c.last_contacted_at,
  })));
}

export const searchContactsTool: AshToolDefinition = {
  name: "search_contacts",
  description:
    "Search the user's contacts by name, company, title, or tag. " +
    "Use when the user asks about specific people, wants to find someone, " +
    "is planning outreach, or mentions a name not in the current context.",
  input_schema: {
    type: "object",
    properties: {
      query:  { type: "string", description: "Name, email, company, or job title to search" },
      tag:    { type: "string", description: "Filter by contact tag (gallery, client, press, etc.)" },
      status: { type: "string", enum: ["active", "lead", "inactive"], description: "Filter by relationship status" },
    },
    required: [],
  },
  handler: search_contacts,
};

// ─── get_contact_details ───────────────────────────────────────────────────────

async function get_contact_details(
  input: { contact_id: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const [{ data: contact }, { data: activity }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, company:companies(*)")
      .eq("id", input.contact_id)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("contact_activities")
      .select("type, content, occurred_at")
      .eq("contact_id", input.contact_id)
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(8),
  ]);

  if (!contact) return `Contact ${input.contact_id} not found.`;

  return JSON.stringify({ ...contact, recent_activity: activity ?? [] });
}

export const getContactDetailsTool: AshToolDefinition = {
  name: "get_contact_details",
  description:
    "Get complete details for a specific contact including company info, relationship status, " +
    "last contact date, bio, and recent activity (emails, calls, notes, meetings). " +
    "Use when discussing a specific person's relationship or planning an interaction.",
  input_schema: {
    type: "object",
    properties: {
      contact_id: { type: "string", description: "The UUID of the contact" },
    },
    required: ["contact_id"],
  },
  handler: get_contact_details,
};

// ─── get_finance_summary ───────────────────────────────────────────────────────

async function get_finance_summary(
  input: { period?: "this_month" | "last_month" | "this_quarter" | "ytd" },
  { supabase, userId }: ToolContext
): Promise<string> {
  const now = new Date();
  let start: string;

  switch (input.period ?? "this_month") {
    case "last_month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start = d.toISOString().split("T")[0];
      break;
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1).toISOString().split("T")[0];
      break;
    }
    case "ytd":
      start = `${now.getFullYear()}-01-01`;
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  }

  const today = now.toISOString().split("T")[0];

  const [{ data: timeEntries }, { data: invoices }, { data: expenses }] = await Promise.all([
    supabase
      .from("time_entries")
      .select("duration_minutes, billable, project:projects(title, rate)")
      .eq("user_id", userId)
      .gte("logged_at", start),
    supabase
      .from("invoices")
      .select("id, number, status, due_at, paid_at, line_items:invoice_line_items(amount)")
      .eq("user_id", userId)
      .gte("created_at", start),
    supabase
      .from("expenses")
      .select("amount, category, description")
      .eq("user_id", userId)
      .gte("date", start),
  ]);

  type RawInv = { id: string; number: number; status: string; due_at: string | null; paid_at: string | null; line_items: { amount: number }[] };
  const invs = (invoices ?? []) as unknown as RawInv[];
  const total = (inv: RawInv) => (inv.line_items ?? []).reduce((s, l) => s + Number(l.amount), 0);

  const billableHours  = (timeEntries ?? []).filter((t) => t.billable).reduce((s, t) => s + t.duration_minutes, 0) / 60;
  const outstandingInvs = invs.filter((i) => i.status === "sent" && (!i.due_at || i.due_at >= today));
  const overdueInvs    = invs.filter((i) => i.status === "sent" && i.due_at && i.due_at < today);
  const paidInvs       = invs.filter((i) => i.status === "paid");
  const totalExpenses  = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);

  return JSON.stringify({
    period:              input.period ?? "this_month",
    billable_hours:      Math.round(billableHours * 10) / 10,
    outstanding_total:   outstandingInvs.reduce((s, i) => s + total(i), 0),
    outstanding_count:   outstandingInvs.length,
    overdue_total:       overdueInvs.reduce((s, i) => s + total(i), 0),
    overdue_invoices:    overdueInvs.map((i) => ({ number: i.number, total: total(i), due_at: i.due_at })),
    collected_total:     paidInvs.reduce((s, i) => s + total(i), 0),
    expenses_total:      totalExpenses,
    expense_breakdown:   (expenses ?? []).reduce((acc: Record<string, number>, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
      return acc;
    }, {}),
  });
}

export const getFinanceSummaryTool: AshToolDefinition = {
  name: "get_finance_summary",
  description:
    "Get a detailed financial summary for a time period: billable hours, invoice totals " +
    "(outstanding, overdue, paid), and expense breakdown by category. " +
    "Use when the user asks about money, revenue, cash flow, profitability, or business health.",
  input_schema: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["this_month", "last_month", "this_quarter", "ytd"],
        description: "Time period for the summary (defaults to this_month)",
      },
    },
    required: [],
  },
  handler: get_finance_summary,
};

// ─── search_notes ──────────────────────────────────────────────────────────────

async function search_notes(
  input: { query: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { data } = await supabase
    .from("notes")
    .select("id, title, content, updated_at, project:projects(title)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (!data?.length) return "No notes found.";

  const q = input.query.toLowerCase();
  const results = data.filter((n) =>
    n.title?.toLowerCase().includes(q) ||
    n.content?.replace(/<[^>]*>/g, " ").toLowerCase().includes(q)
  );

  if (!results.length) return `No notes found matching "${input.query}".`;

  return JSON.stringify(results.slice(0, 8).map((n) => ({
    id:      n.id,
    title:   n.title || "Untitled",
    preview: n.content?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150),
    project: (n.project as unknown as { title: string } | null)?.title,
    updated_at: n.updated_at,
  })));
}

export const searchNotesTool: AshToolDefinition = {
  name: "search_notes",
  description:
    "Search through the user's notes by content or title. Use when the user asks about " +
    "something they've written down, wants to find a specific note, or is looking for " +
    "information they've previously captured.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Text to search for in note titles and content" },
    },
    required: ["query"],
  },
  handler: search_notes,
};

// ─── get_tasks ────────────────────────────────────────────────────────────────

async function get_tasks(
  input: { filter?: "overdue" | "today" | "upcoming" | "all"; project_id?: string; completed?: boolean },
  { supabase, userId }: ToolContext
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  let q = supabase
    .from("tasks")
    .select("id, title, completed, due_date, priority, notes, project:projects(title), contact:contacts(first_name, last_name)")
    .eq("user_id", userId)
    .eq("completed", input.completed ?? false);

  if (input.project_id) q = q.eq("project_id", input.project_id);

  const { data } = await q.order("due_date", { ascending: true, nullsFirst: false }).limit(30);
  if (!data?.length) return "No tasks found.";

  type TaskRow = typeof data[number];
  let results: TaskRow[] = data;

  if (input.filter === "overdue")  results = data.filter((t) => t.due_date && t.due_date < today);
  if (input.filter === "today")    results = data.filter((t) => t.due_date === today);
  if (input.filter === "upcoming") results = data.filter((t) => t.due_date && t.due_date > today && t.due_date <= twoWeeks);

  if (!results.length) return `No ${input.filter ?? ""} tasks found.`;

  return JSON.stringify(results.map((t) => ({
    id:       t.id,
    title:    t.title,
    due_date: t.due_date,
    priority: t.priority,
    project:  (t.project as unknown as { title: string } | null)?.title,
    contact:  t.contact ? `${(t.contact as unknown as { first_name: string; last_name: string }).first_name} ${(t.contact as unknown as { first_name: string; last_name: string }).last_name}` : null,
  })));
}

export const getTasksTool: AshToolDefinition = {
  name: "get_tasks",
  description:
    "Get the user's tasks, optionally filtered by time range or project. " +
    "Use when the user asks about their to-do list, what's overdue, what's due today, " +
    "or asks about tasks linked to a specific project.",
  input_schema: {
    type: "object",
    properties: {
      filter:     { type: "string", enum: ["overdue", "today", "upcoming", "all"], description: "Time-based filter" },
      project_id: { type: "string", description: "Filter tasks by a specific project UUID" },
      completed:  { type: "boolean", description: "Get completed tasks (default: false = active tasks)" },
    },
    required: [],
  },
  handler: get_tasks,
};

// ─── get_outreach_summary ─────────────────────────────────────────────────────

async function get_outreach_summary(
  input: { pipeline_id?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const [{ data: pipelines }, { data: targets }, { data: followUps }] = await Promise.all([
    supabase
      .from("outreach_pipelines")
      .select("id, name, color")
      .eq("user_id", userId),
    supabase
      .from("outreach_targets")
      .select("id, name, stage_id, pipeline_id, last_touched_at, pipeline:outreach_pipelines(name), stage:pipeline_stages(name, meta_stage)")
      .eq("user_id", userId)
      .order("last_touched_at", { ascending: false })
      .limit(20),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, last_contacted_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .lt("last_contacted_at", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
      .limit(10),
  ]);

  const staleCount = (followUps ?? []).length;

  return JSON.stringify({
    pipelines:    (pipelines ?? []).map((p) => ({ id: p.id, name: p.name })),
    active_targets: (targets ?? []).length,
    targets_sample: (targets ?? []).slice(0, 8).map((t) => ({
      name:          t.name,
      pipeline:      (t.pipeline as unknown as { name: string } | null)?.name,
      stage:         (t.stage as unknown as { name: string; meta_stage: string } | null)?.name,
      last_touched:  t.last_touched_at,
    })),
    stale_contacts_needing_followup: staleCount,
  });
}

export const getOutreachSummaryTool: AshToolDefinition = {
  name: "get_outreach_summary",
  description:
    "Get a summary of the user's outreach pipelines, active targets, and contacts needing follow-up. " +
    "Use when the user asks about their sales pipeline, gallery outreach, follow-ups, or relationship management.",
  input_schema: {
    type: "object",
    properties: {
      pipeline_id: { type: "string", description: "Filter to a specific pipeline by UUID" },
    },
    required: [],
  },
  handler: get_outreach_summary,
};

// ─── get_opportunities ────────────────────────────────────────────────────────

async function get_opportunities(
  input: { category?: string; user_status?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];

  let q = supabase
    .from("opportunities")
    .select("id, title, event_type, category, start_date, end_date, location, about, user_status, ash_note, website_url")
    .or(`end_date.gte.${today},end_date.is.null,start_date.gte.${today}`)
    .neq("user_status", "hidden");

  if (input.category)    q = q.eq("category", input.category);
  if (input.user_status) q = q.eq("user_status", input.user_status);

  const { data } = await q.order("start_date", { ascending: true, nullsFirst: false }).limit(15);

  if (!data?.length) return "No upcoming opportunities found.";

  return JSON.stringify(data.map((o) => ({
    id:          o.id,
    title:       o.title,
    category:    o.category,
    event_type:  o.event_type,
    start_date:  o.start_date,
    end_date:    o.end_date,
    location:    o.location,
    user_status: o.user_status,
    about:       o.about?.slice(0, 150),
    website_url: o.website_url,
  })));
}

export const getOpportunitiesTool: AshToolDefinition = {
  name: "get_opportunities",
  description:
    "Get upcoming fairs, open calls, grants, residencies, and awards from the Presence module. " +
    "Use when the user asks about upcoming opportunities, art fairs, open calls, or grant deadlines.",
  input_schema: {
    type: "object",
    properties: {
      category:    { type: "string", enum: ["fair", "openCall", "grant", "award", "residency"], description: "Filter by opportunity type" },
      user_status: { type: "string", enum: ["saved", "attending", "exhibiting", "applied"],     description: "Filter by user's saved status" },
    },
    required: [],
  },
  handler: get_opportunities,
};

// ─── Export all read tools ─────────────────────────────────────────────────────

export const READ_TOOLS: AshToolDefinition[] = [
  searchProjectsTool,
  getProjectDetailsTool,
  searchContactsTool,
  getContactDetailsTool,
  getFinanceSummaryTool,
  searchNotesTool,
  getTasksTool,
  getOutreachSummaryTool,
  getOpportunitiesTool,
];
