import { createClient } from "@/lib/supabase/server";
import ResourcesClient from "@/components/resources/ResourcesClient";
import ResourcesIntroModal from "@/components/tour/resources/ResourcesIntroModal";
import ResourcesTooltipTour from "@/components/tour/resources/ResourcesTooltipTour";
import type { Resource, ResourceLink } from "@/types/database";
import {
  hydrateResourcesFromProfile,
  type HydrationProfile,
} from "@/lib/resources/onboarding-hydrate";
import type { LinkedFile } from "@/lib/resources/linked-files";

export default async function ResourcesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fan-out parallel reads:
  //  - resources / resource_links (owned by user via RLS)
  //  - profiles (drives onboarding hydration + the "continue your brand" banner)
  //  - contact_files / organization_files / project_files (cross-module file index)
  // The cross-module rows include a join to the parent so we can render
  // human-readable source names ("Files attached to: <name>") in the rail.
  const [
    { data: resources },
    { data: links },
    { data: profile },
    { data: contactFiles },
    { data: orgFiles },
    { data: projectFiles },
    { data: invoiceAttachments },
    { data: invoiceDocs },
    { data: expenseReceipts },
    { data: txnReceipts },
  ] = await Promise.all([
    supabase.from("resources").select("*").order("position", { ascending: true }),
    supabase.from("resource_links").select("*").order("created_at", { ascending: true }),
    user
      ? supabase.from("profiles").select(
          "studio_name, display_name, tagline, bio, location, practice_types, selling_channels, work_types, perennial_goals, logo_url",
        ).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("contact_files")
      .select("id, name, url, file_type, created_at, contact_id, contact:contacts(id, first_name, last_name)")
      .order("created_at", { ascending: false }),
    supabase.from("organization_files")
      .select("id, name, url, file_type, created_at, organization_id, organization:organizations(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("project_files")
      .select("id, name, url, file_type, created_at, project_id, project:projects(id, title)")
      .order("created_at", { ascending: false }),
    // Files that already live in Finance — surfaced read-only, never copied.
    supabase.from("invoice_attachments")
      .select("id, name, url, file_type, created_at, invoice_id, invoice:invoices(number)")
      .order("created_at", { ascending: false }),
    supabase.from("invoices")
      .select("id, number, status, public_token, created_at, client_contact:contacts(first_name, last_name), client_organization:organizations(name)")
      .not("status", "in", "(draft,saved)")
      .order("created_at", { ascending: false }),
    supabase.from("expenses")
      .select("id, description, category, receipt_url, created_at")
      .not("receipt_url", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("bank_transactions")
      .select("id, description, custom_name, receipt_url, created_at")
      .not("receipt_url", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  // Server-side onboarding hydration: fill empty resource fields from the
  // profile answers (never overwrite user edits). Hydrated rows graduate from
  // "empty" → "partial" so the user sees they have a head start.
  let hydratedResources = (resources ?? []) as Resource[];
  if (profile && user) {
    hydratedResources = await hydrateResourcesFromProfile(
      supabase,
      hydratedResources,
      profile as HydrationProfile,
      user.id,
    );
  }

  // Flatten cross-module files into a single LinkedFile[] list. The client
  // groups by source for rail display; we keep the shape uniform here so the
  // client doesn't need to know about each underlying table.
  const linkedFiles: LinkedFile[] = [
    ...(contactFiles ?? []).map((f): LinkedFile => {
      // Supabase relational selects may type joined rows as arrays — normalize.
      const c = Array.isArray(f.contact) ? f.contact[0] : f.contact;
      const name = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "Contact";
      return {
        id: `contact:${f.id}`,
        source: "contact",
        source_id: f.contact_id,
        source_name: name || "Contact",
        file_name: f.name,
        file_url: f.url,
        file_type: f.file_type,
        created_at: f.created_at,
      };
    }),
    ...(orgFiles ?? []).map((f): LinkedFile => {
      const o = Array.isArray(f.organization) ? f.organization[0] : f.organization;
      return {
        id: `organization:${f.id}`,
        source: "organization",
        source_id: f.organization_id,
        source_name: o?.name ?? "Organization",
        file_name: f.name,
        file_url: f.url,
        file_type: f.file_type,
        created_at: f.created_at,
      };
    }),
    ...(projectFiles ?? []).map((f): LinkedFile => {
      const p = Array.isArray(f.project) ? f.project[0] : f.project;
      return {
        id: `project:${f.id}`,
        source: "project",
        source_id: f.project_id,
        source_name: p?.title ?? "Project",
        file_name: f.name,
        file_url: f.url,
        file_type: f.file_type,
        created_at: f.created_at,
      };
    }),
    // Invoice attachments (real files in the receipts bucket).
    ...(invoiceAttachments ?? []).map((f): LinkedFile => {
      const inv = Array.isArray(f.invoice) ? f.invoice[0] : f.invoice;
      return {
        id: `invoice-att:${f.id}`,
        source: "invoice",
        source_id: f.invoice_id,
        source_name: inv?.number != null ? `Invoice #${inv.number}` : "Invoice",
        file_name: f.name,
        file_url: f.url,
        file_type: f.file_type,
        created_at: f.created_at,
        href: `/finance?tab=invoices&invoice=${f.invoice_id}`,
      };
    }),
    // Invoices themselves, as documents — linked to the hosted invoice, not a
    // duplicated/generated PDF.
    ...(invoiceDocs ?? []).map((inv): LinkedFile => {
      const c = Array.isArray(inv.client_contact) ? inv.client_contact[0] : inv.client_contact;
      const o = Array.isArray(inv.client_organization) ? inv.client_organization[0] : inv.client_organization;
      const who = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : (o?.name ?? "");
      return {
        id: `invoice-doc:${inv.id}`,
        source: "invoice",
        source_id: inv.id,
        source_name: who || `Invoice #${inv.number}`,
        file_name: `Invoice #${inv.number} · ${inv.status}`,
        file_url: inv.public_token ? `/i/${inv.public_token}` : `/invoice/${inv.id}/print`,
        file_type: "invoice",
        created_at: inv.created_at,
        href: `/finance?tab=invoices&invoice=${inv.id}`,
      };
    }),
    // Receipts on expenses + bank transactions (real files in the receipts bucket).
    ...(expenseReceipts ?? []).map((e): LinkedFile => ({
      id: `receipt-exp:${e.id}`,
      source: "receipt",
      source_id: e.id,
      source_name: e.description || e.category || "Expense",
      file_name: `Receipt — ${e.description || e.category || "expense"}`,
      file_url: e.receipt_url as string,
      file_type: null,
      created_at: e.created_at,
      href: "/finance?tab=banking",
    })),
    ...(txnReceipts ?? []).map((t): LinkedFile => ({
      id: `receipt-txn:${t.id}`,
      source: "receipt",
      source_id: t.id,
      source_name: t.custom_name || t.description || "Transaction",
      file_name: `Receipt — ${t.custom_name || t.description || "transaction"}`,
      file_url: t.receipt_url as string,
      file_type: null,
      created_at: t.created_at,
      href: "/finance?tab=banking",
    })),
    // Studio logo from Settings.
    ...(((profile as { logo_url?: string | null } | null)?.logo_url)
      ? [{
          id: "studio:logo",
          source: "studio" as const,
          source_id: "logo",
          source_name: "Studio brand",
          file_name: "Studio logo",
          file_url: (profile as { logo_url: string }).logo_url,
          file_type: "image",
          created_at: "1970-01-01T00:00:00Z",
          href: "/settings",
        } as LinkedFile]
      : []),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // Whether to surface the "Continue your brand setup" banner. We let the
  // client decide based on localStorage; the server flag is just "is there
  // anything in onboarding to surface in the first place?".
  const showOnboardingBanner = Boolean(
    profile &&
      ((profile as HydrationProfile).studio_name ||
        ((profile as HydrationProfile).practice_types?.length ?? 0) > 0),
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ResourcesClient
        initialResources={hydratedResources}
        initialLinks={(links ?? []) as ResourceLink[]}
        initialLinkedFiles={linkedFiles}
        showOnboardingBanner={showOnboardingBanner}
        studioName={(profile as HydrationProfile | null)?.studio_name ?? null}
      />
      <ResourcesIntroModal />
      <ResourcesTooltipTour />
    </div>
  );
}
