# Perennial Design System & UI Architecture

This document is the reference for making **app-wide UI changes** in the Perennial app. It covers design tokens, the styling convention, shared primitives in `components/ui/`, native-input inconsistencies, the scrim/detail-panel pattern, and — most importantly — the **Duplication Registry**: UI implemented in multiple places that must be changed in lockstep.

> Scope note: All facts below are drawn from a structural audit of the codebase. File paths are relative to the repo root unless otherwise noted.

---

## 1. Styling Convention

Perennial uses **Tailwind v4 with a CSS-first config** — there is **no `tailwind.config.js`**. All design tokens live in `app/globals.css` inside an `@theme inline { ... }` block (PostCSS plugin `@tailwindcss/postcss`, configured in `postcss.config.mjs`).

Despite Tailwind being available, the **actual styling convention in nearly every shared primitive and feature component is inline styles referencing CSS variables**, e.g.:

```jsx
style={{ background: "var(--color-sage)", borderRadius: 8 }}
```

Key facts:

- Every file in `components/ui/` **except `VisitButton`** (which mixes one `className` with inline style) is pure inline-style.
- **Hover/focus states are hand-rolled** via `useState` + `onMouseEnter`/`onMouseLeave`, or by mutating `e.currentTarget.style.background`.
- Tailwind utility classes appear only in a **minority of surfaces** — notably `app/(app)/settings/page.tsx` (`className="w-full px-3 py-[7px] ..."`), the scheduling components (custom CSS classes like `sl-input`/`sl-time` plus a few utilities), `app/signup` + `app/onboarding`, and `components/admin/AdminClient.tsx`.

**The codebase is a mix, heavily skewed to inline-styles-with-CSS-vars**, with islands of Tailwind/custom-CSS-class styling in newer/auxiliary screens.

### Magic numbers warning

Many components hardcode radii (`8`, `12`, `9999`) and font sizes (`10`/`11`/`12`/`13`) as **raw numbers** rather than referencing the `--radius-*` / `--text-*` tokens — even though those tokens exist. When changing the scale, grep for raw numbers as well as token references.

### Dark mode

Dark mode is handled **purely at the token layer** (`prefers-color-scheme` + `[data-theme="dark"]`/`[data-theme="light"]` overriding the same `--color-*` vars). Inline styles **automatically theme as long as they use vars**.

> ⚠️ **Raw hex values do NOT theme.** Hardcoded hex like `#4a5630`, `#6b6860`, `#5d6b3d` sprinkled in `EmptyState`, `VisitButton`, and `AshPromptsModule` stay fixed in dark mode. Replace these with vars when touching dark-mode behavior.

---

## 2. Design Tokens

All tokens are defined in `app/globals.css` `@theme inline` (lines ~4–88). Dark mode overrides ~17 color vars + all 5 shadows via `@media (prefers-color-scheme: dark)` and `[data-theme=dark]`; `[data-theme=light]` forces light. `globals.css` also ships **8 `@keyframes` for Ash** (`ash-glow`/`shimmer`/`think`/`dot`/`stream`/`wave`/`ring`) and full `.ash-md` (markdown) + `.ProseMirror` (Tiptap) typography stylesheets.

### Brand colors

| Token | Value |
|---|---|
| `--color-charcoal` | `#1f211a` |
| `--color-sage` | `#9BA37A` |
| `--color-warm-white` | `#f9faf4` |
| `--color-off-white` | `#fffefc` |
| `--color-cream` | `#eff0e7` |
| `--color-grey` | `#9a9690` |

### Status / semantic colors

| Token | Value |
|---|---|
| `green` | `#8dd047` |
| `warm-yellow` | `#e8c547` |
| `orange` | `#e8850d` |
| `red-orange` | `#dc3e0d` |
| `blue` | `#2563ab` |
| `blue-bg` | `rgba(37,99,171,0.10)` |

### Surface colors

