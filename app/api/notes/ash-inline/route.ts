import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt, noteContext } = await req.json() as { prompt: string; noteContext?: string };

  const systemPrompt = noteContext
    ? `You are an inline writing assistant embedded in a note. The note context is:\n\n${noteContext}\n\nWhen the user asks you to write something, respond with clean prose ready to be inserted directly into the note. No meta-commentary, no "Here is..." preamble, no markdown headers. Just the content.`
    : `You are an inline writing assistant. Respond with clean prose ready to be inserted directly into a note. No meta-commentary, no "Here is..." preamble, no markdown headers. Just the content.`;

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return Response.json({ text });
}
