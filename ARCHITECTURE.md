# Architecture

Atelier is a Rust core that runs in the browser as wasm, behind a React web app. Everything runs
on the user's device. There is no server code. The folder map is in [MAP.md](MAP.md).

## The path of a photo

```
file -> browser decoder -> RGBA pixels -> layers worker (wasm Photo) -> layer pictures -> canvases
```

1. The photo worker (`features/photos/decodeWorker.ts`) decodes the photo with the browser (the
   EXIF turn is applied), so the page never freezes. The page hands the RGBA pixels to the layers
   worker.
2. The worker holds the wasm module. It keeps the last photos as a wasm `Photo`: the RGB copy and
   the work picture (long side 1024 px) stay between draws, so a knob redraws from them.
3. For each layer the worker makes one typed call on the `Photo`. The answer is an 8 byte header
   (width and height of the work picture) and the layer as RGBA with its own alpha.
4. The page draws each layer on its own canvas and stacks them.

## The parts

| Part | Where | Job |
|---|---|---|
| Core | `crates/atelier-core` | All pixel work: Values, Shapes, Pencil, Edges, Grid. Pencil is a folder, `pencil/`, with one module per idea (grades, tone, local contrast, deep darks, the paper tooth, Drawing, Hatch, the effects Smudge, Lift and Cross, By pencil, Auto and Suggest; the table is in `.claude/rules/rust.md`). Deterministic, no clock, no randomness. A number out of range is `Error::BadInput`, never a panic. |
| Wasm edge | `crates/atelier-wasm` | `Photo`, kept between draws, and one call per layer, over wasm-bindgen. The JS glue is built into `app/web/wasm/`. Pencil takes its knobs as one array of 14 numbers (`Photo::pencil`, answer with a mark byte for By pencil) and has two more calls: `pencil_auto` (the numbers Auto reads and sets) and `pencil_suggest` (the mask of the best 3 to 6 pencils). |
| Worker | `app/web/src/draw/worker.ts` | Holds the wasm and the photo. Draws on request. |
| Client | `app/web/src/draw/coreClient.ts`, `calls.ts`, `useLayers.ts` | Sends typed calls to the worker and hands the pictures to the stage. |
| Stage | `app/web/src/features/stage/` | The canvases, zoom and pan, the bottom bar, shortcuts. |
| Photo list | `app/web/src/features/photos/` | The photos on this device (IndexedDB), search, sort, thumbs. |
| Picker | `app/web/src/features/picker/` | The color picker: reads the shown picture and gives a paint recipe (TypeScript, one color at a time; the pixel work stays in the core). |
| Tools | `app/web/src/features/tools/` | The settings (start values and ranges) and the pop-up cards of the bottom bar. |
| Shared UI | `app/web/src/ui/`, `lib/`, `styles/` | Fields, icons, the logo, storage helpers, the theme. |

The import rule: `ui/` and `lib/` import no feature. A feature imports `ui/`, `lib/` and `draw/`.
`App.tsx` joins the features.

## The layers

The order is fixed, bottom first:

1. **Base.** One of Photo, Values, Shapes, Paper (white, no photo) or Pencil (a gray picture in graphite tones).
2. **Edges.** See-through lines, traced from the core's own edge map (a blurred Sobel gradient). Off while the base is Pencil.
3. **Grid.** See-through lines.

Each layer has an on/off switch (the base is always there), an opacity and its own knobs. How each
part draws is in [docs/how-it-works/](docs/how-it-works/).

## State

- **The look** (base, Edges, Grid and their knobs) is saved in `localStorage` as one record.
- **The layout** (the panel width, the panel hidden) is a second record, so a panel drag never
  rewrites the knobs.
- **Photos.** The file of each photo is in IndexedDB. The list, tiles and previews are small
  records next to it. Zoom and pan are saved for each photo.
- Every saved value is read back through a cleaner. A missing, wrong or old value falls back to
  the start value, and unknown keys are dropped. An old save never stops the app.

Every key is in `app/web/src/lib/keys.ts`.

## Build and release

`app/web/scripts/build-wasm.sh` (via `mise run web:wasm`) builds `crates/atelier-wasm` and writes
the JS glue into `app/web/wasm/`. The site is static files served by a Cloudflare Worker with
static assets. The page's security headers are in `app/web/public/_headers`. When the glue is
committed and how a deploy skips Rust: [docs/development/release.md](docs/development/release.md).

## Tests

- Rust: one simple test per part in `crates/atelier-core/tests/tools_*.rs`, checked against reference
  pictures (`cargo xtask refs`).
- Web: Playwright in headless Chromium, with golden pictures drawn from a synthetic photo.

See [docs/development/testing.md](docs/development/testing.md).

## The offline shell

A hand-written service worker, `/sw.js` (`app/web/src/sw/`), precaches the whole build, so the app
starts with no network. A small Vite plugin (`app/web/scripts/swPlugin.ts`) lists the built files
and builds the worker after the app. The cache is named `atelier-shell-<version>`, where the
version is the first 12 hex digits of a SHA-256 over the file list and bytes. A new worker takes
over by itself once its cache is full, and the page reloads once (it looks for a new version on
open, on return to the tab and every 30 minutes). The worker answers only same-origin
GET and `POST /share`. Photos and models are never in its cache. Details: [docs/web-app.md](docs/web-app.md).
