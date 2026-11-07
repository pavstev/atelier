# Bench

The reference tests use one synthetic picture. A real photo shows more. Photos are private, so
the bench keeps them and its pictures under `.agents/` (ignored by git). Nothing from a bench run
goes into git.

## Layer sheets

`crates/atelier-core/examples/bench.rs` calls the same typed layer calls as the web app, with the app's
start values, on a 1024 px work picture. It needs no browser. For each photo it makes one row:
Edges, Shapes, Values, Grid.

```bash
cargo run -q --release -p atelier-core --example bench -- render IN OUT before
# make your change, then
cargo run -q --release -p atelier-core --example bench -- render IN OUT after
cargo run -q --release -p atelier-core --example bench -- compare OUT before after
```

`IN` holds PNG or JPEG photos. A fifth argument filters by name. `BENCH_*` environment variables
override the start values for one run. The list is in the header comment of `bench.rs`. When the
app's start values change in `app/web/src/features/tools/settings.ts`, change the constants at the
top of the bench too.

The first release build takes about 2 minutes.

## Edges score

`examples/edge_score.rs` draws Edges for each photo of a folder and saves the ink as a gray PNG.
`scripts/edge_score.py` scores those pictures against the BSDS500 boundaries and prints the
F-score. Get the BSDS500 data from the Berkeley segmentation group.

```bash
cargo run -q --release -p atelier-core --example edge_score -- IN OUT [MODE] [AMOUNT]
```

## Values and Shapes scorer

`bench/value-eval/score.py` scores Values and Shapes sheets with fixed metrics, judged the way an
oil painter works. It is never shipped. The metrics and their sources are in
[the spec](../research/2026-11-04-value-eval-spec.md). See also
[bench/value-eval/README.md](../../bench/value-eval/README.md).

```bash
uv run --with numpy --with scipy --with pillow python -I bench/value-eval/score.py
```

The same inputs give the same numbers. There is no randomness.
