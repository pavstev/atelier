# Edges

Edges draws a painter's line drawing over the photo. Code: `crates/oil-core/src/edges/`.
The core finds the edges itself. It uses no model.

## What you see

Three modes:

- **Lines.** Black lines. Big forms get heavy lines, detail gets light ones, and lost edges fade.
- **Transfer.** A cleaner set of lines for copying the drawing onto a canvas.
- **Masses.** The borders of the big masses.

**Amount** (0 to 100, starts at 67) sets how many lines are drawn. **Width** (1 to 10, starts at 5)
scales every line. In Lines, **Even** (0 to 100, starts at 50) pulls the widths toward one width:
0 keeps the widths as traced, 100 makes every line one width. Every line is black.

## How it is made

1. **The edge map** (`edges/map.rs`). Blur the luma with a Gaussian (sigma 2 px at 1024 px), take
   the Sobel gradient, and scale it by its 99th percentile to 0 to 1.
2. **Thin.** The orientation comes from the structure tensor of the map. Non maximum suppression
   across it makes a thick band 1 px wide. Hysteresis keeps strong lines and the weak ones that
   touch them.
3. **Link.** Join pixels into chains, bridge gaps by good continuation, close near closed chains,
   drop short chains and doubles that run along a longer chain.
4. **Rank.** Weight each chain by length and mean strength, smooth and simplify its path, and rank
   it inside the ink budget that Amount sets.
5. **Draw.** Width comes from the weight, with a taper at both ends.

The same input gives the same bytes.

## How it is scored

The Edges score on the BSDS500 boundary set is described in
[development/bench.md](../development/bench.md).

## Known limits

Edges see brightness only: a color edge of equal brightness is lost. See the Core rows in
[LEFTOVERS.md](../LEFTOVERS.md).
