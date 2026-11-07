//! The Grid layer: the rule of thirds, a grid or both, as lines on a clear picture.
//!
//! The lines cover the whole photo at its own size: nothing is cropped. The thirds are two
//! lines across and two down. The grid has exactly `cells` squares across the width, the same
//! square size down the height, a heavier line round each block of 2 x 2 or 4 x 4 cells and no
//! labels. Without `center` the squares start at the top left corner. With `center` a heavy
//! line runs through the middle of the photo each way and the squares grow out from there, so
//! the part squares sit at all four edges, the same on both sides. Both draws the grid and the
//! thirds on top, as heavy lines. The line width is a knob.
//!
//! Every line is one color, with no halo: a color picked in the app, or [`CONTRAST`], where each
//! pixel of a line takes the complement of the photo round it (the `OKLab` hue turned half way
//! round, dark on a light patch and light on a dark one). A line thinner than 1 px is drawn 1 px
//! wide and see-through in step, so the thinnest lines stay thin on screen.
//!
//! Same input, same bytes: integer line positions, no antialiasing.

use crate::error::{Error, Result};
use crate::filters::box_mean;
use crate::img::Rgb;
use crate::oklab::{self, Ok3};

/// The cell counts across the long side the grid takes, in slider order (`GRID_CELLS` in
/// `app/web/src/settings.ts`).
pub const CELL_STEPS: [usize; 13] = [3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40, 50];
/// The widest line, in px at a long side of 2048, so 1 is half a px on the 1024 px screen
/// picture (`GRID_WIDTH_MAX` in `app/web/src/settings.ts`).
pub const MAX_WIDTH: usize = 16;
/// A heavy line closes a block of this many cells each way, 2 x 2 or 4 x 4 (`GRID_GROUPS` in
/// `app/web/src/settings.ts`).
pub const GROUPS: [usize; 2] = [2, 4];
/// The color value that asks for Contrast lines; 0 to `0xFFFFFF` is one sRGB color as
/// `0xRRGGBB` (`GRID_CONTRAST` in `app/web/src/settings.ts`).
pub const CONTRAST: u32 = 1 << 24;
/// A patch with an `OKLab` L above this gets a dark Contrast line, else a light one. It is where
/// the dark and the light line read equally well on a gray.
const CONTRAST_SPLIT: f32 = 0.56;
/// The `OKLab` L of a dark and of a light Contrast line.
const CONTRAST_DARK: f32 = 0.2;
const CONTRAST_LIGHT: f32 = 0.95;
/// The patch a Contrast line reads its photo color from: a box of this radius, in px at a long
/// side of 1024 (never under 2 px).
const CONTRAST_REACH: usize = 8;

/// `n * d / div` rounded to the nearest integer, in u64 so it cannot overflow.
fn scaled(n: u64, d: u64, div: u64) -> usize {
    ((n * d + div / 2) / div) as usize
}

/// How one kind of line is drawn: `px` wide, with this alpha (255 is opaque).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Line {
    px: usize,
    alpha: u8,
}

/// A line `n / 256` px wide: rounded to whole px from 1 px up, and under 1 px drawn 1 px
/// wide with the alpha of its share of a px.
fn line_of(n: u64) -> Line {
    if n >= 256 {
        Line {
            px: scaled(n, 1, 256),
            alpha: 255,
        }
    } else {
        Line {
            px: 1,
            alpha: scaled(n, 255, 256).max(1) as u8,
        }
    }
}

/// Raises the alpha of a pixel to `a` (never lowers it).
fn mark(mask: &mut [u8], i: usize, a: u8) {
    mask[i] = mask[i].max(a);
}

/// The line positions along a side of `len` px for squares of `w / cells` px. Each is a pair of
/// the position and the line count from the line the heavy lines count from: the start of the
/// side, or with `center` the line through its middle (counted both ways). The ends of the side
/// are not lines. Integers only: line `j` is at `(len cells + 2 j w) / (2 cells)`, rounded down,
/// with `center` (so the middle line is on pixel `len / 2`) and at `(2 j w + cells) / (2 cells)`
/// without.
fn line_spots(len: usize, w: usize, cells: usize, center: bool) -> Vec<(usize, usize)> {
    let (len, w, cells) = (len as i64, w as i64, cells as i64);
    let (mid, round) = if center { (len * cells, 0) } else { (0, cells) };
    // no more than `len` lines fit each way, so the range ends
    let reach = if center { len } else { 0 };
    (-reach..=len)
        .filter_map(|j| {
            let num = mid + 2 * j * w + round;
            let at = num.div_euclid(2 * cells);
            (num >= 0 && at > 0 && at + 1 < len).then_some((at as usize, j.unsigned_abs() as usize))
        })
        .collect()
}

