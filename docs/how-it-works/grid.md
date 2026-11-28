# Grid

Grid draws a square grid over the photo, to copy proportions. Code:
`crates/atelier-core/src/grid.rs`.

## What you see

- **On.** Turns the grid on or off.
- **Opacity.** How strong the lines are.
- **Step in cm.** The squares are a whole number of cm (1, 2, 3, 4, 5, 6, 8 or 10) on the paper.
  The page turns the step into a count of squares across the width and hands it to the core in
  thousandths (7500 is 7.5 squares). Which width: with Fit to paper, the photo is cut to the
  paper, so its width is the paper width. With Whole photo, the long side of the photo is taken as
  the long side of the paper, so the width is the photo width scaled by that (`shownWidthCm` in
  `app/web/src/features/size/paper.ts`). Then the squares are the step in cm on a print of that
  size, and the Paper line says "about", because you may print it another size.

The squares start at the top left corner. A step that does not divide the width leaves a part
square at the right and the bottom. All lines are the same. The lines are Contrast lines, 1 px on
screen, and they cover the whole photo. Nothing is cropped.

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
square, from 0.1 to 500 (`grid_layer`). A count out of range is `BadInput`. The same input gives
the same bytes.

## Known limits

A line that crosses a bright area and a dark area in one segment turns tone where the photo
changes. Holding one tone for the whole segment was tried and read worse on a mixed segment.
