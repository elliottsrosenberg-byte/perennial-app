# Changelog

Maintained by the weekly documentation agent. Each entry covers the prior week's commits to `main`.

---

## 2026-07-03 (week of 2026-06-26)

### Features
- `892e644` Design system: new `components/ui/Modal.tsx` shared dialog shell — 4 sizes (sm/md/lg/xl; widths 380/460/512/640px), `title?`/`header?`/`footer?` slots, Escape-to-close; `ConfirmDialog` refactored onto it; ~25 modals adopted across the refactor waves this week
- `1d665d3` Design system: new `components/ui/Card.tsx` surface-container primitive — 3 variants (raised/flat/sunken), 4 padding sizes, `interactive` hover-lift prop; `--radius-lg` radius
- `1efa772` Design system: `components/ui/Badge.tsx` rewritten — 3 variants (status/tag/solid), 11 tones (sage + 10 palette colors) via new `lib/ui/palette.ts`; adopted for invoice status pills (`InvoicesTab.tsx`, solid variant)
- `1efa772` Design system: new `lib/ui/palette.ts` — canonical 10-color user palette (Green/Grey/Brown/Orange/Yellow/Olive/Blue/Purple/Rose/Red) for tags, calendar colors, pipelines, and project accents
- `f0bb6b1` Design sync: add `.design-sync/` directory (27 files: config, previews, `tokens.css`) linking the design system to Claude Design; `AshMark` SVG inlined as data URI in `components/ui/AshMark.tsx`
- `f4fa73e` Design system: add `scripts/check-design-tokens.mjs` PostToolUse hook enforcing no raw hex/rgba in styles; design-token rules added to `AGENTS.md`

### Infra
- `4e545db` `0d3a8c9` `f2e235c` `164816d` `b773dd2` `f35e366` Color tokenization waves 1–3 — sweep across all modules replacing raw hex/rgba with `var(--color-*)` tokens; new `--color-green-deep-rgb` and `--color-grey-rgb` rgb-triplet tint helpers added to `globals.css`
- `5fad80f` Invoice Draft/Saved status color changed to orange; blue retired as an invoice status color
- `2ea758b` Badge adoption: invoice status pills migrated to `Badge` solid variant (`InvoicesTab.tsx`)
- `cc3c4bd` Unified accent/status/palette into one 10-color set; `/design` showcase refactored to use real `components/ui/` primitives
- `761d3dd` `98356ec` `f0d941c` `363ca16` `be96d26` `a27eaba` `07f3392` `5d2e753` Modal adoption wave — ~25 modals refactored from bespoke dialog markup onto shared `Modal` shell
- `ab2b232` US spelling normalization (colour→color) across codebase and docs

### Docs
- This run: `design-system.md` — update Badge primitive row (3 variants/11 tones/2 importers); add Card and Modal rows to Section 3 table; note `Modal` in adoption summary; add `--color-green-deep` and rgb-triplet tint helpers to token tables; update Section 7.9 and backlog item 7
- This run: `change-playbook.md` — update Badge adoption map (no longer dead, 2 importers); add Card and Modal rows to Section 2a; update Section 2b Badge claim and table row

---

## 2026-06-26 (week of 2026-06-19)

### Features
- `844182b` Calendar: replace native `<input type=date|time>` chips in EventCard and QuickTaskCard with Perennial-styled popovers — new `components/calendar/ChipPickers.tsx` (`DateChip` + `TimeChip`); `DatePicker` now exports `MonthGrid` for reuse; duration-aware time edits, ghost/pan follows date changes (PER-84)
- `3a894eb` Outreach: targets are now thin wrappers over Network records — Canvas/Activity/Tasks/Notes/Files in `TargetDetailPanel` all key off the linked `contact_id`/`organization_id`, not `target_id`; orphan targets show a link-or-create prompt; Activity tab added; "Just a name" option added to `NewTargetModal` (PER-113)
- `3a894eb` Extract `components/detail/EntityActivityTab` (shared entity-agnostic activity tab); `ContactDetailPanel` and `OrganizationDetailPanel` migrated to it (net −284 lines); `TargetDetailPanel` uses all four shared `Entity*Tab` components

### Fixes
- `a411bd0` Auth: resilient `handle_new_user()` profile trigger — exception-guarded so a profiles insert failure can never abort the GoTrue signup transaction; trigger recreated idempotently in `supabase/migrations/20260623160000_resilient_signup_profile_trigger.sql`; `emailRedirectTo=/auth/callback` added to `app/signup` so email confirmation lands with a live session (PER-126, PER-127)
- `0390919` CI: changelog-to-slack workflow wording — "shipped to `main`" instead of "merged to `main`" (PER-108)

### Infra
- `54001bd` MCP: split single Supabase MCP server into `supabase-prod` (`nmfzmbjjqsjcqkedswfc`) and `supabase-staging` (`qkasrugrgchmmwredfyf`) in `.mcp.json`

