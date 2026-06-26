# Perennial — Backend Data Model & Architecture

This is the reference for any backend-data change in the Perennial app: adding a table, picking a write path, wiring a new integration, or syncing state across views. It documents the live schema (Supabase project `nmfzmbjjqsjcqkedswfc`), the RLS conventions, the service-role escape hatches, the Vault secret architecture, storage buckets, and the cross-view event bus.

**Read this before you:** add a column or table, write to a global/shared table, call a service-role client, connect a new OAuth provider, or change a view that another open view also renders.

---

## 1. Tenancy model: per-user vs global-shared

The schema is overwhelmingly **per-user**. 40 of 41 public tables carry a `user_id` column and are gated by Row-Level Security keyed on `auth.uid() = user_id`. The browser/anon-key client reads and writes its own rows directly — RLS *is* the authorization layer, so most features need no API route at all.

| Tenancy | Tables | Access shape |
|---|---|---|
| **Per-user** (`user_id`-owned) | everything except `opportunities` | RLS `auth.uid() = user_id`; browser client reads/writes directly |
| **Global-shared** | `opportunities` (only) | All authed users SELECT the whole feed; only `service_role` writes |
| **Public-read escape hatches** (per-user rows widened by token) | `notes` (`share_token`), `invoices` (`public_token`), `scheduling_links` (`slug`) | Owner-managed, but a single row is readable without a session via a token/slug |

The single global table, `opportunities`, is a curated/Perennial feed with **no `user_id`**. Per-user engagement (`user_status`, `ash_note`) is currently stored as **shared columns on the global row** — a documented single-tenant compromise. A per-user `opportunity_state` table is the multi-user TODO (flagged in `app/api/opportunities/status/route.ts`).

---

## 2. The write-path rule (browser client vs service-role route)

**Rule of thumb:** a write goes through the **browser Supabase client** (`lib/supabase/client.ts`) whenever the row is per-user and the user owns it. RLS (`auth.uid() = user_id`) is the entire authorization check — no API route needed. This is the overwhelming majority: ~69 client components import `@/lib/supabase/client` and call `.insert/.update/.delete` directly (`ProjectsClient`, `TasksClient`, `NetworkClient`, `NotesClient`, `ResourcesClient`, `CalendarClient`, the `*DetailPanel`s, etc.).

A write goes through a **service-role API route** *only* when RLS would (correctly) block the browser client — i.e. the data is **not** user-owned, there is **no session**, or it's a **cron**:

| Surface | Route | Why service-role |
|---|---|---|
| Opportunity engagement | `app/api/opportunities/status` | Writes `user_status` on the **global** feed. Does `auth.getUser()`, then `createAdminClient().update(...).eq('id', id)`, whitelisting **only** `user_status` and validating against an allowed set |
| Opportunity / suggestion curation | `app/api/admin/opportunities`, `app/api/admin/suggestions` (at `/admin`) | Writes to the global feed. **Auth-gated to any signed-in user only** (pre-launch == owner; carries a `TODO: real admin-role gate` — no role check yet) |
| Weekly opportunity ingest | `app/api/cron/opportunities-ingest` | Bulk ingest; `CRON_SECRET`-gated (needs `CRON_SECRET` in Vercel) |
| Public invoice view + payment | `app/i/[token]`, `app/api/stripe/webhook`, `app/api/finance/*` | No session — lookup by `public_token` / Stripe-signed payload |
| Public booking | `app/api/book/[slug]` + `lib/scheduling/*` | Visitor has no session; service role acts on the **link owner's** calendar, integration id always resolved from the link, never visitor input |

**The four Supabase client factories** (`lib/supabase/`):

| File | Key | RLS | Use for |
|---|---|---|---|
| `client.ts` | anon | enforced | Browser client components (default write path) |
| `server.ts` | anon + user cookies | enforced | Server Components & route handlers acting as the logged-in user |
| `admin.ts` (`createAdminClient`) | service-role | **bypassed** | Curating the global `opportunities` feed |
| `service.ts` (`createServiceClient`) | service-role | **bypassed** | Public / no-session surfaces (`/i/[token]`, Stripe webhook, booking) |

