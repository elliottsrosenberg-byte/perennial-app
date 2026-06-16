// Server-only admin gate. The app is otherwise single-tenant (every row is
// scoped to auth.uid() via RLS); these helpers grant a small allowlist of
// user ids access to support tooling (the /admin/users impersonation view).
//
// ADMIN_USER_IDS is a comma-separated list of auth user UUIDs. Set it per
// environment in Vercel: production = your real admin account id(s); preview =
// the staging demo user id so the feature is testable on previews.
//
// NEVER import this into a client component — admin checks must run on the
// server, and the impersonation endpoints carry the service-role key.

import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export function adminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminUserId(id: string | null | undefined): boolean {
  return !!id && adminUserIds().includes(id);
}

/**
 * Returns the currently signed-in user IFF they're on the admin allowlist,
 * otherwise null. Use at the top of every admin page / route to gate access.
 */
export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUserId(user.id)) return null;
  return user;
}
