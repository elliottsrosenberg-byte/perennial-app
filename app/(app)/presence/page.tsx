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
      // Exclude only explicitly-hidden rows. `.neq` alone drops NULL-status
      // rows (SQL: NULL <> 'hidden' is NULL → excluded), which silently hid
      // the entire feed since curated rows have no user_status.
      .or("user_status.is.null,user_status.neq.hidden")
      .order("start_date", { ascending: true, nullsFirst: false }),
    supabase.auth.getUser(),
  ]);

  // Pull the user's practice types so the feed can recommend matching
  // opportunities by discipline.
  let practiceTypes: string[] = [];
  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("practice_types").eq("id", user.id).maybeSingle();
    practiceTypes = (profile?.practice_types as string[] | null) ?? [];
  }

  return (
    <PresenceClient
      initialOpportunities={(opportunities ?? []) as Opportunity[]}
      practiceTypes={practiceTypes}
    />
  );
}
