# Perennial wireframe repository

## Reference codes

Codes follow the pattern: `[FEATURE]-[NUMBER]`

---

### Notes / Reminders (NR)

| Code | File | Description | Status |
|------|------|-------------|--------|
| NR-01 | NR-01-notes-default-collapsed.html | Notes view, list collapsed, full writing area | Approved |
| NR-02 | NR-02-notes-expanded-list.html | Notes view, list panel expanded | Approved |
| NR-03 | NR-03-reminders-with-projects.html | Reminders tab with project tags | Approved |

### Design decisions — Notes / Reminders
- Default view is notes with the list panel collapsed, maximizing writing space
- Notes and reminders are tabs within the same view, not separate sections
- Notes tab defaults as the landing state
- List panel is collapsible via a toggle icon (top left)
- Action buttons (convert to reminder, pin, add date) sit in the header top-right, kept small to prioritize the note title
- Reminders show project tags inline for each item
- Active reminders grouped above completed reminders
- Overdue reminders flagged in red

---

### Ash — AI assistant (ASH)

| Code | File | Description | Status |
|------|------|-------------|--------|
| ASH-01 | ASH-01-resting-state.html | Sapling icon, bottom right corner, resting | Approved |
| ASH-02 | ASH-02-floating-window.html | Floating chat window, bottom right, context-aware | Approved |
| ASH-03 | ASH-03-full-window.html | Full window chat, replaces editor, multi-note context | Approved |

