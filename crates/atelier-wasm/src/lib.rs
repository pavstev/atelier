//! The browser edge of atelier-core: a photo kept between draws and four layer calls over
//! wasm-bindgen.
//!
//! The page decodes the photo to RGBA and gives it to a [`Photo`] once. A layer call on the photo
//! answers with an 8 byte header (`width` and `height` of the work picture, both u32 little
//! endian) and then the layer as RGBA with its own alpha. The logic lives in plain functions so it
//! also runs in native tests.

use atelier_core::error::{Error, Result};
use atelier_core::img::Rgb;
use atelier_core::render::{self, Layer};
use wasm_bindgen::prelude::*;

/// RGBA to the RGB the core wants. Alpha is dropped.
fn rgb_from_rgba(rgba: &[u8], width: u32, height: u32) -> Result<Rgb> {
    let (w, h) = (width as usize, height as usize);
    if w == 0 || h == 0 || w.checked_mul(h).and_then(|n| n.checked_mul(4)) != Some(rgba.len()) {
        return Err(Error::BadInput(
            "rgba length does not match width and height".into(),
        ));
    }
    let data = rgba
        .chunks_exact(4)
        .flat_map(|p| [p[0], p[1], p[2]])
        .collect();
    Ok(Rgb::from_vec(w, h, 3, data))
}

/// The header and the RGBA bytes of a layer, as the module docs describe.
fn pack(layer: &Layer) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + layer.rgba.len());
    out.extend_from_slice(&(layer.width as u32).to_le_bytes());
    out.extend_from_slice(&(layer.height as u32).to_le_bytes());
    out.extend_from_slice(&layer.rgba);
    out
}

/// What a wasm method answers: the value, or a JS error.
type JsResult<T> = std::result::Result<T, JsError>;

/// Runs `f` and turns a core error into a JS error.
fn run<T>(f: impl FnOnce() -> Result<T>) -> JsResult<T> {
    f().map_err(|e| JsError::new(&e.to_string()))
}

/// Edges on a work picture. See [`Photo::edges`].
/// `kept` is the edge map of `work`, made on the first Lines or Transfer draw and read after.
fn edges_of(
    work: &Rgb,
    kept: &mut Option<Rgb>,
    mode: u32,
    amount: f64,
    line: u32,
    even: f64,
) -> Result<Vec<u8>> {
    Ok(pack(&render::edges_layer_kept(
        work, kept, mode, amount, line, even,
    )?))
}

/// The packed layer, then the count of swatches (one byte) and their RGB bytes.
fn with_swatches(layer: &Layer, swatches: &[[u8; 3]]) -> Vec<u8> {
    let mut out = pack(layer);
    out.push(swatches.len() as u8);
    out.extend(swatches.iter().flatten());
    out
}

/// Values on a work picture, with the tones after the layer. See [`Photo::values`].
fn values_of(work: &Rgb, preset: u32, detail: f64, tint: u32) -> Result<Vec<u8>> {
    let (layer, tones) = render::values_layer(work, preset, detail, tint)?;
    Ok(with_swatches(&layer, &tones))
}

/// Shapes on a work picture, with the piles after the layer. See [`Photo::shapes`].
fn shapes_of(work: &Rgb, step: u32, detail: f64) -> Result<Vec<u8>> {
    let (layer, piles) = render::shapes_layer(work, step, detail)?;
    Ok(with_swatches(&layer, &piles))
}

/// The byte at the end of a Pencil answer when no level is marked.
const NO_MARK: u8 = 255;

/// Pencil on a work picture: the packed layer, then the level count (one byte), 3 RGB bytes per
/// level, one share byte (percent) per level and the marked level (one byte, [`NO_MARK`] for none).
/// See [`Photo::pencil`].
fn pencil_of(work: &Rgb, look: u32, mask: u32, numbers: &[f64]) -> Result<Vec<u8>> {
    let p = render::pencil_layer(work, look, mask, numbers)?;
    let mut out = with_swatches(&p.layer, &p.tones);
    out.extend(p.shares);
    out.push(p.mark.unwrap_or(NO_MARK));
    Ok(out)
}

