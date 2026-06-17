// Tiny server check: is the signed-in user on the ADMIN_USER_IDS allowlist?
// The sidebar (a client component) calls this to decide whether to show the
// admin "Users" support link. The allowlist itself never reaches the client —
// only the resulting boolean does.

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminUser();
  return NextResponse.json({ isAdmin: !!admin });
}
