// ─── Ash behavior evals ──────────────────────────────────────────────────────
//
// Tests the product behavior, not memorized facts, using Ash's REAL system
// prompt, capabilities manifest, and tool definitions against a mock user:
//
//   'tool' cases     — assert Ash reaches for the right tool (implement / defer
//                      dates+events to live data instead of answering from memory).
//                      Deterministic: check the tool_use it emits.
//   'behavior' cases — run with tools off; an LLM judge scores the answer against
//                      a rubric (educate-on-options, honor-preferences, black-and-white).
//
// Run:  vercel env pull .env.local  (brings ANTHROPIC_API_KEY)
//       npm run eval:ash
//
// Exits non-zero below THRESHOLD so it can gate CI.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STATIC_SYSTEM_PROMPT, buildDynamicContext, type AshContext } from "../lib/ash/system-prompt";
import { ANTHROPIC_TOOLS, buildCapabilitiesManifest } from "../lib/ash/tools";

interface EvalCase {
  id:              string;
  kind:            "tool" | "behavior";
  question:        string;
  expectTool?:     string[];
  rubric?:         string;
  mockPreference?: string;
}

const HERE  = dirname(fileURLToPath(import.meta.url));
const cases = (JSON.parse(readFileSync(join(HERE, "ash-behavior-evals.json"), "utf8")) as { cases: EvalCase[] }).cases;

const anthropic = new Anthropic();
const MODEL     = "claude-sonnet-5";
const THRESHOLD = 0.8;

const webSearch = { type: "web_search_20260209", name: "web_search", max_uses: 3 } as unknown as Anthropic.Tool;

function baseContext(preferences: AshContext["preferences"] = []): AshContext {
  return {
    module: "home",
    userEmail: "maker@example.com",
    studioName: "Foster & Oak Studio",
    displayName: "Alex",
    tagline: "Handmade lighting and furniture",
    bio: "Independent lighting and furniture designer making small editions and commissions.",
    location: "Brooklyn, NY",
    practiceTypes: ["furniture", "lighting"],
    workTypes: ["editions", "bespoke"],
    sellingChannels: ["gallery", "direct", "fairs"],
    priceRange: "2k_10k",
    yearsInPractice: "building",
    primaryChallenges: ["pricing", "gallery outreach"],
    businessIssues: "Cash flow is lumpy between commissions.",
    urgentNeeds: "Need to invoice the Foster job.",
    perennialGoals: ["invoicing", "outreach"],
    currency: "USD",
    hourlyRate: 85,
    projects: [
      { id: "p-foster", title: "Foster dining table", status: "in_progress", due_date: null, priority: "high" },
      { id: "p-arc",    title: "Arc floor lamp edition", status: "planning",  due_date: null, priority: "medium" },
    ],
    outstandingInvoices: [],
    overdueInvoices: [{ number: 12, total: 4200 }],
    recentNotes: [],
    staleContacts: [{ first_name: "Sarah", last_name: "Chen", last_contacted_at: null, organization_name: "Lehman Gallery" }],
    openTasks: [
      { title: "Order brass fittings", due_date: null, priority: "high", project: "Arc floor lamp edition" },
      { title: "Send Foster invoice",  due_date: null, priority: "high", project: "Foster dining table" },
    ],
    billableHoursThisMonth: 22,
    preferences,
  };
}

function systemFor(ctx: AshContext): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: STATIC_SYSTEM_PROMPT },
    { type: "text", text: buildCapabilitiesManifest() },
    { type: "text", text: buildDynamicContext(ctx) },
  ];
}

async function runToolCase(c: EvalCase): Promise<{ pass: boolean; detail: string }> {
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 1024, thinking: { type: "disabled" },
    system: systemFor(baseContext()),
    tools: [...(ANTHROPIC_TOOLS as Anthropic.Tool[]), webSearch],
    messages: [{ role: "user", content: c.question }],
  });
  const names = res.content.flatMap((b) => (b.type === "tool_use" ? [b.name] : []));
  const pass = names.some((n) => (c.expectTool ?? []).includes(n));
  return { pass, detail: names.length ? `called: ${names.join(", ")}` : `no tool (stop=${res.stop_reason})` };
}

async function judge(question: string, answer: string, rubric: string): Promise<{ pass: boolean; reason: string }> {
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 300, thinking: { type: "disabled" },
    system: 'You are a strict evaluator. Given a user question, an assistant answer, and a criterion, decide whether the answer satisfies the criterion. Return ONLY JSON: {"pass":true|false,"reason":"<short>"}.',
    messages: [{ role: "user", content: `Question: ${question}\n\nAnswer: ${answer}\n\nCriterion: ${rubric}` }],
  });
  const block = res.content.find((b) => b.type === "text");
  const raw = block && block.type === "text" ? block.text : "";
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    return { pass: !!j.pass, reason: String(j.reason ?? "") };
  } catch {
    return { pass: false, reason: "judge parse error" };
  }
}

async function runBehaviorCase(c: EvalCase): Promise<{ pass: boolean; detail: string }> {
  const ctx = baseContext(c.mockPreference ? [{ kind: "format", content: c.mockPreference, weight: 3 }] : []);
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 1024, thinking: { type: "disabled" },
    system: systemFor(ctx),
    messages: [{ role: "user", content: c.question }],   // tools off: behavior cases test the answer's shape
  });
  const answer = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const j = await judge(c.question, answer, c.rubric ?? "");
  return { pass: j.pass, detail: j.reason };
}

async function main() {
  let passed = 0;
  for (const c of cases) {
    const r = c.kind === "tool" ? await runToolCase(c) : await runBehaviorCase(c);
    if (r.pass) passed++;
    console.log(`${r.pass ? "✓" : "✗"} [${c.kind.padEnd(8)}] ${c.id.padEnd(18)} ${r.detail}`);
  }
  const rate = passed / cases.length;
  console.log(`\n${passed}/${cases.length} passed (${Math.round(rate * 100)}%)`);
  if (rate < THRESHOLD) { console.error(`Below ${THRESHOLD * 100}% — Ash behavior regressed.`); process.exit(1); }
  console.log("PASS");
}

main().catch((e) => { console.error(e); process.exit(1); });