### Design decisions — Ash
- Named "Ash" — gender neutral, one syllable, doesn't try too hard
- Icon is a simple sapling (not sparkles, not robot, not brain)
- Resting state: small circular icon, bottom right corner
- Click opens a floating window anchored bottom right (like Notion AI)
- Floating window is context-aware (shows which note it's reading)
- Expand icon in floating window opens full window view
- Full window replaces the editor area entirely
- Context bar in full window shows referenced notes, can add more
- "Back to note" button returns to editor
- Can take actions: create reminders, draft emails, insert into notes, send
- Contextual suggestions: summarize, extract tasks, draft email, research

---

### Projects (PJ)

| Code | File | Description | Status |
|------|------|-------------|--------|
| PJ-03 | PJ-03-card-grid.html | Projects dashboard – card grid view | Approved |
| PJ-04a | PJ-04a-project-page-scrim.html | Project page – four-sided blur/darken overlay over dashboard | In progress |
| PJ-04b | PJ-04b-project-page-backchip.html | Project page – full-screen with "← All Projects" back chip | In progress |

### Design decisions — Projects
- Dashboard is a card grid — no list or board view
- Projects grouped by status: In Progress → Planning → On Hold → Complete
- Each card shows: title, type badge, priority pill, type-specific properties, timeline bar (if due date exists) or time-active indicator (if open-ended), task progress bar + count
- Timeline bar turns red and fills to 100% when overdue
- "Not started yet" shown when project has no start or active time
- "+ New project" button top-right; filter tabs across the top
- Ash icon bottom-right (present on all views)
- Project types with type-specific properties:
  - Painting: listing price, dimensions, weight
  - Sculpture / Furniture: price, dimensions, weight, materials, style
  - Client Project: client, rate, billed hours, est. value
- All projects share: status, priority, start date, due date, to-dos
- Custom properties: reserved / not yet designed (blue)
- Commission management lives within Projects (not its own nav item) — contract, deposit, milestones, deliverables are properties/components of a project

---

### Contacts / CRM (CT)

| Code | File | Description | Status |
|------|------|-------------|--------|
| CT-01 | CT-01-contacts-table.html | Contacts dashboard – dense table, tag filter strip, bulk action bar | Approved direction |
| CT-02 | ⚠️ CT-02-contacts-table-by-status.html | Contacts table grouped by status (Active / Lead / Inactive) with colored left-border headers | Missing — needs rebuild |
| CT-03 | CT-03-contacts-table-pipeline.html | Contacts table sorted by follow-up urgency — Needs Attention / Active / Dormant, with per-row recency bar | In progress |
| CT-04a | CT-04a-contact-page-sidebar.html | Individual contact page – two-column: properties sidebar + activity feed | In progress |
| CT-04b | ⚠️ CT-04b-contact-page-focused.html | Individual contact page – full-width header strip + two-column cards below | Missing — needs rebuild |

### Design decisions — Contacts
- Dashboard default is a dense table view (CT-01 direction): checkbox · avatar+name+email · company+role · tags · status dot · last contact · location · hover actions
- Tag filter strip with colored segment pills: Gallery (blue), Client (green), Supplier (amber), Press (purple), Lead (gray), Event (teal)
- Bulk action bar: floating dark pill bottom-center, appears on row selection. Actions: Tag, Status, Email, Note, Archive, Delete
- Status dots: Active = green, Lead = amber, Inactive = gray
- CT-02 groups the same table by status with colored left borders on group headers
- CT-03 reorders by recency with three urgency bands; each row shows a mini recency bar under the contact name
- Contact page fields: email, phone, company, title, website, address, description, tags, status
- Contact page actions: Send email, Log call, Add note, Archive, Delete
- Activity feed entry types: Email sent/received, Call logged, Note, Meeting
- CT-04a: 272px left properties panel + flex right activity panel (tabs: Activity, Notes, Emails, Linked)
- CT-04b: full-width header (back chip + actions row · avatar+name+role+tags+status · quick-facts bar) + two-column body (left: About card + Activity card · right: Properties card + Linked projects card + Notes card)

---

### Outreach / Gallery pipeline (OR)

| Code | File | Description | Status |
|------|------|-------------|--------|
| OR-02 | OR-02-outreach-kanban-sidenav.html | Gallery pipeline – kanban board with side nav | In progress |
| OR-03 | OR-03-outreach-all-pipelines.html | All pipelines – 5 meta-phase columns, type badge per card | In progress |

---

### Time Tracking / Finance (TT)

| Code | File | Description | Status |
|------|------|-------------|--------|
| TT-01a | TT-01a-finance-hub.html | Finance Hub – single file, 4 tabs: Time, Expenses, Invoices, Dashboard | In progress |
| TT-01b | TT-01b-billing-first.html | Billing First – invoice-centric, three-pane layout, time pulled into invoices per-project | In progress |

### Design decisions — Time / Finance
- Commission management is not a separate nav item — it lives as properties/components within Projects and Time (contract terms, deposit status, milestones on the project page; billing on the time/invoice side)

---

### Calendar (CAL)

| Code | File | Description | Status |
|------|------|-------------|--------|
| CAL-01 | CAL-01-calendar.html | Week view with personal calendars + Perennial Feed (industry events, grants, deadlines). Teal/outlined = industry events. Amber = deadlines. Blue pills = Perennial reminders from pipeline. | In progress |

---

### Resources (RES)

| Code | File | Description | Status |
|------|------|-------------|--------|
| RES-01 | RES-01-resources.html | Resources hub – Operations and Brand sections, file-based items, center peek modal | In progress |

---

### Presence (PR)

_Not yet wireframed._

The Presence nav consolidates everything related to the maker's public-facing identity and outreach. One place to monitor and manage how they show up in the world.

**Sub-sections:**
- **Website** — connect their site (Squarespace, Cargo, etc.), view web analytics (visits, top pages, referrers)
- **Socials** — connect Instagram and other accounts, view analytics (reach, engagement, follower growth), compose and schedule posts (Buffer-style)
- **Newsletter** — connect Mailchimp / Substack / etc., monitor open rates, subscriber count, recent sends
- **Events** — upcoming events to attend or apply to (surfaces the same data as the Perennial Feed in Calendar, but foregrounded here as opportunities — fairs, open calls, grants, residencies)

**Ash integration notes:**
- Ash can draft social captions, newsletter intros, or event application copy from the Presence views
- The Events sub-section is a re-entry point to the calendar data — not a separate data store

| Code | File | Description | Status |
|------|------|-------------|--------|
| PR-01 | PR-01-presence-overview.html | Presence overview – 4-channel stat cards (Website, Socials, Newsletter, Opportunities), mixed activity feed, upcoming opportunities list. Stat cards have ? tooltip + Ask Ash link. | In progress |
| PR-02 | PR-02-presence-website.html | Website – Ash insight strip, 4 stat cards, 30-day traffic chart, top pages, traffic sources, top referrers, shop/ecommerce card. Connected indicator inline with account. | In progress |
| PR-03 | PR-03-presence-socials.html | Socials – Platform chips (Instagram/TikTok/Facebook/LinkedIn/YouTube), platform sub-tabs, stat cards, post queue, quick compose, follower chart, best times. | In progress |
| PR-04 | PR-04-presence-newsletter.html | Newsletter – Substack. Stat cards, campaign list with open/click rates, subscriber growth chart, audience panel, Ash draft suggestion. | In progress |
| PR-05 | PR-05-presence-opportunities.html | Opportunities (formerly Events) – Perennial Feed. List view (Act soon / Upcoming / Later) + Timeline/Gantt toggle (Apr–Aug span). Filter by type. | In progress |

---

## Color key (in wireframes)

- **Red background** = undesigned / TBD (navigation sidebar)
- **Blue border/bg** = revisit later marker

---

## How to use with Figma

1. Open each HTML file in a browser
2. Screenshot or use a browser capture tool
3. Import screenshots into Figma as reference frames
4. Use Figma Make to build from the wireframe structure

---

## Feature codes

| Code | Feature | Status |
|------|---------|--------|
| NR | Notes / Reminders | Active |
| ASH | AI assistant (Ash) | Active |
| PJ | Projects | Active |
| CT | Contacts / CRM | Active |
| OR | Outreach / Gallery pipeline | Active |
| TT | Time Tracking / Finance | Active |
| CAL | Calendar | Active |
| RES | Resources | Active |
| PR | Presence (website, socials, newsletter, events) | Upcoming |