/// The Grid on a work picture. See [`Photo::grid`]. A `milli` of 0 counts `cells` squares; any
/// other number is the fine count in thousandths and `cells` is not used.
#[allow(
    clippy::too_many_arguments,
    reason = "the numbers are those of the wasm method, which takes plain numbers"
)]
fn grid_of(
    work: &Rgb,
    mode: u32,
    cells: u32,
    line: u32,
    group: u32,
    color: u32,
    center: u32,
    milli: u32,
) -> Result<Vec<u8>> {
    let layer = if milli == 0 {
        render::grid_layer(work, mode, cells, line, group, color, center)?
    } else {
        render::grid_layer_milli(work, mode, milli, line, group, color, center)?
    };
    Ok(pack(&layer))
}

/// One work picture of a photo.
struct Prepared {
    long: u32,
    work: Rgb,
    /// The edge map of `work`, made by the first Edges draw. It goes with the work picture.
    edge_map: Option<Rgb>,
}

/// One photo kept between draws: the RGB copy and the last work picture (the resize to `long`).
/// A knob change then redraws from the kept work picture.
#[wasm_bindgen]
pub struct Photo {
    rgb: Rgb,
    /// The work picture on screen.
    prepared: Option<Prepared>,
}

impl Photo {
    /// The photo from RGBA bytes.
    fn from_rgba(rgba: &[u8], width: u32, height: u32) -> Result<Self> {
        Ok(Self {
            rgb: rgb_from_rgba(rgba, width, height)?,
            prepared: None,
        })
    }

    /// The work picture at `long`.
    fn prepare(&mut self, long: u32) -> Result<&Rgb> {
        if self.prepared.as_ref().is_none_or(|p| p.long != long) {
            let work = render::prepare_work(&self.rgb, long)?;
            self.prepared = Some(Prepared {
                long,
                work,
                edge_map: None,
            });
        }
        self.prepared
            .as_ref()
            .map(|p| &p.work)
            .ok_or_else(|| Error::BadInput("no work picture".into()))
    }

    /// The work picture at `long` and the place of its kept edge map.
    fn prepare_edges(&mut self, long: u32) -> Result<(&Rgb, &mut Option<Rgb>)> {
        self.prepare(long)?;
        self.prepared
            .as_mut()
            .map(|p| (&p.work, &mut p.edge_map))
            .ok_or_else(|| Error::BadInput("no work picture".into()))
    }
}

#[wasm_bindgen]
impl Photo {
    /// Keeps the photo of these RGBA bytes.
    ///
    /// # Errors
    /// A length that does not fit the size.
    #[wasm_bindgen(constructor)]
    pub fn new(rgba: &[u8], width: u32, height: u32) -> JsResult<Self> {
        run(|| Self::from_rgba(rgba, width, height))
    }

    /// The Edges layer: ink lines, transfer, mass borders or graphite strokes, see-through. `mode`
    /// 0 lines, 1 transfer, 2 masses, 3 sketch; `amount` 0 to 100; `line` the line width, 1 to 10 (3 is the width
    /// before the knob); `even` 0 to 100, how far the Lines widths go to one width.
    ///
    /// # Errors
    /// A `long`, `mode`, `amount`, `line` or `even` out of range.
    pub fn edges(
        &mut self,
        long: u32,
        mode: u32,
        amount: f64,
        line: u32,
        even: f64,
    ) -> JsResult<Vec<u8>> {
        run(|| {
            let (work, kept) = self.prepare_edges(long)?;
            edges_of(work, kept, mode, amount, line, even)
        })
    }

    /// The Values layer: the photo in a few tones, opaque. `tint` 0 gray, 1 umber. After the layer
    /// come one byte with the tone count and 3 bytes (RGB) per tone, darkest first.
    ///
    /// # Errors
    /// A `long`, `preset`, `detail` or `tint` out of range.
    pub fn values(&mut self, long: u32, preset: u32, detail: f64, tint: u32) -> JsResult<Vec<u8>> {
        run(|| values_of(self.prepare(long)?, preset, detail, tint))
    }

