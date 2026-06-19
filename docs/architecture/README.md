# Perennial App — Architecture

This is the index for `docs/architecture/`. It gives a high-level map of the app and links to the deeper sibling docs. Use it as the starting point before making any app-wide change.

## Sibling docs

| Doc | What it covers |
| --- | --- |
| [modules.md](./modules.md) | Per-module deep dive: routes, server/client split, deep-link params, public surfaces |
| [data-model.md](./data-model.md) | Tables, RLS policies, tenancy patterns, Vault secrets, service-role write paths |
| [design-system.md](./design-system.md) | CSS-variable tokens, inline-style convention, dark mode, `components/ui/` primitives |
| [mobile-responsiveness.md](./mobile-responsiveness.md) | Sidebar vs. `MobileNav`, the desktop-only notice, responsive surfaces |
| [change-playbook.md](./change-playbook.md) | Step-by-step recipes for common app-wide changes |
| [operations.md](./operations.md) | Observability (Sentry/PostHog/tracking pixel) + the work pipeline (Slack→Linear→agent→PR→Vercel), cron, env-var map, ops gaps |

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js (App Router) — **a modified build; read `node_modules/next/dist/docs/` before writing Next.js code, APIs differ from upstream** |
| Backend | Supabase (Postgres + RLS + Storage + Vault) |
| Auth | Supabase auth; route gating in `proxy.ts` (NOT `middleware.ts`) |
| Styling | Tailwind v4 (CSS-first, no `tailwind.config.js`) — but the real convention is **inline styles referencing CSS variables** |
| Payments | Stripe Connect (Standard, direct charges) |
| Integrations | GA4, Instagram, Beehiiv/Kit/Mailchimp/Substack, Plaid (banking), Google Calendar conferencing |
| AI | "Ash" assistant, globally mounted |
| Observability | Sentry (errors + traces), PostHog (product analytics + session replay) — see [`operations.md`](./operations.md) |
| Hosting | Vercel, push-to-prod from `main` (`app.perennial.design`) |

Routing structure:
- `app/(app)/` — the authed app group. `app/(app)/layout.tsx` wraps every signed-in route and renders the nav chrome, Ash, and tour trackers.
- Public / un-grouped routes (outside `(app)`, allowlisted in `proxy.ts`): `app/book/[slug]` (booking), `app/i/[token]` (invoice pay), `app/share/[token]` (shared note), `app/onboarding`, and `app/api/*`.

## Tenancy model

The app is **effectively single-user today but built for multi-user**.

- 40 of 41 public tables carry a `user_id` column with an `auth.uid() = user_id` RLS policy. See [data-model.md](./data-model.md) for the three RLS authoring styles in play.
- Exactly one table is global-shared: `opportunities` (the curated Perennial feed) — no `user_id`, `{authenticated}` reads the whole feed, only `{service_role}` writes. Its `user_status` / `ash_note` columns are a documented single-tenant compromise; a per-user opportunity-state table is the multi-user TODO.
- Public-read escape hatches widen access for specific shared rows without exposing the table: `notes.share_token`, `invoices.public_token`, `scheduling_links` slug.
- Per-user config hub is `profiles` (PK = `auth.uid()`, ~53 columns): onboarding answers, finance defaults, notification toggles, `default_calendar_id`.

## Key conventions

**Server-fetch-then-client-state.** Each module's `page.tsx` is a server component that fetches initial data, then hands it to a `*Client.tsx` component that owns interaction state. Example: `app/(app)/finance/page.tsx` → `FinanceClient` → tab components (`InvoicesTab`, `BankingTab`).

**Inline styles + CSS vars.** Styling is overwhelmingly `style={{ background: "var(--color-sage)", borderRadius: 8 }}`, not Tailwind utilities. All tokens live in `app/globals.css` under `@theme inline { ... }`. Hover/focus is hand-rolled with `useState` / `onMouseEnter`-`onMouseLeave` or by mutating `e.currentTarget.style`. Dark mode is handled entirely at the token layer (`prefers-color-scheme` + `[data-theme]` overrides), so var-based inline styles theme automatically — **raw hex literals do NOT theme** (known offenders in `EmptyState`, `VisitButton`, `AshPromptsModule`). Islands of Tailwind/custom-CSS exist in newer/auxiliary screens (settings, scheduling, signup, onboarding, admin). Magic radius/font-size numbers are common despite existing tokens. Details in [design-system.md](./design-system.md).

