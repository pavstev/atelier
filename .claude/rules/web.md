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
  `stage`, `facts`, `file`, `error`, `legend`, `legend-swatch`, `swatch-zoom`,
  `swatch-zoom-color`, `swatch-full`, `lock-width`, `screen-width`, `screen-found`, `lock-card`
  (the small cm card),
  `photos`, `photo-scroll`, `photo-row` (has `data-active`), `photo-open`, `photo-add`, `photo-search-toggle`, `photo-search`, `photo-search-clear`, `photo-sort`,
  `photo-layout`, `photo-count`, `photo-rename`, `photo-name`, `photo-delete`, `stage-bar`, `logo`, `files-resize`, `panel-scrim`, `photo-card`, `photo-card-image`, `logo-outline`,
  `files`, `files-fold` and `files-expand` (the handle on the stage edge), and the bottom bar:
  `tool-base`, `tool-edges`, `tool-grid` (the bar buttons), `tool-picker` (the color picker toggle;
  has `aria-pressed`; while on, `picker-card` follows the mouse, has `data-pinned`, `data-color`
  and `data-mix`, and holds `picker-swatch`, `picker-result`, `picker-parts` and one
  `picker-white|yellow|red|blue|black` row with `data-share` and `data-parts`; `picker-mark` is the
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
  `og.png`, `og-square.png`) from `app/web/brand/logo.svg` and `logo-small.svg`. Change the logo
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
