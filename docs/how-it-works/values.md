# Values

Values turns the photo into a few flat tones, so you can see the light and dark masses before you
paint. Code: `crates/atelier-core/src/values.rs`.

## What you see

Four presets:

| Preset | Tones |
|---|---|
| Notan | 2: light and dark |
| Three | 3: dark, middle, light |
| Five | 5, at Munsell V2, V4, V6 and V8 cuts |
| Families | the light and shadow masses cut separately, then once inside each |

**Detail** controls how small a region may be before it joins its neighbor. The tones are gray.

The legend in the Base pop-up shows each tone as a Munsell value, V1 (dark) to V9 (light). Press a
swatch to hold that color in the paint mix card of the color picker, with its hex and the amounts of
white, yellow, red, blue and black to mix for it.

## How it is made

1. Resize to the work picture. Convert sRGB to linear luminance (Rec 709), then to CIE L*.
   Munsell value is L* divided by 10, within about 1 L*.
2. Lift the shadows with a gentle curve. The curve depends on how dark the photo is.
3. Smooth with a median filter, then a guided filter, so a noisy gradient does not break into
   islands.
4. Cut at fixed teacher steps. The Notan cuts at the light/shadow break found by Otsu's method.
   Three cuts there first, then once inside one family, so no step crosses the break.
5. Clean the label map: a mode filter, then small regions join the neighbor with the closest
   value. A small region stays when it is two or more steps away from every neighbor (an eye, a
   dark accent).
6. Paint each step in its gray tone.

There is no randomness, no clock and no hash map order, so the same input gives the same bytes.

## Why

Painters work from a few big masses, not from every gradient. About four chunks fit in working
memory, so two to five tones is the useful range. The research is in
[the science of values](../research/2026-11-04-painting-value-science.md).

## Known limits

- A light subject can melt into a light ground (a face and the sky share one step), and a subject
  can join a big neighbor of a close value. In Values the melt is the cut, not the merge: the merge
  only touches regions under about 0.25 percent of the picture.
- Three on a photo where the darkest or the lightest step covers most of it is not re-keyed. A dark
  bridge at dusk stays mostly dark, and two lit walls fall on both sides of a cut. A re-key is
  tried only when the middle step covers over 70 percent (`ONE_STEP_MAX` in `values.rs`).

Tried and left out, with the numbers so nobody repeats them:

- **Move the Three cuts (2026-11-24).** Cuts 35 and 68 moved to the emptiest place of the L*
  histogram within 3 to 6 L*: purity 0.887 to 0.910, but tone error 1.825 to 1.984, and a face
  lost its dark accents. Moving only the light cut: purity 0.895, tone error 1.864. Moving a cut
  only in a real valley: purity 0.890, tone error 1.839. No clean gain. A re-key into thirds
  (2026-11-03) inverted a dark room and darkened a high-key street.
- **Fast Global Smoother for the smoothing (2026-11-24).** The port costs about 15 ms per round on
  a 1024 x 768 photo. With an exponential link weight Values went from 123 to 59 ms and the bench
  score matched, but a flat 20 L* step grew a band of a third tone. A Gaussian link weight stopped
  the band but kept small specks (tone error 1.825 to 1.9). With the 5 x 5 median back it was 23
  percent faster in wasm and the picture was busier, and Shapes reads the same smoothing. Not kept.
