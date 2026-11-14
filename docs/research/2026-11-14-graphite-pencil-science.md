# Graphite pencil science, 2026-11-14

The research behind Pencil v2 ([how-it-works/pencil.md](../how-it-works/pencil.md)). It follows the
first note on grades ([2026-11-14-graphite-pencil-grades.md](2026-11-14-graphite-pencil-grades.md)).
A record: do not rewrite it.

Each fact says where it comes from. "Measured" means a source measured it. "Our choice" means we
decided it, often from a formula in a source, and it can change after a test on real paper.

## 1. Graphite on paper

**What a grade is.** A grade is set by how dark a line looks on drawing paper, read by a density
meter. There is no physical definition of hardness, and no published number per grade. ISO 9177-2
says the line density rises from the hard grades to the soft ones, with HB in the middle. ISO
20318-2:2019 has a writing density test. Neither publishes the values.

- [Shimadzu, pencil lead application note](https://www.shimadzu.com/an/apl/9987/index.html)
- [ISO 9177-2:2022 summary](https://genorma.com/en/standards/iso-9177-2-2022)
- [ISO 20318-2:2019 summary](https://standards.iteh.ai/catalog/standards/iso/737a9a2e-2726-4b07-9889-b69ed507c932/iso-20318-2-2019)

**Why soft grades are darker.** The graphite particles are equally black in every grade. A soft
grade has more and bigger graphite particles and less clay, so it leaves more graphite per stroke.
Makers do not agree on one darkness per grade, so two brands of 2B differ.
([Britannica, pencil](https://britannica.com/EBchecked/topic/449653))

**Pressure and layers.** Sousa and Buchanan model the paper as a height field (the tooth). The tip
touches the peaks first. More pressure and more layers fill the valleys, and a stroke can flatten
the tooth (burnishing). The reflected light is one minus the share of the cell covered by graphite,
and the deposit saturates. This is a model from observation, not a table of measured tones.
([Sousa and Buchanan, Graphics Interface 1999](https://graphicsinterface.org/wp-content/uploads/gi1999-21.pdf);
the full pressure formula is in their 2000 paper, [Computer Graphics Forum 19(1)](https://diglib.eg.org/handle/10.2312/8605), which is paywalled.)

**Sheen.** Graphite is a shiny layer, not a matte black. Faber-Castell says the sheen of graphite
distorts how tones look in originals and scans. Artists link the sheen to soft grades, high
pressure and burnishing. No source gives gloss numbers.
([Faber-Castell, Pitt Graphite Matt](https://mynewsdesk.com/faber-castell/pressreleases/ultra-matt-innovation-pitt-graphite-matt-pencils-3195662),
[Vitruvian Studio, graphite shine](https://vitruvianstudio.com/blog/3-ways-to-reduce-graphite-shine-in-your-drawings/))

**The tone scale.** No source measures whether the grades are evenly spaced in L*. The model
above (saturating deposit, sheen) suggests the soft end bunches up toward a floor. Our reading, not
measured.

**What we did with it.** We searched pencil makers, the ISO and JIS standards, conservation papers
and rendering papers. No public table of L* per grade exists. So the tones stay as the first note
set them: 9B 17, 7B 26, 5B 37, 2B 49, HB 60, H 70, 3H 78, 4H 86, paper 95 (CIE L*). One reviewer
proposed a lighter, more bunched scale (9B 24 up to 4H 87). We did not take it: it is also a guess,
and the owner judged the current scale on real photos. The fix that would settle it is a scan of a
swatch set on one paper at one pressure.

## 2. Photo to pencil in the literature

| Work | The idea | What it gives us | Cost at 1024 px in wasm |
|---|---|---|---|
| Sousa and Buchanan 1999 and 2000 ([GI 1999](https://graphicsinterface.org/wp-content/uploads/gi1999-21.pdf)) | Paper is a height field; graphite sits on the peaks; pressure fills the valleys | The Drawing grain: coverage set by a threshold on the tooth height | About 10 operations per pixel, plus the tooth |
| Curtis et al. 1997, computer-generated watercolor ([paper](https://www.cs.princeton.edu/courses/archive/fall00/cs597b/papers/curtis97.pdf)) | Paper height 0 to 1 from a pseudo-random process | A cheap, fixed paper tooth (graphite on peaks, the opposite of watercolor in valleys) | About 50 operations per pixel, once |
| Lu, Xu and Jia, NPAR 2012 ([project](https://www.cse.cuhk.edu.hk/~leojia/projects/pencilsketch/pencil_drawing.htm)) | Strokes from line filters in 8 directions; tone by histogram matching; a texture raised to a power to hit the tone | The idea that texture must keep the tone mean | The 8-direction line filter is about 250 operations per pixel, too slow; a later paper finds its tone pale and its texture flat ([2020](https://ar5iv.labs.arxiv.org/html/2012.09004)) |
| Li et al., Im2Pencil, CVPR 2019 ([arXiv](https://arxiv.org/pdf/1903.08682)) | Outline and shading apart; shading from a guided-filter-smoothed tone; a neural net draws hatching | Hatch reads the smoothed tone, and the stroke direction must not follow tiny tone changes | The net is far too big for the page; not used |
| Praun et al., real-time hatching, SIGGRAPH 2001 ([paper](https://gfx.cs.princeton.edu/proj/hatching/hatching.pdf)) | Tonal art maps: every stroke of a light tone stays in all darker tones; parallel lines in lights, cross lines in darks | The Hatch look: darker only adds lines, so nothing jumps | About 120 to 150 operations per pixel when done by position hash, no stored tiles |
| Salisbury et al., orientable textures, SIGGRAPH 1997 ([project](https://grail.cs.washington.edu/projects/orient)) | Stroke textures turned to a direction field, picked by tone | The same idea as Praun, with a direction field | Same as above |
| Cabral and Leedom 1993, line integral convolution; Mao et al. pencil by LIC ([paper](https://art-science.org/journal/v1n3/artsci-v1n3p147a.pdf)) | Smear noise along a direction field to get streaks | Soft streaks, not spaced lines | About 70 to 200 operations per pixel; not used for Hatch |
| Kyprianidis et al. 2011, Brox et al. 2006 ([Brox](https://lmb.informatik.uni-freiburg.de/people/brox/pub/brox_ivc06.pdf)) | A smoothed structure tensor gives a stroke direction and a confidence (anisotropy) | We already have the tensor (`edges/field.rs`); its anisotropy fades the strokes to one angle in flat areas | The tensor is already paid for by Edges' code; Brox's nonlinear tensor needs 20 to 50 passes, not used |
| Winnemoeller et al., XDoG 2012 | A soft threshold, 1 + tanh, gives crisp but smooth stroke edges | A smooth step for stroke edges; no line drawing look (Edges is the line tool) | About 8 operations per pixel |

## 3. Tone mapping for drawing

**Space.** CIE L* from the luminance. For a gray, OKLab L is the cube root of the luminance, so L*
is 116 times OKLab L minus 16, apart from the toe near black. The graphite tones are quoted in L*,
so we stay in L*. ([Lightness](https://en.wikipedia.org/wiki/Lightness),
[Ottosson, OKLab](https://bottosson.github.io/posts/oklab/))

**Key.** Schlick's bias curve on the photo lightness x (0 to 1 between the dark and light ends):
`bias(x) = x / ((1/b - 2)(1 - x) + 1)`. It keeps 0 and 1, never clips, and moves the middle. A
key of K stops sets `b = 2^K / (1 + 2^K)`. (Schlick, Graphics Gems IV, 1994.)

**Contrast.** `S(x) = x^a / (x^a + (1 - x)^a)` with `a = 2^C`. It keeps 0, 1 and the middle, and its
slope at the middle is exactly a. One knob, one meaning. (Our derivation.)

**Local contrast.** A base and detail split (Durand and Dorsey 2002) with the guided filter as the
base, because it costs four box filters and does not flip gradients at strong edges (He et al.
2013). The detail is boosted with a soft limit, `D tanh(detail / D)`, so a strong edge cannot
overshoot into a halo. We did not take CLAHE (it remaps the histogram, moves the mean tone and can
band smooth skin) or the local Laplacian filter (best quality, but the heaviest).
([Durand and Dorsey](https://people.csail.mit.edu/fredo/PUBLI/Siggraph2002/),
[He et al., guided filter](https://people.csail.mit.edu/kaiming/publications/pami12guidedfilter.pdf),
[local Laplacian, fast version](https://imagine.enpc.fr/~aubrym/projects/llf/index.html))

**How many tones a person can draw.** One L* step is about the smallest difference the eye sees
(CIE76 puts it at about 2.3). The eight pencils are 8 to 12 L* apart, all well above that. Munsell
value V is about L* divided by 10 (Glasser), so graphite on paper spans about V 1.7 to V 9.5.
Teaching uses 3, 5 and 9 step scales (Denman Ross); notan (Dow, 1899) starts from two values. Nine
steps across L* 17 to 95 are about 10 L* apart, the same as the gaps of the pencils. So eight
pencils plus paper sit at the practical limit of a drawn scale. We found no study that counts how
many grays a person can draw and read; that limit is our reading.
([JND, colour science](https://colour.readthedocs.io/en/latest/generated/colour.difference.JND_CIE1976.html),
[Proko, value scale](https://www.proko.com/lesson/value-scale),
[Dow, Composition](https://www.gutenberg.org/ebooks/45410))

**Key and bimodality of a photo.** The median L* says the key: under 35 low key, over 65 high key
(18 percent gray is L* 49.5; Reinhard 2002). Bimodality from Otsu's ratio of the between-class
variance to the total, eta. A Gaussian gives eta 0.637 and a flat histogram 0.75, so a photo counts
as bimodal only at 0.80 or more, with a real valley at the cut and at least 15 percent of the pixels
on each side. Ashman's D alone is not enough: after an Otsu split even a Gaussian passes D > 2.
([Ashman et al. 1994](https://ar5iv.arxiv.org/html/astro-ph/9408030),
[Pfister et al. 2013, bimodality coefficient](https://pmc.ncbi.nlm.nih.gov/articles/PMC3791391))

## 4. Choosing pencils for a photo

This is quantization with fixed levels: pick k of the 8 tones that best stand for the photo's
lightness histogram. The classic tools are Lloyd-Max and dynamic programming (Wu 1992; the 1D
k-means of Wang and Song 2011). With only 8 pencils there are at most 70 sets of a given size, so we
try every set; that is exact and cheaper than the dynamic program.
([Wu 1992](https://experts.mcmaster.ca/scholarly-works/1909038),
[Ckmeans.1d.dp](https://cran.r-project.org/web/packages/Ckmeans.1d.dp/readme/README.html))

The error is measured honestly for the darkest pencil. The photo is first stretched onto the full
range (L* 17 to 95), which is the ideal. A set whose darkest pencil is lighter than the 9B lifts the
shadows (the view maps the photo onto that pencil to paper), so each ideal tone is moved the same
way before it is matched to the nearest pencil of the set, and the error is taken against the ideal.

## 5. Measuring our own results

Run on real photos, never shipped. T is the photo lightness stretched onto the range of the set, R
the picture's lightness.

1. **MS-SSIM** of R and T in L* (Wang, Simoncelli and Bovik 2003; constants C1 = 1, C2 = 9 for a
   range of 100). Our bar: 0.90 for Tone, 0.85 for the textured looks.
   ([Wang et al. 2003](https://www.cns.nyu.edu/pub/eero/wang03b.pdf),
   [SSIM constants](https://www.tensorflow.org/api_docs/python/tf/image/ssim))
2. **Tone error**, the mean of |R - T| in L*. Our bar: 2.3 or less (one CIE76 step).
3. **Range use**, the 1st to 99th percentile of R over the range of the set. Our bar: 0.90.
4. **Banding**: false contours (R jumps 2.3 L* or more where T is smooth), at most 0.5 percent, and
   gradient reversal, at most 1 percent. No standard banding metric exists
   ([survey](https://arxiv.org/pdf/2311.18216)); these are our definitions.
5. **Grain mean** (Drawing and Hatch): the 16 px box mean of the textured picture against Tone, at
   most 1.0 L* on average and 0.5 L* of bias.

The bars are our proposals. The main signal is the change between two versions.

## Decisions

| Item | Choice | Number | Source | What stays a guess |
|---|---|---|---|---|
| Pencil tones | Keep | 9B 17, 7B 26, 5B 37, 2B 49, HB 60, H 70, 3H 78, 4H 86, paper 95 (L*) | No public measurement exists (section 1) | All of it, until a swatch set is scanned |
| Tone space | CIE L* | | Section 3 | |
| Key | Schlick bias on the normalized lightness | K from -1 to 1 stop, 0 changes nothing | Schlick 1994 | The range of 1 stop |
| Contrast | Symmetric S curve, pivot at the middle | slope a from 0.5 to 2, 1 changes nothing | Our derivation | The range |
| Highlights | The share of the photo at or above the white point | 1 percent (the old 99th percentile), 0 to 25 | Our choice | The range |
| Deep darks | The most of the picture the 9B and 7B may cover; a bigger dark mass moves one pencil lighter | 20 percent, 0 to 100 | First note (makers keep 7B to 9B for accents) | The 20 percent |
| Local contrast | Guided filter base, soft-limited detail boost | radius 2 percent of the long side, limit 15 L*, gain 0 to 1.5, off by default | Durand and Dorsey 2002, He et al. 2013 | Radius, limit and gain |
| Drawing grain | Fixed paper tooth (value noise, 3 octaves, ranked to an even spread); graphite on the peaks first; softer grade, softer edge | feature about 3 px at 1024 | Sousa and Buchanan, Curtis | The tooth look and sizes |
| Sheen | A slight light shift on the tooth slopes in tones under L* 30, mean zero | at most about 2 L* | Faber-Castell (sheen exists, no numbers) | Its size |
| Hatch | Lines by position hash with Praun's rule (darker only adds lines), along the tensor direction, cross lines in darks | 12 direction bins, cross above darkness 0.55, spacing 3 to 7 px at 1024 | Praun 2001, Salisbury 1997, Im2Pencil 2019 | Spacing, widths, the cross start |
| By pencil | Tone with only the k lightest pencils drawn; darker tones wait at the step's pencil | step 1 to the set size | Our choice (a view by pencil, not a stroke order) | |
| Auto | Median key, interquartile contrast, Otsu bimodality | key moves the median half way to the middle; contrast 0.45 over the IQR, 0.8 to 2; paper 2 percent (1 low key, 5 high key) | Reinhard 2002, Otsu 1979, Ashman 1994 | All thresholds |
| Suggest pencils | Try every set of k pencils; least squared L* error against the stretched photo, shadows lifted honestly | k 3 to 6 | Wu 1992, Lloyd-Max | |
| Metrics | MS-SSIM, tone error, range use, banding, grain mean | bars in section 5 | Wang 2003, Mahy 1994 (JND) | The bars |
