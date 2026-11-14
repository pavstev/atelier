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
/// The narrowest L* range a photo is stretched from. A flatter photo is centered on its own mean.
const MIN_RANGE: f32 = 12.0;
/// The gap kept between two anchors, in L*, so the curve never divides by zero.
const ANCHOR_GAP: f32 = 0.001;
/// The Key and Contrast knobs (0 to 1) at which they change nothing.
pub(super) const NEUTRAL: f32 = 0.5;
/// The most the Key knob moves the middle tone, in stops (a stop is a factor of 2 in the odds of
/// light), to either side. One stop was too small to see on real photos (about 5 L* at Key 80).
pub(super) const KEY_STOPS: f32 = 2.0;
/// The most the Contrast knob changes the slope at the middle, as an exponent of 2: the slope runs
/// from 0.5 to 2.
const CONTRAST_STOPS: f32 = 1.0;

/// The photo lightness that becomes the darkest pencil and paper: the [`LOW_Q`] percentile of
/// `smooth` and its `high_q` percentile (the white point, 0.99 at the start), at least
/// [`MIN_RANGE`] apart.
pub(super) fn range(smooth: &Sorted, high_q: f64) -> (f32, f32) {
    let lo = smooth.at(LOW_Q);
    let hi = smooth.at(high_q);
    if hi - lo < MIN_RANGE {
        let mid = f32::midpoint(hi, lo);
        (mid - MIN_RANGE / 2.0, mid + MIN_RANGE / 2.0)
    } else {
        (lo, hi)
    }
}

/// The cuts between the levels, in the L* of the smoothed photo. They blend the plain stretch
/// (the [`range`] of the photo, white point `high_q`, onto the range of the set) with equal shares
/// of pixels.
pub(super) fn cuts(smooth: &Sorted, tones: &[f32], spread: f32, high_q: f64) -> Vec<f32> {
    let (lo, hi) = range(smooth, high_q);
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

/// The constant of Schlick's bias (1994) for a key of `stops` stops (positive lighter): the
/// middle of 0 to 1 goes to `2^stops / (1 + 2^stops)`.
pub(super) fn bias_constant(stops: f32) -> f32 {
    libm::exp2f(-stops) - 1.0
}

/// Schlick's bias of `x` (0 to 1), `x / (c (1 - x) + 1)` with `c` from [`bias_constant`]. It keeps
/// 0 and 1 where they are and never clips, so it lifts or drops the middle only.
pub(super) fn bias(x: f32, c: f32) -> f32 {
    x / (c * (1.0 - x) + 1.0)
}

/// The S curve of `x` (0 to 1) with the exponent `a` (0.5 to 2): `x^a / (x^a + (1 - x)^a)`. It
/// pivots at the middle, where its slope is `a`, and keeps 0 and 1 where they are.
pub(super) fn s_curve(x: f32, a: f32) -> f32 {
    let (up, down) = (libm::powf(x, a), libm::powf(1.0 - x, a));
    up / (up + down)
}

/// The map from the photo lightness to a tone: the [`curve`] through the anchors, with the Key and
/// the Contrast of the picture applied to the photo lightness first (0 at the darkest end of the
/// photo's [`range`], 1 at the lightest). A neutral knob skips its math, so the start picture is
/// the plain curve to the byte.
pub(super) struct ToneMap<'a> {
    lo: f32,
    hi: f32,
    at: Vec<f32>,
    tones: &'a [f32],
    /// The bias constant of the key, `None` at the neutral key.
    key: Option<f32>,
    /// The exponent of the S curve, `None` at the neutral contrast.
    contrast: Option<f32>,
}

impl<'a> ToneMap<'a> {
    /// The map of `tones` for the photo `smooth`, with the white point `high_q` and the knobs
    /// `key` and `contrast` (0 to 1, [`NEUTRAL`] changes nothing).
    pub(super) fn new(
        smooth: &Sorted,
        tones: &'a [f32],
        high_q: f64,
        key: f32,
        contrast: f32,
    ) -> Self {
        let (lo, hi) = range(smooth, high_q);
        let at = anchors(lo, hi, &cuts(smooth, tones, TONE_SPREAD, high_q));
        // knobs come in steps of 0.001, so "neutral" is exact
        let off = |knob: f32| (knob - NEUTRAL).abs() < f32::EPSILON;
        Self {
            lo,
            hi,
            at,
            tones,
            key: (!off(key)).then(|| bias_constant((key - NEUTRAL) / NEUTRAL * KEY_STOPS)),
            contrast: (!off(contrast))
                .then(|| libm::exp2f((contrast - NEUTRAL) / NEUTRAL * CONTRAST_STOPS)),
        }
    }

