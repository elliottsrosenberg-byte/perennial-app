# Perennial

A business operating system for creative practices — the operational layer that design studios and
independent practitioners run on. Invoicing, banking, calendar, CRM, projects, notes, and an AI
assistant in one application instead of six subscriptions.

🔗 **[app.perennial.design](https://app.perennial.design)**

---

## Modules

| Module | Capability |
| --- | --- |
| **Finance** | Invoices with public payment links, Stripe Connect payouts, Plaid bank feeds, transaction categorization, receipt matching, expense conversion |
| **Calendar** | Continuous-pan week and month grids, drag-to-create events, task rescheduling by drag, Google and Microsoft calendar sync, embedded scheduling overlay |
| **Network** | Contacts and organizations with a scrim detail-panel workflow |
| **Projects** | Project tracking cross-linked to tasks, calendar, and notes |
| **Tasks** | Task management surfaced inside the calendar |
| **Notes** | TipTap rich-text editing, image paste/drop/upload, shareable public note links |
| **Outreach** | Business development pipeline |
| **Presence** | Analytics and social integrations (GA4, Instagram, Meta, newsletter platforms) |
| **Opportunities** | Curated feed of grants, residencies, and open calls, with per-user engagement tracking |
| **Resources** | Knowledge base with a curated shared feed plus private per-user research |
| **Ash** | AI assistant mounted globally, with research and learning endpoints |
| **Admin** | Curation tooling, user management, impersonation for support |

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js (App Router) |
| Database | Supabase — Postgres, Row-Level Security, Storage, Vault |
| Auth | Supabase auth, route gating in `proxy.ts` |
| Payments | Stripe Connect (Standard, direct charges) |
| Banking | Plaid |
| Integrations | Google Calendar, Microsoft, GA4, Instagram, Meta, Beehiiv, Kit, Mailchimp, Substack |
| AI | Anthropic SDK |
| Styling | Tailwind v4 (CSS-first) with a CSS-variable token layer |
| Observability | Sentry (errors, traces), PostHog (analytics, session replay) |
| Hosting | Vercel, push-to-prod from `main` |

## Architecture

**Tenancy.** Built multi-user from the ground up. 40 of 41 public tables carry a `user_id` column
with an `auth.uid() = user_id` RLS policy. One table (`opportunities`) is globally shared and
service-role–write-only. `knowledge_base` is semi-global: rows with a null `user_id` form a curated
feed readable by all authenticated users, while rows with a `user_id` are private research.

**Public escape hatches.** Specific shared rows widen access without exposing their table —
`notes.share_token`, `invoices.public_token`, and scheduling-link slugs.

**Data flow.** Each module's `page.tsx` is a server component that fetches initial data via
`Promise.all`, then hands it to a `*Client.tsx` component owning interaction state.

**Secrets.** Integration credentials live in Supabase Vault, reached through `SECURITY DEFINER` RPCs
that re-check `auth.uid()`.

Deeper documentation lives in [`docs/architecture/`](./docs/architecture/README.md) — module
reference, data model, design system, change playbook, and operations.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

> **Note for contributors:** read [`AGENTS.md`](./AGENTS.md) before writing code. This project runs a
> modified Next.js build whose APIs differ from upstream.

## Status

Active development since April 2026. Single-user in production today, architected for multi-user.
