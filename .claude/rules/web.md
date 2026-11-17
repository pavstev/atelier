---
paths:
  - "app/web/**"
  - "scripts/*.sh"
  - "wrangler.jsonc"
  - ".claude/skills/ship/**"
---

# Web app and release

- Browser tests: Playwright, Chromium, headless, 4 workers. Never a visible window. Do not edit
  `src/` or `vite.config.ts` while a run is going: Vite reloads and a test times out.
- Test hooks are `data-testid`s set in the components under `app/web/src/` (`features/`, `ui/` and `App.tsx`; for
  example `photo-hold`, `base`, `opacity-base`, `values-preset`, `shapes-step`,
  `edges-mode`, `edges-amount`, `edges-even`, `edges-width`, `grid-mode`, `grid-cells`, `grid-width`,
  `grid-group`, `grid-center`, `grid-paint`, `grid-color`, `values-detail`, `values-tint`,
  `shapes-detail`, `layer-edges`, `layer-grid`,
  Pencil base: `pencil-look` (a select with Tone, Drawing, Zones, Hatch and By pencil; set it like the
  other hidden selects) and `pencil-look-hint` (the line under it); the Tone group `pencil-tone-group`
  with the sliders `pencil-key` (label Brightness), `pencil-contrast` and `pencil-detail`; the
  effect chips `pencil-effects` with `pencil-effect-smudge|lift|cross` (`aria-pressed`; cross in
  Drawing and Hatch only; none in Zones and By pencil); the fold `pencil-fine` (a `<details>`, closed
  at the start) with `pencil-highlights`, `pencil-darks`, `pencil-local`, the amounts `pencil-smudge`,
  `pencil-lift`, `pencil-cross` and the Texture group `pencil-texture-group` (Drawing and Hatch only)
  with `pencil-grain`, `pencil-paper` (a row of radios: Smooth, Medium, Rough), `pencil-hatch-angle`
  and `pencil-hatch-density` (Hatch only); `pencil-step` (a slider, By pencil only) and
  `pencil-step-line` ("Step 4 of 8: HB"); `pencil-reset`; `pencil-auto` (not in Zones) and
  `pencil-auto-note` (`aria-live` polite; empty when there is no note); `pencil-suggest-count` (radios
  3 to 6), `pencil-suggest`, `pencil-suggested` (`data-mask`) with one `pencil-suggested-grade`
  (`data-grade`) per chip, `pencil-suggest-apply` (disabled when the suggestion is the set) and
  `pencil-error`; `pencil-grades` (the row) with one `pencil-grade` per pencil (`data-grade`,
  `aria-pressed`); the legend
  (`legend`, label "Pencil legend") has a `legend-swatch` per level with `data-grade` and
  `data-share`, and in By pencil the row of the step has `data-step="true"`, `aria-current="step"` and
  a `legend-step` badge; on a pencil picker card `picker-grade` (`data-grade`; `data-step="true"`
  when it names the step pencil), `picker-step`, `picker-hint` and
  `picker-pressure` replace the paint rows; while Pencil is the base `tool-edges` is disabled
  (`aria-disabled`),
  `stage`, `facts`, `file`, `error`, `legend`, `legend-swatch`, `lock-width`, `screen-width`, `screen-found`, `lock-card`
  (the small cm card),
  `photos`, `photo-scroll`, `photo-row` (has `data-active`), `photo-open`, `photo-add`, `photo-search-toggle`, `photo-search`, `photo-search-clear`, `photo-sort`,
  `photo-layout`, `photo-count`, `photo-rename`, `photo-name`, `photo-delete`, `stage-bar`, `stage-bar-frame` (holds `--bar-left`), `bar-handle` (the grip, a slider; not on a phone), `logo`, `files-resize`, `panel-scrim`, `photo-card`, `photo-card-image`, `logo-outline`,
  `files`, `files-fold` and `files-expand` (the handle on the stage edge), and the bottom bar:
  `tool-base`, `tool-edges`, `tool-grid` (the bar buttons), `tool-picker` (the color picker toggle;
  has `aria-pressed`; while on, `picker-card` follows the mouse, has `data-pinned`, `data-color`,
  `data-mix` and `data-error`, and holds `picker-swatch`, `picker-result`, `picker-parts` and one
  `picker-verdict`, `picker-ring` (the area under the mouse), and one `picker-white|yellow|red|lake|phthalo|black` row with `data-share` and
  `data-parts`; a held card also has `picker-dry` (the dry hint) and, for a skin color,
  `picker-skin` with `picker-skin-warm|same|cool` rows (each has `data-mix`); `picker-mark` is the
  pin), `tool-popup` (the open card or sheet;
  has `data-tool`), `tools` (the body inside a card; only one card is open at a time),
  `opacity-base`, `opacity-edges`, `opacity-grid`, `zoom-menu` (the zoom button; has `data-locked`),
  `zoom-percent` (its text), and the menu items `zoom-fit`, `zoom-actual`, `zoom-200`, `zoom-real`,
  `zoom-unlock` (they exist only while the menu is open). The controls of a tool exist only while its
  card is open. `files` has `data-collapsed`; `facts` has `data-held`, the
  photos in the layers worker, and `data-photos`, the count of photos; the text of `facts` is screen-reader only).
  A hidden native `<select>` sits behind each Hero UI select; set it with the native value setter
  and fire `change` and `input`. A row of buttons (`base`, `values-tint`, `edges-mode`,
  `grid-mode`, `grid-group`, `grid-paint`) has buttons with the role `radio`: click one.
