// Cross-module file index for the Resources panel.
//
// LinkedFile is the flat, uniform shape we surface in the Resources "Linked
// from elsewhere" rail. It aggregates files attached to other entities
// (contacts, organizations, projects) so the user has a single index of every
// file in their workspace without us having to add a new table.
//
// Rows are READ-ONLY in Resources — to edit / delete, the user jumps to the
// source entity via deepLinkForLinkedFile().

export type LinkedFileSource = "contact" | "organization" | "project";

export interface LinkedFile {
  /** Stable id with `<source>:<row-id>` prefix so groups can't collide. */
  id:           string;
  source:       LinkedFileSource;
  /** id of the parent entity (contact_id / organization_id / project_id). */
  source_id:    string;
  /** Human-readable parent name for the rail row caption. */
  source_name:  string;
  file_name:    string;
  file_url:     string;
  file_type:    string | null;
  created_at:   string;
}

/** Sub-group config for the "Linked from elsewhere" rail. The order here is
 *  the order they render in the rail when visible. */
export const LINKED_FILE_GROUPS: { source: LinkedFileSource; label: string; sub: string }[] = [
  { source: "contact",      label: "From contacts",      sub: "Files attached to a contact" },
  { source: "organization", label: "From organizations", sub: "Files attached to an organization" },
  { source: "project",      label: "From projects",      sub: "Files attached to a project" },
];

/** Where to send the user when they click "View in <Source>" on a linked
 *  file row. Each module already supports the corresponding query param. */
export function deepLinkForLinkedFile(f: LinkedFile): string {
  switch (f.source) {
    case "contact":      return `/network?contactId=${f.source_id}&tab=files`;
    case "organization": return `/network?organizationId=${f.source_id}&tab=files`;
    case "project":      return `/projects?projectId=${f.source_id}&tab=files`;
  }
}
