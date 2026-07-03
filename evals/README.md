# Ash knowledge-base evals

Regression tests for Ash's RAG knowledge base. They answer one question: **when a
user asks something, does the knowledge base surface the right facts?** Run them
after editing `knowledge/*.md`, after re-seeding, or before shipping a change to
retrieval.

## Run

```bash
# Retrieval only (fast, cheap — embeddings + DB):
node --env-file=.env.local scripts/eval-knowledge.mjs

# End-to-end, including generated answers through Sonnet 5 (costs LLM tokens):
node --env-file=.env.local scripts/eval-knowledge.mjs --answer
```

Prereqs: the migration is applied, the KB is seeded (`scripts/ingest-knowledge.mjs`),
and `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VOYAGE_API_KEY`
(+ `ANTHROPIC_API_KEY` for `--answer`) are in `.env.local`.

## What it measures

| Metric | Meaning |
|---|---|
| **Retrieval hit rate** | Did the expected source doc appear in the top-5 for the question? This is the primary health signal — the script exits non-zero below 80%. |
| **Facts-in-context rate** | Did the expected facts (numbers, dates, terms) show up in the retrieved chunks? Catches cases where the right doc is retrieved but the wrong section. |
| **Answer fact rate** (`--answer`) | Did the generated answer actually state the facts? Catches generation problems even when retrieval is fine. |

## Adding cases

Edit `knowledge-base-evals.json`. Each case:

```json
{
  "id": "short-slug",
  "category": "pricing",
  "source": "pricing.md",
  "question": "A real question a user would ask",
  "expect": [["30"], ["50"]]
}
```

`expect` is a list of groups. A group passes if **any** of its variant strings
appears (case-insensitive); the case passes if **all** groups pass. Use variants
to tolerate phrasing (`[["intellectual property", "ip", "ownership"]]`) and keep
numeric facts loose (`"40"` matches "40%", "40–60", "40 to 60").

## When a case fails

- **Retrieval ✗** → the chunk is missing, mis-chunked, or out-competed. Improve the
  `knowledge/*.md` wording, split a section, or add a dedicated section, then re-seed.
- **Facts-in-context ✗ but retrieval ✓** → right doc, wrong section retrieved. Tighten
  the section so the fact and its question-language live together.
- **Answer ✗ but facts-in-context ✓** → generation issue, not retrieval. Usually a
  system-prompt tweak (tell Ash to state the specific numbers) rather than a KB change.
