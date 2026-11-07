# The science of values for oil painters (Values and Shapes)

Date: 2026-11-04. Status: complete for a first pass. Scope: oil painting and its process only.

This doc collects what perception science, paint optics, oil chemistry and painters' own texts say
about value studies and paint order. It feeds the metrics in
[2026-11-04-value-eval-spec.md](2026-11-04-value-eval-spec.md). It builds on
[2026-10-28-value-study-algorithm.md](2026-10-28-value-study-algorithm.md).

Sources are in three numbered lists at the end: A (perception), B (paint optics and chemistry),
C (process, value design, scoring). Every claim carries a tag such as [A8] and a confidence:
HIGH (peer-reviewed or a standard, read), MEDIUM (abstract, maker data or a primary teacher text),
LOW (a summary, one example, or not opened). INFERRED marks our own arithmetic or reading.

Method: three research helpers ran in parallel. Many full texts were paywalled, so most numbers
come from abstracts, maker sheets and open primary texts. The full helper notes are outside the
repo, in the session notes folder of this run.

## The ten strongest findings

1. **Munsell value is L* / 10, within about 1 L*.** The ASTM D1535 quintic gives L* 10.4, 20.2,
   51.0 and 90.2 for V1, V2, V5 and V9. HIGH [A1, A2, A3].
2. **Oil paint spans about Munsell V1 to V9.7.** Williamsburg oils: titanium white L* 98.2, flake
   white 96.7, ivory black 10.8, Mars black 8.7. That is about 77:1 to 99:1 in reflectance.
   MEDIUM (maker data, specular handling unknown) [B13]. A gloss glint of about 4 percent lifts
   the darkest dark to about L* 27 (INFERRED, Fresnel). Varnish deepens darks [B9, B11].
3. **Paintings hold far less range than scenes.** Natural scenes often pass 10,000:1. Human
   lightness maps a 5905:1 luminance range onto about 100:1. Matte grays span N2 to N9.5, about
   30:1. HIGH [A10]. Painters compress the scene with a global nonlinear curve; a log is a first
   guess and each painter has their own. MEDIUM [A15, A16, C17].
4. **The lightest area is seen as white, and a big area pulls up.** Anchoring theory: the
   highest luminance anchors white; a darker region looks lighter as its area grows. HIGH [A8, A9].
   So the lightest mass must hold the top tone.
5. **Shadows and paint edges look alike in gray.** Color helps people tell a shadow edge from a
   paint edge [A12]; the cues for light versus material are many and unweighted [A11]. A gray
   value map loses that cue. MEDIUM. So a histogram break is only a proxy for the light/shadow
   break, and a family purity score compares versions; it is not absolute truth.
6. **Painters see shadows no better than others.** Artists were fooled by cast-shadow context as
   much as non-artists, and were slower [A21]. Their skill is in structure, not in lightness
   [A22, A23]. MEDIUM-HIGH. This is the case for a measured value study: the eye cannot be
   trusted, the tool should measure.
7. **Two families, three tones.** Speed divides tones into lights, half-tones and shadows, with
   half-tones in the light family. The first lay-in is "as simple a map of these tone masses" as
   possible. Half-tones go thinly over transparent shadows. MEDIUM (primary teacher text) [C1, C2].
   Dow teaches 2 values as the floor, 3 as the base, then 5 or 7 [C3]. The often quoted "one
   value over half the picture" is NOT in Dow; Dow only asks for "a single dominating element".
8. **People hold about 4 chunks.** Visual working memory holds about 4 items, range 3 to 5 [C7,
   C9]; Miller's 7 plus or minus 2 is the loose ceiling [C8]. HIGH. This supports 2 to 5 value
   masses and a few piles per step. Schmid's "six major shapes" is one worked example, not a rule
   [C5], LOW.
9. **Fat over lean has a mechanical reason, and drying differs per pigment.** Drying shrinkage
   can pass the strain at break and crack a restrained layer [B25]; old films stiffen [B22, B23];
   up to 70 percent of collection paintings show metal soaps [B27]. Williamsburg at 3 mil: umbers,
   siennas and titanium white dry in 1 to 2 days; flake white, ivory and Mars black in 2 to 7;
   lamp black in 5 to 14; zinc white and alizarin in 10 to 21 or more [B14]. Linseed oil dries by
   autoxidation and cross-linking [B15, B16, B17]. HIGH (chart) and MEDIUM (mechanics).
