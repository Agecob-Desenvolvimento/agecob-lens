# design-sync notes — AgDash / agecob-lens

## Repo shape

`agecob-lens/src/components/ui/` (shadcn/ui, 48 files) has no own `package.json`,
no `dist/`, no Storybook anywhere in the monorepo. Synced as **package shape,
synth-entry** treating the whole `agecob-lens/` frontend package as the DS
package, scoped to `src/components/ui` via `cfg.srcDir`.

`agecob-lens/reference/*.html` (design-prototype.html, design-specs.html) are
static Claude-Artifact-bundler exports (mockups), not source — not usable by
design-sync. Ignore them on future syncs unless the repo grows a real
component build.

## PKG_DIR resolution trick

No real npm package for the ui/ folder, so `cfg.pkg`/`--node-modules` can't
resolve `PKG_DIR` the normal way. Used the `--entry` walk-up path instead:

```
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./agecob-lens/node_modules \
  --entry ./agecob-lens/src/main.tsx \
  --out ./ds-bundle
```

`--entry` just needs to be ANY real file inside `agecob-lens/` — the script
walks up from its dirname looking for the nearest `package.json` with a
`name` field, lands on `agecob-lens/package.json` (name: `vite_react_shadcn_ts`,
generic → `cfg.globalName` set explicitly to `AgecobLensUI` instead of
deriving from that name). `--node-modules` points at `agecob-lens/node_modules`
(the real one, where react/radix/etc. actually live) — do NOT point it at the
repo root.

## Render check — skipped this sync (machine-unverified)

The environment's connection to Microsoft's Playwright CDN was extremely slow
(chromium-1217 full browser: ~180MB took ~40min; chromium_headless_shell-1217,
needed for the actual render check, ran 60+ min without finishing — process
was alive/healthy, not hung, just a very slow link). User explicitly chose to
skip it (`--no-render-check`) rather than keep waiting. Consequence: **no
component preview in this sync was machine-verified to actually render** —
only that all 25 authored `.tsx` previews + all 246 floor cards compiled
without esbuild errors. Grading (`package-capture.mjs`, screenshot-based
absolute rubric) never ran either, for the same reason — no grade.json files
exist for any of the 25 authored components.

**Before the next re-sync claims these components are "verified," someone
should**: retry `cd .ds-sync && npx playwright install chromium` (idempotent,
resumes chromium-1217 which IS already fully downloaded — only
chromium_headless_shell-1217 is missing) on a connection that isn't
bandwidth-starved, then run `package-validate.mjs` (full render check) and
`package-capture.mjs` (grade the 25 authored previews) for real. Until then,
treat every authored preview here as "compiles, unconfirmed rendering."

## Types/declaration step — MUST run before package-build.mjs

No `.d.ts` ships for `src/components/ui/` (no `tsc` build in this app —
`vite build` only, `noEmit: true`). Without real `.d.ts`, `<Name>Props` comes
out empty for every component (converter's `dts` loader is purely
.d.ts-driven, no .tsx type-inference fallback). Generated one via a
gitignored declaration-only `tsc` pass, run BEFORE every `package-build.mjs`:

1. `agecob-lens/index.ts` (gitignored, committed content lives only in this
   NOTES.md) — barrel re-exporting every `src/components/ui/*.tsx`:
   `export * from './src/components/ui/<name>';` for all 48 files. One
   collision: `sonner.tsx` and `toaster.tsx` both export `Toaster` — sonner's
   is renamed on import: `export { Toaster as SonnerToaster, toast as
   sonnerToast } from './src/components/ui/sonner';`.
2. `agecob-lens/.ds-tsconfig.json` (gitignored) — extends `tsconfig.app.json`,
   overrides `noEmit:false, declaration:true, emitDeclarationOnly:true,
   outDir:"./.ds-types-tmp"` (NOT `"."` — TS auto-excludes an outDir that
   equals the project root, which silently drops every `include` pattern —
   `[TS18003] no inputs found` is the symptom), `include:["index.ts",
   "src/components/ui/**/*"]`.
3. `cd agecob-lens && npx tsc -p .ds-tsconfig.json` — emits `index.d.ts` +
   `src/components/ui/*.d.ts` + a few transitive deps (`src/lib/utils.d.ts`,
   `src/hooks/use-mobile.d.ts`, `src/hooks/use-toast.d.ts`) into
   `.ds-types-tmp/`, mirroring the real tree.
