//! The smudge effect: a blending stump dragged along the stroke. Each pixel takes the mean of the
//! pixels on a short line through it, along the stroke angle, with the middle counting most. Graphite
//! is moved, not added, so the mean of the picture stays where it was.

use super::paper::scale;

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

/// The picture `tone` (L*, `w` by `h`) with a stump dragged along `angle_deg` (0 is left to right, the
/// angle runs clockwise on the screen as the stroke angle does). `amount` is 0 (the same picture, to
/// the byte) to 1 (a drag of 12 px each way at a long side of 1024). A blend of the pixels, so no
/// pixel leaves the range of `tone`.
pub(crate) fn drag(tone: &[f32], (w, h): (usize, usize), angle_deg: f32, amount: f32) -> Vec<f32> {
    let reach = (amount * REACH * scale(w, h)).round() as i32;
    if amount <= 0.0 || reach < 1 {
        return tone.to_vec();
    }
    let turn = angle_deg.to_radians();
    let (dx, dy) = (libm::cosf(turn), libm::sinf(turn));
    // a triangle of weights: the middle counts most, so the ends of the drag fade out
    let weight = |k: i32| (reach + 1 - k.abs()) as f32;
    let total: f32 = (-reach..=reach).map(weight).sum();
    let mut out = Vec::with_capacity(tone.len());
    for y in 0..h {
        for x in 0..w {
            let (fx, fy) = (x as f32, y as f32);
            let sum: f32 = (-reach..=reach)
                .map(|k| weight(k) * sample(tone, (w, h), fx + k as f32 * dx, fy + k as f32 * dy))
                .sum();
            out.push(sum / total);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A picture of `w` by `h` with the value `f(x, y)`.
    fn picture(w: usize, h: usize, f: impl Fn(usize, usize) -> f32) -> Vec<f32> {
        (0..w * h).map(|i| f(i % w, i / w)).collect()
    }

    /// How far `a` is from `b`, summed.
    fn spread(a: &[f32], b: &[f32]) -> f32 {
        a.iter().zip(b).map(|(x, y)| (x - y).abs()).sum()
    }

    fn mean(v: &[f32]) -> f32 {
        v.iter().sum::<f32>() / v.len() as f32
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
    fn test_same_input_same_picture() {
        let (w, h) = (48, 48);
        let tone = picture(w, h, |x, y| 20.0 + ((x * 5 + y * 11) % 60) as f32);
        assert_eq!(
            drag(&tone, (w, h), 60.0, 0.7),
            drag(&tone, (w, h), 60.0, 0.7)
        );
    }
}
