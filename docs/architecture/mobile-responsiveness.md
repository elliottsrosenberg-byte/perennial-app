# Mobile Responsiveness — Architecture & Remediation Reference

> Status reference for the upcoming mobile pass. Captures the current state of mobile responsiveness across the Perennial app, the worst offenders by `file:line`, the recurring patterns that break, and a prioritized plan to fix them.

## TL;DR

The app **shell is genuinely responsive**; the app **content is effectively desktop-only**.

- The layout shell (`app/(app)/layout.tsx`) correctly swaps a desktop sidebar for a mobile top bar + slide-in drawer at the `md` breakpoint, so **navigation works on a phone**.
- Every module's **content** — multi-column layouts, scrim/detail panels, side rails, tables, the calendar — is built desktop-first with **inline styles, fixed px widths, and `fr`-grids that have no mobile breakpoints**.
- The **single highest-impact problem** is the scrim/detail-panel pattern: it offsets by `--sidebar-width` (which stays `52px` even when the rail is hidden) and reserves a fixed ~252px inner rail, collapsing the content column to a sliver on a 375px screen.
- The Home dashboard (`app/(app)/page.tsx`) is the lone content exception — it uses `auto-fit minmax(280px,1fr)` grids and `md:` prefixes, so it reflows acceptably.

**Net:** a phone user can navigate but most surfaces are cramped, horizontally clipped, or unusable.

---

## 1. Layout shell — already responsive

The shell adaptation is essentially **done**. The remaining work is entirely inside `<main>`'s children.

| Element | File | Behavior |
|---|---|---|
| Shell row | `app/(app)/layout.tsx:9-23` | `flex` row: `<Sidebar/>` + a `min-w-0` column containing `<MobileNav/>`, `<MobileDesktopNotice/>`, and `<main overflow-auto>` |
| Desktop rail | `components/layout/Sidebar.tsx:226` | `hidden md:flex`; JS-toggled width 200px expanded / 52px collapsed (`Sidebar.tsx:229`) |
| `--sidebar-width` var | `components/layout/Sidebar.tsx:138-143` | CSS var exposing the rail width — **set unconditionally to 52px even when the rail is `display:none` below `md`** (root cause of panel mis-offset) |
| Mobile top bar + drawer | `components/layout/MobileNav.tsx:73,116` | 52px top bar (`md:hidden`); hamburger opens a fixed left drawer `width:280, maxWidth:85vw` over a scrim — correct and idiomatic |
| "Best on desktop" banner | `components/layout/MobileDesktopNotice.tsx` | Dismissible `md:hidden` notice |
| Topbar | `components/layout/Topbar.tsx` | `px-6`, height 52px, `flex justify-between`; does not itself break, but its actions slot is where per-page toolbars overflow |

On mobile the whole `<aside>` is `display:none`, so it takes no space — good. **The one shell defect that leaks into content:** `--sidebar-width` is never zeroed on mobile, and fixed overlays that read it inherit the wrong inset.

---

## 2. Breakpoints & responsive handling that exists today

Responsiveness is **narrow and ad-hoc**. ~90% of styling is inline; Tailwind `md:` appears in only a handful of places.

| Where | What |
|---|---|
| Shell swap | `Sidebar` (`hidden md:flex`), `MobileNav` / `MobileDesktopNotice` (`md:hidden`) |
| Home dashboard | `app/(app)/page.tsx:176,186,195` (`md:overflow-hidden`, `md:flex-1`, `md:min-h-0`) + auto-fit grids |
| Misc | `components/ui/Button.tsx`, `components/scheduling/BookingClient.tsx`, auth pages (login/signup/forgot/reset), `app/design/page.tsx` use `sm:`/`md:` |
| Finance | `components/finance/InvoicesTab.tsx:101` (`p-4 sm:p-6`), `:125` (`flex-col md:flex-row`) |
| Print/share | `app/invoice/[id]/print`, `app/i/[token]` use raw `@media` |
| Global CSS | `globals.css:108` — only a `prefers-color-scheme` query; **no width breakpoints** |

**`window.innerWidth` appears ~25 times** (`CalendarClient`, `TaskQuickEditPopover`, tour tooltips, `BankingTab`, `ProjectDetailPanel` dropdowns) but **all of it is popover/menu edge-clamping — none drives layout**. There is **no `useMediaQuery` / `matchMedia`-based layout switching anywhere.**

---

## 3. The scrim / detail-panel pattern — the #1 mobile problem

