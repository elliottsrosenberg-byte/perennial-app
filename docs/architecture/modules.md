# Modules

This document is a module-by-module architecture reference for the Perennial app. Each module section lists its routes, main components (with file paths), API routes, database tables, key patterns, cross-module links, known TODOs/mocked areas, and mobile issues. Use it to plan app-wide changes by jumping directly to the concrete file paths involved.

> Conventions worth knowing app-wide:
> - **`server-component-fetches-initial-data → client-holds-state`** is the dominant pattern: a `page.tsx` server component does a `Promise.all` of Supabase reads and hands `initial*` props to a large client component that owns all interaction state.
> - Most modules write **directly through the Supabase browser client** (no API layer); API routes exist mainly for OAuth, provider sync, Stripe, email, and AI.
> - **Custom `window` events** are the cross-view sync bus (e.g. `open-ash`, `*:created`, `*-context`, tour events).
> - The **scrim/detail-panel** pattern (fixed overlay offset by `--sidebar-width`) recurs across Projects/Network/Outreach.
> - The app is **desktop-first**; a fixed left rail + non-wrapping flex layouts are the most common mobile failure mode.

---

## Calendar (week/month grid + events + tasks)

| | |
|---|---|
| **Routes** | `/calendar` (`app/(app)/calendar/page.tsx` — server component, fetches initial data) |

### API routes
- `GET/POST /api/integrations/calendar/events` — list merged events across providers; POST creates an event via `lib/calendar/write-event.ts` `createEvent`
- `PATCH/DELETE /api/integrations/calendar/events/[encodedId]` — `encodedId` = URL-encoded `${provider}:${externalId}`; routes to provider write API
- `GET/POST/PATCH/DELETE /api/integrations/calendar/calendars` — per-user calendar list: visibility toggle, color, `set_default` → `profiles.default_calendar_id`, soft-delete via `removed` flag, POST re-syncs
- `POST /api/integrations/calendar/refresh` — manual "Refresh calendars" (calls `syncUserCalendarList`)
- `GET /api/geocode/search` — location autocomplete in EventCard (Nominatim-backed)
- Direct `supabase.from('tasks')` calls from the client for task CRUD (no API route)
- Redirects to `/api/auth/google` and `/api/auth/microsoft` for connect/reconnect

### Tables
`tasks` (read open tasks server-side; client updates `due_date`/`completed` and inserts new tasks via browser client) · `projects` (id/title/due_date/status for due chips + ProjectPicker) · `contacts` (id/first/last for ContactPicker) · `opportunities` (dated opps for the all-day "Perennial feed", filtered by `user_status`/tags vs `practice_types`) · `profiles` (`practice_types`, `default_calendar_id`, conferencing) · `integrations` (provider rows: `google_calendar` legacy, `google`, `microsoft`) · `user_calendars` (per-account list: visible/writable/removed/color/is_primary/external_id — colors event chips, drives writable affordances)

### Main components
- `app/(app)/calendar/page.tsx` — server: `Promise.all` fetch of tasks/projects/contacts/integrations/opportunities + profile `practice_types`; collapses integration rows into google/outlook connection summaries
- `components/calendar/CalendarClient.tsx` — 3942-line client; owns ALL view state, continuous-pan week & month grids, drag-create, task drag-reschedule, opportunity feed, scheduling overlay
- `components/calendar/EventCard.tsx` — unified create + view/edit + read-only card; POST/PATCH/DELETE to events API; fetches `/calendars` for the calendar picker; LocationInput autocomplete
- `components/calendar/CalendarSourcesPanel.tsx` — left-rail calendar list: per-account groups, visibility, color, set-default, disconnect/reconnect/refresh
- `components/calendar/CalendarOptionsMenu.tsx` — topbar 3-dot: show weekends/declined, opens settings
- `components/calendar/CalendarSettingsModal.tsx` — full-scrim modal; tabs are "Coming soon" stubs
- `components/calendar/QuickTaskCard.tsx` — quick task create anchored to a clicked cell
- `components/calendar/TaskQuickEditPopover.tsx` — inline task edit/complete/delete; direct `supabase.from('tasks')` writes
- `components/tour/calendar/CalendarIntroModal.tsx` + `CalendarTooltipTour.tsx` — onboarding

### Key patterns
- Server-component fetches initial data, then `CalendarClient` holds state (page hands `initialTasks/Projects/Contacts/Opportunities` + connection flags)
- Custom window events for cross-view sync: `calendar:refresh-events`, `calendar:event-created`, `calendar:row-changed`, `calendar:default-changed` (from sources panel), `scheduling:refresh`, plus tour-only `calendar:task-created`/`new-task-opened`/`integration-connected`
- Optimistic updates: task `due_date`/complete updated locally then persisted; event create/edit reconciled by refetch via `calendar:refresh-events`
- Detail-panel anchored to clicked rect: EventCard, QuickTaskCard, TaskQuickEditPopover position next to the clicked chip's DOMRect with viewport clamping (`position:fixed`, not a scrim)
- Continuous-pan virtualization: week view renders a sliding window of days (`buildPanDays`, grows in 7-day chunks); month view a vertical strip of weeks (`buildPanWeeks`)
- Provider abstraction: events API merges `google_calendar`(legacy)/`google`/`microsoft` into one normalized `CalendarEvent`; `encodedId` `${provider}:${id}` lets one route hit either provider
- Server-side color resolution: events route joins `user_calendars.color` onto each event so chips paint correctly on first paint
- Self-healing sync: `/calendars` GET runs `syncUserCalendarList` when an active calendar-scoped integration has no `user_calendars` rows; events GET fires fire-and-forget backfill (`needsBackfill`)
- localStorage: opportunity visibility mode (`perennial:cal-opp-visibility`)

### Cross-module links
- **Tasks**: reads/writes the shared `tasks` table directly (reminders merged into tasks); tasks shown as ribbon pills + month chips, drag-to-reschedule writes `due_date`
- **Projects**: tasks link via `project_id` (ProjectPicker); project due dates render as chips
- **Network/Contacts**: tasks link via `contact_id` (ContactPicker)
- **Presence/Opportunities**: `opportunities` surfaced in the all-day row as a "Perennial feed", filtered by `profiles.practice_types` → discipline tags
- **Settings → Integrations**: shares `integrations` + `user_calendars`; connect/disconnect via `/api/auth/*` and `/api/integrations/[id]`; `profiles.default_calendar_id` is the cross-cutting default
- **Scheduling**: `SchedulingPanel` + `SchedulingComposePanel` embed INTO CalendarClient's left rail; link availability draws as hatched bars on the week grid

### Known TODOs / mocked
- `CalendarSettingsModal`: all tabs are "Coming soon" — account mgmt, conferencing defaults, working hours, notifications, keyboard shortcuts not persisted
- `EventCard`: calendar selector read-only in edit mode — events can't be moved between calendars (provider quirks)
- `CalendarClient`: opportunity category `award` (and `HIDDEN_FEED_CATEGORIES`) hidden from the feed pending a deadline-based UX rework
- `write-event.ts`: recurrence limited to simple FREQ rules; BYDAY/COUNT/UNTIL/every-N deferred to a custom RRULE editor
- `QuickTaskCard`: custom task time ranges deferred (start time only)
- Notifications/reminders: `reminder_minutes` sent to the provider but no in-app reminder system

### Mobile issues
- `CalendarClient.tsx:2098-2103` — root is `flex h-full` with a fixed 216px left rail (no responsive collapse/hamburger); rail eats most of the width on phones
- Time grid uses fixed `PX_PER_HOUR=64` and day-column floor `DAY_MIN_PX=96` (line 44) — a 7-column week needs ~672px+; below that it horizontal-scrolls (`overflow-x-auto` ~2643) rather than reflowing
- EventCard/QuickTaskCard/TaskQuickEditPopover are fixed-width panels (`PANEL_W=340`; overlays W=280/260 at ~3629/3754) positioned by viewport math — no mobile sheet
- Month overlay & all-day overflow popovers clamp to `window.innerHeight` but use fixed pixel widths that can exceed a narrow viewport
- `EventCard.tsx` uses native `<input type=date/time>` and `<select>` (TimeChip/DateChip/RepeatSelect/Reminder) — UI-polish backlog item
- Whole grid relies on mouse drag-create/reschedule (`mousedown/mousemove/mouseup`) with no touch handlers — drag won't work on touch devices

---

## Scheduling (booking links — owner side, embedded in Calendar)

| | |
|---|---|
| **Routes** | No standalone app route — surfaced inside `/calendar` via the left-rail `SchedulingPanel` and the grid compose overlay |

### API routes
- `GET /api/scheduling/links` — list owner's links + confirmed `booking_count`
- `POST /api/scheduling/links` — create link; mints slug via `lib/scheduling/slug.ts`; defaults `target_calendar_id` to `profiles.default_calendar_id`; `DEFAULT_WEEKLY` Mon–Fri 9–5
- `PATCH/DELETE /api/scheduling/links/[id]` — update editable fields / delete; owner-gated by RLS + `.eq user_id`
- `GET/PATCH /api/scheduling/conferencing` — Google Meet/Teams derived from connected integrations; Zoom personal link in `profiles.conferencing`
- `GET /api/integrations/calendar/calendars` — target/conflict calendar pickers

### Tables
`scheduling_links` (user_id, slug, title, kind `one_off|recurring`, duration, location_type, availability JSON `{weekly_hours|windows}`, target_calendar_id, conflict_calendar_ids, avoid_conflicts, single_use, max_bookings, active, expires_at, timezone) · `scheduling_bookings` (read for booking_count) · `profiles` (default_calendar_id; `conferencing.zoom_url`) · `user_calendars` (target + conflict options) · `integrations` (derive Meet/Teams availability)

### Main components
- `components/scheduling/SchedulingPanel.tsx` — left-rail list of links with active stripe + booking counts; "+ One-off" / "+ Recurring" buttons; listens for `scheduling:refresh`
- `components/scheduling/SchedulingComposePanel.tsx` — replaces the rail during compose; drag availability windows onto the week grid; POST/PATCH/DELETE links
- `components/scheduling/SchedulingLinkModal.tsx` — full-scrim modal alternative editor; `fixed inset-0 z-[200]`
- `components/scheduling/ManageConferencingModal.tsx` — Zoom URL + Meet/Teams status; `GET/PATCH /api/scheduling/conferencing`
- `lib/scheduling/slug.ts` (`mintSlug`), `lib/scheduling/availability.ts` (`computeOpenSlots`), `lib/scheduling/busy.ts` (`fetchBusy` across user_calendars/integrations)

### Key patterns
- Embedded-overlay: compose mode hijacks the Calendar left rail (CalendarClient hides "Upcoming", renders `SchedulingComposePanel`) and repurposes grid drag from event-create to availability-window-paint
- `scheduling:refresh` window event re-fetches links after save/delete; CalendarClient + SchedulingPanel both subscribe
- `one_off` links store absolute windows `{start,end}`; recurring links store `weekly_hours` keyed by weekday — `startEditCompose` reconstructs dragged windows from either shape
- Owner-gating via Supabase session + RLS, with `.eq('user_id')` belt-and-suspenders in the `[id]` route

### Cross-module links
- **Calendar**: physically lives in the Calendar UI; availability draws as hatched bars on the week grid; bookings create events on the organizer's target `user_calendar`
- **Settings/Integrations**: Meet/Teams availability derived from connected google/microsoft integrations; conflict-avoidance reads busy times from those calendars
- **profiles**: `default_calendar_id` and `conferencing.zoom_url` are shared owner-level settings

### Known TODOs / mocked
- `SchedulingLinkModal` and `SchedulingComposePanel` are two parallel editors for the same link (modal vs rail compose) — potential consolidation
- Conferencing limited to Google Meet / Teams (auto) + a static Zoom personal link; no per-meeting Zoom creation

### Mobile issues
- `SchedulingComposePanel.tsx` — designed to fit the 216px Calendar rail and depends on grid drag for window painting; unusable on touch/narrow screens
- `SchedulingLinkModal.tsx:174` — `fixed inset-0` modal with `.sl-input` fixed styling; usable but tuned for desktop form layout
- `ManageConferencingModal.tsx:40` — centered fixed modal, fine on mobile but inherits desktop input sizing
- Compose/edit relies on the same mouse-only grid drag as event-create — no touch support

---

## Public Booking page (invitee side)

| | |
|---|---|
| **Routes** | `/book/[slug]` (`app/book/[slug]/page.tsx` — public, service-role loaded, allowlisted in `proxy.ts`; outside the `(app)` auth group) |

### API routes
- `GET /api/book/[slug]/slots` — public open-slots; `computeOpenSlots` over availability minus busy + existing bookings; returns absolute UTC instants
- `POST /api/book/[slug]` — public booking: re-validates slot live, `createBookingEvent` on organizer calendar with Meet/Teams + invitee attendee, inserts `scheduling_bookings`, closes single_use links, sends `sendBookingEmails`

### Tables
`scheduling_links` (loaded by slug via service-role / `loadPublicLink`) · `scheduling_bookings` (read existing confirmed for slot validation; insert new) · `profiles` (organizer `display_name`/`studio_name`/`avatar_url`/`brand_color`/conferencing for branding) · `user_calendars` + `integrations` (via `createBookingEvent` and `fetchBusy`)

### Main components
- `app/book/[slug]/page.tsx` — server: `loadPublicLink`, `generateMetadata`, trims to `PublicLinkView`
- `components/scheduling/BookingClient.tsx` — interactive month picker + slot list + invitee form; fetches `/api/book/[slug]/slots`, POSTs `/api/book/[slug]`
- `lib/scheduling/public-link.ts` — `loadPublicLink` + `linkClosedReason` + organizer identity
- `lib/scheduling/create-booking-event.ts` — service-role event creation, separate from session-based `write-event.ts`
- `lib/scheduling/notify.ts` — Resend confirmation emails to invitee + organizer from `bookings@<domain>`
- `lib/scheduling/availability.ts` + `busy.ts` — slot math + free/busy

### Key patterns
- Service-role public path: no session; `loadPublicLink` uses `createServiceClient`; `proxy.ts` allowlists `/book`
- Double-validation: slots endpoint computes availability for display; POST recomputes live before booking to guard against races (409 if taken)
- Absolute-UTC slots + client-side timezone formatting (invitee picks their tz)
- Best-effort side effects: provider event create is hard-failed to the invitee (502) but email send is best-effort; provider also sends its own invite via `sendUpdates=all`
- `single_use` links flip `active=false` after first booking; `linkClosedReason` gates expired/fully-booked

