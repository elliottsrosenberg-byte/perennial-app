import type { AshToolDefinition, ToolContext } from "./types";

// ─── create_note ──────────────────────────────────────────────────────────────

async function create_note(
  input: { title?: string; content: string; project_id?: string; contact_id?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id:    userId,
      title:      input.title ?? null,
      content:    input.content,
      project_id: input.project_id ?? null,
      contact_id: input.contact_id ?? null,
      pinned:     false,
    })
    .select("id, title")
    .single();

  if (error) return `Failed to create note: ${error.message}`;
  return `Note created: "${data.title || "Untitled"}" (id: ${data.id})`;
}

export const createNoteTool: AshToolDefinition = {
  name: "create_note",
  description:
    "Create a new note for the user. Use when the user asks you to capture, write down, " +
    "or save something. Can optionally link to a project or contact.",
  input_schema: {
    type: "object",
    properties: {
      title:      { type: "string", description: "Optional note title" },
      content:    { type: "string", description: "The note body content" },
      project_id: { type: "string", description: "Optional project UUID to link this note to" },
      contact_id: { type: "string", description: "Optional contact UUID to link this note to" },
    },
    required: ["content"],
  },
  handler: create_note,
};

// ─── create_reminder ──────────────────────────────────────────────────────────

async function create_reminder(
  input: { title: string; due_date?: string; description?: string; project_id?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { data, error } = await supabase
    .from("reminders")
    .insert({
      user_id:     userId,
      title:       input.title,
      description: input.description ?? null,
      due_date:    input.due_date ?? null,
      project_id:  input.project_id ?? null,
      completed:   false,
    })
    .select("id, title, due_date")
    .single();

  if (error) return `Failed to create reminder: ${error.message}`;
  const when = data.due_date ? ` due ${data.due_date}` : "";
  return `Reminder created: "${data.title}"${when} (id: ${data.id})`;
}

export const createReminderTool: AshToolDefinition = {
  name: "create_reminder",
  description:
    "Create a new reminder for the user with an optional due date. Use when the user asks " +
    "you to remind them about something, set a deadline alert, or add a follow-up task.",
  input_schema: {
    type: "object",
    properties: {
      title:       { type: "string", description: "What to be reminded about" },
      due_date:    { type: "string", description: "Due date in YYYY-MM-DD or ISO datetime format" },
      description: { type: "string", description: "Optional additional detail" },
      project_id:  { type: "string", description: "Optional project to link this reminder to" },
    },
    required: ["title"],
  },
  handler: create_reminder,
};

// ─── create_project ───────────────────────────────────────────────────────────

async function create_project(
  input: { title: string; type?: string; priority?: string; due_date?: string; description?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id:     userId,
      title:       input.title,
      type:        input.type ?? null,
      priority:    input.priority ?? "medium",
      status:      "planning",
      due_date:    input.due_date ?? null,
      description: input.description ?? null,
      billed_hours: 0,
    })
    .select("id, title")
    .single();

  if (error) return `Failed to create project: ${error.message}`;
  return `Project created: "${data.title}" with status Planning (id: ${data.id}). It will appear in the Projects module.`;
}

export const createProjectTool: AshToolDefinition = {
  name: "create_project",
  description:
    "Create a new project. Use only when the user explicitly asks to create a project and " +
    "has provided at minimum a title. Always confirm the details with the user before calling this.",
  input_schema: {
    type: "object",
    properties: {
      title:       { type: "string", description: "Project title" },
      type:        { type: "string", enum: ["furniture", "sculpture", "painting", "client_project"], description: "Project type" },
      priority:    { type: "string", enum: ["high", "medium", "low"] },
      due_date:    { type: "string", description: "Due date in YYYY-MM-DD format" },
      description: { type: "string" },
    },
    required: ["title"],
  },
  handler: create_project,
};

// ─── update_project_status ────────────────────────────────────────────────────

async function update_project_status(
  input: { project_id: string; status: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { error } = await supabase
    .from("projects")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.project_id)
    .eq("user_id", userId);

  if (error) return `Failed to update project status: ${error.message}`;
  return `Project status updated to "${input.status}". The change will reflect in the Projects module.`;
}

export const updateProjectStatusTool: AshToolDefinition = {
  name: "update_project_status",
  description: "Update the status of a project. Use when the user says a project is complete, on hold, back in progress, etc.",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "The UUID of the project to update" },
      status:     { type: "string", enum: ["in_progress", "planning", "on_hold", "complete", "cut"] },
    },
    required: ["project_id", "status"],
  },
  handler: update_project_status,
};

// ─── add_task ─────────────────────────────────────────────────────────────────

async function add_task(
  input: { title: string; project_id?: string; contact_id?: string; due_date?: string; priority?: string; notes?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id:    userId,
      title:      input.title,
      project_id: input.project_id ?? null,
      contact_id: input.contact_id ?? null,
      due_date:   input.due_date ?? null,
      priority:   input.priority ?? null,
      notes:      input.notes ?? null,
      completed:  false,
    })
    .select("id, title")
    .single();

  if (error) return `Failed to create task: ${error.message}`;
  const ctx = input.project_id ? " linked to project" : input.contact_id ? " linked to contact" : "";
  return `Task created: "${data.title}"${ctx} (id: ${data.id}). It will appear in the Tasks module.`;
}

