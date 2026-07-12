// ─── Interactive prompt tool ────────────────────────────────────────────────────
//
// `ask_user` doesn't touch the database — it renders an interactive card in the
// chat (tappable choices, long-answer, short-answer) and ends Ash's turn so the
// user can answer by tapping/typing instead of composing prose. The API route
// special-cases this tool: it streams the prompt spec to the client and stops
// the agentic loop (the widget IS the message), so the handler here is only a
// safety fallback and is never reached on the happy path.

import type { AshToolDefinition } from "./types";

export const ASK_USER_TOOL_NAME = "ask_user";

export const askUserTool: AshToolDefinition = {
  name: ASK_USER_TOOL_NAME,
  description:
    "Show the user an interactive prompt — tappable multiple-choice and/or short/long answer " +
    "fields — instead of asking in prose, then wait for their reply. Use this to make setup and " +
    "onboarding feel light: when a question is categorical (how they sell, price point, stage, which " +
    "channels — anything with a natural set of options), offer 'single' or 'multi' choices they can " +
    "tap; when it's reflective or open (what's broken right now, what they're hoping to change), use a " +
    "'long_text' field; for a quick fact (website, city) use 'short_text'. Compose the options yourself, " +
    "tailored to what you already know about this specific studio (e.g. jewelry-specific selling channels) " +
    "— don't force generic buckets. Keep it to 1–3 questions at a time; a couple of taps, not a form. Set " +
    "allow_custom on choice questions so the user can add their own answer. Always write a short, warm " +
    "lead-in as normal text BEFORE calling this — the card carries the questions, your prose carries the " +
    "why. After you call ask_user your turn ends; do not add more text after it. Prefer plain conversation " +
    "when a question is genuinely open-ended and a picker would only get in the way.",
  input_schema: {
    type: "object",
    properties: {
      intro: {
        type: "string",
        description: "Optional one-line lead-in shown just above the fields (keep it short; your main prose goes in the normal message).",
      },
      questions: {
        type: "array",
        description: "1–3 questions to ask at once.",
        items: {
          type: "object",
          properties: {
            id:     { type: "string", description: "Stable snake_case key for this question, e.g. 'selling_channels'." },
            prompt: { type: "string", description: "The question, in the user's own terms." },
            type:   { type: "string", enum: ["single", "multi", "long_text", "short_text"], description: "single = pick one, multi = pick many, long_text = paragraph, short_text = one line." },
            options: {
              type: "array",
              description: "Choices for single/multi. Tailor them to this studio. Omit for text types.",
              items: {
                type: "object",
                properties: {
                  id:          { type: "string", description: "Stable key for the choice (snake_case)." },
                  label:       { type: "string", description: "Short label shown on the pill." },
                  description: { type: "string", description: "Optional one-line clarifier under the label." },
                },
                required: ["id", "label"],
              },
            },
            placeholder:  { type: "string", description: "Hint text for long_text / short_text fields." },
            allow_custom: { type: "boolean", description: "For choice questions, also let the user type their own answer. Default false." },
            optional:     { type: "boolean", description: "The user can submit without answering this one. Default false." },
          },
          required: ["id", "prompt", "type"],
        },
      },
    },
    required: ["questions"],
  },
  // Never invoked on the happy path (the route intercepts ask_user). Kept so the
  // registry/execution fallback stays honest if that interception is ever bypassed.
  handler: async () =>
    "Interactive prompt shown to the user. Wait for their reply — do not continue this turn.",
};
