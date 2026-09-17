// Admin-only curation view. Gated to ADMIN_USER_IDS like /admin/users —
// strangers get a 404, never the curation UI.

import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/guard";
import AdminClient from "@/components/admin/AdminClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin) notFound();

  return <AdminClient />;
}
