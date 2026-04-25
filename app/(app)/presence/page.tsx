import { createClient } from "@/lib/supabase/server";
import PresenceClient from "@/components/presence/PresenceClient";
import ComingSoonOverlay from "@/components/layout/ComingSoonOverlay";
import type { Opportunity } from "@/types/database";

export default async function PresencePage() {
  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("*")
    .or(`end_date.gte.${today},end_date.is.null,start_date.gte.${today}`)
    .order("start_date", { ascending: true, nullsFirst: false });

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      <PresenceClient initialOpportunities={(opportunities ?? []) as Opportunity[]} />
      <ComingSoonOverlay
        module="Presence"
        description="Track your website, social reach, newsletter, and upcoming opportunities — all from one place."
      />
    </div>
  );
}