/// The alpha mask of the grid on a `size` picture: `cells` squares across the width, `thin`
/// lines and on every `group`th line `heavy`. Every line spans the whole picture.
fn grid_mask(
    size: (usize, usize),
    cells: usize,
    thin: Line,
    heavy: Line,
    group: usize,
    center: bool,
) -> Vec<u8> {
    let (w, h) = size;
    let mut mask = vec![0u8; w * h];
    let line_at = |k: usize| if k.is_multiple_of(group) { heavy } else { thin };
    for (at, k) in line_spots(w, w, cells, center) {
        let l = line_at(k);
        let x0 = at.saturating_sub(l.px / 2);
        for y in 0..h {
            for x in x0..(x0 + l.px).min(w) {
                mark(&mut mask, y * w + x, l.alpha);
            }
        }
    }
    for (at, k) in line_spots(h, w, cells, center) {
        let l = line_at(k);
        let y0 = at.saturating_sub(l.px / 2);
        for y in y0..(y0 + l.px).min(h) {
            for x in 0..w {
                mark(&mut mask, y * w + x, l.alpha);
            }
        }
    }
    mask
}

/// Marks a `l.px` by `l.px` square whose top left corner is `(x - px / 2, y - px / 2)`.
fn dot(mask: &mut [u8], size: (usize, usize), at: (i64, i64), l: Line) {
    let (w, h) = (size.0 as i64, size.1 as i64);
    let half = (l.px / 2) as i64;
    for y in (at.1 - half).max(0)..(at.1 - half + l.px as i64).min(h) {
        for x in (at.0 - half).max(0)..(at.0 - half + l.px as i64).min(w) {
            mark(mask, (y * w + x) as usize, l.alpha);
        }
    }
}

/// A line from `a` to `b` (Bresenham, integers only) drawn with an `l` brush.
fn segment(mask: &mut [u8], size: (usize, usize), a: (i64, i64), b: (i64, i64), l: Line) {
    let (dx, dy) = ((b.0 - a.0).abs(), -(b.1 - a.1).abs());
    let (sx, sy) = (
        if a.0 < b.0 { 1 } else { -1 },
        if a.1 < b.1 { 1 } else { -1 },
    );
    let (mut x, mut y, mut err) = (a.0, a.1, dx + dy);
    loop {
        dot(mask, size, (x, y), l);
        if (x, y) == b {
            break;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x += sx;
        }
        if e2 <= dx {
            err += dx;
            y += sy;
        }
    }
}

/// The rule of thirds into `mask`: two lines across and two down, corner to corner.
fn thirds_into(mask: &mut [u8], size: (usize, usize), l: Line) {
    let (w, h) = size;
    let (last_x, last_y) = (w as i64 - 1, h as i64 - 1);
    for num in [1, 2] {
        let x = scaled(w as u64, num, 3) as i64;
        let y = scaled(h as u64, num, 3) as i64;
        segment(mask, size, (x, 0), (x, last_y), l);
        segment(mask, size, (0, y), (last_x, y), l);
    }
}

/// The Contrast line color on a patch of `bg`: the hue turned half way round (a and b negated)
/// and the lightness dark on a light patch, light on a dark one.
fn complement(bg: Ok3) -> [u8; 3] {
    let l = if bg[0] > CONTRAST_SPLIT {
        CONTRAST_DARK
    } else {
        CONTRAST_LIGHT
    };
    oklab::to_srgb([l, -bg[1], -bg[2]])
}

/// The mean `OKLab` L, a and b of the patch round every pixel, one plane each. Each input plane is
/// dropped once it is blurred, which lowers the peak of memory on a 4096 px picture.
fn patch_means(work: &Rgb) -> [Vec<f32>; 3] {
    let (w, h) = (work.width, work.height);
    let reach = scaled(w.max(h) as u64, CONTRAST_REACH as u64, 1024).max(2);
    let mut planes = [(); 3].map(|()| Vec::with_capacity(w * h));
    for p in work.data.chunks_exact(3) {
        for (plane, v) in planes.iter_mut().zip(oklab::from_srgb([p[0], p[1], p[2]])) {
            plane.push(v);
        }
    }
    planes.map(|plane| box_mean(&plane, w, h, reach))
}

