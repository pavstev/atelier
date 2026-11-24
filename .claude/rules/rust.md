---
paths:
  - "crates/**"
  - "Cargo.toml"
---

# Rust core

Modules of `crates/atelier-core/src`. Each file starts with a `//!` line that says its job.

| Module | Job |
|---|---|
| `render` | The typed calls (`values_layer`, `shapes_layer`, `pencil_layer`, `edges_layer`, `grid_layer`, and the views under them) and the range checks. |
| `values`, `shapes`, `pencil/`, `grid` | One part each. `pencil/` maps the photo onto the tones of graphite grades (it reuses the Values smoothing and label clean-up; the modules are in the next table). `grid.rs` draws the Grid (its constants live there too). |
| `edges/` | Edges: `map` (the blurred Sobel edge map), `trace` (the lines traced from it) and `field` (the direction field). |
| `deblock` | Calms the 8 px blocks of small JPEGs before the parts. |
| `img`, `oklab`, `srgb`, `photo`, `error` | Image type, color math (`srgb::l_star` is the one CIE L*), the upright turn, `Error::bad`. |
| `resize`, `filters` | Shared filters. `filters` holds one copy of each: the Sobel gradient, the box mean, the guided filter, the percentile and `Sorted`, the mode filter and the Otsu cut (the Gaussian blur is `edges::field::blur`); `resize` holds Lanczos. |

`filters::percentile` and `filters::Sorted` give the same value for the same rank, and both stay
on purpose. `percentile` copies and selects in O(n): right for one or two lookups. `Sorted` sorts
once and answers many lookups: Pencil's tone curve, Auto and Suggest ask ten or more
percentiles of one photo, so one sort is cheaper than ten selects.

### `pencil/`

| Module | Job |
|---|---|
| `mod` | `Look`, `Knobs`, `Paper` and `view`: the order of the steps for each look. |
| `grades` | The levels: `TONES`, the paper, the set a mask picks, the tint, the level of a tone and the shares (they add up to at least 100). |
| `tone` | The tone curve: the range, the cuts, the curve through the pencils, and Key (Schlick bias) and Contrast (S curve). |
| `local` | Local contrast: a guided filter base and a soft-limited detail boost. The only detail layer. |
| `darks` | The accent rule (Deep darks): the 9B and 7B may not cover a big dark mass. |
| `paper`, `ink` | The paper tooth (a hashed value noise, the one position hash) and what Drawing and Hatch share (darkness, pressure, the hold that keeps a local mean at the tone). |
| `drawing`, `hatch` | The Drawing and Hatch looks. Hatch reads `edges::field::structure_field`. |
| `smudge`, `lift`, `cross` | The three effects (each a knob 0 to 100, 0 is off): a stump drag along the stroke, eraser streaks in the light tones, and more crossed lines in the darks. |
| `build_up` | By pencil: the Tone picture clamped to the step's pencil, and the mark. |
| `auto`, `choice` | Auto (Key, Contrast, Highlights from the photo) and Suggest (the best 3 to 6 pencils, by trying every set). |
| `tests` | Tests of the view as a whole. |

Only `error`, `img` and `render` are public, so rustc reports dead code. A helper with no
caller is deleted, not made `pub`. Every filter exists once. A second copy needs a reason, and the
reference pictures must stay.

## Work rules

- One module: `cargo test -q -p atelier-core --lib <module>::`. Reference tests: `cargo refs`
  (`tests/tools_reference.rs` and `tests/tools_layers.rs`; the shared helpers are in `tests/common/mod.rs`).
- A meant pixel change: `ATELIER_BLESS=1 cargo refs`, and say in the commit why the pictures moved.
  Never edit the reference pictures by hand.
- Clippy stays clean (`-D warnings`). No `allow` without a comment that says why.
- What a call takes and its ranges: the `//!` of `render.rs`.
- Real photos: `/tool-bench` (`examples/bench.rs`). Its pictures stay out of git. The Edges score:
  `examples/edge_score.rs` and `scripts/edge_score.py`, see `/tool-bench`.
- Never run `cargo clean`: `target/` is shared with other sessions.
