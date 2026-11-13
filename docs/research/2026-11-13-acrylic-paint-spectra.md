# Acrylic paint spectra for the color picker

A record, 2026-11-13. It says what data exists for a physical model of acrylic paint mixing, why
Atelier does not bundle it, and what the picker does instead. The code is in
`app/web/src/features/picker/`; the page for users is in [../web-app.md](../web-app.md).

## The model

A mix is predicted with Kubelka-Munk (KM), the two-constant form: K (absorption) and S
(scattering) of a mix add up by share, and the light the layer gives back is
`R = 1 + K/S - sqrt((K/S)^2 + 2 K/S)`. The paint surface adds a small step (Saunderson, with
k1 = 0.035 and k2 = 0.6, the values Berns used for acrylic). The spectrum becomes a screen color
with the CIE 1931 2 degree observer under D65, and colors are compared with CIEDE2000.
`spectral.ts` has the sources in its header. The tests in `app/web/e2e/picker.spec.ts` check
CIEDE2000 against the published pairs of Sharma, Wu and Dalal (2005), a flat gray against its known
sRGB value, the KM law and the hues that color theory expects.

## The data

No open, measured set of acrylic K/S data may be bundled in this repo (MIT or Apache).

| Source | What | Why not |
|---|---|---|
| Golden Artist Colors spectra (78 Heavy Body paints, 400 to 700 nm, 10 nm, reflectance and K/S) | the best match | shared by the maker, but no license is stated; written permission is needed |
| Berns, RIT (58 Golden pigments, Table I of the 2022 paper) | the method behind it | the database is no longer online |
| `meatsquirk/pigment-km` | MIT code, RIT acrylic K/S | the data is used "with kind permission", so it cannot be copied on |
| Mixbox | pigment mixing | CC BY-NC, non-commercial; dropped from Atelier on 2026-10-31 |
| Spectral.js | MIT | synthetic primaries, not measured pigments |
| `painting_tools` (Wiersma) | measured | CC BY-NC-SA, and oil, 10 pigments |
| CHSOS FORS library | measured, 350 to 950 nm | no tint ladders, no license stated |

## What the picker does

- The paints have typical spectra of their pigment class (the sharp edge of a cadmium or azo
  yellow, the narrow peak of phthalo blue, a flat dark carbon black) and a tinting strength. They
  are shapes, not measurements, so they are labeled as typical (`paints.ts`).
- Nothing was found that gives the color difference to expect for a limited acrylic palette. Berns
  reports small errors (CIEDE2000 near 1 to 2) for KM with measured data and a surface correction;
  the typical spectra here will be worse until they are fitted to real tubes.
- The way to make it true for one painter is to measure the tubes: paint each tube alone and mixed
  with white on a white card, read the colors, and fit the spectrum and the strength of each paint.
  That is leftover 62 in [../LEFTOVERS.md](../LEFTOVERS.md).
