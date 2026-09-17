// Launch gating for integrations whose third-party apps still need manual
// approval before strangers can use them:
//
//   google / google_analytics — Google OAuth verification (Gmail is a
//     restricted scope → CASA assessment); unverified apps are capped at
//     100 users and show a warning interstitial.
//   microsoft — Azure publisher verification for a clean consent screen.
//   instagram — Meta App Review + Business Verification.
//   banking — Plaid production access application.
//
// While a flag is false the UI shows "Coming soon" and the OAuth start
// routes refuse to redirect (so a hand-typed /api/auth/... URL can't reach
// the unapproved provider app either). TO RE-ENABLE: flip the flag to true
// and deploy — every gate in the app reads from here. Safe to import from
// client or server code (plain constants).

export const INTEGRATION_LIVE = {
  google: false,
  google_analytics: false,
  microsoft: false,
  instagram: false,
  banking: false,
} as const;

export type GatedProvider = keyof typeof INTEGRATION_LIVE;

// Provider ids used in the UI that resolve to a shared flag.
const ALIASES: Record<string, GatedProvider> = {
  plaid:  "banking",
  teller: "banking",
  meta:   "instagram",
};

/** True when the provider may be connected. Unknown providers are live. */
export function integrationLive(provider: string): boolean {
  const key = (ALIASES[provider] ?? provider) as GatedProvider;
  if (key in INTEGRATION_LIVE) return INTEGRATION_LIVE[key];
  return true;
}