This is the single most important mobile problem, and it **recurs across modules** (the documented "Scrim Card Pattern", intended for `components/ui/`).

**Canonical implementation** — `components/network/ContactDetailPanel.tsx:1209-1235`:

- a fixed `inset-0` scrim,
- then a fixed panel pinned `top:52px bottom:32px`, `left: calc(var(--sidebar-width,52px) + 32px)`, `right:32px`,
- containing an inner **fixed 252px rail** + a flexible content body.

Followed by `ProjectDetailPanel`, `OrganizationDetailPanel`, and the outreach `TargetDetailPanel`.

**Two failures on mobile:**

1. The panel positions relative to `--sidebar-width`, which is `52px` even though the rail is `display:none` below `md` — so the panel never goes full-bleed and **wastes ~84px on the left**.
2. The inner 252px rail + content side-by-side is a guaranteed two-column layout that **cannot fit a phone**, squeezing content to a sliver.

**Required fix:** below `md`, render full-screen (`inset:0`, `left:0`, ignore `--sidebar-width`) and **stack the rail above/below the content** (or make the rail a collapsible drawer).

| Panel | File:line | Notes |
|---|---|---|
| Contact (canonical) | `components/network/ContactDetailPanel.tsx:1217-1235` | **Worst offender.** Inner 252px rail at `:1233`; body padding `36px 60px 80px` + `maxWidth:760` at `:266` |
| Organization | `components/network/OrganizationDetailPanel.tsx` | Same scrim pattern, same fixed 252px inner rail |
| Project | `components/projects/ProjectDetailPanel.tsx:1909-1920` | Inner rail `width:252 flexShrink:0`; body `maxWidth:760` + padding `36px 60px 80px` (`:551`) — 120px horizontal padding alone exceeds a phone width |
| Outreach target | `components/outreach/TargetDetailPanel.tsx:869-885` | Offsets `top:52/bottom:32/left:calc(56px+32px)/right:32`; 268px left sidebar |

> **Modals are fine by contrast.** `NewProjectModal.tsx:137` and peers use `width:100% + maxWidth + padding:16` on a centered flex scrim, so they shrink to viewport width correctly. Only their **internal multi-column form grids** need single-column fallbacks (§5).

---

## 4. Worst fixed-width offenders (file:line)

| Surface | File:line | Problem |
|---|---|---|
| Contact detail panel | `components/network/ContactDetailPanel.tsx:1217-1235` | Scrim offset by `--sidebar-width` + inner fixed 252px rail → content column ~0 on 375px. **Worst overall.** |
| Org detail panel | `components/network/OrganizationDetailPanel.tsx` | Same scrim + fixed 252px inner rail |
| Project detail panel | `components/projects/ProjectDetailPanel.tsx:1920` | Inner rail `width:252 flexShrink:0`; body `maxWidth:760` + 120px horizontal padding (`:551`) |
| Network table grid | `components/network/NetworkClient.tsx:96` | `GRID = '32px 2.6fr 1.6fr 1.2fr 0.9fr 1.1fr 0.8fr'` (ORG_GRID identical `:99`); 7-col header/rows (`:701/:780/:843`) with **no overflow-x and no mobile collapse** |
| Project cards | `components/projects/ProjectsClient.tsx:383` | Cards `flex 0 0 200px` / `width 200` / `height 216`; ghost tile fixed 200px |
| Presence stat/table grids | `components/presence/PresenceClient.tsx:517` | `repeat(4, minmax(0,1fr))` stat row; `:1009/:1015/:1035` fixed-px tracks (`1fr 72px 72px`, `1fr 1fr 40px`) |
| Calendar week/day grid | `components/calendar/CalendarClient.tsx:1246` | JS `dayPx` (default 140px) per-column width + horizontal scroll (`:1507-1540`); built for a wide multi-day grid |
| Calendar sources rail | `components/calendar/CalendarSourcesPanel.tsx:688,789` | Fixed-position menus `minWidth 230-240`; desktop side panel |
| New project modal grids | `components/projects/NewProjectModal.tsx:171,187` | `'1fr 1fr 1fr'` / `'1fr 1fr'` rows stay multi-column when narrow |
| New contact modal grids | `components/network/NewContactModal.tsx:186,204,218,232` | `grid-cols-2` form rows, no `sm:` single-column fallback |
| Resources folder rail | `components/resources/ResourcesClient.tsx:937` | Fixed 204px left folder rail (`width:204 flexShrink:0`); two-pane, no mobile stack |

