//! The smudge effect: a blending stump dragged along the stroke. Each pixel takes the mean of the
//! pixels on a short line through it, along the stroke angle, with the middle counting most. Graphite
//! is moved, not added, so the mean of the picture stays where it was.

use crate::img::size_factor;

/// The half length of the drag at full strength, in px at a long side of 1024.
const REACH: f32 = 12.0;

/// The L* of `v` (`w` by `h`) at the real position `(x, y)`: bilinear, the border repeated.
fn sample(v: &[f32], (w, h): (usize, usize), x: f32, y: f32) -> f32 {
    let x = x.clamp(0.0, (w - 1) as f32);
    let y = y.clamp(0.0, (h - 1) as f32);
    let (x0, y0) = (libm::floorf(x) as usize, libm::floorf(y) as usize);
    let (x1, y1) = ((x0 + 1).min(w - 1), (y0 + 1).min(h - 1));
    let (fx, fy) = (x - x0 as f32, y - y0 as f32);
    let top = v[y0 * w + x0] + (v[y0 * w + x1] - v[y0 * w + x0]) * fx;
    let bottom = v[y1 * w + x0] + (v[y1 * w + x1] - v[y1 * w + x0]) * fx;
    top + (bottom - top) * fy
}

/// [`sample`] for a position at least one px inside every border (no clamp, no border check),
/// the same number as [`sample`] gives there.
fn sample_inside(v: &[f32], w: usize, x: f32, y: f32) -> f32 {
    // the position is not negative, so a cast truncates exactly as floor does
    let (x0, y0) = (x as usize, y as usize);
    let (fx, fy) = (x - x0 as f32, y - y0 as f32);
    let (a, b) = (y0 * w + x0, (y0 + 1) * w + x0);
    let top = v[a] + (v[a + 1] - v[a]) * fx;
    let bottom = v[b] + (v[b + 1] - v[b]) * fx;
    top + (bottom - top) * fy
}

/// The picture `tone` (L*, `w` by `h`) with a stump dragged along `angle_deg` (0 is left to right, the
/// angle runs clockwise on the screen as the stroke angle does). `amount` is 0 (the same picture, to
/// the byte) to 1 (a drag of 12 px each way at a long side of 1024). A blend of the pixels, so no
/// pixel leaves the range of `tone`.
pub(crate) fn drag(tone: &[f32], size: (usize, usize), angle_deg: f32, amount: f32) -> Vec<f32> {
    drag_stopped(tone, size, angle_deg, amount, None)
}

