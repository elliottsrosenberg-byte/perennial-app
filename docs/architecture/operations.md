# Operations, Observability & Workflow

How the **running system** is observed and how **work flows** through the tools around the
codebase. The other architecture docs map the code; this one maps everything *around* it —
error/analytics tooling, the deploy path, the issue pipeline, and how an automated agent
(Claude Code) fits in.

Read this before debugging a production issue, wiring a new external service, or reasoning
about "how does a bug report become a merged fix." Companions:
[`dev-workflow.md`](../dev-workflow.md) (the staging/git safety plan) and
[`launch-checklist.md`](../launch-checklist.md) (the one-time test→prod integration flip).
This doc deliberately does **not** restate those — it links to them.

> **Secrets:** every service below is configured with env vars whose **names** are listed
> here. The **values** live only in `.env.local` (local) and Vercel env vars (deploy) —
> never in the repo, never in this doc. `.env.local` is the de-facto source of truth; there
> is no committed `.env.example` (worth adding — see Gaps).

---

## Two layers

1. **Observability** — what's happening inside the deployed app: Sentry (errors), PostHog
   (product analytics + replay). Plus the first-party tracking pixel, which is a *product
   feature*, not app monitoring (see the caveat below).
2. **Work pipeline** — how a bug/idea becomes shipped code: Slack (intake) → Linear (queue)
   → Claude Code (agent/hands) → GitHub branch+PR → Vercel preview → review → merge → prod.

---

## Observability stack

### Sentry — error & performance monitoring of the Perennial app

Catches unhandled exceptions and traces across server, edge, and client runtimes.

| File | Role |
| --- | --- |
| `sentry.server.config.ts` | Node runtime init (loaded by `instrumentation.ts` when `NEXT_RUNTIME === "nodejs"`); structured logs + 100% trace sample rate |
| `sentry.edge.config.ts` | Edge runtime init (proxy.ts, edge handlers) |
| `instrumentation.ts` | Server hook: dynamically imports the right config per runtime; registers `onRequestError = Sentry.captureRequestError` |
| `instrumentation-client.ts` | Client init; instruments App Router client navigations via `onRouterTransitionStart`. **Session replay is intentionally left to PostHog**, not Sentry |
| `app/global-error.tsx` | Root error boundary → `Sentry.captureException()` before fallback UI |
| `next.config.ts` | Wraps config with `withSentryConfig()` (org `perennial-app`, project `javascript-nextjs`) |

- **Env:** `NEXT_PUBLIC_SENTRY_DSN` (shared by all three configs). `SENTRY_AUTH_TOKEN`
  (optional, build-time) uploads source maps so prod stack traces de-minify.
- **Division of labor:** Sentry owns errors + traces. PostHog's own exception capture is
  **off** (`capture_exceptions: false`) so nothing is double-reported.
- **Dashboard:** sentry.io (org `perennial-app`). MCP: the `sentry` server is connected —
  an agent can `search_issues` / `search_events` / `analyze_issue_with_seer` to triage prod
  errors directly.
- **Source maps:** `SENTRY_AUTH_TOKEN` **is set** in Vercel (Production + Preview). The
  prod build uploads source maps after the Turbopack compile (`silent: !CI`,
  `widenClientFileUpload: true` in `next.config.ts`) — confirmed in the build log
  (`Uploaded files to Sentry` + a Source Map Upload Report), so prod stack traces de-minify.
- **No Sentry tunnel:** `withSentryConfig` sets only org/project/silent/widenClientFileUpload
  — there is **no** `tunnelRoute`, so client error reports post directly to Sentry's ingest
  (could be ad-blocked; minor for a beta). Contrast PostHog, which proxies via `/ingest`.

### PostHog — product analytics + session replay (of the Perennial app)

Watches how users move through *our* app: events, funnels, session recordings.

