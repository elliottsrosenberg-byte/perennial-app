# Launch Checklist — Beta (real, paying users)

`app.perennial.design` is already the production domain (Vercel project `perennial-app`,
production target, deploys from `main`). "Going to production" is **not** a domain switch —
it's flipping integrations out of test/sandbox mode. That's almost all **Vercel env vars +
provider-dashboard toggles** (owner-only — Claude can't access those dashboards or hold the
secret values). Claude can read Vercel runtime logs / trigger deploys to help debug after each flip.

Legend: **[you]** = dashboard/secret work only you can do · **[done]** = already handled · **[claude]** = Claude can do on request.

---

## 🔴 Blockers — must be done before any beta user touches it

### Vercel env vars → production values
Project → Settings → Environment Variables (scope **Production**), then redeploy.

- [ ] **Stripe** — `STRIPE_SECRET_KEY`=`sk_live_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`=`pk_live_…`, `STRIPE_CONNECT_CLIENT_ID`=`ca_…`, `STRIPE_WEBHOOK_SECRET` + `STRIPE_CONNECT_WEBHOOK_SECRET`=live `whsec_…`
- [ ] **Banking** — ⚠️ defaults to sandbox if unset. Plaid: `PLAID_ENV` **and** `NEXT_PUBLIC_PLAID_ENV`=`production`, prod `PLAID_SECRET`, `PLAID_CLIENT_ID`. (Or Teller: `TELLER_ENVIRONMENT`/`NEXT_PUBLIC_TELLER_ENVIRONMENT`=`production`, `NEXT_PUBLIC_TELLER_APPLICATION_ID`, `TELLER_CERT_PEM`, `TELLER_KEY_PEM`.) Confirm `NEXT_PUBLIC_BANK_PROVIDER`.
- [ ] **Email** — ⚠️ defaults to `onboarding@resend.dev` if unset. `RESEND_API_KEY` (prod), `RESEND_FROM`=`invoices@perennial.design` (or chosen verified sender), optional `RESEND_BOOKINGS_FROM`.
- [ ] **OAuth secrets (prod)** — `NEXT_PUBLIC_GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`; `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` (+ `MICROSOFT_TENANT_ID`); `META_APP_ID` + `META_APP_SECRET` (or `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`).
- [ ] **Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (prod project `nmfzmbjjqsjcqkedswfc`).
- [ ] **App + misc** — `NEXT_PUBLIC_APP_URL`=`https://app.perennial.design`, `ANTHROPIC_API_KEY` (prod), `CRON_SECRET` (generate), `TRACKING_SALT` (custom).

### Provider dashboards → live mode + register prod redirect URIs
All redirect URIs are `https://app.perennial.design/...`

- [ ] **Stripe** → Live mode. Connect redirect: `/api/auth/stripe/callback`. Create webhook endpoints → `/api/stripe/webhook` (events: `payment_intent.succeeded`, `payment_intent.payment_failed`; one for the platform, one for connected accounts). Copy the two live signing secrets into env.
- [ ] **Google OAuth** — register redirects: `/api/auth/google/callback`, `/api/auth/google-calendar/callback`, `/api/auth/google-analytics/callback`.
  - ⚠️ **Publishing status:** Gmail/Calendar are "sensitive" scopes → full verification takes weeks. For beta, **Publish to "In production" (unverified)** — users get a one-time "unverified app → Advanced → Continue" screen, but refresh tokens then **last indefinitely**. Staying in **Testing** mode expires refresh tokens every **7 days** (the recurring calendar-disconnect; the app shows a Reconnect prompt for it, but it's annoying). Do full verification later to remove the warning / exceed 100 users.
- [ ] **Microsoft (Azure AD)** → register `/api/auth/microsoft/callback`; permissions Mail.Read, Calendars.ReadWrite, Contacts.Read; not restricted to testing.
- [ ] **Meta/Instagram** → register `/api/auth/meta/callback` + `/api/auth/instagram/callback`; switch app Development → Live.
- [ ] **Resend** → verify `perennial.design` sending domain (SPF/DKIM); use prod API key.
- [ ] **Plaid/Teller** → request production access (Plaid prod can need a review — start early).

### Supabase Auth
- [ ] **Custom SMTP** — ⚠️ default sender is rate-limited (~3–4/hr) + unbranded; real signups/password-resets will fail silently. Point Auth → SMTP at Resend.
- [ ] **URL config** — Site URL + redirect allowlist = `https://app.perennial.design/**` (and the `/auth` callback path).
- [ ] **Enable leaked-password protection** (Auth → Passwords) — flagged by the security scan, one toggle.

---

## 🟡 At / just after launch
- [ ] **GA4 Data API** — still disabled on Cloud project `525192339885`; Presence shows "No traffic" until enabled.
- [ ] **Cron** — Vercel Cron → `GET /api/cron/opportunities-ingest` with header `Authorization: Bearer $CRON_SECRET`.
- [ ] **Smoke test the money path** end-to-end in live mode: create + send an invoice → pay it from a phone (`/i/[token]`) → confirm webhook marks it paid + the confirmation email sends.

---

## 🟢 Security hardening (Supabase scan)
- [done] **[claude]** Pinned `search_path` on `handle_new_user` / `handle_updated_at` / `set_updated_at` / `update_updated_at`; revoked RPC `EXECUTE` on `handle_new_user` + `rls_auto_enable` (migration `harden_function_search_path_and_rpc_grants`).
- [ ] **[claude, needs verify]** Public buckets (`receipts`, `project-files`, `studio-logos`, `editor_images`) have a broad listing policy letting any client enumerate filenames (object URLs still work without it). Apply, then verify file display still works:
  ```sql
  -- buckets are public=true, so object URLs do NOT depend on these SELECT policies
  drop policy if exists "receipts_public_read"      on storage.objects;
  drop policy if exists "Public read project files" on storage.objects;
  drop policy if exists "studio_logos_public_read"  on storage.objects;
  drop policy if exists "editor_images_public_read" on storage.objects;
  ```
  Best done in staging first (confirm logos/receipts/images/canvas images still render), then prod.
- By design (no action): `ingest_website_event` (public tracking pixel) and the `integration_*` vault RPCs (re-check `auth.uid()` internally) are intentionally callable.

---

## Post-launch monitoring
- Vercel runtime logs (Claude can pull these): watch `/api/stripe/webhook`, `/api/auth/*/callback`, `/api/finance/send-invoice` for errors.
- Stripe Dashboard → Webhooks: confirm deliveries are 200.
- Supabase → Logs/Auth: watch for SMTP + RLS errors.

---

## Staging (set up after beta is live)
Goal: never test against beta users again.
- A `staging.perennial.design` domain on a Vercel **Preview** env (or a second project), with **test/sandbox** integration env vars (Stripe test, Plaid sandbox, Resend test, OAuth test app).
- A separate Supabase **project** (or a Supabase branch) for staging data — never point staging at the prod DB.
- Flow: feature branch → preview/staging deploy → verify → merge to `main` → prod. (Today it's `main` → prod directly.)
