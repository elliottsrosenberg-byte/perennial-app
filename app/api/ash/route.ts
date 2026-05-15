import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildAshContext } from "@/lib/ash/context";
import { STATIC_SYSTEM_PROMPT, buildDynamicContext } from "@/lib/ash/system-prompt";
import { ANTHROPIC_TOOLS, executeTool } from "@/lib/ash/tools";

export const runtime    = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── POST /api/ash ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { message, conversationId, module } = await req.json() as {
      message:        string;
      conversationId: string | null;
      module:         string;
    };

    if (!message?.trim()) return new Response("Message required", { status: 400 });

    // ── Auth ────────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });

    // ── Context + history (parallel) ────────────────────────────────────────────
    const [context, historyResult, convResult] = await Promise.all([
      buildAshContext(user.id, module, user.email ?? null, supabase),
      conversationId
        ? supabase.from("ash_messages").select("role, content")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true }).limit(24)
        : Promise.resolve({ data: [] }),
      conversationId
        ? Promise.resolve({ data: { id: conversationId } })
        : supabase.from("ash_conversations").insert({ user_id: user.id, module }).select("id").single(),
    ]);

    const activeConversationId = convResult.data?.id as string | null;
    const history = (historyResult.data ?? []) as { role: string; content: string }[];

    // Save user message
    if (activeConversationId) {
      await supabase.from("ash_messages").insert({
        conversation_id: activeConversationId,
        user_id:         user.id,
        role:            "user",
        content:         message,
      });
    }

    // ── System prompt with prompt caching ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const systemBlocks: any[] = [
      { type: "text", text: STATIC_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: buildDynamicContext(context) },
    ];

    // ── Agentic loop — stream text, handle tool calls, continue ─────────────────
    let messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: message },
    ];

    let fullAssistantResponse = "";
    const encoder = new TextEncoder();
    const toolCtx = { supabase, userId: user.id };

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        try {
          // Anthropic's server-side web search — appended to our local tools
          // so Ash can pull external facts (galleries, fairs, companies,
          // people, market context) without us hosting a search backend.
          // Bounded by max_uses for cost control.
          const tools = [
            ...(ANTHROPIC_TOOLS as Anthropic.Tool[]),
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5,
            } as unknown as Anthropic.Tool,
          ];

          // Max 5 agentic turns to prevent runaway loops
          for (let turn = 0; turn < 5; turn++) {
            const stream = anthropic.messages.stream({
              model:      "claude-sonnet-4-6",
              max_tokens: 2048,
              system:     systemBlocks as Anthropic.TextBlockParam[],
              tools,
              messages,
            });

            // Stream text deltas to the client as they arrive
            for await (const event of stream) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                const chunk = event.delta.text;
                fullAssistantResponse += chunk;
                send({ text: chunk });
              }
            }

            const msg = await stream.finalMessage();

            // No tool calls — conversation turn is complete
            if (msg.stop_reason !== "tool_use") break;

            // Execute each tool call
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of msg.content) {
              if (block.type !== "tool_use") continue;

              // Notify the client which tool is running
              send({ tool: block.name });

              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                toolCtx
              );

              toolResults.push({
                type:        "tool_result",
                tool_use_id: block.id,
                content:     result,
              });
            }

            // Append assistant turn + tool results and loop
            messages = [
              ...messages,
              { role: "assistant", content: msg.content },
              { role: "user",      content: toolResults },
            ];
          }

          // ── Persist assistant response ────────────────────────────────────────
          if (activeConversationId && fullAssistantResponse) {
            await Promise.all([
              supabase.from("ash_messages").insert({
                conversation_id: activeConversationId,
                user_id:         user.id,
                role:            "assistant",
                content:         fullAssistantResponse,
              }),
              supabase.from("ash_conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", activeConversationId),
            ]);
          }

          send({ done: true, conversationId: activeConversationId });
          controller.close();
        } catch (err) {
          console.error("[Ash API] Stream error:", err);
          send({ error: "Ash encountered an error." });
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection":    "keep-alive",
      },
    });
  } catch (err) {
    console.error("[Ash API] Fatal error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
