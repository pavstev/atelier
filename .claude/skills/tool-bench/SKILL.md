---
name: tool-bench
description: Run real photos through the Atelier parts (Values, Shapes, Edges, Grid) with the core alone, the way the web app does, and make before and after sheets; also scores Edges on BSDS500. Use to check a change on real photos, to find the cause of a bad part, or before a rating round. Faster than the app and needs no browser.
---

# Tool bench

The reference tests (`cargo xtask refs`) use one synthetic picture. A real photo shows more. The
bench (`crates/oil-core/examples/bench.rs`) calls the same typed layer calls as the web app
(`values_layer`, `shapes_layer`, `edges_layer`, `grid_layer`), with the start values of `LOOK`
in `app/web/src/features/tools/settings.ts`, on a 1024 px work picture. It needs no browser.

## Rules

- Photos and every picture made from one stay out of git. Sheets go to `.agents/bench/sheets/`
  (git-ignored).
  Never read the owner's `in/`, `out/` or `bench-out/` folders; read only the sheets you made, by
  the exact path.
- Photos: `.agents/web-photos/` (PNG or JPEG; a JPEG is turned into a PNG by `sips` inside the
  output folder). More: `.agents/bench/unsplash/` (30 free Unsplash photos, credits in
  `credits.json`). Small blocky JPEGs: `sips -Z 400 -s format jpeg -s formatOptions 30 IN --out SMALL.jpg`.

## What a run draws

Per photo, one row: Edges, Shapes, Values, Grid, left to right. The file names and how each layer
is shown are in the `//!` of `bench.rs`.

## Steps

1. Render the base state on a clean tree, before your change. The first release build takes about
   2 minutes; run it in the background.

   ```bash
   cargo run -q --release -p oil-core --example bench -- render .agents/web-photos .agents/bench/sheets before
   ```

2. Make the change. Render again with the tag `after`. Add a name filter as a 5th argument to run
   one photo only.
   `BENCH_*` env vars override the start values for one run; the list is in the `//!` of
   `crates/oil-core/examples/bench.rs`. For example
   `BENCH_EDGES_MODE=1 cargo run -q --release -p oil-core --example bench -- render IN OUT after-m1`.
3. Stack them:
   `cargo run -q --release -p oil-core --example bench -- compare .agents/bench/sheets before after`.
   Each `.agents/bench/sheets/cmp-before-after-<photo>.png` has the before rows on top and the after rows
   below.
4. Look at the sheets with Read. For a small detail, crop first:
   `uv run --with pillow python -c "from PIL import Image; Image.open('A').crop((x0,y0,x1,y1)).resize((W,H)).save('B')"`.
5. To find a cause, turn one input off at a time: make a small local edit of
   `examples/bench.rs` and do not commit it.
6. For a scored round on many photos, call the `tool-rater` agent with the sheet folder and a
   report path (for example `.agents/reports/<date>-rating.md`).
7. For the real browser path (the worker, the page), run `mise run web:e2e`.

## Edges score

`examples/edge_score.rs` draws Edges for each photo of a folder at its own long side and saves the
ink as a gray PNG. `scripts/edge_score.py` scores those pictures against the BSDS500 boundaries
(data in `.agents/bench/bsds`) and prints the F-score:

```bash
cargo run -q --release -p oil-core --example edge_score -- IN OUT [MODE] [AMOUNT]
```

Outputs stay under `.agents/`. Run the script on `OUT` as its header says.

## What to report

Say which photos you ran, what changed in which layer, and what is still wrong. Name file and
symbol for a cause. Add a row to `docs/LEFTOVERS.md` for a problem you do not fix.

When the app's start values change in `LOOK`, change the constants at the top of the bench
too. They must stay the app's defaults.
