// ─── Ash knowledge-base evals ────────────────────────────────────────────────
//
// Measures whether the RAG knowledge base actually works. Two levels:
//
//   Retrieval (default): embed each question, call match_knowledge, check that
//     the expected source doc is retrieved AND the expected facts appear in the
//     retrieved chunks. Fast + cheap (embeddings + DB only).
//
//   Answer (--answer): additionally generate an answer with Sonnet 5 from ONLY
//     the retrieved chunks and check the expected facts appear in the answer.
//     This is the end-to-end "does Ash get it right" signal. Costs LLM tokens.
//
// Run after seeding the KB (scripts/ingest-knowledge.mjs):
//   node --env-file=.env.local scripts/eval-knowledge.mjs
//   node --env-file=.env.local scripts/eval-knowledge.mjs --answer
//
// Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY
//           (+ ANTHROPIC_API_KEY for --answer). Exits non-zero if retrieval hit
//           rate drops below THRESHOLD — so it can gate CI later.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const HERE       = dirname(fileURLToPath(import.meta.url));
const EVALS_PATH = join(HERE, "..", "evals", "knowledge-base-evals.json");
const MATCH_COUNT = 5;
const THRESHOLD   = 0.8;          // retrieval hit rate must clear this to pass
const DO_ANSWER   = process.argv.includes("--answer");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing ${name}`); process.exit(1); }
  return v;
}

/** A group passes if ANY variant substring appears; overall passes if ALL groups pass. */
function matchExpect(text, expect) {
  const hay = text.toLowerCase();
  const missing = [];
  for (const group of expect) {
    if (!group.some((v) => hay.includes(v.toLowerCase()))) missing.push(group.join("|"));
  }
  return { pass: missing.length === 0, missing };
}

async function embedQueries(texts, apiKey) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "voyage-3.5", input: texts, input_type: "query" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data.map((d) => d.embedding);
}

async function generateAnswer(anthropic, question, chunks) {
  const context = chunks.map((c) => `[${c.source}] ${c.content}`).join("\n\n");
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 400,
    thinking: { type: "disabled" },
    system:
      "You are Ash, a studio-business expert. Answer the question concisely using ONLY the knowledge provided. " +
      "Include the specific numbers, dates, or terms from the knowledge. If it isn't in the knowledge, say so.",
    messages: [{ role: "user", content: `Knowledge:\n${context}\n\nQuestion: ${question}` }],
  });
  const t = msg.content.find((b) => b.type === "text");
  return t ? t.text : "";
}

async function main() {
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const voyageKey = requireEnv("VOYAGE_API_KEY");
  if (DO_ANSWER) requireEnv("ANTHROPIC_API_KEY");
  const anthropic = DO_ANSWER ? new Anthropic() : null;

  const { cases } = JSON.parse(await readFile(EVALS_PATH, "utf8"));
  const embeddings = await embedQueries(cases.map((c) => c.question), voyageKey);

  let retrievalHits = 0, factInContext = 0, answerHits = 0;
  const failures = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const { data, error } = await supabase.rpc("match_knowledge", {
      query_embedding: embeddings[i],
      match_count:     MATCH_COUNT,
      filter_category: null,          // unfiltered — the realistic, harder case
    });
    if (error) { console.error(`  rpc error on ${c.id}: ${error.message}`); failures.push(c.id); continue; }

    const chunks  = data ?? [];
    const sources = new Set(chunks.map((r) => r.source));
    const ctxText = chunks.map((r) => r.content).join("\n");

    const retrieved = sources.has(c.source);
    const ctxFacts  = matchExpect(ctxText, c.expect);
    if (retrieved) retrievalHits++;
    if (ctxFacts.pass) factInContext++;

    let answerLine = "";
    if (DO_ANSWER) {
      const answer = await generateAnswer(anthropic, c.question, chunks);
      const a = matchExpect(answer, c.expect);
      if (a.pass) answerHits++;
      answerLine = `  answer:${a.pass ? "✓" : "✗ missing " + a.missing.join(", ")}`;
    }

    const ok = retrieved && ctxFacts.pass && (!DO_ANSWER || answerLine.includes("✓"));
    if (!ok) failures.push(c.id);
    console.log(
      `${ok ? "✓" : "✗"} ${c.id.padEnd(22)} retrieval:${retrieved ? "✓" : "✗ (" + [...sources].join(",") + ")"}` +
      ` facts-in-context:${ctxFacts.pass ? "✓" : "✗ missing " + ctxFacts.missing.join(", ")}${answerLine}`
    );
  }

  const n = cases.length;
  console.log(`\n── Summary (${n} cases) ──`);
  console.log(`Retrieval hit rate:     ${(retrievalHits / n * 100).toFixed(0)}%  (expected source in top ${MATCH_COUNT})`);
  console.log(`Facts-in-context rate:  ${(factInContext / n * 100).toFixed(0)}%  (facts present in retrieved chunks)`);
  if (DO_ANSWER) console.log(`Answer fact rate:       ${(answerHits / n * 100).toFixed(0)}%  (facts present in generated answer)`);
  if (failures.length) console.log(`Failures: ${failures.join(", ")}`);

  if (retrievalHits / n < THRESHOLD) {
    console.error(`\nRetrieval hit rate below ${THRESHOLD * 100}% — knowledge base needs attention.`);
    process.exit(1);
  }
  console.log("\nPASS");
}

main().catch((err) => { console.error(err); process.exit(1); });