`admin.ts` and `service.ts` use the same service-role key; the split is by intent. **Never import `admin.ts` or `service.ts` into a client component.**

**Pattern to copy when adding a service-role route:** verify `auth.getUser()` (or a shared-secret / signature) **first**, then strictly whitelist the columns and values you write.

---

## 3. Table reference

Scope key: **U** = per-user (`auth.uid() = user_id`), **G** = global-shared, **M** = mixed (per-user + a public/anon escape hatch). Unless noted, write path is the browser/server client as the authed owner.

### Core / Projects

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `profiles` | U | Per-user config hub (**53 cols**): identity, finance prefs (`currency`, `brand_color`, `invoice_prefix`, EIN, address, `payment_terms`), `notif_*` toggles, onboarding answers, UI state (`tour_visited`, `project_options`, `custom_categories` jsonb), `default_calendar_id`, `conferencing` jsonb. Seeded on signup via `public.handle_new_user()` trigger on `auth.users` (now exception-guarded so a seed failure never aborts signup — `supabase/migrations/20260623160000_resilient_signup_profile_trigger.sql`). Profile is also upserted on first onboarding/settings load as a self-heal path. | `user_id` (PK = `auth.uid()`), `display_name`, `studio_name`, `currency`, `brand_color`, `invoice_prefix`, `default_calendar_id`, `onboarding_complete` | **Split** SELECT/INSERT/UPDATE own; **no DELETE**, no service_role policy | `user_calendars`, `invoices`, `integrations` |
| `projects` | U | Artwork/commission records: title, type, status, priority, dates, pricing (`listing_price`, `est_value`, `rate`, `billed_hours`), physical attrs, `client_name`, `canvas_html` rich body | `id`, `user_id`, `title`, `status`, `listing_price`, `client_name`, `canvas_html` | ALL `users own projects` | `tasks`, `time_entries`, `expenses`, `notes`, `project_contacts`, `project_files`, `invoices`, `outreach_target_projects` |
| `tasks` | U | To-dos with **polymorphic** parent FKs | `id`, `user_id`, `title`, `completed`, `project_id`, `contact_id`, `opportunity_id`, `target_id`, `organization_id`, `due_at` | ALL `users own tasks` | `projects`, `contacts`, `organizations`, `opportunities`, `outreach_targets` |
| `reminders` | U | Lightweight project reminders (reminders→calendar deferred) | `id`, `user_id`, `project_id`, `due_date`, `completed` | ALL `users see own reminders` | `projects` |

### Finance

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `time_entries` | U | Logged time per project; feeds invoice lines | `id`, `user_id`, `project_id`, `duration_minutes`, `billable`, `logged_at` | ALL `users manage own time_entries` | `projects`, `invoice_line_items`, `active_timers` |
| `active_timers` | U | Running stopwatch (one row per running timer) | `user_id`, `project_id`, `started_at` | ALL `users manage own active_timers` | `time_entries`, `projects` |
| `expenses` | U | Project/business expenses; `receipt_url`/`receipt_path` in **receipts** bucket; feeds invoice lines | `id`, `user_id`, `project_id`, `amount`, `category`, `receipt_path`, `billable` | ALL `users manage own expenses` | `projects`, `invoice_line_items`, `bank_transactions` |
| `invoices` | M | Invoice header. Lifecycle `draft/saved/sent/paid/voided`; `public_token` powers public `/i/[token]`; Stripe fields; `number` sequential int | `id`, `user_id`, `number`, `status`, `public_token`, `client_contact_id`, `project_id`, `stripe_payment_intent_id`, `paid_at` | ALL `users manage own invoices` for owner. **Public view + payment-confirmation writes via service-role** (`lib/supabase/service.ts`) keyed on `public_token` / Stripe webhook | `invoice_line_items`, `invoice_attachments`, `contacts`, `organizations`, `projects` |
| `invoice_line_items` | U | Invoice rows; `source` `manual\|time\|expense` + provenance FKs | `id`, `invoice_id`, `user_id`, `amount`, `source`, `time_entry_id`, `expense_id` | ALL own; also read via service-role on public view | `invoices`, `time_entries`, `expenses` |
| `invoice_attachments` | U | Files on an invoice (project-files/receipts buckets) | `id`, `invoice_id`, `user_id`, `path`, `source` | ALL `own invoice_attachments` | `invoices` |

