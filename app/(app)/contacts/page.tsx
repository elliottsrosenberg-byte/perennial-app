import { createClient } from "@/lib/supabase/server";
import Topbar from "@/components/layout/Topbar";
import ContactsClient from "@/components/contacts/ContactsClient";
import type { Contact } from "@/types/database";

export default async function ContactsPage() {
  const supabase = await createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*, company:companies(*)")
    .order("last_name", { ascending: true });

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Contacts" />
      <ContactsClient initialContacts={(contacts ?? []) as Contact[]} />
    </div>
  );
}
