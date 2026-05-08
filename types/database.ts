export type ProjectType = "painting" | "sculpture" | "furniture" | "client_project";
export type ProjectStatus = "in_progress" | "planning" | "on_hold" | "complete" | "cut";
export type ProjectPriority = "high" | "medium" | "low";

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
  contact_id:     string | null;
  opportunity_id: string | null;
  user_id:        string;
  title:          string;
  completed:      boolean;
  due_date:       string | null;
  priority:       "high" | "medium" | "low" | null;
  notes:          string | null;
  created_at:     string;
  // Joined
  project?:     { id: string; title: string } | null;
  contact?:     { id: string; first_name: string; last_name: string } | null;
  opportunity?: { id: string; title: string; category: string } | null;
}

export interface Note {
  id: string;
  user_id: string;
  project_id: string | null;
  contact_id: string | null;
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
  opportunity?: { id: string; title: string; category: string } | null;
}

export interface Reminder {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  created_at: string;
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export type ContactStatus = "active" | "inactive" | "former_client";
export type LeadStage = "new" | "reached_out" | "in_conversation" | "proposal_sent" | "qualified" | "nurturing" | "lost";

export type ContactActivityType = "email" | "call" | "note" | "meeting";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  website: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
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
  company_id: string | null;
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
  company?: Company | null;
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
  canvas_html: string | null;
  contact_id: string | null;
  company_id: string | null;
  last_touched_at: string;
  created_at: string;
  updated_at: string;
  pipeline?: OutreachPipeline;
  stage?: PipelineStage;
  contact?: Contact;
  company?: Company;
}

// ── Finance ───────────────────────────────────────────────────────────────────

export type InvoiceStatus   = "draft" | "sent" | "paid";
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
  receipt_url: string | null;
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

export interface Invoice {
  id: string;
  user_id: string;
  number: number;
  status: InvoiceStatus;
  client_contact_id: string | null;
  client_company_id: string | null;
  project_id: string | null;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  notes: string | null;
  payment_method: string | null;
  payment_terms: string | null;
  created_at: string;
  updated_at: string;
  client_contact?: Contact | null;
  client_company?: Company | null;
  project?: Project | null;
  line_items?: InvoiceLineItem[];
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
