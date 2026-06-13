# Perennial — Module Architecture Reference

A module-by-module reference for the Perennial app, intended for making app-wide changes. Every entry lists concrete file paths, routes, API routes, tables, key patterns, cross-module links, known TODOs/mocked areas, and mobile issues.

> Read `AGENTS.md` before writing code — "This is NOT the Next.js you know." Rich-text image uploads (paste/drop/picker) flow through `lib/uploads/editor-image.ts` to the `editor_images` bucket on any surface using `getRichExtensions`.

## App-wide conventions

These recur across nearly every module; the per-module sections only note deviations.

| Convention | Where it lives | Notes |
| --- | --- | --- |
| Server component fetches initial data → client holds state | every `app/(app)/<module>/page.tsx` → `*Client.tsx` | `page.tsx` does a `Promise.all` of Supabase reads and passes `initial*` props |
| Direct Supabase browser client writes (no API layer) | most modules (`lib/supabase/client`) | Optimistic local-state update then fire-and-forget write; RLS-only validation |
| Scrim / detail-panel pattern | Network, Outreach, Projects, Presence-Opportunities | Fixed-position overlay offset by `--sidebar-width` (`calc(56px + 32px)` left); blurred scrim; maximize/minimize. See MEMORY "Scrim Card Pattern" |
| Custom window events for cross-view sync | all modules | e.g. `open-ash`, `<module>:created`, `set-project-context`, `calendar:refresh-events` |
| Deep-link consume-then-strip | most modules | Read `?param` on mount, then `router.replace('/<module>')` |
| `--sidebar-width` CSS var | `components/layout/Sidebar.tsx` | Set on `document` root (200px/52px); fixed overlays offset from it. Still set on mobile where sidebar is hidden — a mobile mis-offset risk |
| Native `<select>`/`<input type=date/time>` | many modules | Flagged in MEMORY UI-polish backlog as off-design-system; deferred |
| Desktop-first posture | whole app | `components/layout/MobileDesktopNotice.tsx` banner; fixed-width rails/grids throughout |

Shared cross-cutting tables: `profiles` (identity, brand, options, onboarding), `integrations` (provider-namespaced connections), `tasks`, `contacts`/`organizations`, `projects`.

---

## Calendar

Week/month grid with events, tasks, an opportunity feed, and an embedded scheduling overlay.

| | |
| --- | --- |
| **Routes** | `/calendar` (`app/(app)/calendar/page.tsx`, server) |
| **Tables** | `tasks`, `projects`, `contacts`, `opportunities`, `profiles` (`practice_types`, `default_calendar_id`, conferencing), `integrations` (`google_calendar` legacy, `google`, `microsoft`), `user_calendars` |

**Main components**
- `app/(app)/calendar/page.tsx` — server fetch + collapses integration rows into google/outlook connection summaries
- `components/calendar/CalendarClient.tsx` — 3942-line client; ALL view state, continuous-pan week & month grids, drag-create, task drag-reschedule, opportunity feed, scheduling overlay
- `components/calendar/EventCard.tsx` — unified create + view/edit card; POST/PATCH/DELETE to events API; `LocationInput` autocomplete
- `components/calendar/CalendarSourcesPanel.tsx` — left-rail calendar list (visibility, color, set-default, disconnect/reconnect/refresh)
- `components/calendar/CalendarOptionsMenu.tsx`, `CalendarSettingsModal.tsx` (tabs are "Coming soon" stubs), `QuickTaskCard.tsx`, `TaskQuickEditPopover.tsx`
- `components/tour/calendar/{CalendarIntroModal,CalendarTooltipTour}.tsx`
- Write path: `lib/calendar/write-event.ts` (`createEvent`)

**API routes**

| Route | Purpose |
| --- | --- |
| `GET/POST /api/integrations/calendar/events` | List merged events; POST creates via `createEvent` |
| `PATCH/DELETE /api/integrations/calendar/events/[encodedId]` | `encodedId` = URL-encoded `${provider}:${externalId}` |
| `GET/POST/PATCH/DELETE /api/integrations/calendar/calendars` | Per-user calendar list (visibility, color, `set_default`→`profiles.default_calendar_id`, soft-delete) |
| `POST /api/integrations/calendar/refresh` | Manual refresh → `syncUserCalendarList` |
| `GET /api/geocode/search` | Nominatim location autocomplete |
| — | Task CRUD goes direct via `supabase.from('tasks')`; connect/reconnect redirect to `/api/auth/google` and `/api/auth/microsoft` |

**Key patterns**
- Custom events: `calendar:refresh-events`, `calendar:event-created`, `calendar:row-changed`, `calendar:default-changed`, `scheduling:refresh` (+ tour-only events)
- Detail panels anchor to the clicked chip's DOMRect (`position:fixed`, viewport-clamped — not a scrim)
- Continuous-pan virtualization: `buildPanDays` (week), `buildPanWeeks` (month)
- Provider abstraction: events API merges `google_calendar`/`google`/`microsoft` into one `CalendarEvent`; `${provider}:${id}` scheme lets one route hit either provider
- Server-side color resolution joins `user_calendars.color` onto events; self-healing sync (`needsBackfill`, `syncUserCalendarList`)
- localStorage: opportunity visibility (`perennial:cal-opp-visibility`)

**Cross-module links**
- **Tasks**: reads/writes shared `tasks` table directly (reminders merged into tasks); drag-to-reschedule writes `due_date`
- **Projects**: tasks link via `project_id`; project due dates render as chips
- **Network**: tasks link via `contact_id` (ContactPicker)
- **Presence/Opportunities**: `opportunities` surface in the all-day "Perennial feed", filtered by `profiles.practice_types`
- **Settings → Integrations**: shares `integrations` + `user_calendars`; `profiles.default_calendar_id` is the cross-cutting default
- **Scheduling**: `SchedulingPanel` + `SchedulingComposePanel` embed into CalendarClient's left rail

