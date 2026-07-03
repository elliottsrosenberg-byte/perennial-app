# design-sync notes — Perennial

Repo-specific gotchas for future re-syncs.

- **This is a Next.js APP, not a packaged component library.** No `dist/`, no Storybook.
  The converter runs in **synth-entry mode** — esbuild bundles `components/ui/*.tsx` directly,
  resolving the `@/*` tsconfig path alias. `srcDir: components/ui`, `cssEntry: app/globals.css`.
- **Styling is token-driven.** All color flows from `app/globals.css` tokens (`--color-*`,
  `--color-*-rgb` triplets, radius/shadow/type scales). The bundle re-skins from that file.
- **Excluded:** `RichEditor` (tiptap + Supabase upload + fetch — not a standalone-renderable
  design component; no default export).
- **Watch (next/link):** `Menu` and `VisitButton` import `next/link`. Outside a Next router
  these can throw. If their previews fail `[RENDER]`, add a provider/override or neutralize the link.
- **App-coupled behaviours (render fine statically, only fire on interaction):** `AshPromptsModule`
  and `EmptyState` dispatch a `open-ash` window CustomEvent on click; `CanvasAshHint` reads
  localStorage via useSyncExternalStore.

## Re-sync prep (before running the build)
- Create the self-symlink so the converter resolves the app as its own package (PKG_DIR):
  `ln -sfn "$(pwd)" node_modules/perennial-app`  (gitignored; recreate per clone).
  Run the build with `--node-modules ./node_modules` and NO `--entry` (triggers synth mode).
- Install render-check deps once: `(cd .ds-sync && npm i esbuild ts-morph @types/react playwright && npx playwright install chromium)`.

## TWO REQUIRED CONVERTER PATCHES (reapply after staging `.ds-sync/` each sync)
Synth-entry mode (app repo, no dist) needs two small edits to the staged converter libs.
Reapply them to `.ds-sync/lib/*` after copying the skill scripts, before running the build:

1. **`.ds-sync/lib/bundle.mjs`** — in `sharedBuildOptions()`, after
   `define: { 'process.env.NODE_ENV': '"development"' },` add:
   `banner: { js: 'globalThis.process=globalThis.process||{env:{}};' },`
   Why: the app's libs (next/link, supabase, pulled in transitively) read `process.env.*`
   at module load; without the shim the whole browser bundle throws "process is not defined".

2. **`.ds-sync/lib/source-kit.mjs`** — the synth-entry writer (`if (!entry) { … }` block) does
   `export * from <p>` per src file, which (a) never forwards DEFAULT exports and (b) ignores
   componentSrcMap-null. Replace it so it: filters out files whose basename is a
   componentSrcMap-null key (keeps RichEditor's tiptap/supabase OUT of the bundle), and for each
   remaining PascalCase file that contains `export default`, ALSO emits
   `export { default as <Base> } from <p>;`. (Needs `basename` added to the node:path import.)
   Why: our primitives are all `export default` — without this they never reach
   window.PerennialDS and every card shows the floor placeholder.

(These weren't made into `.design-sync/overrides/*.mjs` because those forks' relative `./common.mjs`
imports don't resolve from the overrides dir. Documented-patch is the reliable path here.)

## Re-sync risks
- Synth-entry mode means `.d.ts` contracts come from source inference, not a shipped types build —
  weaker than a real dist. Prop tables may need `dtsPropsFor` overrides for complex cases.
- next/link handling for Menu/VisitButton may be an override that ties to those components' source.
