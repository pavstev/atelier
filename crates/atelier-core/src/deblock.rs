//! Block noise of small, heavily compressed JPEGs: finds the 8 px grid and calms it.
//!
//! A JPEG codes 8 x 8 blocks on their own, so a strong squeeze leaves small steps at the block
//! edges. [`grid_score`] compares the small steps on each of the eight column (and row) phases;
//! one phase that stands out from the others is the grid. [`calm`] gives back the photo as it is
//! when no grid shows. When one shows, it softens the steps across the block edges (a deblock
//! filter) and then smooths the flat areas a little, keeping the real edges. The work picture and the
//! edge map call it first. Same input, same bytes.

use std::borrow::Cow;

use crate::img::Rgb;
use crate::srgb::luma601;

/// The JPEG block size in px.
const BLOCK: usize = 8;
/// A step bigger than this (luma levels) is a real edge: it counts as this much in the finder, and
/// the deblock filter leaves it alone.
const STEP_CAP: f32 = 14.0;
/// The grid score from which a photo is blocky. A clean photo scores near 1.0, the squeezed photos of the bench 2.0 to 3.1.
const BLOCKY: f32 = 1.25;
/// The radius of the smooth in px.
const SMOOTH_R: usize = 3;
/// The Gaussian width of the smooth in px.
const SMOOTH_SPACE: f32 = 1.5;
/// The color distance (RGB, levels) at which a neighbor counts for a third of its place weight.
const SMOOTH_RANGE: f32 = 16.0;
/// The most columns or rows the finder looks at on each side of the grid, so a big photo costs the
/// same as a small one.
const MAX_LINES: usize = 4096;

/// The capped step between two neighbors.
fn capped(a: f32, b: f32) -> f64 {
    f64::from((a - b).abs().min(STEP_CAP))
}

/// For each of the eight phases, the median over its lines of the mean capped step on that line.
/// With `across_x` the steps are between columns `x` and `x + 1` (a line is one column `x`, the mean
/// runs over the rows); otherwise between rows. One long real edge is one line, so the median
/// ignores it. `None` when a phase has fewer than 4 lines to take a median of.
fn phase_medians(l: &[f32], w: usize, h: usize, across_x: bool) -> Option<[f64; BLOCK]> {
    let (lines, len) = if across_x { (w - 1, h) } else { (h - 1, w) };
    let stride = (len / MAX_LINES).max(1);
    let mut per_phase: Vec<Vec<f64>> = vec![Vec::new(); BLOCK];
    for line in 0..lines {
        let (mut sum, mut n) = (0f64, 0u32);
        for k in (0..len).step_by(stride) {
            let (i, j) = if across_x {
                (k * w + line, k * w + line + 1)
            } else {
                (line * w + k, (line + 1) * w + k)
            };
            sum += capped(l[i], l[j]);
            n += 1;
        }
        per_phase[line % BLOCK].push(sum / f64::from(n.max(1)));
    }
    if per_phase.iter().any(|v| v.len() < 4) {
        return None;
    }
    let mut out = [0f64; BLOCK];
    for (o, v) in out.iter_mut().zip(&mut per_phase) {
        v.sort_by(f64::total_cmp);
        *o = v[v.len() / 2];
    }
    Some(out)
}

/// How much the best phase stands out: its median step over the mean median of the other phases.
/// 1.0 when the other phases have no steps at all.
fn stand_out(med: &[f64; BLOCK]) -> f32 {
    let best = grid_phase(med);
    let rest: f64 = (0..BLOCK)
        .filter(|&p| p != best)
        .map(|p| med[p])
        .sum::<f64>()
        / (BLOCK - 1) as f64;
    if rest <= 1e-6 {
        return 1.0;
    }
    (med[best] / rest) as f32
}

/// The phase (0 to 7) of the grid on one axis: the one whose steps are the biggest.
fn grid_phase(med: &[f64; BLOCK]) -> usize {
    (0..BLOCK).fold(0, |best, p| if med[p] > med[best] { p } else { best })
}

/// The medians of both axes, columns first, or `None` for a photo too small or not RGB.
fn grid_medians(img: &Rgb) -> Option<([f64; BLOCK], [f64; BLOCK])> {
    let (w, h) = (img.width, img.height);
    if w < 4 * BLOCK || h < 4 * BLOCK || img.channels != 3 {
        return None;
    }
    let l = luma601(img);
    Some((
        phase_medians(&l, w, h, true)?,
        phase_medians(&l, w, h, false)?,
    ))
}