    /// The tone of the photo lightness `v`.
    pub(super) fn map(&self, v: f32) -> f32 {
        if self.key.is_none() && self.contrast.is_none() {
            return curve(v, &self.at, self.tones);
        }
        let span = self.hi - self.lo;
        let mut x = ((v - self.lo) / span).clamp(0.0, 1.0);
        if let Some(c) = self.key {
            x = bias(x, c);
        }
        if let Some(a) = self.contrast {
            x = s_curve(x, a);
        }
        curve(self.lo + x * span, &self.at, self.tones)
    }
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
        assert_eq!(range(&wide, 0.99), (9.0, 989.0));
        let flat = Sorted::new(&[50.0; 100]);
        let (lo, hi) = range(&flat, 0.99);
        assert_eq!((lo, hi), (44.0, 56.0));
    }

    #[test]
    fn test_cuts_rise_and_sit_between_the_ends() {
        let sorted = Sorted::new(&counting(1000));
        let tones = [17.0, 49.0, 70.0, 95.0];
        for spread in [0.0, 0.1, 0.35, 1.0] {
            let c = cuts(&sorted, &tones, spread, 0.99);
            assert_eq!(c.len(), 3);
            assert!(c.windows(2).all(|p| p[0] <= p[1]), "{spread}: {c:?}");
        }
    }

    /// A tone map over the photo range 0 to 99 for the tones of a set of three and paper.
    fn map_of(key: f32, contrast: f32) -> ToneMap<'static> {
        const TONES: [f32; 4] = [17.0, 49.0, 70.0, 95.0];
        ToneMap::new(&Sorted::new(&counting(100)), &TONES, 0.99, key, contrast)
    }

    #[test]
    fn test_bias_and_s_curve_keep_their_ends_and_rise() {
        for stops in [-1.0, -0.4, 0.4, 1.0] {
            let c = bias_constant(stops);
            let ys: Vec<f32> = (0..=100).map(|i| bias(i as f32 / 100.0, c)).collect();
            assert_eq!(ys[0], 0.0);
            assert!((ys[100] - 1.0).abs() < 1e-6, "{stops}: {}", ys[100]);
            assert!(ys.windows(2).all(|p| p[0] < p[1]), "{stops}");
            // a lighter key lifts the middle, a darker key drops it
            assert_eq!(ys[50] > 0.5, stops > 0.0, "{stops}: {}", ys[50]);
        }
        for a in [0.5, 0.8, 1.25, 2.0] {
            let ys: Vec<f32> = (0..=100).map(|i| s_curve(i as f32 / 100.0, a)).collect();
            assert_eq!(ys[0], 0.0);
            assert!((ys[100] - 1.0).abs() < 1e-6, "{a}");
            assert!((ys[50] - 0.5).abs() < 1e-6, "pivot at the middle: {a}");
            assert!(ys.windows(2).all(|p| p[0] <= p[1]), "{a}");
        }
    }

    #[test]
    fn test_s_curve_is_steeper_in_the_middle_for_more_contrast() {
        let slope = |a: f32| s_curve(0.55, a) - s_curve(0.45, a);
        assert!(slope(2.0) > slope(1.0) && slope(1.0) > slope(0.5));
    }

    #[test]
    fn test_the_neutral_map_is_the_plain_curve() {
        let map = map_of(NEUTRAL, NEUTRAL);
        for v in [-3.0, 0.0, 7.5, 33.0, 61.25, 98.0, 140.0] {
            assert_eq!(map.map(v), curve(v, &map.at, map.tones), "{v}");
        }
    }

    #[test]
    fn test_the_tone_map_rises_with_the_photo_and_with_key_and_contrast() {
        for (key, contrast) in [(0.2, 0.5), (0.8, 0.5), (0.5, 0.1), (0.5, 0.9), (0.9, 0.9)] {
            let map = map_of(key, contrast);
            let ys: Vec<f32> = (0..100).map(|v| map.map(v as f32)).collect();
            assert!(ys.windows(2).all(|p| p[0] <= p[1]), "{key} {contrast}");
            assert!(ys.iter().all(|y| (17.0..=95.0).contains(y)));
        }
        // a lighter key never draws a tone darker; more contrast darkens the dark half
        let (low, mid, high) = (map_of(0.2, 0.5), map_of(0.5, 0.5), map_of(0.8, 0.5));
        for v in 0..100 {
            let v = v as f32;
            assert!(low.map(v) <= mid.map(v) && mid.map(v) <= high.map(v), "{v}");
        }
        let (flat, hard) = (map_of(0.5, 0.0), map_of(0.5, 1.0));
        assert!(hard.map(20.0) < flat.map(20.0));
        assert!(hard.map(80.0) > flat.map(80.0));
    }

    #[test]
    fn test_fewer_highlights_put_the_white_point_higher() {
        let sorted = Sorted::new(&counting(1000));
        assert!(range(&sorted, 0.99).1 < range(&sorted, 1.0).1);
        assert!(range(&sorted, 0.75).1 < range(&sorted, 0.99).1);
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
