//! The grain of the Drawing look: paper tooth plus hatching, added to a tone with mean zero, so
//! the tones hold.

use super::grades::PAPER;

/// The grain of a pencil zone, as the half height of its swing in L*. It averages out in a
/// patch, so the tone of a zone is the mean of its pixels.
const GRAIN: f32 = 4.5;
/// The weight of the hatching in the grain; the rest is the fine tooth.
const HATCH_WEIGHT: f32 = 0.45;
/// The paper tooth, as the half swing in L*.
const TOOTH: f32 = 1.0;
/// The hatching period at a long side of 1024 px.
const HATCH_PERIOD: f32 = 5.0;
/// The tone (L*) under which the grain is at its full swing, the cross hatch begins and the paper
/// tooth gives way to the pencil: an HB.
const FULL_GRAIN_AT: f32 = 60.0;

/// A hash of a pixel position, from -1 to 1. Uniform, so its mean is zero.
pub(super) fn hash(x: usize, y: usize) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x9E37_79B1) ^ (y as u32).wrapping_mul(0x85EB_CA6B);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^= h >> 15;
    (h >> 8) as f32 / 8_388_607.5 - 1.0
}

/// A triangle wave of period 1, from -1 to 1, mean zero.
fn triangle(t: f32) -> f32 {
    let f = t - libm::floorf(t);
    4.0 * (f - 0.5).abs() - 1.0
}

/// The hatching period for a picture with the long side `long` px: [`HATCH_PERIOD`] at 1024 px,
/// and no finer on a smaller picture.
pub(super) fn period(long: usize) -> f32 {
    HATCH_PERIOD * (long as f32 / 1024.0).max(1.0)
}

/// The L* swing of the drawing at a pixel of tone `l`: fine tooth plus hatching. Light areas keep
/// only the paper tooth. Darker areas get the full grain and, below the middle, a second hatch the
/// other way, so a dark area reads as cross-hatched.
pub(super) fn swing(x: usize, y: usize, l: f32, period: f32) -> f32 {
    let dark = ((PAPER - l) / (PAPER - FULL_GRAIN_AT)).clamp(0.0, 1.0);
    let amp = TOOTH + (GRAIN - TOOTH) * dark;
    let cross = ((dark - 0.45) / 0.4).clamp(0.0, 1.0) * 0.5;
    let u = period * std::f32::consts::SQRT_2;
    let h1 = triangle((x as f32 + y as f32) / u);
    let h2 = triangle((x as f32 - y as f32) / u);
    let hatch = h1 * (1.0 - cross) + h2 * cross;
    amp * ((1.0 - HATCH_WEIGHT) * hash(x, y) + HATCH_WEIGHT * hatch)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_is_in_range_with_mean_near_zero_and_repeatable() {
        let v: Vec<f32> = (0..64 * 64).map(|i| hash(i % 64, i / 64)).collect();
        assert!(v.iter().all(|h| (-1.0..=1.0).contains(h)));
        let mean = v.iter().sum::<f32>() / v.len() as f32;
        assert!(mean.abs() < 0.05, "{mean}");
        assert_eq!(hash(3, 9), hash(3, 9));
        assert_ne!(hash(3, 9), hash(9, 3));
    }

    #[test]
    fn test_triangle_has_mean_zero_over_a_period() {
        let mean = (0..1000).map(|i| triangle(i as f32 / 1000.0)).sum::<f32>() / 1000.0;
        assert!(mean.abs() < 1e-3, "{mean}");
        assert!((triangle(0.0) - 1.0).abs() < 1e-6 && (triangle(0.5) + 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_period_grows_with_the_picture_but_not_below_the_base() {
        assert_eq!(period(256), HATCH_PERIOD);
        assert_eq!(period(1024), HATCH_PERIOD);
        assert_eq!(period(2048), 2.0 * HATCH_PERIOD);
    }

    #[test]
    fn test_swing_is_larger_in_the_dark_than_on_the_paper() {
        let p = period(1024);
        let spread = |l: f32| {
            (0..32 * 32)
                .map(|i| swing(i % 32, i / 32, l, p).abs())
                .sum::<f32>()
        };
        assert!(spread(26.0) > 2.0 * spread(90.0));
    }
}
