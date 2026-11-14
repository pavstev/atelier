//! The typed view calls of the core, and the checks of their numbers. `atelier-wasm` is the one caller
//! (the web app). Each view is one function that takes the work picture and plain numbers and
//! gives a picture back.
//!
//! Knobs (`detail`, `amount`, `even`, ...) are percent, 0.0 to 100.0, and reach the tool as 0.0 to
//! 1.0 in steps of a tenth of a percent. `preset`, `step`, `tint`, `mode`, `cells`, `width`,
//! `group`, `center` are plain counts. Every number out of its range, and every picture of the wrong shape, is an
//! [`Error::BadInput`], never a panic.
//!
//! | view | preset or step | other knobs |
//! |---|---|---|
//! | values | 0 notan, 1 three, 2 five, 3 shadow family, 4 light family, 5 families | `detail`, `tint` 0 gray 1 umber |
//! | shapes | step 0 shadows, 1 halftones, 2 lights, 3 accents | `detail` |
//! | edges | mode 0 lines, 1 transfer, 2 masses | `amount`, `width`, `even` |
//! | pencil | `look` 0 tone, 1 drawing, 2 zones; `mask` the pencils, bit 0 the 9B to bit 7 the 4H (255 all) | `detail` |
//! | layers | `edges_layer`, `values_layer`, `shapes_layer`, `pencil_layer`, `grid_layer`: RGBA | edges: alpha is 255 minus the largest channel; values, shapes and pencil: alpha 255; grid: alpha only on lines (`mode` 0 thirds, 1 grid, 2 both; `cells` 3 to 50 across the width; `width` 1 to 16; `group` 2 to 4; `color`; `center` 0 or 1) |
//!
//! The photo comes in as RGB, already decoded and turned upright by the page (the browser
//! decoder). [`prepare_work`] brings it to the work size.
//!
//! Edges are traced from the core's own edge map: a 1 channel image of the work size, 0 to 255,
//! big is edge (a blurred Sobel, `edges/map.rs`).

use std::borrow::Cow;

use crate::edges;
use crate::error::{Error, Result};
use crate::grid;
use crate::img::Rgb;
use crate::pencil;
use crate::resize::resize_lanczos;
use crate::shapes::{self, Fill, ShapesView};
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
            "{name} must be a {channels} channel image"
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

/// Shapes are painted in the color of their pile, with the boundaries rounded one step and the
/// color guide at half weight.
const SHAPES_SMOOTH: u8 = 1;
const SHAPES_GUIDE: f32 = 0.5;
/// The Shapes view blocks in the auto level.
const SHAPES_AUTO: u8 = 3;

/// Values. `preset` 0 to 5, `detail` in percent, `tint` 0 gray or 1 umber. Gives the picture and
/// its tones as painted bytes, darkest first.
///
/// # Errors
/// A number out of range.
pub fn values_view(work: &Rgb, preset: u32, detail: f64, tint: u32) -> Result<(Rgb, Vec<[u8; 3]>)> {
    let work = image(work, 3, "work")?;
    let preset = pick(preset, 0, 5, "values preset")?;
    let detail = knob(detail, "detail")?;
    let tint = pick(tint, 0, 1, "tint")?;
    values::view(work, preset, detail, tint)
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
    let v = ShapesView {
        level: SHAPES_AUTO,
        detail: knob(detail, "detail")?,
        fill: Fill::Color,
        smooth: SHAPES_SMOOTH,
        guide: SHAPES_GUIDE,
        outline: 1.0,
    };
    shapes::steps_view(work, step, &v)
}

/// Edges as a picture of ink on white paper. `mode` 0 lines, 1 transfer, 2 masses. `amount` is
/// 0 to 100. Lines: 0 few, 33 some, 67 many, 100 many with twice the line budget, and in between
/// a straight blend. Transfer: `amount` 50 is the middle. Masses: the borders of the Shapes
/// level that `amount` picks (0 to 49 big, 50 to 84 mid, 85 to 100 small), so the start Amount 67 is
/// mid. Lines and transfer
/// are traced from the core's own edge strength map (a blurred Sobel gradient, `edges::map`).
/// `width` is 1 to [`EDGES_WIDTH_MAX`]: 3 is the line width Edges had before the knob, and each
/// step adds a quarter of it, in every mode. `even` is 0 to 100: how far the Lines widths are
/// pulled toward one middle width (0 the widths as traced, 100 every line one width end to end);
/// Transfer and Masses draw one width anyway. Every line is black.
///
/// # Errors
/// A number out of range.
pub fn edges_view(work: &Rgb, mode: u32, amount: f64, width: u32, even: f64) -> Result<Rgb> {
    let work = image(work, 3, "work")?;
    let mode = pick(mode, 0, 2, "edges mode")?;
    knob(amount, "amount")?;
    let scale = f32::from(pick(width, 1, EDGES_WIDTH_MAX, "edges width")? + 1) / 4.0;
    let even = knob(even, "edges even")?;
    if mode == 2 {
        let v = ShapesView {
            level: masses_level(amount),
            detail: MASSES_DETAIL,
            fill: Fill::Outline,
            smooth: SHAPES_SMOOTH,
            guide: SHAPES_GUIDE,
            outline: scale,
        };
        return shapes::view(work, &v);
    }
    let edges = edges::map::strength(work)?;
    edges::trace::view_amount(work, mode == 1, amount as f32, scale, even, &edges)
}

