// POST /api/integrations/google/drive/link
//
// Body: { files: [{ id, name, mimeType?, webViewLink, iconLink? }], category?: 'operations'|'brand'|'press'|'design' }
//
// Creates one resources row per file as item_type='link' with the
// Drive webViewLink stored in external_url. We never copy file
// contents into Supabase Storage — this is purely a reference link.
// Dedup is by external_url (within the user's resources).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface InboundFile {
  id:           string;
  name:         string;
  mimeType?:    string;
  webViewLink?: string;
  iconLink?:    string;
}

const ALLOWED_CATEGORIES = ["operations", "brand", "press", "design"] as const;
type Category = typeof ALLOWED_CATEGORIES[number];

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { files?: InboundFile[]; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const files = (body.files ?? []).filter((f) => f && f.id && f.name && f.webViewLink);
  if (files.length === 0) {
    return NextResponse.json({ error: "no_files" }, { status: 400 });
  }

  const category: Category = (ALLOWED_CATEGORIES as readonly string[]).includes(body.category ?? "")
    ? (body.category as Category)
    : "brand";

  // Dedup: skip any already-linked Drive URLs.
  const incomingUrls = files.map((f) => f.webViewLink!);
  const { data: existing } = await supabase
    .from("resources")
    .select("external_url")
    .eq("user_id", user.id)
    .in("external_url", incomingUrls);

  const already = new Set((existing ?? []).map((r) => r.external_url as string));
  const toInsert = files.filter((f) => !already.has(f.webViewLink!));

  if (toInsert.length === 0) {
    return NextResponse.json({ linked: 0, skipped: files.length });
  }

  const rows = toInsert.map((f) => ({
    user_id:      user.id,
    category,
    name:         f.name,
    meta:         f.mimeType ?? "Google Drive file",
    item_type:    "link" as const,
    status:       "complete" as const,
    preview_type: "external_url",
    preview_data: {
      icon_url:  f.iconLink ?? null,
      mime_type: f.mimeType ?? null,
      source:    "google_drive",
      drive_id:  f.id,
    },
    external_url: f.webViewLink!,
  }));

  const { error: insertErr, count } = await supabase
    .from("resources")
    .insert(rows, { count: "exact" });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    linked:  count ?? rows.length,
    skipped: files.length - rows.length,
  });
}
