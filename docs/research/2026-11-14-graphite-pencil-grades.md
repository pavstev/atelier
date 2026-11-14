# Graphite pencil grades, 2026-11-14

Notes for the Pencil view ([how-it-works/pencil.md](../how-it-works/pencil.md)). A record: do not
rewrite it.

## What the sources agree on

- The grade is the mix of graphite and clay. More graphite is softer and darker (B), more clay is
  harder and lighter (H).
- **Light tones:** a hard grade (H range) with light pressure. 2H or 3H for broad outlines, 4H
  for fine detail. For the brightest points leave the paper bare or lift graphite with a kneaded
  eraser.
- **Midtones:** HB is the all-round pencil. 2B is a darker midtone and smudges. Form is often
  built with HB through 4B.
- **Darks:** 3B to 6B, with more pressure. A 5B gets close to the darkest graphite makes.
- **Darkest accents:** 7B to 9B, for the deepest accents and soft grain, and not for blocking in
  big areas. Pure black is hard to reach with graphite because of its sheen.
- A common portrait order: structure in H or 2H, modeling in HB to 4B, deepest accents in 6B to 9B.

## What no source gave

No source maps a photo value level to a grade. The tones in `pencil.rs` (L* 17 to 86) and the
accent rule are our choices. They are a start for a study, to be checked on your own pencils and paper.

## Photo to pencil in the literature

Im2Pencil (CVPR 2019) splits the job into sketchy outlines (an extended difference of Gaussians)
and tonal shading, and notes that hatching is the hard part. Atelier keeps Edges (outlines) apart
from the tone, and Pencil mode shows tone only.

## Sources

- [Rapid Fire Art, graphite pencil guide](https://rapidfireart.com/2017/01/03/beginners-guide-to-graphite-drawing-pencils/)
- [Blick, how to choose a drawing pencil](https://www.dickblick.com/lp/how-to-choose-a-drawing-pencil/)
- [Cowling and Wilcox, graphite pencil grades](https://www.cowlingandwilcox.com/blog/post/267-graphite-pencil-grades-a-practical-guide-for-artists)
- [Camilla Rose, values in graphite pencils](https://camillaroseart.substack.com/p/understanding-values-in-graphite)
- [Im2Pencil, CVPR 2019](https://openaccess.thecvf.com/content_CVPR_2019/papers/Li_Im2Pencil_Controllable_Pencil_Illustration_From_Photographs_CVPR_2019_paper.pdf)