| File | Role |
| --- | --- |
| `components/analytics/PostHogProvider.tsx` | Wraps the app; opts capture **out** for admin impersonation sessions (`isImpersonationSession()`) |
| `components/analytics/PostHogAuth.tsx` | Ties PostHog identity to the Supabase session: `posthog.identify(user.id, {email})` on sign-in, `posthog.reset()` on sign-out; enforces opt-out + clears the `ph_impersonated` cookie during impersonation |
| `lib/posthog/config.ts` | Central config: `api_host: "/ingest"` (same-origin reverse proxy to dodge ad blockers), `ui_host`, `capture_exceptions: false`, `isImpersonationSession()` cookie helper |
| `next.config.ts` | Rewrites `/ingest/static/* → us-assets.i.posthog.com`, `/ingest/* → us.i.posthog.com` |

- **Env:** `NEXT_PUBLIC_POSTHOG_KEY` (write-only public key), `NEXT_PUBLIC_POSTHOG_HOST` (optional).
- **Impersonation suppression:** when an admin "Views as" a user, `/auth/confirm` sets a
  `ph_impersonated=1` cookie → PostHog initializes opted-out so the impersonated user's
  analytics/replays aren't polluted. See the `project_invoice_*`/admin-impersonation history.
- **Dashboard:** us.posthog.com (project "Default project", id 473746). MCP: the `posthog`
  server is connected — agents can run queries via its tools.

### First-party tracking pixel — analytics for the USER'S external website (a feature, not monitoring)

> ⚠️ **Don't confuse this with PostHog.** PostHog watches the Perennial app. This pixel is a
> *product feature*: it lets a Perennial user track traffic on *their own* website, surfaced
> in Presence. Different purpose, different data store.

| File | Role |
| --- | --- |
| `app/api/track/route.ts` | Public unauthenticated ingest. Accepts `{t: site_token, u: path, r: referrer}`; hashes IP+UA+date with `TRACKING_SALT` into a daily-rotating `visitor_hash` (unique visitors, no PII); calls Supabase RPC `ingest_website_event()` |
| `app/api/track/script/[token]/route.ts` | Serves the embeddable tracker JS (Edge): fires pageview, hooks `pushState`/`popstate` for SPA nav, `sendBeacon` on unload, opt-out via `?perennial-track=0` |

- **Env:** `TRACKING_SALT` (defaults to a baked-in string if unset — set a real one in prod).
- **RPC:** `ingest_website_event` is a SECURITY DEFINER function (see
  [`data-model.md`](./data-model.md)); intentionally public-callable.

---

## Work pipeline — from report to shipped code

```
Slack (Elliott + users file bugs/ideas)
   │   Linear Slack integration: 🔗 react or /linear → Triage issue (NOT YET WIRED — see PER-62)
   ▼
Linear  ── Triage ──►  human triage gate (accept / prioritize / label)   ← keep this
   │      (team PER; projects = modules; labels: Type + Source group)
   ▼
Claude Code (the agent / "hands")
   │   branch named with the issue id (e.g. elliott/per-8-…) → implement
   ▼
GitHub  ── PR ──►  Vercel auto-builds a Preview deploy per PR
   │   (Linear GitHub integration auto-moves the issue Todo→In Progress→In Review→Done — NOT YET WIRED)
   ▼
Elliott reviews the preview → merges to main → Vercel deploys prod (app.perennial.design)
   ▲
Sentry + PostHog observe prod → new errors/friction feed back into Linear
```

**Roles (the mental model):** Slack = intake. Linear = the queue/brain (*what* to do).
Claude Code = the hands (*does* it). Linear never touches the codebase; the agent does.

### The tools, as external services

| Tool | Role | In the repo? | How an agent touches it |
| --- | --- | --- | --- |
| **Slack** | User/community intake of bugs & ideas | **No code** — purely external | Reaches it only via the (future) Linear Slack integration; agents don't call Slack directly |
| **Linear** | Issue queue, projects, priorities, status | **No code** — external via MCP | `linear` MCP server: read/create/update issues. Team `Perennial` (PER). See [`project_linear_workflow` memory] |
| **GitHub** | Source of truth for code; branch→PR | Git remote; **no `.github/` CI** | `gh` CLI / git. Branch per issue; PR per issue |
| **Vercel** | Hosting; per-PR previews; prod from `main` | Vercel git integration (no `vercel.json`) | `vercel` MCP: deployments, build/runtime logs |
| **Claude Code** | The coding agent | `AGENTS.md`, `CLAUDE.md`, `~/.claude/.../memory/` | This. Instruction layer + persistent memory + all the MCP servers above |

