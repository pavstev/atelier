<!-- ps:map -->
# Map

Atelier is a photo study tool for painters: a Rust core (wasm) behind a React web app. See [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [CONTRIBUTING.md](CONTRIBUTING.md). AI tools also read [AGENTS.md](AGENTS.md).

## Folders
| Path | Holds | Open it to |
|---|---|---|
| `crates/atelier-core/` | all pixel work in Rust | changing what a part draws |
| `crates/atelier-core/src/` | the typed calls (in `crates/atelier-core/src/render.rs`), `grid.rs` and `edges/` | changing a part |
| `crates/atelier-core/tests/` | the reference tests, their helpers, the reference pictures and fixtures | changing or blessing a reference |
| `crates/atelier-core/examples/` | the bench (`bench.rs`: real photos, before and after sheets) and `edge_score.rs` (the Edges F-score) | running the bench |
| `crates/atelier-wasm/` | the wasm edge: `Photo` (kept between draws, one call per layer) | changing what the page can call |
| `app/web/` | the web app: React 19, Hero UI v3, Tailwind v4, Vite; the layers worker holds the photo and draws | changing the page |
| `app/web/src/` | `main.tsx` and `App.tsx` (the window) and five folders: | changing the page |
| `app/web/src/features/photos/` | the photo list and its on-device store: `usePhotos.ts` (the photo on screen), `useDocsList.ts`, `addPhotos.ts`, `loadStored.ts`, `restoreSession.ts`, `missing.ts`, `search.ts`, `thumb.ts`, `Files.tsx`, `PhotoRow.tsx`, `PhotoCard.tsx` and `store/` (the IndexedDB store: `schema.ts`, `reducer.ts`, `idb.ts`) | changing the photo list |
| `app/web/src/features/stage/` | the middle: `StageArea.tsx`, `Stage.tsx`, `StageBar.tsx`, `useViewport.ts`, `useShortcuts.ts`, `lockZoom.ts`, `Swatches.tsx` | changing the stage or zoom |
| `app/web/src/features/tools/` | the pop-up cards of the bottom bar and `settings.ts` (the start values and ranges of every part) | changing a tool |
| `app/web/src/draw/` | the draw pipeline: `worker.ts` (the layers worker), `coreClient.ts`, `calls.ts`, `useLayers.ts`, `facts.ts` | changing how a layer is drawn |
| `app/web/src/ui/` | parts that know nothing about photos: `fields.tsx`, `icons.tsx` (`Icon`, `IconButton`, `Tip`), `PanelShell.tsx`, `Logo.tsx` | changing a shared control |
| `app/web/src/lib/` | `keys.ts` (every saved key), `storage.ts` (load and save them) and small helpers | changing what is saved |
| `app/web/src/styles/` | `index.css` and `atelier-theme.css` (colors and the design sizes: radius, icon buttons, z-index, tooltip delay) | changing the look |
| `app/web/e2e/` | the Playwright suite (headless Chromium only) and the golden pictures | changing browser tests |
| `app/web/public/` | favicons and share images | changing icons |
| `app/web/brand/` | the logo source for favicons and share images | changing the brand |
| `app/web/scripts/` | the wasm build and brand scripts; the glue it writes is `app/web/wasm/` (committed at release) | changing the web build |
| `xtask/` | `cargo xtask refs [--bless]` | changing the reference check |
| `bench/value-eval/` | scores Values and Shapes with fixed metrics, never shipped ([spec](docs/research/2026-11-04-value-eval-spec.md)) | judging a Values or Shapes change |
| `scripts/` | check, deploy, release and docs-check shell scripts (`lib.sh` is their shared setup) | changing the check or deploy |
| `docs/` | which docs are current: [docs/README.md](docs/README.md) | looking for a decision or history |
| `docs/how-it-works/` | one page per part: Values, Shapes, Edges, Grid | learning how a part draws |
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
- The Edges F-score on BSDS500: `scripts/edge_score.py` (data in `.agents/bench/bsds`)
- Is the committed wasm glue fresh: `scripts/wasm-fresh.sh`
- The start values of every part: `app/web/src/features/tools/settings.ts`
- The Cloudflare config: `wrangler.jsonc`
- The git hooks: `lefthook.yml`
- Open work: [docs/LEFTOVERS.md](docs/LEFTOVERS.md)

## Commands
The real list is the tasks in `mise.toml`. The root `Makefile` wraps `check`, `check-fast` and `fix`.
