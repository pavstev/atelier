//! The Grid layer: squares by count across the width, as lines on a clear picture.
//!
//! The lines cover the whole photo at its own size: nothing is cropped. The grid has `milli /
//! 1000` squares across the width (a count in thousandths, so a grid of whole cm on a paper is a
//! count like 7.5), the same square size down the height, and no labels. The squares start at the
//! top left corner, so a count that is not whole leaves a part square at the right and the
//! bottom. Every line is as wide as [`LINE_WIDTH`] says, all alike: no heavy lines, no thirds.
//!
//! Every line is a Contrast line: each pixel of it takes the hue of the photo round it turned half
//! way round (`OKLab`), in black or white. The tone, dark on a light patch and light on a dark one,
//! is held along a line: it turns only where the smoothed patch lightness leaves a band round the
//! split. A line thinner than 1 px is drawn 1 px wide and see-through in step, so the thinnest
//! lines stay thin on screen.
//!
//! Same input, same bytes: integer line positions, no antialiasing.

use crate::error::{Error, Result};
use crate::filters::box_mean;
use crate::img::Rgb;
use crate::oklab::{self, Ok3};

/// Thousandths in one square: the count of a grid is `squares * MILLI`.
const MILLI: usize = 1000;
/// The fewest and the most squares across the width a count takes, in thousandths: 0.1 to
/// 500 squares (`GRID_MILLI_MIN` and `GRID_MILLI_MAX` in `app/web/src/features/size/paper.ts`).
/// A grid of cm on a paper needs a count that is not whole, e.g. 30 cm in steps of 4 cm is 7.5.
const MILLI_MIN: usize = 100;
const MILLI_MAX: usize = 500_000;
/// The line width, in px at a long side of 2048, so 2 is 1 px on the 1024 px screen picture.
const LINE_WIDTH: usize = 2;
/// A patch with an `OKLab` L above this gets a dark Contrast line, else a light one. It is where
/// the dark and the light line read equally well on a gray.
const CONTRAST_SPLIT: f32 = 0.5;
/// The `OKLab` L of a dark and of a light Contrast line.
const CONTRAST_DARK: f32 = 0.0;
const CONTRAST_LIGHT: f32 = 1.0;
/// The patch a Contrast line reads its photo color from: a box of this radius, in px at a long
/// side of 1024 (never under 2 px).
const CONTRAST_REACH: usize = 8;
/// A Contrast line turns dark or light only when the patch lightness leaves this band round
/// [`CONTRAST_SPLIT`].
const CONTRAST_HOLD: f32 = 0.05;

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

/// The line positions along a side of `len` px for squares of `w / cells` px, where `milli` is
/// `cells` in thousandths (a whole count is `1000 * cells`). The ends of the side are not lines.
/// Integers only: line `j` is at `(2000 j w + m) / (2 m)`, rounded down, where `m` is `milli`.
/// For a whole count this is the same position as `(2 j w + c) / (2 c)`.
fn line_spots(len: usize, w: usize, milli: usize) -> Vec<usize> {
    let (len, w, m) = (len as i64, w as i64, milli as i64);
    // no more than `len` lines fit, so the range ends
    (1..=len)
        .map(|j| (2 * MILLI as i64 * j * w + m) / (2 * m))
        .filter(|&at| at > 0 && at + 1 < len)
        .map(|at| at as usize)
        .collect()
}

/// The alpha mask of the grid on a `size` picture: `milli / 1000` squares across the width, every
/// line `line` wide. Every line spans the whole picture.
fn grid_mask(size: (usize, usize), milli: usize, line: Line) -> Vec<u8> {
    let (w, h) = size;
    let mut mask = vec![0u8; w * h];
    for at in line_spots(w, w, milli) {
        let x0 = at.saturating_sub(line.px / 2);
        for y in 0..h {
            for x in x0..(x0 + line.px).min(w) {
                mark(&mut mask, y * w + x, line.alpha);
            }
        }
    }
    for at in line_spots(h, w, milli) {
        let y0 = at.saturating_sub(line.px / 2);
        for y in y0..(y0 + line.px).min(h) {
            for x in 0..w {
                mark(&mut mask, y * w + x, line.alpha);
            }
        }
    }
    mask
}

/// The Contrast line color on a patch of `bg`: the hue turned half way round (a and b negated)
/// and the lightness `dark` or light.
fn complement(bg: Ok3, dark: bool) -> [u8; 3] {
    let l = if dark { CONTRAST_DARK } else { CONTRAST_LIGHT };
    oklab::to_srgb([l, -bg[1], -bg[2]])
}

/// Where the line pixels of one picture run along one axis: `lines` rows (or columns) of `len`
/// pixels, the pixel `pos` of line `line` at `line * line_step + pos * pos_step`.
struct Axis {
    lines: usize,
    len: usize,
    line_step: usize,
    pos_step: usize,
}

