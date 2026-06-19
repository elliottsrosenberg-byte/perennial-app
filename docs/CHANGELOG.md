# Changelog

Maintained by the weekly documentation agent. Each entry covers the prior week's commits to `main`.

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
