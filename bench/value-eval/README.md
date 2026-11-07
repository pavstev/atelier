# value-eval

Bench-only scorer for the Values and Shapes layers, judged the way an oil painter works. Never
shipped. The metrics and their sources: [the spec](../../docs/research/2026-11-04-value-eval-spec.md).

It reads the bench pictures from `.agents/bench` in the repo
(git-ignored): the photos in `eval/{set1,portraits,places}/photos` and `sunset/sunset.png`, and
the layers in `sheets-v3/{old,new,new2}-{values,shapes}-<photo>.png`. The sunset photo takes
its old and new sheets from `sunset/sheets/` (`before-*` and `v1-*`). A JPEG photo needs its PNG
copy from `sheets-v3/.in/`.

The scores (about 1.5 s per photo and version):

```bash
uv run --with numpy --with scipy --with pillow python -I bench/value-eval/score.py
```

`--only NAME` scores the photos whose name holds NAME. `--csv OUT` also writes the rows.
`--versions old,new2,new3` picks the sheet tags to compare (`sheets-v3/<tag>-...`).

Same inputs give the same numbers. No randomness.
