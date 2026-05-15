import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { ANTHROPIC_TOOLS, executeTool } from "@/lib/ash/tools";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

interface Surface {
  /** Where the prompt was triggered. Drives auto-linking. */
  type:           "canvas-contact" | "canvas-project" | "note";
  contact_id?:    string;
  contact_name?:  string;
  project_id?:    string;
  project_title?: string;
}

interface ActionResult {
  /** Short human-friendly description of what Ash did. */
  summary:     string;
  /** Optional deep-link the user can follow to inspect the result. */
  viewHref?:   string;
  viewLabel?:  string;
}

interface Body {
  prompt:       string;
  noteContext?: string;
  surface?:     Surface;
}

// ─── Tool-name → "view" routing ───────────────────────────────────────────────
//
// After Ash runs a write tool, we surface a "View →" link in the inline
// popover so the user can jump to the thing that was just created. Each
// module's client reads its own deep-link query param on mount and opens
// the matching row (see ProjectsClient, ContactsClient, NotesClient,
// TasksClient).

interface ViewSpec {
  label: string;
  /** Builds the deep-link href given the created-entity id (when present)
   *  and the tool's input object (used for fallbacks like contact_id on
   *  log_contact_activity, which doesn't return an id of its own). */
  href:  (id: string | null, input: Record<string, unknown>) => string;
}

const VIEW_FOR_TOOL: Record<string, ViewSpec> = {
  add_task:        { label: "View task",     href: (id) => id ? `/tasks?taskId=${id}`         : "/tasks" },
  create_note:     { label: "View note",     href: (id) => id ? `/notes?noteId=${id}`         : "/notes" },
  create_reminder: { label: "View reminder", href: (id) => id ? `/calendar?reminderId=${id}`  : "/calendar" },
  create_project:  { label: "View project",  href: (id) => id ? `/projects?projectId=${id}`   : "/projects" },
  create_contact:  { label: "View contact",  href: (id) => id ? `/contacts?contactId=${id}`   : "/contacts" },
  log_time:        { label: "View time",     href: ()   => "/finance?tab=time" },
  log_contact_activity: {
    label: "View activity",
    href: (_id, input) => {
      const cid = typeof input.contact_id === "string" ? input.contact_id : null;
      return cid ? `/contacts?contactId=${cid}` : "/contacts";
    },
  },
};

const WRITE_TOOL_NAMES = new Set(Object.keys(VIEW_FOR_TOOL));

/** Extracts the entity UUID a write-tool handler embedded in its result
 *  string, e.g. `Task created: "X" (id: <uuid>). It will appear...` or
 *  `Time logged: ... Entry id: <uuid>...`. Returns null when no id is present
 *  (log_contact_activity doesn't surface one). */
