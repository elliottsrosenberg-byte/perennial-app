// ─── POST /api/ash/learn ─────────────────────────────────────────────────────
//
// Fire-and-forget from the client after each Ash turn. Reads the last few
// messages of the conversation and distills any durable user preferences into
// ash_preferences. Never surfaces errors to the user — preference learning is
// a background nicety, not part of the turn.

import { createClient } from "@/lib/supabase/server";
import { extractAndSavePreferences } from "@/lib/ash/preferences";

export const runtime     = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { conversationId } = (await req.json()) as { conversationId?: string };
    if (!conversationId) return new Response("conversationId required", { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    const { data: msgs } = await supabase
      .from("ash_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6);

    const recent = (msgs ?? []).reverse() as { role: string; content: string }[];
    if (!recent.length) return Response.json({ ok: true, added: 0, reinforced: 0 });

    const transcript = recent
      .map((m) => `${m.role === "user" ? "User" : "Ash"}: ${m.content}`)
      .join("\n");

    const result = await extractAndSavePreferences(supabase, user.id, transcript);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Ash learn] error:", err);
    return Response.json({ ok: false }, { status: 200 });
  }
}
