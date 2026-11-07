# Grid

Grid draws guide lines over the photo: the rule of thirds, a square grid, or both. Code:
`crates/atelier-core/src/grid.rs`.

## What you see

- **Mode.** Thirds, Grid or Both.
- **Cells.** 3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40 or 50 squares across the width. The squares
  are whole, and the same size down the height.
- **Center.** Puts a heavy line through the middle of the photo each way and grows the squares out
  from there. The part squares then sit at all four edges, the same on both sides.
- **Group.** A heavy line closes every block of 2 x 2 or 4 x 4 cells.
- **Width.** 1 to 16. 2 is a 1 px line on screen. 1 is a see-through 1 px line.
- **Color.** Contrast, or one color you pick.

In Both, the thirds are heavy lines too. The lines cover the whole photo and nothing is cropped.

## Contrast lines

Each pixel of a Contrast line takes the complement of the photo around it: the OKLab hue turned
half way round. So a line is dark on a light patch and light on a dark one, and stays visible.
Lines are one color, with no halo.

## How it is made

Line positions are integers and there is no antialiasing. A line thinner than 1 px is drawn 1 px
wide and see-through in step, so the thinnest lines stay thin on screen. The same input gives the
same bytes.

## Known limits

Lines can be hard to see on a blown white area or a very dark photo. See the Core rows in [LEFTOVERS.md](../LEFTOVERS.md).
