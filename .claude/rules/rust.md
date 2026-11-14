---
paths:
  - "crates/**"
  - "xtask/**"
  - "Cargo.toml"
---

# Rust core

Modules of `crates/atelier-core/src`. Each file starts with a `//!` line that says its job.

| Module | Job |
|---|---|
| `render` | The typed calls (`values_layer`, `shapes_layer`, `pencil_layer`, `edges_layer`, `grid_layer`, and the views under them) and the range checks. |
| `values`, `shapes`, `pencil`, `grid` | One part each. `pencil.rs` cuts the photo into zones for graphite grades (it reuses the Values smoothing and label clean-up). `grid.rs` draws the Grid (its constants live there too). |
| `edges/` | Edges: `map` (the blurred Sobel edge map), `trace` (the lines traced from it) and `field` (the direction field). |
| `deblock` | Calms the 8 px blocks of small JPEGs before the parts. |
| `img`, `oklab`, `srgb`, `photo`, `error` | Image type, color math (`srgb::l_star` is the one CIE L*), the upright turn, `Error::bad`. |
| `resize`, `filters` | Shared filters. `filters` holds one copy of each: the Sobel gradient, the box mean, the guided filter, the percentile, the mode filter and the Otsu cut (the Gaussian blur is `edges::field::blur`); `resize` holds Lanczos. |

Only `error`, `img` and `render` are public, so rustc reports dead code. A helper with no
caller is deleted, not made `pub`. Every filter exists once. A second copy needs a reason, and the
reference pictures must stay.

## Work rules

- One module: `cargo test -q -p atelier-core --lib <module>::`. Reference tests: `cargo xtask refs`
  (`tests/tools_reference.rs` and `tests/tools_layers.rs`; the shared helpers are in `tests/common/mod.rs`).
- A meant pixel change: `cargo xtask refs --bless`, and say in the commit why the pictures moved.
  Never edit the reference pictures by hand.
- Clippy stays clean (`-D warnings`). No `allow` without a comment that says why.
- What a call takes and its ranges: the `//!` of `render.rs`.
- Real photos: `/tool-bench` (`examples/bench.rs`). Its pictures stay out of git. The Edges score:
  `examples/edge_score.rs` and `scripts/edge_score.py`, see `/tool-bench`.
- Never run `cargo clean`: `target/` is shared with other sessions.
