import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function refreshTokenIfNeeded(integration: IntegrationRow): Promise<string | null> {
  const now = new Date();
  const expires = integration.token_expires_at ? new Date(integration.token_expires_at) : null;
  if (expires && expires > now) return integration.access_token;
  if (!integration.refresh_token) return null;

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
    }),
  });

  if (!refreshRes.ok) return null;
  const { access_token, expires_in } = await refreshRes.json() as { access_token: string; expires_in: number };
  const supabase = await createClient();
  await supabase.from("integrations").update({
    access_token,
    token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  }).eq("id", integration.id);
  return access_token;
}

async function runReport(propertyId: string, token: string, request: object) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(request),
    }
  );
  if (!res.ok) throw new Error(`GA4 report failed: ${await res.text()}`);
  return res.json() as Promise<GA4ReportResponse>;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "ga4")
    .maybeSingle();

  if (!integration?.access_token) return NextResponse.json({ connected: false });

  const meta = integration.metadata as Record<string, unknown>;
  if (meta.step === "select_property" || !meta.property_id) {
    return NextResponse.json({ connected: true, step: "select_property" });
  }

  const propertyId = meta.property_id as string;
  const token = await refreshTokenIfNeeded(integration as IntegrationRow);
  if (!token) return NextResponse.json({ connected: true, error: "Token expired — please reconnect." });

  // Run 3 reports in parallel
  const [summaryReport, pagesReport, channelReport] = await Promise.allSettled([
    // Overall stats (last 30 days)
    runReport(propertyId, token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
        { name: "screenPageViews" },
      ],
    }),
    // Top pages
    runReport(propertyId, token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics:    [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "averageSessionDuration" }],
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      orderBys:   [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    }),
    // Traffic channels
    runReport(propertyId, token, {
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      metrics:    [{ name: "sessions" }, { name: "activeUsers" }],
      dimensions: [{ name: "sessionDefaultChannelGrouping" }],
      orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
    }),
  ]);

  // Extract summary
  const summary = summaryReport.status === "fulfilled" ? summaryReport.value : null;
  const summaryRow = summary?.rows?.[0];
  const mv = (idx: number) => parseFloat(summaryRow?.metricValues?.[idx]?.value ?? "0");

  const stats = {
    sessions:        Math.round(mv(0)),
    active_users:    Math.round(mv(1)),
    bounce_rate:     parseFloat((mv(2) * 100).toFixed(1)),
    avg_session_sec: Math.round(mv(3)),
    pageviews:       Math.round(mv(4)),
    property_name:   meta.property_name as string,
    property_id:     propertyId,
  };

  // Top pages
  const pages = pagesReport.status === "fulfilled"
    ? (pagesReport.value.rows ?? []).slice(0, 8).map(row => ({
        path:       row.dimensionValues?.[0]?.value ?? "",
        title:      row.dimensionValues?.[1]?.value ?? "",
        pageviews:  parseInt(row.metricValues?.[0]?.value ?? "0"),
        users:      parseInt(row.metricValues?.[1]?.value ?? "0"),
        avg_sec:    parseFloat(row.metricValues?.[2]?.value ?? "0"),
      }))
    : [];

  // Channels
  const totalSessions = stats.sessions || 1;
  const channels = channelReport.status === "fulfilled"
    ? (channelReport.value.rows ?? []).map(row => ({
        channel:  row.dimensionValues?.[0]?.value ?? "Unknown",
        sessions: parseInt(row.metricValues?.[0]?.value ?? "0"),
        pct:      parseFloat(((parseInt(row.metricValues?.[0]?.value ?? "0") / totalSessions) * 100).toFixed(1)),
      }))
    : [];

  const result = {
    connected:    true,
    last_fetched: new Date().toISOString(),
    ...stats,
    top_pages: pages,
    channels,
  };

  // Cache in integration metadata
  await supabase.from("integrations").update({
    metadata:       { ...meta, ...result, step: "connected" },
    last_synced_at: new Date().toISOString(),
  }).eq("id", integration.id);

  return NextResponse.json(result);
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
export { fmtDuration };

interface IntegrationRow {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface GA4ReportResponse {
  rows?: {
    dimensionValues?: { value: string }[];
    metricValues?:    { value: string }[];
  }[];
}