---

## 5. Native inputs — mostly a mobile WIN

Native `<select>` / `<input type=date|time>` are used in:

`components/network/NewContactModal.tsx`, `components/outreach/NewTargetModal.tsx`, `components/outreach/TargetDetailPanel.tsx`, `components/outreach/PipelineBoard.tsx`, `components/presence/PresenceClient.tsx`, `components/scheduling/SchedulingLinkModal.tsx`, `components/scheduling/BookingClient.tsx`, `components/admin/AdminClient.tsx`, `components/calendar/QuickTaskCard.tsx`, `components/calendar/EventCard.tsx`, `app/(app)/settings/page.tsx`, `app/onboarding/OnboardingClient.tsx`.

- **Native pickers trigger the OS picker on a phone** — the most usable mobile pattern. So these are a mobile **win**, even though MEMORY notes they're a design-system mismatch on desktop. **Keep them.**
- The components to verify are the **custom dropdowns**: `DatePicker.tsx`, `Menu.tsx`, and the many inline `position:absolute` menus — confirm they don't overflow a small viewport.
- All free-text inputs/`textarea` use `width:100%` and reflow fine; the risk is only the **layout around them**.

---

## 6. Per-module mobile issues

### Calendar
- `components/calendar/CalendarClient.tsx:2098-2103` — root `flex h-full` with fixed **216px left rail**, no responsive collapse/hamburger.
- Time grid uses `PX_PER_HOUR=64` + day-column floor `DAY_MIN_PX=96` (`:44`); a 7-col week needs ~672px+ and horizontal-scrolls (`overflow-x-auto` ~`:2643`) rather than reflowing.
- `EventCard`/`QuickTaskCard`/`TaskQuickEditPopover` fixed-width panels (`EventCard PANEL_W=340`; overlays `W=280/260` ~`:3629/3754`) positioned by viewport math — no mobile sheet.
- `components/calendar/EventCard.tsx` native date/time/select chips (TimeChip/DateChip/RepeatSelect/Reminder).
- **Drag-create / drag-reschedule via `mousedown/mousemove/mouseup` with no touch handlers — drag won't work on touch devices.**

### Scheduling (owner side, embedded in Calendar)
- `components/scheduling/SchedulingComposePanel.tsx` — built to fit the 216px Calendar rail; depends on grid drag — unusable on touch/narrow.
- `components/scheduling/SchedulingLinkModal.tsx:174` — fixed `inset-0` modal, desktop form layout.
- `ManageConferencingModal.tsx:40` — centered fixed modal, fine but inherits desktop input sizing.

### Public Booking page (invitee) — best-adapted in cluster
- `components/scheduling/BookingClient.tsx:212` — `md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr_300px]` **stacks on mobile**; fixed columns only apply at `md+`. Primary risk (3-col → tall scroll) is already handled.

### Finance
- `FinanceClient.tsx:216` — topbar `height:52` with non-wrapping tab strip + action buttons → overflows narrow viewports.
- `OverviewTab.tsx:146` — `grid grid-cols-4` KPI cards, no breakpoint.
- `OverviewTab.tsx:211` — main+side flex row, hardcoded `width:272` side column, no stacking (`:206` charts row).
- `TimeTab.tsx:229` — non-wrapping filter bar (Select 160px + week nav + toggle + total); `:265` 7-day bar chart.

### Invoices
- `InvoicesTab.tsx:804` — detail layout `flex ... p-5` with fixed **296px list pane** (`:807`) + `flex-1` detail, no stacking.
- `InvoicesTab.tsx:104-127` — SendInvoiceModal `maxWidth:1160 / height:92vh` with 360px compose rail + iframe preview; has `md:flex-row` (`:125`) so it stacks, but 360px rail (`:127`) keeps `shrink-0`.
- `InvoicesTab.tsx:1245/1254` (`width:156`), `:1582` (`width:340`), `:1952` (`width:280`) — fixed-width popovers.
- `app/invoice/[id]/print/page.tsx:139` — `.parties` 3-col / `:170` footer 2-col — fine for print, tight on phone screen view.
- `NewInvoiceModal` single-column `max-w-xl` — mobile-friendlier.

### Banking
- `BankingTab.tsx:1115` — `grid grid-cols-5` KPI cards won't fit mobile.
- `BankingTab.tsx:1062` — accounts strip `overflow-x-auto` cards `minWidth:168-208` — wide but okay-ish.
- `BankingTab.tsx:1202` — sticky filter bar + 220px search (`:1222`), non-wrapping.
- Wide multi-column data table with inline expanded actions — not designed to reflow.

