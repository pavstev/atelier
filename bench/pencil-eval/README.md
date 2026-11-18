# pencil-eval

Bench-only scorer for the Pencil looks. Never shipped. The metrics and their sources: section 5 of
[the research note](../../docs/research/2026-11-14-graphite-pencil-science.md).

Put the photos as `DIR/photos/<photo>.png` and the Pencil pictures as `DIR/<tag>-<photo>.png` (keep
`DIR` under `.agents/bench/`, git-ignored). A tag named `tone` is the reference for the grain mean
of the other tags.

```bash
uv run --with numpy --with scipy --with pillow python -I bench/pencil-eval/score.py DIR
```

`--dark L` is the L* of the darkest pencil of the set (17 by default). `--csv OUT` also writes the
rows. One row per photo and tag: MS-SSIM, the tone error (raw and after a 2 px blur, for the
textured looks), the range use, false contours, gradient reversal, and the grain mean and bias
against Tone.

Same inputs give the same numbers. No randomness.

To make the pictures: `cargo run -q --release -p atelier-core --example pencil_render -- DIR PHOTOS`
renders each Pencil look and effect of every photo in `PHOTOS` into `DIR` in the layout above.
