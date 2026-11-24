# Pencil

The photo as a study for graphite pencils: a gray picture, a little simplified, in the tones graphite
can make. Source: `crates/atelier-core/src/pencil/` (one module per idea, listed in
[ARCHITECTURE.md](../../ARCHITECTURE.md)). The sources of every number are in the research note
[2026-11-14-graphite-pencil-science.md](../research/2026-11-14-graphite-pencil-science.md); its
sections are linked below. What each control looks like in the app is in [web-app.md](../web-app.md).

## The pencils

The set is up to eight pencils, darkest first: 9B, 7B, 5B, 2B, HB, H, 3H, 4H. You can drop any
pencil you do not own. The picture uses the tones of the pencils in your set, plus bare paper.

Each pencil has one tone, the lightness (CIE L*) of a firm, even layer of that grade on white
paper: 9B 17, 7B 26, 5B 37, 2B 49, HB 60, H 70, 3H 78, 4H 86. Paper is 95. Graphite cannot go
darker than about L* 17 because of its sheen, so a pencil picture is never as dark as a photo.
These tones are a choice, not a measurement (see the end of this page).
([Research, section 1](../research/2026-11-14-graphite-pencil-science.md#1-graphite-on-paper))

## Steps

1. The photo is read as Values reads it: L* after a shadow lift, a median and a guided filter (the
   simplified photo), and L* after a 3x3 median (the fine detail).
2. **Detail** mixes the two. At 0 the picture is the simplified photo plus a quarter of the fine
   detail. At 100 it keeps all of it.
3. **Local contrast** (if on) boosts the detail of that picture.
4. **Key and Contrast** move the lightness of the picture before it is mapped to the pencils.
5. A tone curve maps the picture onto the pencils. The white point is the percentile set by
   Highlights, and the black point is the 1st percentile. The curve leans a little (10 percent)
   toward equal shares of pixels, so a middle grade is used about as much as a soft one, and a
   light face on a dark ground keeps its shading. The curve passes through the tone of each pencil
   at the middle of its zone, so a spot of that tone is exactly that pencil.
6. **Deep darks** (the accent rule). The 9B and 7B are for the deepest accents and soft grain. When
   the tones that would fall on them cover more than the set share of the picture, no tone goes
   below the next pencil. Paper never takes a dark mass, and with only soft pencils in the set
   nothing moves.
7. **Lift** (if on) lifts streaks out of the light tones, before the shares are counted.
8. The look draws the result (below).
9. **Smudge** (if on) drags the drawn graphite along the stroke.

The same photo and the same knobs give the same bytes: the grain is a hash of the pixel position,
and nothing uses a clock or a random number.

## The looks

| Look | What it draws |
|---|---|
| **Tone** (the start) | The picture of the curve, smooth. |
| **Drawing** | Tone laid on a paper tooth (a fixed noise of three sizes, stretched 2.2 times along the Hatch angle so it reads as strokes). Graphite sits on the peaks first, so a light tone is a few soft peaks and a dark tone fills the tooth; a softer pencil lays a softer edge. Tones under L* 30 get a slight sheen of at most 2 L*. The tone of a patch stays the tone. |
| **Hatch** | Lines that follow the form (the direction of the structure in the photo, read over about 2.7 percent of the long side; the Hatch angle where the form gives none). A darker tone adds lines (a line shows when the tone is darker than its own threshold) and, in the darks, a second layer across the first, turned 60 degrees. In the lights and mids the lines cover three quarters of the paper in a soft gray and have a soft edge about 2 px wide, so the fine structure of the photo is less broken. A light tone is a few faint lines; the lightest work has a rare gap (3 percent of a line at most). It is a texture of the tone, not a line drawing (Edges is the line tool) and not a stroke order. |
| **By pencil** | The Tone picture drawn with only the lightest pencils up to a Step. Every tone darker than the pencil of the step is drawn in that pencil. It shows what each pencil adds to the study. It is a view of the tone, not a stroke order. |

Drawing and Hatch keep the tone: the 16 px box mean of either one stays within about 1 L* of Tone
(Hatch is looser, because three or four lines in a box quantise the mean). In Drawing and Hatch the
grain never goes darker than the darkest tone of the picture.

The legend gives, for each level, its color and the share of the picture it covers, so you know how
much of each pencil the drawing needs. In every look a pixel counts for the pencil whose tone is
nearest, and the shares add up to at least 100. By pencil keeps the shares of the finished Tone
picture, so the legend does not change while you move the step; the level of the step is marked.
A level with no pixel shows 0.

## The knobs

Every knob has a start value at which it changes nothing. At the start values Tone draws
the same bytes as before the knobs existed, and with the three effects at 0 Drawing and Hatch draw
the same bytes as before the effects existed (a test pins both).

| Knob | Range | Start | What it does | Source |
|---|---|---|---|---|
| Detail | 0 to 100 | 50 | How much of the fine detail stays (step 2). | Values |
| Key | 0 to 100 | 50 | Lighter above 50, darker below. A key of K stops (K from -2 to 2, 25 points of the knob per stop) is a Schlick bias with `b = 2^K / (1 + 2^K)`. It keeps the ends, never clips. | [Research 3](../research/2026-11-14-graphite-pencil-science.md#3-tone-mapping-for-drawing), Schlick 1994 |
| Contrast | 0 to 100 | 50 | An S curve with its pivot in the middle and slope `a = 2^((contrast - 50) / 50)`, so `a` runs 0.5 to 2. It keeps the ends and the middle. | Research 3, our derivation |
| Highlights | 0 to 25 | 1 | The percent of the photo that may be bare paper (the white point). 1 is the old 99th percentile. | Research 3, our choice |
| Deep darks | 0 to 100 | 20 | The most of the picture, in percent, that the accent pencils (9B and 7B) may cover. | [Research 1](../research/2026-11-14-graphite-pencil-science.md#1-graphite-on-paper), first note on grades |
| Local contrast | 0 to 100 | 0 (off) | A guided filter (radius 2 percent of the long side, epsilon 16) splits base and detail. The detail is boosted by `g = 1.5 x local / 100` with a soft limit `D tanh(detail / D)`, D = 15 L*, so no halos. | Research 3, Durand and Dorsey 2002, He et al. 2013 |
| Grain | 0 to 100 | 50 | How strong the paper grain is in Drawing and Hatch. 0 is the plain tone. | Research 2, Sousa and Buchanan 1999 |
| Paper | Smooth, Medium, Rough | Medium | The size of the tooth (a grain of 0.9, 1.3 and 2.0 px at a long side of 1024) and how soft the edge of a mark is (0.30, 0.22 and 0.12 of the tooth height: soft on Smooth, crisp on Rough). | Research 2, Curtis 1997 |
| Hatch angle | 0 to 179 degrees | 45 | The direction of the lines where the form gives none, and of the Drawing streaks. | Research 2, Brox 2006 |
| Hatch density | 0 to 100 | 50 | The spacing of the lines: about 7 px at 0 to 3 px at 100 (at a long side of 1024, larger on a larger picture). | Research 2, Praun 2001 |
| Step | 1 to 8 | 1 | By pencil: how many pencils are down, from the lightest. A step over the size of the set takes the darkest pencil of the set. | Our choice |
| Smudge | 0 to 100 | 0 (off) | A blending stump: each pixel takes a weighted mean of the pixels on a short line through it along the Hatch angle (a triangle of weights, up to 12 px each way at a long side of 1024). Tone, Drawing, Hatch. In Drawing a pixel counts less the further its tone is from the center (it counts half at a step of 12 L*), so the tooth blends away but a clear edge is not smeared across. The mean stays within 1 L*. | Our choice |
| Lift | 0 to 100 | 0 (off) | A kneaded eraser: soft streaks that pull a light tone toward paper. One mark at most per 40 px cell, with a hashed place, angle, length and width. At 100 a mark takes a tone 70 percent of the way to paper. Only tones lighter than L* 70 are touched (full effect from L* 82). Tone, Drawing, Hatch. The mean moves 2 L* at most. | Our choice |
| Cross | 0 to 100 | 0 (off) | More crossed work in the darks. Hatch: the first layer tops out lower, so the second layer starts at a lighter tone, and a third layer joins it, turned 120 degrees. The covered share of the paper stays as it was. Drawing: a second paper tooth, turned a quarter, mixes into the first in the darks (up to half at 100). Lights are not touched. Drawing, Hatch. | Our choice |

The three effects (Smudge, Lift, Cross) are off at 0. By pencil ignores them, because they
show the tone and the shares as they are. Each effect is a hash of the position, so the same photo
and the same numbers give the same bytes.

Reset puts every knob back to its start. It keeps the look and the set of pencils.

## Auto

Auto sets Key, Contrast and Highlights from the photo. It reads the smoothed L* (the same picture as
step 1), between its 1st and 99th percentile. It is a fixed rule, not a model, so the same photo
gives the same answer, and the note in the app says what it did.
([Research 3](../research/2026-11-14-graphite-pencil-science.md#3-tone-mapping-for-drawing))

- **Key class** from the median L*: under 35 low key, 35 to 65 mid, over 65 high key.
- **Two humps.** A photo is bimodal when Otsu's ratio of between-class to total variance is at least
  0.80, the smoothed histogram has a real valley at the cut, and each side holds at least 15 percent
  of the pixels. A bimodal photo keeps Key 50 and never gets more contrast.
- **Key:** the median moves half way to the middle of the range (target `0.5 + 0.5 x (median - 0.5)`),
  and Key is the bias that does that, within one stop (Key 25 to 75), so the photo keeps its mood.
- **Contrast:** `a = 0.45 / IQR` (the spread of the middle half of the tones), kept between 0.8 and 2.
- **Highlights:** 2 percent; 5 for a high key photo; 1 for a low key photo; one more when the light
  end is a thin spike (a glint: 99.9th minus 97th percentile over 10 L*).

## Suggest pencils

Suggest picks the best 3 to 6 pencils of the eight for the photo. It always chooses from all eight,
not from the set in use.

- It reads the smoothed L* stretched onto the range of the pencils (L* 17 to 95): that is the ideal
  tone of each pixel.
- It tries every set of the asked size (at most 70 sets) and keeps the set with the least squared
  error. For a set, the picture is mapped onto the range of its darkest pencil, so each ideal tone
  moves the same way, and is then matched to the nearest pencil of the set or paper.
- **Tie rule:** equal error goes to the set with the larger smallest gap between neighbor tones
  (paper counts), then to the set with the smaller bit list (lower mask).
- The sums are exact (integer counts), so the answer is the same on every machine.

([Research 4](../research/2026-11-14-graphite-pencil-science.md#4-choosing-pencils-for-a-photo))

## Timing

A 1024 px work picture, in ms. The browser row is the wasm build in headless Chromium on one
portrait photo, mean of three; the native rows are release builds, the mean and the slowest of 16
photos.

| | Shapes, step 3 | Tone | Drawing | Hatch | By pencil |
|---|---|---|---|---|---|
| Browser (wasm), one photo | 630 | 234 | 287 | 439 | 220 |
| Native, mean of 16 photos | | 233 | 278 | 387 | 231 |
| Native, slowest photo | | 324 | 381 | 526 | 318 |

- Every Pencil look stays under Shapes, the slowest of the other parts. Hatch is the heaviest look
  (its card hint says so).
- Key 60, Contrast 70 and Local contrast 70 together: Tone 307 native on average; Hatch with them
  and density 100: 509 in the browser, 625 native on the slowest photo.
- Auto and Suggest pencils: 94 ms each in the browser.
- Native and wasm give the same bytes for every look (checked on a made-up picture).

## What stays a guess

- **The tone of every pencil.** No public table of L* per grade exists. The first note on grades gave
  these numbers from painter guides. To settle them, scan a swatch of your own pencils on your paper
  at one pressure and change `TONES` in `pencil/grades.rs`. It is row 63 in
  [LEFTOVERS.md](../LEFTOVERS.md).
- The ranges of Key and Contrast (two stops, slope 0.5 to 2; one stop of Key was too small to see on
  real photos), the 20 percent of Deep darks, and the
  radius, limit and gain of Local contrast.
- The size of the tooth, the line widths and spacing, the start of the cross lines and the size of
  the sheen. Hatch matches the photo less well than Drawing (lines 3 to 7 px apart cannot follow a
  photo pixel for pixel; the light portraits come closest) and runs a little lighter on light photos.
- Every threshold of Auto (35 and 65 for the key, 0.80 for two humps, the highlights percent).

How a painter picks a grade (hard for light tones, soft for dark, 9B and 7B only for accents) is in
[research/2026-11-14-graphite-pencil-grades.md](../research/2026-11-14-graphite-pencil-grades.md).