10. **Darks need far more oil than whites.** Oil absorption per 100 parts pigment: white lead
    15 to 16, ivory black 88 to 112, umbers 87 to 97, burnt sienna 138 to 150 [B35], MEDIUM. So
    "thin darks first" works only because the shadows are thinned and laid in thin films; tube
    darks hold more oil (INFERRED). The order Shadows, Halftones, Lights, Accents stays right, but
    its reason is film thickness and solvent, not pigment.

## 1. Lightness and value perception

- CIE L* = 116 f(Y/Yn) - 16, linear below L* 8. ISO/CIE 11664-4. HIGH [A3].
- Munsell renotation: even Munsell steps look even [A1]. The ASTM D1535 quintic Y(V) [A2]. The
  older note put V5 at L* 51.6 against MgO; against a perfect white it is 51.0. Use L* = 10 V with
  a 1 L* tolerance. HIGH.
- CAM16 is the CIE-endorsed appearance model [A4]. Saturated colors look lighter at equal
  luminance (Helmholtz-Kohlrausch) [A5, A6, A7]. The Hellwig 2022 term adds about 2 to 4 J for
  orange skin (prior note). Small; not a metric. HIGH for the effect, MEDIUM for the size.
- Anchoring and area [A8, A9]; dynamic range [A10]. HIGH.
- Viewers do not check that the light comes from one direction [A24]. One light is a painter's
  convention [A25]. MEDIUM.
- Crispening: steps look smallest near the background; an outline or a hue change removes it
  [A26, A27]. HIGH. A gray map with flat masses has no outlines, so near the dominant tone small
  gaps look bigger than they are (INFERRED).
- How many grays the eye can tell: about 720 on a display [A28], 1023 JND steps in DICOM [A29].
  One JND is under 1 L*. Any 2 to 5 step map is far above threshold; the limit is the painter,
  not the eye. HIGH (DICOM), MEDIUM (720).

## 2. How painters compress a scene

- Paintings share the 1/f^2 Fourier slope of natural scenes (-2.07 art, -2.03 photos) but are
  more isotropic [A18]. HIGH. This describes finished paintings, not 3-tone maps.
- Paintings are less skewed and less sparse in intensity than scenes; a compressive nonlinearity
  removes the gap [A13, C17]. MEDIUM. Each painter has a "look-up table" [A15, A16].
- Statistics of Western painting stayed steady for 500 years [A19]; they explain 6 to 15 percent
  of beauty ratings [C21]; they vary with period and subject [C22]. MEDIUM.
- Cavanagh: artists use the simplified physics the brain uses [A20]. MEDIUM (abstract).
- Gap: no readable source gives the fitted curve or says whether painters squeeze the lights or
  the darks more. So the tone metric compares with the photo's own L* (already a cube-root
  compression of luminance) and with the best flat map of the same number of tones.

## 3. Optics of oil paint

- Kubelka-Munk models a paint layer by absorption K and scattering S [B1, B2]. Single-constant KM
  fits when white dominates the scattering [B5]; two-constant or two-region models fit chromatic
  and translucent paints better [B6]. KM predicts oil mixtures well [B7, B3]. HIGH.
- Hiding power (ISO 6504-1): the spreading rate for a 98 percent contrast ratio [B33]. HIGH.
- Refractive index: linseed oil 1.478 [B38]; rutile 2.72, zinc oxide 2.01, cobalt blue 1.74
  [B37]. A big index gap scatters more, so titanium white hides far more than lead white. Lead
  white reads translucent in oil [B31]. MEDIUM.
- Varnish: its index changes color by about 1 CIEDE2000 unit; surface leveling matters more;
  varnish raises gamut and contrast [B9, B10, B12]. Matte darks look light; saturated darks look
  much darker [B11]. MEDIUM.
- Mixing: adding white or black lowers chroma; black can shift hue. Only theory and general
  pages were found; no measured data for oil [B36]. LOW. So the Shapes metrics judge pile colors
  in OKLab against the photo, not against a paint model.

## 4. Oil chemistry and film formation

- Drying is autoxidation and cross-linking of the oil; chain scission comes only with long ageing
  [B15]. Cobalt, iron and manganese catalyse it [B16]; cobalt driers and their replacements
  [B20]; kinetics [B17]. Lead pigments drop the oxidation onset of linseed oil from 166 C to 50 to
  60 C [B19]. Zinc white gave the lowest oxidation markers [B18]. HIGH to MEDIUM.
- Film mechanics: films stiffen with age and with cold [B22, B23, B24]; shrinkage can crack a
  restrained layer [B25]; zinc white, raw umber and lead white with litharge are the least tough
  [B26]. MEDIUM.
