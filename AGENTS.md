# Atelier

Study a photo like a painter. A Rust core does the pixel work. It runs in the browser as wasm,
behind a React web app, on localhost and at https://atelier.stevanpavlovic.com (a Cloudflare
Worker; a push to main deploys it). The native Swift Mac app left main on 2026-10-31; the tag
`swift-app-last` keeps it. A new Mac app, a Tauri window around the web app, is in `app/desktop/`. The first web app (Astro, Tauri, Python sidecar) is in the tag
`web-site-last`.

What the app does: [README.md](README.md) and [docs/web-app.md](docs/web-app.md). How it looks and
behaves: [DESIGN.md](DESIGN.md). How the parts fit: [ARCHITECTURE.md](ARCHITECTURE.md). How to
contribute: [CONTRIBUTING.md](CONTRIBUTING.md). Open work: [docs/LEFTOVERS.md](docs/LEFTOVERS.md).
Which docs are current: [docs/README.md](docs/README.md).

Where things live: [MAP.md](MAP.md). Every source file starts with a comment that says its job.
Never read `target/`, `bench-out/`, `in/` or `out/` (the last three hold private photos).

Nothing leaves the device.

## Commands

The tasks are in `mise.toml` (its header has the setup). While you work: `mise run check:fast`.
Once before a push: `mise run check`. For a Rust file: `bash scripts/test-files.sh FILES`. For a
core or web change also run `mise run web:e2e` once (`PHOTOS_DIR` must hold `mona-lisa-2400.jpg`;
set up once with `pnpm --dir app/web exec playwright install chromium`). The test rules, the test
photo and the bless commands (`ATELIER_BLESS=1 cargo refs`, `mise run web:golden:bless`) are in
[docs/development/testing.md](docs/development/testing.md). Bless only for a meant change, and say
in the commit why the pictures moved.

`cargo refs` renders the synthetic photo through each layer at a long side of 128 px and
compares it with `crates/atelier-core/tests/reference` (size, range, a mean difference of at most 3.0).

## Rules

- The Rust core stays the home of pixel work. The photo worker decodes a photo and the page hands
  its RGBA pixels to the layers worker.
- One simple test per part in `crates/atelier-core/tests/tools_*.rs`.
- Browser tests run headless Chromium with Playwright. No Firefox, no WebKit, no visible window.
- One base, then Grid, in a fixed order, bottom first. Grid is see-through.
- A number out of range is `Error::BadInput`, never a panic.
- No photo, and no picture made from one, goes into git. Bench output goes to `.agents/bench/`.
  One exception (owner, 2026-11-07): `docs/design/assets/hero.png`, the README picture, shows the
  Mona Lisa, a public domain painting.
- A push to main deploys through Cloudflare Workers Builds. Never another account.
  The pin, the manual deploy and the build: [docs/development/release.md](docs/development/release.md)
  and `.claude/rules/web.md`.
- Small Conventional Commits (`fix(core): ...`).
- A leftover you find or fix gets its row added or deleted in `docs/LEFTOVERS.md` in the same
  commit.

## Dropped for good

Do not bring these back. Some names came back in a new form: the first table says what is new
and what stays out.

### Came back, in a new form

| Date | What came back | What stays out |
|---|---|---|
| 2026-11-06 | Three shortcuts: hold Space to see the photo, the arrow keys move the photo, `[` hides the side panel. | Every other shortcut. |
| 2026-11-13 | A color picker in the bottom bar. It reads the shown picture and gives a mix of white, yellow, red, lake blue, phthalo blue and black (`app/web/src/features/picker/`). | Mixbox, a color list, a color picker panel. |
| 2026-11-14 | (Cut again 2026-11-28.) Pencil, as a Base choice: the photo as a gray picture in the tones of the graphite grades 4H to 9B (`crates/atelier-core/src/pencil/`). Its looks: Tone, Drawing, Hatch, By pencil. Hatch is a texture of the tone; By pencil is a view of the tone by pencil. | The old Line drawing and Pencil model tools, the Stroke order, a Sketch look inside Pencil. |
| 2026-11-23 | (Cut again 2026-11-28 with Edges.) Sketch, as a fourth Edges mode: the Lines chains drawn as graphite strokes (`crates/atelier-core/src/edges/trace/sketch.rs`). | The old Sketch look of Pencil, a Looseness knob, a hatch angle for Edges. |
| 2026-11-17 | The PWA (dropped 2026-11-06): an offline service worker, install, Open with (`app/web/src/sw/`, `app/web/src/pwa/`). The worker never touches a photo or a model. | Push and sync, the Share target (cut 2026-11-28). |
| 2026-11-17 | The paper frame: the Paper tool (once called Size) in the bottom bar (`app/web/src/features/size/`). It picks a paper or canvas and can cut the photo to its shape. | The old canvas sizes, the materials, the 18 x 24 cm idea as a workspace. |
| 2026-11-24 | A Mac app: a Tauri window around the web app (`app/desktop/`, [docs/development/mac-app.md](docs/development/mac-app.md)), with a see-through sidebar and no title bar. | The native Swift app, a second UI, Mac-only features beyond the window. |

