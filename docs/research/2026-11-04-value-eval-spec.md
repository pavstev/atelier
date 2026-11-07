# Value study evaluation spec (Values and Shapes, oil painting only)

Date: 2026-11-04. Status: first version.

This spec turns the research in [2026-11-04-painting-value-science.md](2026-11-04-painting-value-science.md)
into deterministic metrics. Each metric reads a photo and the Values map or the Shapes map. Each has
a pass range, the sources behind it and how strong that evidence is. Tags such as [A8] point to the numbered source lists at the end of the research doc
(A perception, B paint, C process).

The scorer is `bench/value-eval/score.py` ([README](../../bench/value-eval/README.md)). It is
bench-only code and is never shipped.

## Inputs

- The photo, resized to the sheet size with Lanczos (Pillow). The core works at a long side of
  1024 px, so the sheets are 1024 px on the long side.
- The Values sheet: flat grays, one gray per value step.
- The Shapes sheet: flat colors, one color per mix pile.

## Shared steps

1. **Squint.** The photo is blurred with a Gaussian of 1 percent of the long side (about 10 px).
   A painter reduces the subject to "a few simple masses" first [C2]. The blur stands in for
   that. The 1 percent is INFERRED.
2. **Lightness.** CIE L* from sRGB (D65), the same formula as `srgb::l_star` [A3]. Munsell value
   V = L* / 10, true within about 1 L* over V1 to V9 [A1, A2]. HIGH.
3. **The light/shadow break.** The Otsu cut of the squinted photo L* on a fixed 256-bin
   histogram. Pixels at or above it are the light family. This is a proxy: a gray histogram cannot
   tell a cast shadow from a dark local color [A11, A12]. So the purity numbers compare versions;
   they are not absolute truth.
4. **Masses and shapes.** 4-connected components of one gray (Values) or one color (Shapes).

Same inputs give the same numbers: fixed bins, fixed iteration counts, ties to the lowest index,
no randomness. Two runs gave byte-equal output on 2026-11-04.

## Values metrics

| Id | Metric | How | Pass | Sources | Evidence |
|---|---|---|---|---|---|
| v_purity | Family purity | The best cut between two adjacent tones, scored by pixel agreement with the photo's light/shadow break | at least 0.90 | [C1, C2] families; [A8] | MEDIUM rule, INFERRED number |
| v_worst | Worst mixed step | For that cut, the largest share of one step's pixels on the other side of the photo break | at most 0.20 | same | MEDIUM rule, INFERRED number |
| v_dom | Value dominance | Area share of the biggest step | 0.40 to 0.80 | [C3] "a single dominating element"; [A9] area | LOW: no source gives a number |
| v_gap | Step gap | Smallest gap in Munsell V between two adjacent tones | at least 1.5 | [A1, A2]; [C3] even scale; [C23] value strings | MEDIUM |
| v_dark | Darkest tone | Munsell V of the darkest tone | 1.0 to 3.5 | [B13] oil black V0.8 to 1.0; gloss lifts to about V2.7 (INFERRED); [A10] matte N2 | MEDIUM |
| v_light | Lightest tone | Munsell V of the lightest tone | 7.0 to 9.8 | [B13] titanium white V9.7; [A8] top tone is white | MEDIUM |
| v_order | Tone order | 1 when the mean photo V of each step rises with its tone | 1 | [A8, A15] compression is monotone | HIGH |
| v_err | Tone error | Mean absolute V error against the squinted photo, divided by the error of the best flat map with the same number of tones (Lloyd-Max) | at most 1.5 | [A15, A16] global curve; INFERRED ratio | LOW |
| v_masses | Masses | Components of at least 0.5 percent of the picture | 2 to 20 | [C10] humans cut a photo into 2 to 20 pieces; [C7] | MEDIUM |
| v_speck | Specks | Area share of components under 0.05 percent | at most 0.01 | [C2] few simple masses | INFERRED |

## Shapes metrics

Steps are judged from the picture, not taken from the app. A pile is shadow when its L* is under
the photo break. Above it, the Otsu cut of the lit pixels splits halftone from light [C1]. An
accent is a pile under 1.5 percent of the area that is a full value (10 L*) darker than the area
mean of the shadow piles, or a full value lighter than the area mean of the light piles. The
accent rule is INFERRED: no source gives an accent size [C5, C4].

| Id | Metric | How | Pass | Sources | Evidence |
|---|---|---|---|---|---|
| s_big | Block-in shapes | Components of at least 1 percent of the picture | 4 to 20 | [C10] 2 to 20 pieces; [C5] six in one example | MEDIUM |
| s_pstep | Piles per step | Most piles in one step | 1 to 6 | [C7, C9] about 4, range 3 to 5; [C8] ceiling 7 | MEDIUM |
| s_purity | Shape family purity | Pixel agreement of each shape's pile family with the photo break | at least 0.85 | [C1] half-tones with the lights | MEDIUM rule, INFERRED number |
| s_fid | Pile fidelity | Mean OKLab distance (x100) between the squinted photo and the pile color | at most 6.0 | [B7] mixtures predictable; INFERRED number | LOW |
| s_sep | Pile separation | Smallest OKLab distance (x100) between two piles of one step | at least 3.0 | [A26] small gaps vanish near the main tone; INFERRED number | LOW |
| s_accent | Accent area | Area share of accent piles | at most 0.05 | [C4, C5] accents are a few small touches | LOW |
| s_speck | Specks | As v_speck | at most 0.01 | [C2] | INFERRED |

## Both layers

| Id | Metric | How | Pass | Sources | Evidence |
|---|---|---|---|---|---|
| x_lce | Values and Shapes agree | Local consistency error between the Values masses and the Shapes shapes; 0 when one refines the other | at most 0.10 | [C10] two humans on one image: 0.07 | MEDIUM |

## Kept out, with the reason

- **Lean to fat order.** The order Shadows, Halftones, Lights, Accents is a property of the app,
  not of a picture. Keep it as a unit test in the core. Science: [B22 to B27] for the cracking
  risk, [B14] for drying, [C1] for thin shadows. Carolus-Duran put accents before lights [C4]; a
  choice for the maintainers.
- **Drying per pile.** A pile has no pigment list, so the Williamsburg chart [B14] cannot score it.
- **Helmholtz-Kohlrausch.** Real [A5, A6] but small for skin. Not a metric.
- **Fourier slope.** Paintings and photos share a slope near -2 [A18]. A 3-tone map is not a
  finished painting, so this does not judge it.
- **One light direction.** Viewers do not check it [A24]. Not a metric.
- **Boundary F against BSDS.** Edges already has its F-score (`scripts/edge_score.py`).

## Totals

The scorer prints one row per photo and version, then totals over the photos that have all three
versions and over those with old and new: the pass rate of each metric, its mean, and the pass
count over all checks.

## Open questions

- Keep v_dom (no numeric source), and at what range?
- Accents last (Speed, fat over lean) or before the lights (Carolus-Duran)?
- s_pstep at most 6, or the safer 4 that working memory supports?