    /// The Pencil layer: the photo as a graphite study, opaque. `look` 0 is the smooth tone picture, 1
    /// the drawing, 3 hatch, 4 by pencil (2 is refused). `mask` is the pencils, bit 0 the 9B up to
    /// bit 7 the 4H (255 is all). `numbers` is a `Float64Array` of 14 numbers, in the order
    /// `detail`, `key`, `contrast`, `highlights`, `darks`, `local`, `grain`, `paper`, `angle`,
    /// `density`, `step`, `smudge`, `lift`, `cross` (their ranges are in `atelier_core::render`;
    /// the last three are effects, 0 off). After the layer come one byte
    /// with the level count (the pencils of the set, then paper, darkest first), 3 bytes (RGB) per
    /// level, one byte per level with the share of the picture in percent, and one byte with the
    /// marked level (255 for none).
    ///
    /// # Errors
    /// A `long`, `look`, `mask` or number out of range, or `numbers` of the wrong length.
    pub fn pencil(
        &mut self,
        long: u32,
        look: u32,
        mask: u32,
        numbers: &[f64],
    ) -> JsResult<Vec<u8>> {
        run(|| pencil_of(self.prepare(long)?, look, mask, numbers))
    }

    /// What Auto reads from the photo, as 9 numbers: `key`, `contrast`, `highlights` (the knobs it
    /// sets), the median L*, the key class (0 low, 1 mid, 2 high), the IQR, eta, bimodal (0 or 1)
    /// and spike (0 or 1).
    ///
    /// # Errors
    /// A `long` out of range.
    pub fn pencil_auto(&mut self, long: u32) -> JsResult<Vec<f64>> {
        run(|| Ok(render::pencil_auto(self.prepare(long)?)?.to_vec()))
    }

    /// The pencil `mask` (bit 0 the 9B up to bit 7 the 4H) of the best `count` pencils, 3 to 6, of
    /// the eight for the photo.
    ///
    /// # Errors
    /// A `long` or `count` out of range.
    pub fn pencil_suggest(&mut self, long: u32, count: u32) -> JsResult<u32> {
        run(|| render::pencil_suggest(self.prepare(long)?, count))
    }

    /// The Shapes layer: flat shapes in a paint order, opaque. `step` is 0 to 3 (Shadows,
    /// Halftones, Lights, Accents); each step adds to the ones before. After the layer come one
    /// byte with the pile count and 3 bytes (RGB) per pile to mix in that step, darkest first.
    ///
    /// # Errors
    /// A number out of range.
    pub fn shapes(&mut self, long: u32, step: u32, detail: f64) -> JsResult<Vec<u8>> {
        run(|| shapes_of(self.prepare(long)?, step, detail))
    }

