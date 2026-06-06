// Cross-module file index for the Resources panel.
//
// LinkedFile is the flat, uniform shape we surface in the Resources "Linked
// from elsewhere" rail. It aggregates files attached to other entities
// (contacts, organizations, projects) so the user has a single index of every
// file in their workspace without us having to add a new table.
//
// Rows are READ-ONLY in Resources — to edit / delete, the user jumps to the
// source entity via deepLinkForLinkedFile().

export type LinkedFileSource =
  | "contact" | "organization" | "project"
  | "receipt" | "invoice" | "studio";

export interface LinkedFile {
  /** Stable id with `<source>:<row-id>` prefix so groups can't collide. */
  id:           string;
  source:       LinkedFileSource;
  /** id of the parent entity (contact_id / organization_id / project_id / …). */
  source_id:    string;
  /** Human-readable parent name for the rail row caption. */
  source_name:  string;
  file_name:    string;
  file_url:     string;
  file_type:    string | null;
  created_at:   string;
  /** Precise "view in source" deep link. When set, overrides the per-source
   *  default in deepLinkForLinkedFile — lets the indexer point straight at a
   *  specific invoice, etc. */
  href?:        string;
}

/** Sub-group config for the "Linked from elsewhere" rail. The order here is
 *  the order they render in the rail when visible. */
export const LINKED_FILE_GROUPS: { source: LinkedFileSource; label: string; sub: string }[] = [
  { source: "contact",      label: "From contacts",      sub: "Files attached to a contact" },
  { source: "organization", label: "From organizations", sub: "Files attached to an organization" },
  { source: "project",      label: "From projects",      sub: "Files attached to a project" },
  { source: "invoice",      label: "From invoices",      sub: "Invoices & their attachments" },
  { source: "receipt",      label: "Receipts",           sub: "Receipts on expenses & transactions" },
  { source: "studio",       label: "Studio brand",       sub: "Logo & brand assets" },
];

/** Where to send the user when they click "View in <Source>" on a linked
 *  file row. Prefers the row's precise href; otherwise the module default. */
export function deepLinkForLinkedFile(f: LinkedFile): string {
  if (f.href) return f.href;
  switch (f.source) {
    case "contact":      return `/network?contactId=${f.source_id}&tab=files`;
    case "organization": return `/network?organizationId=${f.source_id}&tab=files`;
    case "project":      return `/projects?projectId=${f.source_id}&tab=files`;
    case "invoice":      return `/finance?tab=invoices&invoice=${f.source_id}`;
    case "receipt":      return `/finance?tab=banking`;
    case "studio":       return `/settings`;
  }
}