export const addTaskTool: AshToolDefinition = {
  name: "add_task",
  description:
    "Create a task. Can be standalone or linked to a project or contact. " +
    "Use when the user asks to add an action item, to-do, or follow-up step.",
  input_schema: {
    type: "object",
    properties: {
      title:      { type: "string", description: "Task description" },
      project_id: { type: "string", description: "Optional project UUID to link this task to" },
      contact_id: { type: "string", description: "Optional contact UUID to link this task to" },
      due_date:   { type: "string", description: "Due date in YYYY-MM-DD format" },
      priority:   { type: "string", enum: ["high", "medium", "low"] },
      notes:      { type: "string", description: "Additional notes or context" },
    },
    required: ["title"],
  },
  handler: add_task,
};

// ─── create_contact ───────────────────────────────────────────────────────────

async function create_contact(
  input: { first_name: string; last_name: string; email?: string; phone?: string; company?: string; tags?: string[]; is_lead?: boolean },
  { supabase, userId }: ToolContext
): Promise<string> {
  let company_id: string | null = null;

  if (input.company) {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", input.company)
      .maybeSingle();

    if (existing) {
      company_id = existing.id;
    } else {
      const { data: newCo } = await supabase
        .from("companies")
        .insert({ user_id: userId, name: input.company })
        .select("id")
        .single();
      if (newCo) company_id = newCo.id;
    }
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      user_id:    userId,
      first_name: input.first_name,
      last_name:  input.last_name,
      email:      input.email ?? null,
      phone:      input.phone ?? null,
      company_id: company_id,
      tags:       input.tags ?? [],
      status:     "active",
      is_lead:    input.is_lead ?? false,
      archived:   false,
    })
    .select("id, first_name, last_name")
    .single();

  if (error) return `Failed to create contact: ${error.message}`;
  return `Contact created: "${data.first_name} ${data.last_name}"${input.company ? ` at ${input.company}` : ""} (id: ${data.id}). They will appear in the Contacts module.`;
}

export const createContactTool: AshToolDefinition = {
  name: "create_contact",
  description:
    "Create a new contact. Use when the user asks to add someone to their network, " +
    "address book, or contacts list. Optionally creates a company record too.",
  input_schema: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name:  { type: "string" },
      email:      { type: "string" },
      phone:      { type: "string" },
      company:    { type: "string", description: "Company or gallery name — will match or create a company record" },
      tags:       { type: "array", items: { type: "string" }, description: "e.g. ['gallery', 'press', 'client']" },
      is_lead:    { type: "boolean", description: "Mark as a lead instead of active contact" },
    },
    required: ["first_name", "last_name"],
  },
  handler: create_contact,
};

// ─── log_contact_activity ─────────────────────────────────────────────────────

async function log_contact_activity(
  input: { contact_id: string; type: string; content: string; occurred_at?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { error } = await supabase
    .from("contact_activities")
    .insert({
      user_id:     userId,
      contact_id:  input.contact_id,
      type:        input.type,
      content:     input.content,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
    });

  if (error) return `Failed to log activity: ${error.message}`;

  await supabase
    .from("contacts")
    .update({ last_contacted_at: input.occurred_at ?? new Date().toISOString() })
    .eq("id", input.contact_id)
    .eq("user_id", userId);

  return `Activity logged: ${input.type} with contact ${input.contact_id}. Their last_contacted_at date has been updated.`;
}

export const logContactActivityTool: AshToolDefinition = {
  name: "log_contact_activity",
  description:
    "Log an interaction with a contact — email, call, meeting, or note. " +
    "Use after the user describes a recent interaction. Also updates the contact's last_contacted_at date.",
  input_schema: {
    type: "object",
    properties: {
      contact_id:  { type: "string", description: "UUID of the contact" },
      type:        { type: "string", enum: ["email", "call", "meeting", "note"] },
      content:     { type: "string", description: "What happened or was discussed" },
      occurred_at: { type: "string", description: "ISO datetime of when the interaction happened (defaults to now)" },
    },
    required: ["contact_id", "type", "content"],
  },
  handler: log_contact_activity,
};

// ─── log_time ─────────────────────────────────────────────────────────────────

async function log_time(
  input: { project_id?: string; duration_minutes: number; description?: string; billable?: boolean; logged_at?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      user_id:          userId,
      project_id:       input.project_id ?? null,
      description:      input.description ?? "",
      duration_minutes: input.duration_minutes,
      billable:         input.billable ?? true,
      logged_at:        input.logged_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return `Failed to log time: ${error.message}`;
  const hrs = Math.round((input.duration_minutes / 60) * 10) / 10;
  return `Time logged: ${hrs}h${input.billable !== false ? " (billable)" : " (non-billable)"}${input.project_id ? " on project" : ""}. Entry id: ${data.id}. It will appear in Finance → Time.`;
}

export const logTimeTool: AshToolDefinition = {
  name: "log_time",
  description:
    "Log time worked on a project. Use when the user tells you how long they worked on something. " +
    "Defaults to billable. Duration must be in minutes.",
  input_schema: {
    type: "object",
    properties: {
      project_id:       { type: "string", description: "Optional project UUID" },
      duration_minutes: { type: "number", description: "Time worked in minutes (e.g. 90 for 1.5h)" },
      description:      { type: "string", description: "What was worked on" },
      billable:         { type: "boolean", description: "Whether this time is billable (default: true)" },
      logged_at:        { type: "string", description: "ISO datetime if logging for a past date" },
    },
    required: ["duration_minutes"],
  },
  handler: log_time,
};

// ─── Export all write tools ────────────────────────────────────────────────────

export const WRITE_TOOLS: AshToolDefinition[] = [
  createNoteTool,
  createReminderTool,
  createProjectTool,
  updateProjectStatusTool,
  addTaskTool,
  createContactTool,
  logContactActivityTool,
  logTimeTool,
];