### Docs
- This run: `modules.md` — add `ChipPickers.tsx` to Calendar components; update Calendar mobile-issues note (date/time chips now Perennial-styled)
- This run: `design-system.md` — update DatePicker primitive to note `MonthGrid` export; remove EventCard from native-date-input bypass list
- This run: `change-playbook.md` — remove EventCard from native `<input type=date>` bypass list; note migration to ChipPickers
- This run: `data-model.md` — document resilient `handle_new_user()` trigger + migration file on the `profiles` table row
- This run: `dev-workflow.md` — update staging gap note: `handle_new_user()` trigger now covered by migration; `rls_auto_enable` still missing
- This run: `operations.md` — document `supabase-prod`/`supabase-staging` MCP server split

### Needs review
- Migration `20260623160000_resilient_signup_profile_trigger.sql` creates the `handle_new_user()` trigger on `auth.users` (cross-schema). It must be pushed to staging via `supabase db push --linked`. Confirm the auth fix is live on prod (PR #11 merged to main).
- `TargetDetailPanel` People tab is still a `StubPane` — the only remaining placeholder tab in the module (PER-113 commit note).
- `rls_auto_enable` event trigger is still absent from staging schema (no migration covers it).

---

## 2026-06-19 (week of 2026-06-12)

### Features
- `0a6eb60` Onboarding: add logo upload + brand color picker to Step 3 (PER-72); add "Graphic design", "Websites", "Software" to make options with `key/color/icon` mappings → `profiles.project_options.type` (PER-78); allow connecting multiple Google accounts via `prompt=select_account` (PER-75)
- `19e4c68` Admin: add `/admin/users` page (`AdminUsersTable`) with full user list and "View as" impersonation — service-role magic-link, incognito-safe, PostHog-suppressed via `ph_impersonated` cookie
- `3acae2b` Sidebar: gate Design system / View as / Curate links to `isAdmin` (fetched from `/api/admin/check`); move "Documentation" to app menu (enabled at `/docs`, no longer "Soon")
- `aa08f15` Admin: add `GET /api/admin/check` + `lib/admin/guard.ts` (`ADMIN_USER_IDS` allowlist); all admin routes and pages now go through this guard
- `416ba97` Observability: wire PostHog product analytics + session replay; reverse-proxy via `/ingest` rewrites in `next.config.ts` to bypass ad-blockers
- `c0f7d27` Observability: wire Sentry error monitoring — `instrumentation.ts` (server/edge init), `instrumentation-client.ts` (App Router navigations), `app/global-error.tsx` (root error boundary), source-map upload via `SENTRY_AUTH_TOKEN`
- `378af49` Analytics: suppress PostHog during admin "View as" sessions — `ph_impersonated=1` cookie set by `/auth/confirm`; `PostHogProvider` + `PostHogAuth` initialize opted-out when cookie present

### Fixes
- `1ac91d1` Onboarding: split name field into First + Last (composed → `display_name`, no schema change) (PER-71); thread GA4 OAuth `next` param through state so callback returns to onboarding instead of `/presence` (PER-74); add "That's 3 — remove one" UI feedback for the 3-challenge cap with `OtherInput` `disabled` prop (PER-73); modal max-width 620px
- `b05a3b7` Onboarding: modal max-width → 680px; bank tile copy → "Connect your bank securely via Plaid"; connect buttons use brand green (sage) not charcoal

### Infra
- `08a9b60` Supabase: add `supabase/seed.sql` — idempotent staging seed (demo user `demo@perennial.design` + 3 orgs, 6 contacts, 4 projects, 8 tasks, 3 notes)
- `c6f280a` Supabase: sanitize baseline migration (remove `CREATE SCHEMA public` etc.); verify staging == prod (43 tables, RLS on all 43, 53 policies, 11 functions, 8 triggers); tick dev-workflow checklist C
- `0ac8dd3` CI: add `.github/workflows/changelog-to-slack.yml` — on PR merge to main, posts one-line changelog to Slack `#changes` via `SLACK_CHANGES_WEBHOOK_URL` repo secret; **not a CI gate** (no tsc/lint/build/test); also wires PER-62 (Slack→Linear + GitHub→Linear integrations confirmed wired in Linear/Slack settings)

### Docs
- `9c668bf` Add `docs/architecture/operations.md` — canonical map of observability (Sentry/PostHog/first-party tracking pixel), work pipeline (Slack→Linear→agent→PR→Vercel), cron, env-var service map, and known gaps
- `eb66e6a` Add `.github/workflows/README.md` — maps each workflow, its trigger, and required secrets
- `0ac8dd3` Update `operations.md` — mark PER-62 integrations wired; refine "No CI" note to "No CI gate" (notifier workflow now exists but runs no tests)

### Needs review
- `ADMIN_USER_IDS` env var must be set in Vercel (Production = real admin user ID; Preview = staging demo user ID). Missing it makes `/admin/users` and all admin routes 403 for everyone, including the owner.
- `SLACK_CHANGES_WEBHOOK_URL` repo secret must be set for the Slack notifier workflow to post to `#changes`.
- `NEXT_PUBLIC_POSTHOG_KEY` must be set for PostHog to initialize (gracefully no-ops if unset per `lib/posthog/config.ts`).
- `NEXT_PUBLIC_SENTRY_DSN` must be set for Sentry; `SENTRY_AUTH_TOKEN` is needed for source-map uploads (both confirmed set per commit `c0f7d27`).
- No CI gate in place: type-checks and linting still run manually; Vercel preview is the only automated quality gate before merge (tracked as PER-69, prerequisite for the autonomous agent pipeline).
