import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, content } = await req.json() as { title: string; content: string };

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Extract clear, actionable tasks from this note. Return ONLY a JSON array of task title strings — no commentary, no explanation, no markdown. Max 8 tasks. Be specific and action-oriented.

Note title: ${title || "Untitled"}
Note content: ${content}

Example response: ["Follow up with gallery by Friday", "Finish wax finish test on prototype"]`,
    }],
  });

  try {
    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
    const json = text.startsWith("[") ? text : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const tasks = JSON.parse(json) as string[];
    return Response.json({ tasks: Array.isArray(tasks) ? tasks : [] });
  } catch {
    return Response.json({ tasks: [] });
  }
}
