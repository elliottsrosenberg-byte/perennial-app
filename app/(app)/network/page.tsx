import { createClient } from "@/lib/supabase/server";
import NetworkClient from "@/components/network/NetworkClient";
import type { Contact, Organization } from "@/types/database";

export default async function NetworkPage() {
  const supabase = await createClient();

  // We fetch active + archived together so the options menu can toggle
  // archived visibility without a refetch. Default UI hides archived.
  // Contacts + organizations load in parallel — both feed NetworkClient,
  // which hosts the three views (contacts, leads, organizations) of the
  // relationship graph.
  const [{ data: contacts }, { data: organizations }] = await Promise.all([
    supabase.from("contacts").select("*, organization:organizations(*)").order("last_name", { ascending: true }),
    supabase.from("organizations").select("*").order("name", { ascending: true }),
  ]);

  return (
    <NetworkClient
      initialContacts={(contacts ?? []) as Contact[]}
      initialOrganizations={(organizations ?? []) as Organization[]}
    />
  );
}
