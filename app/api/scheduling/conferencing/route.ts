// Conferencing settings for scheduling links. Google Meet / Teams are derived
// from the connected calendar integrations (auto-available); Zoom is a saved
// personal meeting link stored in profiles.conferencing. Owner-gated session.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [{ data: profile }, { data: intgs }] = await Promise.all([
    supabase.from("profiles").select("conferencing").eq("user_id", user.id).maybeSingle(),
    supabase.from("integrations").select("provider, status, scopes").eq("user_id", user.id)
      .in("provider", ["google", "google_calendar", "microsoft"]),
  ]);

  const calScoped = (p: string) =>
    (intgs ?? []).some((i) => {
      const fam = i.provider === "google_calendar" ? "google" : i.provider;
      if (fam !== p) return false;
      if (i.status && i.status !== "active") return false;
      return i.provider === "google_calendar" || !!(i.scopes as Record<string, boolean> | null)?.calendar;
    });

  return NextResponse.json({
    zoom_url:        ((profile?.conferencing as { zoom_url?: string } | null)?.zoom_url ?? "") || "",
    google_connected: calScoped("google"),
    teams_connected:  calScoped("microsoft"),
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { zoom_url?: string };
  const { data: profile } = await supabase
    .from("profiles").select("conferencing").eq("user_id", user.id).maybeSingle();
  const current = (profile?.conferencing as Record<string, unknown> | null) ?? {};
  const next = { ...current, zoom_url: (body.zoom_url ?? "").trim() || undefined };

  const { error } = await supabase
    .from("profiles").update({ conferencing: next, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, zoom_url: next.zoom_url ?? "" });
}