### Cross-module links
- **Scheduling**: consumes the same `scheduling_links`/`scheduling_bookings` created owner-side
- **Calendar**: writes the booking as a real event onto the organizer's target `user_calendar` (Google/Microsoft) via `createBookingEvent`
- **profiles**: organizer branding (`brand_color`/logo) drives the booking page accent and confirmation email template
- **Email/Resend**: shares the app's transactional email setup (`bookings@` sender)

### Known TODOs / mocked
- Confirmation emails best-effort only (no retry/queue)
- Booking page assumes a single target calendar; no round-robin/multi-host

### Mobile issues
- `BookingClient.tsx:212` — `md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr_300px]` — this IS responsive (stacks on mobile), the best-adapted surface in the cluster; `min-h-[560px]` and fixed 280/300px columns only apply at md+
- Uses `.bk-input` with fixed desktop sizing but stacks cleanly; primary mobile risk is the 3-column layout collapsing to a tall scroll, which is handled

---

## Finance (shell + Overview + Time)

| | |
|---|---|
| **Routes** | `/finance` (`app/(app)/finance/page.tsx` — server component) · `/finance?tab=overview\|time\|invoices\|banking` (tab via `initialTab` searchParam) · `/finance?invoice=<id>` (deep-link to select an invoice on the Invoices tab) |

### Main components
- `app/(app)/finance/page.tsx` — server: `Promise.all` of `time_entries`, `active_timers`, `expenses`, `invoices`+joins, `projects`, `profiles.invoice_prefix`, `integrations(stripe)` → collapses to `stripeStatus`
- `components/finance/FinanceClient.tsx` — client: holds ALL finance state (timeEntries/invoices/expenses/activeTimer); owns the custom 52px topbar tab strip, timer tick interval, modal mounting, `startTimer`/`stopTimer`/`handleInvoiceCreated`/`handleInvoiceSent`
- `components/finance/OverviewTab.tsx` — 4 KPI stat cards + OverviewCharts + Time/Invoices/Expenses summary cards; empty-state hero
- `components/finance/OverviewCharts.tsx`
- `components/finance/TimeTab.tsx` — timer bar, week bar-chart, grouped entry list, delete confirm
- `components/finance/LogTimeModal.tsx`, `AddExpenseModal.tsx`, `QuickTimerButton.tsx`

### API routes
- No dedicated REST routes for time/overview — TimeTab/timer write directly via supabase client (`active_timers` upsert/delete, `time_entries` insert/delete in FinanceClient)

### Tables
`time_entries` (insert on stopTimer + LogTimeModal, delete) · `active_timers` (upsert on startTimer, delete on stop; `maybeSingle` per user) · `expenses` (read for overview/invoice pulls; written by Banking/AddExpenseModal) · `invoices` (+`invoice_line_items`, `invoice_attachments` via joins) · `projects` (id,title,type,rate) · `profiles` (invoice_prefix) · `integrations` (provider=stripe → `stripeStatus` gate)

### Key patterns
- Server-component fetches initial data → FinanceClient `useState` caches
- Custom window events: `finance:set-tab` (tour/deep-link tab switch, remaps legacy `expenses`→`banking`), `perennial:timer-started`/`perennial:timer-stopped` on start/stop
- Direct-supabase-from-client writes (no API layer) for timers & time entries
- Tab strip is a hand-rolled topbar, not Next routing — tab is local state
- Stripe gating: `openNewInvoice()` funnels every "New invoice" entry point; if `!stripeStatus.connected` it routes to the invoices tab (which shows the gate) instead of opening the modal
- Modals reused for create+edit by passing a pre-loaded row (`editTimeEntry`/`editExpense` flip new→edit)

### Cross-module links
- **Projects**: every time entry / expense / invoice optionally FKs `project_id`; rates flow `project.rate` → billable earnings + invoice line rates
- **Network**: invoice `client_contact_id` / `client_organization_id`
- **Settings → Integrations**: Stripe connect href `/api/auth/stripe` and `/settings?section=integrations&provider=stripe`
- **Tour**: `components/tour/finance/FinanceIntroModal` + `FinanceTooltipTour`, driven by `data-tour-target` attrs and `finance:set-tab` events

### Known TODOs / mocked
- `FinanceClient.tsx:89` — 3-dots "Finance options" menu is an intentional placeholder ("Settings will land here as the module grows")
- Expenses is no longer a top-level tab; `ExpensesTab.tsx` retained only because `NewInvoiceModal` pulls expense rows (dead-ish surface)
- Memory: `invoice_prefix`, expense-line-item pull listed as deferred Finance-audit TODOs

### Mobile issues
- `FinanceClient.tsx:216` — topbar fixed `height:52` with horizontal tab strip + action buttons in one non-wrapping row — overflows on narrow viewports
- `OverviewTab.tsx:146` — `grid grid-cols-4` KPI cards (no responsive breakpoint) — squish on mobile
- `OverviewTab.tsx:211` — main+side flex row with hardcoded side column `width:272` — no stacking
- `OverviewTab.tsx:206` — OverviewCharts row
- `TimeTab.tsx:229` — filter bar is a single non-wrapping flex row (Select 160px + week nav + billable toggle + week total)
- `TimeTab.tsx:265` — week bar chart is a 7-day flex row + legend — cramped but scales

---

## Invoices

| | |
|---|---|
| **Routes** | `/finance?tab=invoices` (InvoicesTab inside FinanceClient) · `/finance?tab=invoices&invoice=<id>` (`initialInvoiceId` preselect) · `/invoice/[id]/print` (`app/invoice/[id]/print/page.tsx` — server-rendered printable PDF view; `?preview=1` for in-app embed) |

### Main components
- `components/finance/InvoicesTab.tsx` — 2059 lines; list pane (296px) + detail pane scrim-style; inline line-item editing, status transitions, "Pull more" time/expense picker, client/project chooser, attachments, number edit, `SendInvoiceModal` sub-component with live iframe email preview
- `components/finance/NewInvoiceModal.tsx` — single-column `max-w-xl` modal: client picker, project, dates, pull billable time/expenses, manual lines
- `components/finance/InvoiceStripeGate.tsx` — full-pane connect/reconnect gate shown in place of the tab when Stripe not connected
- `app/invoice/[id]/print/page.tsx` + `PrintTrigger.tsx` — auto `window.print` on mount
- `lib/invoices/format.ts`, `email-template.ts`, `token.ts`, `notify.ts` — shared helpers

### API routes
- `POST /api/finance/invoices` — create invoice + all line items in one round trip; rolls back invoice on line-insert failure; auto-attaches expense receipts
- `POST /api/finance/send-invoice` — mints `public_token`, renders email via `buildInvoiceEmailHtml`, sends via Resend, flips draft/saved→sent + `sent_at`
- `POST /api/finance/invoices/[id]/mark-paid` — sets paid + `paid_at`, sends `sendInvoicePaidEmails`, returns joined invoice
- `POST /api/finance/invoices/[id]/public-link` — ensures/mints `public_token`, returns `/i/<token>` URL
- Most edits (line items, status≠paid, client/project/dates/text, attachments, delete) go DIRECTLY through supabase client from InvoicesTab

### Tables
`invoices` (status draft/saved/sent/paid/voided; public_token, sent_at/paid_at/voided_at, show_client_info, payment_terms/method/notes, stripe_payment_intent_id, payment_method_type/card_brand/card_last4, number unique) · `invoice_line_items` (source: time|expense|manual; time_entry_id/expense_id FK; amount=qty*rate) · `invoice_attachments` (source: manual|expense_receipt; path/url) · `contacts`, `organizations` (client + writes email/phone/location back) · `projects` (rate) · `profiles` (invoice_prefix, studio identity, brand_color, logo_url, address, ein, currency) · `integrations` (stripe gate)

### Key patterns
- Scrim/detail-panel: 296px list pane + `flex-1` detail pane; `selectedId` local state, empty until picked
- Optimistic updates: `handleInvoiceSent` flips to "sent" then re-fetches for `public_token`; status changes update parent invoices array
- `INVOICE_SELECT` canonical join re-fetched after every write so detail pane stays hydrated
- Editable-by-status state machine: draft open by default; saved edited behind a pencil (`editingSaved`); sent/paid/voided render read-only PDF view
- "Mark paid" routed through API (for emails) while other status transitions are direct supabase
- `sessionStorage` banner-dismissal (`perennial:invoices:bannerDismissed`)
- Live email preview: `SendInvoiceModal` renders `buildInvoiceEmailHtml` in an iframe `srcDoc` to match inbox 1:1
- Print page + public page are independent server components re-deriving studio identity from `profiles`
- Multi-select status filter (incl. derived "overdue") + 4-way sort with month/client group headers

### Cross-module links
- Pulls billable `time_entries` + `expenses` (with `project_id`) into line items; tracks `invoicedTimeIds`/`invoicedExpenseIds` to compute "ready to bill"
- Clients are Network contacts/organizations; writes client field edits back to those tables
- **Banking** auto-match: bank credit → `matchInvoice` marks invoice paid (`onInvoiceMarkedPaid` from BankingTab)
- **Stripe**: public payment page `/i/[token]` + payment-intent API + webhook mark the invoice paid
- **Settings**: studio identity / brand color / invoice_prefix consumed in email + print + public pages

### Known TODOs / mocked
- `deleteInvoice` manually deletes `invoice_line_items` first "to keep the API honest" if FK isn't `ON DELETE CASCADE` — uncertainty about cascade
- Memory deferred: signed receipt URLs, invoice prefix polish
- UI-only notif toggles need a cron (memory)

### Mobile issues
- `InvoicesTab.tsx:804` — detail layout is `flex ... p-5` with a fixed 296px list pane (line 807) + `flex-1` detail — two-pane assumes desktop width, no stacking
- `SendInvoiceModal` `InvoicesTab.tsx:104-127` — fixed `maxWidth:1160`/`height:92vh` with a 360px compose rail + iframe preview; has `md:flex-row` at :125 so it stacks below md but the 360px rail (:127) keeps `shrink-0`
- `InvoicesTab.tsx:1245/1254` — `width:156` inline date/select fields; `:1582` `width:340` and `:1952` `width:280` dropdowns — fixed-width popovers
- Print page `app/invoice/[id]/print/page.tsx:139` — `.parties` `grid-template-columns:1fr 1fr 1fr` and :170 footer 2-col — fine for print, tight on phone screen view
- `NewInvoiceModal` is single-column `max-w-xl` (mobile-friendlier than the send modal)

---

## Banking

| | |
|---|---|
| **Routes** | `/finance?tab=banking` (BankingTab inside FinanceClient; primary surface for expense triage — replaced the old Expenses tab) |

### Main components
- `components/finance/BankingTab.tsx` — 2626 lines; unified Rocket-Money-style transaction table: accounts strip with per-card ⋯ menu, 5-up KPI cards, auto-match banners, sticky filter/sort bar, paginated rows with inline `ExpandedRow` actions, bulk-select ribbon, Plaid/Teller connect via `next/script` SDK shims
- `components/finance/ManualTransactionModal.tsx` — add cash/Venmo manual tx, `provider='manual'`
- `components/finance/AddExpenseModal.tsx` — reused for manual expense + edit-linked-expense
- `components/finance/CustomizeCategoriesModal.tsx` — custom categories → `profiles.custom_categories`
- `components/finance/plaidCategoryDisplay.ts` — `CANONICAL_CATEGORIES`, `categoryFor`, `expenseForCategory`, `primariesForKey`
- `lib/finance/customCategories.ts`, `lib/uploads/receipt.ts`

### API routes
- `GET /api/finance/banking/transactions` — paginated/filterable/sortable list + month KPIs + per-status pill counts
- `GET /api/finance/banking/queue` — `to_review`, `invoice_activity` with $1-tolerance suggested invoice matches, `outstanding_invoices`, `hidden_count`
- `POST /api/finance/banking/transactions/manual`
- `POST .../[id]/personal`, `.../[id]/match-invoice`, `.../[id]/unmatch`, `.../[id]/convert-to-expense`
- `PATCH .../[id]/category`, `.../[id]/name`, `.../[id]/note`, `.../[id]/receipt`
- Provider routes (sibling cluster): `/api/integrations/{plaid|teller}/{link-token,enroll,accounts,transactions}` — GET `/transactions` triggers server-side sync
- Some deletes/edits direct via supabase (`deleteLinkedExpense`, `openEditLinkedExpense`, `custom_categories` load)

### Tables
`bank_transactions` (amount, type debit/credit, date, `details` JSONB w/ personal_finance_category+merchant_name, is_personal, linked_expense_id, matched_invoice_id, manual_category, manual_custom_id, custom_name, note, receipt_url/path) · `bank_accounts` (name, institution, last_four, type depository/credit, subtype, balance_available/current) · `expenses` (created by convert-to-expense; linked via `linked_expense_id`) · `invoices` (matched via `matched_invoice_id`; match marks paid) · `profiles` (custom_categories) · `integrations` (plaid/teller rows)

### Key patterns
- Server-fetch-then-client-state with request-id guarding (`reqIdRef`) to drop superseded fetches
- Optimistic mutators (`patchLocal`) with rollback on API failure for personal/match/unmatch/note/name/category/receipt
- `needs_review` semantics = NOT personal AND no linked_expense AND no matched_invoice; pill counts via head-only count queries honouring non-status filters
- Debounced search (`useDebounced` 300ms), reset-to-page-1 on filter change
- Inline `ExpandedRow` IS the log-expense workflow (modal pathway kept dormant as fallback)
- Two-click confirm ribbon actions (fixed-width pill to prevent reflow); snackbar with optional Undo (auto-dismiss 4s)
- Auto-match banners sourced from `queue.invoice_activity`, capped at 3, session-local dismissals
- Plaid/Teller SDK loaded via `next/script` with a 15s probe; provider chosen by `NEXT_PUBLIC_BANK_PROVIDER`
- `createPortal` used for some overlays

### Cross-module links
- convert-to-expense creates an `expenses` row and bubbles `onExpenseCreated` up to FinanceClient's expenses cache (then pullable into invoices)
- match-invoice flips an invoice to paid → `onInvoiceMarkedPaid` updates the parent invoices array (Banking↔Invoice reconciliation)
- queue route reads `invoices` to suggest matches by amount tolerance
- Shares receipt upload helper (`lib/uploads/receipt`) with Invoices attachments

