// ─── Ash interactive prompts — shared shape (client + server) ───────────────────
//
// When Ash wants a structured answer during onboarding or setup — a set of
// tappable choices, a long-answer reflection, a short field — it calls the
// `ask_user` tool with an AshPrompt. The server streams it to the client as an
// SSE `prompt` event; the client renders it inline (AshPromptCard) and, on
// submit, sends a clean, self-describing answer back as the user's next turn.
//
// This module is intentionally dependency-free (pure types + string helpers) so
// it can be imported from both the browser bundle and the API route.

export type AshQuestionType = "single" | "multi" | "long_text" | "short_text";

export interface AshPromptOption {
  id:           string;
  label:        string;
  description?: string;
}

export interface AshPromptQuestion {
  /** Stable key so an answer can be attributed back to its question. */
  id:           string;
  /** The question, in the user's terms. */
  prompt:       string;
  type:         AshQuestionType;
  /** Choices for single/multi. Ignored for text types. */
  options?:     AshPromptOption[];
  /** Placeholder for text types. */
  placeholder?: string;
  /** For choice questions: also let the user type their own answer. */
  allow_custom?: boolean;
  /** Question can be skipped without blocking submit. */
  optional?:    boolean;
}

export interface AshPrompt {
  /** Optional one-line lead-in shown above the fields. */
  intro?:     string;
  questions:  AshPromptQuestion[];
}

// ─── Validation (server-side, defensive) ───────────────────────────────────────

const QUESTION_TYPES: AshQuestionType[] = ["single", "multi", "long_text", "short_text"];

/** Coerce loosely-shaped tool input into a safe AshPrompt, or null if unusable. */
export function normalizeAshPrompt(input: unknown): AshPrompt | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];

  const questions: AshPromptQuestion[] = [];
  for (const q of rawQuestions) {
    if (!q || typeof q !== "object") continue;
    const rq = q as Record<string, unknown>;
    const type = QUESTION_TYPES.includes(rq.type as AshQuestionType) ? (rq.type as AshQuestionType) : null;
    const prompt = typeof rq.prompt === "string" ? rq.prompt.trim() : "";
    if (!type || !prompt) continue;

    const options: AshPromptOption[] = [];
    if (Array.isArray(rq.options)) {
      for (const o of rq.options) {
        if (!o || typeof o !== "object") continue;
        const ro = o as Record<string, unknown>;
        const label = typeof ro.label === "string" ? ro.label.trim() : "";
        if (!label) continue;
        options.push({
          id:          typeof ro.id === "string" && ro.id.trim() ? ro.id.trim() : label,
          label,
          description: typeof ro.description === "string" ? ro.description.trim() : undefined,
        });
      }
    }

    questions.push({
      id:           typeof rq.id === "string" && rq.id.trim() ? rq.id.trim() : `q${questions.length + 1}`,
      prompt,
      type,
      options:      options.length ? options : undefined,
      placeholder:  typeof rq.placeholder === "string" ? rq.placeholder : undefined,
      allow_custom: Boolean(rq.allow_custom),
      optional:     Boolean(rq.optional),
    });
  }

  if (questions.length === 0) return null;
  return {
    intro:     typeof raw.intro === "string" && raw.intro.trim() ? raw.intro.trim() : undefined,
    questions,
  };
}

// ─── Serialization ──────────────────────────────────────────────────────────────

/** A compact, low-noise line appended to the persisted assistant message so the
 *  model (and a reloaded transcript) remembers what it offered — the live widget
 *  isn't part of the saved text. */
export function serializeAskForHistory(prompt: AshPrompt): string {
  const parts = prompt.questions.map((q) => {
    if ((q.type === "single" || q.type === "multi") && q.options?.length) {
      return `${q.prompt} (${q.options.map((o) => o.label).join(" / ")}${q.allow_custom ? " / …" : ""})`;
    }
    return `${q.prompt} (open answer)`;
  });
  return `\n\n_(Offered a quick pick — ${parts.join("; ")}.)_`;
}

/** Build the human-readable user turn from their answers to a prompt. Each entry
 *  is "Question — answer", so the message is self-describing to both the user and
 *  the model even without the widget in history. */
export function formatPromptAnswers(
  prompt:  AshPrompt,
  answers: Record<string, string[] | string>,
): string {
  const lines: string[] = [];
  for (const q of prompt.questions) {
    const a = answers[q.id];
    const text = Array.isArray(a) ? a.filter(Boolean).join(", ") : (a ?? "").trim();
    if (!text) {
      if (q.optional) continue;
      lines.push(`${q.prompt} — (skipped)`);
      continue;
    }
    lines.push(`${q.prompt} — ${text}`);
  }
  return lines.join("\n");
}