**Service-role for session-less writes.** `lib/supabase/service.ts` / `lib/supabase/admin.ts` bypass RLS for: opportunities cron ingest (needs `CRON_SECRET`), `/admin` curation, the public invoice view + Stripe webhook, and public scheduling. Integration secrets live in Supabase Vault, accessed via SECURITY DEFINER RPCs (`lib/integrations/vault.ts`) that re-check `auth.uid()`.

**Deep links over extra routes.** Most modules expose state via query params consumed client-side (`?tab=`, `?invoice=`, `?projectId=`, `?taskId=`, `?id=`, `?cat=`, `?opportunityId=`) rather than dedicated routes — heavily used by Ash and cross-module nav.

## Navigation & global chrome

`app/(app)/layout.tsx` renders: `Sidebar` (desktop), `MobileNav` (mobile), `MobileDesktopNotice`, `AshContainer`, `TourTracker`, `TourCallout`. **Ash** (AI assistant) has no route — it's a fixed floating FAB + panel on every authed page. The tour system has no route either: `DashboardTour` on home, trackers in the layout, per-module modals under `components/tour/<module>/`.

## Modules

| Module | Primary route(s) | One-liner |
| --- | --- | --- |
| Home / Dashboard | `app/(app)/page.tsx` (`/`) | Landing dashboard; wraps all authed routes via `app/(app)/layout.tsx` |
| Calendar | `app/(app)/calendar/page.tsx` (`/calendar`) | Week/month grid with events and tasks |
| Scheduling (owner) | inside `/calendar` (no route) | Booking-link setup via the left-rail `SchedulingPanel` + grid compose overlay |
| Public Booking (invitee) | `app/book/[slug]/page.tsx` (`/book/[slug]`) | Public, service-role-loaded booking page; allowlisted in `proxy.ts` |
| Finance | `app/(app)/finance/page.tsx` (`/finance`) | Shell with Overview / Time / Invoices / Banking tabs (`?tab=`) |
| Invoices | `/finance?tab=invoices` | Invoice list/editor inside `FinanceClient`; printable view at `app/invoice/[id]/print` |
| Banking | `/finance?tab=banking` | Plaid-fed expense triage (replaced the old Expenses tab) |
| Public invoice pay | `app/i/[token]/page.tsx` (`/i/[token]`) | Stripe Connect payment page; only sent/paid/voided shareable; webhook + payment-intent routes under `app/api/` |
| Network | `app/(app)/network/page.tsx` (`/network`) | Contacts/organizations |
| Outreach | `app/(app)/outreach/page.tsx` (`/outreach`) | Outreach pipelines and targets |
| Presence | `app/(app)/presence/page.tsx` (`/presence`) | Multi-tab hub: Overview / Website (GA4) / Socials (Instagram) / Newsletter / Press / Opportunities (`?tab=`) |
| Projects | `app/(app)/projects/page.tsx` (`/projects`) | Projects with tabs/tasks/notes; rich deep-link params |
| Tasks | `app/(app)/tasks/page.tsx` (`/tasks`) | Task list; `?taskId=` scrolls + tints a row (Ash "View task →") |
| Notes | `app/(app)/notes/page.tsx` (`/notes`) | Notes editor; public read-only share at `app/share/[token]` |
| Resources | `app/(app)/resources/page.tsx` (`/resources`) | Central file/resource index (indexes, doesn't duplicate); `?cat=` deep link |
| Settings | `app/(app)/settings/page.tsx` (`/settings`) | Per-user config; hosts integration connection UI (`?section=integrations`) |
| Integrations | no route (in Settings) | Shared connection plumbing; Presence is the primary consumer |
| Onboarding | `app/onboarding/page.tsx` (`/onboarding`) | Outside `(app)`, no sidebar; redirects on auth/completion |
| Admin / Curate | `app/(app)/admin/page.tsx` (`/admin`) · `app/(app)/admin/users/page.tsx` (`/admin/users`) | Opportunity/suggestion curation + admin user list with "View as" impersonation; both gated to `ADMIN_USER_IDS` |
| Ash | no route (in layout) | Global AI assistant FAB + panel on every authed page |

See [modules.md](./modules.md) for the full per-module breakdown including all deep-link params and public surfaces.