    /// The Grid layer: lines on a clear layer. `line` is the line width (1 to 16 px at a long
    /// side of 2048), `group` the cells each way between two heavy lines (2 or 4) and `color`
    /// one color as `0xRRGGBB`, or `1 << 24` for Contrast lines. `cells` squares fit the width
    /// exactly; `center` 1 puts the rows in the middle, 0 at the top. A `milli` above 0 counts
    /// the squares across the width in thousandths instead (7500 is 7.5, for a grid of whole cm
    /// on a paper; 100 to 500000) and `cells` is then not used; 0 counts `cells`.
    ///
    /// # Errors
    /// A `long`, `mode`, `cells`, `line`, `group`, `color`, `center` or `milli` out of range.
    #[allow(
        clippy::too_many_arguments,
        reason = "wasm-bindgen takes plain numbers; a struct would need its own JS class"
    )]
    pub fn grid(
        &mut self,
        long: u32,
        mode: u32,
        cells: u32,
        line: u32,
        group: u32,
        color: u32,
        center: u32,
        milli: u32,
    ) -> JsResult<Vec<u8>> {
        run(|| {
            grid_of(
                self.prepare(long)?,
                mode,
                cells,
                line,
                group,
                color,
                center,
                milli,
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The work picture of `rgba` at `long` px.
    fn work_of(rgba: &[u8], width: u32, height: u32, long: u32) -> Result<Rgb> {
        render::prepare_work(&rgb_from_rgba(rgba, width, height)?, long)
    }

    /// A 64 x 48 gradient.
    fn gradient() -> (Vec<u8>, u32, u32) {
        let mut v = Vec::new();
        for y in 0..48u32 {
            for x in 0..64u32 {
                v.extend_from_slice(&[(x * 4) as u8, (y * 5) as u8, ((x + y) * 2) as u8, 255]);
            }
        }
        (v, 64, 48)
    }

    #[test]
    fn test_values_appends_tones() {
        let (g, w, h) = gradient();
        let work = work_of(&g, w, h, 64).unwrap();
        let out = values_of(&work, 1, 50.0, 0).unwrap();
        let body = 8 + 64 * 48 * 4;
        assert_eq!(&out[..8], &[64, 0, 0, 0, 48, 0, 0, 0]);
        let n = usize::from(out[body]);
        assert_eq!(n, 3);
        assert_eq!(out.len(), body + 1 + 3 * n);
        let tones: Vec<&[u8]> = out[body + 1..].chunks(3).collect();
        assert!(tones.windows(2).all(|t| t[0][0] < t[1][0]));
        assert!(values_of(&work, 1, 50.0, 2).is_err());
    }

    /// The Pencil numbers at their start: detail, key, contrast, highlights, darks, local, grain,
    /// paper, angle, density, step, smudge, lift, cross.
    const PENCIL_START: [f64; render::PENCIL_NUMBERS] = [
        50.0, 50.0, 50.0, 1.0, 20.0, 0.0, 50.0, 1.0, 45.0, 50.0, 1.0, 0.0, 0.0, 0.0,
    ];

    #[test]
    fn test_pencil_appends_tones_shares_and_the_mark() {
        let (g, w, h) = gradient();
        let work = work_of(&g, w, h, 64).unwrap();
        let out = pencil_of(&work, 0, 0b0000_0111, &PENCIL_START).unwrap();
        let body = 8 + 64 * 48 * 4;
        let n = usize::from(out[body]);
        // three pencils and paper
        assert_eq!(n, 4);
        assert_eq!(out.len(), body + 1 + 3 * n + n + 1);
        assert!(
            out[body + 1 + 3 * n..body + 1 + 4 * n]
                .iter()
                .all(|&s| s <= 100)
        );
        // no level is marked outside By pencil
        assert_eq!(out[out.len() - 1], NO_MARK);
        // By pencil marks the level of its step: the lightest of three pencils is level 2
        let by = pencil_of(&work, 4, 0b0000_0111, &PENCIL_START).unwrap();
        assert_eq!(by[by.len() - 1], 2);
        assert!(pencil_of(&work, 5, 255, &PENCIL_START).is_err());
        assert!(pencil_of(&work, 0, 0, &PENCIL_START).is_err());
        // the old 11 numbers are no longer enough, and the effects take 0 to 100
        assert!(pencil_of(&work, 0, 255, &PENCIL_START[..11]).is_err());
        let mut loud = PENCIL_START;
        loud[11..].fill(100.0);
        assert!(pencil_of(&work, 3, 255, &loud).is_ok());
        loud[12] = 101.0;
        assert!(pencil_of(&work, 3, 255, &loud).is_err());
    }

    #[test]
    fn test_pencil_auto_and_suggest_read_the_kept_photo() {
        let (g, w, h) = gradient();
        let mut photo = Photo::from_rgba(&g, w, h).unwrap();
        let auto = photo.pencil_auto(64).ok().unwrap();
        assert_eq!(auto.len(), 9);
        assert!((0.0..=100.0).contains(&auto[0]) && (0.0..=100.0).contains(&auto[1]));
        let mask = photo.pencil_suggest(64, 4).ok().unwrap();
        assert_eq!(mask.count_ones(), 4);
        // the refusals are the core's (the JS error itself exists only in wasm)
        let work = photo.prepare(64).unwrap().clone();
        assert!(render::pencil_suggest(&work, 2).is_err());
        assert!(render::pencil_suggest(&work, 7).is_err());
    }

    #[test]
    fn test_every_layer_draws() {
        let (g, w, h) = gradient();
        let work = work_of(&g, w, h, 64).unwrap();
        let grid = grid_of(&work, 2, 6, 2, 2, render::GRID_CONTRAST, 0, 0).unwrap();
        for out in [
            &grid,
            &edges_of(&work, &mut None, 1, 50.0, 5, 50.0).unwrap(),
        ] {
            assert_eq!(&out[..8], &[64, 0, 0, 0, 48, 0, 0, 0]);
            assert_eq!(out.len(), 8 + 64 * 48 * 4);
        }
        let body = 8 + 64 * 48 * 4;
        let shapes = shapes_of(&work, 3, 50.0).unwrap();
        assert_eq!(&shapes[..8], &[64, 0, 0, 0, 48, 0, 0, 0]);
        let n = usize::from(shapes[body]);
        assert_eq!(shapes.len(), body + 1 + 3 * n);
        assert!(shapes_of(&work, 4, 50.0).is_err());
        assert!(grid[8..].chunks(4).any(|p| p[3] == 0) && grid[8..].chunks(4).any(|p| p[3] > 0));
    }

    #[test]
    fn test_bad_numbers_refuse() {
        let (g, w, h) = gradient();
        let work = work_of(&g, w, h, 64).unwrap();
        assert!(values_of(&work, 6, 50.0, 0).is_err());
        assert!(grid_of(&work, 1, 5, 2, 2, 0, 0, 0).is_err());
        assert!(grid_of(&work, 1, 6, 2, 2, 0, 0, 99).is_err());
        assert!(grid_of(&work, 1, 5, 2, 2, 0, 0, 7500).is_ok());
        assert!(Photo::from_rgba(&g, w + 1, h).is_err());
    }

    #[test]
    fn test_photo_work_is_the_resize() {
        let (g, w, h) = gradient();
        let mut photo = Photo::from_rgba(&g, w, h).unwrap();
        let work = photo.prepare(64).unwrap().clone();
        assert_eq!(work, work_of(&g, w, h, 64).unwrap());
    }

    /// A 96 x 64 picture of soft blocks, with many edges.
    fn blocks() -> (Vec<u8>, u32, u32) {
        let mut v = Vec::new();
        for y in 0..64u32 {
            for x in 0..96u32 {
                let t = ((x / 12 + y / 8) * 37 % 11 * 22) as u8;
                v.extend_from_slice(&[t, t.wrapping_add(20), 255 - t, 255]);
            }
        }
        (v, 96, 64)
    }

    #[test]
    fn test_edges_with_a_kept_map_equal_a_fresh_draw() {
        let (g, w, h) = blocks();
        let mut photo = Photo::from_rgba(&g, w, h).unwrap();
        let work = work_of(&g, w, h, 96).unwrap();
        for (mode, amount, line, even) in
            [(0, 67.0, 3, 0.0), (0, 100.0, 5, 60.0), (1, 50.0, 3, 0.0)]
        {
            let fresh = edges_of(&work, &mut None, mode, amount, line, even).unwrap();
            let (kept_work, kept) = photo.prepare_edges(96).unwrap();
            let first = edges_of(kept_work, kept, mode, amount, line, even).unwrap();
            let again = {
                let (kept_work, kept) = photo.prepare_edges(96).unwrap();
                assert!(kept.is_some());
                edges_of(kept_work, kept, mode, amount, line, even).unwrap()
            };
            assert_eq!(first, fresh);
            assert_eq!(again, fresh);
        }
        // Masses leaves the map alone and still matches.
        let fresh = edges_of(&work, &mut None, 2, 67.0, 3, 0.0).unwrap();
        let (kept_work, kept) = photo.prepare_edges(96).unwrap();
        assert_eq!(edges_of(kept_work, kept, 2, 67.0, 3, 0.0).unwrap(), fresh);
    }

    #[test]
    fn test_the_kept_map_goes_with_the_work_picture() {
        let (g, w, h) = blocks();
        let mut photo = Photo::from_rgba(&g, w, h).unwrap();
        let (work, kept) = photo.prepare_edges(96).unwrap();
        edges_of(work, kept, 0, 50.0, 3, 0.0).unwrap();
        assert!(photo.prepared.as_ref().unwrap().edge_map.is_some());
        photo.prepare(48).unwrap();
        assert!(photo.prepared.as_ref().unwrap().edge_map.is_none());
        // A map of the wrong size is refused, not a panic.
        let (work, kept) = photo.prepare_edges(48).unwrap();
        *kept = Some(Rgb::filled(5, 5, &[0]));
        assert!(edges_of(work, kept, 0, 50.0, 3, 0.0).is_err());
        // Bad input stays BadInput and makes no map.
        let (work, kept) = photo.prepare_edges(64).unwrap();
        assert!(edges_of(work, kept, 0, 101.0, 3, 0.0).is_err());
        assert!(kept.is_none());
    }

    #[test]
    fn test_photo_keeps_one_work_picture() {
        let (g, w, h) = gradient();
        let mut photo = Photo::from_rgba(&g, w, h).unwrap();
        for long in [64, 64, 128, 64, 32] {
            photo.prepare(long).unwrap();
        }
        let kept: Vec<u32> = photo.prepared.iter().map(|p| p.long).collect();
        assert_eq!(kept, [32]);
        assert!(photo.prepare(5000).is_err());
    }
}
