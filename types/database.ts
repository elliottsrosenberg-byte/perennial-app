// Project status / type / priority are user-customisable via the Project
// options menu, so these are runtime-defined strings rather than fixed
// literal unions. The default keys are seeded into profiles.project_options
// at signup; see lib/projects/options.ts for the canonical defaults.
export type ProjectType     = string;
export type ProjectStatus   = string;
export type ProjectPriority = string;

export interface Project {
  id: string;
  user_id: string;
  title: string;
  type: ProjectType | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  start_date: string | null;
  due_date: string | null;
  description:  string | null;
  canvas_html:  string | null;
  // Artwork / object fields
  listing_price: number | null;
  dimensions: string | null;
  weight: string | null;
  materials: string | null;
  // Client project fields
  client_name: string | null;
  rate: number | null;
  billed_hours: number;
  est_value: number | null;
  created_at: string;
  updated_at: string;
  // Joined
  tasks?: Task[];
}

export interface Task {
  id:             string;
  project_id:     string | null;
  contact_id:      string | null;
  organization_id: string | null;
  opportunity_id:  string | null;
  target_id:       string | null;
  user_id:         string;
  title:           string;
  completed:       boolean;
  due_date:        string | null;
  /** Optional time-of-day. When set, the calendar promotes the task from
   *  the all-day tasks ribbon into the time grid at this exact moment.
   *  Should be kept consistent with due_date (due_at::date === due_date).
   *  Null = date-only / no time. */
  due_at:          string | null;
  priority:        "high" | "medium" | "low" | null;
  notes:           string | null;
  created_at:      string;
  // Joined
  project?:      { id: string; title: string } | null;
  contact?:      { id: string; first_name: string; last_name: string } | null;
  organization?: { id: string; name: string } | null;
  opportunity?:  { id: string; title: string; category: string } | null;
  target?:       { id: string; name: string; pipeline_id: string; pipeline?: { name: string; color: string } | null } | null;
}

export interface Note {
  id: string;
  user_id: string;
  project_id: string | null;
  contact_id: string | null;
  organization_id: string | null;
  opportunity_id: string | null;
  title: string | null;
  content: string | null;
  pinned: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  project?: { id: string; title: string } | null;
  contact?: { id: string; first_name: string; last_name: string } | null;
  organization?: { id: string; name: string } | null;
  opportunity?: { id: string; title: string; category: string } | null;
}

// `Reminder` was merged into `Task`. The `reminders` table still exists in
// Postgres with historical rows but nothing in the app reads from it; the
// table can be dropped in a follow-up migration once we're sure nothing
// external depends on it.

// ── Contacts ─────────────────────────────────────────────────────────────────

export type ContactStatus = "active" | "inactive" | "former_client";
export type LeadStage = "new" | "reached_out" | "in_conversation" | "proposal_sent" | "qualified" | "nurturing" | "lost";

export type ContactActivityType = "email" | "call" | "note" | "meeting";

export interface Organization {
  id: string;
  user_id: string;
  name: string;
  website: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  description: string | null;
  avatar_url: string | null;
  canvas_html: string | null;
  tags: string[];
  archived: boolean;
  last_touched_at: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationFile {
  id:              string;
  organization_id: string;
  user_id:         string;
  name:            string;
  url:             string;
  file_type:       string | null;
  size_bytes:      number | null;
  created_at:      string;
}

export interface OrganizationActivity {
  id:              string;
  user_id:         string;
  organization_id: string;
  type:            ContactActivityType;
  content:         string | null;
  occurred_at:     string;
  metadata:        Record<string, unknown> | null;
  created_at:      string;
}

export interface ContactFile {
  id:         string;
  contact_id: string;
  user_id:    string;
  name:       string;
  url:        string;
  file_type:  string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  organization_id: string | null;
  title: string | null;
  tags: string[];
  status: ContactStatus;
  location: string | null;
  website: string | null;
  bio: string | null;
  last_contacted_at: string | null;
  is_lead: boolean;
  lead_stage: LeadStage | null;
  canvas_html: string | null;
  avatar_url: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  organization?: Organization | null;
}

export interface ContactActivity {
  id: string;
  user_id: string;
  contact_id: string;
  type: ContactActivityType;
  content: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ── Outreach ──────────────────────────────────────────────────────────────────

export type MetaStage = "identify" | "submit" | "discuss" | "make_happen" | "closed";

export interface OutreachPipeline {
  id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  description: string | null;
  archived: boolean;
  /** True when the pipeline was auto-seeded from onboarding answers. Drives
   *  the "Suggested" pill on the left rail; cleared by the UI once the user
   *  adds a target to the pipeline. */
  seeded: boolean;
  created_at: string;
  updated_at: string;
  stages?: PipelineStage[];
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  user_id: string;
  name: string;
  position: number;
  is_outcome: boolean;
  meta_stage: MetaStage;
  created_at: string;
}

export interface OutreachTarget {
  id: string;
  user_id: string;
  pipeline_id: string;
  stage_id: string | null;
  name: string;
  location: string | null;
  description: string | null;
  contact_id: string | null;
  organization_id: string | null;
  link: string | null;
  results_deadline: string | null;
  last_touched_at: string;
  last_followup_at: string | null;
  ether: boolean;
  created_at: string;
  updated_at: string;
  pipeline?: OutreachPipeline;
  stage?: PipelineStage;
  contact?: Contact;
  organization?: Organization;
}

export interface OutreachTargetProject {
  target_id:  string;
  project_id: string;
  user_id:    string;
  created_at: string;
}

// ── Finance ───────────────────────────────────────────────────────────────────

export type InvoiceStatus   = "draft" | "saved" | "sent" | "paid" | "voided";
export type ExpenseCategory = "materials" | "travel" | "production" | "software" | "other";
export type LineItemSource  = "time" | "expense" | "manual";

export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string | null;
  description: string;
  duration_minutes: number;
  billable: boolean;
  logged_at: string;
  created_at: string;
  project?: Project | null;
}

export interface ActiveTimer {
  user_id: string;
  project_id: string | null;
  description: string;
  started_at: string;
  project?: Project | null;
}

export interface Expense {
  id: string;
  user_id: string;
  project_id: string | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  /** Whether the expense can be billed to a client — gates whether it's
   *  pullable into an invoice (mirrors TimeEntry.billable). Defaults true. */
  billable: boolean;
  receipt_url: string | null;
  receipt_path: string | null;
  created_at: string;
  project?: Project | null;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  user_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  source: LineItemSource;
  time_entry_id: string | null;
  expense_id: string | null;
}

// ── Banking ───────────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  user_id: string;
  integration_id: string | null;
  provider: string;
  external_id: string;
  institution: string;
  name: string;
  type: string;
  subtype: string;
  last_four: string;
  balance_available: number | null;
  balance_current: number | null;
  balance_updated_at: string | null;
}