| Token | Maps to |
|---|---|
| `background` | warm-white |
| `foreground` | charcoal |
| `surface` | off-white |
| `surface-app` | warm-white |
| `surface-raised` | off-white |
| `surface-sunken` | cream |

### Text colors

| Token | Value |
|---|---|
| `text-primary` | charcoal |
| `text-secondary` | `#6b6860` |
| `text-tertiary` | grey |

### Borders & interactive

| Token | Value |
|---|---|
| `border` | `rgba(31,33,26,0.10)` |
| `border-strong` | `rgba(31,33,26,0.20)` |
| `sage-hover` | `#adb886` |
| `focus-ring` | `rgba(155,163,122,0.35)` |

### Sidebar colors

`sidebar-bg` / `hover` / `active`, plus a parallel set of runtime `--sidebar-*` vars (`text`, `text-active`, `text-hover`, `active-bg`, `hover-bg`, `divider`, `icon`, `soon-text`, `soon-bg`) redefined per theme.

### Ash colors

| Token | Value |
|---|---|
| `ash` | `#9BA37A` |
| `ash-dark` | `#4a6232` |
| `ash-mid` | `#6b8a4e` |
| `ash-tint` | `rgba(155,163,122,0.10)` |
| `ash-border` | `rgba(155,163,122,0.28)` |
| `ash-glow` | `rgba(155,163,122,0.50)` |

### Radii

| Token | Value |
|---|---|
| `sm` | `6px` |
| `md` | `8px` |
| `lg` | `12px` |
| `xl` | `16px` |
| `2xl` | `20px` |
| `full` | `9999px` |

### Shadows

| Token | Value |
|---|---|
| `sm` | `0 1px 2px rgba(0,0,0,0.05)` |
| `card` | `0 1px 4px rgba(0,0,0,0.07), 0 0 0 0.5px rgba(0,0,0,0.07)` |
| `md` | `0 4px 16px rgba(0,0,0,0.10)` |
| `lg` | `0 8px 32px rgba(0,0,0,0.14)` |
| `overlay` | `0 16px 48px rgba(0,0,0,0.20)` |

### Fonts

| Token | Value |
|---|---|
| `display` | `var(--font-newsreader), Georgia, serif` |
| `sans` | `var(--font-albert-sans), system-ui, sans-serif` |

### Type scale

| Token | Value |
|---|---|
| `xs` | `10px` |
| `sm` | `11px` |
| `base` | `12px` |
| `md` | `13px` |
| `lg` | `14px` |
| `xl` | `15px` |
| `2xl` | `18px` |
| `3xl` | `22px` |
| `4xl` | `28px` |
| `5xl` | `36px` |

---

## 3. Shared Primitives (`components/ui/`)

