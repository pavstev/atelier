# Testing

## The checks

| Command | What it runs |
|---|---|
| `mise run check:fast` | `cargo fmt`, clippy, the Rust tests, web types and Biome |
| `mise run check` | the same, plus `cargo deny`, `cargo shear`, `typos` and a frozen install of the web dependencies |
| `bash scripts/test-files.sh FILES` | the tests for some Rust files |
| `mise run web:e2e` | the browser tests |
| `cargo refs` (`ATELIER_BLESS=1 cargo refs` blesses) | the reference pictures |
| `bash scripts/docs-check.sh` | broken relative links in the Markdown files |

Run `check:fast` while you work and `check` once before a pull request. The pre-commit hook checks
the files you staged. The pre-push hook runs `check`.

## Rust: one simple test per part

`crates/atelier-core/tests/tools_reference.rs` has one test per part (Values, Shapes, Grid). Each checks the size, the range and a loose match to a reference picture.
`tools_layers.rs` holds the other checks of how a layer behaves. A new part gets a simple test in
`tools_*.rs`.

`cargo refs` renders a synthetic photo through each layer at a long side of 128 px and
compares it with `crates/atelier-core/tests/reference`. The size and range must match, and the mean
difference must be 3.0 or less.

`ts_ranges.rs` reads the knob ranges of the web app (`features/tools/settings.ts`) as text and checks each one against the core: the least and the most
are accepted, one step outside is `Error::BadInput`. It fails when a range cannot be found.

`robust_calls.rs` checks that a bad number gives `Error::BadInput` and never a panic.
`peak_memory.rs` checks the peak memory of decoding a 48 MP photo.

To change a reference on purpose, see "Blessing a changed picture" below.

## Browser: Playwright

`mise run web:e2e` runs the Playwright specs in `app/web/e2e/` in headless Chromium, with four
workers. Install the browser once with `pnpm --dir app/web exec playwright install chromium`. Vite starts by itself, or
the server on port 5173 is used. Do not edit `src/` while a run is going: Vite reloads and a test
times out.

- The specs use the app's own storage keys (`KEYS` in `src/lib/keys.ts`) and `data-testid`
  attributes. A test id stays when the meaning stays.
- A Hero UI select is a button that opens a list: click its first button, then click the `option`
  by index (`studio.knob` does this). A slider is set with `setRange` in `e2e/studio.ts` (the
  native value setter, then `input` and `change`). A row of buttons has buttons with the role
  `radio`. Click one. `studio.knob(id, value)` picks the right way by itself.
- A page patch a test needs (a full storage, for example) goes in with `page.addInitScript` as
  well as on the open page, so a reload does not drop it. Vite reloads the page when it finds a
  new dependency, and on a full HMR reload.
- `smoke.spec.ts` runs on the dev server, on the built app (`PREVIEW=1`, with the real headers) and
  on a live site (`URL=...`).
- Most specs open one real photo, `mona-lisa-2400.jpg`, read from `PHOTOS_DIR` (see "The test
  photo"). `golden.spec.ts` needs no file.

### The test photo

The suite needs `mona-lisa-2400.jpg` in `PHOTOS_DIR`. The folder is `.agents/web-photos` in the repo
(ignored by git) unless you set the variable. No other file or subfolder is read.

To make it, download a scan of the Mona Lisa, a public domain painting, from Wikimedia Commons:
[Mona Lisa, from C2RMF retouched](https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg). Scale it to a long side of 2400 px and save it as a JPEG:

```bash
mkdir -p .agents/web-photos
magick mona-lisa-original.jpg -resize 2400x2400 .agents/web-photos/mona-lisa-2400.jpg
```

Any other photo with that file name works too, but the specs were written against the Mona Lisa.

### Golden pictures

`golden.spec.ts` draws a synthetic photo inside the page and compares each part with the pictures
in `e2e/golden/` (128 px, mean difference at most 3.0).

## Blessing a changed picture

Bless only for a change you meant, and say in the commit why the pictures moved.

```bash
ATELIER_BLESS=1 cargo refs      # the Rust reference pictures
mise run web:golden:bless       # the browser goldens (rewrites only the ones that fail)
```

## No photos in git

Test photos and every picture made from one stay out of git. They go under `.agents/` (ignored).
The one exception is `docs/design/assets/hero.png`, the README picture of the Mona Lisa. The
Rust tests, the reference pictures and the goldens use a synthetic photo, so anyone can run them
without the test photo.
