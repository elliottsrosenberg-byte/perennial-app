// Service-role Supabase client for admin/server-side writes that must bypass
// RLS (e.g. curating the global opportunities feed). NEVER import this into a
// client component — it carries the service-role key.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