- A change to what a tool draws: run `mise run web:e2e`. If the golden pictures move and the
  change is meant, `mise run web:golden:bless` (it wipes `e2e/golden` first), then say why in the
  commit. The synthetic photo for the goldens is drawn in the spec, so no photo is in git.
- Icons and share images: `mise run web:brand` makes every file in `public/` (favicons,
  app icons, `og.png`, `og-square.png`) from `app/web/brand/logo.svg` and `logo-small.svg`. Change the logo
  there, run it, commit the files. The logo sources and notes are in `docs/design/brand.md`.
- Real photos stay in `.agents/web-photos/` (ignored).
- Release is `mise run release`: check, e2e, a smoke test on the built app with the Cloudflare
  headers (`PREVIEW=1`), deploy, then the same smoke test on the live site (`URL=...`).
  `mise run deploy` is the deploy alone.
- Cloudflare: Worker `atelier` on `atelier.stevanpavlovic.com`, account id pinned in
  `wrangler.jsonc`. `scripts/deploy.sh` stops on any other account. `public/_headers` holds the CSP and the cache rules; change it with the wasm in mind
  (`'wasm-unsafe-eval'`).
- A push to main starts a Workers Build (settings in the dashboard: Worker `atelier`, Settings,
  Builds). Build command `bash scripts/ci-build.sh`, deploy command
  `pnpm --dir app/web exec wrangler deploy --config ../../wrangler.jsonc` (pnpm runs in `app/web`, so the config path starts with `../../`), preview builds off, build
  caching on, variable `PNPM_VERSION=12.9.1`. The build image has no Rust. `ci-build.sh` asks
  `scripts/wasm-fresh.sh check` first: when no Rust input changed since the glue in `app/web/wasm/`
  was made, it skips Rust and builds only the web app. Otherwise it installs Rust and builds the
  wasm cold, about 4 minutes (the build cache does not restore cargo). The glue is committed at
  release (`mise run release`). The build runs no checks: the pre-push hook runs `mise run check` first. It writes
  `dist/version.txt` with the commit sha, so `https://atelier.stevanpavlovic.com/version.txt`
  tells which commit is live.
- Work lands on main in one commit (the owner's rule). Say which commit is live before you call
  a push deployed.

## PWA

- The worker is `src/sw/sw.ts`, built by `scripts/swPlugin.ts` after the app. Production only: dev never
  registers it. Cache `atelier-shell-<version>` (the plugin hashes the build); share cache `atelier-share`.
- An update waits for `{type:"SKIP_WAITING"}` from the page. Never skip silently.
- The worker answers only same-origin GET and `POST /share`. A new file in `public/` is precached
  by the plugin, so check its size.
- Slow test: `PREVIEW=1 pnpm --dir app/web exec playwright test pwa-offline.spec.ts pwa-manifest.spec.ts pwa-share.spec.ts pwa-update.spec.ts`.
