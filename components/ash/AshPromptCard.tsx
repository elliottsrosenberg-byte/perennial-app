"use client";

// The inline interactive prompt Ash renders mid-conversation via the `ask_user`
// tool: tappable single/multi choices, a long-answer field, or a short field.
// Answering formats a clean, self-describing user turn and sends it back through
// the normal chat pipeline. Once a newer message exists (or the card has been
// submitted) it locks into a read-only summary.

import { useState } from "react";
import Button from "@/components/ui/Button";
import { formatPromptAnswers, type AshPrompt, type AshPromptQuestion } from "@/lib/ash/interactive-types";

interface Props {
  prompt:   AshPrompt;
  /** Interactive only while true — set false once a later message exists. */
  active:   boolean;
  onSubmit: (text: string) => void;
}

export default function AshPromptCard({ prompt, active, onSubmit }: Props) {
  // Selected option ids per choice question; free text per text/custom field.
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom,   setCustom]   = useState<Record<string, string>>({});
  const [text,     setText]     = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const locked = !active || submitted;

  const answerFor = (q: AshPromptQuestion): string[] | string => {
    if (q.type === "single" || q.type === "multi") {
      const labels = (q.options ?? [])
        .filter((o) => (selected[q.id] ?? []).includes(o.id))
        .map((o) => o.label);
      const c = (custom[q.id] ?? "").trim();
      if (c) labels.push(c);
      return labels;
    }
    return (text[q.id] ?? "").trim();
  };

  const isAnswered = (q: AshPromptQuestion): boolean => {
    const a = answerFor(q);
    return Array.isArray(a) ? a.length > 0 : a.length > 0;
  };

  const complete = prompt.questions.every((q) => q.optional || isAnswered(q));

  function buildAnswers(): Record<string, string[] | string> {
    const out: Record<string, string[] | string> = {};
    for (const q of prompt.questions) out[q.id] = answerFor(q);
    return out;
  }

  function submit() {
    if (locked) return;
    const message = formatPromptAnswers(prompt, buildAnswers());
    if (!message.trim()) return;
    setSubmitted(true);
    onSubmit(message);
  }

  function toggleOption(q: AshPromptQuestion, optionId: string) {
    if (locked) return;
    const cur = selected[q.id] ?? [];

    // A single lone single-select question is a one-tap answer — send on pick.
    if (
      q.type === "single" &&
      !q.allow_custom &&
      prompt.questions.length === 1
    ) {
      const label = (q.options ?? []).find((o) => o.id === optionId)?.label ?? optionId;
      setSelected({ [q.id]: [optionId] });
      setSubmitted(true);
      onSubmit(formatPromptAnswers(prompt, { [q.id]: [label] }));
      return;
    }

    if (q.type === "single") {
      setSelected({ ...selected, [q.id]: cur.includes(optionId) ? [] : [optionId] });
    } else {
      setSelected({
        ...selected,
        [q.id]: cur.includes(optionId) ? cur.filter((id) => id !== optionId) : [...cur, optionId],
      });
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        border: "0.5px solid var(--color-ash-border)",
        background: "var(--color-ash-tint)",
        borderRadius: 14,
        padding: 14,
        display: "flex", flexDirection: "column", gap: 14,
        opacity: locked ? 0.72 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      {prompt.intro && (
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--color-ash-dark)", fontWeight: 500, margin: 0 }}>
          {prompt.intro}
        </p>
      )}

      {prompt.questions.map((q) => (
        <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.4 }}>
            {q.prompt}
            {q.optional && (
              <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}> · optional</span>
            )}
          </label>

          {(q.type === "single" || q.type === "multi") ? (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(q.options ?? []).map((o) => {
                  const on = (selected[q.id] ?? []).includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={locked}
                      onClick={() => toggleOption(q, o.id)}
                      title={o.description}
                      style={{
                        padding: "7px 12px",
                        borderRadius: "var(--radius-full)",
                        border: on ? "1px solid var(--color-ash)" : "0.5px solid var(--color-ash-border)",
                        background: on ? "rgba(var(--color-sage-rgb),0.18)" : "var(--color-surface-raised)",
                        color: on ? "var(--color-ash-dark)" : "var(--color-text-secondary)",
                        fontSize: 12, fontWeight: on ? 600 : 500,
                        fontFamily: "inherit", lineHeight: 1.3,
                        cursor: locked ? "default" : "pointer",
                        transition: "background 0.1s ease, border-color 0.1s ease",
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {q.allow_custom && (
                <input
                  type="text"
                  disabled={locked}
                  value={custom[q.id] ?? ""}
                  onChange={(e) => setCustom({ ...custom, [q.id]: e.target.value })}
                  placeholder="Something else…"
                  style={textFieldStyle}
                />
              )}
            </>
          ) : q.type === "long_text" ? (
            <textarea
              disabled={locked}
              value={text[q.id] ?? ""}
              onChange={(e) => setText({ ...text, [q.id]: e.target.value })}
              placeholder={q.placeholder ?? "Type your answer…"}
              rows={3}
              style={{ ...textFieldStyle, resize: "vertical", minHeight: 64, lineHeight: 1.55 }}
            />
          ) : (
            <input
              type="text"
              disabled={locked}
              value={text[q.id] ?? ""}
              onChange={(e) => setText({ ...text, [q.id]: e.target.value })}
              placeholder={q.placeholder ?? "Type your answer…"}
              onKeyDown={(e) => { if (e.key === "Enter" && complete) { e.preventDefault(); submit(); } }}
              style={textFieldStyle}
            />
          )}
        </div>
      ))}

      {!locked && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="sm" variant="primary" disabled={!complete} onClick={submit}>
            Send
          </Button>
        </div>
      )}
      {submitted && (
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, textAlign: "right" }}>
          Answer sent
        </p>
      )}
    </div>
  );
}

const textFieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  borderRadius: 9,
  border: "1px solid var(--color-border-strong)",
  background: "var(--color-surface-raised)",
  color: "var(--color-text-primary)",
  fontSize: 12.5, fontFamily: "inherit",
  outline: "none",
};
