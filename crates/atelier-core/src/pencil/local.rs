//! The Local contrast knob of a Pencil view: the detail of the photo (what is left after a smooth
//! base is taken away) is boosted, with a soft limit, so texture stands out and no halo grows at an edge.

use crate::filters::guided;

/// The radius of the base filter, as a share of the long side: 2 percent, 20 px at 1024 px.
const RADIUS_SHARE: f32 = 0.02;
/// The variance of the photo L* (in L*²) under which the base filter flattens: the square of 4 L*,
/// about two just noticeable differences. Texture under it is detail. Anything stronger is an
/// edge, which stays in the base, so the boost leaves no halo.
const EPS: f32 = 16.0;
/// How much of the detail the knob adds at its top (1), as a factor of the detail: the picture
/// gets `1 + GAIN` times the detail.
const GAIN: f32 = 1.5;
/// The soft limit of the boost, in L*: the detail saturates (a tanh) toward this, so a strong
/// detail is not blown up.
const LIMIT: f32 = 15.0;

/// The base of `v`: the guided filter of `v` by itself, over windows of 2 percent of the long side
/// of the `w` x `h` picture.
fn base(v: &[f32], w: usize, h: usize) -> Vec<f32> {
    let radius = (w.max(h) as f32 * RADIUS_SHARE).round().max(1.0) as usize;
    guided(v, v, w, h, radius, EPS)
}

/// The lightness `v` (L*, `w` x `h`) with its detail boosted by the knob `local` (0 to 1):
/// `v + g L tanh((v - base) / L)` with `g = GAIN local` and the soft limit `L` ([`LIMIT`]). The
/// detail (`v - base`) is small and signed, so the mean holds. 0 draws no change: the caller
/// skips the call then.
pub(super) fn boost(v: &[f32], w: usize, h: usize, local: f32) -> Vec<f32> {
    let g = GAIN * local;
    base(v, w, h)
        .iter()
        .zip(v)
        .map(|(&b, &x)| x + g * LIMIT * libm::tanhf((x - b) / LIMIT))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A noisy texture of the given amplitude around 50, on a `w` x `h` picture.
    fn texture(w: usize, h: usize, amp: f32) -> Vec<f32> {
        (0..w * h)
            .map(|i| 50.0 + amp * super::super::drawing::hash(i % w, i / w))
            .collect()
    }

    /// The mean and the variance of a list.
    fn stats(v: &[f32]) -> (f64, f64) {
        let mean = v.iter().map(|&x| f64::from(x)).sum::<f64>() / v.len() as f64;
        let var = v
            .iter()
            .map(|&x| (f64::from(x) - mean).powi(2))
            .sum::<f64>()
            / v.len() as f64;
        (mean, var)
    }

    #[test]
    fn test_a_flat_picture_does_not_change() {
        let flat = vec![42.0f32; 40 * 30];
        for local in [0.25, 1.0] {
            let out = boost(&flat, 40, 30, local);
            assert!(out.iter().all(|&x| (x - 42.0).abs() < 1e-3), "{local}");
        }
    }

    #[test]
    fn test_texture_grows_with_the_knob_and_the_mean_holds() {
        let v = texture(96, 64, 3.0);
        let (mean0, var0) = stats(&v);
        let vars: Vec<f64> = [0.25, 0.5, 1.0]
            .iter()
            .map(|&local| {
                let out = boost(&v, 96, 64, local);
                let (mean, var) = stats(&out);
                assert!((mean - mean0).abs() < 0.2, "{local}: {mean} {mean0}");
                var
            })
            .collect();
        assert!(
            var0 < vars[0] && vars[0] < vars[1] && vars[1] < vars[2],
            "{vars:?}"
        );
    }

    #[test]
    fn test_the_boost_never_passes_its_soft_limit() {
        let v = texture(64, 64, 40.0);
        let out = boost(&v, 64, 64, 1.0);
        let most = GAIN * LIMIT + 1e-3;
        assert!(v.iter().zip(&out).all(|(&a, &b)| (a - b).abs() <= most));
    }

    #[test]
    fn test_a_strong_edge_grows_no_halo() {
        // a step from L* 20 to 80: the filter keeps it, so the pixels next to it stay put
        let (w, h) = (80usize, 20usize);
        let v: Vec<f32> = (0..w * h)
            .map(|i| if i % w < w / 2 { 20.0 } else { 80.0 })
            .collect();
        let out = boost(&v, w, h, 1.0);
        for x in [w / 2 - 3, w / 2 - 2, w / 2 + 1, w / 2 + 2] {
            let i = 5 * w + x;
            assert!((out[i] - v[i]).abs() < 4.0, "x {x}: {} {}", out[i], v[i]);
        }
    }

    #[test]
    fn test_the_radius_follows_the_long_side_and_the_same_input_gives_the_same_bytes() {
        let v = texture(128, 16, 5.0);
        assert_eq!(boost(&v, 128, 16, 0.7), boost(&v, 128, 16, 0.7));
        assert_eq!(boost(&v[..16], 4, 4, 0.7).len(), 16);
    }
}