/// What [`layer`] draws with.
struct Setup {
    size: (usize, usize),
    thin: Line,
    heavy: Line,
}

/// The checks and the numbers [`layer`] needs: the size and the thin and heavy lines.
fn setup(
    work: &Rgb,
    mode: u8,
    cells: usize,
    width: usize,
    group: usize,
    color: u32,
) -> Result<Setup> {
    work.require_work()?;
    if mode >= 3 {
        return Err(Error::bad("guides mode must be 0 to 2"));
    }
    if !CELL_STEPS.contains(&cells) {
        return Err(Error::bad(
            "cells must be 3, 4, 6, 8, 9, 10, 12, 18, 20, 24, 30, 40 or 50",
        ));
    }
    if !(1..=MAX_WIDTH).contains(&width) {
        return Err(Error::bad("grid width must be 1 to 16"));
    }
    if !GROUPS.contains(&group) {
        return Err(Error::bad("grid group must be 2 or 4"));
    }
    if color > CONTRAST {
        return Err(Error::bad("grid color must be 0xRRGGBB or Contrast"));
    }
    let size = (work.width, work.height);
    // `width` px at a long side of 2048, in steps of 1/256 px, so a bigger picture keeps the look
    // of the screen
    let n = (size.0.max(size.1) * width) as u64 / 8;
    Ok(Setup {
        size,
        thin: line_of(n),
        heavy: line_of(2 * n),
    })
}

