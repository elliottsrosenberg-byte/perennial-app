# Ash behavior evals

Regression tests for how Ash *behaves*, not for memorized facts. They use Ash's
real system prompt, capabilities manifest, and tool definitions against a mock
user, so they catch drift in the product behavior we care about.

## Run

```bash
vercel env pull .env.local   # brings ANTHROPIC_API_KEY into .env.local
npm install                  # first time, to get tsx
npm run eval:ash
```

## What it tests

| Case kind | How it's graded | Guards |
|---|---|---|
| **tool** | Deterministic — assert Ash emits the expected `tool_use` | "Implement it" (log time, add task, create note/contact, update status) and "defer to live data" (dates/events → `get_opportunities`/`web_search`, never answered from memory) |
| **behavior** | LLM judge scores the answer against a rubric (tools off) | Educate-on-options instead of a flat verdict (gallery %, pricing, press), honor a stored preference, and give a direct answer when something genuinely *is* black-and-white |

The runner exits non-zero below 80%, so it can gate CI.

## Adding cases

Edit `ash-behavior-evals.json`:

```json
{ "id": "slug", "kind": "tool", "question": "...", "expectTool": ["log_time"] }
{ "id": "slug", "kind": "behavior", "question": "...", "rubric": "The answer does X, not Y.",
  "mockPreference": "optional — a standing preference to inject and check is honored" }
```

- **tool** cases pass if any emitted tool is in `expectTool` (list alternatives that are all acceptable, e.g. `["get_opportunities","web_search"]`).
- **behavior** cases run with tools off; write the `rubric` as a single yes/no criterion the judge can score.

## Why behavior, not facts

The earlier eval checked whether answers contained specific numbers/dates. That
rewarded exactly the false confidence we're trying to avoid — Ash should look
volatile facts up (events feed, the user's own data) and *educate on options* for
anything nuanced. These evals grade that posture instead.