/// How blocky a photo is: 1.0 for no grid, more when the steps of one column phase (and one row
/// phase) of the 8 px grid are bigger than the rest. The finder uses the luma and caps every step,
/// and it takes the median over the lines of a phase, so a real edge does not count.
///
/// The photo is not tied to a start column: the grid may sit on any of the eight phases, as it does
/// after a crop or a resize of a photo whose side is not a multiple of 8.
#[must_use]
pub(crate) fn grid_score(img: &Rgb) -> f32 {
    grid_medians(img).map_or(1.0, |(x, y)| stand_out(&x).max(stand_out(&y)))
}

/// Softens the steps across the block edges of one axis. `at(i)` is the index of pixel `i` along
/// the line; a step is the pair `(i, i + 1)` with `i % 8 == phase`.
fn soften_line(px: &mut [u8], n: usize, phase: usize, at: impl Fn(usize) -> usize) {
    let mut i = phase;
    while i + 2 < n && i >= 1 {
        let (a2, a1, b1, b2) = (at(i - 1), at(i), at(i + 1), at(i + 2));
        let mut worst = 0i32;
        for c in 0..3 {
            let d = i32::from(px[b1 * 3 + c]) - i32::from(px[a1 * 3 + c]);
            worst = worst.max(d.abs());
        }
        let inside = |p: usize, q: usize| {
            (0..3).all(|c| (f32::from(px[p * 3 + c]) - f32::from(px[q * 3 + c])).abs() < STEP_CAP)
        };
        // a big step is a real edge, and a rough side is texture: leave both
        if worst > 0 && (worst as f32) < STEP_CAP && inside(a2, a1) && inside(b1, b2) {
            for c in 0..3 {
                let d = f32::from(px[b1 * 3 + c]) - f32::from(px[a1 * 3 + c]);
                let put = |px: &mut [u8], k: usize, v: f32| {
                    px[k * 3 + c] = v.round().clamp(0.0, 255.0) as u8;
                };
                let (v2, v1, u1, u2) = (
                    f32::from(px[a2 * 3 + c]) + d * 0.125,
                    f32::from(px[a1 * 3 + c]) + d * 0.375,
                    f32::from(px[b1 * 3 + c]) - d * 0.375,
                    f32::from(px[b2 * 3 + c]) - d * 0.125,
                );
                put(px, a2, v2);
                put(px, a1, v1);
                put(px, b1, u1);
                put(px, b2, u2);
            }
        }
        i += BLOCK;
    }
}

