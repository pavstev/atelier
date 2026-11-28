//! The typed view calls of the core, and the checks of their numbers. `atelier-wasm` is the one caller
//! (the web app). Each view is one function that takes the work picture and plain numbers and
//! gives a picture back.
//!
//! Knobs (`detail`) are percent, 0.0 to 100.0, and reach the tool as 0.0 to 1.0 in steps of a
//! tenth of a percent. `preset`, `step` and `milli` are plain counts. Every number out of its
//! range or not a number, and every picture of the wrong shape, is an [`Error::BadInput`], never a
//! panic.
//!
//! | view | preset or step | other knobs |
//! |---|---|---|
//! | values | 0 notan, 1 three, 2 five, 3 families | `detail` |
//! | shapes | step 0 shadows, 1 halftones, 2 lights, 3 accents | `detail` |
//! | layers | `values_layer`, `shapes_layer`, `grid_layer`: RGBA | values and shapes: alpha 255; grid: alpha only on lines, `milli` the squares across the width in thousandths (100 to 500000), Contrast lines, from the top left corner |
//!
//! The photo comes in as RGB, already decoded and turned upright by the page (the browser
//! decoder). [`prepare_work`] brings it to the work size.

use std::borrow::Cow;

use crate::error::{Error, Result};
use crate::grid;
use crate::img::Rgb;
use crate::resize::resize_lanczos;
use crate::shapes;
use crate::values;

/// The long side range of the prepare view, in px.
const LONG_RANGE: std::ops::RangeInclusive<u32> = 8..=4096;

/// A knob in percent, 0.0 to 100.0, as 0.0 to 1.0 in steps of a tenth of a percent. A number out
/// of range or not a number is a [`Error::BadInput`] that names the knob.
pub(crate) fn knob(percent: f64, name: &str) -> Result<f32> {
    if !(0.0..=100.0).contains(&percent) {
        return Err(Error::bad(format!("{name} must be 0 to 100")));
    }
    Ok((percent * 10.0).round() as u32 as f32 / 1000.0)
}

/// A plain count from `lo` to `hi`, as the `u8` the tools take.
pub(crate) fn pick(v: u32, lo: u32, hi: u32, name: &str) -> Result<u8> {
    if !(lo..=hi).contains(&v) {
        return Err(Error::bad(format!("{name} must be {lo} to {hi}")));
    }
    u8::try_from(v).map_err(|_| Error::bad(format!("{name} must be {lo} to {hi}")))
}

/// An image with `channels` channels and at least one pixel.
pub(crate) fn image<'a>(img: &'a Rgb, channels: usize, name: &str) -> Result<&'a Rgb> {
    if !img.is_well_formed(channels) {
        return Err(Error::bad(format!(
            "{name} must be a non-empty {channels} channel image"
        )));
    }
    Ok(img)
}

/// The most times [`prepare_work`] enlarges a small photo.
pub const ENLARGE_MAX: usize = 4;

/// The photo (RGB, already upright) with the long side made `long` px. A smaller photo is first
/// freed of its JPEG block noise at its own size, then enlarged, at most [`ENLARGE_MAX`] times: the
/// tools are tuned for a work picture of about 1024 px, and an enlarged grid would hide the blocks.
///
/// # Errors
/// [`Error::BadInput`] for a `long` outside 8 to 4096, or a photo that is not RGB.
///
/// ```
/// use atelier_core::img::Rgb;
/// use atelier_core::render::prepare_work;
/// assert!(prepare_work(&Rgb::filled(4, 4, &[1, 2, 3]), 7).is_err());
/// ```
pub fn prepare_work(photo: &Rgb, long: u32) -> Result<Rgb> {
    if !LONG_RANGE.contains(&long) {
        return Err(Error::bad("long side out of range"));
    }
    let src = crate::photo::checked(photo)?;
    let longest = src.width.max(src.height);
    let long = long as usize;
    let long = if longest < long {
        long.min(longest * ENLARGE_MAX)
    } else {
        long
    };
    if longest == long {
        return Ok(src.clone());
    }
    let fit = |side: usize| ((side * long + longest / 2) / longest).max(1);
    let src = if longest < long {
        crate::deblock::calm(src)
    } else {
        Cow::Borrowed(src)
    };
    Ok(resize_lanczos(&src, fit(src.width), fit(src.height)))
}

