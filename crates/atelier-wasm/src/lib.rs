//! The browser edge of atelier-core: a photo kept between draws and one layer call per part over
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

/// The packed layer, then the count of swatches (one byte) and their RGB bytes.
fn with_swatches(layer: &Layer, swatches: &[[u8; 3]]) -> Vec<u8> {
    let mut out = pack(layer);
    out.push(swatches.len() as u8);
    out.extend(swatches.iter().flatten());
    out
}

/// Values on a work picture, with the tones after the layer. See [`Photo::values`].
fn values_of(work: &Rgb, preset: u32, detail: f64) -> Result<Vec<u8>> {
    let (layer, tones) = render::values_layer(work, preset, detail)?;
    Ok(with_swatches(&layer, &tones))
}

/// Shapes on a work picture, with the piles after the layer. See [`Photo::shapes`].
fn shapes_of(work: &Rgb, step: u32, detail: f64) -> Result<Vec<u8>> {
    let (layer, piles) = render::shapes_layer(work, step, detail)?;
    Ok(with_swatches(&layer, &piles))
}

/// The Grid on a work picture. See [`Photo::grid`].
fn grid_of(work: &Rgb, milli: u32) -> Result<Vec<u8>> {
    Ok(pack(&render::grid_layer(work, milli)?))
}

/// One work picture of a photo.
struct Prepared {
    long: u32,
    work: Rgb,
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
            self.prepared = Some(Prepared { long, work });
        }
        self.prepared
            .as_ref()
            .map(|p| &p.work)
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

    /// The Values layer: the photo in a few gray tones, opaque. `preset` is 0 to 3 (Notan, Three,
    /// Five, Families). After the layer come one byte with the tone count and 3 bytes (RGB) per
    /// tone, darkest first.
    ///
    /// # Errors
    /// A `long`, `preset` or `detail` out of range.
    pub fn values(&mut self, long: u32, preset: u32, detail: f64) -> JsResult<Vec<u8>> {
        run(|| values_of(self.prepare(long)?, preset, detail))
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

    /// The Grid layer: Contrast lines on a clear layer, squares from the top left corner. `milli`
    /// counts the squares across the width in thousandths (7500 is 7.5, for a grid of whole cm on
    /// a paper; 100 to 500000).
    ///
    /// # Errors
    /// A `long` or `milli` out of range.
    pub fn grid(&mut self, long: u32, milli: u32) -> JsResult<Vec<u8>> {
        run(|| grid_of(self.prepare(long)?, milli))
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
        let out = values_of(&work, 1, 50.0).unwrap();
        let body = 8 + 64 * 48 * 4;
        assert_eq!(&out[..8], &[64, 0, 0, 0, 48, 0, 0, 0]);
        let n = usize::from(out[body]);
        assert_eq!(n, 3);
        assert_eq!(out.len(), body + 1 + 3 * n);
        let tones: Vec<&[u8]> = out[body + 1..].chunks(3).collect();
        assert!(tones.windows(2).all(|t| t[0][0] < t[1][0]));
        assert!(values_of(&work, 4, 50.0).is_err());
    }

    #[test]
    fn test_every_layer_draws() {
        let (g, w, h) = gradient();
        let work = work_of(&g, w, h, 64).unwrap();
        let grid = grid_of(&work, 6000).unwrap();
        assert_eq!(&grid[..8], &[64, 0, 0, 0, 48, 0, 0, 0]);
        assert_eq!(grid.len(), 8 + 64 * 48 * 4);
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
        assert!(values_of(&work, 4, 50.0).is_err());
        assert!(grid_of(&work, 0).is_err());
        assert!(grid_of(&work, 99).is_err());
        assert!(grid_of(&work, 7500).is_ok());
        assert!(Photo::from_rgba(&g, w + 1, h).is_err());
    }

    #[test]
    fn test_photo_work_is_the_resize() {
        let (g, w, h) = gradient();
        let mut photo = Photo::from_rgba(&g, w, h).unwrap();
        let work = photo.prepare(64).unwrap().clone();
        assert_eq!(work, work_of(&g, w, h, 64).unwrap());
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
