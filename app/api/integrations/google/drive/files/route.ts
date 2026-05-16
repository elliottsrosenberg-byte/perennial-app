// GET /api/integrations/google/drive/files — paginated list of the
// user's Drive files via drive.files.list. Used by the Drive picker
// in Settings.
//
// Query params:
//   - q          : Drive search query (e.g. "name contains 'invoice'")
//                  defaults to "trashed = false"
//   - pageToken  : pagination cursor from a prior response
//   - pageSize   : 1..100, defaults to 30
//
// We only request `drive.metadata.readonly` (set up earlier), so we
// never read file contents — just the metadata needed to display + link.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGoogleAccessToken } from "@/lib/integrations/google-tokens";

export const runtime = "nodejs";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const FIELDS    = [
  "nextPageToken",
  "files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,size,owners(displayName,emailAddress))",
].join(",");

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const q          = url.searchParams.get("q")         ?? "";
  const pageToken  = url.searchParams.get("pageToken") ?? undefined;
  const pageSize   = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "30", 10)));
  const accountId  = url.searchParams.get("account_id");

  // Find an active Google integration with the drive sub-scope.
  let query = supabase
    .from("integrations")
    .select("id, scopes, account_id, account_name")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .eq("status",   "active");
  if (accountId) query = query.eq("account_id", accountId);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const usable = (rows ?? []).find((r) => (r.scopes as Record<string, boolean>)?.drive);
  if (!usable) {
    return NextResponse.json({
      error: "no_drive_scope",
      hint:  "Reconnect Google with Drive granted (Settings → Integrations → ✕ → reconnect).",
    }, { status: 404 });
  }

  const token = await getValidGoogleAccessToken(usable.id);

  // Build the Drive query. Default is "trashed = false" so we don't
  // surface garbage; user-supplied q is AND-ed onto that.
  const driveQ = q.trim()
    ? `trashed = false and (${q.trim()})`
    : "trashed = false";

  const driveUrl = new URL(DRIVE_API);
  driveUrl.searchParams.set("q",         driveQ);
  driveUrl.searchParams.set("pageSize",  String(pageSize));
  driveUrl.searchParams.set("fields",    FIELDS);
  driveUrl.searchParams.set("orderBy",   "modifiedTime desc");
  // includeItemsFromAllDrives = false because most users only care about
  // their personal Drive at this stage. Future: surface a toggle if shared
  // drives matter.
  if (pageToken) driveUrl.searchParams.set("pageToken", pageToken);

  const res = await fetch(driveUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json({ error: "drive_list_failed", status: res.status, detail: body.slice(0, 300) }, { status: 502 });
  }
  const json = await res.json();
  return NextResponse.json({
    files:         json.files ?? [],
    nextPageToken: json.nextPageToken ?? null,
    integration_id: usable.id,
    account_name:   usable.account_name,
  });
}
