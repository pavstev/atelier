# Edges

Edges draws a painter's line drawing over the photo. Code: `crates/atelier-core/src/edges/`.
The core finds the edges itself. It uses no model.

## What you see

Four modes:

- **Lines.** Black lines. Big forms get heavy lines, detail gets light ones, and lost edges fade.
- **Transfer.** A cleaner set of lines for copying the drawing onto a canvas.
- **Masses.** The borders of the big masses.
- **Sketch.** The chains of Lines, drawn as loose graphite strokes: one dark gray (not black), a
  width that changes along each stroke, a pressure taper at both ends, and a grainy, uneven edge.
  Long chains are cut into overlapping strokes, the strongest ones are doubled with a lighter
  second pass, and weak chains start late and stop early. It has no grades: the gray is one value.

**Amount** (0 to 100, starts at 67) sets how many lines are drawn, in Sketch too. **Width** (1 to
10, starts at 5) scales every line. In Lines, **Even** (0 to 100, starts at 50) pulls the widths
toward one width: 0 keeps the widths as traced, 100 makes every line one width. Every line is
black, except in Sketch.

Edges is off while the base is Pencil, so Sketch is for Photo, Values, Shapes and Paper. A dark
gray stroke is faint over a very dark area, as black lines are.

## How it is made

1. **The edge map** (`edges/map.rs`). Blur the luma with a Gaussian (sigma 2 px at 1024 px), take
   the Sobel gradient, and scale it by its 99th percentile to 0 to 1. The color gradient (the
   OKLab a and b planes, blurred the same way, times 4) counts too: each pixel takes the larger
   of the two, so a color edge of equal brightness is drawn and a brightness edge is unchanged.
2. **Thin.** The orientation comes from the structure tensor of the map. Non maximum suppression
   across it makes a thick band 1 px wide. Hysteresis keeps strong lines and the weak ones that
   touch them.
3. **Link.** Join pixels into chains, bridge gaps by good continuation, close near closed chains,
   drop short chains and doubles that run along a longer chain.
4. **Rank.** Weight each chain by length and mean strength, smooth and simplify its path, and rank
   it inside the ink budget that Amount sets.
5. **Draw.** Width comes from the weight, with a taper at both ends.
   Sketch draws instead (`edges/trace/sketch.rs`): each chain is resampled every 2 px and cut into
   strokes of 110 to 220 px that overlap by a few points. A stroke presses in over 10 to 24 px and
   lifts over 22 to 48 px, wavers up to 1.2 px across its path and changes its pressure slowly.
   The ink fades where the edge is lost, as in Lines. A chain of weight 0.3 or more gets a second
   pass 1.4 to 2.2 px aside, at half the pressure. A weak chain drops up to 20 percent of its
   start and 12 percent of its end. A grain of a hash of the pixel breaks up the coverage. All
   noise comes from a hash of the chain (first point and length), so the same input gives the
   same bytes.

The same input gives the same bytes.

## How it is scored

The Edges score on the BSDS500 boundary set is described in
[development/bench.md](../development/bench.md).

## Known limits

See the Core rows in [LEFTOVERS.md](../LEFTOVERS.md): round rims drawn as faint rings, short
squiggles on leaves and grass, shadow shapes that close into loops.
