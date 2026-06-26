# Change Playbook — Making App-Wide Changes Without Missing Spots

**Audience:** anyone editing shared UI, design tokens, data patterns, or cross-view behavior in the Perennial app.

**Why this doc exists:** large parts of the app were built by **cloning, not sharing**. Several primitives exist in `components/ui/` but are bypassed; several "primitives" exist only as copy-pasted scaffolds inside module files. As a result, one logical change frequently requires editing the **same thing in 4–13 places**. This playbook lists, per change type, **exactly which files must move in lockstep**.

> Golden rule: before you edit a chrome/UI/token detail in one detail panel or list view, assume it is duplicated. Grep first. The [Duplication Registry](#duplication-registry) is the canonical inventory of "things that exist in N places."

---

## Quick decision table

| You want to change… | Go to section | # of files in lockstep |
|---|---|---|
| The detail/scrim panel chrome (backdrop, inset, maximize, top-bar) | [1](#1-the-detailscrim-panel) | **4** |
| Button / card / chip / input styling | [2](#2-restyling-buttons--cards--chips--inputs) | up to ~29 (chips), 18 (`select`), 10 (`date`) |
| A design token / color | [3](#3-changing-or-adding-a-design-token--color) | tokens file + raw-hex hold-outs |
| Mobile breakpoints in the shell | [4](#4-mobile-breakpoints-in-the-shell) | 3–4 layout files + per-panel inset math |
| A shared data pattern / per-user state table | [5](#5-shared-data-pattern--adding-a-per-user-state-table) | client vs. service-route decision |
| A view that participates in cross-view sync | [6](#6-cross-view-sync-events) | dispatcher(s) + listener(s) |

---

## 1. The detail/scrim panel

There is **no shared scrim/detail-panel component.** The entire scaffold is reimplemented top-to-bottom in **four files**:

| File | Lines | Scrim+panel block |
|---|---|---|
| `components/projects/ProjectDetailPanel.tsx` | ~2155 | ~1896–1913 |
| `components/network/ContactDetailPanel.tsx` | ~1643 | ~1212–1226 |
| `components/network/OrganizationDetailPanel.tsx` | ~1341 | ~1044–1056 |
| `components/outreach/TargetDetailPanel.tsx` | ~1161 | ~862–879 |

The scaffold is byte-for-byte consistent (each was cloned from the previous — see the in-file comments "matches project panel style" / "matches ContactDetailPanel"). **Any change to the overlay must be applied to all four files.**

### What is identical across all four (change in lockstep)

| Element | Value |
|---|---|
| Scrim | `<div className="fixed inset-0 z-10 …">`, `background:"rgba(20,18,16,0.52)"`, `backdropFilter:"blur(5px)"`, click-to-close, hidden when maximized |
| Panel shell | `fixed z-20 flex overflow-hidden` |
| Inset (non-maximized) | `top:52px / bottom:32px / left:calc(56px + 32px) / right:32px` — **the `+56px` is the Sidebar rail width** |
| Radius | `borderRadius: maximized ? 0 : 12` |
| Shadow | `boxShadow:"0 8px 40px rgba(0,0,0,0.22)"` |
| Maximize animation | `transition:"top/bottom/left/right/border-radius 0.2s ease"` |
| State | each panel independently owns `const [maximized, setMaximized]` (appears ~12–13× per file) and `const [settingsOpen, setSettingsOpen]` (~8× per file) |
| Top-bar controls | `Maximize2 / Minimize2 / X` cluster |

### What legitimately differs per panel (do NOT try to unify blindly)

- **Tab sets:** Project = canvas/tasks/notes/files/contacts · Contact & Org = canvas/activity/tasks/notes/files · Target = canvas/activity/tasks/people/notes/files (Activity/Tasks/Notes/Files wrap the linked Contact/Org).
- **Left-sidebar identity/details block** — entity-specific.

### Recommended fix (per MEMORY `project_scrim_card_pattern.md`, still unaddressed)

Promote a single `<DetailPanelShell>` in `components/ui/` taking `sidebar` / `tabs` / `content` slots plus `maximized`/`settingsOpen` state. Until then, **edit all four files together** and re-grep `0 8px 40px`, `rgba(20,18,16,0.52)`, `blur(5px)`, and `calc(56px` to confirm nothing drifted.

> If the Sidebar width changes, the inset math (`calc(56px + 32px)`) in **all four** panels is wrong. See [Section 4](#4-mobile-breakpoints-in-the-shell).

---

## 2. Restyling buttons / cards / chips / inputs

The core problem: **primitives exist but are bypassed.** Before restyling, decide whether you are editing the primitive (and then migrating hold-outs) or hand-patching each call site.

### 2a. Primitive adoption map

| Primitive | File | Adoption | Hold-outs you must also touch |
|---|---|---|---|
| `Button` | `components/ui/Button.tsx` | only **7** files (ProjectsClient, ImportContactsModal, ImportNoteModal, NotesClient, NewProjectModal, FinanceClient, OutreachClient) | most other screens hand-roll `<button>` with inline styles |
| `Badge` | `components/ui/Badge.tsx` | **ZERO importers — dead** | ~29 files hand-roll pill/chip markup inline |
| `Select` | `components/ui/Select.tsx` | 14 files (mostly finance) | ~18 native `<select>` (see 2c) |
| `DatePicker` | `components/ui/DatePicker.tsx` | 9 files | ~10 native `<input type=date/datetime-local>` (see 2c) |
| `Checkbox` | `components/ui/Checkbox.tsx` | 1 file | 7 native `<input type=checkbox>` (see 2c) |
| `FilterTabs` | `components/ui/FilterTabs.tsx` | only 2 (ProjectsClient, NetworkClient) | ~8 list clients hand-roll filter rows (see 2d) |
| `Menu` | `components/ui/Menu.tsx` | 3 files | many kebab/overflow menus hand-rolled |
| `Toggle` | `components/ui/Toggle.tsx` | 2 files | — |
| `NumberStepper` | `components/ui/NumberStepper.tsx` | 1 file | — |
| `VisitButton` | `components/ui/VisitButton.tsx` | 8 home cards | **uses raw hex `#5d6b3d`/`#4a5630` — does NOT theme in dark mode** |

### 2b. Chips / tags / status pills — the biggest inline mess

`Badge` has **zero importers**. Chip rendering is hand-styled inline per module with per-module color maps. To restyle chips app-wide you must touch every map:

| File | What |
|---|---|
| `components/projects/ProjectDetailPanel.tsx:12` | `chipBg` / `optionTagStyle` |
| `components/network/ContactDetailPanel.tsx:16` | `TAG_COLORS` / `tagStyle`; `:31` `STATUS_CONFIG`; `:38` `LEAD_STAGE_CONFIG` |
| `components/ui/Badge.tsx` | the dead primitive (8 variants, hardcoded bg/color pairs) |

The shared convention everywhere is a soft `rgba(…, 0.10–0.18)` background. **Fix:** adopt `Badge` for chips (or delete it) and add a shared `chipStyle(color)` util. Until then, restyling a chip = editing each inline map above plus the ~29 hand-rolled sites.

> Also note project status/type/priority colors are **data-driven**, resolved via `lib/projects/options.tsx` (`useProjectOptions().resolve`, `OPTION_PALETTE`, `DEFAULT_PROJECT_OPTIONS`) and persisted to `profiles.project_options`. Restyling project chips may mean editing the palette there, not a component.

### 2c. Inputs — native elements that bypass primitives

If you restyle an input primitive, these native hold-outs will **not** pick up the change. Migrate or patch each:

**Native `<select>`** (use `Select`):
`components/scheduling/BookingClient.tsx:281` · `components/calendar/EventCard.tsx:730,916` · `components/scheduling/SchedulingLinkModal.tsx:200,255,261` · `components/network/NewContactModal.tsx:237,245` · `components/presence/PresenceClient.tsx:834,1993,2142` · `components/admin/AdminClient.tsx:196,208` · `components/outreach/TargetDetailPanel.tsx:993` · `components/outreach/NewTargetModal.tsx:298` · `app/(app)/settings/page.tsx:189` · `components/outreach/PipelineBoard.tsx:688` · `app/onboarding/OnboardingClient.tsx:355`

**Native `<input type=date|datetime-local>`** (use `DatePicker`; per MEMORY `feedback_ui_polish` native date inputs are off-design):
`components/scheduling/SchedulingLinkModal.tsx:240,273` · `components/network/OrganizationDetailPanel.tsx:423` · `components/network/ContactDetailPanel.tsx:458` · `components/admin/AdminClient.tsx:200,201,203` · `components/presence/PresenceClient.tsx:2148` · `components/outreach/TargetDetailPanel.tsx:335` · `components/outreach/NewTargetModal.tsx:473`
Note: `EventCard.tsx` and `QuickTaskCard.tsx` were migrated to `components/calendar/ChipPickers.tsx` (PER-84).

**Native `<input type=checkbox>`** (use `Checkbox`):
`components/scheduling/SchedulingLinkModal.tsx:220,270` · `components/calendar/EventCard.tsx:628` · `components/finance/AddExpenseModal.tsx:219` · `components/finance/ManualTransactionModal.tsx:189` · `app/(app)/settings/page.tsx:2353` · `components/finance/BankingTab.tsx:2481`

**Native `<input type=color>`** (no primitive exists): `app/(app)/settings/page.tsx:243` (brand-color swatch picker).

### 2d. List filter rows / segmented controls

`FilterTabs` exists but only 2 of ~10 list clients use it. To change filter-row styling app-wide, also touch the hand-rolled rows in:
`components/tasks/TasksClient.tsx` · `components/calendar/CalendarClient.tsx` · `components/resources/ResourcesClient.tsx` · `components/notes/NotesClient.tsx` · `components/presence/PresenceClient.tsx` · `components/finance/FinanceClient.tsx` · `components/outreach/OutreachClient.tsx` · `components/admin/AdminClient.tsx`. (Extend `FilterTabs` with counts/icons if a module needs them, then migrate.)

### 2e. Dropdown / popover card shell

The same card — `var(--color-surface-raised)` + `0.5px solid var(--color-border)` + `borderRadius ~10` + `0 4px 20px rgba(0,0,0,0.12)` + hover-highlight rows — is hand-rolled even though `Menu`/`Select` exist. Hand-rolled instances:
`components/projects/ProjectDetailPanel.tsx:115` (CustomSelect), plus its TaskPriorityPicker/DatePicker drops · `components/network/ContactDetailPanel.tsx:1277,1294,1344,1423` (four inline dropdowns). Route these through `Select`/`Menu`.

---

## 3. Changing or adding a design token / color

The app uses CSS custom properties (`var(--color-surface-raised)`, `var(--color-border)`, etc.) painted by `lib/theme.ts` (`BaseTheme`, `paintCurrentTheme`, `setBaseTheme`, `isAutoTheme`). **Prefer adding/editing a token there** so dark mode and auto-theme work for free.

### Lockstep checklist for a token/color change

1. **Edit the token** in the theme source (`lib/theme.ts` and the CSS-var definitions it paints).
2. **Fire `perennial-theme-changed`** if the change is runtime-switchable — it is listened to by `components/layout/Sidebar.tsx` and `app/(app)/settings/page.tsx` (see [Section 6](#6-cross-view-sync-events)).
3. **Hunt raw hex hold-outs** that bypass tokens and will NOT re-theme:
   - `components/ui/VisitButton.tsx` — `#5d6b3d` / `#4a5630` (no dark mode).
   - `components/ui/AshPromptsModule.tsx` — `#4a5630` / `#3d4a26` / `#7d9456`.
   - The scrim backdrop `rgba(20,18,16,0.52)` and shadow `0 8px 40px rgba(0,0,0,0.22)` are hardcoded in all 4 detail panels ([Section 1](#1-the-detailscrim-panel)).
   - Per-module chip color maps in [Section 2b](#2b-chips--tags--status-pills--the-biggest-inline-mess).
   - The Ash green hexes and dropdown card values in [Section 2e](#2e-dropdown--popover-card-shell).
4. **Brand color** (per-user, not a theme token) flows from `profiles` via the picker at `app/(app)/settings/page.tsx:243` (`BrandColorField`). It is consumed by invoices (`lib/invoices/email-template.ts`, print page). Changing brand-color *plumbing* is a Finance concern, not a theme-token concern.
5. **Grep** for the old hex/token name across `components/` and `app/` before declaring done.

---

## 4. Mobile breakpoints in the shell

The shell lives in `app/(app)/layout.tsx` (flex shell: `Sidebar` + `MobileNav` + `MobileDesktopNotice` + `<main>` + `AshContainer` + `TourTracker` + `TourCallout`).

### Files that define the desktop/mobile split

| File | Role | Breakpoint mechanism |
|---|---|---|
| `components/layout/Sidebar.tsx` | desktop rail | `hidden md:flex`, collapsible **200px / 52px** |
| `components/layout/MobileNav.tsx` | mobile top bar + drawer | `md:hidden` |
| `components/layout/MobileDesktopNotice.tsx` | "best on desktop" banner | localStorage, `useSyncExternalStore` |
| `app/(app)/layout.tsx` | assembles all of the above | — |

### Lockstep when adding/altering breakpoints

1. Keep `Sidebar` (`md:flex`) and `MobileNav` (`md:hidden`) **on the same breakpoint** — they are mutually exclusive halves of one switch.
2. **Detail-panel inset math depends on Sidebar width.** All four panels hardcode `left:calc(56px + 32px)` (the `56px` = rail). If the rail width changes per breakpoint, the panels do **not** respond — you must update the inset in all four files ([Section 1](#1-the-detailscrim-panel)) or make them read the rail width.
3. `MobileDesktopNotice` assumes desktop-first; revisit its copy/threshold if you add real mobile layouts.
4. Per AGENTS.md: **this is a modified Next.js** — read `node_modules/next/dist/docs/` before touching routing/layout structure.

---

## 5. Shared data pattern / adding a per-user state table

### The write-path rule of thumb

**Default: browser Supabase client + RLS.** A write goes through the browser client (`lib/supabase/client.ts`) when the row is **per-user and owned by that user** — RLS (`auth.uid() = user_id`) is the entire authorization check, so **no API route is needed**. This is the overwhelming majority: **69 client components** import `@/lib/supabase/client` and call `.insert/.update/.delete` directly (ProjectsClient, TasksClient, NetworkClient, NotesClient, ResourcesClient, CalendarClient, all `*DetailPanel`s, etc.).

**Exception: service-role API route.** Use a service-role route ONLY when RLS would (correctly) block the browser client — i.e. the data is **not user-owned**:

| Situation | Example route |
|---|---|
| Global/shared table | `/api/opportunities/status` (sets `user_status` on the global feed; whitelists ONLY `user_status`, validates against an ALLOWED set) |
| Admin-curated global feed | `/api/admin/opportunities`, `/api/admin/suggestions` (⚠ TODO: no real admin-role gate yet — any signed-in user can curate) |
| Cron bulk ingest | `/api/cron/opportunities-ingest` (CRON_SECRET-gated) |
| No user session (signed payload / public token) | `/api/stripe/webhook`, `/api/finance/*`, `/i/[token]` |
| Public booking visitor (no session) | `/api/book/[slug]`, `lib/scheduling/*` (integration id always resolved from the link, never visitor input) |
| OAuth/sync with user session | `/api/integrations/*`, `/api/auth/*/callback` — **use `server.ts` + RLS, NOT service role** (vault RPCs are `SECURITY DEFINER` and re-check `auth.uid()`) |

### Adding a per-user state table — checklist

1. Create the table with a `user_id` column and an RLS policy `auth.uid() = user_id`.
2. Write/read directly via `lib/supabase/client.ts` from the relevant client component. **Do not** add an API route.
3. If a module's data must refresh another view after the write, fire the appropriate cross-view event ([Section 6](#6-cross-view-sync-events)).
4. Only if the table is global/shared/public: copy the **service-role route pattern** — `await auth.getUser()` (or verify a shared secret / signature) **FIRST**, then `createAdminClient()` and **strictly whitelist the columns and values** you write (mirror `/api/opportunities/status`).

> Most module pages are server components that batch-fetch with `Promise.all` and hand initial state to a client (e.g. `app/(app)/projects/page.tsx`, `app/(app)/calendar/page.tsx`, `app/(app)/finance/page.tsx`). When you add a per-user table that a page renders on load, add its fetch to that page's `Promise.all`.

---

## 6. Cross-view sync events

These are `window` `CustomEvent`s (`dispatchEvent` / `addEventListener`). When you change a view that **produces** or **consumes** state another view depends on, wire the matching event. Below is the full registry. **Dispatching without a listener is silent and useless; listening for an event no one dispatches is dead code** — both failure modes already exist in the app (flagged below).

| Event | Dispatched by | Listened by |
|---|---|---|
| `open-ash` | `components/ui/AshPromptsModule.tsx`, `components/home/WelcomeBanner.tsx`, `components/ui/EmptyState.tsx`, `components/presence/PresenceClient.tsx`, `components/tour/calendar/CalendarTooltipTour.tsx` | `components/ash/AshContainer.tsx` |
| `set-project-context` / `clear-project-context` | `components/projects/ProjectDetailPanel.tsx` | `components/ash/AshContainer.tsx` |
| `set-contact-context` / `clear-contact-context` | `components/network/ContactDetailPanel.tsx` | ⚠ **NONE** — dispatched but no listener (Ash only wires project context) |
| `set-organization-context` / `clear-organization-context` | `components/network/OrganizationDetailPanel.tsx` | ⚠ **NONE** — dispatched but no listener |
| `ash:turn-complete` | `components/ash/AshPanel.tsx` | `components/projects/ProjectDetailPanel.tsx` (refetch tasks + notes) |
| `ash:write-tool-ran` | `components/ui/RichEditor.tsx` | ⚠ **no listener found** |
| `calendar:refresh-events` | `components/calendar/EventCard.tsx`, `CalendarOptionsMenu.tsx`, `CalendarSourcesPanel.tsx` | `components/calendar/CalendarClient.tsx` |
| `calendar:event-created` | `components/calendar/EventCard.tsx` | `components/calendar/CalendarClient.tsx` |
| `calendar:row-changed` | `components/calendar/CalendarSourcesPanel.tsx` | `components/calendar/CalendarClient.tsx` |
| `calendar:default-changed` | `components/calendar/CalendarSourcesPanel.tsx` | `components/calendar/CalendarClient.tsx` |
| `calendar:integration-connected` | `components/calendar/CalendarClient.tsx` | `components/tour/calendar/CalendarTooltipTour.tsx` |
| `calendar:task-created` | `components/calendar/CalendarClient.tsx` | `components/tour/calendar/CalendarTooltipTour.tsx` |
| `calendar:new-task-opened` | `components/calendar/CalendarClient.tsx` | `components/tour/calendar/CalendarTooltipTour.tsx` |
| `scheduling:refresh` | `components/calendar/CalendarClient.tsx` | `components/calendar/CalendarClient.tsx` (loadLinks), `components/scheduling/SchedulingPanel.tsx` |
| `profile-updated` | `app/(app)/settings/page.tsx` | `components/layout/Sidebar.tsx` (updates studio name/avatar without reload) |
| `perennial-theme-changed` | theme toggle / `lib/theme.ts` path | `components/layout/Sidebar.tsx`, `app/(app)/settings/page.tsx` |
| `perennial:timer-started` / `perennial:timer-stopped` | `components/finance/QuickTimerButton.tsx`, `FinanceClient.tsx`, `components/layout/SidebarTimerBadge.tsx` | `components/layout/SidebarTimerBadge.tsx`, `components/finance/QuickTimerButton.tsx` |
| `network:open-contact` | `components/network/OrganizationDetailPanel.tsx` | `components/network/NetworkClient.tsx` |
| `outreach:open-target` | `components/network/OrganizationDetailPanel.tsx`, `components/outreach/LeadsBoard.tsx` | `components/outreach/OutreachClient.tsx` |
| `outreach:project-linked` | `components/outreach/TargetDetailPanel.tsx` | `components/outreach/TargetDetailPanel.tsx` |
| `outreach:followup-logged` | `components/outreach/PipelineBoard.tsx` | tour/analytics consumer; ⚠ no app-state listener |
| `finance:set-tab` | cross-module nav into Finance | `components/finance/FinanceClient.tsx` |
| `tour-visited`; `tasks:created` / `projects:created` / `contacts:created` / `notes:created` / `outreach:*-created` (+ `*-opened`) | respective list clients & tour modals | tour tooltip/intro components (**instrumentation only — not data sync**) |

### Rules when changing a view

- **Adding a way to mutate data shown elsewhere?** Fire the existing event that view already listens for (e.g. mutate an event in calendar → dispatch `calendar:refresh-events`).
- **Changing/renaming an event?** Update **every** dispatcher AND every listener in the row together. A rename that misses one side fails silently.
- **Adding Ash context for a new entity?** Note Contact/Org context events are dispatched but unlistened — wiring a new entity's context requires adding the listener in `components/ash/AshContainer.tsx`, not just dispatching.
- **Adding a new inline-Ash surface?** Do NOT touch each panel. Edit the `InlineAshSurface` union + the `/api/notes/ash-inline` route. (`OrganizationCanvasEditor` omits inline-Ash today precisely because there is no `'canvas-organization'` variant yet — see comment at `OrganizationDetailPanel.tsx:147`.)

---

## Duplication Registry

The single source of "things that exist in N places." When you change any item, change **every** listed location, or promote to the suggested shared primitive.

### A. Scrim + detail-panel chrome — **4 copies**
See [Section 1](#1-the-detailscrim-panel). Files: `ProjectDetailPanel.tsx`, `network/ContactDetailPanel.tsx`, `network/OrganizationDetailPanel.tsx`, `outreach/TargetDetailPanel.tsx`. → promote `<DetailPanelShell>` to `components/ui/`.

### B. `EditableField` (single-line inline edit) — **4 copies, 2 divergent contracts**
- `projects/ProjectDetailPanel.tsx:306` — API `{display, editDefault, inputType}`; also handles date/number.
- `network/ContactDetailPanel.tsx:91` — API `{value, placeholder, onSave}`.
- `network/OrganizationDetailPanel.tsx:73` — literal copy of Contact's.
- `outreach/TargetDetailPanel.tsx:267` — `{value, onSave}` + `isLink` variant.

Styling identical everywhere (0.5px border-bottom row, 11px grey label, sage focus underline, `#6b6860` value). → ONE `components/ui/EditableField` with optional `inputType`/`isLink`/`multiline`.

### C. `EditableTextarea` / `EditableDescription` (multi-line inline edit) — **2 copies**
- `projects/ProjectDetailPanel.tsx:412` (`EditableDescription`)
- `network/OrganizationDetailPanel.tsx:111` (`EditableTextarea`)

→ fold into the `EditableField` primitive as a `multiline` mode.

### D. Rich-text formatting toolbar — **2 copies (one near-verbatim)**
- `components/ui/RichEditor.tsx:439` — `RichToolbar` (**canonical**).
- `components/notes/NotesClient.tsx:291` — `FormatToolbar` (near-verbatim copy; only diffs: `data-tour-target="notes.format-toolbar"` and `transition:'all 0.08s'` on buttons).

`components/home/NotesCard.tsx:86` correctly uses the shared `RichToolbar`. → **delete `FormatToolbar`**, add a `tourTarget` prop to `RichToolbar`. **Any new formatting button must currently be added in BOTH.**

### E. Per-panel `NotesTab` / `TasksTab` / `ActivityTab` / `FilesTab` — **partly consolidated**
Shared entity-agnostic tabs live in `components/detail/`: `EntityTasksTab`, `EntityNotesTab`, `EntityFilesTab`, `EntityActivityTab` — each takes `{fkColumn, id}` (+ optional controlled state).
- ✅ `outreach/TargetDetailPanel.tsx` — uses all four (wrapping the linked Contact/Org).
- ◐ `network/ContactDetailPanel.tsx` + `network/OrganizationDetailPanel.tsx` — use shared `EntityActivityTab`; still inline `TasksTab` / `NotesTab` / `FilesTab`.
- ✗ `projects/ProjectDetailPanel.tsx` — still has its own `ProjectTasksTab` / `NotesTab` / `FilesTab` / `ContactsTab`.

→ Remaining: migrate the network + project panels' Tasks/Notes/Files onto the shared `Entity*Tab` components.

### F. Task date-picker / priority-picker / due-chip helpers — **duplicated with drift**
- `projects/ProjectDetailPanel.tsx:605 TaskDatePicker`, `:702 TaskPriorityPicker`, `:586 getDueChipLabel`, `:596 getDueChipColor`
- `tasks/TasksClient.tsx:461 PriorityPicker`

Due-date thresholds/colors (Overdue/Today/Tomorrow/Nd) reimplemented. → shared `TaskDuePicker` + `PriorityPicker` + `dueChip()` util.

### G. Calendar / date-picker popovers — **3 bespoke despite a shared primitive**
- `projects/ProjectDetailPanel.tsx:149 DatePillField`, `:605 TaskDatePicker` (bespoke month grids)
- `outreach/TargetDetailPanel.tsx:316 DateField` (native input — off-design)
- `components/ui/DatePicker.tsx` — the real shared primitive (**9 importers**)

→ migrate the bespoke ones to `components/ui/DatePicker`.

### H. Dropdown/popover card shell — see [Section 2e](#2e-dropdown--popover-card-shell). → route through `Select`/`Menu`.

### I. Chip/tag color helpers & status/stage maps — see [Section 2b](#2b-chips--tags--status-pills--the-biggest-inline-mess). → adopt or delete `Badge`; add `chipStyle(color)`.

### J. Date/relative-time formatting (`fmtDate`/`fmtTime`/`timeAgo`/`fmt`) — **~13 copies with subtle threshold drift**
Re-declared in: `projects/ProjectDetailPanel.tsx`, `network/ContactDetailPanel.tsx`, `network/OrganizationDetailPanel.tsx`, `outreach/TargetDetailPanel.tsx`, `notes/NotesClient.tsx`, `home/NotesCard.tsx`, `calendar/CalendarClient.tsx`, `calendar/EventCard.tsx`, `presence/PresenceClient.tsx`, `finance/InvoicesTab.tsx`, `ash/AshPanel.tsx`. → extract `lib/format/date.ts`.

### K. Module list filter rows — see [Section 2d](#2d-list-filter-rows--segmented-controls). → standardize on `FilterTabs`.

### L. Inline-Ash surface plumbing — **GOOD (shared), do not duplicate**
Canonical path in `components/ui/RichEditor.tsx` (`InlineAshSurface`, `InlineAshPopover`, `submitInlineAsh`, `SelectionBubble`). Each canvas editor (`CanvasEditor` in Project, `ContactCanvasEditor`, `EntityCanvasEditor` in Target, `notes/NotesClient.tsx`) wraps the shared path — only the surface descriptor differs. **To add a surface: edit the `InlineAshSurface` union + `/api/notes/ash-inline`, NOT each panel.**

---

## Pre-flight checklist for any app-wide change

1. **Grep before editing.** Search the literal value/name across `components/` and `app/` — assume N copies.
2. **Check the Duplication Registry** above for your item; edit every listed location or promote a primitive.
3. **Check primitive adoption** ([2a](#2a-primitive-adoption-map)) — if a primitive exists but is bypassed, decide: migrate hold-outs vs. patch each site.
4. **Hunt raw-hex hold-outs** for color/token changes (`VisitButton`, `AshPromptsModule`, scrim backdrop, chip maps).
5. **Wire cross-view events** ([Section 6](#6-cross-view-sync-events)) if you changed data another view shows.
6. **Re-grep the sentinel strings** (`0 8px 40px`, `rgba(20,18,16,0.52)`, `calc(56px`, the old hex, the event name) to confirm zero drift.
7. **Read `node_modules/next/dist/docs/`** before touching routing/layout/server-component structure — this is a modified Next.js (per AGENTS.md).
