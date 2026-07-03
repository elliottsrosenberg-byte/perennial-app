<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Architecture map (read before app-wide changes)

`docs/architecture/` is the canonical map of the codebase. Before making any
change that touches more than one module — UI/design tokens, the detail/scrim
panel, data patterns, mobile layout — start there so the edit propagates
without missing spots:

- [`README.md`](docs/architecture/README.md) — stack, routing, tenancy, conventions, module index
- [`modules.md`](docs/architecture/modules.md) — per-module map (routes, components, tables, patterns, TODOs, mobile issues)
- [`data-model.md`](docs/architecture/data-model.md) — tables, RLS, tenancy, Vault secrets, write paths
- [`design-system.md`](docs/architecture/design-system.md) — tokens, inline-style convention, `components/ui/` primitives, duplication
- [`mobile-responsiveness.md`](docs/architecture/mobile-responsiveness.md) — current state + remediation plan
- [`change-playbook.md`](docs/architecture/change-playbook.md) — **"to change X app-wide, edit exactly these files"** + the duplication registry
- [`operations.md`](docs/architecture/operations.md) — observability (Sentry/PostHog/tracking pixel), the work pipeline (Slack→Linear→agent→PR→Vercel), cron, env-var map; read before debugging prod or wiring a new service

Much of the app was built by **cloning, not sharing** — one logical change
often means editing the same thing in 4–13 places. Grep first; consult the
duplication registry in `change-playbook.md`.

## Design system — MANDATORY (no hardcoded colors, no cloned primitives)

Every design decision flows through the design system. This is enforced by a
post-edit hook (`scripts/check-design-tokens.mjs`); don't wait for it — follow
these rules as you write:

1. **Never write a raw color.** No `#rrggbb`, no `rgba(<numbers>)` in styles.
   Use `app/globals.css` tokens: `var(--color-*)` for solids, and
   `rgba(var(--color-<hue>-rgb), α)` for tints. Need a color with no token?
   Add the token to `globals.css` first, then reference it. The only raw
   values allowed are pure black/white contrast anchors (`rgba(0,0,0,α)`
   shadows, `rgba(255,255,255,α)` overlays, `#fff`/`#000`) and genuine
   third-party brand colors (Stripe/Google logos) — everything else is a token.
2. **Reuse `components/ui/` primitives — never re-clone them.** Buttons →
   `Button`, pills/tags/status → `Badge`, any dialog → `Modal` (or
   `ConfirmDialog`), surfaces → `Card`, dropdowns → `Select`/`Menu`, toggles →
   `Toggle`/`Checkbox`, empty screens → `EmptyState`, etc. If a primitive
   doesn't cover a need, EXTEND the primitive (add a prop/variant) rather than
   hand-rolling a one-off. Grep `components/ui/` before building any control.
3. **Radius/shadow/spacing/type are tokens too** — `var(--radius-*)`,
   `var(--shadow-*)`, `var(--text-*)`, `var(--font-*)`. No magic pixel colors
   or bespoke box-shadows.

Why it matters: the token layer is what lets the whole app re-skin from one
file and stay in sync with the Claude Design project (see `.design-sync/`).
A hardcoded value is a decision the system can't control. Documented
exceptions live in `.design-sync/NOTES.md` (tour animations, the `/design`
showcase, the public booking page's sub-palette). Full reference:
`docs/architecture/design-system.md`.

## Rich text

Inline images: any surface using `getRichExtensions` gets paste/drop/picker
uploads to the `editor_images` storage bucket. Max 10 MB, JPEG/PNG/GIF/WebP/SVG.
Objects are owner-namespaced under `${userId}/...` and publicly readable. The
upload helper lives at `lib/uploads/editor-image.ts`. The Notes Import flow
(`components/notes/ImportNoteModal.tsx`) reuses the same helper to bring
embedded PDF/DOCX images in alongside text.
