// ─── Ash Tool Registry ─────────────────────────────────────────────────────────
//
// Central place for all tool definitions. To add a new tool:
//   1. Implement handler in read.ts or write.ts
//   2. Add to READ_TOOLS or WRITE_TOOLS array in that file
//   3. Done — it's automatically included here and in the API route.

import { READ_TOOLS  } from "./read";
import { WRITE_TOOLS } from "./write";
import { askUserTool } from "./interactive";
import type { AshToolDefinition, ToolContext } from "./types";

export type { AshToolDefinition, ToolContext };

// All registered tools. `ask_user` is a UI tool (no DB side effect) — the API
// route intercepts it to render an interactive card and end the turn.
export const ALL_TOOLS: AshToolDefinition[] = [...READ_TOOLS, ...WRITE_TOOLS, askUserTool];

// Anthropic-format tool definitions (passed to messages.create)
export const ANTHROPIC_TOOLS = ALL_TOOLS.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema,
}));

// ─── Capabilities manifest (Ash self-knowledge) ────────────────────────────────
//
// Generated from the live registry so Ash's sense of what it can do never drifts
// from what it actually can do. Injected into the system prompt. As tools are
// added, this updates automatically.

const firstSentence = (d: string) => {
  const s = d.split(/\.\s/)[0].trim();
  return s.endsWith(".") ? s.slice(0, -1) : s;
};

export function buildCapabilitiesManifest(): string {
  const reads  = READ_TOOLS.map((t)  => `- **${t.name}** — ${firstSentence(t.description)}`).join("\n");
  const writes = WRITE_TOOLS.map((t) => `- **${t.name}** — ${firstSentence(t.description)}`).join("\n");
  return `## What you can actually do

These are your real capabilities in Perennial, via your tools. When a user's request maps to one of these, **do it** — don't just describe how they could. When it doesn't, say plainly that you can't do that directly yet, then either point them to the right module or capture it (e.g. as a note or task) so it isn't lost. Never imply you took an action you didn't.

**Look things up (read):**
${reads}

**Take action — create and update the user's records (write):**
${writes}

**Ask with structure:**
- **ask_user** — show tappable multiple-choice and/or short/long answer fields inline in chat instead of asking in prose, then wait for the reply. Use it to keep setup and onboarding light.

You also have web search for external facts. You cannot send email, move money, or take actions outside this list — be honest about that boundary.`;
}

// Execute a tool by name
export async function executeTool(
  name:  string,
  input: Record<string, unknown>,
  ctx:   ToolContext
): Promise<string> {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) return `Unknown tool: ${name}`;

  try {
    return await tool.handler(input, ctx);
  } catch (err) {
    console.error(`[Ash] Tool ${name} error:`, err);
    return `Tool ${name} encountered an error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
