# Leftovers

Open work, as of 2026-11-28. One row per item: what is wrong and where to look. The row rule
(add on find, delete on fix) is in [CONTRIBUTING.md](../CONTRIBUTING.md).

Test photos stay out of git ([why and where](development/testing.md#no-photos-in-git)). Use your
own, with the bench in [development/bench.md](development/bench.md).

## Core (`crates/atelier-core`)

No open rows. The known limits are in [Values](how-it-works/values.md) and [Shapes](how-it-works/shapes.md).

## Web app (`app/web`)

| # | What | Where to look |
|---|---|---|
| 62 | Color picker: the six paints in `PAINTS` use typical spectra of their pigment class and a guessed tinting strength, not measurements of the owner's tubes (710 white, 120 yellow medium, 350 lake blue, 240 permanent red, 640 permanent black, 330 phthalocyanine blue; pigments and brand not known). Fix: a calibration card, where the painter picks each tube alone and with white from a photo of swatches, and the app fits the spectrum and strength; or a licensed set of measured acrylic K/S (Golden, Berns). | `app/web/src/features/picker/paints.ts`; [research/2026-11-13-acrylic-paint-spectra.md](research/2026-11-13-acrylic-paint-spectra.md) |
| 66 | The console shows a Content Security Policy error on every load: the Cloudflare Web Analytics beacon (`static.cloudflareinsights.com/beacon.min.js`) is blocked by `script-src 'self' 'wasm-unsafe-eval'`. It is harmless and nothing leaves the device. Fix: turn Web Analytics off for the Worker in the dashboard (the rule is that nothing leaves the device), or leave the CSP as it is. | `app/web/public/_headers` |
| 77 | The bottom bar icons are drawn on a 16 unit box with a 1.6 stroke and scaled by CSS, so their strokes are slightly soft at 1x. The bar edges are whole pixels now. Fix idea: redraw the icons on a pixel grid at the sizes in use. | `app/web/src/ui/icons.tsx` |
| 78 | Mac app: signed ad hoc only (no developer certificate, not notarized), no installer (dmg) and no auto-update. Another Mac needs a right-click Open the first time. | `app/desktop/tauri.conf.json`; [mac-app.md](development/mac-app.md) |
| 83 | Hand grid check by the owner on a real 30 x 40 cm canvas: the heavy lines are gone, so check that the plain cm squares are enough to copy by hand. | `app/web/src/features/size/paper.ts`, [web-app.md](web-app.md) |
| 84 | Mac app: full screen now reads the real window state through `window.__TAURI__` (`withGlobalTauri`, the `is-fullscreen` permission), and the Legend button state is saved. Not tried in a Tauri build. On the next Mac build check that the logo moves in full screen and the Legend state comes back after a relaunch. | `app/web/src/main.tsx`, `app/desktop/tauri.conf.json`, [mac-app.md](development/mac-app.md) |

## Where leftovers come from

Add a row when you find a problem you do not fix. Delete the row in the commit that fixes it. Row
numbers are ids and may skip. Rows 36 to 50 came from a rating round on a local set of test photos.
That set is not in git.
