# Testing

## The checks

| Command | What it runs |
|---|---|
| `mise run check:fast` | `cargo fmt`, clippy, the Rust tests, web types and Biome |
| `mise run check` | the same, plus `cargo deny`, `cargo shear`, `typos` and a frozen install of the web dependencies |
| `bash scripts/test-files.sh FILES` | the tests for some Rust files |
| `mise run web:e2e` | the browser tests |
| `cargo xtask refs [--bless]` | the reference pictures |
| `bash scripts/docs-check.sh` | broken relative links in the Markdown files |

Run `check:fast` while you work and `check` once before a pull request. The pre-commit hook checks
the files you staged. The pre-push hook runs `check`.

## Rust: one simple test per part

`crates/oil-core/tests/tools_*.rs` has one test per part (Values, Shapes, Edges, Grid). Each
checks the size, the range and a loose match to a reference picture.

`cargo xtask refs` renders a synthetic photo through each layer at a long side of 128 px and
compares it with `crates/oil-core/tests/reference`. The size and range must match, and the mean
difference must be 3.0 or less.

`robust_calls.rs` checks that a bad number gives `Error::BadInput` and never a panic.
`peak_memory.rs` checks the peak memory of decoding a 48 MP photo.

Bless a reference only for a change you meant:

```bash
cargo xtask refs --bless
```

Say in the commit why the pictures moved.

## Browser: Playwright

`mise run web:e2e` runs the Playwright specs in `app/web/e2e/` in headless Chromium, with four
workers. Install the browser once with `npx playwright install chromium`. Vite starts by itself, or
the server on port 5173 is used. Do not edit `src/` while a run is going: Vite reloads and a test
times out.

- The specs use the app's own storage keys (`KEYS` in `src/lib/storage.ts`) and `data-testid`
  attributes. A test id stays when the meaning stays.
- A hidden native `<select>` sits behind each Hero UI select. Set it with the native value setter
  and fire `change` and `input`. A row of buttons has buttons with the role `radio`. Click one.
- `smoke.spec.ts` runs on the dev server, on the built app (`PREVIEW=1`, with the real headers) and
  on a live site (`URL=...`).
- Tests that need photos read them from `PHOTOS_DIR`. The photos are local and not in git.

### Golden pictures

`golden.spec.ts` draws a synthetic photo inside the page and compares each part with the pictures
in `e2e/golden/` (128 px, mean difference at most 3.0). No photo is in git.

If a golden moves and you meant it:

```bash
mise run web:golden:bless
```

It wipes `e2e/golden` first. Say in the commit why the pictures moved.

## No photos in git

Test photos and every picture made from one stay out of git. They go under `.agents/` (ignored).
The tests use a synthetic photo, so anyone can run them.