impl Axis {
    fn at(&self, line: usize, pos: usize) -> usize {
        line * self.line_step + pos * self.pos_step
    }

    /// For every line pixel, the length of the run of line pixels it sits in along this axis
    /// (0 off the lines).
    fn run_lengths(&self, mask: &[u8]) -> Vec<u32> {
        let mut out = vec![0u32; mask.len()];
        for line in 0..self.lines {
            let mut pos = 0;
            while pos < self.len {
                if mask[self.at(line, pos)] == 0 {
                    pos += 1;
                    continue;
                }
                let start = pos;
                while pos < self.len && mask[self.at(line, pos)] > 0 {
                    pos += 1;
                }
                for p in start..pos {
                    out[self.at(line, p)] = (pos - start) as u32;
                }
            }
        }
        out
    }
}

/// `v` with each value the mean of the values within `reach` of it (fewer at the ends).
fn smooth(v: &[f32], reach: usize) -> Vec<f32> {
    let mut sums = vec![0.0f32];
    for x in v {
        sums.push(sums.last().copied().unwrap_or(0.0) + x);
    }
    (0..v.len())
        .map(|i| {
            let (a, b) = (i.saturating_sub(reach), (i + reach + 1).min(v.len()));
            (sums[b] - sums[a]) / (b - a) as f32
        })
        .collect()
}

/// Dark or light along a run of patch lightness `v`, with a hold: the tone only turns when `v`
/// leaves the band of [`CONTRAST_HOLD`] round [`CONTRAST_SPLIT`], so a value that wobbles about
/// the split does not flip it. The start takes the side of the split.
fn hold_tone(v: &[f32]) -> Vec<bool> {
    let mut dark = v.first().is_some_and(|&x| x > CONTRAST_SPLIT);
    v.iter()
        .map(|&x| {
            if x > CONTRAST_SPLIT + CONTRAST_HOLD {
                dark = true;
            } else if x < CONTRAST_SPLIT - CONTRAST_HOLD {
                dark = false;
            }
            dark
        })
        .collect()
}

/// The tone of each line segment on one axis: a segment is a run of one line between two crossings
/// (a thick line is its rows together), so the whole of it is dark or light, never both. It is dark
/// when the patch lightness `l` under it is high on the whole. A crossing takes the tone of the
/// segment before it on the horizontal axis. Pixels of no segment keep what `dark` holds.
fn segment_tones(
    ax: &Axis,
    runs: (&[u32], &[u32]),
    long: u32,
    mask: &[u8],
    l: &[f32],
    dark: &mut [bool],
) {
    let smooth_reach = (long / 8) as usize;
    let (along, across) = runs;
    let is_seg = |i: usize| mask[i] > 0 && along[i] >= long && across[i] < long;
    // (line, first pos, last pos + 1, group)
    let mut segs: Vec<(usize, usize, usize, usize)> = Vec::new();
    // per group: the first pos, and per pos the sum of `l` over the rows and their count
    let mut groups: Vec<(usize, Vec<f32>, Vec<u32>)> = Vec::new();
    let mut prev_from = 0;
    for line in 0..ax.lines {
        let from = segs.len();
        let mut pos = 0;
        while pos < ax.len {
            if !is_seg(ax.at(line, pos)) {
                pos += 1;
                continue;
            }
            let start = pos;
            while pos < ax.len && is_seg(ax.at(line, pos)) {
                pos += 1;
            }
            let twin = segs[prev_from..from]
                .iter()
                .find(|s| s.0 + 1 == line && s.1 == start && s.2 == pos)
                .map(|s| s.3);
            let group = twin.unwrap_or_else(|| {
                groups.push((start, vec![0.0; pos - start], vec![0; pos - start]));
                groups.len() - 1
            });
            for p in start..pos {
                groups[group].1[p - start] += l[ax.at(line, p)];
                groups[group].2[p - start] += 1;
            }
            segs.push((line, start, pos, group));
        }
        prev_from = from;
    }
    let tones: Vec<Vec<bool>> = groups
        .iter()
        .map(|(_, sum, n)| {
            let mean: Vec<f32> = sum.iter().zip(n).map(|(s, &n)| s / n as f32).collect();
            hold_tone(&smooth(&mean, smooth_reach))
        })
        .collect();
    for &(line, start, end, group) in &segs {
        for p in start..end {
            dark[ax.at(line, p)] = tones[group][p - start];
        }
    }
    // a crossing keeps the tone of the line it cuts
    for line in 0..ax.lines {
        let mut last = None;
        for pos in 0..ax.len {
            let i = ax.at(line, pos);
            if is_seg(i) {
                last = Some(dark[i]);
            } else if mask[i] > 0
                && along[i] >= long
                && across[i] >= long
                && let Some(t) = last
            {
                dark[i] = t;
            }
        }
    }
}

