// ─── Ash background research ─────────────────────────────────────────────────
//
// Researches a specific user's niche (their medium, price point, region, channels)
// via web search, and writes the findings into their PRIVATE knowledge-base rows
// (category 'research', user_id set). Retrieved alongside the global frameworks so
// Ash advises like a local expert on *their* corner of the field.
//
// Writes go through a service-role client (knowledge_base writes are service-role
// only); the caller must auth-gate the user first.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./embeddings";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ResearchSignals {
  studioName?:      string | null;
  practiceTypes?:   string[];
  workTypes?:       string[];
  sellingChannels?: string[];
  location?:        string | null;
  priceRange?:      string | null;
  yearsInPractice?: string | null;
  bio?:             string | null;
}

function describe(sig: ResearchSignals): string {
  const parts: string[] = [];
  if (sig.practiceTypes?.length)   parts.push(`practice: ${sig.practiceTypes.join(", ")}`);
  if (sig.workTypes?.length)       parts.push(`work: ${sig.workTypes.join(", ")}`);
  if (sig.sellingChannels?.length) parts.push(`sells via: ${sig.sellingChannels.join(", ")}`);
  if (sig.priceRange)              parts.push(`price point: ${sig.priceRange}`);
  if (sig.location)                parts.push(`based in: ${sig.location}`);
  if (sig.yearsInPractice)         parts.push(`stage: ${sig.yearsInPractice}`);
  if (sig.bio)                     parts.push(`about: ${sig.bio}`);
  return parts.join("; ") || "an independent creative practitioner";
}

const SYSTEM = `You are a research analyst building a private brief on ONE creative practitioner's specific corner of the market, so an assistant can advise them like a local expert. Use web search to ground findings in current, specific reality — the galleries, fairs, publications, market norms, and opportunities that actually fit THIS practitioner's medium, price point, and region. Avoid generic advice; be specific to their niche and cite what you find.

Return ONLY a JSON array of 5-8 findings, each a durable, reusable insight:
[{"title":"<short label>","content":"<2-4 sentences of specific, sourced insight>"}]`;

export async function runBackgroundResearch(
  service: SupabaseClient,
  userId:  string,
  signals: ResearchSignals,
): Promise<{ inserted: number }> {
  const who = describe(signals);

  // Agentic call with server-side web search; handle pause_turn continuations.
  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Research the specific market landscape for this practitioner and return the JSON findings.\n\nPractitioner: ${who}` },
  ];
  let finalText = "";
  for (let i = 0; i < 4; i++) {
    const res = await anthropic.messages.create({
      model:      "claude-sonnet-5",
      max_tokens: 8192,
      system:     SYSTEM,
      tools:      [{ type: "web_search_20260209", name: "web_search", max_uses: 5 } as unknown as Anthropic.Tool],
      messages,
    });
    finalText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (res.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: res.content }];
  }

  let findings: { title: string; content: string }[] = [];
  try {
    const start = finalText.indexOf("[");
    const end   = finalText.lastIndexOf("]");
    if (start >= 0 && end > start) findings = JSON.parse(finalText.slice(start, end + 1));
  } catch {
    findings = [];
  }
  findings = findings.filter((f) => f?.title && f?.content).slice(0, 8);
  if (!findings.length) return { inserted: 0 };

  const vectors = await embed(findings.map((f) => `${f.title}\n\n${f.content}`), "document");

  // Replace any prior research for this user so refreshes don't accumulate stale rows.
  await service.from("knowledge_base").delete().eq("user_id", userId).eq("category", "research");

  const rows = findings.map((f, i) => ({
    user_id:         userId,
    chunk_id:        `research:${userId}:${i}`,
    category:        "research",
    title:           f.title,
    source:          "background-research",
    content:         f.content,
    context_summary: `Background research on this user's niche: ${f.title}`,
    embedding:       vectors[i],
  }));

  const { error } = await service.from("knowledge_base").upsert(rows, { onConflict: "chunk_id" });
  return { inserted: error ? 0 : rows.length };
}