/// The Grid color that asks for Contrast lines (`GRID_CONTRAST` in
/// `app/web/src/features/tools/settings.ts`).
pub use crate::grid::CONTRAST as GRID_CONTRAST;

/// The Edges width knob runs 1 to this (`EDGES_WIDTH_MAX` in
/// `app/web/src/features/tools/settings.ts`).
pub const EDGES_WIDTH_MAX: u32 = 10;

/// The Amount at which Masses leaves the big level for the mid one, and the mid for the small.
/// The start Amount 67 lands on mid: the small level is a maze of borders.
const MASSES_MID_FROM: f64 = 50.0;
const MASSES_SMALL_FROM: f64 = 85.0;

/// The Shapes level (0 big, 1 mid, 2 small) that the Masses `amount` picks.
fn masses_level(amount: f64) -> u8 {
    if amount < MASSES_MID_FROM {
        0
    } else if amount < MASSES_SMALL_FROM {
        1
    } else {
        2
    }
}

/// The detail of the Shapes level that the Masses borders come from.
const MASSES_DETAIL: f32 = 0.5;

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

/// Edges: the view as ink on clear. The alpha of a pixel is 255 minus its largest channel,
/// so white paper is clear and black ink is solid. Same numbers as [`edges_view`].
///
/// # Errors
/// A number out of range.
pub fn edges_layer(work: &Rgb, mode: u32, amount: f64, width: u32, even: f64) -> Result<Layer> {
    let v = edges_view(work, mode, amount, width, even)?;
    Ok(layer_with(&v, |p| 255 - p[0].max(p[1]).max(p[2])))
}

/// Values as an opaque layer, and its tones (RGB bytes, darkest first). `tint` 0 gray, 1 umber.
/// Same numbers as [`values_view`].
///
/// # Errors
/// A number out of range.
pub fn values_layer(
    work: &Rgb,
    preset: u32,
    detail: f64,
    tint: u32,
) -> Result<(Layer, Vec<[u8; 3]>)> {
    values_view(work, preset, detail, tint).map(|(v, tones)| (opaque(&v), tones))
}

/// Shapes as an opaque layer, and the piles mixed in the step (RGB bytes, darkest first). Same
/// numbers as [`shapes_view`].
///
/// # Errors
/// A number out of range.
pub fn shapes_layer(work: &Rgb, step: u32, detail: f64) -> Result<(Layer, Vec<[u8; 3]>)> {
    shapes_view(work, step, detail).map(|(v, piles)| (opaque(&v), piles))
}

/// Pencil as an opaque layer: the photo as a graphite study. `look` 0 is the flat map, 1 the drawing
/// (grain and hatching on paper). `mask` has one bit per pencil, bit 0 the 9B, then 7B, 5B, 2B,
/// HB, H, 3H, and bit 7 the 4H (255 is all eight), at least one set. `detail` in percent, as in
/// Values. Gives the layer, the color of each level (the pencils of the set, then paper, darkest
/// first) and the share of the picture each level covers in percent.
///
/// # Errors
/// A number out of range.
pub fn pencil_layer(
    work: &Rgb,
    look: u32,
    mask: u32,
    detail: f64,
) -> Result<(Layer, Vec<[u8; 3]>, Vec<u8>)> {
    let work = image(work, 3, "work")?;
    let look = pick(look, 0, 2, "pencil look")?;
    let detail = knob(detail, "detail")?;
    let p = pencil::view(
        work,
        u32::from(pick(mask, 1, 255, "pencil set")?),
        detail,
        look,
    )?;
    Ok((opaque(&p.image), p.tones, p.shares))
}

/// The grid (and thirds) lines alone, clear everywhere else. `width` is the line width, 1 to 16
/// px at a long side of 2048; `group` is 2 or 4, the cells each way between two heavy lines;
/// `color` is one sRGB color as `0xRRGGBB`, or [`GRID_CONTRAST`] for lines in the complement of
/// the photo under them. `center` 1 puts the rows in the middle, 0 starts them at the top.
///
/// # Errors
/// A number out of range.
pub fn grid_layer(
    work: &Rgb,
    mode: u32,
    cells: u32,
    width: u32,
    group: u32,
    color: u32,
    center: u32,
) -> Result<Layer> {
    let work = image(work, 3, "work")?;
    let mode = pick(mode, 0, 2, "grid mode")?;
    let cells = usize::from(pick(cells, 3, 50, "cells")?);
    let width = usize::from(pick(width, 1, 16, "grid width")?);
    let group = usize::from(pick(group, 2, 4, "grid group")?);
    let center = pick(center, 0, 1, "grid center")? == 1;
    Ok(Layer {
        width: work.width,
        height: work.height,
        rgba: grid::layer(work, mode, cells, width, group, color, center)?,
    })
}

#[cfg(test)]
mod tests {
    use super::masses_level;

    #[test]
    fn test_masses_start_amount_is_mid() {
        let levels = [0.0, 49.0, 50.0, 67.0, 84.0, 85.0, 100.0].map(masses_level);
        assert_eq!(levels, [0, 0, 1, 1, 1, 2, 2]);
    }
}
