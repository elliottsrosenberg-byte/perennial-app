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
- [ ] **[you]** Install the Supabase CLI — `brew install supabase/tap/supabase` (not yet
      installed on this machine).
- [ ] **[you]** Install Docker Desktop (for `supabase start` local DB — not yet installed).
      Optional if you'd rather use only the hosted staging project for now.
- [ ] **[claude]** `supabase init` in the repo (creates `supabase/config.toml` +
      `supabase/migrations/`). None exist yet — the repo isn't CLI-linked.

### B. Capture current prod schema as the baseline migration
- [ ] **[both]** `supabase login`, then `supabase link --project-ref nmfzmbjjqsjcqkedswfc`
      (prod). **[you]** runs the login (interactive/secret); **[claude]** can run the rest.
- [ ] **[claude]** `supabase db pull` to generate the baseline migration from prod, commit
      it. From here, all schema changes are new migration files.

### C. Stand up the staging Supabase project
- [ ] **[you]** Create a new Supabase project named `perennial-staging` (same region).
      Note its project-ref, URL, anon key, service-role key.
- [ ] **[claude]** Apply the baseline + all migrations to staging (`supabase db push`
      against the staging ref) so its schema matches prod.
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

## Open decisions for you

1. **Local Docker vs. staging-only?** Recommend both, but staging-project-only is fine to
   start (skip Docker install).
2. **Keep the trivial-UI fast path to `main`,** or go strict (everything through a PR)?
3. **Stable `staging.perennial.design` domain,** or just use per-PR Vercel preview URLs?
