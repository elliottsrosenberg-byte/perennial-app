# Perennial Design System — how to build with it

Perennial is the studio-OS for creative businesses (projects, invoices, contacts,
galleries, calendar). These are its real, shipped React primitives. Build with them
directly — every component here maps 1:1 onto code the Perennial app runs.

## Setup — no provider needed

There is **no theme provider or wrapper to mount.** All design tokens are global CSS
custom properties defined at `:root` in the bundled stylesheet (`styles.css`). Import a
component and render it; it styles itself from those tokens. Light and dark modes switch
by setting `data-theme="light" | "dark"` on an ancestor (`:root`/`<html>`) — the same
tokens flip. Don't wrap anything.

```jsx
import { Button, Badge, Card } from 'perennial-app';

<Card padding="lg">
  <Badge tone="green" variant="status">Complete</Badge>
  <h3 style={{ font: 'var(--text-lg)/1.3 var(--font-display)', color: 'var(--color-text-primary)', margin: '8px 0 4px' }}>
    Foster Apartment
  </h3>
  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
    Interior furniture spec · 3 pieces
  </p>
  <div style={{ marginTop: 12 }}>
    <Button variant="primary" size="sm">Open project</Button>
  </div>
</Card>
```

## Styling idiom — inline styles + design tokens (NOT utility classes)

This system has **no utility-class framework** on its surface (no `bg-*`/`p-*` classes).
Components are styled internally with inline styles that read design tokens, and you do the
same for your own layout glue: write inline `style={{…}}` and reference tokens via
`var(--token)`. Never hardcode a hex/rgba — always a token, so everything re-skins together.

The token vocabulary (all `var(--…)`), from `styles.css`:

| Group | Tokens |
|---|---|
| Text color | `--color-text-primary` `--color-text-secondary` `--color-text-tertiary` |
| Surfaces | `--color-surface-raised` `--color-surface-app` `--color-surface-sunken` `--color-cream` |
| Brand / accent | `--color-sage` `--color-sage-hover` `--color-blue` `--color-gold` `--color-green-deep` `--color-red-orange` `--color-purple` `--color-teal` |
| Tint bases (α) | `rgba(var(--color-sage-rgb), 0.12)` — also `--color-charcoal-rgb` `--color-blue-rgb` `--color-red-rgb` `--color-gold-rgb` etc. |
| Borders | `--color-border` `--color-border-strong` |
| Radius | `--radius-sm` (6) `--radius-md` (8) `--radius-lg` (12) `--radius-xl` (16) `--radius-full` |
| Shadow | `--shadow-sm` `--shadow-card` `--shadow-md` `--shadow-lg` `--shadow-overlay` |
| Type scale | `--text-xs`…`--text-5xl` |
| Font | `--font-display` (serif, headings) `--font-sans` (body) |

## Where the truth lives

- **`styles.css`** — every token, with its light/dark values. Read it before styling.
- **`<Name>.prompt.md`** + **`<Name>.d.ts`** (per component) — the prop API and usage.

## Component notes

- **Button** `variant`: primary (sage), dark (charcoal), secondary (outline), ghost, danger.
- **Badge** — the one pill primitive. `variant`: status (uppercase tint), tag (lowercase tint),
  solid (filled). `tone`: sage/green/amber/orange/red/blue/gold/purple/teal/neutral.
- **Card** — surface container. `variant`: raised/flat/sunken; `padding`: none/sm/md/lg.
- **Modal** — the shared dialog shell (scrim + Esc + scroll-lock). Pass `title`/`footer` for
  the standard chrome, or a custom `header`. `ConfirmDialog` is the confirm-prompt built on it.
- **Select / Toggle / Checkbox / NumberStepper / DatePicker** — controlled inputs
  (`value`/`checked` + `onChange`).
- **EmptyState** — icon + heading + body + optional action/tips, for empty screens.