| Name | File | Purpose | Used by |
|---|---|---|---|
| **Badge** | `components/ui/Badge.tsx` | Pill/tag, 8 color variants (success, in-progress, warning, alert, neutral, info, sage, amber); 10px bold uppercase, full-radius. | **DEAD — 0 importers.** Meanwhile ~29 files hand-roll their own pill/chip markup inline. |
| **Button** | `components/ui/Button.tsx` | Primary action button. 5 variants (primary/dark/secondary/ghost/danger) × 3 sizes (sm/md/lg), `useState` hover, all inline style. | **7 files**: ProjectsClient, ImportContactsModal, ImportNoteModal, NotesClient, NewProjectModal, FinanceClient, OutreachClient. Most other screens hand-roll `<button>`. |
| **Checkbox** | `components/ui/Checkbox.tsx` | Custom 16px square checkbox (div + inline SVG check), sage when checked. | **1 file**; native `<input type=checkbox>` used in 7 places instead. |
| **ConfirmDialog** | `components/ui/ConfirmDialog.tsx` | Modal confirm/cancel, danger\|primary tone, Escape-to-close, scrim + scale-in. | **Widely used — 12 files.** |
| **DatePicker** | `components/ui/DatePicker.tsx` | Custom calendar-grid date picker, click-outside close, sage selected/today states. | **9 files**; native `<input type=date/datetime-local>` still in ~10 places. |
| **EmptyState** | `components/ui/EmptyState.tsx` | Centered empty-state: icon tile, display-font heading, body, optional numbered tips card, primary/secondary CTA, and "Ask Ash" button (dispatches `open-ash`). Re-implements button markup inline. | **Widely used — 12 files.** |
| **FilterTabs** | `components/ui/FilterTabs.tsx` | Segmented-control tab group, sage-tinted track, optional counts. | **2 files only**; many views build their own tab rows inline. |
| **Menu** | `components/ui/Menu.tsx` | Generic dropdown menu (items + dividers, icons, danger, badge, external link). Caller owns positioning + click-outside. | **3 files**; many kebab menus hand-rolled. |
| **NumberStepper** | `components/ui/NumberStepper.tsx` | −/value/+ stepper with min/max/step, prefix/suffix. | **1 file.** |
| **RichEditor** | `components/ui/RichEditor.tsx` | Tiptap/ProseMirror engine (36KB). Exports `getRichExtensions`, `RichToolbar`, `SelectionBubble`, `InlineAsh` + `InlineAshPopover`, `ToggleBlock` & `ImageUploadPlaceholder` nodes, image upload, `submitInlineAsh`. The shared "press Space to ask Ash" surface. | **7 importers**: home/NotesCard, projects/ProjectDetailPanel, network/ContactDetailPanel, network/OrganizationDetailPanel, notes/NotesClient, outreach/TargetDetailPanel, ash-inline API route. **Note:** NotesClient uses `getRichExtensions` but ships its own `FormatToolbar` (see Duplication Registry). |
| **Select** | `components/ui/Select.tsx` | Custom dropdown select (button trigger + absolute option list, click-outside, sage focus ring + checkmark). | **14 files** (mostly finance); ~18 native `<select>` still exist — the biggest consistency gap. |
| **Toggle** | `components/ui/Toggle.tsx` | 36×20 on/off switch, sage when on. | **2 files.** |
| **VisitButton** | `components/ui/VisitButton.tsx` | Small green "Visit" pill link (Next `Link` + `ArrowUpRight`) for home cards. One `className` + inline styles + **raw hex** (`#5d6b3d`/`#4a5630`) — **does not theme in dark mode.** | **8 files** (home dashboard cards). |
| **AshPromptsModule** | `components/ui/AshPromptsModule.tsx` | Sage-tinted Ash panel for detail-panel rails: headline + primary/secondary prompts + inline "Ask Ash" input; dispatches `open-ash` with context. Uses **raw hex greens** (`#4a5630`/`#3d4a26`/`#7d9456`). | **4 detail panels**: ProjectDetailPanel, ContactDetailPanel, OrganizationDetailPanel, TargetDetailPanel. |
| **AshMark** | `components/ui/AshMark.tsx` | Inline Ash logomark (`/Ash-Logomak.svg`) with on-dark/on-light variant + optional shimmer. The shared Ash glyph. | EmptyState, AshPromptsModule, CanvasAshHint, Ash chat surfaces. |
| **CanvasAshHint** | `components/ui/CanvasAshHint.tsx` | First-run charcoal toast inside canvas editors teaching "press Space to ask Ash"; persists dismissal in `localStorage`. | **3 canvas detail panels**: ProjectDetailPanel, ContactDetailPanel, OrganizationDetailPanel. |

### Adoption summary

- **Well-shared:** the rich-text editor extensions + inline-Ash path (every canvas routes through `getRichExtensions`/`submitInlineAsh`), `ConfirmDialog`, `EmptyState`, `DatePicker` (where modules opt in).
- **Under-adopted (exist but bypassed):** `FilterTabs` (2/~10 list clients), `Select`/`Menu` (bespoke dropdowns coexist), `DatePicker` (panels ship custom calendars), `Badge` (**0 importers — dead**).