### Network

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `contacts` | U | Network people; lead flags (`is_lead`, `lead_stage`), `canvas_html`, soft-delete `archived`, `last_contacted_at` | `id`, `user_id`, `organization_id`, `email`, `is_lead`, `lead_stage`, `archived`, `last_contacted_at` | ALL `Users own their contacts` | `organizations`, `contact_activities`, `contact_files`, `project_contacts`, `outreach_targets` |
| `organizations` | U | "Fattened" companies; soft-delete `archived`, `last_touched_at` | `id`, `user_id`, `name`, `archived`, `last_touched_at` | ALL `Users own their organizations` | `contacts`, `organization_activities`, `organization_files`, `invoices`, `outreach_targets` |
| `contact_activities` | U | Per-contact timeline (`type`, `content`, `occurred_at`, `metadata`) | `id`, `user_id`, `contact_id`, `type`, `occurred_at` | ALL `Users own their contact activities` | `contacts` |
| `organization_activities` | U | Per-org timeline | `id`, `user_id`, `organization_id`, `occurred_at` | ALL `Users own their organization activities` | `organizations` |
| `contact_files` | U | Files on a contact (**contact-files** bucket) | `id`, `contact_id`, `user_id`, `url` | ALL `contact_files_owner` (**USING only**) | `contacts` |
| `organization_files` | U | Files on an org | `id`, `organization_id`, `user_id`, `url` | ALL `organization_files_owner` (USING only) | `organizations` |
| `project_contacts` | U | Join projects ↔ contacts (M:N) | `project_id`, `contact_id`, `user_id` | ALL `Users own their project contacts` | `projects`, `contacts` |
| `project_files` | U | Files on a project (**project-files** bucket) | `id`, `project_id`, `user_id`, `url` | ALL `Users manage own project files` (USING only) | `projects` |

### Outreach / Targets

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `outreach_pipelines` | U | Kanban pipelines; `seeded`, soft-delete `archived`, `position` | `id`, `user_id`, `name`, `seeded`, `archived`, `position` | ALL `users manage own pipelines` | `pipeline_stages`, `outreach_targets` |
| `pipeline_stages` | U | Pipeline columns; `is_outcome`, `meta_stage` | `id`, `pipeline_id`, `user_id`, `position`, `is_outcome`, `meta_stage` | ALL `users manage own stages` | `outreach_pipelines`, `outreach_targets` |
| `outreach_targets` | U | Board cards; **always wraps a Lead (`contact_id`) or Org (`organization_id`)**; `ether` = parked | `id`, `user_id`, `pipeline_id`, `stage_id`, `contact_id`, `organization_id`, `ether` | ALL `users manage own targets` | `outreach_pipelines`, `pipeline_stages`, `contacts`, `organizations`, `outreach_target_projects` |
| `outreach_target_projects` | U | Join targets ↔ projects (M:N) | `target_id`, `project_id`, `user_id` | **Split**: SELECT/INSERT/DELETE own; **no UPDATE** | `outreach_targets`, `projects` |