### Public invoice payment (Stripe Connect) — most mobile-aware in cluster
- `app/i/[token]/page.tsx:124` — `.pi-grid minmax(0,1fr) 360px` **has `@media(max-width:880px)` (`:128`) collapsing to 1 col.**
- Print page is print-oriented; on-screen `max-width:760px`, fine. `.pi-meta` 2-col (`:170`) acceptable.

### Network
- `NetworkClient.tsx:96` — 7-col `GRID`, rows overflow horizontally.
- `NetworkClient.tsx:445-446` — custom topbar `height:52` title + tab strip + actions on one inline row; tab strip overflows.
- `NetworkClient.tsx:565-567` — search box fixed `width:200`.
- `NetworkClient.tsx:922` — bulk bar `fixed bottom-7 left-1/2 -translate-x-1/2` (desktop centering).
- `ContactDetailPanel` / `OrganizationDetailPanel` — fixed scrim panels offset by `calc(56px+32px)`; native `datetime-local` inputs.

### Outreach
- `OutreachClient.tsx:425-426` — left nav rail fixed `width:188`, no collapse.
- `PipelineBoard.tsx` — kanban columns fixed `width:210` (`DroppableColumn:440`, `MetaColumn:862`) inside `overflowX:auto`; ~1.5 cols visible on phone.
- `LeadsBoard.tsx:225` — columns `minWidth:200 width:220`, horizontal scroll.
- `PipelineBoard.tsx:1024` — ether search `width:200`; EtherSection cards `width:210`.
- `TargetDetailPanel.tsx:869-885` — scrim panel fixed offsets + 268px left sidebar; `:992-999` native `<select>`.
- dnd kanban interaction is poor on touch.

### Presence
- **Overview:** `PresenceClient.tsx:517` `repeat(4, minmax(0,1fr))` stat cards; `:593` fixed **280px right rail** (`flexShrink:0`) beside `flex:1` feed, no wrap; `:2553-2567` `whiteSpace:nowrap` tab row overflows.
- **Website (GA4):** `:834` native `<select>` property picker; desktop 22/24px padding shell.
- **Socials (Instagram):** `:1026` fixed 280px right rail; recent-posts likely fixed multi-column grid.
- **Newsletter:** `:1395` fixed 280px right rail; `:1464` `1fr 1fr` provider grid; `ConnectIntegrationModal maxWidth:420` (`:104`) fine.
- **Press:** `:386` `grid-cols-2` stat-entry grid in modal; desktop 22/24px padding shell.
- **Opportunities:** `:1747` `OppDetail` fixed **width:340 flexShrink:0** side panel (no scrim/overlay fallback); `:2383` card grid `minmax(320px,1fr)`; `:1621/1635` `MonthCalendar` `repeat(7,1fr)` with absolutely-positioned multi-day bars; `:2335` filter bar fixed 190px search; `:2142/2148` native `<select>`/`date` in `SuggestListingModal`.

### Projects
- `ProjectDetailPanel.tsx:1919-1920` — left rail fixed `width:252`; `:1909-1910` `left=calc(var(--sidebar-width,52px)+32px)`, `right=32`.
- `ProjectsClient.tsx:355-359` — cards `flex '0 0 280px'`, `width 280 height 216` in non-wrapping horizontal scroll rows (row container `height 220` at `:336`); `:383` ghost tile 200px.
- `NewProjectModal.tsx:171,187,219,229,242` — `'1fr 1fr 1fr'` / `'1fr 1fr'` grids, no breakpoint (modal `maxWidth 520`).
- `OptionsMenu.tsx:61` — dropdown `width 340`; `CanvasEditor` content `maxWidth 760` + 60px horizontal padding (`ProjectDetailPanel.tsx:551`).
- `DatePillField` / `TaskDatePicker` dropdowns fixed `232/220/222px`, right-anchored — can clip off-screen.