/// The guide lines on a clear RGBA picture of the work size. `mode` 0 draws the thirds, 1 the grid
/// of exactly `cells` squares across the width (rows from the top, or with `center` in the
/// middle), 2 both (the grid, and the thirds on top as heavy
/// lines). A line is `width * long / 2048` px wide, where `long` is the long side (see the module
/// comment for lines under 1 px), and the line after every `group` cells is twice that. `color`
/// is `0xRRGGBB` or [`CONTRAST`]. A pixel is clear (alpha 0) exactly where no line reaches.
///
/// # Errors
/// [`Error::BadInput`] for a mode of 3 or more, `cells` not in [`CELL_STEPS`], `width` outside 1
/// to [`MAX_WIDTH`], `group` not in [`GROUPS`], `color` above [`CONTRAST`], or an image that is not
/// RGB.
pub fn layer(
    work: &Rgb,
    mode: u8,
    cells: usize,
    width: usize,
    group: usize,
    color: u32,
    center: bool,
) -> Result<Vec<u8>> {
    let Setup { size, thin, heavy } = setup(work, mode, cells, width, group, color)?;
    let mask = if mode == 0 {
        let mut m = vec![0u8; size.0 * size.1];
        thirds_into(&mut m, size, thin);
        m
    } else {
        let mut m = grid_mask(size, cells, thin, heavy, group, center);
        if mode == 2 {
            thirds_into(&mut m, size, heavy);
        }
        m
    };
    // Contrast colors are worked out on the line pixels only
    let means = (color == CONTRAST).then(|| patch_means(work));
    let one = color.to_be_bytes();
    let mut out = vec![0u8; size.0 * size.1 * 4];
    for (i, (px, &a)) in out.chunks_exact_mut(4).zip(&mask).enumerate() {
        if a > 0 {
            let c = means
                .as_ref()
                .map_or([one[1], one[2], one[3]], |[l, ca, cb]| {
                    complement([l[i], ca[i], cb[i]])
                });
            px.copy_from_slice(&[c[0], c[1], c[2], a]);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::img::Image;

    /// The picked color the tests draw with.
    const RED: [u8; 3] = [230, 30, 30];
    const RED_RGB: u32 = 0x00E6_1E1E;

    /// The layer laid over the photo, by the "over" rule: the picture the grid shows, in red at
    /// width 8 (1 to 2 px on these small photos) and group 2 x 2.
    fn view(work: &Rgb, mode: u8, cells: usize) -> Result<Rgb> {
        Ok(over(work, &layer(work, mode, cells, 8, 2, RED_RGB, false)?))
    }

    fn over(work: &Rgb, layer: &[u8]) -> Rgb {
        let mut out = work.clone();
        for (px, l) in out.data.chunks_exact_mut(3).zip(layer.chunks_exact(4)) {
            let a = u32::from(l[3]);
            for (v, &t) in px.iter_mut().zip(&l[..3]) {
                *v = ((u32::from(*v) * (255 - a) + u32::from(t) * a + 127) / 255) as u8;
            }
        }
        out
    }

    fn flat(w: usize, h: usize, v: u8) -> Rgb {
        Image::filled(w, h, &[v, v, v])
    }

    /// The pixels a layer covers.
    fn ink(layer: &[u8]) -> usize {
        layer.chunks_exact(4).filter(|p| p[3] > 0).count()
    }

    /// The number of runs of pixels that differ from `v`, along a row (`along_x`) or a column.
    fn runs(img: &Rgb, v: u8, at: usize, along_x: bool) -> usize {
        let len = if along_x { img.width } else { img.height };
        let mut n = 0;
        let mut inside = false;
        for i in 0..len {
            let p = if along_x {
                img.pixel(i, at)
            } else {
                img.pixel(at, i)
            };
            let on = p[0] != v;
            if on && !inside {
                n += 1;
            }
            inside = on;
        }
        n
    }

    /// The WCAG relative luminance of an sRGB color.
    fn luminance(c: [u8; 3]) -> f64 {
        let lin = |v: u8| {
            let s = f64::from(v) / 255.0;
            if s <= 0.04045 {
                s / 12.92
            } else {
                ((s + 0.055) / 1.055).powf(2.4)
            }
        };
        0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
    }

    /// The WCAG contrast ratio of two colors, 1 to 21.
    fn wcag(a: [u8; 3], b: [u8; 3]) -> f64 {
        let (la, lb) = (luminance(a), luminance(b));
        (la.max(lb) + 0.05) / (la.min(lb) + 0.05)
    }

    #[test]
    fn test_thirds_line_width_follows_the_size() {
        // width 4 is 1 px at 512 and 2 px at 1024: count the line pixels on the top row
        let row = |w: usize, h: usize| {
            ink(&layer(&flat(w, h, 120), 0, 6, 4, 2, RED_RGB, false).unwrap()[..w * 4])
        };
        assert_eq!((row(512, 256), row(1024, 512)), (2, 4));
    }

    #[test]
    fn test_a_picked_color_is_the_only_color() {
        let out = layer(&flat(240, 180, 120), 2, 8, 4, 2, 0x0012_3456, false).unwrap();
        assert!(ink(&out) > 0);
        for p in out.chunks_exact(4).filter(|p| p[3] > 0) {
            assert_eq!(&p[..3], &[0x12, 0x34, 0x56]);
        }
    }

    #[test]
    fn test_contrast_lines_follow_the_photo() {
        // the left half dark, the right half light: a line is light on the left, dark on the right
        let mut work = flat(240, 120, 20);
        for y in 0..120 {
            for x in 120..240 {
                work.data[(y * 240 + x) * 3..][..3].copy_from_slice(&[230; 3]);
            }
        }
        let out = layer(&work, 1, 8, 8, 2, CONTRAST, false).unwrap();
        let at = |x: usize, y: usize| &out[(y * 240 + x) * 4..][..4];
        // the horizontal line at 30 px down, far from the middle
        assert!(at(20, 30)[3] > 0 && at(220, 30)[3] > 0);
        assert!(at(20, 30)[0] > 200, "light line on dark: {:?}", at(20, 30));
        assert!(at(220, 30)[0] < 60, "dark line on light: {:?}", at(220, 30));
        assert_eq!(at(20, 20)[3], 0, "clear off the lines");
    }

    #[test]
    fn test_contrast_color_reads_on_any_photo() {
        // the line against the photo under it: at least 3 to 1 (the WCAG bar for graphics) on
        // every gray and on a few saturated colors, and the hue is the opposite one
        let mut photos: Vec<[u8; 3]> = (0..=255).map(|v| [v as u8; 3]).collect();
        photos.extend([[200, 30, 30], [30, 160, 60], [40, 70, 220], [240, 220, 40]]);
        let mut least = f64::MAX;
        for p in photos {
            least = least.min(wcag(complement(oklab::from_srgb(p)), p));
        }
        println!("least contrast {least:.2}");
        assert!(least >= 3.0, "contrast {least}");
        let on_red = oklab::from_srgb(complement(oklab::from_srgb([200, 30, 30])));
        assert!(on_red[1] < 0.0, "the line on red leans green: {on_red:?}");
        let on_blue = oklab::from_srgb(complement(oklab::from_srgb([40, 70, 220])));
        assert!(
            on_blue[2] > 0.0,
            "the line on blue leans yellow: {on_blue:?}"
        );
    }

    #[test]
    fn test_view_thirds_lines_at_thirds() {
        // a square photo: the whole photo, not a crop
        let out = view(&flat(300, 300, 120), 0, 8).unwrap();
        assert_eq!((out.width, out.height), (300, 300));
        assert_eq!(out.pixel(100, 10), &RED);
        assert_eq!(out.pixel(200, 10), &RED);
        assert_eq!(out.pixel(50, 10), &[120; 3]);
        assert_eq!(out.pixel(100, 100), &RED);
        assert_eq!(out.pixel(50, 200), &RED);
        assert_eq!(out.pixel(50, 150), &[120; 3]);
        // two lines across, two down, one pixel wide, crossing twice each
        let marked = out.data.chunks_exact(3).filter(|p| p == &RED).count();
        assert_eq!(marked, 2 * 300 + 2 * 300 - 4);
    }

    #[test]
    fn test_view_grid_cells_count() {
        let work = flat(480, 360, 120);
        for cells in [4, 8, 12] {
            let out = view(&work, 1, cells).unwrap();
            assert_eq!((out.width, out.height), (480, 360));
            // a row and a column away from the lines: cells - 1 lines across, 3 * cells / 4 - 1 down
            assert_eq!(runs(&out, 120, 7, true), cells - 1, "across, {cells} cells");
            assert_eq!(
                runs(&out, 120, 7, false),
                cells * 3 / 4 - 1,
                "down, {cells} cells"
            );
        }
        // the line after every 2 or 4 cells is heavier, never the third
        let (thin, heavy) = (line_of(256), line_of(512));
        for (group, at_heavy) in [(2, 80), (4, 160)] {
            let mask = grid_mask((480, 360), 12, thin, heavy, group, false);
            let width_at = |x: usize| {
                (x.saturating_sub(4)..x + 4)
                    .filter(|&i| mask[7 * 480 + i] > 0)
                    .count()
            };
            assert_eq!(width_at(40), 1, "group {group}");
            assert_eq!(width_at(120), 1, "group {group}");
            assert_eq!(width_at(at_heavy), 2, "group {group}");
        }
    }

    #[test]
    fn test_line_width_follows_the_knob() {
        // `width` px at a long side of 2048, scaled with the long side
        for width in 1..=MAX_WIDTH {
            let at = |w: usize, h: usize| setup(&flat(w, h, 120), 1, 6, width, 2, 0).unwrap();
            let big = at(2048, 1024);
            assert_eq!(
                big.thin,
                Line {
                    px: width,
                    alpha: 255
                },
                "width {width} at 2048"
            );
            assert_eq!(big.heavy.px, 2 * width, "width {width} at 2048");
            assert!(at(100, 80).thin.px >= 1, "width {width} at 100");
        }
        // under 1 px: 1 px and see-through in step; the thinnest line on the screen picture
        let screen = |width| {
            setup(&flat(1024, 768, 120), 1, 6, width, 2, 0)
                .unwrap()
                .thin
        };
        assert_eq!(screen(1), Line { px: 1, alpha: 128 });
        assert_eq!(screen(2), Line { px: 1, alpha: 255 });
        assert_eq!(screen(4), Line { px: 2, alpha: 255 });
        let ink_at = |width| ink(&layer(&flat(512, 384, 120), 1, 8, width, 2, 0, false).unwrap());
        assert!(ink_at(12) > ink_at(4), "a wider line covers more");
    }

    #[test]
    fn test_view_both_has_heavy_thirds() {
        let work = flat(480, 360, 120);
        let both = layer(&work, 2, 8, 8, 2, RED_RGB, false).unwrap();
        let grid = layer(&work, 1, 8, 8, 2, RED_RGB, false).unwrap();
        assert!(ink(&both) > ink(&grid));
        // the grid lines are still there, and the two thirds lines across
        assert_eq!(runs(&over(&work, &both), 120, 7, true), 7 + 2);
    }

    #[test]
    fn test_view_covers_the_whole_photo() {
        // The picture keeps its size and every line runs edge to edge.
        for (w, h) in [(401, 299), (299, 401), (360, 360)] {
            let work = flat(w, h, 100);
            for mode in 0..3 {
                let out = view(&work, mode, 6).unwrap();
                assert_eq!((out.width, out.height), (w, h), "mode {mode}");
            }
            // thirds: the first vertical line touches the top and the bottom row
            let x = scaled(w as u64, 1, 3);
            let thirds = view(&work, 0, 6).unwrap();
            assert_ne!(thirds.pixel(x, 0), &[100; 3], "{w} x {h} top");
            assert_ne!(thirds.pixel(x, h - 1), &[100; 3], "{w} x {h} bottom");
            // grid: a horizontal line touches the left and the right column
            let grid = view(&work, 1, 6).unwrap();
            let y = (w + 3) / 6;
            assert_ne!(grid.pixel(0, y), &[100; 3], "{w} x {h} left");
            assert_ne!(grid.pixel(w - 1, y), &[100; 3], "{w} x {h} right");
        }
    }

    #[test]
    fn test_view_bad_cells() {
        let work = flat(120, 90, 100);
        for cells in [0, 2, 5, 7, 11, 13, 14, 16, 25, 60, 100] {
            assert!(view(&work, 1, cells).is_err(), "{cells} cells");
            assert!(view(&work, 0, cells).is_err(), "{cells} cells, thirds");
        }
        for cells in CELL_STEPS {
            assert!(view(&work, 1, cells).is_ok(), "{cells} cells");
        }
        assert!(view(&work, 3, 8).is_err());
        for width in [0, 17, 100] {
            assert!(
                layer(&work, 1, 8, width, 2, 0, false).is_err(),
                "width {width}"
            );
        }
        for group in [0, 1, 3, 5, 8] {
            assert!(
                layer(&work, 1, 8, 2, group, 0, false).is_err(),
                "group {group}"
            );
        }
        assert!(layer(&work, 1, 8, 2, 2, CONTRAST, false).is_ok());
        for color in [CONTRAST + 1, u32::MAX] {
            assert!(
                layer(&work, 1, 8, 2, 2, color, false).is_err(),
                "color {color}"
            );
        }
        assert!(view(&Image::<u8>::filled(2, 2, &[1]), 1, 8).is_err());
        assert!(view(&Image::<u8>::new(0, 0, 3), 1, 8).is_err());
    }

    #[test]
    fn test_cells_fit_the_width_exactly() {
        // a tall photo: 18 cells across the width are 18 whole squares, 17 lines, none cut
        let work = flat(360, 480, 120);
        let out = view(&work, 1, 18).unwrap();
        assert_eq!(runs(&out, 120, 7, true), 17, "across");
        let spots: Vec<usize> = line_spots(360, 360, 18, false)
            .iter()
            .map(|s| s.0)
            .collect();
        assert_eq!(spots.len(), 17);
        assert!(
            spots.iter().enumerate().all(|(i, &x)| x == 20 * (i + 1)),
            "{spots:?}"
        );
    }

    #[test]
    fn test_center_puts_a_heavy_line_in_the_middle() {
        // 300 x 210, 9 cells of 33.3 px: with center a line with count 0 (a heavy one) runs
        // through the middle each way, and the lines sit the same on both sides of it
        for (len, cells) in [(300, 9), (210, 9), (300, 18), (211, 12)] {
            let spots = line_spots(len, 300, cells, true);
            let zero: Vec<usize> = spots.iter().filter(|s| s.1 == 0).map(|s| s.0).collect();
            assert_eq!(zero, vec![len / 2], "{len} px, {cells} cells");
            for &(at, k) in &spots {
                assert!(
                    spots
                        .iter()
                        .any(|&(b, m)| m == k && (at + b).abs_diff(len) <= 1),
                    "{len} px, {cells} cells: line {k} at {at} has no twin"
                );
            }
        }
        // without center the squares start at the top left: the first line is one square in
        assert_eq!(line_spots(210, 300, 9, false)[0], (33, 1));
        // an even count still fills the width exactly with center on
        assert_eq!(
            line_spots(300, 300, 18, true).len(),
            line_spots(300, 300, 18, false).len()
        );
    }
}
