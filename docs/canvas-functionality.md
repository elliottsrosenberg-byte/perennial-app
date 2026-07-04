# Canvas — expected functionality (spec + QA checklist)

The spatial canvas ("board") built in PR #24 (PER-70 / PER-87 / PER-88). Status
keys: ✅ built · ⚠️ built but flagged · 🔲 deferred / open.

> None of this was runtime-tested by the implementing agent (no local env). Treat
> ✅ as "implemented + typechecks", not "verified in-app". Use this list to test.

Architecture: `components/canvas/` (`<Canvas>`, `useCanvas`, `CanvasObjectView`,
`CanvasObjectContent`, `ToolDock`, `LiveCards`, `ModuleCard`, `EntityPicker`,
`ImagePicker`, `palette.ts`, `geometry.ts`, `types.ts`), data in `lib/canvas/`
(`api`, `entities`, `live`, `modules`, `images`). DB: `canvases` +
`canvas_objects` (migration `20260703120000_canvas.sql`, owner-only RLS, applied
to staging+prod).

## Viewport & persistence
- ✅ Infinite pan: two-finger/trackpad scroll, Hand tool, Space-drag
- ✅ Zoom: ⌘/Ctrl+wheel and trackpad pinch, zoom-to-cursor, clamped
- ✅ Dot-grid background scales/pans with the view
- ✅ Per-canvas persistence; optimistic local state + debounced DB writes
- ✅ Canvas resolves by `scope` + `entityId` (server-provided on Home, client-resolved in panels); one board per (user, scope, entity)

## Tools (top dock card) + keyboard
- ✅ Select (V), Hand (H), Text (T), Sticky (N), Shape (S), Pen (P), Eraser (E)
- ✅ Hold **Space** → temporary Hand (dock highlights Hand); pans over objects too
- ✅ Active-tool highlight; Esc → select tool + clear selection
- ✅ Tool options card (right of dock): sticky colour · shape kind (rect/ellipse/line/arrow) · pen (marker/highlighter + size S/M/L + 10 ink colours)
- ✅ Eraser: drag over objects to delete

## Second dock card (Perennial objects)
- ✅ Project / Task / Note / Contact / Event → open the search picker
- ✅ Module-snapshot flyout (Tasks/Projects/Finance/Network/Notes/Calendar)
- ✅ File flyout: From computer · From files (library) · 🔲 Linked files (marked "Soon")
- ✅ Flyouts close after a selection

## Selection model
- ✅ Click to select; click empty to deselect
- ✅ Marquee drag: L→R **encloses**, R→L **touches**; live highlight during drag
- ✅ Shift-click and shift-marquee add to selection
- ✅ Multi-select group move
- ✅ Option-drag duplicates the selection
- ✅ Select-all (⌘A)
- ✅ Marquee no longer highlights page text (container `user-select: none`)

## Object interactions
- ✅ Move by dragging the body
- ✅ Resize from **4 corners + 4 edges** (N/S/E/W)
- ✅ Rotate via corner rotate-cursor zones (anchors to grab point — no jump)
- ✅ Shift-drag a corner uniformly scales box **and** font (text/sticky)
- ✅ Delete: Delete/Backspace · toolbar trash · right-click · eraser
- ✅ **Enter** re-enters edit on a selected text/sticky/box-shape (double-click also edits)
- ✅ Z-order: bring to front / send to back (right-click)

## Object types
- ✅ **Text**: rich text, auto-grows to content, drag-to-create sets font size
- ✅ **Sticky**: rich text, colour, vertical align, opaque tint
- ✅ **Shape**: rect / ellipse (opaque, hold text, vertical align) · line · arrow
- ✅ **Line/arrow**: endpoint-drag anchor handles; contextual menu = start/end arrowheads, thickness, dash (solid/dashed/dotted), colour
- ✅ **Image**: upload from computer, drag-drop, from-files library; renders; ⚠️ "drag-drop over an object" places a new image (not a true attachment)
- ✅ **Drawing (pen)**: marker / highlighter, size, 10 colours, live stroke preview
- ✅ **Reference cards (live, fetch on mount)**: project · contact/lead · note · task-list · organization(static) · event(static)
- ✅ **Module summary cards (live)**: Tasks/Projects/Finance/Network/Notes/Calendar with a ↗ open link

