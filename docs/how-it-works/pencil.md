# Pencil

The photo as a study for graphite pencils. Each zone is one pencil of your set, and the lightest
zone is bare paper. Source: `crates/atelier-core/src/pencil.rs`.

## What it does

The set is up to eight pencils, darkest first: 9B, 7B, 5B, 2B, HB, H, 3H, 4H. You can drop any
pencil you do not own. The photo is cut into one zone per pencil in the set, plus paper.

Each pencil has one tone, the lightness (CIE L*) of a firm, even layer of that grade on white
paper: 9B 17, 7B 26, 5B 37, 2B 49, HB 60, H 70, 3H 78, 4H 86. Paper is 95. Graphite cannot go
darker than about L* 17 because of its sheen, so a pencil picture is never as dark as a photo.

## Steps

1. The photo is smoothed as Values smooths it (shadow lift, median, guided filter).
2. The smoothed lightness is stretched: its 1st percentile becomes the darkest pencil of your
   set, and its 99th becomes paper. The cuts sit half way between two tones. They lean 35 percent
   to equal shares of pixels, so a middle grade is used as much as a soft one.
3. The zone map is cleaned as in Values: a mode filter, then small shapes merged into a
   neighbor. **Detail** sets the smallest zone that survives.
4. **Accent rule.** The 9B and 7B are for the deepest accents and soft grain. When they would
   cover over 20 percent of the picture together with the zones that move up to them (a black
   backdrop), that mass is drawn one pencil lighter, in the 5B for a full set. Paper never takes a
   dark mass, and with only soft pencils in the set nothing moves.
5. **Map** paints each zone flat. **Drawing** paints the same zones with graphite grain and light
   hatching on warm paper. The grain swings up to 4.5 L* around the tone and averages out, so a
   zone keeps its tone. The hatch leans the other way in every second zone.

The legend gives, for each level, its color and the share of the picture it covers, so you
know how much of each pencil the drawing needs. A level with no pixel shows 0.

The same photo and the same knobs give the same bytes: the grain is a hash of the pixel position.

## Why these numbers

How a painter picks a grade (hard for light tones, soft for dark, 9B and 7B only for accents) is in
[research/2026-11-14-graphite-pencil-grades.md](../research/2026-11-14-graphite-pencil-grades.md).
The tone of each grade is a choice for a study, not a measurement of your pencils. Test your own on
a scrap of your paper and change `TONES` in `pencil.rs` if they differ.
