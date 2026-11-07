# Values

Values turns the photo into a few flat tones, so you can see the light and dark masses before you
paint. Code: `crates/atelier-core/src/values.rs`.

## What you see

Six presets:

| Preset | Tones |
|---|---|
| Notan | 2: light and dark |
| Three | 3: dark, middle, light |
| Five | 5, at Munsell V2, V4, V6 and V8 cuts |
| Shadow family | the shadow mass in three steps |
| Light family | the light mass in three steps |
| Families | the light and shadow masses cut separately, then once inside each |

**Detail** controls how small a region may be before it joins its neighbor. **Tint** paints the
tones in Gray or in Umber.

The legend in the Base pop-up shows each tone as a Munsell value, V1 (dark) to V9 (light). Press a
swatch to see it big on a middle gray mat with its hex and RGB, so you can hold a brush or a paint
chip next to it. Press it again to fill the screen.

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
6. Paint each step in the tone of the preset.

There is no randomness, no clock and no hash map order, so the same input gives the same bytes.

## Why

Painters work from a few big masses, not from every gradient. About four chunks fit in working
memory, so two to five tones is the useful range. The research is in
[the science of values](../research/2026-11-04-painting-value-science.md).

## Known limits

See the Core rows in [LEFTOVERS.md](../LEFTOVERS.md). For example, a light subject can melt into a
light ground.
