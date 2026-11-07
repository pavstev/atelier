# Shapes

Shapes cuts the photo into the shapes you paint, and shows them in paint order. Code:
`crates/atelier-core/src/shapes.rs` and `crates/atelier-core/src/shapes/`.

## What you see

**Step** is the paint order. Each step adds to the canvas of the steps before. Each shape keeps
its own color.

1. **Shadows.** Thin, lean paint.
2. **Halftones.**
3. **Lights.** Thick paint.
4. **Accents.** The darkest darks and brightest lights, last.

The order follows fat over lean: thin paint first, thick paint last, so the paint layers dry
without cracking. **Detail** sets how small the shapes get. The steps cut the photo fine, up to
about 400 shapes, down to about 30 px.

The legend in the Base pop-up lists the piles of paint to mix in the current step, as Munsell
values. A pile never mixes two color families (skin, foliage, sky, the grays). A family has at most
4 piles, because about 4 chunks fit in working memory.

## How it is made

1. Convert to OKLab at the work picture size.
2. A rolling guidance filter removes texture and keeps big edges.
3. SNIC superpixels on the filtered image, with seeds on a fixed grid.
4. A region adjacency graph with a greedy merge. The cost is a Ward distance in OKLab (lightness
   weighs more than color), plus the contrast along the shared border, plus a small size term.
   Every merge is recorded in one tree, so the big, medium and small levels nest.
5. A smoothing step snaps and rounds the borders.
6. The steps use the light and shadow families of Values, and each shape is painted in its mean
   color. Shapes of near the same color share one pile.

Ties break by cost and id, so the result is deterministic.

## Known limits

See the Core rows in [LEFTOVERS.md](../LEFTOVERS.md). For example, busy colorful scenes can turn
into muddy masses.