### Notes

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `notes` | M | Notes; polymorphic parent FKs; `share_token` enables **public anon read** of one note; `pinned` | `id`, `user_id`, `share_token`, `project_id`, `contact_id`, `opportunity_id`, `organization_id`, `pinned` | ALL `users see own notes` **PLUS** `{anon}` SELECT `Anyone can view shared notes` where `share_token IS NOT NULL` | `projects`, `contacts`, `organizations`, `opportunities`, `note_folders`, `note_folder_items` |
| `note_folders` | U | Folders (`name`, `position`) | `id`, `user_id`, `name`, `position` | ALL `users manage own note folders` | `notes`, `note_folder_items` |
| `note_folder_items` | U | Join notes ↔ folder | `folder_id`, `note_id`, `user_id` | ALL `users manage own note folder items` | `note_folders`, `notes` |

### Resources

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `resources` | U | Typed repository cards; jsonb `preview_data`/`fields`/`actions`, `file_urls[]`, `alias_target`; may reference a `bank_transaction`. **Indexes** files (LinkedFile), does not duplicate | `id`, `user_id`, `category`, `item_type`, `status`, `file_urls`, `folder_id`, `bank_transaction_id` | ALL `users_own_resources` (USING only); **resources** bucket | `resource_folders`, `resource_folder_items`, `resource_links`, `bank_transactions` |
| `resource_links` | U | Saved external links | `id`, `user_id`, `url` | ALL `users_own_resource_links` (USING only) | `resources` |
| `resource_folders` | U | Folders (`name`, `position`) | `id`, `user_id`, `name`, `position` | ALL `users manage own resource folders` | `resources`, `resource_folder_items` |
| `resource_folder_items` | U | Join resources (or keyed items via `item_key`) ↔ folder | `folder_id`, `resource_id`, `user_id`, `item_key` | ALL `users manage own resource folder items` | `resource_folders`, `resources` |

### Integrations / Banking / Calendar

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `integrations` | U | One row per (user, provider). Secrets live in **Vault**, referenced by `*_secret_id`. `metadata`/`scopes`/`sync_state` jsonb, `plaid_cursor`, health fields | `id`, `user_id`, `provider`, `status`, `access_token_secret_id`, `refresh_token_secret_id`, `plaid_cursor`, `last_synced_at`, `last_error` | ALL `integrations_owner` (USING only). Secrets via **SECURITY DEFINER Vault RPCs** (re-check `auth.uid()`); **no service-role key in app** for the logged-in path | `bank_accounts`, `bank_transactions`, `user_calendars`, `website_sites` |
| `bank_accounts` | U | Plaid-synced accounts; tied to an integration | `id`, `user_id`, `integration_id`, `external_id`, `provider`, `balance_current` | ALL `bank_accounts_owner` (USING only). Written by **server-side Plaid sync as the authed user** | `integrations`, `bank_transactions` |
| `bank_transactions` | U | Synced txns + user overlays (`is_personal`, `linked_expense_id`, `matched_invoice_id`, `manual_category` = canonical Plaid key, receipt) | `id`, `user_id`, `bank_account_id`, `external_id`, `is_personal`, `manual_category`, `matched_invoice_id`, `linked_expense_id` | ALL `bank_transactions_owner` (USING only). Sync **never seeds `manual_category`** | `bank_accounts`, `expenses`, `invoices`, `resources` |
| `user_calendars` | U | Synced external calendars; tombstone via `removed` (queries skip `removed=true`) | `id`, `user_id`, `provider`, `external_id`, `removed`, `writable`, `is_primary` | ALL `user_calendars_owner`. Written by server-side calendar sync | `integrations`, `scheduling_links`, `scheduling_bookings` |

### Scheduling

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `scheduling_links` | M | Calendly-style booking links; public `slug`, `availability` jsonb, conflict/buffer config | `id`, `user_id`, `slug`, `active`, `target_calendar_id`, `availability` | ALL `users manage own scheduling links`. **Public `/book/[slug]` resolves via service-role** (`lib/scheduling/public-link.ts`) | `scheduling_bookings`, `user_calendars` |
| `scheduling_bookings` | M | Bookings by external invitees; `external_event_id` pushed to calendar | `id`, `link_id`, `user_id`, `invitee_email`, `start_at`, `status`, `external_event_id` | ALL `users read own scheduling bookings`. **Public INSERT via service-role** (`app/api/book/[slug]`) | `scheduling_links`, `user_calendars` |