export interface BankTransactionDetails {
  merchant_name?: string | null;
  personal_finance_category?: {
    primary:  string;
    detailed: string;
  } | null;
  category?: string[] | null;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  bank_account_id: string;
  provider: string;
  external_id: string;
  amount: number;          // Signed: positive = money IN (Teller-style)
  type: "debit" | "credit";
  description: string;
  /** User-supplied display name override. When set, wins over the Plaid
   *  merchant_name / raw description for the row name. Null = use default. */
  custom_name: string | null;
  /** How a manual transaction was paid (cash / venmo / card / …). Null for
   *  synced bank rows. */
  payment_method: string | null;
  /** Free-text detail for the payment method (e.g. "Amex ••1234"). */
  payment_detail: string | null;
  details: BankTransactionDetails | null;
  date: string;            // YYYY-MM-DD
  status: "pending" | "posted";
  is_personal: boolean;
  /** User-supplied category override — a canonical category key (see
   *  CANONICAL_CATEGORIES in plaidCategoryDisplay.ts). When set, takes
   *  precedence over the Plaid-derived `details.personal_finance_category.primary`
   *  for display + the "Log expense" prefill. Null falls back to the Plaid
   *  mapping. */
  manual_category: string | null;
  /** When set, references the UUID of an entry in profiles.custom_categories.
   *  The row chip then renders the custom label/colour, and the custom's
   *  `routesTo` bucket drives expense persistence on convert. */
  manual_custom_id: string | null;
  linked_expense_id: string | null;
  matched_invoice_id: string | null;
  note: string | null;
  receipt_url: string | null;
  receipt_path: string | null;
  bank_account?: Pick<BankAccount, "name" | "institution" | "last_four" | "type" | "subtype"> | null;
}

export interface Invoice {
  id: string;
  user_id: string;
  number: number;
  status: InvoiceStatus;
  client_contact_id: string | null;
  client_organization_id: string | null;
  project_id: string | null;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  /** When the invoice was first emailed / marked sent, and when it was
   *  voided — used to build the invoice activity timeline. */
  sent_at: string | null;
  voided_at: string | null;
  notes: string | null;
  payment_method: string | null;
  payment_terms: string | null;
  /** Whether the linked client's contact details (email / phone / address)
   *  render on the client-facing invoice (PDF + public /i/[token] page).
   *  The details themselves are pulled live from the contact/organization. */
  show_client_info: boolean;
  /** Random URL-safe token gating the public /i/[token] view. Minted lazily
   *  the first time the invoice is sent (or via the "Copy public link"
   *  affordance). Null for drafts that have never been shared. */
  public_token: string | null;
  /** Stripe PaymentIntent id for the embedded Payment Element on /i/[token].
   *  Reused (re-fetched for `client_secret`) on subsequent loads so a client
   *  refreshing the page doesn't double-mint intents. */
  stripe_payment_intent_id: string | null;
  /** Stripe Checkout Session id — reserved for a possible future redirect
   *  flow. Not used by the embedded Payment Element path. */
  stripe_session_id: string | null;
  /** Captured from the successful Stripe charge for bookkeeping — the
   *  payment method type (card / us_bank_account / cashapp / klarna …) and,
   *  for cards/bank, the brand and last four digits. Null until paid via
   *  Stripe (manually-marked-paid invoices have no card data). */
  payment_method_type: string | null;
  payment_card_brand: string | null;
  payment_card_last4: string | null;
  created_at: string;
  updated_at: string;
  client_contact?: Contact | null;
  client_organization?: Organization | null;
  project?: Project | null;
  line_items?: InvoiceLineItem[];
  attachments?: InvoiceAttachment[];
}

