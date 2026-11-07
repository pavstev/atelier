# Value study algorithm and presets

Date: 2026-10-28. Time box: 8 minutes. Items marked INFERRED are my reasoning, not a source. All numbers marked INFERRED need a test on the photo set (docs/research/2026-10-28-test-photo-set.md).

## 1. Which lightness

Use CIE L* computed from linear sRGB luminance Y (Rec 709 weights). Reasons:
- Munsell value V and L* are nearly the same scale. The Newhall 1943 quintic gives Y% from V: Y = 1.2219V - 0.23111V^2 + 0.23951V^3 - 0.021009V^4 + 0.0008404V^5. The coefficients are confirmed by a search hit on colour-science. The library test value is V 3.74629715382 gives Y 10.4089874. I checked the polynomial by hand at that V and got 10.41.
- ASTM D1535 uses a slightly different polynomial (same V gives Y 10.149). The two differ by a few percent. Pick one. Newhall is enough.
- INFERRED (hand computed from Newhall, then CIE L* from Y): V1 = Y 1.21 = L* 10.6. V2 = 3.13 = 20.5. V3 = 6.55 = 30.8. V4 = 12.0 = 41.2. V5 = 19.8 = 51.6. V6 = 30.1 = 61.7. V7 = 43.1 = 71.6. V8 = 59.1 = 81.3. V9 = 78.7 = 91.1. So L* is about 10 x V, within about 1.5 units. This is why equal steps in L* and equal steps in Munsell value are the same thing for this job.
- Middle grey V5 is only about 20% Y. Pixel 128 in sRGB is about L* 54, so near V5.
- OKLab L is cbrt of Y for neutrals (INFERRED from memory of the OKLab definition, not searched). It is a cube root, so L_ok x 100 is not L*. Use L* because teachers' scales and the one notan tool I could read (below) use L*.
- Wikipedia gives no formula for V to Y. It only says V0 and V10 are theoretical limits.

## 2. Where to put thresholds

Sources:
- Notan Generator (artincontext.org) works in L*. It offers a manual slider 1 to 99, Otsu for 2 values, an exhaustive pair search for 3 values, k-means "fit to this image", and "even steps" at L* 0, 25, 50, 75, 100. It labels a picture low key under mean 40 and high key over 60.
- Value Study Assistant (App Store) gives 2 to 10 levels by slider, plus "Modify Values" to move groups. Threshold logic is not documented. The name "Diem" is not confirmed by my search.
- Notanizer: reviews say 2 values, optionally 3 or 4. Thresholds not documented. Gap.
- Key definitions (MacDonald, Outdoor Painter): high, middle, low key by where the foundation values cluster. Sighack gives rough bands on a 10 step scale: high 1 to 5, middle 3 to 7, low 6 to 10 (lighter is the lower number there). In V terms that is high V5 to V9, middle V3 to V7, low V1 to V5.
- Loomis's keys are named in a search snippet (high, middle, low, full scale). I could not confirm he defined a four value set.

Recommendation: fixed Munsell aligned thresholds for 3, 4 and 5 values, because teachers talk in absolute value steps. Use Otsu only for the 2 value cut and the light/shadow split, clamped so a odd photo cannot give all black. Offer k-means as an optional "fit" button. Not a knob in the first screen.

## 3. Edge aware smoothing

Cause of the beginner complaint: threshold a noisy gradient and you get contour islands inside one shape. Fix it before the cut and after it.
- Proko says Photoshop's median noise removal filter can simulate squinting and keeps edges sharp. It gives no radius.
- No source ties squinting to a Gaussian sigma. I searched. Gap.
- INFERRED squint size: sigma about 1.5% of the long edge, so about 7 to 8 px at 512, range 5 to 13 px. Reasoning: a squint removes detail finer than about 1 to 2% of the view. Not measured.
- INFERRED edge aware step: guided filter in L*, guide is L* itself, radius 8 px, eps 0.01 (L* scaled 0 to 1, so edges stronger than about 10 L* survive), two passes. Before it, median 5x5 to kill speckle.
- After the cut: mode (majority) filter 5x5, then merge any region under 0.25% of the area (about 650 px at 512 x 512) into its neighbour. Core already merges specks (commit 4263b49).
- Protect accents: keep a small region if it is 2 or more steps away from every neighbour (eyes, a dark note). INFERRED.
- Kuwahara (anisotropic) is a good alternative look, not needed for the data path.

## 4. Shadow lift

Gurney is reported (review, secondary source) to warn that on a camera "deep shadows will appear pure black and bright highlights will appear pure white". I found no Dalessio source. A vendor blog warns that lifting too far flattens form.
Curve, INFERRED: L' = 100 x (L/100)^g with g = 0.85. L* 10 goes to 14.9. L* 20 goes to 25.5. L* 50 goes to 55.6. L* 90 goes to 91.1. Make g adaptive: if the 5th percentile of L* is under 6, use g 0.80. If over 15, use 1.0. Clamp g to 0.75 to 1.0. Apply before thresholds and before smoothing.

## 5. Five value convention

