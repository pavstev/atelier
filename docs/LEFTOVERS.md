# Leftovers

Open work, as of 2026-11-07. One row per item: what is wrong and where to look. The row rule
(add on find, delete on fix) is in [CONTRIBUTING.md](../CONTRIBUTING.md).

Test photos stay out of git ([why and where](development/testing.md#no-photos-in-git)). Use your
own, with the bench in [development/bench.md](development/bench.md).

## Core (`crates/atelier-core`)

| # | What | Where to look |
|---|---|---|
| 36 | Values and Shapes: a light subject melts into a light ground, and a subject joins a big neighbor of a close value (photos with a light subject on a light ground). The merge looks at L* (Values) or OKLab (Shapes) only. Fix idea: stop a merge where the edge map is strong. | `crates/atelier-core/src/values.rs` `clean_labels`; `crates/atelier-core/src/shapes.rs` `Rag::merge` |
| 40 | Shapes: busy colorful scenes turn into muddy brown masses at Auto (busy colorful scenes); thin dark figures become blobs and straight architecture bends (thin dark figures, architecture); eye sockets become black holes at Small (portraits). | `crates/atelier-core/src/shapes.rs` `jump_pick`, `Rag::merge` weights, `smooth_levels`, `snap_labels` |
| 41 | Edges see brightness only: a color edge of equal brightness is lost (a yellow plate, fluted columns). Fix idea: add the OKLab a and b gradients to the fine map, then check BSDS500. | `crates/atelier-core/src/edges/map.rs` `strength` |
| 42 | Edges: round rims as 2 or 3 faint rings, ghost lines in soft areas, ink on flat print patterns (several photos). A stricter drop of faint chains only let other faint lines take the ink. | `crates/atelier-core/src/edges/map.rs` `coarse_strength`; `crates/atelier-core/src/edges/field.rs` `rank` |
| 43 | Edges Lines: the soft plane edges of a pale church stay faint (a pale church photo); Transfer and Masses show them. Raising them more breaks the "lost edge fades" rule. | `crates/atelier-core/src/edges/trace.rs` `fades` |
| 44 | Edges: shadow shapes are closed loops (a nose shadow in a portrait), and a face framed by hair is one loop (portraits). The background is busier than in the old tool (two portraits). | `crates/atelier-core/src/edges/trace.rs` `trace` (step 3 closes chains) |
| 46 | The bench ignores the EXIF turn of a JPEG (`sips -s format png` keeps the stored pixels), so a phone photo with orientation 6 is drawn on its side. The app is fine (the browser turns it). | `crates/atelier-core/examples/bench.rs` `photos` |
| 47 | Grid lines are hard to see on a blown white area or a very dark photo (portraits): one line and halo color comes from the mean lightness of the whole photo. A tone per 1/16 block was tried on 2026-11-03 and dropped: the tone flipped mid-line . | `crates/atelier-core/src/grid.rs` `setup` |
| 48 | Edges on portraits is only level with the old tool (2.79 vs 2.81 on the 2026-11-03 eval), and it draws short squiggles on leaves, grass and crowds (portraits; Amount 100 on places). Less fade made texture louder too. Guess: which chains are chosen on body texture, not how dark they are. | `crates/atelier-core/src/edges/trace.rs` `preset_opts` (Many), `fades`; `crates/atelier-core/src/edges/map.rs` `coarse_strength` |
| 49 | Values Three on a photo where the darkest or the lightest step covers most of it is not re-keyed: a dark bridge at dusk stays mostly dark (a dusk scene), two lit walls fall on both sides of a cut (two lit walls). A re-key into thirds was tried on 2026-11-03: it inverted a dark room  and darkened a high-key street , so it now runs only when the middle step covers over 70 percent. | `crates/atelier-core/src/values.rs` `view` (`ONE_STEP_MAX`) |
| 50 | Shapes at Big: a face can still melt into the ground. | `crates/atelier-core/src/shapes.rs` `Rag::merge` |
| 52 | Each Edges Lines or Transfer draw makes the edge map of the kept work picture again (`edges::map::strength`). The core does not hand the map out, so the wasm `Photo` cannot keep it. | `crates/atelier-core/src/render.rs` `edges_view`, `crates/atelier-wasm/src/lib.rs` `Prepared` |
| 56 | Speed: the Values smoothing (median 5x5, then two guided filter passes) could be the Fast Global Smoother of OpenCV ximgproc (Apache-2.0, about 150 lines to port). On the sunset portrait it gave nearly the same Three picture in 3 ms. | `crates/atelier-core/src/values.rs` `analyze` |
| 57 | Speed: `fast_image_resize` 6 (MIT or Apache-2.0, builds for wasm32 with simd128) was about 3 times faster than Pillow for Lanczos3 natively. Its bytes differ by up to 5 levels, so the refs and goldens would move. Not timed against our `resize_lanczos` yet. | `crates/atelier-core/src/resize.rs` |
| 63 | Pencil: the tone of each grade (L* 17 for the 9B up to 86 for the 4H) and the accent rule (Deep darks, 20 percent at the start) are chosen from painter guides, not measured on real pencils and paper. The research (2026-11-14) found no public table of L* per grade: ISO 9177-2 and ISO 20318-2 and the JIS standards do not publish values, and makers differ. Tone at Detail 50 can look soft on a busy photo (the fine detail is half kept). To settle it, scan a swatch set of your own pencils on one paper at one pressure, then change `TONES` in `pencil/grades.rs`. | `crates/atelier-core/src/pencil/grades.rs` `TONES`, `pencil/darks.rs` |
| 64 | Pencil: a Sketch look (outlines and contour lines as pencil strokes) is out for now. Edges is the line tool, and Pencil v2 keeps lines in Hatch only as a texture of the tone. The owner may want it as an Edges mode, drawn as graphite strokes; decide that before building anything. | `crates/atelier-core/src/edges/`, `docs/how-it-works/pencil.md` |

## Web app (`app/web`)

| # | What | Where to look |
|---|---|---|
| 59 | `mise run web:golden:bless` rewrites the four Edges goldens (`edges-amount-0`, `-33`, `-100`, `edges-mode-0`) when Edges did not change. Restore them from git after a bless. | `app/web/e2e/golden.spec.ts` |
| 61 | Front-end review items not done: the memory of the decoded photos kept in the photo store (measure first), the bundle split (measure first), one rule for the stage tone (a design choice). | `app/web/src/features/stage/Swatches.tsx`, `app/web/src/features/photos/`, `app/web/vite.config.ts` |
| 62 | Color picker: the six paints in `PAINTS` use typical spectra of their pigment class and a guessed tinting strength, not measurements of the owner's tubes (710 white, 120 yellow medium, 350 lake blue, 240 permanent red, 640 permanent black, 330 phthalocyanine blue; pigments and brand not known). Fix: a calibration card, where the painter picks each tube alone and with white from a photo of swatches, and the app fits the spectrum and strength; or a licensed set of measured acrylic K/S (Golden, Berns). | `app/web/src/features/picker/paints.ts`; [research/2026-11-13-acrylic-paint-spectra.md](research/2026-11-13-acrylic-paint-spectra.md) |
| 65 | Hatch looks busy, with ring-like moire on a face, when the photo is shown small (zoomed out to fit). Lines 3 to 7 px apart alias when the picture is scaled down. At 100 percent it reads as hatching. Idea: draw the lines at the shown size, or fade the lines to the tone when the zoom is under 50 percent. | `crates/atelier-core/src/pencil/hatch.rs`, `app/web/src/features/stage/` |
| 66 | The console shows a Content Security Policy error on every load: the Cloudflare Web Analytics beacon (`static.cloudflareinsights.com/beacon.min.js`) is blocked by `script-src 'self' 'wasm-unsafe-eval'`. It is harmless and nothing leaves the device. Fix: turn Web Analytics off for the Worker in the dashboard (the rule is that nothing leaves the device), or leave the CSP as it is. | `app/web/public/_headers` |
| 67 | Pencil Smudge adds about 120 ms natively (about 40 percent) to a 1024 x 768 draw and drags along the one Hatch angle, not the form flow, so in Hatch the drag crosses the lines where they bend. In the browser it is slower. Idea: use the structure direction Hatch already reads, and time it in wasm. | `crates/atelier-core/src/pencil/smudge.rs` |
| 68 | The effect pictures (Smudge, Lifted lights, Cross-hatch) and the Auto-first card were checked in the tests and on one screenshot only, not rated on real photos with the bench sheets. Run the tool bench and the rater before the next Pencil round. | `docs/development/bench.md` |
| 69 | The main JS bundle is about 657 KB. Split it (lazy load the tool cards and the picker) so the first paint and the precache are lighter. | `app/web/vite.config.ts`, `app/web/src/App.tsx` |
| 70 | Grid in cm: the Grid still counts cells; a Grid step in whole cm is not built. The Size card only tells the cell size (paper long side over the cells). | `app/web/src/features/tools/settings.ts`, `app/web/src/features/size/paper.ts` |

## Where leftovers come from

Add a row when you find a problem you do not fix. Delete the row in the commit that fixes it. Row
numbers are ids and may skip. Rows 36 to 50 came from a rating round on a local set of test photos.
That set is not in git.
