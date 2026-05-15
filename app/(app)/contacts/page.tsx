import { createClient } from "@/lib/supabase/server";
import ContactsClient from "@/components/contacts/ContactsClient";
import type { Contact } from "@/types/database";

export default async function ContactsPage() {
  const supabase = await createClient();

  // We fetch active + archived together so the contacts options menu can
  // toggle archived visibility without a refetch. Default UI hides archived.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*, company:companies(*)")
    .order("last_name", { ascending: true });

  return <ContactsClient initialContacts={(contacts ?? []) as Contact[]} />;
}