### Dropped

- **2026-10-30:** the PDF, the CLI, the old color picker, ZIP export, the recent shelf, the worker
  count setting, watercolor, charcoal.
- **2026-10-31:** the native Swift Mac app and its Rust edge crate; the old stage tables; Squint;
  Coach tips; the Stroke order; the Line drawing and Pencil model tools; Mixbox; HED and TEED; the
  Python helper (`helper/`); the MLX and swift-transformers packages; SAM masks; the Real-ESRGAN
  upscaler; the Knife tool; the Plan group and the Stage plan view; Style preview; the Stipple map;
  the Light tools (Light and form, Color and light); Objects; the Neural badge; the dock; More and
  Shift-click on tabs; Apple Vision and BiSeNet for faces.
- **2026-11-02:** the Oil, Acrylic and Drawing workspaces; Colors; Stages; the construction guides
  (envelope, plumb, gesture, perspective, ellipses, head); the 15 technique views; the cards; the
  materials; the canvas sizes and the 18 x 24 cm idea; the menu bar, status bar and shortcuts
  dialog; turn and mirror; upscale; the compare divider; keyboard shortcuts; any cloud store (R2)
  for models.
- **2026-11-03:** the depth model (Near, mid, far); the Shapes Value fill.
- **2026-11-06:** the PWA (back on 2026-11-17, see above).
- **2026-11-07:** People, face finding and all five face models (YuNet, SegFormer, MODNet, SCHP,
  MediaPipe landmarks); the maps worker; the face contours in Edges; the face filter.
- **2026-11-07:** the folding tool cards, the tools dock in the left panel and the Lock button. The
  bottom bar pop-ups and the zoom menu replace them. The left panel is the photo list only.
- **2026-11-13:** the Color zoom (a legend swatch shown big on a gray mat, then full screen). A
  legend swatch now holds its color in the color picker card.
- **2026-11-16:** light mode and the theme hook. The app is dark only.
- **2026-11-17:** the Pencil Zones look (flat tones, one per pencil). Look id 2 is `BadInput`.
- **2026-11-17:** the zoom lock card. Real size is a switch in the Paper card and an item of the
  zoom menu.
- **2026-11-28:** Edges (Lines, Transfer, Masses, Sketch), its width/even knobs, the edge map, the
  F-score tool and the Shapes outline view; the owner removed the layer and the code that only it
  used. Tag `edges-last` is NOT made; git history of main before this commit keeps it.
- **2026-11-28:** a cut for a small, standard app (a painter review found these unused). Not coming
  back:
  - the Pencil base, all of it (the Rust `pencil/`, its calls, card, legend levels, saved settings,
    tests, pictures, `docs/how-it-works/pencil.md` and `bench/pencil-eval/`);
  - from Values: the Shadow family and Light family presets and the Umber tint (the presets are
    Notan, Three, Five, Families; the tones are gray);
  - the Paper base (the bases are Photo, Values, Shapes; the Paper tool stays);
  - from Grid: Thirds, Both, the cell list, the heavy line groups, Center, the width slider and the
    one color mode (the Grid is squares by cm, with On, Opacity and the cm step; Contrast lines,
    width 2, squares from the top left corner);
  - Real size (the switch, the zoom menu item, Unlock, the lock state, the saved screen width);
  - the Android Share target (the manifest `share_target`, the service worker share route, the
    `?shared=1` intake and the Cloudflare `POST /share` Worker; `wrangler.jsonc` is static assets
    only). Open with and the launch queue stay;
  - the bottom bar grip (the bar is fixed at the bottom center);
  - the tile view of the photo list (rows, the hover card and the sorts stay);
  - Edges, as in the line above.
