# Grid

Grid draws guide lines over the photo: the rule of thirds, a square grid, or both. Code:
`crates/atelier-core/src/grid.rs`.

## What you see

- **Mode.** Thirds, Grid or Both.
- **Cells.** 3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40 or 50 squares across the width. The squares
  are whole, and the same size down the height.
- **Count by cm.** With a paper set, the squares can be a whole number of cm (1, 2, 3, 4, 5, 6, 8
  or 10) instead of a count. The page turns the step into a count of squares across the width and
  hands it to the core in thousandths (7500 is 7.5 squares). Which width: with Fit to paper, the
  photo is cut to the paper, so its width is the paper width. With Whole photo, the long side of
  the photo is taken as the long side of the paper, so the width is the photo width scaled by that
  (`shownWidthCm` in `app/web/src/features/size/paper.ts`). Then the squares are the step in cm
  on a print of that size, and the Paper line says "about", because you may print it another size.
  A step that does not divide the width leaves a part square at the right and the bottom. A heavy
  line closes every 2 or 4 steps.
- **Center.** Puts a heavy line through the middle of the photo each way and grows the squares out
  from there. The part squares then sit at all four edges, the same on both sides.
- **Group.** A heavy line closes every block of 2 x 2 or 4 x 4 cells.
- **Width.** 1 to 16. 2 is a 1 px line on screen. 1 is a see-through 1 px line.
- **Color.** Contrast, or one color you pick.

In Both, the thirds are heavy lines too. The lines cover the whole photo and nothing is cropped.

## Contrast lines

Each pixel of a Contrast line takes the hue of the photo around it, turned half way round in
OKLab. The tone is black on a light patch and white on a dark one, so the line stays visible.
Lines have no halo.

The tone is held along a line. It is worked out per segment, the part of a line between two
crossings: the patch lightness is averaged across the thickness of the line, smoothed along it,
and the tone turns only when the lightness leaves a band round the middle (0.45 to 0.55 in OKLab
L). So a wobble in the photo does not make the line flicker. It still turns where the photo
really changes, for example from a bright sky to a dark floor, because there neither tone would
read on the whole segment. A crossing takes the tone of the line it cuts.

## How it is made

Line positions are integers and there is no antialiasing. The count is kept in thousandths of a
square, from 0.1 to 500 (`layer_milli`); a whole count is the same bytes as before. A count out
of range is `BadInput`. A line thinner than 1 px is drawn 1 px
wide and see-through in step, so the thinnest lines stay thin on screen. The same input gives the
same bytes.

## Known limits

A line that crosses a bright area and a dark area in one segment turns tone where the photo
changes. Holding one tone for the whole segment was tried and read worse on a mixed segment.
