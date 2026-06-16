// Admin-only support view: lists every user with a "View as" action that opens
// an impersonated session (see /api/admin/impersonate). Gated to ADMIN_USER_IDS.
//
// Server component: the user list is fetched with the service-role client
// (bypasses RLS), so this must never become a client component.

import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import AdminUsersTable, { type AdminUserRow } from "@/components/admin/AdminUsersTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  const service = createServiceClient();

  const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  const authUsers = list?.users ?? [];

  const { data: profiles } = await service
    .from("profiles")
    .select("user_id, display_name, studio_name, onboarding_complete");
  const byId = new Map<string, { display_name: string | null; studio_name: string | null; onboarding_complete: boolean }>(
    (profiles ?? []).map((p) => [p.user_id as string, p as never]),
  );

  const rows: AdminUserRow[] = authUsers
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "—",
        displayName: p?.display_name ?? null,
        studioName: p?.studio_name ?? null,
        onboarded: !!p?.onboarding_complete,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Users</h1>
      <p style={{ fontSize: 13, color: "var(--color-text-muted, #6b7280)", marginBottom: 24 }}>
        {rows.length} {rows.length === 1 ? "account" : "accounts"} · signed in as {admin.email}
      </p>
      <AdminUsersTable rows={rows} currentAdminId={admin.id} />
    </div>
  );
}
