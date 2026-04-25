// ─── Write Tools ───────────────────────────────────────────────────────────────
//
// Infrastructure and type definitions are complete. Implementations are added
// per-module during the UI consistency pass. Each TODO marks where the handler
// body goes — everything else (registry, loop, streaming) is already wired.
//
// Pattern for activating a tool:
//   1. Replace the TODO stub body with the Supabase insert/update
//   2. Return a concise confirmation string Claude can summarize
//   3. No other changes needed — the tool is live immediately.

import type { AshToolDefinition, ToolContext } from "./types";

// ─── create_note ──────────────────────────────────────────────────────────────

async function create_note(
  input: { title?: string; content: string; project_id?: string },
  { supabase, userId }: ToolContext
): Promise<string> {
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id:    userId,
      title:      input.title ?? null,
      content:    input.content,
      project_id: input.project_id ?? null,
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
    "or save something. Can optionally link to a project.",
  input_schema: {
    type: "object",
    properties: {
      title:      { type: "string", description: "Optional note title" },
      content:    { type: "string", description: "The note body content" },
      project_id: { type: "string", description: "Optional project UUID to link this note to" },
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

// ─── create_project — TODO ────────────────────────────────────────────────────

async function create_project(
  input: { title: string; type?: string; priority?: string; due_date?: string; description?: string },
  _ctx: ToolContext
): Promise<string> {
  // TODO (Projects module pass): insert into projects table
  // const { data, error } = await supabase.from("projects").insert({ ... }).select("id").single();
  return `I can see you want to create a project called "${input.title}" — this action will be active after the Projects module update. Please create it manually in Projects for now.`;
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

// ─── update_project_status — TODO ─────────────────────────────────────────────

async function update_project_status(
  input: { project_id: string; status: string },
  _ctx: ToolContext
): Promise<string> {
  // TODO (Projects module pass): supabase.from("projects").update({ status }).eq("id", project_id)
  return `Status update for project ${input.project_id} to "${input.status}" will be active after the Projects module update.`;
}

export const updateProjectStatusTool: AshToolDefinition = {
  name: "update_project_status",
  description: "Update the status of a project. Use when the user says a project is complete, on hold, etc.",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      status:     { type: "string", enum: ["in_progress", "planning", "on_hold", "complete"] },
    },
    required: ["project_id", "status"],
  },
  handler: update_project_status,
};

// ─── add_task — TODO ──────────────────────────────────────────────────────────

async function add_task(
  input: { project_id: string; title: string },
  _ctx: ToolContext
): Promise<string> {
  // TODO (Projects module pass): insert into tasks table
  return `Task "${input.title}" will be added to project ${input.project_id} after the Projects module update.`;
}

export const addTaskTool: AshToolDefinition = {
  name: "add_task",
  description: "Add a task to a project. Use when the user asks to add or track a specific action item within a project.",
  input_schema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      title:      { type: "string", description: "Task description" },
    },
    required: ["project_id", "title"],
  },
  handler: add_task,
};

// ─── create_contact — TODO ────────────────────────────────────────────────────

async function create_contact(
  input: { first_name: string; last_name: string; email?: string; company?: string; tags?: string[]; status?: string },
  _ctx: ToolContext
): Promise<string> {
  // TODO (Contacts module pass): insert into contacts (and optionally companies) tables
  return `Contact "${input.first_name} ${input.last_name}" will be created after the Contacts module update.`;
}

export const createContactTool: AshToolDefinition = {
  name: "create_contact",
  description: "Create a new contact. Use when the user asks to add someone to their network or address book.",
  input_schema: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name:  { type: "string" },
      email:      { type: "string" },
      company:    { type: "string" },
      tags:       { type: "array", items: { type: "string" }, description: "e.g. ['gallery', 'press']" },
      status:     { type: "string", enum: ["active", "lead", "inactive"] },
    },
    required: ["first_name", "last_name"],
  },
  handler: create_contact,
};

// ─── log_contact_activity — TODO ──────────────────────────────────────────────

async function log_contact_activity(
  input: { contact_id: string; type: string; content: string },
  _ctx: ToolContext
): Promise<string> {
  // TODO (Contacts module pass): insert into contact_activities table
  return `Activity note for contact ${input.contact_id} will be logged after the Contacts module update.`;
}

export const logContactActivityTool: AshToolDefinition = {
  name: "log_contact_activity",
  description: "Log an interaction with a contact — email, call, meeting, or note. Use after the user describes a recent interaction.",
  input_schema: {
    type: "object",
    properties: {
      contact_id: { type: "string" },
      type:       { type: "string", enum: ["email", "call", "meeting", "note"] },
      content:    { type: "string", description: "What happened or was discussed" },
    },
    required: ["contact_id", "type", "content"],
  },
  handler: log_contact_activity,
};

// ─── log_time — TODO ──────────────────────────────────────────────────────────

async function log_time(
  input: { project_id?: string; duration_minutes: number; description?: string; billable?: boolean },
  _ctx: ToolContext
): Promise<string> {
  // TODO (Finance module pass): insert into time_entries table
  const hrs = Math.round((input.duration_minutes / 60) * 10) / 10;
  return `${hrs} hours will be logged after the Finance module update.`;
}

export const logTimeTool: AshToolDefinition = {
  name: "log_time",
  description: "Log time worked on a project. Use when the user tells you how long they worked on something.",
  input_schema: {
    type: "object",
    properties: {
      project_id:       { type: "string" },
      duration_minutes: { type: "number", description: "Time worked in minutes" },
      description:      { type: "string", description: "What was worked on" },
      billable:         { type: "boolean" },
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