**Known TODOs / mocked**
- `CalendarSettingsModal` — all tabs "Coming soon" (account mgmt, conferencing, working hours, notifications, shortcuts not persisted)
- `EventCard` calendar selector read-only in edit mode (can't move events between calendars)
- Opportunity category `award` / `HIDDEN_FEED_CATEGORIES` hidden pending deadline UX
- `write-event.ts` recurrence limited to simple FREQ; BYDAY/COUNT/UNTIL deferred
- `reminder_minutes` sent to provider but no in-app reminder system

**Mobile issues**
- `CalendarClient.tsx:2098-2103` — `flex h-full` + fixed 216px left rail, no responsive collapse
- Time grid `PX_PER_HOUR=64`, `DAY_MIN_PX=96` (line 44) — 7-col week needs ~672px+, horizontal-scrolls below that (`overflow-x-auto` ~2643)
- `EventCard` (`PANEL_W=340`), overlays (W=280/260 ~3629/3754) are fixed-width viewport-positioned panels — no mobile sheet
- `EventCard.tsx` uses native date/time/`select` inputs
- Grid relies on mouse drag (mousedown/move/up) — no touch handlers

---

## Scheduling (booking links — owner side)

No standalone route; surfaced inside `/calendar` via the left-rail panel and grid compose overlay.

| | |
| --- | --- |
| **Routes** | None (embedded in `/calendar`) |
| **Tables** | `scheduling_links`, `scheduling_bookings` (read for counts), `profiles` (`default_calendar_id`, `conferencing.zoom_url`), `user_calendars`, `integrations` |

**Main components**
- `components/scheduling/SchedulingPanel.tsx` — left-rail link list; `+ One-off`/`+ Recurring`; listens for `scheduling:refresh`
- `components/scheduling/SchedulingComposePanel.tsx` — replaces rail during compose; drag availability windows onto the week grid
- `components/scheduling/SchedulingLinkModal.tsx` — full-scrim modal alternative editor (`inset-0 z-[200]`)
- `components/scheduling/ManageConferencingModal.tsx` — Zoom URL + Meet/Teams status
- `lib/scheduling/{slug.ts (mintSlug),availability.ts (computeOpenSlots),busy.ts (fetchBusy)}`

**API routes**

| Route | Purpose |
| --- | --- |
| `GET/POST /api/scheduling/links` | List (+ booking_count) / create (mints slug, defaults `target_calendar_id`, DEFAULT_WEEKLY Mon–Fri 9–5) |
| `PATCH/DELETE /api/scheduling/links/[id]` | Update/delete; owner-gated by RLS + `.eq('user_id')` |
| `GET/PATCH /api/scheduling/conferencing` | Meet/Teams derived from integrations; Zoom stored in `profiles.conferencing` |
| `GET /api/integrations/calendar/calendars` | Target/conflict calendar pickers |

**Key patterns**
- Embedded-overlay: compose mode hijacks Calendar's left rail and repurposes grid drag from event-create to availability-paint
- `scheduling:refresh` re-fetches; one_off links store absolute `{start,end}`, recurring store `weekly_hours` by weekday

**Cross-module links**
- **Calendar**: physically lives in Calendar UI; availability draws as hatched bars on the week grid
- **Settings/Integrations**: Meet/Teams from connected google/microsoft; conflict-avoidance reads busy times
- **profiles**: `default_calendar_id`, `conferencing.zoom_url` shared

**Known TODOs / mocked**
- `SchedulingLinkModal` and `SchedulingComposePanel` are two parallel editors — potential consolidation
- Conferencing limited to auto Meet/Teams + static Zoom link

**Mobile issues**
- `SchedulingComposePanel.tsx` designed for the 216px rail + grid drag — unusable on touch/narrow
- `SchedulingLinkModal.tsx:174` fixed `inset-0`, desktop form layout; `ManageConferencingModal.tsx:40` inherits desktop input sizing
- Mouse-only grid drag, no touch support

---

## Public Booking page (invitee side)

| | |
| --- | --- |
| **Routes** | `/book/[slug]` (`app/book/[slug]/page.tsx`, public, service-role, allowlisted in `proxy.ts`, outside `(app)`) |
| **Tables** | `scheduling_links` (by slug via service-role), `scheduling_bookings`, `profiles` (organizer branding), `user_calendars` + `integrations` |

**Main components**
- `app/book/[slug]/page.tsx` — `loadPublicLink`, `generateMetadata`, trims to `PublicLinkView`
- `components/scheduling/BookingClient.tsx` — month picker + slot list + invitee form
- `lib/scheduling/public-link.ts` (`loadPublicLink`, `linkClosedReason`), `create-booking-event.ts` (service-role event creation, separate from session-based `write-event.ts`), `notify.ts` (Resend emails from `bookings@`), `availability.ts` + `busy.ts`

**API routes**

| Route | Purpose |
| --- | --- |
| `GET /api/book/[slug]/slots` | Public open-slots (`computeOpenSlots`, absolute UTC) |
| `POST /api/book/[slug]` | Re-validates slot live, `createBookingEvent`, inserts booking, closes single_use, `sendBookingEmails` |

**Key patterns**
- Service-role public path (no session; unguessable slug is the auth); double-validation (slots compute for display, POST recomputes → 409 if taken)
- Absolute-UTC slots + client-side tz formatting; provider event create hard-fails to invitee (502), email best-effort; `single_use` flips `active=false`

**Cross-module links**: consumes owner-side `scheduling_links`/`scheduling_bookings`; writes a real event onto the organizer's `user_calendar`; `profiles` branding drives accent + email; shares Resend setup.

**Known TODOs / mocked**: confirmation emails best-effort (no retry/queue); single target calendar (no round-robin/multi-host).

**Mobile issues**: `BookingClient.tsx:212` `md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr_300px]` IS responsive (stacks on mobile) — the best-adapted surface in the cluster; fixed widths only apply at `md+`.

---

## Finance (shell + Overview + Time)

| | |
| --- | --- |
| **Routes** | `/finance`, `/finance?tab=overview\|time\|invoices\|banking`, `/finance?invoice=<id>` (deep-link) |
| **Tables** | `time_entries`, `active_timers`, `expenses`, `invoices` (+`invoice_line_items`,`invoice_attachments`), `projects`, `profiles` (`invoice_prefix`), `integrations` (`stripe`) |

**Main components**
- `app/(app)/finance/page.tsx` — server fetch → collapses Stripe integration to `stripeStatus`
- `components/finance/FinanceClient.tsx` — ALL finance state (timeEntries/invoices/expenses/activeTimer); 52px topbar tab strip; timer tick; modal mounting
- `components/finance/OverviewTab.tsx`, `OverviewCharts.tsx`, `TimeTab.tsx`, `LogTimeModal.tsx`, `AddExpenseModal.tsx`, `QuickTimerButton.tsx`

**API routes**: None for time/overview — timer & entries write direct via Supabase (`active_timers` upsert/delete, `time_entries` insert/delete in FinanceClient).

**Key patterns**
- Custom events: `finance:set-tab` (remaps legacy `expenses`→`banking`), `perennial:timer-started`/`-stopped`
- Tab strip is local state, not Next routing
- Stripe gating: `openNewInvoice()` funnels every "New invoice" entry; routes to the gate if `!stripeStatus.connected`
- Modals reused for create+edit by passing a pre-loaded row

**Cross-module links**: `projects` (FK `project_id`, `project.rate` flows to earnings/line rates); `contacts`/`organizations` (`client_contact_id`/`client_organization_id`); Settings/Integrations (Stripe `/api/auth/stripe`); tour module.

**Known TODOs / mocked**
- `FinanceClient.tsx:89` — 3-dots "Finance options" menu placeholder
- `ExpensesTab.tsx` retained only because `NewInvoiceModal` pulls expense rows (dead-ish)
- MEMORY deferred: `invoice_prefix`, expense-line-item pull

**Mobile issues**
- `FinanceClient.tsx:216` — 52px topbar, non-wrapping tab strip + actions, overflows
- `OverviewTab.tsx:146` `grid-cols-4` KPI cards (no breakpoint); `:211` main+side flex with hardcoded 272px side; `:206` charts row
- `TimeTab.tsx:229` non-wrapping filter bar; `:265` 7-day bar chart

---

## Invoices

| | |
| --- | --- |
| **Routes** | `/finance?tab=invoices`, `&invoice=<id>` (preselect), `/invoice/[id]/print` (`?preview=1` for embed) |
| **Tables** | `invoices` (states draft/saved/sent/paid/voided, `public_token`, `stripe_payment_intent_id`, etc.), `invoice_line_items`, `invoice_attachments`, `contacts`/`organizations`, `projects`, `profiles`, `integrations` |

**Main components**
- `components/finance/InvoicesTab.tsx` — 2059 lines; 296px list + scrim detail pane; inline line-item editing, status transitions, "Pull more" time/expense picker, attachments, `SendInvoiceModal` with live iframe email preview
- `components/finance/NewInvoiceModal.tsx` — single-column `max-w-xl`
- `components/finance/InvoiceStripeGate.tsx` — full-pane connect gate
- `app/invoice/[id]/print/page.tsx` + `PrintTrigger.tsx` (auto `window.print`)
- `lib/invoices/{format,email-template,token,notify}.ts`

**API routes**

| Route | Purpose |
| --- | --- |
| `POST /api/finance/invoices` | Create invoice + line items in one round trip (rolls back on line failure; auto-attaches receipts) |
| `POST /api/finance/send-invoice` | Mints `public_token`, renders via `buildInvoiceEmailHtml`, Resend, flips →sent |
| `POST /api/finance/invoices/[id]/mark-paid` | paid + `paid_at`, `sendInvoicePaidEmails` |
| `POST /api/finance/invoices/[id]/public-link` | Ensures `public_token`, returns `/i/<token>` |
| — | Most edits (line items, status≠paid, client/project/dates, attachments, delete) go DIRECT via Supabase |

**Key patterns**
- Scrim/detail: 296px list + flex-1 detail; `INVOICE_SELECT` re-fetched after every write
- Editable-by-status state machine (draft open; saved behind a pencil; sent/paid/voided read-only PDF)
- "mark paid" routed through API (for emails); other transitions direct
- sessionStorage banner-dismissal (`perennial:invoices:bannerDismissed`); live iframe `srcDoc` email preview; multi-select status filter (incl. derived "overdue")

**Cross-module links**: pulls billable `time_entries` + `expenses` into line items (tracks `invoicedTimeIds`/`invoicedExpenseIds`); clients are Network contacts/orgs (writes edits back); Banking auto-match marks paid (`onInvoiceMarkedPaid`); Stripe public page `/i/[token]`; Settings studio identity in email/print/public.

**Known TODOs / mocked**: `deleteInvoice` manually deletes line items first (cascade uncertainty); MEMORY deferred signed receipt URLs, prefix polish; UI-only notif toggles need a cron.

**Mobile issues**
- `InvoicesTab.tsx:804/807` two-pane (fixed 296px list + flex-1), no stacking
- `SendInvoiceModal :104-127` fixed `maxWidth:1160`/`92vh`; `md:flex-row` at :125 but 360px rail stays `shrink-0`
- `:1245/1254` 156px inline fields; `:1582` 340px / `:1952` 280px dropdowns
- print page `:139` 3-col parties grid tight on phone view; `NewInvoiceModal` is mobile-friendlier (single-column)

---

## Banking

Rocket-Money-style transaction triage; replaced the old Expenses tab.

| | |
| --- | --- |
| **Routes** | `/finance?tab=banking` |
| **Tables** | `bank_transactions` (amount, type, `details` jsonb, `is_personal`, `linked_expense_id`, `matched_invoice_id`, `manual_category`, etc.), `bank_accounts`, `expenses`, `invoices`, `profiles` (`custom_categories`), `integrations` (plaid/teller) |

**Main components**
- `components/finance/BankingTab.tsx` — 2626 lines; accounts strip, 5-up KPIs, auto-match banners, sticky filter/sort bar, paginated rows with inline `ExpandedRow`, bulk-select ribbon, Plaid/Teller SDK shims via `next/script`
- `components/finance/{ManualTransactionModal,AddExpenseModal,CustomizeCategoriesModal}.tsx`
- `components/finance/plaidCategoryDisplay.ts` (`CANONICAL_CATEGORIES`, `categoryFor`, …)
- `lib/finance/customCategories.ts`, `lib/uploads/receipt.ts`

**API routes**

| Route | Purpose |
| --- | --- |
| `GET /api/finance/banking/transactions` | Paginated/filterable list + KPIs + pill counts |
| `GET /api/finance/banking/queue` | `to_review`, `invoice_activity` ($1-tolerance matches), `outstanding_invoices` |
| `POST .../transactions/manual` | Manual tx |
| `POST .../[id]/{personal,match-invoice,unmatch,convert-to-expense}` | Status actions |
| `PATCH .../[id]/{category,name,note,receipt}` | Field edits |
| `/api/integrations/{plaid\|teller}/{link-token,enroll,accounts,transactions}` | Provider cluster; GET `/transactions` triggers sync |

**Key patterns**: server-fetch + request-id guard (`reqIdRef`); optimistic `patchLocal` with rollback; `needs_review` = NOT personal AND no linked_expense AND no matched_invoice; debounced search (300ms); inline `ExpandedRow` IS the log-expense workflow; two-click confirm ribbons + snackbar Undo; provider chosen by `NEXT_PUBLIC_BANK_PROVIDER`; `createPortal` overlays.

**Cross-module links**: convert-to-expense bubbles `onExpenseCreated` to FinanceClient (pullable into invoices); match-invoice flips invoice paid (`onInvoiceMarkedPaid`); queue reads invoices for tolerance matches; shares `lib/uploads/receipt` with Invoices.

**Known TODOs / mocked**: `:869`/`:1139` "+N more" match banner deferred; `deleteLinkedExpense` not transactional (orphan-link window); MEMORY: `manual_category` stores canonical key, sync must never seed it.

**Mobile issues**: `:1115` `grid-cols-5` KPIs won't fit; `:1062` accounts strip `overflow-x-auto` (168-208px cards); `:1202`/`:1222` sticky filter bar + 220px search, non-wrapping; wide table not designed to reflow.

---

## Public invoice payment (Stripe Connect)

| | |
| --- | --- |
| **Routes** | `/i/[token]` (`app/i/[token]/page.tsx`, public service-role; only sent/paid/voided shareable, draft/saved 404; `?preview=1` owner embed), `/api/auth/stripe`, `/api/auth/stripe/callback`, `/api/stripe/webhook`, `/api/finance/invoices/[id]/payment-intent` |
| **Tables** | `invoices` (token lookup, `stripe_payment_intent_id`, payment method fields), `invoice_line_items`, `integrations` (`provider=stripe`, `account_id`), `profiles` (currency, studio), `contacts`/`organizations` |

**Main components**
- `app/i/[token]/page.tsx` — invoice paper + aside (receipt / live form / void notice)
- `app/i/[token]/{PaymentSectionMount,PaymentSection}.tsx` (Stripe Elements / PaymentElement), `PrintButton.tsx`
- `app/api/stripe/webhook/route.ts` — verifies platform OR connect secret; `payment_intent.succeeded` → mark paid idempotently + card brand/last4 + `sendInvoicePaidEmails`
- `lib/stripe/server.ts`, `lib/integrations/{stripe,storage}.ts`, `lib/invoices/{notify,token}.ts`

**API routes**: `POST .../payment-intent` (re-verifies token, direct charge on connected account via `automatic_payment_methods` with explicit card/us_bank_account/link fallback); `GET /api/auth/stripe` + callback (Connect Standard OAuth); `POST /api/stripe/webhook`.

**Key patterns**: service-role token-auth reads (unguessable token is the auth); Connect Standard, direct charges, no platform fee (money to user's Stripe); idempotent webhook (no-op if paid, returns 500 to force retry on DB failure); PaymentIntent reuse for usable states; webhook + mark-paid both call `sendInvoicePaidEmails`; catch-all JSON error wrapper.

**Cross-module links**: payment flips `invoices` row → reflected in Finance Invoices tab; Settings → Integrations connects/manages Stripe; `InvoiceStripeGate` gates the whole tab; print page linked from public PDF button.

**Known TODOs / mocked**: MEMORY deferred Stripe-data surface, signed receipt URLs; fallback won't help if Card explicitly disabled (only covers "nothing enabled"); `payment_intent.payment_failed` doesn't mutate invoice state.

**Mobile issues**: `page.tsx:124` `.pi-grid` `minmax(0,1fr) 360px` HAS `@media(max-width:880px)` at :128 collapsing to 1 col — one of the few responsive surfaces; overall the most mobile-aware in the cluster.

---

## Network

| | |
| --- | --- |
| **Routes** | `/network` (`app/(app)/network/page.tsx`) |
| **Tables** | `contacts`, `organizations`, `contact_activities`, `contact_files`, `organization_activities`, `organization_files`, `notes`, `tasks`, `invoices` (read-only roll-up), `integrations` (import), `projects`/`project_contacts` |

**Main components**
- `app/(app)/network/page.tsx` — fetches contacts (+org join) + organizations
- `components/network/NetworkClient.tsx` — tri-view tab strip (contacts/leads/organizations), list state, filtering, sorting, bulk-archive, CSV export/import, deep-link consumption
- `components/network/ContactDetailPanel.tsx` — 1644-line scrim panel; tabs Canvas/Activity/Tasks/Notes/Files; Tiptap + inline Ash; convert-lead-to-contact (line 1170)
- `components/network/OrganizationDetailPanel.tsx` — org scrim; "People at this org" rail, invoice roll-up; fires `network:open-contact` + `outreach:open-target`
- `components/network/{NewContactModal,NewOrganizationModal,ImportContactsModal,NetworkOptionsMenu}.tsx`

**API routes**: `POST /api/integrations/google/contacts/import`, `POST /api/integrations/microsoft/contacts/import` (used by `ImportContactsModal`).

**Key patterns**: scrim panels (maximize/minimize); events `network:open-contact`, `contacts:created/modal-opened/detail-opened`, `set-/clear-organization-context`; deep-link params (`?view=`, `?new=1`, `?import=1`, `?contactId=&tab=&taskId=&noteId=`, `?organizationId=`) stripped via `router.replace('/network')`; `contacts` table shared by contacts+leads views via `is_lead`; `lead_stage` enum; fixed 7-col grid (`GRID` line 96).

**Cross-module links**: `contacts.organization_id`→`organizations`; **leads here ARE the Outreach `is_lead` contacts** (LeadsBoard); org panel reads invoices by `client_organization_id` → `/finance?tab=invoices`; Tasks tab joins projects; notes → `/notes?id=`; **Outreach `TargetDetailPanel` canvas writes to `contacts.canvas_html`/`organizations.canvas_html`** (shared workspace).

**Known TODOs / mocked**
- `NetworkOptionsMenu.tsx:109-126` — tag manager placeholder
- `OrganizationDetailPanel.tsx:1176` — TODO "Projects involving this org" not surfaced
- `ImportContactsModal.tsx:260` — sets `lead_stage:'identified'` but enum uses `'new'` (stale mismatch)
- `ContactFilesTab` uses public `contact-files` bucket `getPublicUrl` (no signed URLs)

**Mobile issues**: `NetworkClient.tsx:96` 7-col `GRID` won't collapse; `:445-446` 52px topbar all inline; `:565-567` 200px search; `:922` bulk bar fixed `bottom-7 left-1/2`; detail panels offset by `calc(56px+32px)` (no mobile breakpoint); native datetime inputs.

---

## Outreach

| | |
| --- | --- |
| **Routes** | `/outreach` (`app/(app)/outreach/page.tsx`) |
| **Tables** | `outreach_pipelines`, `pipeline_stages`, `outreach_targets`, `outreach_target_projects`, `contacts`, `organizations`, `contact_activities`, `projects`, `profiles` |

**Main components**
- `app/(app)/outreach/page.tsx` — `ensureSeedPipelines(user.id)` then fetches pipelines/targets/contacts
- `components/outreach/OutreachClient.tsx` — wrapped in `ProjectOptionsProvider`; left nav (Leads/Follow-ups/Pipelines/All Ether)
- `components/outreach/PipelineBoard.tsx` — 1411-line kanban via `@hello-pangea/dnd`; stage + outcome columns + "The Ether" parking lot; meta-stage aggregate columns
- `components/outreach/LeadsBoard.tsx`, `FollowUpsBoard.tsx` (>30 days untouched)
- `components/outreach/TargetDetailPanel.tsx` — 1162-line scrim; canvas of wrapped entity, stage picker, linked projects/people, promote-to-project, `OrphanTargetPrompt`; Tasks/Notes/Files are StubPanes
- `components/outreach/{NewPipelineModal,EditPipelineModal,NewTargetModal,OutreachOptionsMenu}.tsx`
- `lib/outreach/seed-pipelines.ts` — idempotent onboarding-driven seeding

**API routes**: None — direct Supabase browser client for all reads/writes.

**Key patterns**: dnd kanban with optimistic updates (`handleStageChange`, `handleEtherToggle`, `handleLeadStageChange`); events `outreach:open-target`, `outreach:project-linked`, `outreach:followup-logged`; The Ether droppable ids `__ether__`/`__meta__:` prefix; **target wraps a Contact OR Organization** (canvas lives on the wrapped entity); `ProjectOptionsProvider` shares project type/status options for promote.

**Cross-module links**: target FKs to `contacts`/`organizations`/`outreach_pipelines`/`pipeline_stages`; **Leads reuse Network `is_lead` contacts** (imports `NewContactModal`+`ContactDetailPanel` from `components/network/`); canvas shared with Network (`/network?contactId=` deep-link); promote creates `projects` + `outreach_target_projects` → `/projects?projectId=`; follow-up inserts `contact_activities`; seed reads `profiles` onboarding.

**Known TODOs / mocked**
- `TargetDetailPanel.tsx:628-645`, `1137-1140` — Tasks/Notes/People/Files are StubPanes (only Canvas real)
- `OutreachClient.tsx:62-66` — `showOutcomes`/`showClosed` UI-only (not persisted)
- `OutreachClient.tsx:670` — "Suggested" pill tied to seed templates duplicating `NewPipelineModal` options
- Toast is a local string hack ("no toast lib yet"); LinkedPeople supports only one `contact_id`

**Mobile issues**: `OutreachClient.tsx:425-426` 188px nav rail (no collapse); `PipelineBoard.tsx` 210px columns (440/862) in `overflowX:auto`; `LeadsBoard.tsx:225` 200/220px columns; `TargetDetailPanel.tsx:869-885` fixed offsets + 268px sidebar; `:992-999` native `<select>`; dnd kanban poor on touch.

---

## Presence

Multi-tab module (`PresenceClient.tsx` is one large client). All tabs share the desktop shell: 44px header tab bar, hard 4-col KPI grid, fixed 280px right rail. Connection management lives in Settings — Presence is the consumer.

| | |
| --- | --- |
| **Routes** | `/presence` (default `?tab=overview`); `?tab=website\|socials\|newsletter\|press\|opportunities`; deep links `?opportunityId=<id>`, `?tab=opportunities` |

### Overview
- `app/(app)/presence/page.tsx` — fetches `opportunities` + `profile.practice_types`
- `components/presence/PresenceClient.tsx` — `OverviewTab()` line 497; default export line 2459; `PresenceCharts.tsx` (Audience/Follower/Channels SVG)
- **API**: `GET /api/integrations/{instagram,ga4,newsletter}/stats`; reads `integrations` directly on mount (`:2517-2522`)
- **Tables**: `integrations`, `opportunities`, `profiles`
- **Patterns**: tab state via `history.replaceState` (`?tab=`); `open-ash` event for Ash hand-off; provider `google_analytics` aliased to local `plausible` (`:2541`, historical)
- **TODOs**: recent activity feed is a truthful empty state (deferred until publishers exist, `:570-588`); 3-dot menu placeholder (`:2480`)
- **Mobile**: 4-col KPI grid (`:517`); fixed 280px right rail (`:593`); horizontal tab row overflows

### Website (GA4)
- `WebsiteTab()` line 634; `lib/presence/detectHostingPlatform.ts`
- **API**: `GET/POST /api/integrations/ga4/properties`, `GET /api/integrations/ga4/stats`; OAuth `/api/auth/google-analytics` (+callback, `provider='google_analytics'`)
- **Tables**: `integrations` (`google_analytics`), `profiles.website`
- **Patterns**: OAuth `?step=select-property` → picker → stats; cached-then-refresh; `report_error` distinguishes "No traffic yet" vs "Couldn't load"
- **TODOs**: GA4 Data API may be disabled at Cloud project 525192339885 (MEMORY) — "No traffic yet" can mean Data API off; native `<select>` picker (`:834`)

### Socials (Instagram)
- `SocialsTab()` line 1075
- **API**: `GET /api/integrations/instagram/stats`; OAuth `/api/auth/instagram`
- **Tables**: `integrations` (`instagram`; metadata followers/engagement/recent_posts/followers_history)
- **Patterns**: staleness-gated refresh (>30 min); optimistic merge (`updateIntegration :2547`); quiet error chip; 30-day follower delta from history snapshots
- **TODOs**: TikTok/Pinterest/LinkedIn sub-tabs are `·soon` placeholders (`:1183-1185`); post queue/compose replaced with "Coming soon" (`:1382/1398`)
- **Mobile**: fixed 280px right rail (`:1026`)

### Newsletter (Beehiiv/Kit/Mailchimp/Substack)
- `NewsletterTab()` line 1424; `ConnectIntegrationModal()` line 63; `PROVIDER_META` line 56
- **API**: `GET /api/integrations/newsletter/stats`; `POST/DELETE /api/integrations/connect`
- **Tables**: `integrations` (provider in beehiiv|kit|mailchimp|substack)
- **Patterns**: resolves first connected of `[beehiiv,kit,mailchimp,substack]` (`:2542`); Substack is manual entry; provider validation server-side in `/connect`
- **TODOs**: per-send history / click-through / next-send drafter NOT wired (`:1519-1535`); legacy `plausible` branch in `/connect` (`:25`)
- **Mobile**: fixed 280px rail (`:1395`); `ConnectIntegrationModal` `maxWidth:420`

### Press
- `components/presence/PressTab.tsx` — `PressTab()` line 50; `LogCoverageModal()` line 275; `PlaybookCard()` line 236
- **API**: none — direct Supabase (`press_mentions` CRUD; `projects`+`contacts` for link dropdowns)
- **Tables**: `press_mentions` (`type`, `publication`, `stats` jsonb, `project_id`, `contact_id`), `projects`, `contacts`
- **Cross-module**: `press_mentions.project_id`→`projects`, `contact_id`→`contacts`; copy points to Outreach (`:81`); inbound `/resources?cat=press` (`:201`)
- **TODOs**: auto-pulling reach stats deferred (`:395`, manual entry); PR Playbook static

### Opportunities
- `OpportunitiesTab()` line 2178; `OppCard()` 1861, `OppDetail()` 1715, `MonthCalendar()` 1578, `SuggestListingModal()` 2082, `DisciplineFilter()` 2010; `lib/opportunities/disciplines.ts`
- **API**: `POST /api/opportunities/status` (service-role admin; curated rows are service_role-write-only); `opportunity_suggestions` insert direct
- **Tables**: `opportunities` (read; write `user_status` only via route), `opportunity_suggestions`, `profiles.practice_types`
- **Patterns**: scrim `OppDetail` (fixed 340px right, `:1747`); optimistic status/hide; deep-link `?opportunityId` scroll+highlight (used by Calendar bars); list vs lane-packed `MonthCalendar`
- **Cross-module**: Calendar links in (`CalendarClient.tsx:3086`, `:2254`); `user_status` is single shared/global column (single-tenant); Curate admin (`/admin`) + ingest populate the feed
- **TODOs**: `user_status` needs a per-user table for multi-user (`status/route.ts:8-10`); "Attach work samples" no `onClick` (`:1822`); manual submission deferred (`SuggestListingModal` is the stand-in)
- **Mobile**: `OppDetail` fixed 340px side panel (no overlay fallback); card grid `minmax(320px,1fr)` (`:2383`); `MonthCalendar` 7-col grid (`:1621/1635`); native `<select>`/date (`:2142/2148`)

---

## Integrations — connection plumbing (shared service)

No dedicated route — UI lives at `/settings?section=integrations`. Presence is the primary consumer.

| | |
| --- | --- |
| **Tables** | `integrations` (central: `id`, `user_id`, `provider`, `account_name`, `account_id`, `metadata` jsonb, `connected_at`, `last_synced_at`), `website_sites` (`url`, `display_name`, `platform`, `site_token`) |

**Main components**: `components/integrations/ProviderIcon.tsx`; `app/(app)/settings/page.tsx` (Integrations section); `ConnectIntegrationModal` (in `PresenceClient.tsx:63`).

**API routes**: `POST/DELETE /api/integrations/connect`; `GET /api/integrations/connect-status`; `GET/DELETE /api/integrations/[id]`; `POST/DELETE /api/integrations/website/connect`; `GET/POST /api/integrations/ga4/properties`, `GET .../ga4/stats`; `GET .../instagram/stats`; `GET .../newsletter/stats`; `POST .../beehiiv/connect`, `.../mailchimp/connect`.

> Note: `calendar/*`, `plaid/*`, `teller/*`, `google/*`, `microsoft/*` under `app/api/integrations` belong to Calendar/Finance/Network clusters, not Presence.

**Key patterns**: per-provider validation in `/connect` (calls provider API before persisting); `website_sites` supports multiple sites + embeddable `site_token`; `opportunities/status` uses `createAdminClient` (service role) for shared curated rows.

**Cross-module links**: `integrations` shared across Presence (instagram/google_analytics/newsletter), Calendar (google/microsoft), Finance (plaid/teller) — `provider` string namespaces them; `website_sites` is the first-party analytics source feeding the Website tab.

**Known TODOs / mocked**: legacy `plausible` branch persists in `/connect` (`:25-48`); `website_sites` event-ingestion endpoint is the open piece (connect only registers site + token).

---

## Projects

| | |
| --- | --- |
| **Routes** | `/projects` (`app/(app)/projects/page.tsx`); deep-link `?new=1`, `?projectId=X&tab=…&taskId=…&noteId=…` |
| **Tables** | `projects`, `tasks`, `notes`, `project_files` (+ `project-files` bucket), `project_contacts`, `contacts`, `profiles.project_options` (jsonb), `time_entries`+`invoices`+`invoice_line_items` (read-only Finance summary), `editor_images` bucket |

**Main components**
- `app/(app)/projects/page.tsx` — one query `projects.select('*, tasks(*)')`
- `components/projects/ProjectsClient.tsx` — wraps board in `<ProjectOptionsProvider>`; inner `ProjectsBoard` (state, `groupBy`, dnd, deep-link)
- `components/projects/ProjectCard.tsx` — reads `useProjectOptions().resolve` for colors
- `components/projects/ProjectDetailPanel.tsx` — 2156-line scrim; 5 tabs (Canvas/Tasks/Contacts/Notes/Files) + Ash module + Finance cross-module fetch; inline sub-components (CanvasEditor, ProjectTasksTab, NotesTab, FilesTab, ContactsTab, CustomSelect, …)
- `components/projects/NewProjectModal.tsx`, `OptionsMenu.tsx` (rename/recolour/reorder status/type/priority → `profiles.project_options`)
- `lib/projects/options.tsx` — `ProjectOptionsContext` (`DEFAULT_PROJECT_OPTIONS`, `OPTION_PALETTE`, `slugifyOptionKey`)
- `components/tour/projects/{ProjectsIntroModal,ProjectsTooltipTour}.tsx`

**API routes**: None — all via Supabase browser client. (Ash interactions hit Ash endpoints, not project routes.)

**Key patterns**: optimistic local updates then fire-and-forget; scrim panel maximize toggles scrim↔full-bleed; `@hello-pangea/dnd` board, drag writes only when grouped by Status; `ProjectOptionsProvider` shares one options fetch; events `projects:created/modal-opened/detail-opened`, `set-/clear-project-context`, listens `ash:turn-complete`; debounced autosave (CanvasEditor 800ms, InlineNoteEditor 500ms) with unmount flush.

**Cross-module links**: `tasks.project_id` (shared with Tasks module); `notes.project_id` → `/notes?id=`; `project_contacts`→`contacts` (Network); Finance detail-panel reads `time_entries`+`invoices` by `project_id`, "View in Finance →" via `window.location.href` (full reload); Ash `set-project-context`.

**Known TODOs / mocked**: `ProjectsClient.tsx:197` stale comment calling OptionsMenu a placeholder (it's wired); legacy `cut`/`on_hold` keys handled as muted visual state, not migrated; no API/server-validation layer.

**Mobile issues**: `ProjectDetailPanel.tsx:1919-1920` 252px left rail; `:1909-1910` panel offset `calc(--sidebar-width+32px)`; `ProjectsClient.tsx:355-359` cards `0 0 280px` (216 tall) in non-wrapping scroll rows; `:383` 200px ghost tile; `NewProjectModal.tsx` `1fr 1fr 1fr`/`1fr 1fr` grids (no breakpoint); `OptionsMenu.tsx:61` 340px; CanvasEditor `maxWidth 760` + 60px padding.

---

## Tasks

| | |
| --- | --- |
| **Routes** | `/tasks` (`app/(app)/tasks/page.tsx`); deep-link `?taskId=…` (from Ash) |
| **Tables** | `tasks` (primary; `opportunity_id` column lingers but unused), `projects`, `contacts`, `outreach_targets`, `outreach_pipelines` |

**Main components**
- `app/(app)/tasks/page.tsx` — `Promise.all` (active tasks, last 20 completed, project list); `TASK_SELECT` joins project/contact/target(+pipeline)
- `components/tasks/TasksClient.tsx` — 1433-line client; sidebar filters (all/overdue/today/upcoming/no_date/completed + per-project/person/target), sort, sectioned "All" view, lingering-fade completion, CSV export; inline sub-components (InlineDatePicker, InlineLinkPicker, PriorityPicker, QuickAdd, TaskRow, …)
- `components/tasks/TasksOptionsMenu.tsx`; `components/tour/tasks/{TasksIntroModal,TasksTooltipTour}.tsx`

**API routes**: None task-specific (CRUD via Supabase). Related but not called from Tasks UI: `/api/notes/suggest-tasks`, `/api/notes/ash-inline`.

**Key patterns**: optimistic then write; sidebar-rail + main-list (NOT scrim); People/Targets groups derived by walking the task list (not separately fetched); lingering-completion animation (650ms ghost); filter as tagged string union (`project:${id}`, `person:${id}`, `target:${id}`); event `tasks:created`; client-side CSV export.

**Cross-module links**: `tasks.project_id`→projects (shared with `ProjectTasksTab`); `contact_id`→contacts; `target_id`→outreach_targets (pill deep-links `/outreach?targetId=…`); Ash creates tasks + `?taskId` deep-link.

**Known TODOs / mocked**: `page.tsx:8` + `TasksClient.tsx:238` — Opportunities/`opportunity_id` dropped from read path but column lingers (dead column); no server-validation layer; completed list capped at 20 (`page.tsx:15`).

**Mobile issues**: `TasksClient.tsx:1219-1223` 196px sidebar (no drawer); `:1216` flex row no stacking; `TaskRow :677-831` non-wrapping with fixed maxWidths (pill 160 `:761`, picker 180 `:339`); `InlineLinkPicker` 300px (`:356`), `InlineDatePicker` 220px (`:165`); `TasksOptionsMenu.tsx:45` 260px; sort controls crowd narrow header (`:1269-1329`).

---

## Notes

| | |
| --- | --- |
| **Routes** | `/notes` (`app/(app)/notes/page.tsx`, reads `?id=`); `/share/[token]` (PUBLIC read-only, anon Supabase gated by RLS on `share_token`, standalone HTML doc) |
| **Tables** | `notes` (`content` HTML, `project_id`, `contact_id`, `opportunity_id`, `pinned`, `share_token`), `note_folders`, `note_folder_items`, `tasks` (write only), `projects`/`contacts`/`opportunities` (read), `editor_images` bucket |

**Main components**
- `components/notes/NotesClient.tsx` — 1733 lines; the entire module (3-pane layout, NoteEditor (Tiptap), InlineLinkPicker, FormatToolbar, SuggestTasksModal, FilterItem, NoteItem, FolderCard, NoteFolderMenu)
- `components/notes/ImportNoteModal.tsx` — client-side `.txt`/`.pdf`/`.docx` parse (pdfjs-dist + mammoth lazy); embedded images via `lib/uploads/editor-image.ts`
- `components/notes/NotesOptionsMenu.tsx`
- `components/ui/RichEditor.tsx` — shared `getRichExtensions`, `InlineAshPopover`, `submitInlineAsh`, `insertEditorImageFromFile`, ToggleBlock, Space-to-trigger-Ash
- `components/tour/notes/{NotesIntroModal,NotesTooltipTour,NoteAnimations}.tsx`

**API routes**

| Route | Model / purpose |
| --- | --- |
| `POST /api/notes/suggest-tasks` | Claude Haiku (`claude-haiku-4-5`) → JSON task titles (FormatToolbar "Generate tasks") |
| `POST /api/notes/ash-inline` | Claude Sonnet (`claude-sonnet-4-6`) agentic loop (≤4 turns, web_search); ACTION vs CONTENT mode; surface `note` carries `note_id` + linked `contact_id`/`project_id` |
| `POST /api/ash` (SSE) | Not Notes-specific (used by Resources) |

**Key patterns**: 4 parallel reads in `page.tsx`; optimistic everywhere; debounced autosave (800ms); inline-Ash surface (Space at line start → `submitInlineAsh`); events `notes:create-clicked`/`notes:created`; deep-link consume (`?new=1`/`?import=1`/`?noteId=X`, page reads `?id=X`) → `router.replace('/notes')`; master-detail (250px rail + flex-1 editor, NOT scrim); filter string union; share mints `crypto.randomUUID()` `share_token`.

**Cross-module links**: FKs `project_id`/`contact_id`/`opportunity_id`; inbound `/notes?id=<id>` from `ProjectDetailPanel.tsx:1081`, `ContactDetailPanel.tsx:654`, `OrganizationDetailPanel.tsx:616`, Home `NotesCard.tsx`, `page.tsx:154`; inline-Ash actions deep-link to /tasks,/projects,/network,/finance (`VIEW_FOR_TOOL` map); `SuggestTasksModal` writes `tasks`; Ash tools `create_note`/`search_notes`; notes NOT indexed by Resources file index.

**Known TODOs / mocked**: no real TODO markers (mature); PDF import is "v1 trade-off" (images appended per page, not inline `:13-16,112-116`); `.doc` unsupported; image-only PDFs → "couldn't pull text" (no OCR); suggest-tasks/ash-inline swallow parse failures.

**Mobile issues**: `NotesClient.tsx:1510` 250px left rail (no breakpoint); `:1506`/`:1648` three-pane no wrap (no matchMedia); `:694` editor `max-width 720` + 64px padding; `:1335+` topbar overflows; `:1629` folders fixed `1fr 1fr`; InlineLinkPicker 300 (`:234`), share popover 220 (`:1414`); `SuggestTasksModal` 460 (`:482`).

---

## Resources

Central file repo by INDEXING (not duplicating) other modules' files (`LinkedFile[]`).

| | |
| --- | --- |
| **Routes** | `/resources` (`app/(app)/resources/page.tsx`, reads `?cat=`) |
| **Tables** | `resources`, `resource_links`, `resource_folders`, `resource_folder_items` (`item_key` `res:<id>` or linked-file id), `profiles` (read), READ-ONLY index: `contact_files`, `organization_files`, `project_files`, `invoice_attachments`, `invoices`, `expenses`, `bank_transactions`; `resources` bucket |

**Main components**
- `components/resources/ResourcesClient.tsx` — 2145 lines; entire module (CategoryNav, AllFilesView, LinksView, LinkedFilesView, FilePreviewCard, ResourceCardItem, SetupModal, AddLinkModal, FolderMenu, OnboardingBanner, HealthPip)
- `components/resources/AshInlineChat.tsx` — in-modal Ash SSE chat (POST `/api/ash`); "Insert into <field>"
- `lib/resources/linked-files.ts` (`LinkedFile`, `LINKED_FILE_GROUPS`, `deepLinkForLinkedFile`)
- `lib/resources/onboarding-hydrate.ts` (`hydrateResourcesFromProfile` — labels MUST match MODALS prompt labels)
- `lib/uploads/editor-image.ts` (shared)
- `components/tour/resources/{ResourcesIntroModal,ResourcesTooltipTour,ResourcesAnimations}.tsx`

**API routes**: `POST /api/ash` (SSE, `module:'resources'`); no `app/api/resources/*` — all via Supabase client or server component.

**Key patterns**: `page.tsx` fans out 12 parallel reads, flattens 7 source tables into one `LinkedFile[]`, runs server-side hydration; cross-module file INDEXING (read-only, edit via `deepLinkForLinkedFile`); health/completeness model (pillars operations/brand/press/design, status empty/partial/complete); SetupModal edits `resources.fields` jsonb; drag-drop upload (dragDepth); localStorage (`perennial:resources-linked-visibility`, `…-onboarding-banner-dismissed`); folders hold ANY file via `item_key` + `fileByKey` map.

**Cross-module links**: pulls FROM Network/Projects/Finance/Settings; `deepLinkForLinkedFile` sends OUT to `/network?contactId=…&tab=files`, `/projects?projectId=…&tab=files`, `/finance?tab=invoices&invoice=…`, `/finance?tab=banking`, `/settings`; inbound `PressTab.tsx:201` → `/resources?cat=press`; `profiles` drives hydration (labels coupled to MODALS); shares `editor-image.ts` with Notes.

**Known TODOs / mocked**: `onboarding-hydrate.ts:42` `'Who is it for?' = p.bio` placeholder; MEMORY deferred (alias click-through, "+ New resource", file delete/replace, Ash structured-field tool); linked files read-only by design; no server-validation layer; `previewData`/`previewType` loosely typed.

**Mobile issues**: `ResourcesClient.tsx:937` 204px left rail (no collapse); `:1913` non-wrapping flex row (no matchMedia); pillar cards `minmax(330px,1fr)` (`:2069`), file grids `minmax(180px,1fr)`; `:1932` 52px topbar; SetupModal/AddLinkModal desktop-tuned; drag-drop is desktop-only; new-folder input 170px in 204px rail.

---

## Home / Dashboard

| | |
| --- | --- |
| **Routes** | `/` (`app/(app)/page.tsx`); `app/(app)/layout.tsx` wraps all authed routes |
| **Tables** | `profiles` (`onboarding_complete` gate), `notes`, `tasks`, `invoices`+`invoice_line_items`, `time_entries`, `expenses`, `projects`, `contacts`+`organizations`, `active_timers` |

**Main components**
- `app/(app)/page.tsx` — one `Promise.all` (~10 queries); forces `/onboarding` redirect if `!onboarding_complete`
- `app/(app)/layout.tsx` — shell: Sidebar + MobileNav + MobileDesktopNotice + `<main>` + AshContainer + TourTracker + TourCallout
- `components/home/{WelcomeBanner,NotesCard (only writable),TasksCard,CalendarCard,FinanceCard,ProjectsCard,ContactsCard}.tsx`
- `components/layout/Topbar.tsx` (greeting), `components/finance/QuickTimerButton.tsx`

**API routes**: none directly (cards Link out; QuickTimerButton hits finance timer APIs).

**Key patterns**: each card is a read-only live snapshot of another module ("no data lives here") except NotesCard/TasksCard (capture); `data-tour-step` anchors for DashboardTour.

**Cross-module links**: Topbar deep-links `/notes?new=1`, `/projects?new=1`; "View all" links to every module; `CalendarItem` aggregates `projects.due_date`+`tasks.due_date`; Finance card derives billable via `time_entries.project.rate`.

**Known TODOs / mocked**: profile photo upload "coming in a future update"; notif toggles beyond send+payment-confirmation are UI-only (need a cron).

**Mobile issues**: `page.tsx:176` `overflow-y-auto md:overflow-hidden` (mobile scrolls); auto-fit grid `minmax(280px,1fr)` (`:187,196`) stacks single-column (acceptable, desktop-first); Topbar actions non-wrapping.

---

## Settings

| | |
| --- | --- |
| **Routes** | `/settings` (`app/(app)/settings/page.tsx`); `?section=`, `?openModal=X`, `?provider=&connected=/&error=` |
| **Tables** | `profiles` (all columns; batched upsert on Save), `integrations`, `website_sites` |

**Main components**
- `app/(app)/settings/page.tsx` — single 2756-line client; 6 sections (account/studio/preferences/notifications/billing/integrations); sub-components ProviderCard, SyncNowButton, ImportContactsButton, BrowseDriveButton+DrivePickerModal, ConnectFormModal, OAuthResultToast, DisconnectButton, WebsiteSection+AddWebsiteModal+SnippetModal, StudioLogoField, AutoThemeToggle, BrandColorField
- `components/integrations/ProviderIcon.tsx`; `lib/uploads/studio-logo.ts`; `lib/profile/business.ts` (`COUNTRIES`, `BUSINESS_TYPES`, `composeStudioAddress`); `lib/theme.ts`; `components/ui/Toggle.tsx`

**API routes**: `/api/integrations/{google,microsoft}/sync`, `…/contacts/import`, `…/google/drive/{files,link}`, `…/{mailchimp,beehiiv,apple-icloud}/connect`, `/api/integrations/[id]` DELETE, `/api/integrations/website/connect` + `/api/track/script/[token]`; OAuth starts `/api/auth/{google,microsoft,instagram,google-analytics,stripe}`; password reset client-side (`resetPasswordForEmail`).

**Key patterns**: client loads own data on mount (no server prefetch); tab from `?section=`; single batched Save (SaveBar) EXCEPT logo + brand (immediate); event `profile-updated` (Sidebar live-updates); modals `inset-0 z-200`; integrations grouped into one `ProviderCard` (disconnected rows kept in DB for FK).

**Cross-module links**: studio identity feeds invoice PDF + `/i/[token]` + Stripe prefill; Drive picker → Resources; import contacts → Network; website snippet → Presence; auto-theme shared with Sidebar (`perennial-theme-changed`); "Restart welcome tour" resets `tour_visited`/`tour_dismissed`.

**Known TODOs / mocked**: 2FA "Soon" (~789); delete account just emails support (~820); TikTok tile "soon" (~1404); in-app push "coming" (~1239); most notif toggles not wired to cron; email change "contact support".

**Mobile issues**: `:697` 200px left nav (no collapse); content `maxWidth 560`; `grid-cols-2`/address grids don't collapse (e.g. 965); fixed inner blocks (hex 140 `:250`, drive select 150 `:2402`); modals 440-560, DrivePicker `82vh`.

---

## Onboarding

| | |
| --- | --- |
| **Routes** | `/onboarding` (`app/onboarding/page.tsx`, outside `(app)`; redirects to /login if no user, / if complete) |
| **Tables** | `profiles` (upsert on finish/skip), `resources` (one row per staged file), `resources` storage bucket |

**Main components**: `app/onboarding/page.tsx` (auth + redirect); `app/onboarding/OnboardingClient.tsx` — 1471-line wizard, 9 steps; in-file helpers (Chip, StepProgress, SelectInput, StepFooter, FileDropzone, IntegrationConnectStep); `lib/profile/business.ts`; `components/ui/AshMark.tsx`.

**API routes**: `/api/integrations/connect-status`; OAuth starts with `?next=/onboarding?step=9`; no save API (direct Supabase).

**Key patterns**: step mirrored to `?step=` (OAuth round-trips return correctly); two save paths share `billingPatch()` (handleFinish full / handleSkip partial); `buildProjectTypeOptions` → `profiles.project_options` (merged); sets `localStorage perennial-just-onboarded`; resets tour state.

**Cross-module links**: seeds Projects board types; uploads → Resources; billing shared via `composeStudioAddress`; practice_types/goals/challenges surface to Ash + WelcomeBanner; IntegrationConnectStep mirrors Settings.

**Known TODOs / mocked**: partial upload failure swallowed; "Skip for now" minimal write.

**Mobile issues**: wizard `maxWidth 560` (good) but step 3 `1fr 1fr`/`2fr 1fr 1fr` grids don't collapse (lines 750,792,806,811,914,937); botanical accents overflow-hidden (safe); padding 36/40px generous.

---

## Admin / Curate

| | |
| --- | --- |
| **Routes** | `/admin` (`app/(app)/admin/page.tsx`, thin wrapper; reached via Sidebar "Curate") |
| **Tables** | `opportunities` (status published/draft/archived; category fair/openCall/award/grant/residency/festival), `opportunity_suggestions` |

**Main components**: `app/(app)/admin/page.tsx`; `components/admin/AdminClient.tsx` (Listings + Suggestions tabs); `EditModal`, `Field`.

**API routes**: `POST /api/admin/opportunities` (create/update/status); `POST /api/admin/suggestions` (`{id, action: promote|dismiss}`).

**Key patterns**: client loads own data; optimistic suggestion actions; quick inline status toggles; modal `inset-0 z-50`; **no auth/role gate in client** — relies on proxy/RLS.

**Cross-module links**: published opportunities → Presence opportunities surface + Ash `get_opportunities`; monitoring cron writes `opportunity_suggestions` (needs `CRON_SECRET` per MEMORY).

**Known TODOs / mocked**: no admin-role check (assumes single-operator); cron needs `CRON_SECRET`.

**Mobile issues**: action rows crowd (no wrap); `EditModal` `flex gap-3` field rows don't stack; native `<select>`/date.

---

## Ash (AI assistant)

Globally mounted via `app/(app)/layout.tsx` — floating FAB + panel on every authed page.

| | |
| --- | --- |
| **Routes** | None (global mount) |
| **Tables** | `ash_conversations` (`module` column), `ash_messages`; READ tools query projects/tasks/contacts/contact_activities/notes/invoices/expenses/time_entries/outreach_pipelines/outreach_targets/opportunities; WRITE tools mutate projects/tasks/contacts/organizations/notes/time_entries/contact_activities; `context.ts` reads profiles/projects/tasks/contacts/notes/invoices/time_entries |

**Main components**: `components/ash/AshContainer.tsx` (FAB, open/expanded/convKey state); `components/ash/AshPanel.tsx` (streaming, history, suggestions, react-markdown + remark-gfm); `components/ui/AshMark.tsx`, `components/layout/AshIcon.tsx`; `app/api/ash/route.ts` (Anthropic SDK streaming agentic loop, nodejs runtime, maxDuration 60, prompt caching + web_search); `lib/ash/context.ts` (`buildAshContext`), `system-prompt.ts`, `tools/{index,read,write,types}.ts`.

**API routes**: `POST /api/ash` (SSE-style stream: `{text}`, `{tool}`, `{done, conversationId}`).

**Key patterns**: events `open-ash` (optional message + project context), `set-/clear-project-context`, dispatches `ash:turn-complete` (other views refetch); convKey remount trick (auto-send injected message, used by DashboardTour final step); streaming `ReadableStream` reader parsing `data:` lines; per-module suggestions from pathname; sessionStorage `perennial-tour-waiting-ash` coordinates with TourCallout; prompt caching (`cache_control ephemeral`) + appended dynamic context.

**Cross-module links**: reads/writes nearly every module's tables via tools; context from `profiles` onboarding; coupled to onboarding→DashboardTour→Ash hand-off; Anthropic server-side `web_search`.

**Known TODOs / mocked**: input "+" attach-context button "coming soon" (`AshPanel ~654`).

**Mobile issues**: `AshPanel.tsx:108-109` hardcoded W=360/680, H=480/`calc(100vh-80px)` — 360 panel at `bottom:20 right:20` crowds phones, expanded 680 exceeds viewport; history dropdown 260 (`~374`); FAB `bottom/right 24` fine.

---

## Layout / Navigation chrome

| | |
| --- | --- |
| **Routes** | `app/(app)/layout.tsx` wraps all authed routes |
| **Tables** | `profiles` (Sidebar/MobileNav read `studio_name` + `display_name`) |

**Main components**: `components/layout/Sidebar.tsx` (desktop `hidden md:flex`, collapsible 200/52px); `MobileNav.tsx` (`md:hidden` drawer); `MobileDesktopNotice.tsx` (dismissible banner, localStorage); `Topbar.tsx`; `SidebarTimerBadge.tsx`, `ComingSoonOverlay.tsx`, `DesignSystemLink.tsx`; `components/ui/Menu.tsx`; `lib/theme.ts` (`paintCurrentTheme`, `setBaseTheme`, `isAutoTheme`).

**API routes**: none (logout via `supabase.auth.signOut()`).

**Key patterns**: Sidebar sets `--sidebar-width` (200/52px) on root so fixed overlays lay out relative to it; events `profile-updated`, `perennial-theme-changed`; auto-theme re-evaluated on 60s interval + focus; collapsed-mode hover tooltips via fixed portal; `data-tour-key` on nav links; mobile drawer locks body scroll, closes on route change.

**Cross-module links**: nav to every module + `/settings`, `/design`, `/docs`, `/admin`; hosts AshContainer + tour components; profile menu "Edit profile" → `/settings`.

**Known TODOs / mocked**: APP_MENU items all "Soon"/disabled (What's new, Documentation, Keyboard shortcuts, Give feedback, Refer a friend); "Switch workspace" "Soon"; `NavItem` `soon` flag unused.

**Mobile issues**: Sidebar desktop-only (`hidden md:flex`); MobileNav drawer `width 280 maxWidth 85vh` (good); desktop-first acknowledged by MobileDesktopNotice; **`--sidebar-width` set even on mobile** where sidebar is hidden — fixed overlays reading it may mis-offset.

---

## Tour / Onboarding walkthrough

| | |
| --- | --- |
| **Routes** | None (DashboardTour on home; TourTracker + TourCallout in layout; per-module sets under `components/tour/<module>/`) |
| **Tables** | `profiles` (`tour_visited` jsonb, `tour_dismissed`, `onboarding_complete`) |

**Main components**: `components/tour/DashboardTour.tsx` (4-step spotlight, final hands off to Ash); `TourTracker.tsx` (marks `tour_visited[module]`, skips home/projects/contacts/notes which self-mark); `TourCallout.tsx` (fires only for projects); `GettingStartedWidget.tsx` (sidebar progress); `lib/tour.ts` (`TOUR_MODULES`, `nextUnvisited`, `progress`); per-module `{IntroModal,TooltipTour,Animations}.tsx` for tasks/calendar/projects/contacts/resources/presence/notes/finance/outreach.

**API routes**: none (state in `profiles`).

**Key patterns**: window events `tour-visited`, `tour-dismissed`, `tour-waiting-ash`/`tour-ash-closed`, `open-ash`; sessionStorage `perennial-tour-waiting-ash` suppresses sidebar callout during post-onboarding Ash chat; spotlight box-shadow cutout around `[data-tour-step]`; hand-off chain onboarding finish → DashboardTour → Ash → TourCallout (Projects) → passive GettingStartedWidget.

**Cross-module links**: deeply coupled to Ash + Sidebar (`data-tour-key`, GettingStartedWidget); reset via Settings → Preferences "Restart welcome tour"; `lib/tour.ts` maps all 10 module routes.

**Known TODOs / mocked**: GettingStartedWidget special-cases home-not-done (defers to on-screen DashboardTour).

**Mobile issues**: DashboardTour callout W=320 (clamps, mostly safe) but anchors to desktop grid sections; TourCallout W=250 anchors to sidebar nav item (hidden on mobile → no anchor, won't render); GettingStartedWidget lives in desktop Sidebar only (no mobile equivalent).