/// For every pixel of a line: is the Contrast line dark there? One tone per segment of a line,
/// worked out from the mean patch lightness `l` under it (see [`segment_tones`]).
fn line_tones(mask: &[u8], l: &[f32], size: (usize, usize)) -> Vec<bool> {
    let (w, h) = size;
    let mut dark: Vec<bool> = l.iter().map(|&v| v > CONTRAST_SPLIT).collect();
    let rows = Axis {
        lines: h,
        len: w,
        line_step: w,
        pos_step: 1,
    };
    let cols = Axis {
        lines: w,
        len: h,
        line_step: 1,
        pos_step: w,
    };
    let (hrun, vrun) = (rows.run_lengths(mask), cols.run_lengths(mask));
    // shorter than a line is the cut through a line the other way (a line is under long / 64 px
    // thick)
    let long = ((w.max(h) / 16).max(8)) as u32;
    // the columns first: their crossings are then filled by the rows
    segment_tones(&cols, (&vrun, &hrun), long, mask, l, &mut dark);
    segment_tones(&rows, (&hrun, &vrun), long, mask, l, &mut dark);
    dark
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

/// `milli` as the count the grid takes: [`MILLI_MIN`] to [`MILLI_MAX`]. The one home of that
/// range.
///
/// # Errors
/// [`Error::BadInput`] for any other number.
pub fn milli_of(milli: u32) -> Result<usize> {
    let milli = milli as usize;
    if (MILLI_MIN..=MILLI_MAX).contains(&milli) {
        Ok(milli)
    } else {
        Err(Error::bad(
            "grid squares across must be 100 to 500000 thousandths",
        ))
    }
}

/// The line of a picture of this size: [`LINE_WIDTH`] px at a long side of 2048, in steps of 1/256
/// px, so a bigger picture keeps the look of the screen.
fn line_for(size: (usize, usize)) -> Line {
    line_of((size.0.max(size.1) * LINE_WIDTH) as u64 / 8)
}

/// The grid on a clear RGBA picture of the work size: `milli / 1000` squares across the width (see
/// the module comment), Contrast lines `LINE_WIDTH * long / 2048` px wide, where `long` is the
/// long side. A pixel is clear (alpha 0) exactly where no line reaches. `milli` comes from
/// [`milli_of`], and `work` is a checked RGB picture.
pub fn layer(work: &Rgb, milli: usize) -> Vec<u8> {
    let size = (work.width, work.height);
    let mask = grid_mask(size, milli, line_for(size));
    // Contrast colors are worked out on the line pixels only
    let m = patch_means(work);
    let dark = line_tones(&mask, &m[0], size);
    let mut out = vec![0u8; size.0 * size.1 * 4];
    for (i, (px, &a)) in out.chunks_exact_mut(4).zip(&mask).enumerate() {
        if a > 0 {
            let c = complement([m[0][i], m[1][i], m[2][i]], dark[i]);
            px.copy_from_slice(&[c[0], c[1], c[2], a]);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::img::Image;

    /// The layer of a flat photo or `work` with `cells` squares across the width.
    fn cells_layer(work: &Rgb, cells: usize) -> Vec<u8> {
        layer(work, cells * MILLI)
    }

    fn flat(w: usize, h: usize, v: u8) -> Rgb {
        Image::filled(w, h, &[v, v, v])
    }

    /// Is the pixel `(x, y)` of a layer `w` px wide on a line?
    fn lit(layer: &[u8], w: usize, x: usize, y: usize) -> bool {
        layer[(y * w + x) * 4 + 3] > 0
    }

    /// The number of runs of line pixels along a row (`along_x`) or a column.
    fn runs(layer: &[u8], (w, h): (usize, usize), at: usize, along_x: bool) -> usize {
        let len = if along_x { w } else { h };
        let mut n = 0;
        let mut inside = false;
        for i in 0..len {
            let on = if along_x {
                lit(layer, w, i, at)
            } else {
                lit(layer, w, at, i)
            };
            if on && !inside {
                n += 1;
            }
            inside = on;
        }
        n
    }

    /// Is the line dark on a patch of this color?
    fn dark_on(p: [u8; 3]) -> bool {
        oklab::from_srgb(p)[0] > CONTRAST_SPLIT
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
    fn test_line_width_follows_the_size() {
        // 2 px at a long side of 2048, so 1 px on the 1024 px screen picture and half see-through
        // at 512
        assert_eq!(line_for((2048, 1024)), Line { px: 2, alpha: 255 });
        assert_eq!(line_for((1024, 768)), Line { px: 1, alpha: 255 });
        assert_eq!(line_for((512, 384)), Line { px: 1, alpha: 128 });
        assert!(line_for((100, 80)).px >= 1);
        // a bigger picture has wider lines: count the line pixels on the top of a column
        let col = |w: usize, h: usize| {
            let out = cells_layer(&flat(w, h, 120), 6);
            (0..w).filter(|&x| lit(&out, w, x, 3)).count()
        };
        assert_eq!((col(1024, 512), col(2048, 1024)), (5, 10));
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
        let out = cells_layer(&work, 8);
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
            least = least.min(wcag(complement(oklab::from_srgb(p), dark_on(p)), p));
        }
        println!("least contrast {least:.2}");
        assert!(least >= 3.0, "contrast {least}");
        let red = [200, 30, 30];
        let on_red = oklab::from_srgb(complement(oklab::from_srgb(red), dark_on(red)));
        assert!(on_red[1] < 0.0, "the line on red leans green: {on_red:?}");
        let blue = [40, 70, 220];
        let on_blue = oklab::from_srgb(complement(oklab::from_srgb(blue), dark_on(blue)));
        assert!(
            on_blue[2] > 0.0,
            "the line on blue leans yellow: {on_blue:?}"
        );
    }

    #[test]
    fn test_grid_cells_count() {
        let work = flat(480, 360, 120);
        for cells in [4, 8, 12] {
            let out = cells_layer(&work, cells);
            assert_eq!(out.len(), 480 * 360 * 4);
            // a row and a column away from the lines: cells - 1 lines across, 3 * cells / 4 - 1 down
            let size = (480, 360);
            assert_eq!(
                runs(&out, size, 7, true),
                cells - 1,
                "across, {cells} cells"
            );
            assert_eq!(
                runs(&out, size, 7, false),
                cells * 3 / 4 - 1,
                "down, {cells} cells"
            );
        }
    }

    #[test]
    fn test_all_lines_are_alike() {
        // no heavy line: every line has the width of the first one, and nothing but the grid is
        // drawn (no thirds): the lit pixels of a row away from the lines are the vertical lines only
        let work = flat(480, 360, 120);
        let out = cells_layer(&work, 12);
        let width_at = |x: usize| (x - 4..x + 4).filter(|&i| lit(&out, 480, i, 7)).count();
        let line = line_for((480, 360));
        for x in [40, 80, 120, 160, 240] {
            assert_eq!(width_at(x), line.px, "line at {x}");
        }
        assert!(out.chunks_exact(4).all(|p| p[3] == 0 || p[3] == line.alpha));
        // 11 lines each way across the 480 wide, 8 down the 360 high: the thirds would add more
        let count = (0..480 * 360).filter(|&i| out[i * 4 + 3] > 0).count();
        assert_eq!(count, 11 * 360 + 8 * 480 - 11 * 8);
    }

    #[test]
    fn test_covers_the_whole_photo() {
        // The layer keeps the size and every line runs edge to edge.
        for (w, h) in [(401, 299), (299, 401), (360, 360)] {
            let out = cells_layer(&flat(w, h, 100), 6);
            assert_eq!(out.len(), w * h * 4, "{w} x {h}");
            // a vertical line touches the top and the bottom row
            let x = (0..w).find(|&x| lit(&out, w, x, 0)).expect("a line");
            assert!(lit(&out, w, x, h - 1), "{w} x {h} bottom");
            // a horizontal line touches the left and the right column
            let y = (0..h).find(|&y| lit(&out, w, 0, y)).expect("a line");
            assert!(lit(&out, w, w - 1, y), "{w} x {h} right");
        }
    }

    #[test]
    fn test_bad_milli() {
        for milli in [0, 1, 99, 500_001, u32::MAX] {
            assert!(milli_of(milli).is_err(), "{milli}");
        }
        for milli in [100, 7500, 500_000] {
            assert_eq!(milli_of(milli).unwrap(), milli as usize);
        }
    }

    #[test]
    fn test_cells_fit_the_width_exactly() {
        // a tall photo: 18 cells across the width are 18 whole squares, 17 lines, none cut
        let work = flat(360, 480, 120);
        let out = cells_layer(&work, 18);
        assert_eq!(runs(&out, (360, 480), 7, true), 17, "across");
        let spots = line_spots(360, 360, 18 * MILLI);
        assert_eq!(spots.len(), 17);
        assert!(
            spots.iter().enumerate().all(|(i, &x)| x == 20 * (i + 1)),
            "{spots:?}"
        );
    }

    #[test]
    fn test_squares_start_at_the_top_left() {
        // 9 squares across 300 px: the first line is one square in, and the rows use the same size
        assert_eq!(line_spots(210, 300, 9 * MILLI)[0], 33);
        // 7.5 squares of 40 px: the last square at the right is a half one, no line at the edge
        assert_eq!(
            line_spots(300, 300, 7500),
            [40, 80, 120, 160, 200, 240, 280]
        );
    }
}