- Old masters: heat-bodied oil built Rembrandt-circle impasto [B28]; plumbonacrite in Rembrandt
  impasto [B39]; Vermeer chose lead white grades for flesh [B32]; Rubens on panel [B29]; Titian's
  thin brownish first lay-in [B30, C19]. MEDIUM to LOW (abstracts).

## 5. The process of oil painting

- Block-in by masses: "the reducing of a complicated appearance to a few simple masses is the
  first necessity" [C2]; Velazquez as a structure of tone masses [C2]. MEDIUM.
- Carolus-Duran, as Sargent recalled it: half-tone, then a few accents, then the lights [C4].
  HIGH for the quote. This puts accents before lights; Atelier keeps accents last, by fat over
  lean and Speed [C1]. A known conflict; the maintainers pick.
- Reilly: nine premixed Munsell value steps [C23]. LOW to MEDIUM. Carlson: planes of the
  landscape each take a value by how they face sun and sky [C27]. LOW (not opened).
- Only experts split a picture into simple sections before copying [C6]; artists beat non-artists
  on perception tasks [C18]. MEDIUM. Viewers' eye paths differ between a painting and its source
  photo [C26]. LOW.
- Technical studies of Sargent [C25] and Rubens [C20] were found but not read.

## 6. Scoring a segmentation

- Humans asked to cut a photo were told "something between 2 and 20" pieces and made 10 to 20
  [C10]. Two people on the same image differ by a local consistency error (LCE) of 0.07, against
  0.30 for different images. LCE forgives refinement, so a coarse map and a finer one of the same
  picture score near 0. HIGH [C10].
- Boundary F on BSDS500: humans about 0.80 [C11]. Region measures: variation of information
  [C12], Rand and probabilistic Rand [C13, C14]. HIGH for method.

## Conflicts and gaps

- Accents before lights (Carolus-Duran [C4]) against accents last (Speed [C1], fat over lean).
- Value dominance has no numeric source. The spec's 0.40 to 0.80 is INFERRED from "a single
  dominating element" [C3] and the area effect [A9]. LOW.
- No measured oil black L* with gloss on and off; no fitted painter compression curve; no
  measured chroma shift of oil mixed with black; no empirical count of tones painters use.
- Schmid's book, Carlson's chapters and the NG Technical Bulletin bodies were not read.

## Sources

The lists keep the helpers' own numbering, with the prefix A, B or C added.

### A. Perception and painters' compression

