import { createClient } from "@/lib/supabase/server";
import PresenceClient from "@/components/presence/PresenceClient";
import type { Opportunity } from "@/types/database";

export default async function PresencePage() {
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("*")
    .or(`end_date.gte.${today},end_date.is.null,start_date.gte.${today}`)
    .neq("user_status", "hidden")
    .order("start_date", { ascending: true, nullsFirst: false });

  return (
    <PresenceClient initialOpportunities={(opportunities ?? []) as Opportunity[]} />
  );
}
