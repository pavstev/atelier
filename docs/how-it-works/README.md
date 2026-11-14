# How it works

Five parts draw over the photo. Each is one function in the Rust core, called by the web app
through wasm. The same photo and the same knobs always give the same bytes.

| Part | Job | Page |
|---|---|---|
| Values | The photo in 2 to 5 flat tones | [values.md](values.md) |
| Shapes | The photo cut into shapes, in paint order | [shapes.md](shapes.md) |
| Pencil | The photo as a gray picture in graphite tones, 4H to 9B | [pencil.md](pencil.md) |
| Edges | A line drawing traced from the photo | [edges.md](edges.md) |
| Grid | Thirds and squares, as lines | [grid.md](grid.md) |

The order is fixed: one base (Photo, Values, Shapes, Paper or Pencil), then Edges, then Grid. Pencil turns Edges off. Edges and
Grid are see-through, so they sit over any base.

All parts work on a "work picture" with a long side of 1024 px. The page decodes the photo,
turns it upright (EXIF) and hands RGB pixels to the core. The core gives back a layer as RGBA.

For where the numbers come from, read the research notes:

- [The science of values for oil painters](../research/2026-11-04-painting-value-science.md)
- [The L* and Munsell choice](../research/2026-10-28-value-study-algorithm.md)
- [The metrics that judge Values and Shapes](../research/2026-11-04-value-eval-spec.md)