- A1. Newhall SM, Nickerson D, Judd DB. Final report of the OSA subcommittee on the spacing of the Munsell colors. JOSA 33(7):385-418, 1943. DOI 10.1364/JOSA.33.000385 (seen on scilit). HIGH citation.
- A2. ASTM D1535 Munsell quintic, via munsellinterpol docs: https://rdrr.io/cran/munsellinterpol/man/VandY.html . astm.org page returned 403. HIGH.
- A3. CIE 1976 L*, CIE e-ILV 17-23-076 https://cie.co.at/eilvterm/17-23-076 ; ISO/CIE 11664-4:2019 https://connect.snv.ch/en/iso-cie-11664-4-2019 . HIGH.
- A4. Li C et al. Comprehensive color solutions: CAM16, CAT16, CAM16-UCS. Color Res Appl 42(6):703-718, 2017. DOI 10.1002/col.22131. HIGH.
- A5. Fairchild MD, Pirrotta E. Predicting the lightness of chromatic object colors using CIELAB. Color Res Appl 16(6):385-393, 1991. DOI 10.1002/col.5080160608. HIGH.
- A6. Hellwig L, Stolitzka D, Fairchild MD. Extending CIECAM02 and CAM16 for the Helmholtz-Kohlrausch effect. Color Res Appl 2022. DOI 10.1002/col.22793. HIGH.
- A7. Hellwig L, Fairchild MD. Brightness, lightness, colorfulness, and chroma in CIECAM02 and CAM16. Color Res Appl 2022. DOI 10.1002/col.22792. MEDIUM (DOI from a search summary).
- A8. Gilchrist A et al. An anchoring theory of lightness perception. Psychol Rev 106(4):795-834, 1999. DOI 10.1037/0033-295X.106.4.795. HIGH.
- A9. Gilchrist A, Radonjic A. Anchoring of lightness values by relative luminance and relative area. J Vis 9(9):13, 2009. DOI 10.1167/9.9.13. HIGH.
- A10. Radonjic A, Allred SR, Gilchrist AL, Brainard DH. The dynamic range of human lightness perception. Curr Biol 21(22), 2011. DOI 10.1016/j.cub.2011.10.013 ; PMC3244211. HIGH.
- A11. Kingdom FAA. Perceiving light versus material. Vision Res 48(20):2090-2105, 2008. DOI 10.1016/j.visres.2008.03.020 ; PMID 18479723. HIGH citation, no numbers.
- A12. Kingdom FAA, Beauce C, Hunter L. Colour vision brings clarity to shadows. Perception 33(8):907-914, 2004. DOI 10.1068/p5264 ; PMID 15521690. HIGH citation.
- A13. Graham DJ, Field DJ. Variations in intensity statistics for representational and abstract art, and for art from the Eastern and Western hemispheres. Perception 37:1341-1352, 2008. DOI 10.1068/p5971 ; https://people.hws.edu/graham/Graham_perception08.pdf . MEDIUM.
- A14. Graham DJ, Friedenberg JD, Rockmore DN, Field DJ. Mapping the similarity space of paintings: image statistics and visual perception. Vis Cogn 18(4):559-573, 2010. DOI 10.1080/13506280902934454 . MEDIUM.
- A15. Graham DJ, Field DJ. Global nonlinear compression of natural luminances in painted art. Proc SPIE 6810, 2008. DOI 10.1117/12.766636 (seen in the SPIE URL). MEDIUM.
- A16. Graham DJ. The relationship between efficient coding of natural scenes in the human visual system and statistical regularities in art. PhD thesis, Cornell, 2008. https://ecommons.cornell.edu/entities/publication/cb021efd-1168-44d2-bda8-2647e16b606d . MEDIUM.
- A17. Graham D, Redies C. Statistical regularities in art: relations with visual coding and perception. Vision Res 2010. DOI 10.1016/j.visres.2010.05.002 ; PMID 20580643. HIGH citation.
- A18. Koch M, Denzler J, Redies C. 1/f2 characteristics and isotropy in the Fourier power spectra of visual art, cartoons, comics, mangas, and different categories of photographs. PLoS One 5(8):e12268, 2010. DOI 10.1371/journal.pone.0012268 ; PMC2924385. HIGH.
- A19. Mather G. Visual image statistics in the history of Western art. Art Percept 6(2-3):97-115, 2018. DOI 10.1163/22134913-20181092. MEDIUM.
- A20. Cavanagh P. The artist as neuroscientist. Nature 434:301-307, 2005. DOI 10.1038/434301a. MEDIUM (abstract only).
- A21. Perdreau F, Cavanagh P. Do artists see their retinas? Front Hum Neurosci 5:171, 2011. DOI 10.3389/fnhum.2011.00171 ; PMC3248676. HIGH.
- A22. Perdreau F, Cavanagh P. The artist's advantage: better integration of object information across eye movements. i-Perception 4(6):380-395, 2013. DOI 10.1068/i0574 ; PMC3859555. HIGH.
- A23. Perdreau F, Cavanagh P. Drawing skill is related to the efficiency of encoding object structure. i-Perception 5(2):101-119, 2014. DOI 10.1068/i0635 (from search URL) ; PMC4249990. MEDIUM.
- A24. Ostrovsky Y, Cavanagh P, Sinha P. Perceiving illumination inconsistencies in scenes. Perception 34:1301-1314, 2005. DOI 10.1068/p5418. HIGH.
- A25. Mamassian P. Ambiguities and conventions in the perception of visual art. Vision Res 2008. DOI 10.1016/j.visres.2008.06.010. HIGH citation.
- A26. Whittle P. Brightness, discriminability and the "crispening effect". Vision Res 32(8):1493-1507, 1992. DOI 10.1016/0042-6989(92)90205-w ; PMID 1455722. HIGH.
- A27. Kane D, Bertalmio M. A reevaluation of Whittle (1986, 1992)... J Vis 19(1):16, 2019. DOI 10.1167/19.1.16. HIGH.
- A28. Kimpe T, Tuytschaever T. Increasing the number of gray shades in medical display systems: how much is enough? J Digit Imaging 20(4):422-432, 2007. DOI 10.1007/s10278-006-1052-3 ; PMID 17195900. MEDIUM on 720 and 870 (search summary only).
- A29. DICOM PS3.14, Grayscale Standard Display Function, ch. 7. https://dicom.nema.org/medical/dicom/2024c/output/chtml/part14/chapter_7.html . HIGH.
- A30. Swartz et al. 2024, Sci Rep, luminance variation and beauty ratings. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11339329/ . LOW (snippet only, not about value compression).
- A31. Paviotti A, Forsyth D. Lightness recovery for pictorial surfaces. ICCV Workshops 2009. https://mlanthology.org/iccvw/2009/paviotti2009iccvw-lightness-a . LOW-MEDIUM (snippet).

