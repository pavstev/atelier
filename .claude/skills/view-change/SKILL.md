---
name: view-change
description: Change what one part (Values, Shapes, Edges or Grid) draws (a preset, a knob, a range, a new mode) in Atelier, across the Rust core, the wasm edge and the web app, with honest reference pictures. Use for any change to a part's output or its options.
---

# Change what a part draws

A part's output is a contract between Rust and the web app. Touch every file, in this order.

## Files

1. The module in `crates/oil-core/src` (`values`, `shapes`, `grid` or `edges/`) (see `.claude/rules/rust.md` for which one).
2. `crates/oil-core/src/render.rs`: the typed call and its range checks.
3. `crates/oil-core/tests/tools_reference.rs`: the cases of the part, when a preset is added or
   removed.
4. `crates/oil-wasm/src/lib.rs`: the method of the part on `Photo` for the page.
5. `app/web/src`: `draw/calls.ts` (the typed call), `features/tools/settings.ts` (`LOOK` and
   `callFor`; the Base is Photo, Values, Shapes or Paper), `draw/worker.ts` (the call into wasm)
   and `features/tools/Panel.tsx` (the controls).
6. `docs/web-app.md`, the controls list, when a user can see the change.

Read little. A change needs about 600 lines: the rules (AGENTS.md, `rust.md`), the typed call
in `render.rs`, `oil-wasm/src/lib.rs`, `features/tools/settings.ts`, `draw/calls.ts`, and the `view` function of one
core module (use the LSP tool, do not read the whole module).

## Checks, in order

1. `bash scripts/test-files.sh <the changed .rs files>`.
2. `cargo xtask refs`. A failure is expected only for the views you meant to change.
   Look at the picture before you bless: render the view and read the PNG.
3. `cargo xtask refs --bless`. The commit message says which views moved and why.
4. `mise run check:fast`, then `mise run web:e2e` (headless Chromium) when a control changed, and
   `mise run check` once before the push.

## Rules

- A number out of range is `Error::BadInput`, never a panic.
- Do not bring back a dropped feature (see `AGENTS.md`).
