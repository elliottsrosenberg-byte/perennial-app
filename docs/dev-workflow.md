# Dev Workflow — staging & safe-to-ship

Status: **target state, not yet built.** `main` is still push-to-prod today. This doc is
the agreed plan plus the exact steps to stand it up. Companion to
[`launch-checklist.md`](launch-checklist.md) (the one-time test→prod integration flip).

Context: solo dev (Elliott), ~10 beta (real, paying) users, Vercel + Supabase +
Stripe/OAuth. Goal in one line: **never test against prod, and never push untested to
`main`.**

---

## The core problem

Two things can hurt real users now:

1. **Shipping broken code.**
2. **DB migrations** — the scary ones, because a bad `ALTER`/`DROP` on prod has no undo
   button.

So the workflow has to protect **both the code path and the schema path**.

---

## Target setup (3 environments)

### 1. Git: branches + PRs — stop pushing to `main`
- Every change goes on a feature branch → PR → review → merge to `main` (= prod).
- Vercel **already auto-builds a Preview deploy per branch/PR** — a unique URL to
  click-test every change *before* it's live. Free, and the single biggest win.

### 2. A separate Supabase project for non-prod (the key piece)
- Spin up a second Supabase project = **staging** (clone of prod's schema, fake data).
- Point **local dev** *and* **Vercel Preview** deploys at staging; only
  `main`/production points at the real DB.
- Break things freely without touching real users' data.
- Cheaper alternative for pure local work: `supabase start` (local Docker Postgres) —
  instant, resettable, zero shared state.
- Recommended split: **local Docker for day-to-day dev + one hosted staging project for
  Preview deploys.**

### 3. Migrations as code (the most important change)
- Stop applying ad-hoc SQL to prod (including via Claude's Supabase MCP). Every schema
  change is a committed file in **`supabase/migrations/*.sql`**.
- Flow: write migration → `supabase db push` to **staging** → verify → on merge, apply to
  **prod**. Reviewable, reproducible, ordered, proven on staging first.
- Discipline: prefer **additive / expand-contract** (add column → backfill → switch code →
  later drop), and **take a prod snapshot before anything risky**. PITR backups exist —
  don't rely on them.

### 4. Test-mode integrations everywhere but prod
- Staging/preview env vars use **Stripe test keys, Plaid sandbox, Resend test, OAuth test
  apps** — exercise payments/booking/email without real money or real accounts.

---

## The promotion loop

```
branch → local (Docker DB + test integrations)
       → push → Vercel Preview (staging DB + test integrations) → click-test
       → PR → review → merge to main
       → prod deploy + apply the migration to prod (proven on staging)
```

---

## How Claude works under this model

- **No more committing straight to `main`**, no more running migrations against prod via
  the MCP. Instead: feature branches, migration files, and PRs to review and merge.
- Claude's Supabase MCP access to prod becomes **read-only by default**
  (debugging/inspection); writes/migrations go to **staging** or get handed over as a
  reviewed migration file.
- Fast path (optional): for genuinely trivial, no-migration UI tweaks we can keep
  push-to-main if you want. Anything touching **schema/auth/payments** gets flagged as
  "needs the full staging loop."

---

## Priority / cost trade-off

- **Non-negotiable:** migrations-as-code. Cheapest, biggest safety gain.
- **Next most valuable:** the hosted staging Supabase project.
- **Premium upgrade (later):** per-branch Supabase Branching (Pro feature, auto DB-per-PR)
  — worth it once there are more contributors.

---

## Setup checklist — what it takes to make this real

Legend: **[you]** = owner/dashboard/secret work · **[claude]** = Claude can do on request ·
**[both]** = pair on it.

### A. Tooling (prereqs)
- [x] **[you]** Install the Supabase CLI — `brew install supabase/tap/supabase`. Done
      (CLI 2.106.0).
- [ ] **[skipped]** Docker Desktop — intentionally skipped per the 2026-06-16 decisions
      (staging-only, no local `supabase start`). Note: this also means the CLI's
      `db dump` / `db pull` / `db diff` (which run `pg_dump` in a container) don't work;
      we use a native `pg_dump` instead (see B). `db push` does **not** need Docker.
- [x] **[claude]** `supabase init` — created `supabase/config.toml` + `.gitignore`
      (project_id `perennial-app`).

### B. Capture current prod schema as the baseline migration
- [x] **[both]** `supabase login` + `supabase link --project-ref nmfzmbjjqsjcqkedswfc`
      (prod). Done.
- [x] **[claude]** Baseline migration captured: `supabase/migrations/20260616180825_remote_schema.sql`.
      `supabase db pull` was **blocked** two ways — (1) prod's migration-history table
      already had 76 entries from past MCP `apply_migration` calls (no local files to
      match), and (2) `db pull` needs Docker. Worked around with a read-only native
      `pg_dump --schema=public --schema-only` (Postgres 17 client via Homebrew). Captures
      all 43 public tables (the 76 recorded migrations only covered 32 — 11 foundational
      tables predate migration-recording). From here, all schema changes are new migration
      files.
  - **Deferred:** prod's 76-entry `supabase_migrations.schema_migrations` history is still
    unreconciled with local files. Not needed for staging. Before the first `db push` **to
    prod**, squash/repair it (mark the 76 reverted, record the baseline as applied) — a
    bookkeeping-only prod write, gated as a separate decision.

### C. Stand up the staging Supabase project
- [x] **[claude]** Created `perennial-staging` via the Supabase MCP — project-ref
      **`qkasrugrgchmmwredfyf`**, region `us-east-1`, org `Perennial`, $0/mo. The CLI is
      now `link`ed to staging (not prod) — staging is the default `db push` target.
- [x] **[claude]** Applied the baseline via `supabase db push --linked`. Verified staging
      == prod: 43 tables, RLS on all 43, 53 policies, 11 functions, 8 triggers; history row
      `20260616180825` recorded (so future pushes only apply new migrations).
  - **Known staging gaps (deferred):** the baseline is `--schema=public` only, so two
    cross-schema objects that live in prod aren't on staging. The `auth.users` →
    `handle_new_user()` signup trigger is now covered by migration
    `20260623160000_resilient_signup_profile_trigger.sql` and will be applied to staging on
    the next `supabase db push`. The `rls_auto_enable` event trigger is still absent from
    staging — recreate it manually if/when you test schema changes there.
- [ ] **[you]** Seed staging with fake data (no prod user data). Claude can write a
      `supabase/seed.sql`.

### D. Wire environments in Vercel
- [ ] **[you]** In Vercel → Settings → Environment Variables, set **Preview**-scoped vars
      to staging + test-mode values:
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
    → **staging** project values.
  - Stripe **test** keys (`sk_test_…`, `pk_test_…`), Plaid **sandbox**, Resend test key,
    OAuth **test** app credentials.
  - `NEXT_PUBLIC_APP_URL` → the preview/staging URL.
- [ ] **[you]** Confirm **Production**-scoped vars remain the live values (they already
      are — see `launch-checklist.md`).
- [ ] **[you]** *(optional)* Add a stable `staging.perennial.design` domain pointing at a
      branch (e.g. a long-lived `staging` branch) if you want one fixed URL instead of
      per-PR preview URLs.

### E. Local dev env
- [ ] **[you]** Create `.env.local` pointing at **local Docker** (`supabase start` prints
      the URL/keys) *or* the staging project — never prod. Claude can template it.

### F. Turn on the git discipline
- [ ] **[both]** Adopt: feature branch → PR → review → merge. Claude stops pushing to
      `main` (except the optional trivial-UI fast path, if you keep it).
- [ ] **[you]** *(optional)* GitHub branch protection on `main` (require PR, no direct
      push) to make it enforced rather than habit.

### First real exercise of the loop
- [ ] **[both]** Run the **held public-bucket listing tightening** (SQL in
      `launch-checklist.md`) through the full loop as the first migration: write it as a
      migration file → apply to staging → verify logos/receipts/canvas images still
      display → merge → apply to prod. This is the change we explicitly deferred *because*
      it needed staging verification.

---

## Decisions (agreed 2026-06-16)

1. **Staging project only** — one hosted `perennial-staging` Supabase project for both
   local dev and Vercel Previews. **Skip Docker** for now (no local `supabase start`).
2. **Keep the trivial-UI fast path** — UI-only, no-schema/auth/payments changes can still
   go straight to `main`. Anything touching schema/auth/payments takes the full staging
   loop.
3. **Per-PR Vercel preview URLs** — no stable `staging.perennial.design` domain for now.

These trim the setup checklist: skip the Docker install (A) and the optional
`staging.perennial.design` domain (D). Local `.env.local` (E) points at the staging
project, not Docker.
