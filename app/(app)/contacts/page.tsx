import { createClient } from "@/lib/supabase/server";
import ContactsClient from "@/components/contacts/ContactsClient";
import type { Contact } from "@/types/database";

export default async function ContactsPage() {
  const supabase = await createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*, company:companies(*)")
    .eq("archived", false)
    .order("last_name", { ascending: true });

  return <ContactsClient initialContacts={(contacts ?? []) as Contact[]} />;
}
