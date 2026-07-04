// ─── Embeddings ────────────────────────────────────────────────────────────────
//
// Single provider seam for Ash's knowledge base. Both ingestion (scripts/
// ingest-knowledge.mjs) and retrieval (search_knowledge_base tool) embed through
// here so query and document vectors always come from the same model.
//
// Default: Voyage AI `voyage-3.5` (1024-dim), Anthropic's recommended embeddings
// partner. To swap to OpenAI, replace the body of `embed` with a call to
// text-embedding-3-* and change `vector(1024)` in the migration to match the dim.
//
// Requires VOYAGE_API_KEY in the server env (and in .env.local for the script).

export const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIM   = 1024;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

type InputType = "query" | "document";

/** Embed one or more texts. `query` for search terms, `document` for stored chunks. */
export async function embed(
  input: string | string[],
  inputType: InputType = "query",
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("Missing VOYAGE_API_KEY — required for Ash knowledge-base embeddings.");

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:      EMBEDDING_MODEL,
      input:      Array.isArray(input) ? input : [input],
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

/** Convenience for a single string (the common case in retrieval). */
export async function embedOne(text: string, inputType: InputType = "query"): Promise<number[]> {
  const [vec] = await embed(text, inputType);
  return vec;
}
