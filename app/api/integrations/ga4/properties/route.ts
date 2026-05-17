import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function refreshTokenIfNeeded(integration: IntegrationRow): Promise<string | null> {
  const now = new Date();
  const expires = integration.token_expires_at ? new Date(integration.token_expires_at) : null;

  if (expires && expires > now) {
    return integration.access_token;
  }

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
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  const supabase = await createClient();
  await supabase.from("integrations")
    .update({ access_token, token_expires_at: expiresAt })
    .eq("id", integration.id);

  return access_token;
}

// GET — list all GA4 properties the user has access to
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "google_analytics")
    .maybeSingle();

  if (!integration?.access_token) {
    return NextResponse.json({ error: "Not connected to Google Analytics" }, { status: 404 });
  }

  const accessToken = await refreshTokenIfNeeded(integration as IntegrationRow);
  if (!accessToken) return NextResponse.json({ error: "Could not refresh token" }, { status: 401 });

  // Use Admin API to list all GA4 properties
  const accountsRes = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!accountsRes.ok) {
    const err = await accountsRes.text();
    console.error("GA4 account summaries failed:", err);
    return NextResponse.json({ error: "Failed to list properties" }, { status: 502 });
  }

  const data = await accountsRes.json() as AccountSummariesResponse;
  const properties: PropertyOption[] = [];

  for (const account of data.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      // Only include GA4 properties (not Universal Analytics)
      if (prop.propertyType === "PROPERTY_TYPE_ORDINARY") {
        properties.push({
          property:     prop.property,       // e.g. "properties/123456789"
          displayName:  prop.displayName,
          account:      account.displayName,
          propertyId:   prop.property.replace("properties/", ""),
        });
      }
    }
  }

  return NextResponse.json({ properties });
}

// POST — save the selected property
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { propertyId, displayName } = await req.json() as { propertyId: string; displayName: string };
  if (!propertyId) return NextResponse.json({ error: "propertyId required" }, { status: 400 });

  // Update the integration with the selected property
  const { data: existing } = await supabase
    .from("integrations")
    .select("id, metadata")
    .eq("user_id", user.id)
    .eq("provider", "google_analytics")
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "No GA4 integration found" }, { status: 404 });

  const meta = (existing.metadata as Record<string, unknown>) ?? {};

  await supabase.from("integrations").update({
    account_id:    propertyId,
    account_name:  displayName,
    metadata:      { ...meta, property_id: propertyId, property_name: displayName, step: "connected" },
    last_synced_at: new Date().toISOString(),
  }).eq("id", existing.id);

  return NextResponse.json({ ok: true });
}

interface IntegrationRow {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface PropertyOption {
  property: string;
  displayName: string;
  account: string;
  propertyId: string;
}

interface AccountSummariesResponse {
  accountSummaries?: {
    displayName: string;
    propertySummaries?: {
      property: string;
      displayName: string;
      propertyType: string;
    }[];
  }[];
}