### Presence / Press

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `website_sites` | U | Registered sites for analytics; `site_token` | `id`, `user_id`, `site_token`, `status` | ALL `website_sites_owner` (USING only) | `website_events`, `integrations` |
| `website_events` | U | Pageview/analytics events | `id`, `site_id`, `user_id`, `occurred_at`, `visitor_hash` | **SELECT-only** `website_events_owner_select`. **No browser writes** — ingested server-side (service-role) via tracking endpoint (`app/api/track`) | `website_sites` |
| `press_mentions` | U | Press coverage log; `stats` jsonb; optional project/contact links | `id`, `user_id`, `publication`, `url`, `published_at` | **Split** SELECT/INSERT/UPDATE/DELETE own | `projects`, `contacts` |

### Opportunities (the one global table)

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `opportunities` | **G** | Curated global feed (events/calls/grants), 27 cols. **Single-tenant compromise**: `user_status` (`saved/applied/attending/exhibiting/hidden`) and `ash_note` are **shared columns on the global row** | `id`, `title`, `is_perennial_feed`, `status`, `user_status`, `source`, `last_verified_at` | **No `user_id`.** SELECT `read_opportunities` `{authenticated}` USING `true`. Write `service_write_opportunities` `{service_role}` only. **Browser writes silently no-op.** Writes via cron ingest / `/admin` / `app/api/opportunities/status` (auth-checked → service-role) | `opportunity_suggestions`, `notes`, `tasks` |
| `opportunity_suggestions` | U | User-submitted opportunity suggestions for admin curation | `id`, `user_id`, `title`, `status` | **Split**: INSERT own + SELECT own (**no UPDATE/DELETE** for users); admin promotes via service-role (`app/api/admin/suggestions`) | `opportunities` |

### Ash (AI assistant)

| Table | Scope | Purpose | Key columns | RLS / write notes | Related |
|---|---|---|---|---|---|
| `ash_conversations` | U | Conversations scoped by `module` | `id`, `user_id`, `module`, `title` | ALL `users manage own ash_conversations` | `ash_messages` |
| `ash_messages` | U | Messages (`role`, `content`) | `id`, `conversation_id`, `user_id`, `role`, `content` | ALL `users manage own ash_messages` | `ash_conversations` |

---

## 4. RLS authoring styles

Three styles coexist — match the surrounding table when adding one, and know the difference:

1. **ALL + USING + WITH CHECK** (`auth.uid() = user_id`) — the safest, most common. Reads and writes both gated. Used by `contacts`, `projects`, `tasks`, `invoices`, etc.
2. **ALL + USING only** (no WITH CHECK) — relies on the user supplying their own `user_id` on insert. Used by `integrations_owner`, `bank_accounts_owner`, `bank_transactions_owner`, `resources`, `contact_files`, `project_files`, `website_sites`. Be careful: a malicious insert could set someone else's `user_id`; prefer adding a WITH CHECK on new tables.
3. **Split per-command policies** — some commands intentionally omitted. `profiles` (SELECT/INSERT/UPDATE, no DELETE), `press_mentions` (all four), `opportunity_suggestions` (INSERT/SELECT only), `outreach_target_projects` (SELECT/INSERT/DELETE, no UPDATE).

The `{public}` role on most policies is the Postgres default role; the `auth.uid() = user_id` predicate does the actual gating.

---

## 5. Integrations + Vault secrets architecture

**Schema.** One `public.integrations` row per `(user_id, provider, account_id)`, standard own-rows RLS. `provider` is a `ProviderId` union (`google`, `google_analytics`, `microsoft`, `apple_icloud`, `meta`, `instagram`, `tiktok`, `plausible`, `mailchimp`, `beehiiv`, `substack`, `teller`, `stripe`, plus legacy ids). Columns: `account_id/name`, `scopes` jsonb, `sync_state` (cursors), `metadata`, `status`, `token_expires_at`, `last_error`/`last_error_at`, `connected_at`, `last_synced_at`, and `access_token_secret_id`/`refresh_token_secret_id` pointing into Supabase Vault.

