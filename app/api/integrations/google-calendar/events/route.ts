import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function refreshToken(integration: IntegrationRow): Promise<string | null> {
  const now     = new Date();
  const expires = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  if (expires && expires > now) return integration.access_token;
  if (!integration.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
    }),
  });

  if (!res.ok) return null;
  const { access_token, expires_in } = await res.json() as { access_token: string; expires_in: number };

  const supabase = await createClient();
  await supabase.from("integrations").update({
    access_token,
    token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  }).eq("id", integration.id);

  return access_token;
}

// GET /api/integrations/google-calendar/events?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate   = searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "google_calendar")
    .maybeSingle();

  if (!integration?.access_token) {
    return NextResponse.json({ connected: false, events: [] });
  }

  const token = await refreshToken(integration as IntegrationRow);
  if (!token) return NextResponse.json({ connected: true, error: "Token expired", events: [] });

  // Fetch primary calendar events
  const timeMin = new Date(startDate + "T00:00:00").toISOString();
  const timeMax = new Date(endDate   + "T23:59:59").toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy:      "startTime",
    maxResults:   "100",
  });

  const eventsRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!eventsRes.ok) {
    const err = await eventsRes.text();
    console.error("GCal events fetch failed:", err);
    return NextResponse.json({ connected: true, error: "Failed to fetch events", events: [] });
  }

  const data = await eventsRes.json() as GCalEventList;

  const events: CalendarEvent[] = (data.items ?? [])
    .filter(e => e.status !== "cancelled")
    .map(e => {
      const isAllDay = !!e.start.date;
      return {
        id:          e.id,
        title:       e.summary ?? "(No title)",
        start:       e.start.dateTime ?? e.start.date ?? "",
        end:         e.end.dateTime   ?? e.end.date   ?? "",
        allDay:      isAllDay,
        description: e.description ?? null,
        location:    e.location ?? null,
        htmlLink:    e.htmlLink ?? null,
        colorId:     e.colorId ?? null,
        calendar:    "primary",
      };
    });

  // Update last_synced_at
  await supabase.from("integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", integration.id);

  return NextResponse.json({ connected: true, events });
}

// DELETE — disconnect Google Calendar
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("integrations").delete()
    .eq("user_id", user.id)
    .eq("provider", "google_calendar");

  return NextResponse.json({ ok: true });
}

interface IntegrationRow {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface GCalEventList {
  items?: GCalEvent[];
}

interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  colorId?: string;
  htmlLink?: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description: string | null;
  location: string | null;
  htmlLink: string | null;
  colorId: string | null;
  calendar: string;
}