## Rich-text editor (floating toolbar while editing)
- ✅ Bold · Italic · Underline · **Link** (left, next to B/I/U)
- ✅ Block dropdown: H1 / H2 / H3 / P
- ✅ Bullets
- ✅ Align dropdown: left / center / right
- ✅ Vertical-align dropdown (box objects): top / middle / bottom (arrows-and-lines icons)
- ✅ Text-colour circle → palette popover
- ✅ Font size: ∨ A ∧
- ✅ Paste coerced to plain text; stores `html` + plain `text`

## Selection toolbar (non-editing, single selection)
- ✅ Text/sticky/box-shape: horizontal align + vertical align + delete
- ✅ Line/arrow: row 1 = caps + thickness + dash + delete; row 2 = colour circles (no label)
- ✅ Fill + "A" (text-colour) rows removed (fill = tool options card; text colour = editor)

## Live / interactive cards
- ✅ Project card: live progress + task preview; **double-click opens** `/projects?projectId=`
- ✅ Contact/Lead card: name, org, recent activity; **double-click opens** `/network?contactId=`
- ✅ Note card: **editable inline**, saves back to the note (debounced)
- ✅ Task card: completable **task list scoped to a project**; add new inline
- ✅ Module cards: live stats; open the module

## Power features
- ✅ Copy / Cut / Paste (⌘C / ⌘X / ⌘V) — cross-canvas via localStorage; paste keeps relative layout at viewport centre
- ✅ Convert sticky/text → **Note** (creates a real note + swaps in a live note card)
- ✅ Undo / Redo (⌘Z / ⌘⇧Z / ⌘Y) — debounced snapshots + DB reconcile; `canUndo`/`canRedo` exposed for a future button
- ✅ Right-click menus — object (copy, duplicate, convert-to-note, front/back, delete) and empty canvas (add note/text here, paste, select-all)

## Home (PER-70)
- ✅ Home is a full-page canvas; global Ash FAB + right panel hidden on `/`
- ✅ Topbar "Ask Ash"; suggestion chips (create actions); Ash chat bar (dispatches `open-ash`)
- 🔲 Presence chips + board selector deferred

## Detail panels (PER-88)
- ✅ Canvas tab renders `<Canvas>` in Project, Contact (+leads), Organization, Target
- ✅ Target shares the wrapped contact/org board (scope keyed to the wrapped entity)
- ⚠️ Old `canvas_html` column left in place — legacy rich-text canvas not shown/migrated

## UX
- ✅ Fast hover tooltips (~0.18s) on dock/toolbar controls (`data-tip` CSS)
- ✅ "Drop images to add" overlay while dragging files over the canvas

## Deferred / open (🔲)
- Ash **inline answer cards** + user-specific "do this next" context cards
- Ash actually **creating objects** on the canvas from a request
- **Images attachable to objects** (true link so they move together) — needs a spec
- **Linked-files** picker (browse an entity's files)
- **Contact-scoped task lists** (only project-scoped today)
- **Event cards** (currently a "coming soon" static card)
- `canvas_html` **migrate-or-drop** decision
- **DashboardTour** copy still describes the old dashboard; its "Meet Ash" step is broken (FAB hidden on Home) — onboarding needs a pass
- **Text vertical-align** only bites on fixed-height boxes; auto-grow text needs a resizable/min-height text box
- **Notes rich-text ↔ canvas toggle** (PER-87)
- **Presence / multiplayer**, board selector
- **Connectors** between objects
- On-screen **undo/redo buttons** (state already exposed)

## Known caveats to verify
- Undo/redo DB reconcile (undo a move, a delete, a colour change, then reload)
- Detail-panel canvases load per entity and Targets share correctly
- Image drag-drop + render (bucket is public — used by notes)
- The detail panels have **pre-existing** lint errors (already on `main`), unrelated to the canvas swap
