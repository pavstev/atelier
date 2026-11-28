# How it works

Three parts draw over the photo. Each is one function in the Rust core, called by the web app
through wasm. The same photo and the same knobs always give the same bytes.

| Part | Job | Page |
|---|---|---|
| Values | The photo in 2 to 5 flat tones | [values.md](values.md) |
| Shapes | The photo cut into shapes, in paint order | [shapes.md](shapes.md) |
| Grid | Squares by cm, as lines | [grid.md](grid.md) |

The order is fixed: one base (Photo, Values or Shapes), then Grid.
Grid is see-through, so it sits over any base.

All parts work on a "work picture" with a long side of 1024 px. The page decodes the photo,
turns it upright (EXIF) and hands RGB pixels to the core. The core gives back a layer as RGBA. The resize to the work picture
is `resize_lanczos` (`crates/atelier-core/src/resize.rs`) and runs once per photo.

For where the numbers come from, read the research notes:

- [The science of values for oil painters](../research/2026-11-04-painting-value-science.md)
- [The L* and Munsell choice](../research/2026-10-28-value-study-algorithm.md)
- [The metrics that judge Values and Shapes](../research/2026-11-04-value-eval-spec.md)

Tried and left out: `fast_image_resize` 6.2 (Lanczos3, U8x3), timed on 2026-11-28 against our
`resize_lanczos`, native release, median of 20, down to 1024 long side. It is 4.7 times faster
from 2400 x 1600 (6.9 ms against 32 ms) and 5.9 times faster from 4096 x 2731 (13 ms against
78 ms), and it builds for wasm32 with simd128. Not adopted: its bytes differ from ours by up to
14 levels on real photos (mean about 0.2), so every reference and golden picture would move, and
the resize runs once per photo, so the time is not a visible cost. Look again only if it becomes one.
