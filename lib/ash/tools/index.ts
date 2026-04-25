// ─── Ash Tool Registry ─────────────────────────────────────────────────────────
//
// Central place for all tool definitions. To add a new tool:
//   1. Implement handler in read.ts or write.ts
//   2. Add to READ_TOOLS or WRITE_TOOLS array in that file
//   3. Done — it's automatically included here and in the API route.

import { READ_TOOLS  } from "./read";
import { WRITE_TOOLS } from "./write";
import type { AshToolDefinition, ToolContext } from "./types";

export type { AshToolDefinition, ToolContext };

// All registered tools
export const ALL_TOOLS: AshToolDefinition[] = [...READ_TOOLS, ...WRITE_TOOLS];

// Anthropic-format tool definitions (passed to messages.create)
export const ANTHROPIC_TOOLS = ALL_TOOLS.map(({ name, description, input_schema }) => ({
  name,
  description,
  input_schema,
}));

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