### Tasks
- `TasksClient.tsx:1219-1223` — sidebar fixed `width:196 flexShrink:0`, always beside the list; no collapse/drawer.
- `TasksClient.tsx:1216` — body `flex` row (sidebar + main) `overflow hidden`, no responsive stacking.
- `TaskRow` (`:677-831`) — checkbox + title + target pill + link picker + date + priority in one non-wrapping row, fixed `maxWidth`s (target pill 160 `:761`, link picker 180 `:339`).
- `InlineLinkPicker` dropdown `width 300` (`:356`); `InlineDatePicker` `width 220` (`:165`) — can clip off-screen.
- `TasksOptionsMenu.tsx:45` — dropdown `width 260`, right-anchored.
- `:1269-1329` — horizontal row of sort pills crowds a narrow header.

### Notes
- `NotesClient.tsx:1510` — hard-coded **250px left rail** (`width:250 flexShrink:0`), no collapse.
- `NotesClient.tsx:1506,1648` — three-pane `flex` row, no wrap/stack; no `@media`/`matchMedia` in module.
- `NotesClient.tsx:694` — editor `max-width 720` + 64px horizontal padding (128px total) — unworkable under ~400px wide.
- `NotesClient.tsx:1335+` — 52px topbar packs Delete + Pin + Share + options + Import + New note inline, no overflow handling.
- `NotesClient.tsx:1629` — folders as fixed `1fr 1fr` grid inside the 250px rail.
- Dropdowns fixed widths (`InlineLinkPicker 300` `:234`, share popover `220` `:1414`); `SuggestTasksModal width:460` (`:482`) exceeds small-phone width (no `max-width:100vw`).

### Resources
- `ResourcesClient.tsx:937` — hard-coded **204px left rail** (`width:204 flexShrink:0 borderRight`), no collapse.
- `ResourcesClient.tsx:1913` — top-level `flex h-full overflow-hidden` rail + content, no `@media`/`matchMedia`.
- Card grids: pillar `minmax(330px,1fr)` (`:2069`); file grids `minmax(180px,1fr)` (`:1393/1489/2000`).
- `ResourcesClient.tsx:1932` — topbar `height:52` title + view toggle + Add link inline.
- `SetupModal`/`AddLinkModal` — fixed centered overlays with `AshInlineChat`, desktop-tuned sizing.
- Drag-drop upload overlay (`position:absolute inset:12`) — touch can't drag-drop files.
- New-folder inline input `width:170` (`:1428`) inside the 204px rail.

### Home / Dashboard — acceptable
- `app/(app)/page.tsx:176` — `overflow-y-auto md:overflow-hidden`; auto-fit `minmax(280px,1fr)` (`:187,196`) forces single-column stacking on mobile (acceptable).
- Topbar action buttons (Quick note / New project / QuickTimer) non-wrapping, can crowd.

### Settings
- `settings/page.tsx:697` — left nav hardcoded `width:200` with `flex flex-1 overflow-hidden` parent — two fixed columns, no responsive collapse.
- `:718` — content `maxWidth 560` + 32/40px padding, fine, but the rail steals 200px.
- `:965` — `grid-cols-2` / `2fr 1fr 1fr` address grids don't collapse.
- Fixed inner blocks: BrandColorField hex input `width 140` (`:250`), Drive picker category select `width 150` (`:2402`); `DrivePickerModal maxHeight 82vh`.

### Onboarding
- Wizard centered `maxWidth 560` (good); step 3 `gridTemplateColumns 1fr 1fr` / `2fr 1fr 1fr` (`:750,792,806,811,914,937`) don't collapse.
- Botanical accents `width 620/460` absolutely positioned (`:578,634`) — `overflow hidden`, mostly safe. `panelStyle` padding `36/40px` generous for phones.

### Admin / Curate
- Listing/suggestion rows — flex rows with action icons + status chips, no wrap.
- `EditModal` — `flex gap-3` two-up field rows don't stack.
- Native `<select>`/`<input type=date>` (`appearance:auto`).

### Ash (AI assistant)
- `AshDock` is full-width (`left: var(--sidebar-width)`, `right: 0`, `bottom: 0`): on mobile `--sidebar-width` resolves to 52px so the dock spans nearly the full screen — an improvement over the old 360px corner panel. No known overflow issues with the current layout.
- `AshPanel.tsx` (hardcoded 360/680px width) and `AshChatView` are now **unused** — retained only for rollback; their dimension constraints are no longer a live mobile concern.

### Tour / Onboarding walkthrough
- `DashboardTour` callout `W=320`, clamped via `getBoundingClientRect` — mostly mobile-safe, but anchors to desktop `[data-tour-step]` sections.
- `TourCallout width 250` anchored to a sidebar nav item (`data-tour-key`) — **the sidebar is `md:flex`, so on mobile the callout has no anchor and won't render.**
- `GettingStartedWidget` lives inside the desktop Sidebar only → **no mobile equivalent.**

