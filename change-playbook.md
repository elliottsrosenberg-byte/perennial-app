# Change Playbook — Making App-Wide Changes Without Missing Spots

This is the reference for any change that has to land in **more than one place**. The Perennial app has grown by cloning rather than abstracting, so the same UI, helpers, and event contracts are duplicated across modules. A naive edit to "the detail panel" or "the chip color" will silently miss 3–13 other copies.

For each common change type below: the exact files/locations to touch, and what must stay in lockstep.

---

## 0. How to use this doc

1. Find your change type in the table.
2. Open **every** file/location listed for that row.
3. Apply the change identically across all of them (or, better, extract the shared primitive noted in the "Consolidation target" column and migrate callers).
4. If the change touches a cross-view behavior (data refresh, context handoff), check the **Cross-view sync events** section and fire/handle the matching event.

| Change type | Section |
|---|---|
| Detail / scrim panel chrome | [§1](#1-changing-the-detailscrim-panel-ui) |
| Buttons / cards / chips / inputs restyle | [§2](#2-restyling-buttons-cards-chips-inputs) |
| Add or change a design token / color | [§3](#3-adding-or-changing-a-design-token--color) |
| Mobile breakpoints / shell | [§4](#4-mobile-breakpoints--the-app-shell) |
| Shared data pattern / per-user state table | [§5](#5-shared-data-pattern--adding-a-per-user-state-table) |
| Cross-view sync events | [§6](#6-cross-view-sync-events) |
| Duplication registry (master list) | [§7](#7-duplication-registry-master-list) |

---

## 1. Changing the detail/scrim panel UI

**There is NO shared scrim/detail-panel component.** The scaffold is copy-pasted top-to-bottom into four files. Any change to the overlay chrome (backdrop opacity/blur, inset math, maximize animation, z-index, top-bar controls) must be edited in **all four** in lockstep.

### The four panels

| File | Lines | Scrim+panel block | Tab set |
|---|---|---|---|
| `components/projects/ProjectDetailPanel.tsx` | ~2155 | ~1896–1913 | Canvas / Tasks / Contacts / Notes / Files |
| `components/network/ContactDetailPanel.tsx` | ~1643 | ~1212–1226 | Canvas / Activity / Tasks / Notes / Files |
| `components/network/OrganizationDetailPanel.tsx` | ~1341 | ~1044–1056 | Canvas / Activity / Tasks / Notes / Files |
| `components/outreach/TargetDetailPanel.tsx` | ~1161 | ~862–879 | Canvas / Tasks / People / Notes / Files |

### The scaffold that is byte-for-byte identical (change in all four)

- **Scrim:** `<div className="fixed inset-0 z-10 …">` with `background: "rgba(20,18,16,0.52)"`, `backdropFilter: "blur(5px)"`, click-to-close, hidden when maximized.
- **Panel shell:** `fixed z-20 flex overflow-hidden`; inset `top:52px / bottom:32px / left:calc(56px + 32px) / right:32px`. **The `+56px` is the Sidebar rail width** — if the Sidebar width changes, this math changes in all four (see [§4](#4-mobile-breakpoints--the-app-shell)).
- `borderRadius: maximized ? 0 : 12`
- `boxShadow: "0 8px 40px rgba(0,0,0,0.22)"`
- `transition: "top/bottom/left/right/border-radius 0.2s ease"` (the maximize animation)
- Each panel **independently owns** `const [maximized, setMaximized]` and `const [settingsOpen, setSettingsOpen]` plus the `Maximize2`/`Minimize2`/`X` top-bar control cluster (`maximized` appears ~12–13× and `settingsOpen` ~8× per file).
- Left sidebar / right tabbed-content split.

The drift is in the **content** (tab sets and left-rail identity blocks differ per entity), not the shell. The Network panels even contain comments saying "matches project panel style" / "matches ContactDetailPanel".

### Consolidation target (do this if touching the chrome more than trivially)

Promote a single `<DetailPanelShell>` to `components/ui/` taking `sidebar` / `tabs` / `content` slots and owning `maximized`/`settingsOpen`/top-bar. This is the **Scrim Card Pattern** flagged in MEMORY (`project_scrim_card_pattern.md`) — still unaddressed. Until then, treat the four files as one unit.

### Related per-panel sub-pieces that also drift (see §7)

`EditableField`, `EditableTextarea`/`EditableDescription`, the `NotesTab`/`TasksTab`/`ActivityTab`/`FilesTab` bodies, task date/priority pickers, dropdown shells, chip helpers, and date-format helpers are each reimplemented inside these panels. If your panel change touches any of those, jump to [§7](#7-duplication-registry-master-list).

---

## 2. Restyling buttons, cards, chips, inputs

The shared primitives exist in `components/ui/` but are **under-adopted** — most screens hand-roll inline-styled markup. A restyle must hit both the primitive **and** every hand-rolled instance, or the app will look half-changed.

### 2a. Shared UI primitives and their real adoption

| Primitive | File | Importers | Gap |
|---|---|---|---|
| `Button` | `components/ui/Button.tsx` | 7 files only | Most screens hand-roll `<button>` with inline styles |
| `Badge` | `components/ui/Badge.tsx` | **0 importers (dead)** | ~29 files hand-roll pills/chips inline |
| `Checkbox` | `components/ui/Checkbox.tsx` | 1 file | native `<input type=checkbox>` in 7 places |
| `Select` | `components/ui/Select.tsx` | 14 files | ~18 native `<select>` elements remain — biggest gap |
| `DatePicker` | `components/ui/DatePicker.tsx` | 9 files | ~10 native date inputs + 2 bespoke calendars remain |
| `FilterTabs` | `components/ui/FilterTabs.tsx` | 2 files only | ~8 list clients hand-roll filter rows |
| `Menu` | `components/ui/Menu.tsx` | 3 files | many kebab/overflow menus hand-rolled |
| `Toggle` | `components/ui/Toggle.tsx` | 2 files | — |
| `NumberStepper` | `components/ui/NumberStepper.tsx` | 1 file | — |
| `ConfirmDialog` | `components/ui/ConfirmDialog.tsx` | 12 files | well-adopted |
| `EmptyState` | `components/ui/EmptyState.tsx` | 12 files | well-adopted (but re-implements Button markup inline) |
| `VisitButton` | `components/ui/VisitButton.tsx` | 8 home cards | **uses raw hex `#5d6b3d`/`#4a5630` — does NOT dark-mode** |
| `AshPromptsModule` | `components/ui/AshPromptsModule.tsx` | 4 detail panels | uses raw hex greens `#4a5630`/`#3d4a26`/`#7d9456` |

### 2b. Restyling **buttons**

1. Edit `components/ui/Button.tsx` (5 variants × 3 sizes, inline-style with `useState` hover).
2. Then sweep hand-rolled buttons. Known users of the primitive: `ProjectsClient`, `ImportContactsModal`, `ImportNoteModal`, `NotesClient`, `NewProjectModal`, `FinanceClient`, `OutreachClient`. **Everything else is hand-rolled** — grep for inline-styled `<button` per module.
3. `EmptyState.tsx` and `VisitButton.tsx` re-implement button markup; update them too.

### 2c. Restyling **chips / tags / pills**

There is no single chip component in use (`Badge` is dead). Color maps are hand-rolled per module:

| Location | What |
|---|---|
| `components/projects/ProjectDetailPanel.tsx:12` | `chipBg` / `optionTagStyle` |
| `components/network/ContactDetailPanel.tsx:16` | `TAG_COLORS` / `tagStyle` |
| `components/network/ContactDetailPanel.tsx:31` | `STATUS_CONFIG` |
| `components/network/ContactDetailPanel.tsx:38` | `LEAD_STAGE_CONFIG` |
| `components/ui/Badge.tsx` | the unused primitive (8 variants) |

The shared convention is a soft `rgba(…, 0.10–0.18)` background. **Decision point:** either adopt `Badge` everywhere (and add a `chipStyle(color)` util) or delete `Badge`. Project status/type/priority chip colors specifically flow from `lib/projects/options.tsx` via `useProjectOptions().resolve` — see [§3](#3-adding-or-changing-a-design-token--color).

### 2d. Restyling **inputs / selects / date pickers**

To change input styling app-wide you must restyle the primitive **and** migrate the native bypasses (per MEMORY `feedback_ui_polish`, native inputs are off-design):

**Native `<select>` (use `components/ui/Select.tsx`):**
`components/scheduling/BookingClient.tsx:281`, `components/calendar/EventCard.tsx:730`, `:916`, `components/scheduling/SchedulingLinkModal.tsx:200,255,261`, `components/network/NewContactModal.tsx:237,245`, `components/presence/PresenceClient.tsx:834,1993,2142`, `components/admin/AdminClient.tsx:196,208`, `components/outreach/TargetDetailPanel.tsx:993`, `components/outreach/NewTargetModal.tsx:298`, `app/(app)/settings/page.tsx:189`, `components/outreach/PipelineBoard.tsx:688`, `app/onboarding/OnboardingClient.tsx:355`.

**Native `<input type=date|datetime-local>` (use `components/ui/DatePicker.tsx`):**
`components/scheduling/SchedulingLinkModal.tsx:240,273`, `components/calendar/EventCard.tsx:976`, `components/network/OrganizationDetailPanel.tsx:423`, `components/network/ContactDetailPanel.tsx:458`, `components/admin/AdminClient.tsx:200,201,203`, `components/presence/PresenceClient.tsx:2148`, `components/outreach/TargetDetailPanel.tsx:335`, `components/outreach/NewTargetModal.tsx:473`.
Plus two **bespoke month-grid calendars** to migrate: `ProjectDetailPanel.tsx:149` (`DatePillField`) and `:605` (`TaskDatePicker`); and one native `DateField` at `TargetDetailPanel.tsx:316`.

**Native `<input type=checkbox>` (use `components/ui/Checkbox.tsx`):**
`components/scheduling/SchedulingLinkModal.tsx:220,270`, `components/calendar/EventCard.tsx:628`, `components/finance/AddExpenseModal.tsx:219`, `components/finance/ManualTransactionModal.tsx:189`, `app/(app)/settings/page.tsx:2353`, `components/finance/BankingTab.tsx:2481`.

**Native `<input type=color>` (no primitive exists):**
`app/(app)/settings/page.tsx:243` (brand-color swatch picker).

### 2e. Restyling **filter rows / segmented controls**

Edit `components/ui/FilterTabs.tsx`, then migrate the hand-rolled rows: `components/tasks/TasksClient.tsx`, `components/calendar/CalendarClient.tsx`, `components/resources/ResourcesClient.tsx`, `components/notes/NotesClient.tsx`, `components/presence/PresenceClient.tsx`, `components/finance/FinanceClient.tsx`, `components/outreach/OutreachClient.tsx`, `components/admin/AdminClient.tsx`. (Only `ProjectsClient` and `NetworkClient` use `FilterTabs` today.)

### 2f. Restyling **dropdown / popover shells**

Shared primitives: `components/ui/Menu.tsx` (3 importers) and `components/ui/Select.tsx` (14). The same card style (`var(--color-surface-raised)` + `0.5px solid var(--color-border)` + `borderRadius ~10` + `0 4px 20px rgba(0,0,0,0.12)` + hover rows) is hand-rolled at `ProjectDetailPanel.tsx:115` (`CustomSelect`) plus its task pickers, and `ContactDetailPanel.tsx:1277,1294,1344,1423` (four inline dropdowns). Route these through `Menu`/`Select`.

---

## 3. Adding or changing a design token / color

### 3a. Themed CSS variables (the correct path)

Themed colors are CSS custom properties (e.g. `var(--color-surface-raised)`, `var(--color-border)`). Theme application lives in `lib/theme.ts` (`BaseTheme`, `paintCurrentTheme`, `setBaseTheme`, `isAutoTheme`, `setAutoTheme`). Auto dark-mode state is in `localStorage`, **not** the profile.

When the theme changes at runtime, the **`perennial-theme-changed`** event is dispatched and listened to by `components/layout/Sidebar.tsx` and `app/(app)/settings/page.tsx` — fire/handle it if you add a new theme-dependent surface (see [§6](#6-cross-view-sync-events)).

### 3b. Raw-hex offenders (will NOT dark-mode — fix these when touching color)

These bake brand greens as literals and break in dark mode:
- `components/ui/VisitButton.tsx` — `#5d6b3d`, `#4a5630`
- `components/ui/AshPromptsModule.tsx` — `#4a5630`, `#3d4a26`, `#7d9456`
- Per-module chip color maps in `ProjectDetailPanel.tsx:12`, `ContactDetailPanel.tsx:16/31/38` (see [§2c](#2c-restyling-chips--tags--pills))
- The scrim backdrop `rgba(20,18,16,0.52)` and shadows `0 8px 40px rgba(0,0,0,0.22)` are literals repeated in all four detail panels ([§1](#1-changing-the-detailscrim-panel-ui)).

### 3c. Project status/type/priority option colors (a separate token system)

These are **user-editable** options, not CSS tokens:
- `lib/projects/options.tsx` — `ProjectOptionsContext`, `DEFAULT_PROJECT_OPTIONS`, `OPTION_PALETTE`, `slugifyOptionKey`. Fetched once per page mount from `profiles.project_options`.
- Consumed via `useProjectOptions().resolve` in `components/projects/ProjectCard.tsx` and the project chip helpers.
- Edited by `components/projects/OptionsMenu.tsx` (rename/recolour/reorder), persisted back to `profiles.project_options`.

Adding a palette color = edit `OPTION_PALETTE` in `lib/projects/options.tsx`.

---

## 4. Mobile breakpoints / the app shell

### Shell composition

`app/(app)/layout.tsx` is the flex shell: `Sidebar` + `MobileNav` + `MobileDesktopNotice` + `<main>` + `AshContainer` + `TourTracker` + `TourCallout`.

| Concern | File | Notes |
|---|---|---|
| Desktop rail | `components/layout/Sidebar.tsx` | `hidden md:flex`, collapsible **200px / 52px** |
| Mobile nav | `components/layout/MobileNav.tsx` | top bar + slide-in drawer, `md:hidden` |
| "Best on desktop" banner | `components/layout/MobileDesktopNotice.tsx` | dismissible, `localStorage`, `useSyncExternalStore` |
| Per-page header | `components/layout/Topbar.tsx` | greeting/title/actions |
| Running-timer badge | `components/layout/SidebarTimerBadge.tsx` | listens to timer events ([§6](#6-cross-view-sync-events)) |

### CRITICAL coupling: Sidebar width ↔ detail-panel inset math

All four detail panels hardcode `left: calc(56px + 32px)`, where **`56px` encodes the Sidebar rail width**. The Sidebar's own collapsed width is `52px` and expanded `200px`. If you change the rail width or make the panels breakpoint-aware on mobile, you must update the inset in **all four** panels from [§1](#1-changing-the-detailscrim-panel-ui) plus `Sidebar.tsx`. There is no shared constant — introduce one when you touch this.

When adding mobile breakpoints to the shell, audit: the detail-panel `fixed` insets (4 files), `Sidebar` (`md:flex`), `MobileNav` (`md:hidden`), and any module that assumes desktop-width list+detail layouts.

---

## 5. Shared data pattern / adding a per-user state table

### The write-path rule of thumb

> A write goes through the **browser Supabase client** (`lib/supabase/client.ts`) when the row is **per-user and the user owns it** — RLS (`auth.uid() = user_id`) is the entire authorization check, so no API route is needed.

This is the overwhelming default: **69 client components** import `@/lib/supabase/client` and call `.insert/.update/.delete` directly (`ProjectsClient`, `TasksClient`, `NetworkClient`, `NotesClient`, `ResourcesClient`, `CalendarClient`, the `*DetailPanel`s, etc.).

### When you DO need a service-role API route

Only when RLS would (correctly) block the browser client — i.e. the data is **not** user-owned:

| Case | Examples |
|---|---|
| Global / shared tables | `/api/opportunities/status` (sets `user_status` on the global feed), `/api/admin/opportunities`, `/api/admin/suggestions` |
| No-session public surfaces | `/api/stripe/webhook`, `/api/finance/*`, `/i/[token]`, `/api/book/[slug]` + `lib/scheduling/*` |
| Cron | `/api/cron/opportunities-ingest` (`CRON_SECRET`-gated) |

**Pattern to copy for a new service-role route:** verify `auth.getUser()` (or a shared-secret/signature) **first**, then **strictly whitelist** the columns/values you write. Example: `/api/opportunities/status` does `auth.getUser()` → `createAdminClient().update(...).eq('id', id)` whitelisting **only** `user_status` and validating it against an `ALLOWED` set.

> Note: `/api/admin/*` carries a `TODO: real admin-role gate` — currently any signed-in user can curate (pre-launch == owner). Do not assume an admin role exists.

OAuth/sync routes (`/api/integrations/*`, `/api/auth/*/callback`) run with the user's session (`lib/supabase/server.ts`, RLS) and do **not** need service role, because the vault RPCs are `SECURITY DEFINER` and re-check `auth.uid()`.

### Adding a new per-user state table — checklist

1. Create the table with a `user_id` column and an RLS policy `auth.uid() = user_id` (SELECT/INSERT/UPDATE/DELETE).
2. Read/write from the relevant client component via `lib/supabase/client.ts` — **no API route**.
3. Fetch initial data in the module's **server** `page.tsx` (the established pattern: `Promise.all(...)` of the per-user queries, passed as props — see `app/(app)/calendar/page.tsx`, `app/(app)/finance/page.tsx`, `app/(app)/projects/page.tsx`, `app/(app)/network/page.tsx`).
4. Only reach for a service-role route if the table is global/shared or written from a no-session/public surface (then follow the whitelist pattern above).
5. If another open view must reflect the change live, fire a cross-view event ([§6](#6-cross-view-sync-events)).

---

## 6. Cross-view sync events

State sync between independently-mounted views is done with **`window` CustomEvents**. When you change a view that produces data another view shows, you must **fire** the event; when you add a view that should react, you must **listen**. Below is the full registry, with dangling/missing listeners flagged.

### Ash context + lifecycle

| Event | Dispatched by | Listened by |
|---|---|---|
| `open-ash` | `AshPromptsModule.tsx`, `home/WelcomeBanner.tsx`, `ui/EmptyState.tsx`, `presence/PresenceClient.tsx`, `tour/calendar/CalendarTooltipTour.tsx` | `ash/AshContainer.tsx` |
| `set-project-context` / `clear-project-context` | `projects/ProjectDetailPanel.tsx` | `ash/AshContainer.tsx` |
| `set-contact-context` / `clear-contact-context` | `network/ContactDetailPanel.tsx` | **NONE — dangling** (Ash only wires project context) |
| `set-organization-context` / `clear-organization-context` | `network/OrganizationDetailPanel.tsx` | **NONE — dangling** |
| `ash:turn-complete` | `ash/AshPanel.tsx` | `projects/ProjectDetailPanel.tsx` (refetch tasks+notes) |
| `ash:write-tool-ran` | `ui/RichEditor.tsx` | **NONE found** |

> If you make Ash context-aware for Contacts/Orgs, the dispatch already exists — add the listener in `AshContainer.tsx`. Mirror how `set-project-context` is wired.

### Calendar + scheduling

| Event | Dispatched by | Listened by |
|---|---|---|
| `calendar:refresh-events` | `EventCard.tsx`, `CalendarOptionsMenu.tsx`, `CalendarSourcesPanel.tsx` | `CalendarClient.tsx` |
| `calendar:event-created` | `EventCard.tsx` | `CalendarClient.tsx` |
| `calendar:row-changed` | `CalendarSourcesPanel.tsx` | `CalendarClient.tsx` |
| `calendar:default-changed` | `CalendarSourcesPanel.tsx` | `CalendarClient.tsx` |
| `calendar:integration-connected` | `CalendarClient.tsx` | `tour/calendar/CalendarTooltipTour.tsx` |
| `calendar:task-created` | `CalendarClient.tsx` | `tour/calendar/CalendarTooltipTour.tsx` |
| `calendar:new-task-opened` | `CalendarClient.tsx` | `tour/calendar/CalendarTooltipTour.tsx` |
| `scheduling:refresh` | `CalendarClient.tsx` | `CalendarClient.tsx` (loadLinks), `scheduling/SchedulingPanel.tsx` |

### Network / Outreach cross-module navigation

| Event | Dispatched by | Listened by |
|---|---|---|
| `network:open-contact` | `network/OrganizationDetailPanel.tsx` | `network/NetworkClient.tsx` |
| `outreach:open-target` | `network/OrganizationDetailPanel.tsx`, `outreach/LeadsBoard.tsx` | `outreach/OutreachClient.tsx` |
| `outreach:project-linked` | `outreach/TargetDetailPanel.tsx` | `outreach/TargetDetailPanel.tsx` |
| `outreach:followup-logged` | `outreach/PipelineBoard.tsx` | tour/analytics only — no app-state listener |
| `finance:set-tab` | cross-module nav into Finance | `finance/FinanceClient.tsx` |

### Layout / profile / timer

| Event | Dispatched by | Listened by |
|---|---|---|
| `profile-updated` | `app/(app)/settings/page.tsx` | `layout/Sidebar.tsx` (studio name/avatar, no reload) |
| `perennial-theme-changed` | theme toggle / `lib/theme.ts` | `layout/Sidebar.tsx`, `app/(app)/settings/page.tsx` |
| `perennial:timer-started` / `perennial:timer-stopped` | `finance/QuickTimerButton.tsx`, `finance/FinanceClient.tsx`, `layout/SidebarTimerBadge.tsx` | `layout/SidebarTimerBadge.tsx`, `finance/QuickTimerButton.tsx` |

### Tour instrumentation (not data sync — fire-and-forget)

`tour-visited` (from `settings/page.tsx`, `tour/TourTracker.tsx`, tour modals → tour tracking); and `tasks:created` / `projects:created` / `contacts:created` / `notes:created` / `outreach:*-created` (+ `*-opened`) from the respective list clients → tour tooltip/intro components. These are analytics/onboarding hooks, **not** data refresh.

### Rules when changing a view

- **Producing data another open view shows?** Dispatch the matching event after the write. If none exists, add one namespaced `module:verb` and document it here.
- **Adding a new view that should refresh on others' changes?** Add a `window.addEventListener` (and clean up on unmount). Check the **dangling** rows above before inventing a new event — `set-contact-context`, `set-organization-context`, `ash:write-tool-ran`, and `outreach:followup-logged` already fire with no consumer.

---

## 7. Duplication registry (master list)

The single source of truth for "this exists in N places." Touching any item below = edit **every** location, or extract the noted consolidation target and migrate callers.

### 7.1 Scrim + panel chrome — **4 copies**
`projects/ProjectDetailPanel.tsx` (~1896), `network/ContactDetailPanel.tsx` (~1212), `network/OrganizationDetailPanel.tsx` (~1044), `outreach/TargetDetailPanel.tsx` (~862).
→ Promote `<DetailPanelShell>` to `components/ui/`. Full detail in [§1](#1-changing-the-detailscrim-panel-ui).

### 7.2 `EditableField` (single-line inline edit) — **4 implementations, 2 prop contracts**
- `projects/ProjectDetailPanel.tsx:306` — `{display, editDefault, inputType}` (also handles date/number)
- `network/ContactDetailPanel.tsx:91` — `{label, value, onSave}`
- `network/OrganizationDetailPanel.tsx:73` — literal copy of Contact's
- `outreach/TargetDetailPanel.tsx:267` — `{value, onSave}` + `isLink` variant

Styling (0.5px border-bottom row, 11px grey label, sage focus underline, `#6b6860` value) is identical everywhere.
→ One `components/ui/EditableField` with optional `inputType` / `isLink` / `multiline` props.

### 7.3 `EditableTextarea` / `EditableDescription` (multi-line inline edit) — **2 copies**
`projects/ProjectDetailPanel.tsx:412` (`EditableDescription`), `network/OrganizationDetailPanel.tsx:111` (`EditableTextarea`).
→ Fold into `EditableField` as a multiline mode.

### 7.4 Rich-text formatting toolbar — **2 copies**
- `components/ui/RichEditor.tsx:439` (`RichToolbar` — canonical)
- `components/notes/NotesClient.tsx:291` (`FormatToolbar` — near-verbatim copy)

Same `useEditorState` selector (8 identical `isActive` keys), same `btn()`/`sep()` helpers, same image-picker input. Diffs: a `data-tour-target="notes.format-toolbar"` attribute and `transition: 'all 0.08s'`. `home/NotesCard.tsx:86` correctly uses the shared `RichToolbar`.
→ Delete `FormatToolbar`; pass a `tourTarget` prop to `RichToolbar`. **Any new formatting button must currently be added in BOTH.**

### 7.5 Per-panel `NotesTab` / `TasksTab` / `ActivityTab` / `FilesTab` — **~3 panels each**
- `projects/ProjectDetailPanel.tsx`: `:874` ProjectTasksTab, `:1115` NotesTab, `:1261` FilesTab, `:1429` ContactsTab
- `network/ContactDetailPanel.tsx`: `:332` ActivityTab, `:546` TasksTab, `:628` NotesTab
- `network/OrganizationDetailPanel.tsx`: `:305` ActivityTab, `:510` TasksTab, `:592` NotesTab

Same prop shape `{entityId, items[], setItems, highlightedId}`; identical list/inline-add/debounced-save/highlight/show-completed logic, parameterized only by FK (`project_id` vs `contact_id` vs `organization_id`).
→ Extract entity-agnostic `<NotesTab>`/`<TasksTab>`/`<ActivityTab>` taking a `{column, id}` link descriptor.

### 7.6 Task date-picker / priority-picker / due-chip helpers — **drifting copies**
- `projects/ProjectDetailPanel.tsx:605` TaskDatePicker, `:702` TaskPriorityPicker, `:586` getDueChipLabel, `:596` getDueChipColor
- `tasks/TasksClient.tsx:461` PriorityPicker

Due thresholds/colors (Overdue/Today/Tomorrow/Nd) reimplemented with drift.
→ Shared `TaskDuePicker` + `PriorityPicker` + `dueChip()` util.

### 7.7 Calendar / date-picker popovers — **bespoke vs shared**
- `projects/ProjectDetailPanel.tsx:149` `DatePillField`, `:605` `TaskDatePicker` (two bespoke month grids)
- `outreach/TargetDetailPanel.tsx:316` `DateField` (native input)
- `components/ui/DatePicker.tsx` — the shared primitive (9 importers)
→ Migrate bespoke + native to `components/ui/DatePicker`. (Native-date list in [§2d](#2d-restyling-inputs--selects--date-pickers).)

### 7.8 Dropdown / popover shells — **hand-rolled vs shared**
- `projects/ProjectDetailPanel.tsx:115` `CustomSelect` + task picker drops
- `network/ContactDetailPanel.tsx:1277,1294,1344,1423` (four inline dropdowns)
- `components/ui/Menu.tsx` (3 importers), `components/ui/Select.tsx` (14 importers)
→ Route bespoke dropdowns through `Select`/`Menu`. (Style spec in [§2f](#2f-restyling-dropdown--popover-shells).)

### 7.9 Chip/tag color helpers & status/stage maps — **per-module + dead primitive**
- `projects/ProjectDetailPanel.tsx:12` `chipBg`/`optionTagStyle`
- `network/ContactDetailPanel.tsx:16` `TAG_COLORS`/`tagStyle`, `:31` `STATUS_CONFIG`, `:38` `LEAD_STAGE_CONFIG`
- `components/ui/Badge.tsx` — **0 importers (dead)**
→ Adopt `Badge` or delete it; add a `chipStyle(color)` util for the `rgba(…,0.10–0.18)` convention. (Detail in [§2c](#2c-restyling-chips--tags--pills).)

### 7.10 Date / relative-time formatting helpers — **~13 copies**
`timeAgo`/`fmtDate`/`fmtTime`/`fmt` ("Today/Yesterday/Nd ago") re-declared with subtle threshold differences in:
`projects/ProjectDetailPanel.tsx`, `network/ContactDetailPanel.tsx`, `network/OrganizationDetailPanel.tsx`, `outreach/TargetDetailPanel.tsx`, `notes/NotesClient.tsx`, `home/NotesCard.tsx`, `calendar/CalendarClient.tsx`, `calendar/EventCard.tsx`, `presence/PresenceClient.tsx`, `finance/InvoicesTab.tsx`, `ash/AshPanel.tsx`.
→ Extract `lib/format/date.ts`.

### 7.11 Module list filter rows — **2 use shared, ~8 hand-roll**
Shared: `components/ui/FilterTabs.tsx` (importers: `ProjectsClient`, `NetworkClient`). Hand-rolled: `tasks/TasksClient.tsx`, `calendar/CalendarClient.tsx`, `resources/ResourcesClient.tsx`, `notes/NotesClient.tsx`, `presence/PresenceClient.tsx`, `finance/FinanceClient.tsx`, `outreach/OutreachClient.tsx`, `admin/AdminClient.tsx`.
→ Standardize on `FilterTabs` (extend for counts/icons). (Detail in [§2e](#2e-restyling-filter-rows--segmented-controls).)

### 7.12 Inline-Ash surface plumbing — **GOOD (shared), one missing variant**
Canonical: `components/ui/RichEditor.tsx` (`InlineAshSurface` type, `InlineAshPopover`, `submitInlineAsh`, `SelectionBubble`). Wrapped correctly by `ProjectDetailPanel` (CanvasEditor), `ContactDetailPanel` (ContactCanvasEditor), `TargetDetailPanel` (EntityCanvasEditor), `NotesClient`.
→ **Adding a new inline-Ash surface = edit the `InlineAshSurface` union + the `/api/notes/ash-inline` route, NOT each panel.** `OrganizationCanvasEditor` intentionally omits inline-Ash (no `'canvas-organization'` variant yet — comment at `OrganizationDetailPanel.tsx:147`); add that variant to enable it.

---

## 8. Quick reference — where shared things live

| Concern | Canonical location |
|---|---|
| Browser DB writes (per-user, RLS) | `lib/supabase/client.ts` |
| Server-session reads | `lib/supabase/server.ts` |
| Service-role (global/public/cron) | `lib/supabase/service.ts` + `createAdminClient()` |
| Theme application + dark mode | `lib/theme.ts` |
| Project option colors | `lib/projects/options.tsx` |
| Rich text engine + toolbar + inline-Ash | `components/ui/RichEditor.tsx` |
| Editor image uploads | `lib/uploads/editor-image.ts` |
| Cross-module file index | `lib/resources/linked-files.ts` |
| Ash context / prompt / tools | `lib/ash/context.ts`, `lib/ash/system-prompt.ts`, `lib/ash/tools/*` |
| App shell | `app/(app)/layout.tsx` |
| Nav chrome | `components/layout/{Sidebar,MobileNav,Topbar,MobileDesktopNotice}.tsx` |
| Date/time formatting | **TODO:** `lib/format/date.ts` (does not exist yet — see [§7.10](#710-date--relative-time-formatting-helpers--13-copies)) |
| Detail-panel shell | **TODO:** `components/ui/DetailPanelShell` (does not exist yet — see [§1](#1-changing-the-detailscrim-panel-ui)) |
