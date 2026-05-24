// Service-role Supabase client. ONLY used by surfaces that need to bypass
// RLS for legitimate reasons — e.g. the public /i/[token] invoice view
// where the visitor has no Supabase session, and the Stripe webhook which
// runs without any user context.
//
// Never import this from a client component or route the user can reach
// without a controlled lookup key (the public_token, a Stripe-signed
// webhook payload, etc).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy initialization. The env-var check fires the FIRST time the
// client is needed, not at module load — module-load throws blow up
// `next build`'s page-data collection step even when the route is
// never going to be hit. Request-time throws still produce a clear
// 500 the moment someone exercises the public invoice view or Stripe
// webhook without the key set.

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL — required for the service-role client.");
  }
  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY — required for the public invoice view and Stripe webhook. Add it to .env.local (and to your Vercel env).");
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