### Known TODOs / mocked
- `BankingTab.tsx:869`/`:1139` — "+N more" affordance for match banners beyond 3 is deferred per spec
- `deleteLinkedExpense` not transactional (Supabase JS can't) — rare orphan-link window acknowledged in code
- Memory deferred (banking_categories): `manual_category` stores canonical key, sync must never seed it; banking↔invoice match listed in Finance-audit TODOs
- Memory: file delete/replace, alias click-through (Resources audit) tangential

### Mobile issues
- `BankingTab.tsx:1115` — `grid grid-cols-5` KPI cards — 5 cols won't fit on mobile
- `BankingTab.tsx:1062` — accounts strip is horizontal `overflow-x-auto` with cards `minWidth:168-208` + dashed add tile — okay-ish but wide
- `BankingTab.tsx:1202` — sticky filter bar with FilterPills + 220px search input in one row (:1222) — non-wrapping
- Wide data table with many columns + inline expanded actions assumes desktop width; row layout not designed to reflow
- `ManualTransactionModal` / `AddExpenseModal` are standard centered modals

---

## Public invoice payment (Stripe Connect)

| | |
|---|---|
| **Routes** | `/i/[token]` (`app/i/[token]/page.tsx` — public, no-auth, service-role lookup by unguessable `public_token`; only sent/paid/voided are shareable, draft/saved 404; `?preview=1` = owner embed with no pay UI) · `/api/auth/stripe` (begin Connect OAuth) · `/api/auth/stripe/callback` (complete OAuth, upsert integrations row + writeTokens) · `/api/stripe/webhook` (Stripe events receiver) · `/api/finance/invoices/[id]/payment-intent` (mint/reuse PaymentIntent on owner's connected account) |

### Main components
- `app/i/[token]/page.tsx` — server: renders invoice paper + right aside = paid receipt / live payment form / void notice
- `app/i/[token]/PaymentSectionMount.tsx` + `PaymentSection.tsx` — client: Stripe Elements / PaymentElement
- `app/i/[token]/PrintButton.tsx`
- `app/api/stripe/webhook/route.ts` — verifies platform OR connect signing secret; `payment_intent.succeeded` → mark invoice paid idempotently + pull card brand/last4 + `sendInvoicePaidEmails`
- `lib/stripe/server.ts`, `lib/integrations/stripe.ts`, `lib/integrations/storage.ts`, `lib/invoices/notify.ts`, `lib/invoices/token.ts`

### API routes
- `POST /api/finance/invoices/[id]/payment-intent` — re-verifies `public_token`, finds owner's active `integrations.account_id`, creates direct charge on connected account via `automatic_payment_methods`, with explicit card/us_bank_account/link fallback when no methods enabled; persists `stripe_payment_intent_id`
- `GET /api/auth/stripe` + `/api/auth/stripe/callback` — Connect Standard OAuth, state/next cookies
- `POST /api/stripe/webhook`

### Tables
`invoices` (public_token lookup, stripe_payment_intent_id, status→paid, paid_at, payment_method_type/card_brand/card_last4) · `invoice_line_items` (total) · `integrations` (provider=stripe, account_id acct_xxx, status active/error/disconnected; tokens written separately) · `profiles` (currency, studio identity for From block) · `contacts`/`organizations` (bill-to + notify recipients)

### Key patterns
- Service-role client for public token-auth reads (RLS can't gate by request param; unguessable token is the auth)
- Stripe Connect Standard, direct charges, no platform fee — money lands in user's own Stripe (per memory)
- Idempotent webhook: no-ops on already-paid; tries platform secret then connect secret; returns 500 to force Stripe retry on DB failure
- PaymentIntent reuse for usable states (requires_payment_method/confirmation/action/processing) + amount match; cancels empty intent and retries with explicit method allowlist
- Two payment paths converge on "paid": webhook (online) and mark-paid API (manual) both call `sendInvoicePaidEmails`
- Catch-all error wrapper returns JSON so the hosted page never dies on "Unexpected end of JSON input"

### Cross-module links
- Payment success flips the `invoices` row → reflected in Finance Invoices tab on next load
- **Settings → Integrations** is where the Stripe account is connected/managed (InvoiceStripeGate links there)
- `InvoiceStripeGate` + `page.tsx` `stripeStatus` gate the whole Invoices tab on a healthy connection
- Print page `/invoice/[id]/print` linked from the public page PDF button

### Known TODOs / mocked
- Memory Finance-audit deferred: Stripe-data surface, signed receipt URLs
- Payment-intent fallback won't help if Card is explicitly disabled on the connected account (only covers "nothing enabled")
- `payment_intent.payment_failed` intentionally does not mutate invoice state (client retries inline)

### Mobile issues
- `app/i/[token]/page.tsx:124` — `.pi-grid` `grid-template-columns: minmax(0,1fr) 360px` (invoice + payment aside) — HAS a `@media(max-width:880px)` at :128 collapsing to 1 col (one of the few responsive surfaces in the cluster)
- Print page (`app/invoice/[id]/print`) is print-oriented; on-screen view uses `max-width:760px` page, fine
- Public page studio/meta grids (`.pi-meta` 2-col :170) acceptable; overall the most mobile-aware surface in the cluster

---

## Network

| | |
|---|---|
| **Routes** | `/network` (`app/(app)/network/page.tsx`; no public routes) |

### Tables
`contacts` · `organizations` · `contact_activities` · `contact_files` · `organization_activities` · `organization_files` · `notes` · `tasks` · `invoices` (read-only roll-up in OrganizationDetailPanel) · `integrations` (read in import API routes) · `projects`/`project_contacts` (referenced via tasks join and org TODO)

### API routes
- `POST /api/integrations/google/contacts/import` (`app/api/integrations/google/contacts/import/route.ts` — used by ImportContactsModal)
- `POST /api/integrations/microsoft/contacts/import` (`app/api/integrations/microsoft/contacts/import/route.ts`)

### Main components
- `app/(app)/network/page.tsx` — server component; fetches contacts (with organization join) + organizations in parallel via `Promise.all`, passes to client
- `components/network/NetworkClient.tsx` — top-level client; tri-view tab strip (contacts / leads / organizations), holds all list state, filtering, sorting, bulk-archive, CSV export/import, deep-link consumption
- `components/network/ContactDetailPanel.tsx` — scrim/detail panel (1644 lines); tabs Canvas/Activity/Tasks/Notes/Files, Tiptap rich editor with inline Ash, convert-lead-to-contact at line 1170
- `components/network/OrganizationDetailPanel.tsx` — org scrim panel; canvas, activity, files, tags, "People at this org" rail, invoice roll-up, fires `network:open-contact` + `outreach:open-target`
- `components/network/NewContactModal.tsx`, `NewOrganizationModal.tsx` — create modals
- `components/network/ImportContactsModal.tsx` — CSV importer + column-mapping (reuses editor-image helper for embedded images per AGENTS.md)
- `components/network/NetworkOptionsMenu.tsx` — 3-dot menu (show-archived toggle; tag-manager is placeholder)

### Key patterns
- Server-component fetches initial data → NetworkClient `useState`
- Scrim/detail-panel pattern (ContactDetailPanel + OrganizationDetailPanel are fixed-position overlays with a blurred scrim, maximize/minimize)
- Custom window events for cross-view sync: `network:open-contact` (org panel → NetworkClient flips view + opens contact), `contacts:created`/`contacts:modal-opened`/`contacts:detail-opened` (tour), `set-organization-context`/`clear-organization-context`
- Deep-link URL params consumed once then stripped via `router.replace('/network')`: `?view=`, `?new=1`, `?import=1`, `?contactId=&tab=&taskId=&noteId=`, `?organizationId=`
- Optimistic local updates with direct supabase client calls (bulk archive, restore, canvas autosave on 800ms debounce + unmount flush)
- `contacts` table is shared by both "contacts" and "leads" views, discriminated by `is_lead` boolean; `lead_stage` enum drives the leads stage filter
- Fixed 7-column CSS grid (`GRID` const line 96) reused for both contacts and organizations tables

### Cross-module links
- `contacts.organization_id` FK → `organizations` (joined everywhere)
- **Leads here ARE the same `is_lead` contacts the Outreach module renders in LeadsBoard**; converting a lead (`is_lead:false`, `lead_stage:null`) moves it between Network views
- OrganizationDetailPanel reads `invoices` by `client_organization_id` and links to `/finance?tab=invoices` (Finance)
- Tasks tab joins `projects` (`project:projects(id,title)`); notes link to `/notes?id=`
- Outreach `TargetDetailPanel` canvas writes to `contacts.canvas_html` / `organizations.canvas_html` — shared workspace, "Open in Network" deep-link
- Org panel fires `outreach:open-target` to jump into Outreach

### Known TODOs / mocked
- `NetworkOptionsMenu.tsx:109-126` — tag manager is a placeholder ("Rename, recolour, prune — coming soon")
- `OrganizationDetailPanel.tsx:1176` — TODO: "Projects involving this org" section (projects→orgs link not yet surfaced)
- `ImportContactsModal.tsx:260` — sets `lead_stage:'identified'` on import, but the `LeadStage` enum uses `'new'` (likely stale stage value mismatch)
- ContactDetailPanel `ContactFilesTab` uses public `contact-files` bucket with `getPublicUrl` (no signed URLs)

### Mobile issues
- `NetworkClient.tsx:96` — fixed grid `GRID = 32px 2.6fr 1.6fr 1.2fr 0.9fr 1.1fr 0.8fr` — 7 columns won't collapse; rows overflow horizontally
- `NetworkClient.tsx:445-446` — custom topbar `height:52` with title + tab strip + actions all on one inline row; overflows on narrow screens
- `NetworkClient.tsx:565-567` — search box fixed `width:200`
- `NetworkClient.tsx:922` — bulk bar is fixed `bottom-7 left-1/2 -translate-x-1/2` (assumes desktop centering)
- ContactDetailPanel / OrganizationDetailPanel are fixed-position scrim panels offset by `calc(56px + 32px)` left rail width — assume desktop sidebar; no mobile breakpoint
- ContactDetailPanel uses `datetime-local` and native inputs (UI-polish backlog)

---

## Outreach

| | |
|---|---|
| **Routes** | `/outreach` (`app/(app)/outreach/page.tsx`; no public routes) |

### Tables
`outreach_pipelines` · `pipeline_stages` · `outreach_targets` · `outreach_target_projects` (link table target↔project) · `contacts` (leads + follow-ups + linked person) · `organizations` (linked org + orphan-target creation) · `contact_activities` (follow-up logging) · `projects` (promote-to-project + linked projects search) · `profiles` (read by seed-pipelines for onboarding answers)

### API routes
- None — Outreach uses the supabase browser client directly for all reads/writes (no `app/api` routes)

### Main components
- `app/(app)/outreach/page.tsx` — server component; calls `ensureSeedPipelines(user.id)`, then fetches pipelines(+stages), targets(+pipeline/stage/contact/org joins), contacts in parallel
- `components/outreach/OutreachClient.tsx` — top-level client wrapped in `ProjectOptionsProvider`; left nav rail (Leads / Follow-ups / Pipelines / All Ether), holds pipelines/targets/contacts state, all stage + ether + follow-up mutation handlers, PipelineDescriptionBar
- `components/outreach/PipelineBoard.tsx` — kanban (1411 lines) via `@hello-pangea/dnd`; stage columns + outcome columns + "The Ether" parking lot; meta-stage aggregate columns for all-pipelines view; inline follow-up logger on card right-edge
- `components/outreach/LeadsBoard.tsx` — kanban of `is_lead` contacts by `lead_stage`; LeadCard shows pipeline-membership chip (fetched from outreach_targets)
- `components/outreach/FollowUpsBoard.tsx` — contacts not touched in >30 days
- `components/outreach/TargetDetailPanel.tsx` — scrim/detail panel (1162 lines); canvas of wrapped entity, stage picker, linked projects/people rails, promote-to-project, convert-lead-to-contact, OrphanTargetPrompt; Tasks/Notes/Files are StubPanes
- `components/outreach/NewPipelineModal.tsx`, `EditPipelineModal.tsx`, `NewTargetModal.tsx` — modals
- `components/outreach/OutreachOptionsMenu.tsx` — show-outcomes / show-closed toggles (UI-only), edit/archive pipeline
- `lib/outreach/seed-pipelines.ts` — idempotent onboarding-driven pipeline seeding (flags `seeded=true`)

### Key patterns
- Server-component fetches initial data → OutreachClient `useState`
- Kanban drag-and-drop via `@hello-pangea/dnd` with optimistic updates then supabase round-trip (`handleStageChange`, `handleEtherToggle`, `handleLeadStageChange`)
- Scrim/detail-panel pattern (TargetDetailPanel — fixed overlay offset by `calc(56px + 32px)` left, maximize toggle, blurred scrim)
- Custom window events for cross-view sync: `outreach:open-target` (LeadsBoard chip + org panel → OutreachClient opens target), `outreach:project-linked` (promote → LinkedProjects rail re-fetch), `outreach:followup-logged`, plus tour events
- **The Ether** — per-pipeline + global parking lot; special droppable ids `__ether__` and `__meta__:` prefix let one `DragDropContext` route stage/ether/meta drops
- **"Target wraps a Contact OR Organization"** architecture — `target.canvas` lives on the wrapped entity; OrphanTargetPrompt migrates an unlinked target into a new lead/org
- Optimistic local state + `createClient()` direct writes for stage rename/delete/create, follow-up timestamps (`last_touched_at` vs `last_followup_at` distinction)
- `ProjectOptionsProvider` context wraps the module so TargetDetailPanel promote-to-project can read project type/status options

### Cross-module links
- `outreach_targets.contact_id` FK → `contacts`; `.organization_id` FK → `organizations`; `.pipeline_id` → `outreach_pipelines`; `.stage_id` → `pipeline_stages`
- Leads section reuses the SAME `contacts` (`is_lead`) shown in Network; `NewContactModal` + `ContactDetailPanel` imported directly from `components/network/`
- TargetDetailPanel canvas edits `contacts.canvas_html` / `organizations.canvas_html` — shared with Network; banner "also editable in Network" with `/network?contactId=` deep-link
- Promote-to-project creates a `projects` row + `outreach_target_projects` link; LinkedProjects links to `/projects?projectId=`
- Follow-up logging inserts `contact_activities` + updates `contacts.last_contacted_at` (writes into Network's activity feed)
- `seed-pipelines` reads `profiles` onboarding answers

### Known TODOs / mocked
- `TargetDetailPanel.tsx:628-645` + `1137-1140` — Tasks / Notes / People / Files tabs are StubPane placeholders; only Canvas is real
- `OutreachClient.tsx:62-66` — showOutcomes/showClosed prefs are UI-only, not persisted to `profiles.outreach_preferences`
- `OutreachClient.tsx:670` — "Suggested" pill logic relies on `seeded` flag; tied to seed templates that duplicate `NewPipelineModal` options (seed-pipelines.ts notes the duplication)
- TargetDetailPanel toast is a local string hack ("no toast lib in the app yet")
- LinkedPeople rail supports only one `contact_id` (schema is single-link; multi-person not yet supported)

### Mobile issues
- `OutreachClient.tsx:425-426` — left nav rail fixed `width:188` with borderRight; no collapse on mobile
- `PipelineBoard.tsx` — kanban columns fixed `width:210` (`DroppableColumn` line 440, `MetaColumn` line 862) inside `overflowX:auto`; on phone only ~1.5 columns visible
- `LeadsBoard.tsx:225` — columns `minWidth:200 width:220` fixed, horizontal scroll on mobile
- `PipelineBoard.tsx:1024` — ether search input fixed `width:200`; EtherSection cards fixed `width:210`
- `TargetDetailPanel.tsx:869-879` — scrim panel uses fixed offsets `top:52/bottom:32/left:calc(56px+32px)/right:32` and a 268px left sidebar (882-885); no mobile breakpoint
- `TargetDetailPanel.tsx:992-999` — native `<select>` for promote-to-project type (design-system mismatch)
- PipelineBoard ether/board sections use `maxHeight:38vh` — viewport-relative, generally ok but the dnd kanban interaction is poor on touch

---

## Presence — Overview

| | |
|---|---|
| **Routes** | `/presence` (`app/(app)/presence/page.tsx`) — server component; `?tab=overview` is the default tab |

### Main components
- `app/(app)/presence/page.tsx` — server: fetches opportunities + `profile.practice_types`, passes to client
- `components/presence/PresenceClient.tsx` — `OverviewTab()` at line 497; default export `PresenceClient` at 2459 (holds tab state, integrations state, modals)
- `components/presence/PresenceCharts.tsx` — AudienceReachCard / FollowerGrowthCard / ChannelsCard SVG visualizations (rendered when any channel connected, line 560-562)

### API routes
- `GET /api/integrations/instagram/stats` (background refresh via Socials)
- `GET /api/integrations/ga4/stats`
- `GET /api/integrations/newsletter/stats`
- Client reads `integrations` table directly on mount (PresenceClient line 2517-2522)

### Tables
`integrations` (read: id, provider, account_name, metadata, connected_at, last_synced_at) · `opportunities` (read via server page for "Coming up" + Opportunities stat) · `profiles` (read `practice_types` in page.tsx; `website` in WebsiteTab)

### Key patterns
- Server-component fetches opportunities + practiceTypes; PresenceClient owns all interactive state
- Tab state persisted to URL via `history.replaceState` (`?tab=…`) — `setTab()` line 2466; deep-link effect line 2503 reads `?tab` and `?opportunityId`
- `getInt(provider)` selector maps provider strings to channel cards; provider `google_analytics` aliased to local var named `plausible` (line 2541, historical naming)
- Custom window event `open-ash` dispatched by `openAsh()` (line 14) for cross-module Ash hand-off — used by StatCard "Ask Ash", AshCard, empty states
- Stat cards are clickable and call `onTabChange` to jump to the channel sub-tab; unconnected cards `window.location` to OAuth start (`/api/auth/google-analytics`, `/api/auth/instagram`)

### Cross-module links
- Header CTAs navigate to `/settings?section=integrations` to connect channels (lines 2631, 2654) — connection management lives in Settings, Presence is the consumer
- `open-ash` custom event hands off to the Ash assistant module
- Stat cards cross-link internally to Website/Socials/Newsletter/Opportunities sub-tabs

### Known TODOs / mocked
- Recent activity feed is an intentional truthful empty state — real per-channel feed deferred until publishers (post composer / send-newsletter) exist (lines 570-588)
- 3-dot options menu is a placeholder hook (line 2480); currently only "Manage channels" link
- Newsletter stat card defaults the unconnected CTA to beehiiv via `onConnect('beehiiv')` (line 550)

### Mobile issues
- Stat cards use a hard 4-column grid: `gridTemplateColumns:'repeat(4, minmax(0, 1fr))'` (line 517) — crushes on phone widths
- Two-column layout with a fixed 280px right rail: `width:280, flexShrink:0` (line 593) beside a `flex:1` activity feed — no wrap, right rail overflows narrow screens
- Whole module assumes a desktop shell with 44px header tab bar + horizontal tab row (line 2553-2567); tabs `whiteSpace:nowrap` overflow horizontally on mobile

---

## Presence — Website (Google Analytics / GA4)

| | |
|---|---|
| **Routes** | `/presence?tab=website` (WebsiteTab in `PresenceClient.tsx`, line 634) |

### Main components
- `components/presence/PresenceClient.tsx` — `WebsiteTab()` line 634 (OAuth-callback detection, property picker, connected stats dashboard, ConnectionBar)
- `lib/presence/detectHostingPlatform.ts` — `detectHostingPlatform()`/`guideFor()` tailor install guide to user's `profile.website` host

### API routes
- `GET /api/integrations/ga4/properties` (list GA4 properties after OAuth)
- `POST /api/integrations/ga4/properties` (save selected `propertyId` onto integration metadata)
- `GET /api/integrations/ga4/stats` (fetch + persist sessions, users, top_pages, channels)
- OAuth start `/api/auth/google-analytics`, callback `/api/auth/google-analytics/callback` (writes `provider='google_analytics'`)

### Tables
`integrations` (provider=`google_analytics`; route updates metadata with property_id/name, last_fetched, stats, step=`select_property`) · `profiles` (read `website` for hosting-platform detection, line 657)

### Key patterns
- OAuth redirect flow: callback returns `?step=select-property`, WebsiteTab detects it (line 671), shows property picker, POSTs choice, then loads stats
- Cached-then-refresh: shows `integration.metadata` stats immediately (no flash) then always re-fetches `/ga4/stats` in background (lines 714-723)
- Three-state machine: idle (connect CTA) → select_property → connected; resets to idle when integration prop goes null (disconnect)
- "No traffic yet" vs "Couldn't load GA4 data" distinguished by `stats.report_error` (line 886) — truthful empty state

### Cross-module links
- Reads `profiles.website` to tailor the GA4 install guide per hosting platform
- Disconnect calls `/api/integrations/connect?provider=google_analytics` (DELETE)

### Known TODOs / mocked
- GA4 Data API may be disabled at the Cloud-project level (per MEMORY: project 525192339885) — "No traffic yet" can actually mean the Data API isn't enabled
- `report_error` surfaced rather than silently blank

### Mobile issues
- ConnectionBar uses `padding:'10px 24px'` single row that flexes ok, but the connected stats dashboard uses 22px/24px desktop padding throughout
- Native `<select>` property picker (line 834) — UI-polish backlog

---

## Presence — Socials (Instagram)

| | |
|---|---|
| **Routes** | `/presence?tab=socials` (SocialsTab in `PresenceClient.tsx`, line 1075) |

### Main components
- `components/presence/PresenceClient.tsx` — `SocialsTab()` line 1075 (stats fetch, follower-delta computation, recent-posts grid, sub-tab bar)

### API routes
- `GET /api/integrations/instagram/stats` (fetches Graph API followers/engagement/recent_posts/followers_history, persists to integration row, line 147 update)
- OAuth start `/api/auth/instagram`, callback `/api/auth/instagram/callback`

### Tables
`integrations` (provider=`instagram`; metadata: followers_count, media_count, engagement_rate, recent_posts, followers_history, ig_user_id, last_fetched)

### Key patterns
- Staleness-gated refresh: only refetches if `last_fetched` > 30 min old, unless `retryNonce` forces it (lines 1096-1100)
- Optimistic local merge: `onRefreshed()` merges fresh Graph data into the parent integrations state (`updateIntegration` line 2547)
- Quiet error chip: surfaces truncated raw Meta/Graph error body when stats fetch 502s (`igError`, lines 1082-1128)
- 30-day follower delta computed from accumulated `followers_history` snapshots (lines 1166-1175)
- Disabled-but-visible sub-tabs (TikTok/Pinterest/LinkedIn marked `soon:true`, line 1181) reserve the slot for future networks

### Cross-module links
- Disconnect → `/api/integrations/connect?provider=instagram` (DELETE)
- Feeds the Overview "Socials" stat card and PresenceCharts follower-growth + audience-reach cards

### Known TODOs / mocked
- TikTok / Pinterest / LinkedIn sub-tabs are placeholders ("·soon"), not yet selectable (lines 1183-1185, 1229)
- Replaced a previously mocked Post queue / Quick compose UI with a "Coming soon" card (line 1382, 1398)

### Mobile issues
- Fixed 280px right rail: `width:280, flexShrink:0` (line 1026) — same non-wrapping two-column issue as Overview
- Recent-posts likely a fixed multi-column grid inside the 22px/24px desktop padding shell

---

## Presence — Newsletter (Beehiiv / Kit / Mailchimp / Substack)

| | |
|---|---|
| **Routes** | `/presence?tab=newsletter` (NewsletterTab in `PresenceClient.tsx`, line 1424) |

### Main components
- `components/presence/PresenceClient.tsx` — `NewsletterTab()` line 1424; `ConnectIntegrationModal()` line 63 (API-key or manual-stat entry); `PROVIDER_META` map line 56

### API routes
- `GET /api/integrations/newsletter/stats` (iterates user's newsletter integrations, refreshes subscriber_count/open_rate, updates rows)
- `POST /api/integrations/connect` (validates provider API key — Beehiiv/Kit/Mailchimp — or stores manual Substack metadata; line 84 in client)
- `DELETE /api/integrations/connect?provider=…`

### Tables
`integrations` (provider in `beehiiv|kit|mailchimp|substack`; metadata: subscriber_count, open_rate, publication_name; connect route POST inserts, line 130)

### Key patterns
- Newsletter resolved as first connected of `[beehiiv,kit,mailchimp,substack]` (line 2542) — single newsletter channel surface
- On-mount stats refresh matches result by provider and merges into metadata (lines 1436-1447)
- Substack handled as manual entry (`isManual`) since it has no stats API — user types subscriber_count/open_rate (modal lines 120-139)
- Provider validation happens server-side in `/connect` by calling each provider's API with the key before inserting

### Cross-module links
- Feeds Overview "Newsletter" stat card and PresenceCharts audience-reach
- Disconnect → `/api/integrations/connect` (DELETE)

### Known TODOs / mocked
- Per-send history, click-through, and a next-send drafter are NOT wired up — explicit "Send history is coming" / "Coming soon" cards (lines 1519-1535)
- Plausible provider branch still exists in `/connect` route (line 25) though GA4 OAuth has superseded it; `kit` provider in `PROVIDER_META` but connect support varies

### Mobile issues
- Fixed 280px right rail `width:280` (line 1395) — non-wrapping two-column
- ConnectIntegrationModal fixed `maxWidth:420` centered (line 104) — fine, but two-up provider grid (`gridTemplateColumns:'1fr 1fr'`, line 1464) and inline `flex gap-3` stat inputs may be tight on small phones

---

## Presence — Press

| | |
|---|---|
| **Routes** | `/presence?tab=press` (PressTab) |

### Main components
- `components/presence/PressTab.tsx` — default export `PressTab()` line 50 (coverage log + summary chips + PR Playbook); `LogCoverageModal()` line 275; `PlaybookCard()` line 236

### API routes
- None — uses Supabase browser client directly (`press_mentions` select/insert/delete; `projects` + `contacts` for the link dropdowns)

### Tables
`press_mentions` (read all ordered by `published_at`; insert from LogCoverageModal with type, publication, title, url, notes, stats jsonb, project_id, contact_id; delete) · `projects` (read id,title for the "link to project" dropdown — cross-module) · `contacts` (read id, first/last name where archived=false for "link to contact" dropdown — cross-module)

### Key patterns
- Optimistic delete: removes from local state before awaiting the DB delete (line 70)
- Client-direct Supabase CRUD (no API layer) with RLS owner-scoping
- `stats` stored as a jsonb map (reach/impressions/etc.); "Auto-pulling reach from connected platforms is coming" (line 395)

### Cross-module links
- `press_mentions.project_id` FK → `projects` (Projects); `press_mentions.contact_id` FK → `contacts` (Network) — set in LogCoverageModal (lines 321-322)
- Copy points users to the Outreach module for active pitching (line 81)

### Known TODOs / mocked
- Auto-pulling reach/impression stats from connected platforms is deferred (line 395) — currently manual numeric entry
- PR Playbook items appear to be static content (PlaybookCard / Play type)

### Mobile issues
- Coverage log rows are single-line ellipsised flex rows (ok), but stat-entry grid is `grid-cols-2` (line 386) inside the modal
- Desktop 22px/24px padding shell; header is a flex row with a pill button that should wrap acceptably

---

## Presence — Opportunities (curated feed + calendar)

| | |
|---|---|
| **Routes** | `/presence?tab=opportunities` · Deep links: `/presence?opportunityId=<id>` (from Calendar bars) and `/presence?tab=opportunities` (from Calendar empty state) |

### Main components
- `components/presence/PresenceClient.tsx` — `OpportunitiesTab()` line 2178 (filters/sort/search/discipline chips, list vs calendar view)
- `OppCard()` line 1861 (grid card), `OppDetail()` line 1715 (right detail panel / scrim), `MonthCalendar()` line 1578, `SuggestListingModal()` line 2082, `DisciplineFilter()` line 2010, `PillSelect()` line 1988
- `lib/opportunities/disciplines.ts` — `tagsForPractices()`/`disciplineLabel()` map profile `practice_types` to recommended tags

### API routes
- `POST /api/opportunities/status` (sets `user_status`: saved/applied/attending/exhibiting/hidden or null via service-role admin client — `postOppStatus` line 203)
- `opportunity_suggestions` insert is direct via Supabase browser client (SuggestListingModal line 2107)

### Tables
`opportunities` (read via server page; write `user_status` only, through the service-role route because curated rows are service_role-write-only) · `opportunity_suggestions` (insert: user_id, title, category, event_type, location, start_date, website_url, notes) · `profiles` (`practice_types` drives recommended-tag matching)

### Key patterns
- Scrim/detail-panel: `OppDetail` is a fixed 340px right panel (line 1747) alongside the card grid; selecting a card opens it
- Optimistic status + hide: `handleStatusChange`/`dismiss` update `localOpps` immediately, then POST to `/opportunities/status` (lines 2218-2221, 1727-1737)
- Deep-link handling: `?opportunityId` scrolls+highlights the matching card for 2.5s then strips the query (lines 2196-2215) — used by Calendar multi-day bars
- Computed lifecycle status drives "Most urgent" sort and badges (`lifecycleStatus` line 262; `oppSection` line 217)
- Two views: list (auto-fill card grid) and a custom `MonthCalendar` with lane-packed multi-day event bars (`getWeekEvents` line 321)
- Filters derived from data actually present (`presentCategories`/`presentDisciplines`) so no empty buckets
- "Suggest a listing" header CTA fires `open-ash` hand-off; SuggestListingModal writes `opportunity_suggestions` as the real submission path

### Cross-module links
- Calendar module links in: `/presence?opportunityId=<id>` (`CalendarClient.tsx` line 3086) and `/presence?tab=opportunities` (line 2254)
- `opportunities.user_status` is a single shared/global column (single-tenant) — flagged in route as needing a per-user table for multi-user
- `open-ash` event for "Draft application with Ash", "Ask Ash about opportunities"
- Curate admin (`/admin`) + ingest endpoint populate the opportunities feed (per MEMORY)

### Known TODOs / mocked
- `user_status` is single global column on shared rows — explicit TODO that multi-user needs a per-user opportunity-state table (`status/route.ts` lines 8-10)
- "Attach work samples" button in OppDetail (line 1822) has no onClick — placeholder
- Manual opportunity submission was deferred (per MEMORY); SuggestListingModal + "Suggest a listing" Ash hand-off are the current stand-ins

### Mobile issues
- `OppDetail` is a fixed `width:340 flexShrink:0` left-bordered side panel (line 1747) — won't fit beside the grid on phones (no scrim/overlay fallback)
- Card grid `minmax(320px,1fr)` (line 2383) — a single 320px card barely fits typical phone widths
- `MonthCalendar` is a 7-column grid (`gridTemplateColumns:'repeat(7, 1fr)'`, lines 1621/1635) with absolutely-positioned multi-day bars + wrapping legend — very cramped on mobile
- Filter/search bar is a wide flex-wrap row with a fixed 190px search input (line 2335) and many pills
- SuggestListingModal uses native `<select>`/`<input type=date>` (lines 2142/2148) — UI-polish backlog

---

## Integrations — connection plumbing (shared services; managed from Settings)

| | |
|---|---|
| **Routes** | No dedicated route — connection UI lives at `/settings?section=integrations` (`app/(app)/settings/page.tsx`); Presence is the primary data consumer |

### Main components
- `components/integrations/ProviderIcon.tsx` — provider logo/icon component (used by `app/(app)/settings/page.tsx`)
- `app/(app)/settings/page.tsx` — Integrations section: connects channels, calls `/api/integrations/website/connect`
- `ConnectIntegrationModal` (in `PresenceClient.tsx` line 63) — the newsletter/API-key connect modal

### API routes
- `POST /api/integrations/connect` (validate API key per provider, insert integrations row); `DELETE /api/integrations/connect` (remove by provider)
- `GET /api/integrations/connect-status`
- `GET/DELETE /api/integrations/[id]`
- `POST/DELETE /api/integrations/website/connect` (register a tracked site, returns embed `site_token`)
- `GET/POST /api/integrations/ga4/properties`, `GET /api/integrations/ga4/stats`
- `GET /api/integrations/instagram/stats`
- `GET /api/integrations/newsletter/stats`
- `POST /api/integrations/beehiiv/connect`, `mailchimp/connect` (provider-specific connect helpers)
- Note: `calendar/*`, `plaid/*`, `teller/*`, `google/*`, `microsoft/*`, `mailchimp` under `app/api/integrations` belong to Calendar/Finance/Network clusters, not Presence

### Tables
`integrations` (central: id, user_id, provider, account_name, account_id, metadata jsonb, connected_at, last_synced_at) · `website_sites` (user_id, url, display_name, platform, site_token — first-party analytics registration; de-duped by user_id+url)

### Key patterns
- Per-provider validation in `/connect`: each branch calls the provider API (Plausible aggregate, Beehiiv publications, etc.) before persisting (`connect/route.ts` lines 25-60+)
- `website_sites` supports multiple sites per user and returns an embeddable `site_token` (first-party tracking alternative to GA4)
- Auth-gated routes all do `supabase.auth.getUser()` then RLS-scoped writes; `opportunities/status` uses `createAdminClient` (service role) to write shared curated rows

### Cross-module links
- `integrations` table is shared across Presence (instagram/google_analytics/newsletter), Calendar (google-calendar/apple-icloud/microsoft), and Finance (plaid/teller) — provider string namespaces them
- `website_sites` is the first-party analytics source feeding the Website tab as an alternative to GA4

### Known TODOs / mocked
- Legacy `plausible` provider branch persists in `/connect` (lines 25-48) even though the Website tab now uses GA4 OAuth (provider `google_analytics`)
- `website_sites` embed/script-tag tracking pipeline (ingestion of first-party events) — connect route only registers the site + token; the receiving analytics endpoint is the open piece

### Mobile issues
- Connection management UI is inside Settings (`app/(app)/settings/page.tsx`) — responsiveness owned by the Settings cluster, not audited here
- `ProviderIcon` is a small fixed-size icon, no layout concern

---

## Projects

| | |
|---|---|
| **Routes** | `/projects` (`app/(app)/projects/page.tsx` — server component; deep-link query params consumed client-side: `?new=1`, `?projectId=X&tab=…&taskId=…&noteId=…`). No public routes. |

### Main components
- `app/(app)/projects/page.tsx` — server component; one query: `supabase.from('projects').select('*, tasks(*)').order('created_at' desc)`; passes `initialProjects` to client
- `components/projects/ProjectsClient.tsx` — top-level client; wraps board in `<ProjectOptionsProvider>`. Inner `ProjectsBoard` holds projects state, `groupBy` (status/type/priority), filter, drag-and-drop, modals, deep-link consumption
- `components/projects/ProjectCard.tsx` — card UI; timeline bar, task progress, type-specific props (client vs object), due badge; reads `useProjectOptions().resolve` for status/type/priority colors
- `components/projects/ProjectDetailPanel.tsx` — 2156-line scrim/detail panel with 5 workspace tabs (Canvas/Tasks/Contacts/Notes/Files), left rail of project properties + Ash module, finance cross-module fetch, settings/delete. Inline sub-components: CanvasEditor, ProjectTasksTab, NotesTab, FilesTab, ContactsTab, CustomSelect, DatePillField, EditableField/Title/Description, InlineNoteEditor, TaskDatePicker, TaskPriorityPicker
- `components/projects/NewProjectModal.tsx` — centered modal (maxWidth 520); type/status/priority Selects, dates, type-specific fields; inserts into `projects` then `onCreated`
- `components/projects/OptionsMenu.tsx` — 340px dropdown to rename/recolour/reorder/add/delete status/type/priority options; HTML5 drag reorder; delete gated by in-use count; persists to `profiles.project_options`
- `lib/projects/options.tsx` — `ProjectOptionsContext`: fetches `profiles.project_options` once per page mount, exposes options/resolve/setDimension; `DEFAULT_PROJECT_OPTIONS` + `OPTION_PALETTE` + `slugifyOptionKey`
- `components/tour/projects/ProjectsIntroModal.tsx` + `ProjectsTooltipTour.tsx` — onboarding

### API routes
- None. All reads/writes go through the supabase browser client (`lib/supabase/client`) directly; no `app/api/*` route is called by this module.
- Ash interactions go through `AshPromptsModule` / `RichEditor` (`submitInlineAsh`) which hit Ash endpoints, but not project-specific API routes.

### Tables
`projects` (read/write: status, type, priority, title, description, start_date, due_date, listing_price/dimensions/materials/weight, client_name/rate/billed_hours/est_value, canvas_html, updated_at) · `tasks` (read via projects join + per-project fetch; insert/update/toggle in ProjectTasksTab) · `notes` (read by project_id; insert/update/delete in NotesTab + InlineNoteEditor; also created from canvas selection "convert to note") · `project_files` (read/insert/delete in FilesTab) + storage bucket `project-files` · `project_contacts` (join; read/upsert/delete in ContactsTab, `onConflict project_id,contact_id`) · `contacts` (read all for attach; insert new from ContactsTab `createAndAttach`) · `profiles.project_options` (jsonb — read/write via options context + OptionsMenu) · `time_entries` + `invoices` + `invoice_line_items` (read-only, Finance cross-module summary in the detail panel) · `editor_images` storage bucket (Canvas + notes paste/drop image uploads)

### Key patterns
- Server-component fetches initial data → client holds state (`initialProjects`). Mutations are optimistic local-state updates then fire-and-forget supabase writes (`handleDragEnd`, `handleUpdate`, options `setDimension`)
- Scrim/detail-panel pattern: `ProjectDetailPanel` is fixed-position with a blurred scrim; Maximize toggles between scrim (inset with 32px gaps) and full-bleed (left flush to sidebar). The recurring "Scrim Card Pattern" from memory
- Kanban-ish board with `@hello-pangea/dnd`: horizontally-scrolling card rows grouped by a switchable dimension; drag-to-update only writes when grouped by Status (type/priority columns read-only)
- Context provider (`ProjectOptionsProvider`) shares one fetch of user-customisable status/type/priority across board, cards, modal, panel
- Custom window events for cross-view sync: dispatches `projects:created`, `projects:modal-opened`, `projects:detail-opened`, `set-project-context`, `clear-project-context`; listens for `ash:turn-complete` to refetch tasks/notes after an Ash turn
- Debounced autosave in CanvasEditor and InlineNoteEditor (800ms / 500ms) with a ref-tracked latest HTML flushed on unmount to avoid blanking canvas on tab toggle
- Deep-link consumption then `router.replace` to strip query params

### Cross-module links
- `tasks.project_id` FK — tasks belong to projects; ProjectTasksTab and the Tasks module both read/write the same rows
- `notes.project_id` FK — "Open in Notes" links to `/notes?id=…`
- `project_contacts` join to `contacts` (Network); ContactsTab can create a new contact
- **Finance**: detail panel reads `time_entries` + `invoices(line_items)` by `project_id`, links out to `/finance` ("View in Finance →" via `window.location.href` — a full reload, not next/link)
- **Ash**: broadcasts `set-project-context` so the assistant has project context; `AshPromptsModule` passes project title/status/priority

### Known TODOs / mocked
- `ProjectsClient.tsx:197` comment calls the topbar options entry "Currently a placeholder surface", but `OptionsMenu` is in fact wired and functional — the comment is stale
- `profiles.project_options` `cut`/`on_hold` legacy keys handled as a muted visual state (`ProjectCard` `isMuted`) rather than a clean migration
- No API layer / RLS-only writes — everything is direct client supabase calls; no server validation of project mutations
- AGENTS.md warns "This is NOT the Next.js you know" — confirm conventions before edits

### Mobile issues
- `ProjectDetailPanel.tsx:1919-1920` — left rail fixed `width: 252`. Panel right area is `flex:1`, so on a phone the rail consumes most of the screen
- `ProjectDetailPanel.tsx:1909-1910` — panel `left = calc(var(--sidebar-width,52px)+32px)`, `right = 32px`; assumes a desktop app sidebar + comfortable gutters
- `ProjectsClient.tsx:355-359` — project cards hard-coded `flex '0 0 280px'`, width 280, height 216 in non-wrapping horizontal scroll rows (row container height 220 at :336) — rows overflow horizontally per status group on mobile
- `ProjectsClient.tsx:383` — ghost "new project" tile fixed 200px width
- `NewProjectModal.tsx:171, 187, 219, 229, 242` — multi-column grids `1fr 1fr 1fr` / `1fr 1fr` with no responsive breakpoint (modal maxWidth 520, page padding 16)
- `OptionsMenu.tsx:61` — dropdown fixed width 340; CanvasEditor content maxWidth 760 with 60px horizontal padding (`ProjectDetailPanel.tsx:551`) assumes a wide canvas
- DatePillField / TaskDatePicker dropdowns use fixed widths (232 / 220 / 222px) and right-anchored positioning that can clip off-screen on small viewports

---

## Tasks

| | |
|---|---|
| **Routes** | `/tasks` (`app/(app)/tasks/page.tsx` — server component; deep-link `?taskId=…` scrolls + tints a row, used by Ash "View task →"). No public routes. |

### Main components
- `app/(app)/tasks/page.tsx` — server component; `Promise.all` of 3 queries: active tasks, last 20 completed, project id/title list. `TASK_SELECT` joins project, contact, target(+pipeline). Note: opportunities column kept in DB but no longer joined
- `components/tasks/TasksClient.tsx` — 1433-line client; sidebar filters (all/overdue/today/upcoming/no_date/completed + per-project/person/target), sort controls, sectioned "All" view with lingering-then-fade completion animation, CSV export. Holds tasks/completed/lingering/projCompleted state
- `components/tasks/TasksOptionsMenu.tsx` — 3-dot dropdown (260px): "show completed inline" toggle + "Export visible tasks" CSV
- Inline sub-components inside TasksClient: InlineDatePicker, InlineLinkPicker (Projects/People/Targets tabs), PriorityPicker, QuickAdd, SectionHeader, TaskRow, SidebarItem
- `components/tour/tasks/TasksIntroModal.tsx` + `TasksTooltipTour.tsx` — onboarding

### API routes
- None task-specific. All CRUD via supabase browser client directly.
- Related but separate (not called from Tasks UI): `app/api/notes/suggest-tasks/route.ts`, `app/api/notes/ash-inline/route.ts`

### Tables
`tasks` (primary; read/insert/update/delete — completed, due_date, priority, project_id, contact_id, target_id, title, notes). `opportunity_id` column still exists but is intentionally not read/written · `projects` (read id/title for filter sidebar + link picker) · `contacts` (read id/first_name/last_name in InlineLinkPicker, archived=false) · `outreach_targets` (read id/name/pipeline_id + pipeline join) · `outreach_pipelines` (read name/color via join, for target chip color)

### Key patterns
- Server-component fetches initial data → client holds state; mutations optimistic then supabase write (`handleToggle`/`handleUpdate`/`handleDelete`/QuickAdd)
- Sidebar-rail + main-list layout (not a scrim): left rail 196px filters, right pane sectioned task list
- Derived sidebar groups: People/Targets are NOT separately fetched — derived by walking the tasks list and grouping by joined contact/target metadata, ordered by task count
- Optimistic "lingering" completion animation: on complete, task is removed from active and held in a "lingering" ghost list for 650ms before settling into completed
- Filter encoded as a tagged string union: `'all' | 'overdue' | … | `project:${id}` | `person:${id}` | `target:${id}``; QuickAdd pre-fills the link matching the active filter
- Custom window event `tasks:created` dispatched on add; listens for `?taskId` deep-link to scroll+highlight
- Client-side CSV export of the currently-visible view (`exportVisibleCsv`)
- `handleUpdate` splits joined-display fields (project/contact/target) from DB fields before writing

### Cross-module links
- `tasks.project_id` → `projects` (shared with Projects module's ProjectTasksTab — same rows, two surfaces)
- `tasks.contact_id` → `contacts` (Network)
- `tasks.target_id` → `outreach_targets` (Outreach); target pill in TaskRow deep-links via `router.push('/outreach?targetId=…')`
- Ash creates tasks via tools; Tasks page relies on the `?taskId` deep-link from Ash "Created task → View task" to surface them
- Opportunities link retired: `tasks.opportunity_id` no longer surfaced (page.tsx:8, TasksClient.tsx:238 comments)

### Known TODOs / mocked
- `app/(app)/tasks/page.tsx:8` + `TasksClient.tsx:238` — Opportunities/`opportunity_id` deliberately dropped from the read path and link picker but the column still lingers in the DB (dead column to clean up)
- No API/server-validation layer; all writes are direct client supabase calls
- Global completed list capped at 20 (page.tsx:15); older completed tasks aren't loaded except per-project on demand via `fetchProjCompleted`

### Mobile issues
- `TasksClient.tsx:1219-1223` — sidebar fixed `width: 196`, `flexShrink:0`, always rendered beside the main list; eats ~half the width with no collapse/drawer
- `TasksClient.tsx:1216` — body is a flex row (sidebar + main) with overflow hidden; no responsive stacking
- `TaskRow` (`TasksClient.tsx:677-831`) packs checkbox + title + target pill + link picker + date + priority in a single non-wrapping row with fixed maxWidths (target pill maxWidth 160 at :761, link picker maxWidth 180 at :339) — overflows/truncates heavily on narrow screens
- InlineLinkPicker dropdown fixed width 300 (`:356`); InlineDatePicker dropdown width 220 (`:165) — left/right anchored, can clip off-screen
- `TasksOptionsMenu.tsx:45` — dropdown fixed width 260, right-anchored to the topbar 3-dot
- View header sort controls (`TasksClient.tsx:1269-1329`) are a horizontal row of pill buttons (Date/Priority/Created + direction + project-completed) that crowd a narrow header

---

## Notes

| | |
|---|---|
| **Routes** | `/notes` (`app/(app)/notes/page.tsx` — server component; reads `?id=` deep link) · `/share/[token]` (`app/share/[token]/page.tsx` — PUBLIC read-only shared-note view, anon Supabase client gated by RLS on `share_token`; full standalone HTML doc with its own fonts/prose CSS) |

### Main components
- `components/notes/NotesClient.tsx` — 1733 lines; the entire module: 3-pane layout, NoteEditor (Tiptap), InlineLinkPicker, FormatToolbar, SuggestTasksModal, FilterItem, NoteItem, FolderCard, NoteFolderMenu
- `components/notes/ImportNoteModal.tsx` — client-side .txt/.pdf/.docx parsing → note; `pdfjs-dist` + `mammoth` lazy-loaded; embedded images uploaded via `lib/uploads/editor-image.ts` to `editor_images` bucket
- `components/notes/NotesOptionsMenu.tsx` — three-dot menu: pinned-only toggle + Import
- `components/ui/RichEditor.tsx` — shared: `getRichExtensions`, InlineAshPopover, `submitInlineAsh`, `insertEditorImageFromFile`, ToggleBlock node, Space-to-trigger-Ash
- `components/tour/notes/{NotesIntroModal,NotesTooltipTour,NoteAnimations}.tsx`

### API routes
- `POST /api/notes/suggest-tasks` (Claude Haiku `claude-haiku-4-5`: note title+content → JSON array of task titles; consumed by FormatToolbar "Generate tasks")
- `POST /api/notes/ash-inline` (Claude Sonnet `claude-sonnet-4-6` agentic loop, up to 4 turns; `ANTHROPIC_TOOLS` + `web_search_20250305`; ACTION vs CONTENT mode; returns prose-to-insert OR an action result with `viewHref`/`viewLabel` deep link). Surface type `note` carries note_id + linked contact_id/project_id for auto-linking
- `POST /api/ash` (SSE) — not Notes-specific but invoked by Resources' AshInlineChat

### Tables
`notes` (id, title, content (HTML), project_id, contact_id, opportunity_id, pinned, share_token, created_at, updated_at) — read/write · `note_folders` (id, user_id, name, position) — read/write · `note_folder_items` (folder_id, note_id, user_id) — read/write (join table) · `tasks` — write only (SuggestTasksModal inserts directly with project_id/due_date) · `projects`, `contacts`, `opportunities` — read only (link picker + sidebar grouping) · Storage bucket: `editor_images`

### Key patterns
- Server-component fetches initial data: page.tsx fans out 4 parallel Supabase reads (notes w/ joined project/contact/opportunity, projects, note_folders, note_folder_items) and passes as `initial*` props; NotesClient owns all state thereafter
- Optimistic updates everywhere: `handleNoteUpdate` / `togglePin` / folder CRUD mutate React state immediately, fire-and-forget Supabase writes (no await-then-refetch)
- Debounced autosave: `NoteEditor.scheduleSave` fires 800ms after edits, writes `notes.update`, then bubbles via `onUpdate`; shows Saving…/Saved status
- Inline-Ash surface pattern: Space at line start opens InlineAshPopover → `submitInlineAsh` → `/api/notes/ash-inline` with `surface={type:'note', note_id, project_id, contact_id}`; result is prose inserted into doc OR an action with a "View →" deep link
- Custom window events for cross-view sync: dispatches `notes:create-clicked` and CustomEvent `notes:created` (consumed by NotesTooltipTour); ImportNoteModal re-fires `notes:created`
- Deep-link consume pattern: NotesClient reads `?new=1` / `?import=1` / `?noteId=X` (and page reads `?id=X`) on mount then `router.replace('/notes')` to strip the param
- Master-detail (rail + editor) rather than scrim/detail-panel: 250px left rail (search + filters + note list + folders) and a `flex-1` editor pane
- Filter-as-string-union: `FilterId = 'all'|'pinned'|'project:<id>'|'contact:<id>'|'opportunity:<id>'|'folder:<id>'`; sidebar groups derived from notes via `useMemo` counts
- Export/share: client-side `htmlToMarkdown` + `downloadFile`; share link mints a `crypto.randomUUID()` `share_token` written to the note, revocable

### Cross-module links
- FKs on `notes`: `project_id`→projects, `contact_id`→contacts, `opportunity_id`→opportunities (set via InlineLinkPicker; drive the sidebar filter groups)
- Inbound nav to `/notes?id=<id>`: `ProjectDetailPanel.tsx:1081`, `ContactDetailPanel.tsx:654`, `OrganizationDetailPanel.tsx:616`, Home `NotesCard.tsx`, Home page.tsx:154 (`/notes?new=1`)
- Outbound from inline Ash: action results deep-link to `/tasks`, `/projects`, `/network`, `/finance`, or back to `/notes?noteId=X` (`VIEW_FOR_TOOL` map in `ash-inline/route.ts`)
- SuggestTasksModal writes rows into the Tasks module (`tasks` table), optionally linked to the note's `project_id`
- Ash global tools: `lib/ash/tools/write.ts` `create_note` + `read.ts` `search_notes` let Ash create/read notes from anywhere
- Images uploaded inside notes live in the `editor_images` bucket; notes themselves are NOT indexed by the Resources cross-module file index

### Known TODOs / mocked
- No real TODO/FIXME markers in Notes code — module is mature
- ImportNoteModal PDF import is explicitly a "v1 trade-off": images appended after each page's text rather than positioned inline via transform matrix (comments lines 13-16, 112-116)
- Legacy `.doc` files unsupported — surfaces a clear error telling user to save as .docx/.txt (line 309-312)
- Image-only/scanned PDFs produce "couldn't pull any text" (no OCR)
- `suggest-tasks` and `ash-inline` silently swallow parse failures (return empty array / catch blocks)

### Mobile issues
- Hard-coded 250px left rail: `NotesClient.tsx:1510` (`width:250, flexShrink:0`) — eats most of the viewport, leaves the editor a sliver; no breakpoint to collapse it
- Three-pane flex row with no wrap/stack: `NotesClient.tsx:1506` (body flex) + `:1648` editor — no `@media`/`matchMedia` anywhere in the module
- Editor content max-width 720 with 64px horizontal padding: `NotesClient.tsx:694` — 128px of padding is unworkable under ~400px wide
- Topbar at 52px packs Delete + Pin + Share + options + Import + New note inline (`NotesClient.tsx:1335+`) with no overflow handling
- Folders rendered as a fixed 2-column grid (`gridTemplateColumns:'1fr 1fr'`) in a 250px rail: `NotesClient.tsx:1629` — cards very cramped
- Dropdowns use absolute positioning with fixed widths (InlineLinkPicker width:300 at :234, share popover width:220 at :1414) that can overflow a small viewport
- SuggestTasksModal fixed width:460 (`NotesClient.tsx:482`) — exceeds small-phone width (no max-width:100vw)

---

## Resources

| | |
|---|---|
| **Routes** | `/resources` (`app/(app)/resources/page.tsx` — server component; reads `?cat=` deep link e.g. `?cat=press`) |

### Main components
- `components/resources/ResourcesClient.tsx` — 2145 lines; entire module: CategoryNav rail, AllFilesView, LinksView, LinkedFilesView, FilePreviewCard, ResourceCardItem, CardPreview, ActionBtn, CategoryUploadBar, SetupModal, AddLinkModal, FolderMenu, OnboardingBanner, HealthPip
- `components/resources/AshInlineChat.tsx` — in-modal Ash SSE chat used inside SetupModal; streams from `POST /api/ash`; "Insert into <field>" drops a reply into a structured field
- `lib/resources/linked-files.ts` — `LinkedFile` type, `LINKED_FILE_GROUPS`, `deepLinkForLinkedFile` (cross-module file index shape)
- `lib/resources/onboarding-hydrate.ts` — `hydrateResourcesFromProfile` (server-side fills empty structured fields from profile; labels MUST match MODALS prompt labels)
- `lib/uploads/editor-image.ts` — shared upload helper, reused
- `components/tour/resources/{ResourcesIntroModal,ResourcesTooltipTour,ResourcesAnimations}.tsx`

### API routes
- `POST /api/ash` (SSE) — consumed by AshInlineChat with `module:'resources'` for guided field-drafting; sends `{message, conversationId, module}`
- No dedicated `app/api/resources/*` routes — all reads/writes go straight through the Supabase JS client (client-side) or the server component

### Tables
`resources` (id, user_id, name, meta, category, status, fields jsonb, file_urls array, preview_data, preview_type, position, created_at, updated_at) — read/write/delete/insert · `resource_links` (id, user_id, name, url) · `resource_folders` (id, user_id, name, position) · `resource_folder_items` (folder_id, item_key, resource_id, user_id; item_key scheme `res:<id>` or linked-file id; resource_id only set for Resources rows) · `profiles` — read only (onboarding hydration + "continue your brand" banner + studio logo) · READ-ONLY cross-module file index (server-aggregated into `LinkedFile[]`): `contact_files`, `organization_files`, `project_files`, `invoice_attachments`, `invoices`, `expenses` (receipt_url), `bank_transactions` (receipt_url) · Storage bucket: `resources`

### Key patterns
- Server-component fetches initial data: page.tsx fans out 12 parallel Supabase reads, flattens 7 source tables into a single `LinkedFile[]` (uniform shape so client is source-agnostic), runs server-side onboarding hydration, then hands everything to ResourcesClient as `initial*` props
- Cross-module file INDEXING (not duplication): files owned by other modules are surfaced read-only in "Linked from elsewhere" groups; editing requires jumping to the source via `deepLinkForLinkedFile()`
- Health/completeness model: each seeded pillar (operations/brand/press/design) has structured "cards" with status empty/partial/complete; HealthPip + health bar compute filled/total; "Fill in →" opens the first empty card's SetupModal
- Structured-fields modal (SetupModal): edits `resources.fields` jsonb; can upload a file (→ resources bucket + file_urls) OR fill prompt fields; embeds AshInlineChat to draft fields conversationally
- Optimistic updates: folder CRUD, resource delete, link add, uploads all mutate state then fire Supabase writes
- Drag-and-drop upload: drop zone with `dragDepth` counter; drops route to active folder/category (`ResourcesClient.tsx:1970-1988`)
- localStorage-persisted UI config: linked-group visibility (`perennial:resources-linked-visibility`) and onboarding-banner dismissal (`perennial:resources-onboarding-banner-dismissed`)
- Deep-link consume: `initialCat` from `?cat=` (validated against `DEEP_LINK_CATS`) sets the active rail category
- `CatId` string-union rail selection incl. virtual `linked-*` ids per file source; `entityFilter` drills into one entity's files
- Folders hold ANY file via `item_key` (Resources rows AND cross-module linked files), unified through the `fileByKey` map

### Cross-module links
- Pulls files FROM: Network (`contact_files`/`organization_files`), Projects (`project_files`), Finance (`invoice_attachments`, `invoices`, expense/bank_transaction receipts), Settings (profile logo) — aggregated server-side into `LinkedFile[]`
- `deepLinkForLinkedFile` sends user OUT to: `/network?contactId=…&tab=files`, `/network?organizationId=…&tab=files`, `/projects?projectId=…&tab=files`, `/finance?tab=invoices&invoice=…`, `/finance?tab=banking`, `/settings`
- Inbound nav: `components/presence/PressTab.tsx:201` → `/resources?cat=press` ("Assemble your kit in Resources")
- `profiles` drives onboarding hydration (`lib/resources/onboarding-hydrate.ts`) — prompt labels are coupled to MODALS labels in ResourcesClient (must stay in sync)
- Shares `lib/uploads/editor-image.ts` with Notes (but Resources uploads structured/library files to the `resources` bucket, not `editor_images`)

### Known TODOs / mocked
- `onboarding-hydrate.ts:42` — `patch['Who is it for?'] = p.bio; // best-effort placeholder` (bio is a rough stand-in, not a real audience field)
- From MEMORY (Resources audit deferred): alias click-through, "+ New resource" affordance, file delete/replace for linked files, Ash structured-field writing tool
- Linked files are strictly read-only in Resources by design (no in-place delete/replace) — documented in `linked-files.ts` header
- No `app/api/resources` routes — heavy reliance on client-side Supabase calls; no server validation layer
- `previewData`/`previewType` loosely typed (`Record<string, any>` with eslint-disable)

### Mobile issues
- Hard-coded 204px left rail: `ResourcesClient.tsx:937` (`width:204, flexShrink:0, borderRight`) — no collapse breakpoint; leaves little for the content grid on phones
- Top-level layout is a non-wrapping flex row: `ResourcesClient.tsx:1913` (`flex h-full overflow-hidden`) rail + content — no `@media`/`matchMedia` in the module
- Card grids use minmax with sizeable minimums: `minmax(330px,1fr)` for pillar cards (`:2069`) — a 330px min card barely fits a phone and competes with the 204px rail; file grids `minmax(180px,1fr)` at :1393/:1489/:2000
- Topbar fixed at `height:52` with title + view toggle + Add link inline (`:1932`) — tight on narrow screens
- SetupModal / AddLinkModal are fixed-position centered overlays with embedded AshInlineChat (maxHeight 280, minHeight 110) — sizing tuned for desktop
- Drag-and-drop upload overlay (`position:absolute inset:12`) is a desktop interaction; touch devices can't drag-drop files
- New-folder inline input `width:170` (`:1428`) inside a 204px rail — cramped

---

## Home / Dashboard

| | |
|---|---|
| **Routes** | `/` (`app/(app)/page.tsx`) · `app/(app)/layout.tsx` (wraps all authed app routes) |

### Main components
- `app/(app)/page.tsx` — async server component, fetches all card data in one `Promise.all` and forces `/onboarding` redirect if `profiles.onboarding_complete` is false
- `app/(app)/layout.tsx` — flex shell: Sidebar + MobileNav + MobileDesktopNotice + `<main>` + AshContainer + TourTracker + TourCallout
- `components/home/WelcomeBanner.tsx` — post-onboarding banner gated on localStorage `perennial-just-onboarded`; reads `profiles.studio_name/perennial_goals/primary_challenges`
- `components/home/NotesCard.tsx` (only writable card — uses `getRichExtensions` editor)
- `components/home/TasksCard.tsx` (HomeTask type, client-held state, quick-add)
- `components/home/CalendarCard.tsx` (CalendarItem from projects+tasks due dates)
- `components/home/FinanceCard.tsx`
- `components/home/ProjectsCard.tsx`
- `components/home/ContactsCard.tsx`
- `components/layout/Topbar.tsx` — shared header; greeting mode shows time-of-day greeting + date
- `components/finance/QuickTimerButton.tsx` (in Topbar actions)

### API routes
- None directly from the page; cards link out via Link navigation. QuickTimerButton hits finance timer APIs

### Tables
`profiles` (onboarding_complete gate) · `notes` · `tasks` · `invoices` + `invoice_line_items` · `time_entries` · `expenses` · `projects` · `contacts` + `organizations` · `active_timers`

### Key patterns
- Server-component fetches initial data: page.tsx runs ~10 parallel Supabase queries server-side, passes plain data into client cards which then own interaction state
- Each card is a read-only live snapshot of another module ("no data lives here") except NotesCard/TasksCard which allow capture
- `data-tour-step` anchors (`dashboard.capture`, `dashboard.snapshots`) consumed by DashboardTour spotlight

### Cross-module links
- Topbar quick actions deep-link with query params: `/notes?new=1`, `/projects?new=1`
- Card "View all" links: `/finance`, `/projects`, `/network` (+ `/network?new=1`, `/network?import=1`), `/calendar`, `/tasks`, `/notes`, `/presence`
- CalendarItem aggregates `projects.due_date` + `tasks.due_date` — implicit FK join in page query
- Finance card derives billable amount via `time_entries.project.rate` join

### Known TODOs / mocked
- Account → "Photo upload coming in a future update" (profile photo not implemented; settings page)
- All notification toggles beyond send + payment-confirmation are UI-only per memory (need a cron)

### Mobile issues
- `page.tsx:176` outer container is `overflow-y-auto md:overflow-hidden` — relies on md+ for the fixed-height 2-row grid; on mobile it scrolls but the auto-fit grid `minmax(280px,1fr)` (page.tsx:187,196) forces single-column stacking (acceptable, but desktop-first by design)
- Topbar action buttons (Quick note / New project / QuickTimer) sit in a non-wrapping flex row and can crowd on narrow widths

---

## Settings

| | |
|---|---|
| **Routes** | `/settings` (`app/(app)/settings/page.tsx`) |

### Main components
- `app/(app)/settings/page.tsx` — single 2756-line client component holding ALL settings logic
- `SettingsPage` (main) — left nav + 6 sections: account, studio, preferences, notifications, billing, integrations
- Sub-components in same file: ProviderCard, SyncNowButton, ImportContactsButton, BrowseDriveButton + DrivePickerModal, ConnectFormModal, OAuthResultToast, DisconnectButton, WebsiteSection + AddWebsiteModal + SnippetModal, StudioLogoField, AutoThemeToggle, BrandColorField
- `components/integrations/ProviderIcon.tsx`
- `lib/uploads/studio-logo.ts` (logo upload helper)
- `lib/profile/business.ts` (COUNTRIES, BUSINESS_TYPES, composeStudioAddress)
- `lib/theme.ts` (isAutoTheme/setAutoTheme — auto dark mode, localStorage not profile)
- `components/ui/Toggle.tsx`

### API routes
- `/api/integrations/google/sync`, `/api/integrations/microsoft/sync` (Sync now)
- `/api/integrations/google/contacts/import`, `/api/integrations/microsoft/contacts/import`
- `/api/integrations/google/drive/files`, `/api/integrations/google/drive/link` (DrivePickerModal)
- `/api/integrations/{mailchimp,beehiiv,apple-icloud}/connect` (ConnectFormModal)
- `/api/integrations/[id]` DELETE (DisconnectButton)
- `/api/integrations/website/connect` (POST/DELETE) + `/api/track/script/[token]` (snippet)
- OAuth start routes: `/api/auth/google`, `/api/auth/microsoft`, `/api/auth/instagram`, `/api/auth/google-analytics`, `/api/auth/stripe`
- Password reset via `supabase.auth.resetPasswordForEmail` (client-side, no API route)

### Tables
`profiles` (read all columns; upsert on Save — display_name, studio_name, tagline, location, website, practice_types, currency, fiscal_year, date_format, week_start, hourly_rate, invoice_prefix, payment_terms, structured address+business_type+country+ein+phone, logo_url/logo_path, brand_color, notif_* flags, tour_dismissed/tour_visited) · `integrations` (read; status active/error/needs_reauth/disconnected) · `website_sites` (WebsiteSection CRUD: url, platform, site_token, status pending/active/disconnected, first/last_event_at)

### Key patterns
- Client-component loads its own data on mount (`supabase.auth.getUser` + parallel profiles/integrations fetch), no server component prefetch
- Tab state seeded from `?section=` query (OAuth callbacks redirect to `/settings?section=integrations`); `?openModal=X` auto-opens a connect modal (used by onboarding Mailchimp/Beehiiv tiles); `?provider=&connected=/&error=` drives OAuthResultToast then strips params via `history.replaceState`
- Single batched Save (SaveBar) upserts the whole profile — EXCEPT logo upload (StudioLogoField) and brand changes which commit immediately
- Custom window event `profile-updated` dispatched on save so Sidebar live-updates studio_name
- Modal pattern: `fixed inset-0` z-index 200 backdrop overlays for ConnectFormModal/DrivePickerModal/AddWebsiteModal/SnippetModal
- Integrations grouped by provider into one ProviderCard (collapses multiple Google accounts); disconnected rows filtered from Connected list but kept in DB for historical `contact_activities` FK

### Cross-module links
- Studio identity (logo/brand_color/address/ein) feeds invoice PDF + public `/i/[token]` payment view + Stripe Connect prefill
- Drive picker links files into the Resources module (category brand/operations/press/design)
- Import contacts writes into Network/People; Sync now writes `contact_activities`
- Website snippet feeds Presence traffic stats
- Auto-theme + light/dark toggle shared with Sidebar via `perennial-theme-changed` event
- "Restart welcome tour" resets `profiles.tour_visited/tour_dismissed` and routes to `/` so DashboardTour re-fires; fires `tour-visited` event

### Known TODOs / mocked
- Two-factor auth: "Coming in a future update" badge "Soon" (settings page ~789)
- Delete account: only shows alert to email support@perennial.design — not implemented (~820)
- TikTok integration tile marked `soon:true` "Coming soon" (~1404,1444)
- In-app push notifications: "coming in a future update" (~1239)
- Notification toggles persist but most are not wired to a cron (per memory: only send + payment-confirmation emails fire)
- Email change: "Contact support to change" — no self-serve flow

### Mobile issues
- `settings/page.tsx:697` — left nav is hardcoded `width: 200` with `flex flex-1 overflow-hidden` parent — two fixed columns side-by-side, cramped/break on mobile; no responsive collapse
- Content column capped at `maxWidth 560` with 32px/40px padding (line 718) — fine but the nav rail steals 200px
- Several `grid-cols-2` / `2fr-1fr-1fr` address grids (e.g. 965) don't collapse to single column on narrow screens
- Fixed-width inner blocks: BrandColorField hex input width 140 (250), Drive picker category select width 150 (2402)
- Modals use maxWidth 440-560; DrivePickerModal `maxHeight 82vh` assumes desktop

---

## Onboarding

| | |
|---|---|
| **Routes** | `/onboarding` (`app/onboarding/page.tsx` — outside the `(app)` group, no sidebar) · auth-gated: redirects to `/login` if no user, to `/` if `onboarding_complete` |

### Main components
- `app/onboarding/page.tsx` — server component: auth check + `onboarding_complete` redirect, renders OnboardingClient
- `app/onboarding/OnboardingClient.tsx` — client wizard, 9 steps (`TOTAL_STEPS=9`); modal max-width 680px
- Steps: 1 Welcome, 2 About you (First + Last name, composed into `display_name`; no schema change), 3 Studio identity + billing + practice types + **logo upload + brand color picker** (uploads via `uploadStudioLogo` → `studio-logos` bucket; saves to `profiles.logo_url/logo_path/brand_color`), 4 How you work (make options now include "Graphic design", "Websites", "Software" with `key/color/icon` mappings → `profiles.project_options.type`), 5 How you sell + price, 6 Where you are + challenges/issues (cap 3, with "That's 3 — remove one" feedback UI and `OtherInput` `disabled` prop), 7 Goals, 8 Resource upload (FileDropzone), 9 Integration connect (IntegrationConnectStep; multi-account providers show "+ Add another" when one is already connected)
- Helpers in-file: Chip, SingleChip, OtherInput, StepProgress, SelectInput, StepFooter, FileDropzone, IntegrationConnectStep, StudioBrandStep (logo + color sub-component)
- `lib/profile/business.ts` (shared composeStudioAddress/BUSINESS_TYPES/COUNTRIES)
- `lib/uploads/studio-logo.ts` (reused from Settings for the Step 3 logo upload)
- `components/ui/AshMark.tsx`

### API routes
- `/api/integrations/connect-status` (IntegrationConnectStep checks which providers connected)
- OAuth start routes with `?next=/onboarding?step=9`: `/api/auth/google` (uses `prompt=select_account` so a different Google account can be chosen; supports multi-account), `/api/auth/microsoft`, `/api/auth/instagram`, `/api/auth/google-analytics` (threads `next` via OAuth `state` so callback returns to onboarding instead of `/presence`)
- No dedicated save API — writes directly via supabase client

### Tables
`profiles` (upsert on finish/skip: display_name [composed from firstName + lastName], studio_name, tagline, bio, location, website, phone, ein, billingPatch structured address, practice_types, work_types, selling_channels, price_range, years_in_practice, primary_challenges, business_issues, urgent_needs, perennial_goals, logo_url, logo_path, brand_color, onboarding_complete=true, project_options jsonb merge [includes new make-option keys: graphic_design/websites/software], tour_visited={}, tour_dismissed=false) · `resources` (handleFinish inserts one row per staged file) · Supabase Storage `resources` bucket (file uploads namespaced `${userId}/...`) · Supabase Storage `studio-logos` bucket (Step 3 logo upload)

### Key patterns
- Step state mirrored to `?step=` query (`history.replaceState`) so OAuth round-trips return to the right step
- Two save paths share `billingPatch()`: `handleFinish` (full) + `handleSkip` (partial) so neither drops billing data
- `buildProjectTypeOptions` maps practice picks → `profiles.project_options.type`, merged with existing jsonb so Projects board defaults match the user's craft
- On finish sets localStorage `perennial-just-onboarded`=1 (consumed by WelcomeBanner) and resets tour state so DashboardTour fires
- OAuth providers redirect back here; API-key providers (Mailchimp/Beehiiv) redirect to `/settings?openModal=X` to reuse the settings connect form rather than duplicate UI

### Cross-module links
- Seeds Projects board types (`profiles.project_options`)
- Uploads land in the Resources module (`resources` table + storage)
- Billing identity shared with Settings/Invoices/Stripe via `composeStudioAddress`
- `practice_types`/goals/challenges later surfaced to Ash (system prompt context) and WelcomeBanner `CHALLENGE_MODULES` deep-links
- IntegrationConnectStep mirrors Settings integrations; Finance tile links to `/finance` for Teller

### Known TODOs / mocked
- Partial upload failure is swallowed (onboarding continues) — surfaced as `uploadError` only
- "Skip for now" fully bypasses with minimal profile write

### Mobile issues
- Wizard centered at maxWidth 560 (good) but step 3 uses several CSS-grid `1fr 1fr` and `2fr 1fr 1fr` (lines 750,792,806,811,914,937) that don't collapse on small screens
- Botanical accent images width 620/460 absolutely positioned (578,634) — overflow hidden so mostly safe
- panelStyle padding 36px/40px (1429) is generous for phones

---

## Admin / Curate

| | |
|---|---|
| **Routes** | `/admin` (`app/(app)/admin/page.tsx` — thin server wrapper rendering AdminClient; admin-only via `ADMIN_USER_IDS`) · `/admin/users` (`app/(app)/admin/users/page.tsx` — user list + "View as" impersonation, gated to `ADMIN_USER_IDS`) |

### Main components
- `app/(app)/admin/page.tsx` (renders `<AdminClient/>`)
- `components/admin/AdminClient.tsx` — two tabs: Listings (opportunities feed) + Suggestions (pending `opportunity_suggestions`)
- `EditModal` (add/edit opportunity), `Field` helper
- `app/(app)/admin/users/page.tsx` — server: auth-gated to `ADMIN_USER_IDS`; lists all `auth.users` accounts + "View as" per row; renders `AdminUsersTable`
- `components/admin/AdminUsersTable.tsx` — user list with impersonation link generation; calls `POST /api/admin/impersonate`
- `lib/admin/guard.ts` — `getAdminUser()`: verifies session + checks `ADMIN_USER_IDS` env var; throws 401/403 for unauthorized callers; used by all admin API routes
- `app/auth/confirm/route.ts` — public SSR handler for email OTP + impersonation magic links; sets `ph_impersonated=1` cookie on impersonation sessions to suppress PostHog (see `operations.md`)

### API routes
- `POST /api/admin/opportunities` — create/update listing, quick status changes
- `POST /api/admin/suggestions` — `{id, action: promote|dismiss}`
- `GET /api/admin/check` — returns `{ isAdmin }` via `getAdminUser()` (server-side `ADMIN_USER_IDS` allowlist; only the boolean reaches the client); used by Sidebar to gate admin-only links
- `POST /api/admin/impersonate` — admin-gated (service-role); mints a one-time magic-link `token_hash` for the target user; returns a `/auth/confirm` link safe to open in an incognito window (does NOT clobber the admin's session); every generation is logged with both user IDs

### Tables
`opportunities` (read all + upsert via API; status published/draft/archived; category fair/openCall/award/grant/residency/festival) · `opportunity_suggestions` (read pending; promote→opportunities, dismiss)

### Key patterns
- Client-loads-own-data on mount (parallel opportunities + pending suggestions fetch)
- Optimistic update on suggestion action (filters out of list before API resolves)
- Quick inline status toggles (publish/unpublish/archive) via `saveOpp`
- Standard modal pattern (`fixed inset-0 z-50` backdrop, maxWidth md)
- Admin gating: `lib/admin/guard.ts` `getAdminUser()` checks the `ADMIN_USER_IDS` env var on every admin API route and the `/admin/users` page; the Sidebar client receives only the boolean `isAdmin` from `GET /api/admin/check`
- Impersonation: `/api/admin/impersonate` uses service-role `supabase.auth.admin.generateLink` to mint a one-time magic link; invitee-side `/auth/confirm` handles the OTP exchange and sets `ph_impersonated=1` cookie to suppress PostHog analytics for the impersonated session

### Cross-module links
- Published opportunities feed the Presence module's opportunities surface and Ash's `get_opportunities` tool
- Monitoring cron/ingest endpoint writes `opportunity_suggestions` (needs `CRON_SECRET` in Vercel — see `operations.md`)
- Uses `Opportunity` type from `types/database`
- PostHog impersonation suppression: `app/auth/confirm` → `ph_impersonated` cookie → `PostHogProvider` + `PostHogAuth` opt-out (see `operations.md`)

### Known TODOs / mocked
- Admin-role check is now real (`ADMIN_USER_IDS` env var via `lib/admin/guard.ts`); no longer "any signed-in user" — but still a server-side allowlist, not a DB-level `profiles.role` column
- Opportunities monitoring cron needs `CRON_SECRET` in Vercel (see `operations.md`)

### Mobile issues
- Listing/suggestion rows are flex rows with multiple action icon buttons + status chips that crowd on narrow widths (no wrap)
- EditModal uses several `flex gap-3` two-up field rows that don't stack on mobile
- Native `<select>`/`<input type=date>` with `appearance:auto` (off-design per memory's UI polish backlog)

---

## Ash (AI assistant)

| | |
|---|---|
| **Routes** | No own route — globally mounted via `app/(app)/layout.tsx` as a fixed floating FAB + panel on every authed page |

### Main components
- `components/ash/AshContainer.tsx` — floating FAB, open/expanded/convKey state, listens for window events to open with context
- `components/ash/AshPanel.tsx` — chat panel: streaming, history dropdown, suggestions, markdown render (`react-markdown` + `remark-gfm`), tool-running indicator
- `components/ui/AshMark.tsx`, `components/layout/AshIcon.tsx`
- `app/api/ash/route.ts` — Anthropic SDK streaming agentic loop (nodejs runtime, maxDuration 60), prompt caching on static system prompt + server-side web_search
- `lib/ash/context.ts` (`buildAshContext`), `lib/ash/system-prompt.ts`, `lib/ash/tools/{index,read,write,types}.ts`

### API routes
- `/api/ash` (POST — SSE-style stream: `{text}`, `{tool}`, `{done, conversationId}`)

### Tables
`ash_conversations` (insert new conv, list recent 10 for history, module column) · `ash_messages` (insert user msg, load history limit 24/50, role+content) · Ash READ tools query: `projects`, `tasks`, `contacts`, `contact_activities`, `notes`, `invoices`, `expenses`, `time_entries`, `outreach_pipelines`, `outreach_targets`, `opportunities` · Ash WRITE tools mutate: `projects`, `tasks`, `contacts`, `organizations`, `notes`, `time_entries`, `contact_activities` · `context.ts` reads: `profiles`, `projects`, `tasks`, `contacts`, `notes`, `invoices`, `time_entries`

### Key patterns
- Custom window events for cross-view sync: `open-ash` (with optional message + project context), `set-project-context`/`clear-project-context`, and Ash dispatches `ash:turn-complete` on finish so other views (project panel, tasks) refetch
- `convKey` remount trick: incrementing key forces AshPanel to reset state + auto-send an injected message (used by DashboardTour final step sending "I just finished onboarding.")
- Streaming fetch + ReadableStream reader parsing `data: ` lines; agentic tool loop server-side
- Per-module suggestions + module label from pathname (`getModule`); project-specific suggestions override generic when `projectContext` set
- sessionStorage `perennial-tour-waiting-ash` coordinates with TourCallout — closing Ash fires `tour-ash-closed`
- System prompt uses Anthropic prompt caching (`cache_control` ephemeral) + appended dynamic context

### Cross-module links
- Reads/writes across nearly every module's tables via tools (projects/tasks/contacts/notes/finance/outreach/opportunities)
- Context personalized from `profiles` onboarding data (practice_types, goals, challenges, bio)
- Tightly coupled to the onboarding→DashboardTour→Ash hand-off flow
- Uses Anthropic server-side web_search tool for external facts

### Known TODOs / mocked
- Input "+" attach-context button: title "Attach context (coming soon)" — not implemented (AshPanel ~654)

### Mobile issues
- AshPanel hardcoded dimensions: `W=360` floating / `680` expanded, `H=480` / `calc(100vh-80px)` (`AshPanel.tsx:108-109`) — the 360-wide panel at `bottom:20 right:20` overflows/crowds small phones; expanded 680 exceeds mobile viewport
- History dropdown fixed width 260 (AshPanel ~374)
- FAB fixed bottom/right 24 — fine

---

## Layout / Navigation chrome

| | |
|---|---|
| **Routes** | `app/(app)/layout.tsx` wraps all authed routes · Renders: Sidebar (desktop), MobileNav (mobile), MobileDesktopNotice, AshContainer, TourTracker, TourCallout |

### Main components
- `components/layout/Sidebar.tsx` — desktop rail (`hidden md:flex`), collapsible 200px/52px, nav groups, theme toggle, app menu, profile menu; fetches `isAdmin` from `GET /api/admin/check` on mount — Design system / View as / Curate links in the bottom-left are shown **only for admins**; non-admins see Settings only
- `components/layout/MobileNav.tsx` — mobile top bar + slide-in drawer (`md:hidden`), full nav + Settings + Logout
- `components/layout/MobileDesktopNotice.tsx` — dismissible "best on desktop" banner (localStorage, useSyncExternalStore)
- `components/layout/Topbar.tsx` — per-page header (title/greeting/actions)
- `components/layout/SidebarTimerBadge.tsx` (running timer), `components/layout/ComingSoonOverlay.tsx`, `components/layout/DesignSystemLink.tsx`, `components/ui/Menu.tsx`
- `lib/theme.ts` (BaseTheme, paintCurrentTheme, setBaseTheme, isAutoTheme)

### API routes
- `GET /api/admin/check` — fetched by Sidebar on mount to gate admin-only bottom-rail links; logout via `supabase.auth.signOut()`

### Tables
`profiles` (Sidebar + MobileNav read studio_name + display_name for the profile footer/header)

### Key patterns
- Sidebar sets CSS var `--sidebar-width` (200px/52px) on document root so fixed overlays/scrim panels lay out relative to it
- Custom event `profile-updated` from Settings updates sidebar studio_name live; `perennial-theme-changed` syncs theme across Sidebar + Settings; auto-theme re-evaluated on 60s interval + window focus
- Collapsed-mode hover tooltips rendered via fixed-position portal outside `overflow:hidden` aside
- Click-outside handlers for app menu + profile menu
- `data-tour-key` on nav links consumed by TourCallout anchor positioning
- Mobile drawer locks body scroll, closes on route change

### Cross-module links
- Nav to every module: `/`, `/projects`, `/network`, `/outreach`, `/notes`, `/tasks`, `/calendar`, `/finance`, `/presence`, `/resources`, plus `/settings`, `/design`, `/docs`, `/admin`
- Hosts AshContainer + tour components — the integration point for cross-module Ash + tour events
- Profile menu "Edit profile" → `/settings`

### Known TODOs / mocked
- `APP_MENU` items — "Documentation" is now enabled at `/docs`; "What's new", "Keyboard shortcuts", "Refer a friend" still badge "Soon"/disabled
- Profile menu "Switch workspace" badge "Soon"/disabled
- NavItem supports a `soon` flag but none currently set

### Mobile issues
- Sidebar is desktop-only (`hidden md:flex`) — MobileNav is the entire mobile chrome; this is the intended split
- MobileNav drawer width 280 maxWidth 85vw (good responsive handling)
- Desktop-first posture acknowledged by MobileDesktopNotice banner ("best on desktop, mobile support coming soon")
- `--sidebar-width` var is set even on mobile where the sidebar is hidden — fixed overlays elsewhere may mis-offset on mobile if they read it

---

## Tour / Onboarding walkthrough

| | |
|---|---|
| **Routes** | No own route — DashboardTour mounted in home page; TourTracker + TourCallout mounted in app layout; per-module intro modals + tooltip tours under `components/tour/<module>/` |

### Main components
- `components/tour/DashboardTour.tsx` — 4-step spotlight walkthrough on first home visit; final step hands off to Ash
- `components/tour/TourTracker.tsx` — marks `profiles.tour_visited[module]` on first navigation (skips home/projects/contacts/notes which self-mark)
- `components/tour/TourCallout.tsx` — floating sidebar callout, fires ONLY for projects (single hand-off)
- `components/tour/GettingStartedWidget.tsx` — sidebar progress widget (done/total, up-next link)
- `lib/tour.ts` (TOUR_MODULES, nextUnvisited, progress, TourVisited)
- Per-module sets: `components/tour/{tasks,calendar,projects,contacts,resources,presence,notes,finance,outreach}/{IntroModal,TooltipTour,Animations}.tsx`

### API routes
- None — all state in `profiles` via supabase client

### Tables
`profiles` (tour_visited jsonb map, tour_dismissed boolean, onboarding_complete)

### Key patterns
- Custom window events orchestrate everything: `tour-visited` (with new visited map), `tour-dismissed`, `tour-waiting-ash`/`tour-ash-closed`, `open-ash`
- sessionStorage `TOUR_WAITING_KEY` (`perennial-tour-waiting-ash`) suppresses sidebar callout while user is in the post-onboarding Ash conversation
- DashboardTour spotlight: box-shadow cutout ring around `[data-tour-step]` anchors, repositions on 500ms interval + resize; reads computed border-radius for ring shape
- Module intro modals fire their own TooltipTour via a session event; they mark themselves visited on complete/skip (so TourTracker deliberately skips home/projects/contacts/notes)
- Hand-off chain: onboarding finish → DashboardTour (home) → final step opens Ash → close Ash → TourCallout points at Projects → other modules tracked passively by GettingStartedWidget "Up next"

### Cross-module links
- Deeply coupled to Ash (`open-ash` event, waiting-ash session flag) and Sidebar (`data-tour-key` anchors, GettingStartedWidget rendered inside Sidebar)
- Reset path: Settings → Preferences "Restart welcome tour" clears `tour_visited`/`tour_dismissed`
- Tour modules list (`lib/tour.ts`) maps to all 10 module routes

### Known TODOs / mocked
- GettingStartedWidget special-cases home-not-done by deferring to the on-screen DashboardTour

### Mobile issues
- DashboardTour callout fixed width `W=320`, positioned via `getBoundingClientRect` with clamp — clamps horizontally so mostly mobile-safe, but anchors to desktop `[data-tour-step]` grid sections
- TourCallout width 250 anchored to the sidebar nav item (`data-tour-key`) which is hidden on mobile (sidebar is `md:flex`) — callout would have no anchor on mobile and not render
- GettingStartedWidget lives inside the desktop Sidebar only → no mobile equivalent
