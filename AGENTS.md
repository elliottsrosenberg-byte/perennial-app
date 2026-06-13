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

Much of the app was built by **cloning, not sharing** — one logical change
often means editing the same thing in 4–13 places. Grep first; consult the
duplication registry in `change-playbook.md`.

## Rich text

Inline images: any surface using `getRichExtensions` gets paste/drop/picker
uploads to the `editor_images` storage bucket. Max 10 MB, JPEG/PNG/GIF/WebP/SVG.
Objects are owner-namespaced under `${userId}/...` and publicly readable. The
upload helper lives at `lib/uploads/editor-image.ts`. The Notes Import flow
(`components/notes/ImportNoteModal.tsx`) reuses the same helper to bring
embedded PDF/DOCX images in alongside text.