/// The bilateral smooth that follows the deblock filter: every pixel becomes the mean of the pixels
/// within `SMOOTH_R` px, each weighted by how near it is and how near its color is, so a flat area
/// loses the ringing of the blocks and an edge stays an edge.
fn smooth(img: &Rgb) -> Rgb {
    let (w, h) = (img.width, img.height);
    let r = SMOOTH_R as isize;
    let near: Vec<f32> = (-r..=r)
        .flat_map(|dy| {
            (-r..=r).map(move |dx| {
                (-((dx * dx + dy * dy) as f32) / (2.0 * SMOOTH_SPACE * SMOOTH_SPACE)).exp()
            })
        })
        .collect();
    let inv = -1.0 / (2.0 * SMOOTH_RANGE * SMOOTH_RANGE);
    let mut out = img.clone();
    for y in 0..h as isize {
        for x in 0..w as isize {
            let c = (y as usize * w + x as usize) * 3;
            let mid = [
                f32::from(img.data[c]),
                f32::from(img.data[c + 1]),
                f32::from(img.data[c + 2]),
            ];
            let (mut sum, mut total) = ([0f32; 3], 0f32);
            let mut k = 0;
            for dy in -r..=r {
                for dx in -r..=r {
                    let (qx, qy) = (x + dx, y + dy);
                    let wt0 = near[k];
                    k += 1;
                    if qx < 0 || qy < 0 || qx >= w as isize || qy >= h as isize {
                        continue;
                    }
                    let q = (qy as usize * w + qx as usize) * 3;
                    let p = [
                        f32::from(img.data[q]),
                        f32::from(img.data[q + 1]),
                        f32::from(img.data[q + 2]),
                    ];
                    let d2 =
                        (p[0] - mid[0]).powi(2) + (p[1] - mid[1]).powi(2) + (p[2] - mid[2]).powi(2);
                    let wt = wt0 * (d2 * inv).exp();
                    total += wt;
                    for (acc, v) in sum.iter_mut().zip(p) {
                        *acc += wt * v;
                    }
                }
            }
            for (o, v) in out.data[c..c + 3].iter_mut().zip(sum) {
                *o = (v / total).round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    out
}

/// The photo with the block noise calmed, or the photo itself when no grid shows.
#[must_use]
pub(crate) fn calm(img: &Rgb) -> Cow<'_, Rgb> {
    if grid_score(img) < BLOCKY {
        return Cow::Borrowed(img);
    }
    let (w, h) = (img.width, img.height);
    let Some((mx, my)) = grid_medians(img) else {
        return Cow::Borrowed(img);
    };
    let (px, py) = (grid_phase(&mx), grid_phase(&my));
    let mut out = img.clone();
    for y in 0..h {
        let row = y * w;
        soften_line(&mut out.data, w, px, |x| row + x);
    }
    for x in 0..w {
        soften_line(&mut out.data, h, py, |y| y * w + x);
    }
    Cow::Owned(smooth(&out))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A smooth ramp with a flat 6 level step at every 8th column and row, like a JPEG squeezed
    /// hard: each block has its own small offset.
    fn blocky(w: usize, h: usize) -> Rgb {
        let mut data = Vec::with_capacity(w * h * 3);
        for y in 0..h {
            for x in 0..w {
                let offset = (((x / BLOCK) * 7 + (y / BLOCK) * 13) % 5) as i32 * 3;
                let v = (100 + x as i32 / 4 + offset).clamp(0, 255) as u8;
                data.extend_from_slice(&[v, v, v]);
            }
        }
        Rgb::from_vec(w, h, 3, data)
    }

    fn ramp(w: usize, h: usize) -> Rgb {
        let mut data = Vec::with_capacity(w * h * 3);
        for y in 0..h {
            for x in 0..w {
                let v = (40 + x + y) as u8;
                data.extend_from_slice(&[v, v, v]);
            }
        }
        Rgb::from_vec(w, h, 3, data)
    }

    #[test]
    fn test_a_grid_of_8_px_is_found() {
        assert!(grid_score(&blocky(96, 96)) > BLOCKY);
    }

    #[test]
    fn test_a_smooth_picture_has_no_grid() {
        assert!(grid_score(&ramp(96, 96)) < BLOCKY);
        assert!(grid_score(&Rgb::filled(96, 96, &[90, 90, 90])) < BLOCKY);
    }

    #[test]
    fn test_a_grid_off_the_start_is_found_too() {
        let img = blocky(104, 96);
        // drop the first 3 columns, so the grid sits on another phase
        let mut data = Vec::new();
        for y in 0..96 {
            data.extend_from_slice(&img.data[(y * 104 + 3) * 3..(y * 104 + 104) * 3]);
        }
        let shifted = Rgb::from_vec(101, 96, 3, data);
        assert!(grid_score(&shifted) > BLOCKY);
    }

    #[test]
    fn test_calm_leaves_a_clean_picture_alone() {
        let img = ramp(96, 96);
        assert!(matches!(calm(&img), Cow::Borrowed(_)));
    }

    #[test]
    fn test_calm_softens_the_steps_of_a_grid() {
        let img = blocky(96, 96);
        let calmed = calm(&img);
        assert!(matches!(calmed, Cow::Owned(_)));
        assert!(grid_score(&calmed) < grid_score(&img));
        let step = |im: &Rgb| {
            let (mut s, mut n) = (0u32, 0u32);
            for y in 0..96 {
                for x in (7..95).step_by(8) {
                    s += u32::from(
                        im.data[(y * 96 + x + 1) * 3].abs_diff(im.data[(y * 96 + x) * 3]),
                    );
                    n += 1;
                }
            }
            s as f32 / n as f32
        };
        assert!(step(&calmed) < step(&img));
    }

    #[test]
    fn test_a_real_edge_is_kept() {
        let mut img = Rgb::filled(96, 96, &[30, 30, 30]);
        for y in 0..96 {
            for x in 40..96 {
                img.data[(y * 96 + x) * 3..(y * 96 + x) * 3 + 3].copy_from_slice(&[220, 220, 220]);
            }
        }
        assert!(matches!(calm(&img), Cow::Borrowed(_)));
    }
}
