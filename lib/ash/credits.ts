// Ash credit accounting. Allowances and per-turn costs live in lib/plans.ts;
// this module reads the ledger and writes charges.
//
// Reads go through the caller's own client (RLS scopes them to the user).
// Writes go through the service-role client because users must not be able to
// mint or delete their own credits — the ledger has no user-facing write policy.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  currentWeekStart,
  nextWeekStart,
  resolvePlan,
  type AshCreditReason,
  type Plan,
} from "@/lib/plans";
import type { SupabaseClient } from "@supabase/supabase-js";

// Safety valve on the ledger read. A week's rows are normally bounded by the
// plan allowance; unlimited plans have no such bound, so cap the scan.
const MAX_LEDGER_ROWS_PER_WEEK = 5000;

export interface CreditState {
  plan:      Plan;
  /** True on plans with no hard allowance (Atelier). */
  unlimited: boolean;
  /** Credits allowed this week; null when unlimited. */
  allowance: number | null;
  /** Credits spent since the week started. */
  used:      number;
  /** Credits left; null when unlimited. Never negative. */
  remaining: number | null;
  /** ISO timestamp of the next weekly reset (Monday 00:00 UTC). */
  resetsAt:  string;
  /** True once the user has spent their whole allowance. */
  exhausted: boolean;
}

/** Current week's credit position for a user. */
export async function getCreditState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<CreditState> {
  const weekStart = currentWeekStart();

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, plan_grandfathered, subscription_status")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("ash_credit_ledger")
      .select("credits")
      .eq("user_id", userId)
      .gte("created_at", weekStart.toISOString())
      .limit(MAX_LEDGER_ROWS_PER_WEEK),
  ]);

  const plan = resolvePlan(profile);
  const used = (rows ?? []).reduce((sum, r) => sum + (r.credits as number), 0);
  const allowance = plan.ashCreditsPerWeek;

  return {
    plan,
    unlimited: allowance === null,
    allowance,
    used,
    remaining: allowance === null ? null : Math.max(0, allowance - used),
    resetsAt:  nextWeekStart().toISOString(),
    exhausted: allowance !== null && used >= allowance,
  };
}

/**
 * Charge a completed Ash turn.
 *
 * Deliberately called AFTER the turn, never before: the cost depends on what
 * Ash actually did, and a turn already in flight is never killed mid-way for
 * running over. A user on their last credit can finish an expensive turn and
 * land slightly negative — they simply start the next week's window at zero.
 */
export async function debitCredits(
  userId: string,
  credits: number,
  reason: AshCreditReason,
  conversationId?: string | null,
): Promise<void> {
  if (credits <= 0) return;
  const admin = createAdminClient();
  const { error } = await admin.from("ash_credit_ledger").insert({
    user_id:         userId,
    credits,
    reason,
    conversation_id: conversationId ?? null,
  });
  // Never fail a user's turn over accounting — log and move on.
  if (error) console.error("[Ash credits] debit failed:", error.message);
}

/** Copy for the 429 a user sees when the week's credits are gone. */
export function exhaustedMessage(state: CreditState): string {
  const resets = new Date(state.resetsAt).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "UTC",
  });
  return state.plan.id === "free"
    ? `You've used this week's ${state.allowance} Ash credits. They reset ${resets} — or upgrade for more.`
    : `You've used this week's ${state.allowance} Ash credits. They reset ${resets}. Your conversations are all saved.`;
}
