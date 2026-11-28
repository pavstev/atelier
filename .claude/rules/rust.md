---
paths:
  - "crates/**"
  - "Cargo.toml"
---

# Rust core

Modules of `crates/atelier-core/src`. Each file starts with a `//!` line that says its job.

| Module | Job |
|---|---|
| `render` | The typed calls (`values_layer`, `shapes_layer`, `grid_layer`, and the views under them) and the range checks. |
| `values`, `shapes`, `grid` | One part each. `values.rs` has the four presets (Notan, Three, Five, Families); `grid.rs` draws the Grid: Contrast lines, fixed width, squares from the top left (its constants live there too). |
| `deblock` | Calms the 8 px blocks of small JPEGs before the parts. |
| `img`, `oklab`, `srgb`, `photo`, `error` | Image type, color math (`srgb::l_star` is the one CIE L*), the upright turn, `Error::bad`. |
| `resize`, `filters` | Shared filters. `filters` holds one copy of each: the box mean, the guided filter, the percentile, the mode filter and the Otsu cut; `resize` holds Lanczos. |

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
- Real photos: `/tool-bench` (`examples/bench.rs`). Its pictures stay out of git.
- Never run `cargo clean`: `target/` is shared with other sessions.