**Secrets — never plaintext.** OAuth tokens live in `supabase_vault`, written/read via three **SECURITY DEFINER** RPCs: `integration_set_secret` / `integration_read_secret` / `integration_delete_secrets` (`lib/integrations/vault.ts`). They run as the authenticated user and re-check `auth.uid()` against the integration's `user_id` — so the Next.js process needs **no service-role key** on the logged-in path; it uses the plain server client. A service-role twin set (`integration_read_secret_service` / `integration_set_secret_service`, in `lib/integrations/service-tokens.ts`) is used **only** for the no-session public scheduling/booking flow, where the integration id is resolved from the booking-link owner, never visitor input. (Legacy plaintext `access_token`/`refresh_token` columns still exist on the row but should not be used.)

**Token getters.** `lib/integrations/google-tokens.ts` (`getValidGoogleAccessToken`) and `microsoft-tokens.ts` mirror each other: return the cached access token if it's >60s from expiry (`REFRESH_LEAD_MS`), else read the refresh token from Vault, call the adapter's `refreshTokens`, store the new access token, stamp `token_expires_at`, and `clearIntegrationError`. `service-tokens.ts` is the session-less equivalent.

**Status lifecycle** (`lib/integrations/storage.ts`) — `IntegrationStatus = active | error | disconnected | pending | needs_reauth`:

| Transition | Trigger |
|---|---|
| `upsertIntegrationRow` → `active` | (re)connect |
| `recordSyncSuccess` → `active` (clears error) | successful sync |
| `recordSyncError` → `error` | transient sync hiccup |
| `recordReauthRequired` → `needs_reauth` | dead credential (refresh token missing/rejected) — only a fresh OAuth grant fixes it; Calendar rail + Settings show a Reconnect prompt |
| `clearIntegrationError` → `active` | any successful call (guarded by `.neq('status','active')`) |
| `disconnectIntegration` → `disconnected` | zeroes Vault secrets via delete RPC (which flips status); **row retained** so `contact_activities` linked by `metadata.integration_id` stay coherent |

**Adding a provider.** Implement the `OAuthProviderAdapter` interface (`getAuthUrl`/`exchangeCode`/`refreshTokens`/optional `revoke`) and register it in `lib/integrations/registry.ts`. Use the Vault RPCs and the `storage.ts` lifecycle helpers — never plaintext token columns — so OAuth start/callback routes, Settings UI, and sync workers stay uniform. `app/api/integrations/*` and `app/api/auth/*/callback` run with the user's session (server client, RLS); they don't need service role because the Vault RPCs are SECURITY DEFINER.

---

## 6. Storage buckets

All buckets are **public-read**. Owner-namespaced uploads under `${userId}/...`. Size/mime limits noted are enforced at the bucket level where present, otherwise app-side.

| Bucket | Limits | Backs | Accessor / helper |
|---|---|---|---|
| `editor_images` | 10 MB, JPEG/PNG/GIF/WebP/SVG (app-enforced; no bucket limit row) | Inline rich-text images for any surface using `getRichExtensions`; reused by Notes `ImportNoteModal` | `lib/uploads/editor-image.ts` (`EDITOR_IMAGE_BUCKET`) |
| `project-files` | 50 MB (`52428800`); explicit allowed mimes (images, pdf, doc/docx, txt) | `project_files`, `invoice_attachments` | `storage.from('project-files')` |
| `contact-files` | none | `contact_files` | `storage.from('contact-files')` |
| `resources` | none | `resources.file_urls` | `storage.from('resources')` |
| `receipts` | none | `expenses.receipt_path`, `bank_transactions.receipt_path` | `storage.from('receipts')` |
| `studio-logos` | 2 MB (`2097152`); jpeg/png/webp/svg | `profiles.logo_path`/`logo_url` | — |

