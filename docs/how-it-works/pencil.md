# Pencil

The photo as a study for graphite pencils: a gray picture, a little simplified, in the tones graphite
can make. Source: `crates/atelier-core/src/pencil.rs`.

## What it does

The set is up to eight pencils, darkest first: 9B, 7B, 5B, 2B, HB, H, 3H, 4H. You can drop any
pencil you do not own. The picture uses the tones of the pencils in your set, plus bare paper.

Each pencil has one tone, the lightness (CIE L*) of a firm, even layer of that grade on white
paper: 9B 17, 7B 26, 5B 37, 2B 49, HB 60, H 70, 3H 78, 4H 86. Paper is 95. Graphite cannot go
darker than about L* 17 because of its sheen, so a pencil picture is never as dark as a photo.

## Steps

1. The photo is read as Values reads it: L* after a shadow lift, a median and a guided filter (the
   simplified photo), and L* after a 3x3 median (the fine detail).
2. **Detail** mixes the two. At 0 the picture is the simplified photo plus a quarter of the fine
   detail. At 100 it keeps all of it.
3. A tone curve maps the photo onto the pencils. The 1st percentile of the photo becomes the
   darkest pencil of your set, and its 99th becomes paper. The curve leans a little (10 percent)
   toward equal shares of pixels, so a middle grade is used about as much as a soft one, and a
   light face on a dark ground keeps its shading. The curve passes through the tone of each pencil
   at the middle of its zone, so a spot of that tone is exactly that pencil.
4. **Accent rule.** The 9B and 7B are for the deepest accents and soft grain. When the tones that
   would fall on them cover over 20 percent of the picture (a black backdrop), no tone goes
   below the next pencil, the 5B for a full set. Paper never takes a dark mass, and with only soft
   pencils in the set nothing moves.

## Looks

- **Tone** (the start): the picture of the curve, smooth.
- **Drawing:** Tone with graphite grain and hatching on warm paper. Light areas keep only the
  paper tooth. Dark areas get more grain and a second hatch the other way, so they read as
  cross-hatched. The grain swings up to 4.5 L* around the tone and averages out, so the tones hold.
- **Zones:** flat tones, one per pencil, cut where the pencils change (the cuts lean 35 percent to
  equal shares). The zone map is cleaned as in Values (a mode filter, small shapes merged);
  Detail also sets the smallest zone. Use it to see where each pencil goes.

The legend gives, for each level, its color and the share of the picture it covers, so you know
how much of each pencil the drawing needs. In Tone and Drawing a pixel counts for the pencil whose
tone is nearest. A level with no pixel shows 0.

The same photo and the same knobs give the same bytes: the grain is a hash of the pixel position.

## Why these numbers

How a painter picks a grade (hard for light tones, soft for dark, 9B and 7B only for accents) is in
[research/2026-11-14-graphite-pencil-grades.md](../research/2026-11-14-graphite-pencil-grades.md).
The tone of each grade is a choice for a study, not a measurement of your pencils. Test your own on
a scrap of your paper and change `TONES` in `pencil.rs` if they differ.
