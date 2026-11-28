<!-- ps:map -->
# Map

Atelier is a photo study tool for painters: a Rust core (wasm) behind a React web app. See [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [CONTRIBUTING.md](CONTRIBUTING.md) and, for how the UI looks and behaves, [DESIGN.md](DESIGN.md). AI tools also read [AGENTS.md](AGENTS.md).

## Folders
| Path | Holds | Open it to |
|---|---|---|
| `crates/atelier-core/` | all pixel work in Rust | changing what a part draws |
| `crates/atelier-core/src/` | the typed calls (in `crates/atelier-core/src/render.rs`), `values.rs`, `shapes.rs`, `filters.rs` and `grid.rs` | changing a part |
| `crates/atelier-core/tests/` | the reference tests, their helpers, the reference pictures and fixtures | changing or blessing a reference |
| `crates/atelier-core/examples/` | the bench (`bench.rs`: real photos, before and after sheets) | running the bench |
| `crates/atelier-wasm/` | the wasm edge: `Photo` (kept between draws, one call per layer) | changing what the page can call |
| `app/desktop/` | the Mac app: a Tauri window around `app/web/dist` (`tauri.conf.json`, `src/main.rs`, icons); [docs/development/mac-app.md](docs/development/mac-app.md) | changing the Mac app |
| `app/web/` | the web app: React 19, Hero UI v3, Tailwind v4, Vite; the layers worker holds the photo and draws | changing the page |
| `app/web/src/` | `main.tsx` and `App.tsx` (the window), and the folders below | changing the page |
| `app/web/src/features/photos/` | the photo list and its on-device store: `usePhotos.ts` (the photo on screen), `useDocsList.ts`, `Files.tsx` (the tree), `useFolders.ts` (the folders and which are open), `decodeWorker.ts` (decode and tile off the main thread) and `store/` (the IndexedDB store and the folder tree) | changing the photo list |
| `app/web/src/features/stage/` | the middle: `StageArea.tsx`, `Stage.tsx`, `StageBar.tsx`, `useViewport.ts`, `useShortcuts.ts`, `Swatches.tsx`, `LegendStrip.tsx` (the legend at the top center of the stage) | changing the stage or zoom |
| `app/web/src/features/picker/` | the color picker: `spectral.ts` (Kubelka-Munk, the eye, CIEDE2000), `paints.ts` (the six paints; edit them for your tubes), `mix.ts` (the recipe search), `color.ts` (the shared color helpers: css, hex, ink, Munsell value), `sample.ts`, `Picker.tsx` | changing the picker |
| `app/web/src/features/size/` | the Paper tool (was Size): `paper.ts` (paper table, crop rectangle, fact line, clean save), `crop.ts`, `useSize.ts` (the choice per photo and the cut photo), `SizeCard.tsx`, `SizePreview.tsx` | changing the paper or canvas frame |
| `app/web/src/features/tools/` | `Panel.tsx` (the Base and Grid card bodies) and `settings.ts` (the start values and ranges of every part) | changing a tool |
| `app/web/src/draw/` | the draw pipeline: `worker.ts` (the layers worker), `coreClient.ts`, `calls.ts`, `useLayers.ts`, `facts.ts` | changing how a layer is drawn |
| `app/web/src/ui/` | parts that know nothing about photos: `fields.tsx`, `icons.tsx` (`Icon`, `IconButton`, `Tip`), `PanelShell.tsx`, `Logo.tsx`, `LoadBoundary.tsx` (a lazy part that fails shows a Reload button), `useFrameDrag.ts` (the drag of the panel edge) | changing a shared control |
| `app/web/src/lib/` | `keys.ts` (every saved key), `storage.ts` (load and save them) and small helpers | changing what is saved |
| `app/web/src/styles/` | `index.css` and `atelier-theme.css` (colors and the design sizes: radius, icon buttons, z-index, tooltip delay) | changing the look |
| `app/web/e2e/` | the Playwright suite (headless Chromium only) and the golden pictures | changing browser tests |
| `app/web/src/sw/` | the service worker: `sw.ts`, `routes.ts`, `precache.ts`; built to `/sw.js` by `app/web/scripts/swPlugin.ts` | changing offline or caching |
| `app/web/src/pwa/` | the page side: `register.ts`, `state.ts`, `usePwa.ts`, `useTitleSlot.ts`, `labels.ts`, `InstallButton.tsx`, `intake.ts`, `persist.ts`, `reloadOnce.ts` (reload once when a lazy chunk is gone after a deploy) | changing install, update or Open with |
| `app/web/public/` | favicons, app icons, social images, `manifest.webmanifest`, `_headers` | changing icons or the manifest |
| `app/web/brand/` | the logo source for favicons and share images | changing the brand |
| `app/web/scripts/` | the wasm build and brand scripts; the glue it writes is `app/web/wasm/` (committed at release) | changing the web build |
| `bench/value-eval/` | scores Values and Shapes with fixed metrics, never shipped ([spec](docs/research/2026-11-04-value-eval-spec.md)) | judging a Values or Shapes change |
| `scripts/` | check, deploy, release and docs-check shell scripts (`lib.sh` is their shared setup) | changing the check or deploy |
| `docs/` | which docs are current: [docs/README.md](docs/README.md) | looking for a decision or history |
| `docs/how-it-works/` | one page per part: Values, Shapes, Grid | learning how a part draws |
| `docs/web-app.md` | what the app does, control by control, and how the web app is built | changing the UI |
| `docs/development/` | testing, release and the bench | running tests or a release |
| `docs/design/` | brand and theme sources | changing the look |
| `docs/research/` | research notes (records) | looking for how a choice was made |
| `.github/` | issue forms and the pull request template | changing the contribution flow |
| `.claude/` | rules, skills and agents for AI coding tools; see [.claude/HARNESS.md](.claude/HARNESS.md) | changing how AI tools work here |
| `.cargo/` | cargo config | changing the cargo setup |

## Find it fast
- The one check: `scripts/test-all.sh` (via `mise run check`; `--fast` is `mise run check:fast`)
- The tests for some Rust files: `scripts/test-files.sh`
- The Cloudflare build: `scripts/ci-build.sh`
- The live probe after a push: `scripts/live-check.sh`
- Broken doc links: `scripts/docs-check.sh`
- Is the committed wasm glue fresh: `scripts/wasm-fresh.sh`
- The start values of every part: `app/web/src/features/tools/settings.ts`
- The Cloudflare config: `wrangler.jsonc`
- The git hooks: `lefthook.yml`
- Open work: [docs/LEFTOVERS.md](docs/LEFTOVERS.md)
- The look, the layout and the widget rule: [DESIGN.md](DESIGN.md)

## Commands
The real list is the tasks in `mise.toml`. The root `Makefile` wraps `check`, `check-fast` and `fix`.
