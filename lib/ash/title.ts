import type Anthropic from "@anthropic-ai/sdk";

// Generates a short, human-readable title for an Ash conversation from its first
// exchange. Cheap + fast (Haiku), best-effort — returns null on any failure so a
// missing title never breaks a turn.

const SYSTEM =
  "You write very short titles for a saved chat between an artist/creative " +
  "professional and their business assistant. Return ONLY the title: 3–6 words, " +
  "Title Case, no surrounding quotes, no trailing punctuation, no emoji. " +
  "Summarize the actual topic — not the greeting or the word 'help'.";

export async function generateConversationTitle(
  anthropic: Anthropic,
  userMessage: string,
  assistantMessage: string,
): Promise<string | null> {
  try {
    const msg = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 24,
      system:     SYSTEM,
      messages: [{
        role:    "user",
        content: `User: ${userMessage.slice(0, 500)}\n\nAssistant: ${assistantMessage.slice(0, 600)}\n\nTitle:`,
      }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const title = raw.replace(/^["'#\s]+/, "").replace(/["'.\s]+$/, "").slice(0, 60).trim();
    return title || null;
  } catch {
    return null;
  }
}