- Proko: build a 5 box scale, start lighter than you think. For photos he suggests starting with 2 values (light and shadow), adding one at a time. Thumbnail project uses 3 values, 4 or 5 for hard photos.
- Proko form shading: halftone is light side, core shadow is darkest, reflected light is lighter shadow. The 2 light plus 3 shadow split is my reading of the five box scale and the light/shadow family idea. I did not read the paid Photoshop demo.
- Carlson's four planes (Will Kemp, The Artist's Road, others): sky lightest, ground next, slanted planes (hills) darker, uprights (trees) darkest.
- Threshold rule: the cut between the 2nd and 3rd value is the light/shadow divide. With Munsell steps it falls at L* 61.7 (V6). Use Otsu clamped to 45 to 65 when the divide should follow the photo.

## 6. Recommended pipeline (512 px long edge)

1. Resize to 512 long edge. Convert sRGB to linear to Y to L*.
2. Shadow lift, g 0.85 (section 4).
3. Median 5x5.
4. Guided filter, r 8, eps 0.01, 2 passes.
5. Quantize with the preset thresholds (below).
6. Mode filter 5x5. Merge regions under 0.25% area, except protected accents.
7. Paint each region at its preset tone (L* of the level). Optional tint in OKLCH.
8. Keep the original size output by upscaling the label map (nearest, then a 1 px mode clean) so edges stay crisp.

## 7. Presets (L* thresholds on lifted, smoothed L*)

1. Notan (2): cut = Otsu clamped 35 to 60, default 50. Tones L* 18 and 92.
2. Three values (3): cuts 35 and 68. Tones L* 20, 52, 85.
3. Four planes (4, Carlson): cuts 36, 56.7, 76.5. Tones L* 22, 46, 66, 88.
4. Five values (5, Munsell steps): cuts 20.5, 41.2, 61.7, 81.3. Tones L* 10.6, 30.8, 51.6, 71.6, 91.1 (V1, 3, 5, 7, 9). Two light, three shadow. Divide at 61.7.
5. Key (5 values, chip high / middle / low): first move the median L* to 72 / 52 / 32 with a gamma on L/100 (g = ln(target/100) / ln(median/100), clamped 0.6 to 1.7), then use preset 4 cuts. INFERRED. Targets from the Sighack bands.
6. Umber: any of the above in a warm tint. INFERRED OKLCH: hue 55 deg, chroma 0.04 x sqrt(sin(pi x L)) with L in 0..1, so ends stay near neutral.
7. Light and shadow family: 2 values with the divide from Otsu clamped 45 to 65. Light family warm (hue 85, chroma 0.045, L* 88). Shadow family cool (hue 265, chroma 0.05, L* 35). A swap chip flips warm and cool. INFERRED colours.

## 8. Alternatives

A. Fit mode: multi-Otsu or 1D k-means on the smoothed L* histogram (Notan Generator offers both). Adapts to the photo. Thresholds drift away from teacher scales.
B. Region first: segment the smoothed image into flat regions (watershed or Felzenszwalb), take each region's mean L*, then quantize. Shapes are whole by design. Costs more code and can leak across soft edges.
C. Anisotropic Kuwahara then equal bins: gives a painted look. Weak at keeping tiny accents.
(Also seen: histogram valley picking. Fragile on photos with smooth histograms. Not recommended.)

## 9. Pitfalls

1. Thresholds across a smooth gradient (sky, cheek) draw contour lines through one shape. Smooth first and use the mode filter.
2. Using gamma encoded luma or HSV V as lightness. Saturated blues and reds land in the wrong step. Use Y then L*.
3. Fixed thresholds on a very dark or very bright photo use only 1 or 2 levels. Detect it (fewer than 3 used steps in a 5 step study) and suggest the Key preset.
4. Merging small regions deletes accents (eye, a dark note). Protect high contrast small regions.
5. Over lifting shadows flattens form and makes the shadow family too light. Cap g at 0.75. Also squinting itself darkens the look (WetCanvas poster), so do not treat a blurred preview as absolute value.
6. Blur in linear light makes bright halos win over darks. Smooth in L*. INFERRED.

## Sources
- https://colour.readthedocs.io/en/v0.3.9/colour.colorimetry.luminance.html (Newhall and ASTM test values)
- https://www.colour-science.org/api/0.3.0/html/_modules/colour/colorimetry/luminance.html (source of the polynomial, search hit)
- https://en.wikipedia.org/wiki/Munsell_color_system
- https://artincontext.org/notan-generator/
- https://apps.apple.com/app/id6759689446 (Value Study Assistant)
- https://www.proko.com/course-lesson/how-to-see-values-correctly/notes
- https://proko.com/course-lesson/project-value-composition-thumbnails/assignments
- https://sighack.com/post/procedural-color-algorithms-value-keys
- https://www.outdoorpainter.com/how-to-paint-landscapes-value-keys/
- https://willkempartschool.com/beginner-landscape-painting-concepts-the-theory-of-angles/
- https://theartistsroad.net/articles/thecarlsontheoryofangles

## Gaps
- Notanizer and Value Study (Diem) threshold logic: not published.
- Squint to Gaussian sigma: no source found.
- Gurney and Dalessio primary text on lifting shadows and grouping: not found. Gurney quote is from a secondary review.
- Loomis four value system: not confirmed.
