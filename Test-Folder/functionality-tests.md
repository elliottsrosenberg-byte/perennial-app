# Perennial — Functionality Tests

Tests are organized by module. Run end-to-end in a logged-in session against the live Supabase database.

---

## Projects

### Creation
- [ ] Create a project with each type: Furniture, Sculpture, Painting, Client
- [ ] Create with all fields filled — verify Supabase row matches exactly
- [ ] Create with only title — verify defaults apply (status: planning, priority: medium)
- [ ] DatePicker stores correct YYYY-MM-DD in DB (not datetime)
- [ ] Modal closes on backdrop click
- [ ] Modal closes on Escape key
- [ ] Cancel button closes without creating
- [ ] Validation: cannot submit without title

### Grid & Status
- [ ] New project appears at top of correct status group
- [ ] Status ordering correct: Planning → In Progress → On Hold → Complete → Cut
- [ ] Cut section hidden in "All" view when no cut projects exist
- [ ] Filter tabs show correct counts per status
- [ ] Filtering by each status tab shows only matching projects

### Drag and Drop
- [ ] Drag a card from Planning → In Progress — status updates in Supabase
- [ ] Drag a card to On Hold — card moves and appears at reduced opacity
- [ ] Drag to Cut — card appears in Cut section at 65% opacity with red-orange bar
- [ ] Drag to Complete — accent bar turns green
- [ ] Drop zone appears with dashed border on hover-over
- [ ] Empty group shows drop hint text
- [ ] Drag in filtered view stays within same status (no status change)
- [ ] Optimistic update is immediate; Supabase write happens in background

### Detail Panel
- [ ] Clicking a card opens detail panel with all data populated
- [ ] Edit title inline — saves on blur, updates DB
- [ ] Edit description inline — saves on blur, updates DB
- [ ] Change status via dropdown — DB updates, card moves on next open
- [ ] Change priority — DB updates, card badge changes
- [ ] Change type — DB updates, type-specific fields show/hide
- [ ] Edit listing price / dimensions / materials / weight (non-client)
- [ ] Edit client name / rate / estimated value (client type)
- [ ] Edit due date — saves to DB, card deadline badge updates

### Tasks (Checklist)
- [ ] Tasks load from DB on panel open
- [ ] Add a task — appears in list, persists in Supabase
- [ ] Check a task complete — toggles in DB
- [ ] Uncheck a task — toggles back in DB
- [ ] Task progress bar on card reflects completion ratio

### Reminders
- [ ] Create a reminder from the Reminders tab — appears in DB
- [ ] Reminder with due date shows in Today card on home dashboard
- [ ] Reminder appears in Calendar module
- [ ] Toggle reminder complete — updates DB
- [ ] Reminder linked to project shows project context

### Notes
- [ ] Notes tab shows notes linked to this project
- [ ] Add a note — persists in DB with project_id
- [ ] Delete a note — removed from DB and list

### Delete
- [ ] Delete project — confirmation dialog appears
- [ ] Confirm delete — project removed from DB and grid
- [ ] Detail panel closes after delete
- [ ] Cancel delete — no change

---

## Contacts
*Tests to be added during Contacts module pass*

---

## Notes
*Tests to be added during Notes module pass*

---

## Finance
*Tests to be added during Finance module pass*

---

## Resources
*Tests to be added during Resources module pass*

---

## Ash
- [ ] Open Ash panel — suggestions appear for current module
- [ ] Send a message — streams response correctly
- [ ] `search_projects` tool fires when asking about a specific project
- [ ] `get_project_details` returns tasks and time data
- [ ] `search_contacts` returns matching contacts
- [ ] `get_contact_details` returns activity feed
- [ ] `get_finance_summary` returns correct period totals
- [ ] `search_notes` finds notes by content
- [ ] `create_note` — note appears in Notes module
- [ ] `create_reminder` — reminder appears in Calendar/Today card
- [ ] Tool indicator shows while tool is running
- [ ] History dropdown shows past conversations
- [ ] Loading past conversation restores messages
- [ ] Panel auto-expands on first message
- [ ] Markdown renders correctly: bold, italic, lists, code blocks
- [ ] Conversation persists in Supabase after session