### B. Oil paint optics and chemistry

- B1. Kubelka, P. 1948. New contributions to the optics of intensely light-scattering materials, Part I. J. Opt. Soc. Am. 38(5):448-457. DOI 10.1364/JOSA.38.000448. Exact KM equations; classic KM exact when u=v=2. HIGH.
- B2. Kubelka, P., Munk, F. 1931. Ein Beitrag zur Optik der Farbanstriche. Z. Techn. Physik 12:593-601. https://cir.nii.ac.jp/crid/1574231875094727936 (record). Origin of KM. HIGH on citation, not read.
- B3. Haase, C.S., Meyer, G.W. 1992. Modeling pigmented materials for realistic image synthesis. ACM Trans. Graph. 11(4):305-335. DOI 10.1145/146443.146452. KM pigment mixing in graphics. HIGH.
- B4. Okumura, Y. 2005. Developing a spectral and colorimetric database of artist paint materials (acrylic). RIT MS thesis. https://repository.rit.edu/theses/8126/ . MEDIUM (abstract only).
- B5. Berns, R.S., Krueger, J., Swicklik, M. 2002. Multiple pigment selection for inpainting using visible reflectance spectrophotometry. Studies in Conservation 47(1):46-61. https://katalog.snk.sk/vufind/Record/1763049/Details (catalog record, no DOI seen). Single-constant KM justified when substrate scattering dominates. MEDIUM.
- B6. Zhao, Y., Berns, R.S. 2009. Predicting the spectral reflectance factor of translucent paints using Kubelka-Munk turbid media theory (review of four methods; two-region method). Color Res. Appl. DOI 10.1002/col.20525 (seen in zendy URL https://zendy.io/title/10.1002/col.20525). MEDIUM (title inferred from the abstract text; check).
- B7. Haddock, M. 2011. Prototype software for colorant formulation using Gamblin Conservation Colors. RIT thesis. https://repository.rit.edu/theses/4572 . 43 colors, KM. HIGH (page read).
- B8. Berns, R.S. 2016. Color Science and the Visual Arts: A Guide for Conservators, Curators, and the Curious. Getty Conservation Institute. http://www.getty.edu/publications-reports/item/248XVR . Book, not read. MEDIUM (existence HIGH).
- B9. Berns, R.S., de la Rie, E.R. 2003. The effect of the refractive index of a varnish on the appearance of oil paintings. Studies in Conservation 48(4):251-262. https://katalog.snk.sk/vufind/Record/3366503/Description (catalog; DOI not seen). Index effect about 1 CIEDE2000; molecular weight and leveling dominate; varnishing raises gamut and contrast. MEDIUM.
- B10. de la Rie, E.R. 1987. The influence of varnishes on the appearance of paintings. Studies in Conservation 32(1):1-13. DOI 10.1179/sic.1987.32.1.1 (reported by search tool, listing at https://www.bohrium.com/paper-details/the-influence-of-varnishes-on-the-appearance-of-paintings/813169087147409409-3668). Not read. LOW to MEDIUM.
- B11. Mayer, L., Myers, G. 2004. American Impressionism, matteness, and varnishing. JAIC 43(3):237-254. https://cool.culturalheritage.org/jaic/articles/jaic43-03-003_4.html . Unsaturated darks look light, saturated look much darker; no numbers. HIGH (page read).
- B12. Simonot, L., Elias, M. 2004. Color change due to a varnish layer. Color Res. Appl. 29(3):196-204. DOI 10.1002/col.20008 (DOI given by search tool, not seen on a page). Not read. LOW.
- B13. Williamsburg Handmade Oil Colors, Munsell and CIE Lab data, 6 mil film. https://www.justpaint.org/wp-content/uploads/2017/06/Munsell-and-CIELAB-Data-for-Williamsburg-Oils_alphabetical.pdf and https://goldenartistcolors.com/resources/williamsburg-oil-colors-munsell-and-lab-readings . L* values in N1. MEDIUM (two search extractions agree; PDF not opened).
- B14. Williamsburg Handmade Oil Colors Dry Time Chart (3 mil, updated 05/23/19). https://goldenartistcolors.com/static/f556e753a4d3a1330d85923dccb711a2/williamsburg-drytime-chart-091818.pdf . Read in full. HIGH as maker data.
- B15. Lazzari, M., Chiantore, O. 1999. Drying and oxidative degradation of linseed oil. Polym. Degrad. Stab. 65(2):303-313. DOI 10.1016/S0141-3910(99)00020-8. Autoxidation, cross-linking, conjugation; chain scission only after long ageing. HIGH (abstract).
- B16. Juita, Dlugogorski, B.Z., Kennedy, E.M., Mackie, J.C. 2012. Low temperature oxidation of linseed oil: a review. Fire Science Reviews 1:3. https://firesciencereviews.springeropen.com/articles/10.1186/2193-0414-1-3 (DOI 10.1186/2193-0414-1-3). Covers Co, Fe, Mn catalysis. HIGH (abstract).
- B17. Orlova, Y., Harmon, R.E., Broadbelt, L.J., Iedema, P.D. 2021. Review of the kinetics and simulations of linseed oil autoxidation. Prog. Org. Coat. 151. https://dare.uva.nl/id/c4df87a2-931d-4d08-b36e-c08dce7c3b26 . MEDIUM (abstract).
- B18. Tammekivi, E., Vahur, S., Vilbaste, M., Leito, I. 2021. Quantitative GC-MS analysis of artificially aged paints with variable pigment and linseed oil ratios. Molecules 26(8):2218. DOI 10.3390/molecules26082218. HIGH (page read).
- B19. White, R.E., Thomas, P.S., Phillips, M.R., Wuhrer, R. 2005. A DSC study of the effect of lead pigments on the drying of cold pressed linseed oil. J. Therm. Anal. Calorim. 80:237-239. https://opus.cloud1.lib.uts.edu.au/handle/10453/597 . Onset 166 C to 50-60 C. MEDIUM (abstract; author list from a later citation).
- B20. Honzicek, J. 2019. Curing of air-drying paints: a critical review. Ind. Eng. Chem. Res. https://dk.upce.cz/handle/10195/74955 (PDF https://dk.upce.cz//bitstream/10195/74955/1/Curing_Review_IECR.pdf, blocked). Cobalt driers, replacements. MEDIUM (abstract only).
- B21. Mallegol, J., Gardette, J.-L., Lemaire, J. 1999. Long-term behavior of oil-based varnishes and paints I: spectroscopic analysis of curing drying oils. JAOCS 76(8):967-976. No URL or DOI seen. Companion 2000 paper (photo- and thermooxidation of cured linseed oil, JAOCS 77(3):249-255): https://data.zhenzhi.com/details/1/902214058 . MEDIUM.
- B22. Mecklenburg, M.F., Tumosa, C.S. 1991. Mechanical behavior of paintings subjected to changes in temperature and relative humidity. In Art in Transit, National Gallery of Art, pp. 173-216. https://repository.si.edu/items/9b84878f-b831-4c69-a9fd-1430388fdf41 . HIGH (record).
- B23. Mecklenburg, M.F., Tumosa, C.S., Erhardt, D. 2004. The changing mechanical properties of aging oil paints. MRS Symp. Proc. 852, OO3.1. https://www.cambridge.org/core/journals/mrs-online-proceedings-library-archive/article/changing-mechanical-properties-of-aging-oil-paints/BC55560878D520ABB103FD4209496BC4 . MEDIUM (abstract).
- B24. Mecklenburg, M.F., McCormick-Goodhart, M.H., Tumosa, C.S. 1994. Investigation into the deterioration of paintings and photographs using computerized modeling of stress development. JAIC 33(2):153-170. https://cool.culturalheritage.org/jaic/articles/jaic33-02-007_5.html . Temperature matters most for oil on canvas. MEDIUM.
- B25. Janas, A. et al. 2022. Shrinkage and mechanical properties of drying oil paints. Heritage Science. DOI 10.1186/s40494-022-00814-2 (the DOI was in a result for the Mecklenburg collection, title match from a second search; confirm). MEDIUM.
- B26. Fracture toughness of aged oil paints (Mecklenburg collection). Heritage Science 2024. https://link.springer.com/10.1186/s40494-024-01224-2 (title and authors from a search listing only). About 15 J/m2 for zinc white, raw umber, lead white plus litharge. LOW to MEDIUM.
- B27. Izzo, F.C., Kratter, M., Nevin, A., Zendri, E. 2021. A critical review on the analysis of metal soaps in oil paintings. ChemistryOpen. https://pmc.ncbi.nlm.nih.gov/articles/PMC8446710 (also https://iris.unive.it/bitstream/10278/3743652/1/open.202100166.pdf). Up to 70 percent. MEDIUM (abstract; page blocked).
- B28. White, R., Kirby, J. 1994. Rembrandt and his circle: seventeenth-century Dutch paint media re-examined. National Gallery Technical Bulletin 15:64-78. https://www.nationalgallery.org.uk/technical-bulletin/white_kirby1994 . HIGH (abstract read).
- B29. Plesters, J. 1983. Samson and Delilah: Rubens and the art and craft of painting on panel. NGTB 7:30-49. https://www.nationalgallery.org.uk/technical-bulletin/plesters1983 . Abstract only; no layer-order statements visible. MEDIUM.
- B30. Dunkerton, J., Spring, M. et al. Titian's painting technique to c.1540. NGTB 34. https://www.nationalgallery.org.uk/research/publications/technical-bulletin/technical-bulletin-volume-34 . Not read. LOW for specifics.
- B31. Pozo-Antonio, J.S., Cardell, C., Sanchez, A., Montes Rueda. 2022. Reflectance of oil paintings: influence of paint layer thickness and binder amount. Coatings 12(5):601. DOI 10.3390/coatings12050601 (full text https://digibug.ugr.es/handle/10481/94471, blocked). Layer thickness and binder amount did not directly change reflectance; lead white oil more translucent. MEDIUM.
- B32. van Loon, A. et al. 2019. Beauty is skin deep: the skin tones of Vermeer's Girl with a Pearl Earring. Heritage Science. DOI 10.1186/s40494-019-0344-0. MEDIUM (abstract).
- B33. ISO 6504-1:2019 Paints and varnishes, determination of hiding power, Part 1: Kubelka-Munk method for white and light-coloured paints. https://scc-ccn.ca/standardsdb/standards/8164711 . HIGH on scope.
- B34. ASTM D281-12(2021) Oil absorption of pigments by spatula rub-out. https://store.astm.org/d0281-12r21.html . HIGH on method, no table.
- B35. Church, A.H. The chemistry of paints and painting (ch. Action of pigments on oils; table dated 1901, C. Roberson and Winsor and Newton). https://chestofbooks.com/science/chemistry/Paints/1-Action-Of-Pigments-On-Oils.html . Oil absorption values in N5. MEDIUM (historic, column layout garbled).
- B36. Pointer, M.R. 1980. The gamut of real surface colours. Color Res. Appl. 5(3):145-155. DOI 10.1002/col.5080050308. 4089 samples. HIGH on citation; data not read.
- B37. Rochester Optics student page on paint pigments (cites Feller, Artists' Pigments vol 1 and 2). https://www.hajim.rochester.edu/optics/sites/cml/opt307/spr05/kevin/index.html . TiO2 2.72, ZnO 2.01, cobalt blue 1.74. LOW to MEDIUM.
- B37b. Natural Pigments titanium white page (vendor, 15 to 20 parts oil per 100). https://www.naturalpigments.com/titanium-white-1kg.html . LOW.
- B38. CAMEO linseed oil entry (RI 1.4782, CRC). https://cameo.mfa.org/wiki/Linseed_oil (403 on fetch; value from search extraction). MEDIUM.
- B39. Uncommon mineral (plumbonacrite) in Rembrandt impasto, 2019 news summary. https://www.sciencedaily.com/releases/2019/01/190130103807.htm . Secondary; primary paper not identified. LOW to MEDIUM.

### C. Process, value design and scoring

- C1. Speed, H. (1924). The Science and Practice of Oil Painting. Chapman and Hall. https://archive.org/details/sciencepracticeo0000haro (text: https://archive.org/stream/sciencepracticeo0000haro/sciencepracticeo0000haro_djvu.txt). Archive item year shows 1926. Dover reprint is "Oil Painting Techniques and Materials". MEDIUM (teacher book, primary text, read via summarizer)
- C2. Speed, H. (1913). The Practice and Science of Drawing. https://www.gutenberg.org/ebooks/14264 . MEDIUM
- C3. Dow, A. W. (1899; Gutenberg is the 1914 ninth ed.). Composition. https://www.gutenberg.org/ebooks/45410 . MEDIUM
- C4. Charteris, E. (1927). John Sargent. Scribner. https://archive.org/details/johnsargent00char (PDF: https://archive.org/download/johnsargent00char/johnsargent00char.pdf). HIGH for the quote, MEDIUM for it as a method (Sargent's memory of Duran)
- C5. Schmid, R. Richard Schmid: A Conversation (Artist's Magazine, May 2020). https://www.artistsnetwork.com/art-mediums/oil-painting/richard-schmid-a-conversation . LOW as a threshold
- C6. Tchalenko, J. (2009). Vision Research 49(8) 791-800. DOI 10.1016/j.visres.2009.02.012 ; https://ualresearchonline.arts.ac.uk/id/eprint/1943/ . MEDIUM-HIGH
- C7. Cowan, N. (2001). BBS 24(1) 87-114. DOI 10.1017/S0140525X01003922 ; https://www.cambridge.org/core/journals/behavioral-and-brain-sciences/article/magical-number-4-in-shortterm-memory-a-reconsideration-of-mental-storage-capacity/44023F1147D4A1D44BDC0AD226838496 . HIGH
- C8. Miller, G. A. (1956). Psychological Review. DOI 10.1037/h0043158 . HIGH
- C9. Luck, S. J. and Vogel, E. K. (1997). Nature 390, 279-281. DOI 10.1038/36846 . HIGH
- C10. Martin, Fowlkes, Tal, Malik (2001). ICCV. DOI 10.1109/ICCV.2001.937655 ; https://vision.ics.uci.edu/papers/MartinFTM_ICCV_2001 . HIGH
- C11. Arbelaez, Maire, Fowlkes, Malik (2011). TPAMI 33(5) 898-916. DOI 10.1109/TPAMI.2010.161 ; https://vision.ics.uci.edu/papers/ArbelaezMFM_PAMI_2011 ; Berkeley resources https://www2.eecs.berkeley.edu/Research/Projects/CS/vision/grouping/resources.html . HIGH for method, MEDIUM for the F numbers
- C12. Meila, M. (2007). J. Multivariate Anal. DOI 10.1016/j.jmva.2006.11.013 . HIGH
- C13. Unnikrishnan, Pantofaru, Hebert (2007). TPAMI. DOI 10.1109/TPAMI.2007.1046 . MEDIUM (not opened)
- C14. Rand, W. M. (1971). JASA. DOI 10.1080/01621459.1971.10482356 . MEDIUM (not opened)
- C15. Redies, Hasenstein, Denzler (2007). Spatial Vision 21(1-2). DOI 10.1163/156856807782753921 (or 10.1163/156856808782713825, conflict). Preprint https://pub.inf-cv.uni-jena.de/pdf/Redies07:FIS . MEDIUM
- C16. Graham, D. J. and Redies, C. (2010). Vision Research. DOI 10.1016/j.visres.2010.05.002 . MEDIUM
- C17. Graham, D. J. and Field, D. J. Spatial Vision 21(1-2) 149-164. DOI 10.1163/156856808782713771 . LOW-MEDIUM
- C18. Kozbelt, A. (2001). Artists as experts in visual cognition. Visual Cognition 8(6) 705-723. https://acnpsearch.tweb-dev.unibo.it/singlejournalindex/86730975 (index record; no DOI seen). MEDIUM
- C19. Dunkerton and Spring (2013). Titian's Painting Technique to c.1540. NG Technical Bulletin 34. https://nationalgallery.org.uk/technical-bulletin/vol-34-essay-1-2013 ; vol. 36 https://www.nationalgallery.org.uk/research/research-resources/technical-bulletin/technical-bulletin-volume-36/catalogue . MEDIUM
- C20. Roy, A. (1999). Rubens's Peace and War. NG Technical Bulletin 20. https://www.nationalgallery.org.uk/upload/pdf/roy1999b.pdf . LOW (body not read)
- C21. Swartz et al. (2024). Sci Rep 14:19368. DOI 10.1038/s41598-024-69689-6 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC11339329 . MEDIUM
- C22. Hayn-Leichsenring, Lehmann, Redies (2017). i-Perception 8. DOI 10.1177/2041669517715474 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC5496686 . MEDIUM
- C23. Reilly/Munsell: https://frankreillybooks.com/wp-content/uploads/2026/08/Munsell-Article-Final-Part-2-add-art-7-17-2026.pdf ; https://en.wikipedia.org/wiki/Frank_J._Reilly . LOW-MEDIUM
- C24. Cavanagh, P. (2005). The artist as neuroscientist. Nature 434, 301-307. DOI 10.1038/434301a . LOW-MEDIUM
- C25. Centeno and Mahon (2005). A technical study of Sargent's Madame Pierre Gautreau. Met Museum Journal 40. https://www.metmuseum.org/en/met-publications/technical-study-sargents-madame-pierre-gautreau-the-metropolitan-museum-journal-v-40-2005 . LOW until read
- C26. Adamek et al. (2019). Tracking artistic transformations. Ceskoslovenska psychologie 63(3) 337-353. https://asep.lib.cas.cz/arl-cav/en/detail-cav_un_epca-0506240-Tracking-artistic-transformations-comparing-paintings-and-their-source-photographs . LOW-MEDIUM
- C27. Carlson, J. F. (1929). Guide to Landscape Painting (Dover reprint). https://store.doverpublications.com/collections/paperback/products/9780486229270 . LOW