---

## 7. Server data flow & the stale-after-navigation gap

**Pattern.** Each module's route is an async Server Component (`app/(app)/<module>/page.tsx`). It awaits `lib/supabase/server.createClient()` (anon key + user cookies → RLS scopes every query), runs a `Promise.all` of related-table queries with embedded selects (e.g. `projects.select('*, tasks(*)')`, `contacts.select('*, organization:organizations(*)')`), then renders a single `'use client'` component, passing rows as `initialX` props (`initialProjects`, `initialContacts`, …). The client seeds `useState` from `initialX` and **owns the data from then on**: it mutates Supabase directly via the browser client and updates local state optimistically — it does **not** re-read from the server after a write.

**Revalidation gaps (matters for app-wide changes):**
- There are **no** `export const dynamic`/`revalidate` directives in any `app/(app)` page, and almost no `router.refresh()` in data views (`router.refresh` appears only in settings, login, onboarding, MobileNav).
- Because Next caches the RSC payload, **navigating away from a module and back can re-hydrate the client with stale `initialX`** (the pre-mutation snapshot) until a hard reload — the classic stale-after-navigation bug.
- There is **no unified invalidation**. Clients compensate ad hoc: optimistic local state during a session, custom window events for cross-panel sync, and manual refetches. Cross-module effects (a task created in Calendar appearing in Tasks; a project linked in Outreach) rely on the user re-entering the page, and only sometimes on an event.
- **Calendar is the exception**: it re-pulls events on `calendar:refresh-events` rather than trusting initial props, because external provider events change out-of-band.

**When you add a view change that creates/edits a row another open view shows:** mutate via the browser client (RLS), update local state, **and** fire the relevant refresh event (below). For global/no-session data, add a service-role route that auth-checks first and column-whitelists.

---

## 8. Cross-view state-sync events (the window-event bus)

State syncs across views via ~24 custom `window` events (no typed bus today — naming is inconsistent: `module:verb-noun` vs `perennial:*` vs `profile-updated`). Several dispatch with **no listener** (latent bugs).

### Ash context

| Event | Dispatched by | Listened by |
|---|---|---|
| `open-ash` | `AshPromptsModule`, `WelcomeBanner`, `EmptyState`, `PresenceClient`, `CalendarTooltipTour` | `components/ash/AshContainer.tsx` |
| `set-project-context` / `clear-project-context` | `ProjectDetailPanel` | `AshContainer` |
| `set-contact-context` / `clear-contact-context` | `ContactDetailPanel` | ⚠️ **NONE** — dispatched, no listener |
| `set-organization-context` / `clear-organization-context` | `OrganizationDetailPanel` | ⚠️ **NONE** — dispatched, no listener |
| `ash:turn-complete` | `AshPanel` | `ProjectDetailPanel` (refetch tasks+notes) |
| `ash:write-tool-ran` | `RichEditor` | ⚠️ no listener found |

> **Known bug:** the floating Ash button has no contact/organization context because `AshContainer` only listens for `set-project-context`. Generalize to a single `set-entity-context` event or add the two missing listeners.

### Calendar / Scheduling

| Event | Dispatched by | Listened by |
|---|---|---|
| `calendar:refresh-events` | `EventCard`, `CalendarOptionsMenu`, `CalendarSourcesPanel` | `CalendarClient` |
| `calendar:event-created` | `EventCard` | `CalendarClient` |
| `calendar:row-changed` | `CalendarSourcesPanel` | `CalendarClient` |
| `calendar:default-changed` | `CalendarSourcesPanel` | `CalendarClient` |
| `calendar:integration-connected` | `CalendarClient` | `CalendarTooltipTour` |
| `calendar:task-created` / `calendar:new-task-opened` | `CalendarClient` | `CalendarTooltipTour` |
| `scheduling:refresh` | `CalendarClient` | `CalendarClient` (`loadLinks`), `SchedulingPanel` |

