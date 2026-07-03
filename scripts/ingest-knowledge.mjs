// ─── Ash knowledge-base ingestion ────────────────────────────────────────────
//
// Reads knowledge/*.md, chunks each doc by H2 section, generates a one-sentence
// "contextual retrieval" summary per chunk (Anthropic's technique — situates the
// chunk within its doc so it retrieves well on its own), embeds via Voyage, and
// idempotently upserts into public.knowledge_base as GLOBAL rows (user_id NULL).
//
// Re-running is safe: chunks whose content is unchanged (same content_hash) are
// skipped, so it's cheap to run after every edit to the knowledge/ docs.
//
// Run:
//   node --env-file=.env.local scripts/ingest-knowledge.mjs
//
// Requires in the environment:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, VOYAGE_API_KEY

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const HERE          = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = join(HERE, "..", "knowledge");

// Keep in sync with lib/ash/embeddings.ts and the vector(N) dim in the migration.
const EMBEDDING_MODEL = "voyage-3.5";
const SUMMARY_MODEL   = "claude-haiku-4-5";

// ─── helpers ─────────────────────────────────────────────────────────────────

function requireEnv(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing ${name}`); process.exit(1); }
  return v;
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Parse a knowledge doc into { title, category, chunks: [{ heading, content }] }. */
function parseDoc(md) {
  const lines = md.split("\n");
  const title = (lines.find((l) => /^#\s+/.test(l)) ?? "").replace(/^#\s+/, "").trim();
  const category = (md.match(/^category:\s*(.+)$/m)?.[1] ?? "").trim();

  // Split on H2 headings; each section becomes one chunk (heading kept for context).
  const sections = md.split(/\n(?=##\s+)/).filter((s) => /^##\s+/.test(s.trim()));
  const chunks = sections.map((sec) => {
    const heading = (sec.match(/^##\s+(.+)$/m)?.[1] ?? "").trim();
    return { heading, content: sec.trim() };
  });
  return { title, category, chunks };
}

async function embedDocuments(texts, apiKey) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

async function contextualSummary(anthropic, docTitle, category, chunk) {
  const msg = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 120,
    system:
      "You situate a document chunk for retrieval. Given a document title and one chunk, " +
      "write ONE short sentence stating what this chunk covers and how it fits the document. " +
      "Output only the sentence — no preamble.",
    messages: [{
      role: "user",
      content: `Document: "${docTitle}" (category: ${category})\n\nChunk:\n${chunk}`,
    }],
  });
  const text = msg.content.find((b) => b.type === "text");
  return text ? text.text.trim() : "";
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey  = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("ANTHROPIC_API_KEY");
  const voyageKey   = requireEnv("VOYAGE_API_KEY");

  const supabase  = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const anthropic = new Anthropic();

  // Existing chunk hashes, so we can skip unchanged content.
  const { data: existing, error: exErr } = await supabase
    .from("knowledge_base")
    .select("chunk_id, content_hash")
    .is("user_id", null);
  if (exErr) { console.error("Failed to read knowledge_base:", exErr.message); process.exit(1); }
  const existingHash = new Map((existing ?? []).map((r) => [r.chunk_id, r.content_hash]));

  const files = (await readdir(KNOWLEDGE_DIR)).filter((f) => f.endsWith(".md"));
  let upserted = 0, skipped = 0;

  for (const file of files) {
    const slug = basename(file, ".md");
    const md = await readFile(join(KNOWLEDGE_DIR, file), "utf8");
    const { title, category, chunks } = parseDoc(md);
    if (!category) { console.warn(`  ! ${file}: no "category:" line, skipping`); continue; }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkId = `${slug}#${i}`;
      const hash = sha256(chunk.content);

      if (existingHash.get(chunkId) === hash) { skipped++; continue; }

      const summary = await contextualSummary(anthropic, title, category, chunk.content);
      const [embedding] = await embedDocuments([`${summary}\n\n${chunk.content}`], voyageKey);

      const { error } = await supabase.from("knowledge_base").upsert({
        user_id:         null,
        chunk_id:        chunkId,
        category,
        title:           chunk.heading ? `${title} — ${chunk.heading}` : title,
        source:          file,
        content:         chunk.content,
        context_summary: summary,
        content_hash:    hash,
        embedding,
        updated_at:      new Date().toISOString(),
      }, { onConflict: "chunk_id" });

      if (error) { console.error(`  ✗ ${chunkId}: ${error.message}`); continue; }
      upserted++;
      console.log(`  ✓ ${chunkId}  ${chunk.heading}`);
    }
  }

  console.log(`\nDone. ${upserted} upserted, ${skipped} unchanged.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
