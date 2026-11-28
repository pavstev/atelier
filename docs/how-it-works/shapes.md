# Shapes

Shapes cuts the photo into the shapes you paint, and shows them in paint order. Code:
`crates/atelier-core/src/shapes.rs` and `crates/atelier-core/src/shapes/`.

## What you see

**Step** is the paint order. Each step adds to the canvas of the steps before. Each shape keeps
its own color.

1. **Shadows.** Thin paint first.
2. **Halftones.**
3. **Lights.** Thicker paint.
4. **Accents.** The darkest darks and brightest lights, last.

The order holds for acrylic: shadows go down first, and the accents come last, on top of the
rest. (Fat over lean is an oil rule, for paint layers that dry slowly. It does not apply to
acrylic.) **Detail** sets how small the shapes get. The steps cut the photo fine, up to
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
6. The steps use the light and shadow masses of Values, and each shape is painted in its mean
   color. Shapes of near the same color share one pile.

Ties break by cost and id, so the result is deterministic.

## Known limits

These come from a rating round on a local set of test photos, and there is no fix yet.

- Busy colorful scenes can turn into muddy masses at the Auto level. Thin dark figures become
  blobs, straight architecture bends, and eye sockets become black holes at the Small level. The
  Shapes base of the app is the steps view (about 400 shapes) and is not muddy on the bench.
- At the Big level a face can still melt into the ground, and a subject can join a big neighbor
  of a close value. The merge looks at OKLab only.

Tried on 2026-11-24, no gain: the border weight of the merge (`Rag` `edge_weight` 0.5, 2.0 and
3.0) and the color weights from 0.75 to 1.5 (border fit F 0.455 to 0.451 or 0.456 on 85 photos).
Do not repeat these. A new idea needs a new measure, not a new weight.
