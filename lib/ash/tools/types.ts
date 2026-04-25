import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Tool execution context ────────────────────────────────────────────────────

export interface ToolContext {
  supabase: SupabaseClient;
  userId:   string;
}

// ─── Tool result sent to the client (for UI feedback) ─────────────────────────

export interface ToolEvent {
  tool:    string;   // which tool ran
  status?: "running" | "done" | "error";
}

// ─── Anthropic tool definition shape ──────────────────────────────────────────

export interface AshToolDefinition {
  name:          string;
  description:   string;
  input_schema:  object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler:       (input: any, ctx: ToolContext) => Promise<string>;
}