/// The color guide of the Shapes at half weight.
const SHAPES_GUIDE: f32 = 0.5;

/// Values. `preset` 0 to 3, `detail` in percent. Gives the picture and its tones as painted bytes
/// (grays), darkest first.
///
/// # Errors
/// A number out of range.
pub fn values_view(work: &Rgb, preset: u32, detail: f64) -> Result<(Rgb, Vec<[u8; 3]>)> {
    let work = image(work, 3, "work")?;
    let preset = pick(preset, 0, 3, "values preset")?;
    let detail = knob(detail, "detail")?;
    values::view(work, preset, detail)
}

/// Shapes as a paint order (see [`shapes::steps_view`]). `step` 0 shadows, 1 halftones, 2 lights,
/// 3 accents; each step adds its shapes to the ones before, on a white canvas. The block-in shapes
/// are the auto level. `detail` in percent. Gives the picture and the piles of paint mixed in
/// `step`, darkest first.
///
/// # Errors
/// A number out of range.
pub fn shapes_view(work: &Rgb, step: u32, detail: f64) -> Result<(Rgb, Vec<[u8; 3]>)> {
    let work = image(work, 3, "work")?;
    let step = pick(step, 0, u32::from(shapes::STEP_MAX), "shapes step")?;
    shapes::steps_view(work, step, knob(detail, "detail")?, SHAPES_GUIDE)
}

/// A see-through layer: RGBA, `rgba.len() == width * height * 4`, straight (not premultiplied)
/// alpha.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Layer {
    /// Width in px.
    pub width: usize,
    /// Height in px.
    pub height: usize,
    /// The pixels, 4 bytes each: red, green, blue, alpha.
    pub rgba: Vec<u8>,
}

/// The picture as a layer; `alpha` gives the alpha of a pixel from its RGB bytes.
fn layer_with(img: &Rgb, alpha: impl Fn(&[u8]) -> u8) -> Layer {
    let mut rgba = Vec::with_capacity(img.width * img.height * 4);
    for p in img.data.chunks_exact(3) {
        rgba.extend_from_slice(&[p[0], p[1], p[2], alpha(p)]);
    }
    Layer {
        width: img.width,
        height: img.height,
        rgba,
    }
}

/// The picture with an alpha of 255 everywhere.
fn opaque(img: &Rgb) -> Layer {
    layer_with(img, |_| 255)
}

/// Values as an opaque layer, and its tones (RGB bytes, darkest first). Same numbers as
/// [`values_view`].
///
/// # Errors
/// A number out of range.
pub fn values_layer(work: &Rgb, preset: u32, detail: f64) -> Result<(Layer, Vec<[u8; 3]>)> {
    values_view(work, preset, detail).map(|(v, tones)| (opaque(&v), tones))
}

/// Shapes as an opaque layer, and the piles mixed in the step (RGB bytes, darkest first). Same
/// numbers as [`shapes_view`].
///
/// # Errors
/// A number out of range.
pub fn shapes_layer(work: &Rgb, step: u32, detail: f64) -> Result<(Layer, Vec<[u8; 3]>)> {
    shapes_view(work, step, detail).map(|(v, piles)| (opaque(&v), piles))
}

/// The grid lines alone, clear everywhere else: `milli` is the squares across the width in
/// thousandths, 100 to 500000 (0.1 to 500 squares), so a square size that does not divide the
/// width can be drawn: a grid of whole cm on a paper. 7500 is 7.5 squares, the last one a part
/// square at the right and the bottom. The squares start at the top left corner, the lines are
/// Contrast lines (the complement of the photo under them, 2 px wide at a long side of 2048), and
/// all alike.
///
/// # Errors
/// A `milli` out of range, or a picture of the wrong shape.
pub fn grid_layer(work: &Rgb, milli: u32) -> Result<Layer> {
    let work = image(work, 3, "work")?;
    let milli = grid::milli_of(milli)?;
    Ok(Layer {
        width: work.width,
        height: work.height,
        rgba: grid::layer(work, milli),
    })
}
