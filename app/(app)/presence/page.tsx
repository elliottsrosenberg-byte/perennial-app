import { createClient } from "@/lib/supabase/server";
import PresenceClient from "@/components/presence/PresenceClient";
import type { Opportunity } from "@/types/database";

export default async function PresencePage() {
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: opportunities }, { data: { user } }] = await Promise.all([
    supabase
      .from("opportunities")
      .select("*")
      .eq("status", "published")
      // Upcoming by either the event window or the application deadline.
      .or(`end_date.gte.${today},end_date.is.null,start_date.gte.${today},application_deadline.gte.${today}`)
      .order("start_date", { ascending: true, nullsFirst: false }),
    supabase.auth.getUser(),
  ]);

  // Per-user status overlay (saved/applied/…/hidden) + practice types for
  // discipline matching. Statuses live in opportunity_user_status, not on
  // the shared feed row.
  let practiceTypes: string[] = [];
  const statusById = new Map<string, string>();
  if (user) {
    const [{ data: profile }, { data: statuses }] = await Promise.all([
      supabase.from("profiles").select("practice_types").eq("user_id", user.id).maybeSingle(),
      supabase.from("opportunity_user_status").select("opportunity_id, status").eq("user_id", user.id),
    ]);
    practiceTypes = (profile?.practice_types as string[] | null) ?? [];
    for (const s of statuses ?? []) statusById.set(s.opportunity_id as string, s.status as string);
  }

  const merged = ((opportunities ?? []) as Opportunity[])
    .map((o) => ({ ...o, user_status: statusById.get(o.id) ?? null }))
    .filter((o) => o.user_status !== "hidden");

  return (
    <PresenceClient
      initialOpportunities={merged}
      practiceTypes={practiceTypes}
    />
  );
}