function extractToolId(result: string): string | null {
  const match = result.match(/(?:\(id:|Entry id:)\s*([0-9a-f-]+)/i);
  return match ? match[1] : null;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(surface: Surface | undefined, noteContext: string | undefined): string {
  const today = new Date();
  const todayIso = today.toISOString().split("T")[0];
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });

  const surfaceLine =
    surface?.type === "canvas-contact" && surface.contact_id
      ? `You are inline inside the canvas of a CONTACT — ${surface.contact_name ?? "this person"} (contact_id: ${surface.contact_id}). When the user asks for a task, reminder, note, or logged activity that's about this person, link it to this contact_id by default. Do not ask which person they mean.`
      : surface?.type === "canvas-project" && surface.project_id
      ? `You are inline inside the canvas of a PROJECT — "${surface.project_title ?? "this project"}" (project_id: ${surface.project_id}). When the user asks for a task, note, or reminder about this project, link it to this project_id by default. Do not ask which project they mean.`
      : `You are inline inside a note. There is no specific contact or project in context — create unlinked items unless the user names one.`;

  return `You are Ash, embedded as an inline assistant inside a Perennial canvas. The user just pressed Space on an empty line and is typing a quick prompt.

${surfaceLine}

Today is ${dayName}, ${todayIso}.

You have two response modes. Pick the right one without asking:

1) **ACTION MODE** — the user wants something CREATED, SAVED, or LOGGED ("create a reminder", "make a task", "add a note", "log this call", "schedule…", "remember to…"). In this mode you MUST:
   - Call the appropriate write tool (add_task, create_reminder, create_note, log_contact_activity, log_time, create_contact, create_project).
   - Auto-link to the current contact_id / project_id when you have one.
   - Parse natural-language dates relative to today (${todayIso}, ${dayName}). "Friday" means this coming Friday; "next week" means next Monday; "tomorrow" means ${new Date(today.getTime() + 86400000).toISOString().split("T")[0]}.
   - Prefer **add_task** for action items linked to a contact or project. Prefer **create_reminder** for date-anchored prompts not tied to a contact (project_id is allowed).
   - Do not emit text content along with the tool call — when you've called a tool, your final response can be empty or a single short sentence confirming what was done. The UI handles confirmation.

2) **CONTENT MODE** — the user wants PROSE to insert into the document ("write a paragraph about…", "draft a few lines…", "summarize this"). In this mode:
   - You MAY first call read tools (search_notes, get_contact_details, get_tasks, etc.) to gather grounding.
   - But your final response MUST be clean prose ready to drop directly into the document — no "Here is...", no markdown headers, no meta-commentary.
   - Do not call create_note or any write tool in content mode unless the user explicitly says "save as a note" / "make this a note" — in which case switch to ACTION MODE and call create_note with the prose as content (plus the current contact_id/project_id).

If the user asks you to "write up everything you know about X as a note" or similar — that's BOTH: gather data with the read tools AND the **web_search** tool (you have it — use it for external facts about real people, galleries, fairs, magazines, companies), then call create_note with a strong, grounded summary as the content, linked to the current contact_id/project_id when relevant. Don't also emit the same prose as text. Cite specifics from web search where useful but keep the note clean prose, not bracketed citations.

You can use **web_search** any time the user asks for external information — about a contact, a gallery, a fair, a company, market context, pricing benchmarks, etc. Don't over-search; cap yourself at the most useful 1–2 queries.

${noteContext ? `\nThe surrounding canvas text the user has open right now (truncated):\n${noteContext}\n` : ""}
Stay concrete. Don't ask clarifying questions for simple action requests — just do it. If the request is genuinely ambiguous (e.g. multiple people named "Adele"), ask one short question.`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt, noteContext, surface } = await req.json() as Body;
  const system = buildSystemPrompt(surface, noteContext);

  let messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  // Anthropic's server-side web search lets Ash fetch external info about a
  // person, gallery, fair, or company. Added alongside our local Supabase
  // tools so prompts like "what does the web say about Adele Naudé" or
  // "summarize this gallery's program for me" work without us hosting a
  // search backend. max_uses is bounded for cost control.
  const tools = [
    ...(ANTHROPIC_TOOLS as Anthropic.Tool[]),
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 3,
    } as unknown as Anthropic.Tool,
  ];

  const toolsRun: { name: string; result: string; input: Record<string, unknown> }[] = [];
  let finalText = "";

  // Cap at 4 turns — typically the user request resolves in 1–2 (gather data,
  // optionally call a write tool, return). Web search uses count toward the
  // 4-turn budget since each search → response cycle is one turn.
  for (let turn = 0; turn < 4; turn++) {
    const msg = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      tools,
      messages,
    });

    // Collect any text blocks (used as fallback if no write tool was called).
    finalText = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    if (msg.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      const result = await executeTool(block.name, input, { supabase, userId: user.id });
      toolsRun.push({ name: block.name, result, input });
      toolResults.push({
        type:        "tool_result",
        tool_use_id: block.id,
        content:     result,
      });
    }

    messages = [
      ...messages,
      { role: "assistant", content: msg.content },
      { role: "user",      content: toolResults },
    ];
  }

  // Did any write tool succeed? If so, return an action result instead of
  // prose-to-insert. Pick the last successful write tool as the canonical
  // "thing the user asked for."
  const lastWrite = [...toolsRun]
    .reverse()
    .find((t) => WRITE_TOOL_NAMES.has(t.name) && !t.result.startsWith("Failed"));

  if (lastWrite) {
    const view = VIEW_FOR_TOOL[lastWrite.name];
    const id = extractToolId(lastWrite.result);
    // Prefer Ash's own short confirmation when it's tight; otherwise pull the
    // first line out of the tool result (e.g. "Task created: \"Reach out…\"").
    const summary =
      (finalText.trim() && finalText.trim().length < 120)
        ? finalText.trim().replace(/\s+/g, " ")
        : lastWrite.result.split(/\(id:/)[0].trim().replace(/\s+$/, "");

    const action: ActionResult = {
      summary,
      viewHref:  view?.href(id, lastWrite.input),
      viewLabel: view?.label,
    };
    return Response.json({ action, toolsRun: toolsRun.map((t) => t.name) });
  }

  // No write tool — return prose to insert.
  return Response.json({ text: finalText, toolsRun: toolsRun.map((t) => t.name) });
}
