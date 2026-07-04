// ─── Ash preference memory ───────────────────────────────────────────────────
//
// Loads the per-user standing preferences Ash injects into every turn, and
// extracts new ones from a conversation. Kept separate from the vector knowledge
// base because preferences are always-on context, not similarity-retrieved.

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export interface UserPreference {
  id:      string;
  kind:    string;
  content: string;
  weight:  number;
}

const KINDS = ["preference", "belief", "concern", "value", "format"];

/** Top active preferences for the user, strongest (most-reinforced) first. */
export async function loadPreferences(
  supabase: SupabaseClient,
  userId:   string,
): Promise<UserPreference[]> {
  const { data } = await supabase
    .from("ash_preferences")
    .select("id, kind, content, weight")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("weight",       { ascending: false })
    .order("last_seen_at", { ascending: false })
    .limit(15);
  return (data ?? []) as UserPreference[];
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTOR_SYSTEM = `You maintain a durable profile of how a specific user likes to work with an assistant — their standing preferences, beliefs, concerns, and values. From the recent conversation, identify ONLY durable, reusable signals about how the user wants the assistant to behave: formatting, tone, approach, values, recurring concerns. Ignore one-off task content, facts about their business, and anything transient.

You are given the current known preferences. Decide which existing ones this conversation REINFORCES, and which NEW ones to add. Be conservative — most turns add nothing. Never duplicate an existing preference.

Return ONLY JSON, no prose:
{"reinforce":["<id>", ...],"new":[{"kind":"preference|belief|concern|value|format","content":"<concise standing instruction>"}]}`;

/**
 * Extract durable preferences from a transcript and persist them: reinforcing
 * existing ones (bumping weight) and inserting new ones. Best-effort — any
 * failure returns zero counts rather than throwing (callers run this async).
 */
export async function extractAndSavePreferences(
  supabase:   SupabaseClient,
  userId:     string,
  transcript: string,
): Promise<{ added: number; reinforced: number }> {
  const existing = await loadPreferences(supabase, userId);
  const known = existing.length
    ? existing.map((p) => `- id=${p.id} (${p.kind}): ${p.content}`).join("\n")
    : "(none yet)";

  let parsed: { reinforce?: string[]; new?: { kind: string; content: string }[] } = {};
  try {
    const msg = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 400,
      system:     EXTRACTOR_SYSTEM,
      messages: [{
        role:    "user",
        content: `Current known preferences:\n${known}\n\nRecent conversation:\n${transcript}`,
      }],
    });
    const textBlock = msg.content.find((b) => b.type === "text");
    const raw = textBlock ? textBlock.text : "";
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { added: 0, reinforced: 0 };
  }

  const reinforceIds = Array.isArray(parsed.reinforce)
    ? parsed.reinforce.filter((id) => existing.some((e) => e.id === id))
    : [];
  const additions = Array.isArray(parsed.new) ? parsed.new.slice(0, 3) : [];

  let reinforced = 0, added = 0;
  const now = new Date().toISOString();

  for (const id of reinforceIds) {
    const cur = existing.find((e) => e.id === id);
    const { error } = await supabase
      .from("ash_preferences")
      .update({ weight: (cur?.weight ?? 1) + 1, last_seen_at: now, updated_at: now })
      .eq("id", id)
      .eq("user_id", userId);
    if (!error) reinforced++;
  }

  for (const p of additions) {
    if (!p?.content?.trim()) continue;
    const kind = KINDS.includes(p.kind) ? p.kind : "preference";
    const { error } = await supabase
      .from("ash_preferences")
      .insert({ user_id: userId, kind, content: p.content.trim() });
    if (!error) added++;
  }

  return { added, reinforced };
}
