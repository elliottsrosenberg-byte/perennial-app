// Subscription plans and Ash credit allowances — the single source of truth.
// Safe to import from client or server (plain constants, no secrets).
//
// Ash runs on the shared platform Anthropic key, so credits exist to keep one
// account from spending without bound. The design deliberately avoids the
// pattern that has caused every public credit backlash (Cursor, Replit, Figma):
// an opaque currency whose exchange rate into real work nobody can predict.
// Here the rules are: a small integer cost per turn, published in the app,
// charged as the single most expensive thing Ash did that turn (never summed),
// with a visible balance and a weekly reset. Never change costs retroactively
// for an existing subscriber mid-period.

export type PlanId = "free" | "studio" | "atelier";

// ─── Ash credit costs ────────────────────────────────────────────────────────
// One turn is charged the HIGHEST applicable cost, not the sum — a turn where
// Ash both reads your data and searches the web costs 5, not 7. Easier to
// reason about, and the ceiling still bounds the spend.
export const ASH_CREDIT_COSTS = {
  /** Ash just answers — no tools, no search. */
  message: 1,
  /** Ash read or changed something in the user's studio (any app tool). */
  tools: 2,
  /** Ash searched the web. */
  web_search: 5,
  /** A background research run over the user's niche. */
  research: 15,
} as const;

export type AshCreditReason = keyof typeof ASH_CREDIT_COSTS;

/** Credits for one Ash turn, given what actually happened in it. */
export function creditsForTurn(opts: { usedTools: boolean; usedWebSearch: boolean }): {
  credits: number;
  reason: AshCreditReason;
} {
  if (opts.usedWebSearch) return { credits: ASH_CREDIT_COSTS.web_search, reason: "web_search" };
  if (opts.usedTools)     return { credits: ASH_CREDIT_COSTS.tools,      reason: "tools" };
  return { credits: ASH_CREDIT_COSTS.message, reason: "message" };
}

// ─── Plans ───────────────────────────────────────────────────────────────────
// Weekly allowances are sized so that even a subscriber who burns their entire
// allowance every week stays profitable at current Sonnet 5 rates (~$0.03 of
// model spend per credit). Typical use runs far below the cap.

export interface Plan {
  id:            PlanId;
  name:          string;
  /** USD per month, billed monthly. */
  priceMonthly:  number;
  /** USD per year, billed annually (20% off the monthly rate). */
  priceAnnual:   number;
  /** Ash credits per week; null = unlimited (subject to fairUseCreditsPerWeek). */
  ashCreditsPerWeek: number | null;
  /** Soft ceiling on an "unlimited" plan — we get alerted, the user is not cut off. */
  fairUseCreditsPerWeek?: number;
  limits: {
    projects:     number | null;   // null = unlimited
    contacts:     number | null;
    invoicing:    boolean;
    bookingLinks: boolean;
  };
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id:   "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnual:  0,
    ashCreditsPerWeek: 25,
    limits: { projects: 3, contacts: 25, invoicing: false, bookingLinks: false },
  },
  studio: {
    id:   "studio",
    name: "Studio",
    priceMonthly: 29,
    priceAnnual:  278,          // $23.17/mo equivalent
    ashCreditsPerWeek: 150,
    limits: { projects: null, contacts: null, invoicing: true, bookingLinks: true },
  },
  atelier: {
    id:   "atelier",
    name: "Atelier",
    priceMonthly: 59,
    priceAnnual:  566,          // $47.17/mo equivalent
    ashCreditsPerWeek: null,    // unlimited…
    fairUseCreditsPerWeek: 600, // …with a published fair-use ceiling
    limits: { projects: null, contacts: null, invoicing: true, bookingLinks: true },
  },
};

export const DEFAULT_PLAN: PlanId = "free";

/** Plans in display order for pricing tables. */
export const PLAN_ORDER: PlanId[] = ["free", "studio", "atelier"];

/**
 * The plan whose entitlements a user actually gets.
 *
 * Free-beta accounts are grandfathered: they keep Studio-level access for free,
 * permanently, and are never auto-charged. Everyone else gets the plan their
 * subscription says, falling back to Free when there's no active subscription.
 */
export function resolvePlan(profile: {
  plan?: string | null;
  plan_grandfathered?: boolean | null;
  subscription_status?: string | null;
} | null | undefined): Plan {
  if (profile?.plan_grandfathered) return PLANS.studio;

  const active = profile?.subscription_status === "active"
              || profile?.subscription_status === "trialing";
  const id = profile?.plan as PlanId | undefined;
  if (active && id && id in PLANS) return PLANS[id];

  return PLANS[DEFAULT_PLAN];
}

// ─── Weekly credit window ────────────────────────────────────────────────────
// Weeks start Monday 00:00 UTC — a fixed, predictable boundary users can plan
// around, and short enough that a single heavy day can't drain a whole month.

export function currentWeekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  // getUTCDay(): 0=Sun … 1=Mon. Days since Monday:
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

export function nextWeekStart(now: Date = new Date()): Date {
  const d = currentWeekStart(now);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}