### Network / Outreach

| Event | Dispatched by | Listened by |
|---|---|---|
| `network:open-contact` | `OrganizationDetailPanel` | `NetworkClient` |
| `outreach:open-target` | `OrganizationDetailPanel`, `LeadsBoard` | `OutreachClient` |
| `outreach:project-linked` | `TargetDetailPanel` | `TargetDetailPanel` |
| `outreach:followup-logged` | `PipelineBoard` | ⚠️ no app-state listener (tour/analytics only) |

### Finance / App-shell

| Event | Dispatched by | Listened by |
|---|---|---|
| `perennial:timer-started` / `perennial:timer-stopped` | `QuickTimerButton`, `FinanceClient`, `SidebarTimerBadge` | `SidebarTimerBadge`, `QuickTimerButton` |
| `finance:set-tab` | cross-module nav into Finance | `FinanceClient` |
| `profile-updated` | `app/(app)/settings/page.tsx` | `Sidebar` (studio name/avatar without reload) |
| `perennial-theme-changed` | theme toggle (`lib/theme.ts`) | `Sidebar`, `settings/page.tsx` |
| `tour-visited`, `tasks:created` / `projects:created` / `contacts:created` / `notes:created` / `outreach:*-created` | settings, `TourTracker`, the `*Client`s | tour instrumentation (not data sync) |

---

## 9. Cross-cutting patterns to know

- **Polymorphic attachment:** `tasks` and `notes` attach to many parents via nullable FKs (`project_id`, `contact_id`, `organization_id`, `opportunity_id`, `target_id`). M:N handled by explicit join tables (`project_contacts`, `outreach_target_projects`, `note_folder_items`, `resource_folder_items`), each carrying `user_id` for RLS.
- **Provenance / linking (no duplication):** `invoice_line_items.source` + `time_entry_id`/`expense_id`; `bank_transactions.linked_expense_id` + `matched_invoice_id`; `resources.bank_transaction_id`. Resources **indexes** files via `resource_folder_items` rather than copying.
- **Soft-delete / tombstone** via boolean flags, not row deletion: `contacts.archived`, `organizations.archived`, `outreach_pipelines.archived`, `user_calendars.removed` (queries skip `removed=true`); invoices use `status='voided'` + `voided_at`.
- **Denormalized recency:** `contacts.last_contacted_at`, `organizations.last_touched_at`, `outreach_targets.last_touched_at`/`last_followup_at`, `integrations.last_synced_at`, `website_sites.first_event_at`/`last_event_at`; `invoices.number` is a sequential int.
- **Heavy jsonb for config:** `profiles` (`tour_visited`, `project_options`, `custom_categories`, `conferencing`), `integrations` (`metadata`, `scopes`, `sync_state`), `resources` (`preview_data`, `fields`, `actions`), `scheduling_links.availability`, `press_mentions.stats`, `*_activities.metadata`, `bank_transactions.details`.

---

## 10. Open backend TODOs (flagged in code/memory)

- **Opportunities single-tenant trap:** `user_status` is one global column on the shared row — one user's save/hide overwrites everyone's. Add a per-user `opportunity_state` table (`user_id`, `opportunity_id`, `status`) with standard own-rows RLS; point `app/api/opportunities/status` at it. (Flagged in the route's own comment.)
- **No admin-role gate:** `app/api/admin/opportunities` and `app/api/admin/suggestions` authorize **any** signed-in user (pre-launch == owner). Gate on a `profiles.role` / allowlist before launch — these are service-role writes to a global table.
- **Stale-after-navigation:** adopt one convention — `router.refresh()` after cross-module writes, or a per-module refetch on mount/`visibilitychange` (as `CalendarClient` does for events).
- **Untyped event bus:** add a typed events module (const map + typed dispatch/subscribe) so listeners can't silently drift from dispatchers — the Ash-context gap is exactly this failure mode.
- **`CRON_SECRET`** must be set in Vercel for `app/api/cron/opportunities-ingest`.