---

## 7. Prioritized remediation plan

Ordered by impact-per-effort. Items 1–2 unblock the most surfaces at once.

| # | Priority | Action | Touch points |
|---|---|---|---|
| 1 | **Highest** | **Fix the scrim/detail-panel pattern.** Below `md`, render full-screen (`left:0/right:0/top:0/bottom:0`, ignore `--sidebar-width`) and **stack the inner 252px rail above the scrollable content** (or collapsible drawer). Fixes Network, Projects, Outreach in one move. Consider extracting a shared `<ScrimPanel>` into `components/ui/` with a responsive mode. | `ContactDetailPanel.tsx:1217`, `OrganizationDetailPanel.tsx`, `ProjectDetailPanel.tsx:1920`, `TargetDetailPanel.tsx` |
| 2 | **Highest** | **Guard `--sidebar-width` for mobile.** Set it to `0px` below `md` (or stop using it for panel offsets) so overlays stop inheriting the wrong inset. | `Sidebar.tsx:138-143` |
| 3 | High | **Make the Network table responsive.** Below `md`, drop the 7-col `GRID` and render each contact/org as a stacked card; or at minimum wrap in `overflow-x-auto` with a `minWidth` so it scrolls instead of crushing. | `NetworkClient.tsx:96/701/780/843` |
| 4 | High | **Add single-column fallbacks to modal/form grids.** Switch `'1fr 1fr 1fr'`/`'1fr 1fr'` and `grid-cols-2` rows to one column below `sm`. Modals already shrink correctly, so this is the only internal work. | `NewProjectModal.tsx:171/187/219/229/242`, `NewContactModal.tsx:186/204/218/232` |
| 5 | High | **Reduce desktop-only horizontal padding** on detail bodies (`36px 60px 80px` = 120px horizontal, `maxWidth:760`) — clamp padding to ~16-20px below `md`. | `ProjectDetailPanel.tsx:551`, `ContactDetailPanel.tsx:266` |
| 6 | High | **Give Calendar a dedicated mobile view.** Below `md`, default to a single-column agenda/list view; move calendar sources into a sheet/drawer instead of a persistent rail. (Note: drag-create has no touch handlers — needs touch events or a tap-to-create fallback.) | `CalendarClient.tsx:1246+/2098`, `CalendarSourcesPanel.tsx` |
| 7 | Medium | **Collapse Presence stat/table grids** (`repeat(4,1fr)`, fixed 72/40px tracks, 280px right rails) to 2-up or stacked rows below `md`. | `PresenceClient.tsx:517/593/1009/1015/1026/1035/1395/1747` |
| 8 | Medium | **Stack/drawer-ize the Resources, Notes, Tasks side rails** on mobile. | `ResourcesClient.tsx:937`, `NotesClient.tsx:1510`, `TasksClient.tsx:1219` |
| 9 | Medium | **Establish a shared breakpoint convention.** Add a small `useIsMobile()`/`useMediaQuery()` hook (`matchMedia`) so inline-styled components can branch; standardize on `md` (the breakpoint the shell already uses). **Keep native select/date inputs.** | new hook in `lib/` or `components/`; consumed app-wide |
| 10 | Low | **Verify viewport clamping** on all `position:absolute` / `window.innerWidth`-clamped popovers — the clamp math exists but was tuned for desktop widths and may open off-screen on a phone. | `ProjectDetailPanel` dropdowns, `CalendarSourcesPanel` menus, `TaskQuickEditPopover`, tour tooltips, Tasks/Notes inline pickers |

### Cross-cutting notes for the pass
- **Standardize on the `md` breakpoint** the shell already uses; avoid introducing new breakpoints ad-hoc.
- **Prefer a shared `<ScrimPanel>` primitive** in `components/ui/` over per-module fixes — the pattern is duplicated across four panels.
- **Keep native `<select>`/`<input type=date|time>`** — they are the correct mobile affordance even though they're a desktop design-system mismatch.
- **Touch interactions** (kanban dnd, calendar drag-create, drag-drop file upload) are mouse-only today and need touch handlers or non-drag fallbacks — track separately from layout work.
- **Tour on mobile:** `TourCallout` and `GettingStartedWidget` are anchored to the desktop sidebar and have no mobile equivalent — either anchor to `MobileNav` or suppress on mobile.