/// [`drag`] where a tap counts less the further its tone is from the pixel's own: it counts half at
/// a step of `stop` L* (`None` is the plain drag). The grain and the tooth, a few L*, still blend
/// away, but a clear edge of the tone (an eye, a crease) is not smeared across.
pub(crate) fn drag_stopped(
    tone: &[f32],
    (w, h): (usize, usize),
    angle_deg: f32,
    amount: f32,
    stop: Option<f32>,
) -> Vec<f32> {
    let reach = (amount * REACH * size_factor(w, h)).round() as i32;
    if amount <= 0.0 || reach < 1 {
        return tone.to_vec();
    }
    let edge_inv = stop.map_or(0.0, |s| 1.0 / (s * s));
    let turn = angle_deg.to_radians();
    let (dx, dy) = (libm::cosf(turn), libm::sinf(turn));
    // a triangle of weights: the middle counts most, so the ends of the drag fade out
    let weight = |k: i32| (reach + 1 - k.abs()) as f32;
    let weights: Vec<f32> = (-reach..=reach).map(weight).collect();
    let r = reach as f32;
    // the line through a pixel is straight, so it stays inside the picture when both its ends do
    // (a small margin, so rounding can never take a sample onto the last row or column)
    let (last_x, last_y) = ((w - 1) as f32 - 1e-3, (h - 1) as f32 - 1e-3);
    let (span_x, span_y) = (r * dx.abs(), r * dy.abs());
    let mut out = Vec::with_capacity(tone.len());
    for y in 0..h {
        for x in 0..w {
            let (fx, fy) = (x as f32, y as f32);
            let inside = fx - span_x >= 0.0
                && fx + span_x < last_x
                && fy - span_y >= 0.0
                && fy + span_y < last_y;
            let at = |k: i32| (fx + k as f32 * dx, fy + k as f32 * dy);
            let centre = tone[y * w + x];
            // a tap counts less the further its tone is from the centre (a soft edge stop)
            let blend = |(n, d): (f32, f32), (wt, v): (f32, f32)| {
                let t = v - centre;
                let wt = wt / (1.0 + t * t * edge_inv);
                (n + wt * v, d + wt)
            };
            let (num, den) = if inside {
                (-reach..=reach)
                    .zip(&weights)
                    .fold((0.0, 0.0), |acc, (k, &wt)| {
                        let (px, py) = at(k);
                        blend(acc, (wt, sample_inside(tone, w, px, py)))
                    })
            } else {
                (-reach..=reach)
                    .zip(&weights)
                    .fold((0.0, 0.0), |acc, (k, &wt)| {
                        let (px, py) = at(k);
                        blend(acc, (wt, sample(tone, (w, h), px, py)))
                    })
            };
            out.push(num / den);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::mean;

    /// A picture of `w` by `h` with the value `f(x, y)`.
    fn picture(w: usize, h: usize, f: impl Fn(usize, usize) -> f32) -> Vec<f32> {
        (0..w * h).map(|i| f(i % w, i / w)).collect()
    }

    /// How far `a` is from `b`, summed.
    fn spread(a: &[f32], b: &[f32]) -> f32 {
        a.iter().zip(b).map(|(x, y)| (x - y).abs()).sum()
    }

    #[test]
    fn test_zero_is_the_same_picture_to_the_byte() {
        let (w, h) = (40, 30);
        let tone = picture(w, h, |x, y| 30.0 + ((x * 7 + y * 3) % 50) as f32);
        assert_eq!(drag(&tone, (w, h), 45.0, 0.0), tone);
    }

    #[test]
    fn test_full_strength_moves_the_picture() {
        let (w, h) = (64, 48);
        let tone = picture(w, h, |x, y| 30.0 + ((x * 7 + y * 3) % 50) as f32);
        assert!(spread(&drag(&tone, (w, h), 45.0, 1.0), &tone) > 100.0);
    }

    #[test]
    fn test_the_drag_runs_along_the_angle_and_not_across_it() {
        let (w, h) = (96, 64);
        // vertical stripes: they change along x only
        let stripes = picture(w, h, |x, _| if (x / 2) % 2 == 0 { 40.0 } else { 80.0 });
        let across = drag(&stripes, (w, h), 0.0, 1.0);
        let along = drag(&stripes, (w, h), 90.0, 1.0);
        // a drag from left to right blends the stripes, a drag from top to bottom keeps them
        assert!(spread(&across, &stripes) > 20.0 * spread(&along, &stripes));
    }

    #[test]
    fn test_the_mean_stays_within_one_l_star() {
        let (w, h) = (96, 64);
        let scenes = [
            picture(w, h, |x, y| {
                25.0 + 70.0 * x as f32 / (w - 1) as f32 + (y % 3) as f32
            }),
            picture(
                w,
                h,
                |x, y| if (x / 3 + y / 3) % 2 == 0 { 20.0 } else { 90.0 },
            ),
            picture(w, h, |x, y| 40.0 + ((x * 131 + y * 71) % 55) as f32),
        ];
        for tone in &scenes {
            for angle in [0.0, 45.0, 90.0, 135.0] {
                let got = drag(tone, (w, h), angle, 1.0);
                assert!(
                    (mean(&got) - mean(tone)).abs() <= 1.0,
                    "angle {angle}: {} against {}",
                    mean(&got),
                    mean(tone)
                );
                let (lo, hi) = (
                    tone.iter().copied().fold(f32::INFINITY, f32::min),
                    tone.iter().copied().fold(f32::NEG_INFINITY, f32::max),
                );
                assert!(got.iter().all(|&v| v >= lo - 1e-3 && v <= hi + 1e-3));
            }
        }
    }

    #[test]
    fn test_the_fast_inside_path_gives_the_same_bytes_as_the_plain_sampler() {
        let (w, h) = (70, 50);
        let tone = picture(w, h, |x, y| 20.0 + ((x * 13 + y * 29) % 61) as f32);
        for angle in [0.0f32, 30.0, 90.0, 135.0] {
            let got = drag(&tone, (w, h), angle, 0.8);
            // the plain sampler everywhere: the same sums in the same order
            let reach = (0.8 * REACH * size_factor(w, h)).round() as i32;
            let turn = angle.to_radians();
            let (dx, dy) = (libm::cosf(turn), libm::sinf(turn));
            let weight = |k: i32| (reach + 1 - k.abs()) as f32;
            let total: f32 = (-reach..=reach).map(weight).sum();
            let want: Vec<f32> = (0..w * h)
                .map(|i| {
                    let (fx, fy) = ((i % w) as f32, (i / w) as f32);
                    let sum: f32 = (-reach..=reach)
                        .map(|k| {
                            weight(k)
                                * sample(&tone, (w, h), fx + k as f32 * dx, fy + k as f32 * dy)
                        })
                        .sum();
                    sum / total
                })
                .collect();
            assert_eq!(got, want, "angle {angle}");
        }
    }

    #[test]
    fn test_an_edge_stop_keeps_a_clear_edge_and_still_blends_grain() {
        let (w, h) = (96, 64);
        // a step of 40 L* with a fine grain of 4 L* on both sides
        let tone = picture(w, h, |x, y| {
            (if x < 48 { 40.0 } else { 80.0 }) + 4.0 * ((x + y) % 2) as f32
        });
        let plain = drag(&tone, (w, h), 0.0, 1.0);
        let stopped = drag_stopped(&tone, (w, h), 0.0, 1.0, Some(12.0));
        // across the step the stopped picture is closer to the step
        let jump = |v: &[f32]| v[32 * w + 52] - v[32 * w + 43];
        assert!(
            jump(&stopped) > jump(&plain) + 10.0,
            "{} {}",
            jump(&stopped),
            jump(&plain)
        );
        // the grain far from the step blends away in both
        let grain = |v: &[f32]| (v[32 * w + 20] - v[32 * w + 21]).abs();
        assert!(grain(&stopped) < 1.0 && grain(&plain) < 1.0);
        // no stop is the plain drag, and no tone leaves the range
        assert_eq!(drag_stopped(&tone, (w, h), 0.0, 1.0, None), plain);
        assert!(
            stopped
                .iter()
                .all(|&v| (40.0 - 1e-3..=84.0 + 1e-3).contains(&v))
        );
    }

    #[test]
    fn test_same_input_same_picture() {
        let (w, h) = (48, 48);
        let tone = picture(w, h, |x, y| 20.0 + ((x * 5 + y * 11) % 60) as f32);
        assert_eq!(
            drag(&tone, (w, h), 60.0, 0.7),
            drag(&tone, (w, h), 60.0, 0.7)
        );
    }
}
