# Atelier

Study a photo like a painter. A Rust core does the pixel work. It runs in the browser as wasm,
behind a React web app, on localhost and at https://atelier.stevanpavlovic.com (a Cloudflare
Worker; a push to main deploys it). The native Swift Mac app left main on 2026-10-31; the tag
`swift-app-last` keeps it. The first web app (Astro, Tauri, Python sidecar) is in the tag
`web-site-last`.

What the app does: [README.md](README.md) and [docs/web-app.md](docs/web-app.md). How the parts
fit: [ARCHITECTURE.md](ARCHITECTURE.md). How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md).
Open work: [docs/LEFTOVERS.md](docs/LEFTOVERS.md). Which docs are current:
[docs/README.md](docs/README.md).

Where things live: [MAP.md](MAP.md). Every source file starts with a comment that says its job.
Never read `target/`, `bench-out/`, `in/` or `out/` (the last three hold private photos).

Nothing leaves the device.

## Commands

The tasks are in `mise.toml` (its header has the setup). While you work: `mise run check:fast`.
Once before a push: `mise run check`. For a Rust file: `bash scripts/test-files.sh FILES`. For a
core or web change also run `mise run web:e2e` once (`PHOTOS_DIR` must hold `mona-lisa-2400.jpg`;
set up once with `pnpm --dir app/web exec playwright install chromium`). The test rules, the test
photo and the bless commands (`cargo xtask refs --bless`, `mise run web:golden:bless`) are in
[docs/development/testing.md](docs/development/testing.md). Bless only for a meant change, and say
in the commit why the pictures moved.

`cargo xtask refs` renders the synthetic photo through each layer at a long side of 128 px and
compares it with `crates/atelier-core/tests/reference` (size, range, a mean difference of at most 3.0).

## Rules

- The Rust core stays the home of pixel work. The page decodes a photo and hands RGBA pixels to
  the layers worker. Edges draws from the core's own edge map (`edges/map.rs`, a blurred Sobel).
- One simple test per part in `crates/atelier-core/tests/tools_*.rs`.
- Browser tests run headless Chromium with Playwright. No Firefox, no WebKit, no visible window.
- One base, then Edges, then Grid, in a fixed order, bottom first. Edges and Grid are see-through.
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

Do not bring these back.

- Back on 2026-11-13, by the owner's request: a color picker, in the bottom bar. It is not the old
  one. It reads the shown picture and gives a mix of white, yellow, red, lake blue, phthalo blue and black
  (`app/web/src/features/picker/`). Mixbox, a color list and a color picker panel stay dropped.

- 2026-11-13: the Color zoom (a legend swatch shown big on a gray mat, then full screen). A legend
  swatch now holds its color in the color picker card.
- 2026-10-30: the PDF, the CLI, the color picker, ZIP export, the recent shelf, the worker count
  setting, watercolor and charcoal.
- 2026-10-31: the old stage tables (the Stages tool is their new form), Squint, Coach tips, the
  Stroke order, the Line drawing and Pencil model tools, Mixbox, HED and TEED, the Python helper
  (`helper/`), the MLX and swift-transformers packages, SAM masks, the Real-ESRGAN upscaler (the
  Upscale card uses Lanczos), the Knife tool, the Plan group and the Stage plan view, Style
  preview, the Stipple map, the Light tools (Light and form, Color and light), Objects, the Neural
  badge, the dock, More and Shift-click on tabs, Apple Vision and BiSeNet for faces.
- 2026-10-31: the native Swift Mac app and its Rust edge crate. The tag `swift-app-last` keeps both.
- 2026-11-02: the three workspaces Oil, Acrylic and Drawing; Colors; Stages; the construction
  guides (envelope, plumb, gesture, perspective, ellipses, head); the 15 technique views; the
  cards; the materials; the canvas sizes and the 18 x 24 cm idea; the menu bar, status bar,
  shortcuts dialog, turn and mirror, upscale and the compare divider; keyboard shortcuts (but see 2026-11-06); any
  cloud store (R2) for models.
- 2026-11-03: the depth model (Near, mid, far) and the Shapes Value fill.
- 2026-11-06: the progressive web app (manifest, home screen icons, theme color). The site keeps its
  favicons and share images. Three small keyboard shortcuts came back, and no others: hold Space to
  see the photo, the arrow keys move the photo, `[` hides the side panel.
- 2026-11-07: People, face finding and all five face models (YuNet, SegFormer, MODNet, SCHP, MediaPipe landmarks), the maps worker, the face contours in Edges and the face filter.
- 2026-11-07: the folding tool cards and the tools dock in the left panel, and the Lock button. The
  bottom bar pop-ups (Base, Edges, Grid) and the zoom menu replace them. The left panel is the photo
  list only.