### Decisions in force (2026-06-17)

- **PR-per-issue**, not push-to-main, now that there are real users. (Supersedes the
  "commit straight to main" habit for feature work; a trivial-UI fast path may remain per
  `dev-workflow.md`.)
- **Human triage gate stays.** Never wire untrusted user/Slack text straight into a
  code-writing agent — that's a prompt-injection path. A human accepts an issue out of
  Triage before any agent acts on it.
- Dispatch starts as **mode 1**: Elliott says "work PER-N", the agent implements + opens a
  PR. A scheduled agent over an `agent-ready` label comes later (tracked as the auto-fix
  pipeline, PER-63/PER-64).

---

## Cron / scheduled jobs

| File | Schedule | What it does | Auth |
| --- | --- | --- | --- |
| `app/api/cron/opportunities-ingest/route.ts` | Weekly (configured in the **Vercel dashboard**, no `vercel.json`) | `GET` returns a worklist (draft / unverified / stale >21d opportunities, ≤80). `POST {items}` upserts opportunities by title + stamps `last_verified_at`. Uses `createAdminClient()` (service-role) | `Authorization: Bearer $CRON_SECRET` |

`CRON_SECRET` must be set in Vercel for the cron to authenticate (tracked: PER-66).

---

## Environment variables — service map

Names only; values live in `.env.local` + Vercel. Test/sandbox vs live values are the
[`launch-checklist.md`](../launch-checklist.md) flip.

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Sentry:** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (optional, source maps)
- **PostHog:** `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (optional)
- **Tracking pixel:** `TRACKING_SALT`
- **Email (Resend):** `RESEND_API_KEY`, `RESEND_FROM` (+ optional `RESEND_BOOKINGS_FROM`)
- **Stripe:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` (+ `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_CONNECT_WEBHOOK_SECRET` per launch-checklist)
- **Banking:** Teller (`TELLER_APPLICATION_ID`, `TELLER_SIGNING_KEY`, `TELLER_ENVIRONMENT`, `TELLER_CERT_PEM`, `TELLER_KEY_PEM`, `NEXT_PUBLIC_TELLER_*`) or Plaid (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `NEXT_PUBLIC_PLAID_ENV`); selected by `NEXT_PUBLIC_BANK_PROVIDER`
- **OAuth:** Google (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), Microsoft (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`), Meta/Instagram (`NEXT_PUBLIC_META_APP_ID`, `META_APP_SECRET`)
- **Cron:** `CRON_SECRET`
- **App / AI:** `NEXT_PUBLIC_APP_URL`, `ANTHROPIC_API_KEY`

Reads are mostly direct `process.env.*` at point of use; `lib/posthog/config.ts` is the one
small central config module. See [`data-model.md`](./data-model.md) for how integration
secrets (per-user OAuth tokens, API keys) live in **Supabase Vault**, distinct from these
deploy-level env vars.

---

## Known gaps (things an agent should NOT assume exist)

- **No CI.** There is no `.github/` directory and no GitHub Actions — nothing runs
  tsc/lint/build/tests on push or PR. Review is manual via the Vercel preview. A CI gate is
  a prerequisite before the autonomous auto-PR agent (PER-64) is safe.
- **No `vercel.json`.** Cron + build settings are configured in the Vercel dashboard, not
  in the repo — they're invisible to a code search.
- **No `.env.example`.** New-env discovery means reading `.env.local` or this doc. Adding a
  committed example file would help.
- **Linear/Slack integrations not yet wired** (PER-62) — the pipeline diagram's
  Slack→Linear and GitHub→Linear auto-status arrows are aspirational until then.
- **No code presence for Slack or Linear** — both are external-only; don't grep for them.