---

## 4. Native-Input Inconsistencies

Custom primitives exist for selects, dates, and checkboxes, but native HTML inputs are still used in many places — **against the design system** (tracked in MEMORY's `feedback_ui_polish` backlog). When restyling form controls, these are the bypass sites to migrate.

### Native `<select>` (custom `Select` exists but bypassed)

| File:line |
|---|
| `components/scheduling/BookingClient.tsx:281` |
| `components/calendar/EventCard.tsx:730`, `:916` |
| `components/scheduling/SchedulingLinkModal.tsx:200` (`sl-input`), `:255`, `:261` |
| `components/network/NewContactModal.tsx:237`, `:245` |
| `components/presence/PresenceClient.tsx:834`, `:1993`, `:2142` |
| `components/admin/AdminClient.tsx:196`, `:208` |
| `components/outreach/TargetDetailPanel.tsx:993` |
| `components/outreach/NewTargetModal.tsx:298` |
| `app/(app)/settings/page.tsx:189` |
| `components/outreach/PipelineBoard.tsx:688` |
| `app/onboarding/OnboardingClient.tsx:355` |

### Native `<input type=date / datetime-local>` (custom `DatePicker` exists but bypassed)

| File:line |
|---|
| `components/scheduling/SchedulingLinkModal.tsx:240`, `:273` |
| `components/calendar/EventCard.tsx:976` |
| `components/network/OrganizationDetailPanel.tsx:423` (datetime-local) |
| `components/network/ContactDetailPanel.tsx:458` (datetime-local) |
| `components/admin/AdminClient.tsx:200`, `:201`, `:203` |
| `components/presence/PresenceClient.tsx:2148` |
| `components/outreach/TargetDetailPanel.tsx:335` |
| `components/outreach/NewTargetModal.tsx:473` |

### Native `<input type=checkbox>` (custom `Checkbox` exists but bypassed)

| File:line |
|---|
| `components/scheduling/SchedulingLinkModal.tsx:220`, `:270` |
| `components/calendar/EventCard.tsx:628` |
| `components/finance/AddExpenseModal.tsx:219` |
| `components/finance/ManualTransactionModal.tsx:189` |
| `app/(app)/settings/page.tsx:2353` |
| `components/finance/BankingTab.tsx:2481` |

### Native `<input type=color>` (no custom primitive)

| File:line |
|---|
| `app/(app)/settings/page.tsx:243` (brand-color swatch picker) |

---

## 5. The Scrim / Detail-Panel Pattern

**There is NO shared scrim component.** The pattern is reimplemented top-to-bottom in all four detail panels. Any app-wide change to the overlay (backdrop opacity/blur, inset math if the Sidebar width changes, maximize animation, z-index, top-bar controls) **must be edited in all four files in lockstep.**

| Panel | File | Lines | Scrim+panel approx. |
|---|---|---|---|
| Project | `components/projects/ProjectDetailPanel.tsx` | 2155 | ~1896–1913 |
| Contact | `components/network/ContactDetailPanel.tsx` | 1643 | ~1212–1226 |
| Organization | `components/network/OrganizationDetailPanel.tsx` | 1341 | ~1044–1056 |
| Target | `components/outreach/TargetDetailPanel.tsx` | 1161 | ~862–879 |

### The scaffold (byte-for-byte consistent across all four)

- **Scrim:** `<div className="fixed inset-0 z-10 ...">` with `background: "rgba(20,18,16,0.52)"`, `backdropFilter: "blur(5px)"`, click-to-close, hidden when maximized.
- **Panel shell:** `fixed z-20 flex overflow-hidden`, inset `top:52px / bottom:32px / left:calc(56px+32px) / right:32px` (**the +56px accounts for the Sidebar rail**), `borderRadius: maximized ? 0 : 12`, `boxShadow: "0 8px 40px rgba(0,0,0,0.22)"`, and a `transition` on `top/bottom/left/right/border-radius 0.2s ease` for the maximize animation.
- **State:** each panel independently owns `const [maximized, setMaximized]` and `const [settingsOpen, setSettingsOpen]`, plus the `Maximize2`/`Minimize2`/`X` top-bar control cluster (`maximized` appears ~12–13×, `settingsOpen` ~8× per panel) and a left-sidebar / right-tabbed-content split.

### Drift is in CONTENT, not shell

Each panel was cloned from the previous (comments in the Network panels literally say "matches project panel style" and "matches ContactDetailPanel"). What differs:

- **Tab sets:** Project → canvas/tasks/notes/files/contacts; Contact & Org → canvas/activity/tasks/notes/files; Target → canvas/activity/tasks/people/notes/files (Activity/Tasks/Notes/Files wrap the linked Contact/Org).
- **Left-sidebar identity/details blocks** differ per entity.

This is the **"Scrim Card Pattern"** flagged in MEMORY (`project_scrim_card_pattern.md`) as a candidate for a portable primitive — still unaddressed.

> **Recommended fix:** Promote a single `<DetailPanelShell>` to `components/ui/` that owns the scrim, fixed-inset math (with one `SIDEBAR_WIDTH` constant), maximize/minimize/close + settings top-bar, and z-index, taking `{ sidebar, tabs, activeTab, content }` slots.

---

## 6. Form / Input Pattern

The app's editing convention is **"inline click-to-edit field rows," NOT modal forms**, inside the detail panels.

A row = a fixed `0.5px` border-bottom flex line with an `11px` grey label, and a value that swaps between a click-to-edit `<span>` (`#6b6860`) and a borderless `<input>`/`<textarea>` with a sage focus underline; commit on blur/Enter, cancel on Escape.

**Consistent look, inconsistent code** — there are two divergent prop contracts:

| Variant | Contract | Notes |
|---|---|---|
| Project panel `EditableField` | `{label, display, editDefault, inputType?: text\|number\|date, onSave(raw)}` | Value-formatting lives in the caller; supports date (renders `DatePillField`) and number. |
| Network/Outreach `EditableField` | `{label, value, placeholder, onSave(string\|null)}` | Null-coalescing built in; Network's two copies are identical; Outreach adds `isLink`. |

**UX divergence:** Network panels open a blank field **directly into an input** (`showInput = editing || !value`), while Project/Outreach require a click on the em-dash first.

Dedicated **new-entity creation uses real modals** (`NewProjectModal`, `NewContactModal`), separate from the inline-edit panels.

> **Recommended fix:** Collapse to a single `components/ui/EditableField` supporting `text | number | date | link | multiline` with the `value`/`onSave(null)` contract and the "empty opens directly" behavior, so every scrim edits identically.

---

## 7. Duplication Registry — Change in Lockstep

These are the UI fragments implemented in multiple places. **Edit every listed location together** until they are consolidated.

### 7.1 Detail-panel shell / scrim chrome

The scrim + panel shell + maximize/close/settings top-bar (see §5).

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx` (~1896) |
| `components/network/ContactDetailPanel.tsx` (~1212) |
| `components/network/OrganizationDetailPanel.tsx` (~1044) |
| `components/outreach/TargetDetailPanel.tsx` (~862) |

Identical fixed-overlay markup, inset math (note the **+56px Sidebar offset**), `rgba(20,18,16,0.52)`/`blur(5px)` backdrop, `0 8px 40px` shadow, `0.2s` maximize transition, `maximized`/`settingsOpen` state. → Promote `<DetailPanelShell>`.

### 7.2 EditableField (single-line inline edit row)

**FOUR implementations, TWO prop contracts** (see §6).

| Location | Contract |
|---|---|
| `components/projects/ProjectDetailPanel.tsx:306` | `{display, editDefault, inputType}` (handles date/number) |
| `components/network/ContactDetailPanel.tsx:91` | `{value, onSave}` |
| `components/network/OrganizationDetailPanel.tsx:73` | literal copy of Contact's (comment says so) |
| `components/outreach/TargetDetailPanel.tsx:267` | `{value, onSave}` + `isLink` variant |

Styling (`0.5px` border-bottom row, `11px` grey label, sage focus underline, `#6b6860` value) is identical. → Consolidate to ONE `components/ui/EditableField`.

### 7.3 EditableTextarea / EditableDescription (multi-line inline edit)

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx:412` (`EditableDescription`) |
| `components/network/OrganizationDetailPanel.tsx:111` (`EditableTextarea`) |

Same click-to-edit textarea-with-sage-border pattern, two names. → Fold into `EditableField` as a `multiline` mode.

### 7.4 Rich-text formatting toolbar

Bold/Italic/Underline/Strike/H1/H2/lists/toggle/image + Generate-tasks.

| Location | Role |
|---|---|
| `components/ui/RichEditor.tsx:439` | `RichToolbar` — **canonical export** |
| `components/notes/NotesClient.tsx:291` | `FormatToolbar` — **near-verbatim copy** |

`FormatToolbar` duplicates `RichToolbar` almost exactly: same `useEditorState` selector (8 identical `isActive` keys), same inner `btn()`/`sep()` helpers, same button markup and image-picker input. Only diffs: a `data-tour-target="notes.format-toolbar"` attribute and `transition:'all 0.08s'` on buttons. `NotesCard` (`components/home/NotesCard.tsx:86`) correctly uses the shared `RichToolbar`. → **Delete `FormatToolbar`**, add a `tourTarget` prop to `RichToolbar`. **Any new formatting button must currently be added in BOTH.**

### 7.5 Per-panel NotesTab / TasksTab / ActivityTab / FilesTab

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx:874` `ProjectTasksTab`, `:1115` `NotesTab`, `:1261` `FilesTab`, `:1429` `ContactsTab` |
| `components/network/ContactDetailPanel.tsx` inline `TasksTab` / `NotesTab` |
| `components/network/OrganizationDetailPanel.tsx` inline `TasksTab` / `NotesTab` |

**Partly resolved.** Shared entity-agnostic tabs now live in `components/detail/`: `EntityTasksTab`, `EntityNotesTab`, `EntityFilesTab`, and `EntityActivityTab` — each takes a `{fkColumn, id}` link descriptor (+ optional controlled state). The Outreach `TargetDetailPanel` uses all four; `ContactDetailPanel`/`OrganizationDetailPanel` use the shared `EntityActivityTab` but still have their own inline `TasksTab`/`NotesTab`/`FilesTab`. → Remaining: migrate the network panels' Tasks/Notes/Files onto the shared components, and fold `ProjectDetailPanel`'s copies in too.

### 7.6 Task date-picker / priority-picker / due-chip helpers

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx:605` `TaskDatePicker`, `:702` `TaskPriorityPicker`, `:586` `getDueChipLabel`, `:596` `getDueChipColor` |
| `components/tasks/TasksClient.tsx:461` `PriorityPicker` |

The project panel has its OWN calendar-popover `TaskDatePicker` + `TaskPriorityPicker` that duplicate (with drift) `TasksClient`'s. Due-date thresholds/colors (Overdue/Today/Tomorrow/Nd) are reimplemented. → Promote a shared `TaskDuePicker` + `PriorityPicker` + `dueChip()` util (route through the existing `DatePicker`).

### 7.7 Calendar / date-picker popovers

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx:149` `DatePillField`, `:605` `TaskDatePicker` |
| `components/outreach/TargetDetailPanel.tsx:316` `DateField` (native input) |
| `components/ui/DatePicker.tsx` — the actual shared primitive (9 importers) |

`DatePicker` exists and is used in 9 places, yet the Project panel ships two bespoke month-grid popovers and Target ships a native-input `DateField`. → Migrate these to `components/ui/DatePicker`.

### 7.8 Dropdown menu / popover shell

Absolute-positioned card with border, radius, shadow, hover rows.

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx:115` (`CustomSelect` dropdown) + the TaskPriorityPicker/DatePicker drops |
| `components/network/ContactDetailPanel.tsx:1277, :1294, :1344, :1423` (four inline dropdowns) |
| `components/ui/Menu.tsx` + `components/ui/Select.tsx` — the shared primitives (3 and 14 importers) |

Same `var(--color-surface-raised)` + `0.5px solid var(--color-border)` + `borderRadius ~10` + `0 4px 20px rgba(0,0,0,0.12)` card with hover-highlight rows, hand-rolled repeatedly despite `Menu`/`Select`. → Route bespoke dropdowns through `Select`/`Menu`.

### 7.9 Chip/tag color helpers & status/stage config maps

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx:12` `chipBg`/`optionTagStyle` |
| `components/network/ContactDetailPanel.tsx:16` `TAG_COLORS`/`tagStyle`, `:31` `STATUS_CONFIG`, `:38` `LEAD_STAGE_CONFIG` |
| `components/ui/Badge.tsx` — **0 importers (dead)** |

Pill/chip rendering is hand-styled inline per module with per-module color maps; `Badge` has zero importers. → Either adopt `Badge` for chips or delete it. A shared `chipStyle(color)` util would centralize the `rgba(...,0.10–0.18)` soft-bg convention used everywhere.

### 7.10 Ask-Ash button markup + `open-ash` dispatch

| Location |
|---|
| `components/ui/EmptyState.tsx` (inline "Ask Ash" button + `ASH_GRADIENT` avatar) |
| `components/ui/AshPromptsModule.tsx` (re-declares the same `ASH_GRADIENT`/avatar + Ash send buttons) |

Both also re-declare the `open-ash` `CustomEvent` dispatch helper rather than sharing one. → Extract a shared Ask-Ash button + a single `openAsh()` dispatch helper.

### 7.11 Date / relative-time formatting helpers

`fmtDate`/`fmtTime`/`timeAgo`/`fmt` — `timeAgo`/`fmtDate`/"Today/Yesterday/Nd ago" re-declared in **~13 files** with subtle threshold differences.

| Location |
|---|
| `components/projects/ProjectDetailPanel.tsx` |
| `components/network/ContactDetailPanel.tsx` |
| `components/network/OrganizationDetailPanel.tsx` |
| `components/outreach/TargetDetailPanel.tsx` |
| `components/notes/NotesClient.tsx` |
| `components/home/NotesCard.tsx` |
| `components/calendar/CalendarClient.tsx` |
| `components/calendar/EventCard.tsx` |
| `components/presence/PresenceClient.tsx` |
| `components/finance/InvoicesTab.tsx` |
| `components/ash/AshPanel.tsx` |

→ Extract `lib/format/date.ts`.

### 7.12 Field (label + form row) wrapper

Redefined **FOUR times** with the same shape; no shared `FormField` primitive.

| Location |
|---|
| `components/scheduling/SchedulingComposePanel.tsx:347` |
| `components/scheduling/BookingClient.tsx:370` |
| `components/admin/AdminClient.tsx:219` |
| `app/signup/page.tsx:23` |

→ Promote a shared `FormField`.

### 7.13 Module list filter rows

`FilterTabs` exists but only **2 of ~10** list clients use it.

| Location | Uses FilterTabs? |
|---|---|
| `components/ui/FilterTabs.tsx` | shared (importers: ProjectsClient, NetworkClient) |
| `components/tasks/TasksClient.tsx` | no — hand-rolled |
| `components/calendar/CalendarClient.tsx` | no |
| `components/resources/ResourcesClient.tsx` | no |
| `components/notes/NotesClient.tsx` | no |
| `components/presence/PresenceClient.tsx` | no |
| `components/finance/FinanceClient.tsx` | no |
| `components/outreach/OutreachClient.tsx` | no |
| `components/admin/AdminClient.tsx` | no |

→ Standardize all list filters on `FilterTabs` (extend it for counts/icons if needed).

### 7.14 `Button` primitive under-adoption

`Button` is used in only **7 files**; the vast majority of screens (settings, finance modals, network, presence, scheduling, calendar) hand-roll `<button>` with repeated inline padding/radius/hover-handler boilerplate. → Migrate to `<Button>`.

### 7.15 Click-outside-to-close logic

`useRef` + `useEffect` mousedown listener copy-pasted in `Select.tsx`, `DatePicker.tsx`, and many feature components. → Extract a `useClickOutside` hook.

---

## 8. Properly Centralized (leave as-is)

### Inline-Ash surface plumbing — GOOD

| Location |
|---|
| `components/ui/RichEditor.tsx` (`InlineAshSurface` type, `InlineAshPopover`, `submitInlineAsh`, `SelectionBubble` — canonical path) |
| `components/projects/ProjectDetailPanel.tsx` `CanvasEditor` |
| `components/network/ContactDetailPanel.tsx` `ContactCanvasEditor` |
| `components/outreach/TargetDetailPanel.tsx` `EntityCanvasEditor` |
| `components/notes/NotesClient.tsx` |

Each canvas editor wraps the shared `submitInlineAsh`/`InlineAshPopover`; only the surface descriptor differs. `OrganizationCanvasEditor` intentionally omits inline-Ash because `InlineAshSurface` has no `canvas-organization` variant yet (comment at `OrganizationDetailPanel.tsx:147`).

> **Adding a new inline-Ash surface** = edit the `InlineAshSurface` union + the `/api/notes/ash-inline` route, **NOT** each panel.

---

## 9. Prioritized Consolidation Backlog

1. **`<DetailPanelShell>`** in `components/ui/` — owns scrim, fixed-inset math (one `SIDEBAR_WIDTH` constant), maximize/minimize/close + settings top-bar, z-index. Kills the 4-way chrome duplication (§7.1).
2. **Unify `EditableField`** → one `components/ui/EditableField` with `{label, value, onSave(string|null), inputType?: text|number|date|link, multiline?, placeholder}` and "empty opens directly." Delete the 4–6 local copies + `EditableDescription`/`EditableTextarea` (§7.2, §7.3).
3. **Delete `FormatToolbar`** (`NotesClient.tsx:291`); use shared `RichToolbar` with a `tourTarget` prop (§7.4).
4. **Entity-agnostic `<NotesTab>`/`<TasksTab>`/`<ActivityTab>`** taking a `{column, id}` link descriptor (§7.5).
5. **Consolidate task pickers** → one `<TaskDuePicker>`, one `<PriorityPicker>`, one `dueChip(due)` util, routed through `DatePicker` (§7.6).
6. **Adopt under-used primitives** — route bespoke dropdowns through `Select`/`Menu`, migrate custom calendars to `DatePicker`, standardize filter rows on `FilterTabs` (§7.7, §7.8, §7.13).
7. **Resolve `Badge`** — adopt for chips (back it with a `chipStyle(color)` util) or delete (§7.9).
8. **Extract `lib/format/date.ts`** for `timeAgo`/`fmtDate`/`fmtTime` (§7.11).
9. **Replace remaining native `<input type=date>`/`<select>`** with `DatePicker`/`Select` per the `feedback_ui_polish` backlog (§4).
10. **Leave the inline-Ash path as-is** — it is correctly centralized in `RichEditor.submitInlineAsh` (§8).
