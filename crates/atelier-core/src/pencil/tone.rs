//! The tone curve of a Pencil view: where the photo lightness (CIE L*) becomes the tone of a
//! pencil. The ends of the photo's range, the cuts between the levels and the curve through them.

use crate::filters::Sorted;

/// How far the cuts of the Zones look lean to equal shares of pixels (0 the plain stretch, 1
/// equal shares), so a middle grade is used as much as a soft one.
pub(super) const SPREAD: f32 = 0.35;
/// The same lean for the tone curve of Tone and Drawing. It stays small, so the picture follows
/// the photo: a bimodal photo (a light face on a dark ground) keeps the shading of its face.
pub(super) const TONE_SPREAD: f32 = 0.10;
/// The share of the smoothed L* under the darkest tone: its percentile becomes the darkest pencil.
const LOW_Q: f64 = 0.01;
/// The share of the smoothed L* under paper white: its percentile becomes paper.
const HIGH_Q: f64 = 0.99;
/// The narrowest L* range a photo is stretched from. A flatter photo is centered on its own mean.
const MIN_RANGE: f32 = 12.0;
/// The gap kept between two anchors, in L*, so the curve never divides by zero.
const ANCHOR_GAP: f32 = 0.001;

/// The photo lightness that becomes the darkest pencil and paper: the [`LOW_Q`] and [`HIGH_Q`]
/// percentiles of `smooth`, at least [`MIN_RANGE`] apart.
pub(super) fn range(smooth: &Sorted) -> (f32, f32) {
    let lo = smooth.at(LOW_Q);
    let hi = smooth.at(HIGH_Q);
    if hi - lo < MIN_RANGE {
        let mid = f32::midpoint(hi, lo);
        (mid - MIN_RANGE / 2.0, mid + MIN_RANGE / 2.0)
    } else {
        (lo, hi)
    }
}

/// The cuts between the levels, in the L* of the smoothed photo. They blend the plain stretch
/// (the [`range`] of the photo onto the range of the set) with equal shares of pixels.
pub(super) fn cuts(smooth: &Sorted, tones: &[f32], spread: f32) -> Vec<f32> {
    let (lo, hi) = range(smooth);
    let (first, last) = (tones[0], tones[tones.len() - 1]);
    let n = tones.len();
    let mut prev = f32::MIN;
    (0..n - 1)
        .map(|i| {
            let mid = f32::midpoint(tones[i], tones[i + 1]);
            let stretch = lo + (mid - first) / (last - first) * (hi - lo);
            let equal = smooth.at((i + 1) as f64 / n as f64);
            let cut = ((1.0 - spread) * stretch + spread * equal).max(prev);
            prev = cut;
            cut
        })
        .collect()
}

/// The photo lightness at the middle of each zone, rising: the points of the tone curve that map
/// to the tones of the levels. `lo` and `hi` are the ends of the photo's [`range`].
pub(super) fn anchors(lo: f32, hi: f32, cuts: &[f32]) -> Vec<f32> {
    let edges: Vec<f32> = std::iter::once(lo)
        .chain(cuts.iter().copied())
        .chain(std::iter::once(hi))
        .collect();
    let mut prev = f32::MIN;
    edges
        .windows(2)
        .map(|e| {
            let at = f32::midpoint(e[0], e[1]).max(prev + ANCHOR_GAP);
            prev = at;
            at
        })
        .collect()
}

/// The tone of the photo lightness `v`: straight lines between the `anchors`, flat outside them.
pub(super) fn curve(v: f32, anchors: &[f32], tones: &[f32]) -> f32 {
    let n = anchors.len();
    if v <= anchors[0] {
        return tones[0];
    }
    if v >= anchors[n - 1] {
        return tones[n - 1];
    }
    let k = anchors.partition_point(|&a| a <= v);
    let t = (v - anchors[k - 1]) / (anchors[k] - anchors[k - 1]);
    tones[k - 1] + t * (tones[k] - tones[k - 1])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 0, 1, ... n - 1 as a list.
    fn counting(n: usize) -> Vec<f32> {
        (0..n).map(|i| i as f32).collect()
    }

    #[test]
    fn test_range_is_the_ends_and_at_least_min_range_wide() {
        let wide = Sorted::new(&counting(1000));
        assert_eq!(range(&wide), (9.0, 989.0));
        let flat = Sorted::new(&[50.0; 100]);
        let (lo, hi) = range(&flat);
        assert_eq!((lo, hi), (44.0, 56.0));
    }

    #[test]
    fn test_cuts_rise_and_sit_between_the_ends() {
        let sorted = Sorted::new(&counting(1000));
        let tones = [17.0, 49.0, 70.0, 95.0];
        for spread in [0.0, 0.1, 0.35, 1.0] {
            let c = cuts(&sorted, &tones, spread);
            assert_eq!(c.len(), 3);
            assert!(c.windows(2).all(|p| p[0] <= p[1]), "{spread}: {c:?}");
        }
    }

    #[test]
    fn test_anchors_rise_strictly() {
        let a = anchors(0.0, 100.0, &[30.0, 30.0, 60.0]);
        assert_eq!(a.len(), 4);
        assert!(a.windows(2).all(|p| p[0] < p[1]), "{a:?}");
    }

    #[test]
    fn test_curve_hits_the_tones_at_the_anchors_and_rises() {
        let tones = [17.0, 49.0, 70.0, 95.0];
        let at = [10.0, 40.0, 60.0, 90.0];
        for (a, t) in at.iter().zip(&tones) {
            assert_eq!(curve(*a, &at, &tones), *t);
        }
        assert_eq!(curve(-5.0, &at, &tones), 17.0);
        assert_eq!(curve(500.0, &at, &tones), 95.0);
        let ys: Vec<f32> = (0..=100).map(|v| curve(v as f32, &at, &tones)).collect();
        assert!(ys.windows(2).all(|p| p[0] <= p[1]), "{ys:?}");
    }
}