4. `cp -r .ds-types-tmp/. . && rm -rf .ds-types-tmp` — copies the mirrored
   `.d.ts` tree in place next to their `.tsx` sources (all gitignored via
   `agecob-lens/.gitignore` — `/index.ts`, `/index.d.ts`,
   `/.ds-tsconfig.json`, `/.ds-types-tmp/`, `src/components/ui/*.d.ts`,
   `src/hooks/use-mobile.d.ts`, `src/hooks/use-toast.d.ts`, `src/lib/utils.d.ts`).
5. THEN run `package-build.mjs` with `--entry ./agecob-lens/index.ts` (this
   file doubles as the tsc declaration entry AND the esbuild bundle entry —
   its dirname walk-up finds `agecob-lens/package.json` directly, so
   `PKG_DIR` = `agecob-lens` correctly, no `--node-modules`/`cfg.pkg` tricks
   needed). Result: 246 components discovered (48 root components + ~198
   sub-parts like `TableRow`, `DialogTrigger`, `SidebarMenuItem` — shadcn
   files each export several named parts; `partitionSubcomponents` groups
   these under their parent automatically, no standalone preview needed for
   subcomponents).

Re-sync must repeat steps 1–4 (regenerate the barrel + declarations) before
step 5 — none of this persists in git by design (no benefit to committing
generated .d.ts; regeneration is ~10s).

## cssEntry hash gotcha — re-sync must-do

`cfg.cssEntry` points at `agecob-lens/dist/assets/index-<HASH>.css` — Vite
content-hashes this filename on every `npm run build`. **Before every
re-sync**: run `npm run build` inside `agecob-lens/`, then `ls
agecob-lens/dist/assets/*.css` and update `cfg.cssEntry` in
`.design-sync/config.json` to the new hash, or the build fails
`[CSS_IMPORT_MISSING]`. No stable-filename build config was set up (would
touch the production Vite config for design-sync's convenience only — not
done).

## Preview-authoring constraint

Tailwind content glob (`tailwind.config.ts`) is `./src/**/*.{ts,tsx}` only —
`.design-sync/previews/*.tsx` lives outside `src/`, so any *new* utility
class invented in a preview (not already used inside the component's own
source file, e.g. `button.tsx`'s `cva()` variants) will NOT be in the
compiled CSS and will render unstyled. Previews must compose real components
via props/children only; any wrapper layout markup should reuse classes
already present elsewhere in `agecob-lens/src/**`, not new ones. Did not add
`.design-sync/previews/**` to the Tailwind content array — that would leak
preview-only classes into the production app bundle.

## Known render warns

- `[TOKENS_MISSING]` — `--radix-navigation-menu-viewport-height`,
  `--radix-navigation-menu-viewport-width`, `--radix-accordion-content-height`,
  `--tw-shadow-color`: all 4 are set at runtime by Radix/Tailwind JS, not in
  any shipped stylesheet. Confirmed non-issue, not chasing.
- `[RENDER_BLANK]` on floor cards for out-of-scope subcomponents:
  `BreadcrumbEllipsis`, `InputOTPSeparator`, `PaginationEllipsis`,
  `SidebarInput`, `SidebarMenuSkeleton` — small/leaf components, floor-card
  typographic block is legitimately tiny. Not in the authored-preview scope
  (§2.5 core set), left as floor cards by design.
- `[RENDER_BLANK]` on `Avatar`, `Checkbox`, `Input`, `Progress`, `Slider`,
  `Textarea` floor cards — these ARE in the core authoring scope, expected
  to clear once their `.design-sync/previews/<Name>.tsx` is authored.

## Re-sync risks

- Rebuilding `agecob-lens` regenerates the CSS hash (see above) — the config
  update step is manual, not automated.
- `dist/` here is a local dev artifact, not the production build (prod lives
  on the Windows server at `C:\agecob`, this checkout is `Documents\dash
  relatorio`) — safe to overwrite freely for CSS-scraping purposes.
- Design tokens live in `agecob-lens/src/index.css` (`:root` HSL vars) +
  `tailwind.config.ts` (`hsl(var(--*))` mappings) — no dark-mode `.dark`
  block exists yet, so previews only reflect light mode.
- Floor-card components (everything outside the ~20-25 scoped core set) are
  the standing offer for incremental authoring on a future sync.