/** A file attached to an invoice — uploaded manually or auto-pulled from an
 *  expense's receipt. Stored in the public `receipts` bucket; surfaced on the
 *  client-facing invoice (PDF + public page) for download. */
export interface InvoiceAttachment {
  id:         string;
  invoice_id: string;
  user_id:    string;
  name:       string;
  url:        string;
  /** Storage path for manually-uploaded files (deleted on removal). Null for
   *  expense-receipt attachments, which point at the expense's own object. */
  path:       string | null;
  file_type:  string | null;
  size_bytes: number | null;
  source:     "manual" | "expense_receipt";
  created_at: string;
}

/** Studio-identity fields on `profiles` that surface on invoices and the
 *  public payment view. All optional — invoices fall back gracefully when
 *  the user hasn't filled them in yet. */
export interface ProfileInvoiceIdentity {
  studio_name:  string | null;
  display_name: string | null;
  /** Rendered display string for the invoice "From" block — derived from
   *  the structured fields below on save (kept for backward-compatible
   *  rendering). */
  address:      string | null;
  phone:        string | null;
  logo_url:     string | null;
  logo_path:    string | null;
  ein:          string | null;
  // Structured business identity — also feeds Stripe Connect onboarding.
  business_type:  string | null;   // Stripe business_type value (sole_prop/llc/…)
  country:        string | null;   // 2-letter ISO code
  address_line1:  string | null;
  address_line2:  string | null;
  address_city:   string | null;
  address_state:  string | null;
  address_zip:    string | null;
}

// ── Opportunities ─────────────────────────────────────────────────────────────

export interface Opportunity {
  id: string;
  title: string;
  event_type: string;
  category: string;       // 'fair' | 'openCall' | 'grant' | 'award' | 'residency'
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  about: string | null;
  notes: string | null;
  website_url: string | null;
  registration_url: string | null;
  is_perennial_feed: boolean;
  user_status: string | null; // null | 'saved' | 'attending' | 'exhibiting' | 'applied'
  ash_note: string | null;
  created_at: string;
}

// ── Resources ─────────────────────────────────────────────────────────────────

export type ResourceItemType   = "file" | "structured" | "link" | "alias";
export type ResourceItemStatus = "complete" | "partial" | "empty" | "alias";

export interface ResourceAction {
  label: string;
  variant?: "primary" | "ghost" | "finder";
  modal?: string;
}

export interface Resource {
  id: string;
  user_id: string;
  category: string;
  name: string;
  meta: string;
  item_type: ResourceItemType;
  status: ResourceItemStatus;
  preview_type: string;
  preview_data: Record<string, unknown>;
  fields: Record<string, unknown>;
  file_urls: string[];
  external_url: string | null;
  alias_target: string | null;
  empty_why: string | null;
  modal_key: string | null;
  actions: ResourceAction[];
  position: number;
  /** Set when this Resource row mirrors a receipt attached to a
   *  bank_transactions row, so a re-upload or delete from Banking can
   *  find + replace/remove the same row. */
  bank_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceLink {
  id: string;
  user_id: string;
  name: string;
  url: string;
  created_at: string;
}

export interface ProjectContact {
  project_id: string;
  contact_id: string;
  user_id: string;
  created_at: string;
  project?: Project;
}

// One row per (user, provider, calendar). Surfaces every calendar the
// user owns across every connected account so the left rail can render
// per-account checkbox lists and the aggregator can fan out to only
// the calendars the user has marked visible.
export interface UserCalendar {
  id:            string;
  user_id:       string;
  provider:      "google" | "google_calendar" | "microsoft" | "apple_icloud";
  external_id:   string;
  account_email: string | null;
  name:          string;
  color:         string | null;
  is_primary:    boolean;
  visible:       boolean;
  writable:      boolean;
  /** Tombstone — true when the user removed this calendar from the left
   *  rail. The row is kept (not hard-deleted) so syncUserCalendarList
   *  doesn't re-create it on the next refresh; the events aggregator
   *  skips rows where removed = true. */
  removed:       boolean;
  created_at:    string;
  updated_at:    string;
}

// ── Press ─────────────────────────────────────────────────────────────────────
export type PressType = "feature" | "interview" | "mention" | "award" | "roundup" | "other";

export interface PressMention {
  id: string;
  user_id: string;
  publication: string;
  title: string | null;
  url: string | null;
  type: PressType;
  published_at: string | null; // YYYY-MM-DD
  notes: string | null;
  created_at: string;
}
