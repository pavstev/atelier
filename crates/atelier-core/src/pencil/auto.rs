//! The Auto knob of a Pencil view: it reads the photo and sets Key, Contrast and Highlights. The
//! rules are fixed numbers on the photo's tones, so the same photo gives the same answer and each
//! number can be explained (Otsu 1979 for the two humps, Ashman 1994 for telling them apart,
//! Reinhard 2002 for a middle tone that is a good key).

use super::tone::{KEY_STOPS, NEUTRAL, range};
use crate::filters::{Sorted, otsu_split};

/// The 256 bins of the L* histogram.
const BINS: usize = 256;
/// The most Auto moves the key, in stops either side: it keeps the mood of the photo.
const AUTO_KEY_STOPS: f32 = 1.0;
/// A photo with a median L* under this is low key.
const LOW_KEY_BELOW: f32 = 35.0;
/// A photo with a median L* over this is high key.
const HIGH_KEY_ABOVE: f32 = 65.0;
/// The share of the between-class variance in the total (Otsu's eta) from which a photo may be
/// two humps. A Gaussian photo has 0.637 and a uniform one 0.75.
const ETA_BIMODAL: f64 = 0.80;
/// The most the valley between two humps may hold, as a share of the lower hump's peak.
const VALLEY_MAX: f32 = 0.5;
/// The least share of the pixels each hump must hold.
const CLASS_MIN: f64 = 0.15;
/// The radius of the box that smooths the histogram, in bins.
const HIST_SMOOTH: usize = 2;
/// The middle tone a photo is pulled toward, as the share of the way from its own middle to the
/// middle of the range (Reinhard's key 0.18 in a gamma space is about the middle).
const KEY_PULL: f32 = 0.5;
/// The spread (interquartile range of the normalized photo) that Contrast aims for.
const IQR_TARGET: f32 = 0.45;
/// The smallest and largest slope Auto gives Contrast.
const SLOPE_RANGE: (f32, f32) = (0.8, 2.0);
/// The Highlights Auto gives a low key, a mid key and a high key photo (the order of
/// [`KeyClass`]), in percent.
const HIGHLIGHTS: [u8; 3] = [1, 2, 5];
/// The Highlights Auto adds when the top of the photo is a thin spike (a glint): percent.
const SPIKE_EXTRA: u8 = 1;
/// The tail (99.9th percentile minus the 97th, in L*) over which the top is a spike.
const SPIKE_OVER: f32 = 10.0;
/// The most Highlights.
const HIGHLIGHTS_MAX: u8 = 25;

/// How light a photo is overall.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum KeyClass {
    /// The middle tone is dark.
    Low,
    /// The middle tone is in the middle.
    Mid,
    /// The middle tone is light.
    High,
}

/// What Auto read from a photo and the knobs it sets.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Auto {
    /// Key, 0 to 100.
    pub key: u8,
    /// Contrast, 0 to 100.
    pub contrast: u8,
    /// Highlights, 0 to 25.
    pub highlights: u8,
    /// The middle (median) L* of the photo.
    pub median: f32,
    /// How light the photo is.
    pub class: KeyClass,
    /// The interquartile range of the photo, with its range normalized to 0 to 1.
    pub iqr: f32,
    /// Otsu's eta: how much of the spread of the tones two groups explain, 0 to 1.
    pub eta: f32,
    /// The tones are two humps (a light face on a dark ground).
    pub bimodal: bool,
    /// The top of the photo is a thin spike.
    pub spike: bool,
}

impl Auto {
    /// The answer as the numbers a caller gets: key, contrast, highlights, median L*, class
    /// (0 low, 1 mid, 2 high), the IQR, eta, bimodal (0 or 1) and spike (0 or 1).
    pub(crate) fn numbers(&self) -> [f64; 9] {
        [
            f64::from(self.key),
            f64::from(self.contrast),
            f64::from(self.highlights),
            f64::from(self.median),
            self.class as u8 as f64,
            f64::from(self.iqr),
            f64::from(self.eta),
            f64::from(u8::from(self.bimodal)),
            f64::from(u8::from(self.spike)),
        ]
    }
}

/// The class of a photo by its median L*.
fn class_of(median: f32) -> KeyClass {
    if median < LOW_KEY_BELOW {
        KeyClass::Low
    } else if median > HIGH_KEY_ABOVE {
        KeyClass::High
    } else {
        KeyClass::Mid
    }
}

/// The histogram of the L* values `smooth` (0 to 100), in [`BINS`] bins.
fn histogram(smooth: &[f32]) -> [u64; BINS] {
    let mut hist = [0u64; BINS];
    for &v in smooth {
        hist[(v / 100.0 * (BINS - 1) as f32)
            .round()
            .clamp(0.0, (BINS - 1) as f32) as usize] += 1;
    }
    hist
}

/// The histogram smoothed by a box of [`HIST_SMOOTH`] bins each way.
fn smoothed(hist: &[u64; BINS]) -> Vec<f32> {
    (0..BINS)
        .map(|i| {
            let (a, b) = (
                i.saturating_sub(HIST_SMOOTH),
                (i + HIST_SMOOTH + 1).min(BINS),
            );
            hist[a..b].iter().sum::<u64>() as f32 / (b - a) as f32
        })
        .collect()
}

/// The index (offset by `from`) of the highest count of `part`, the first on a tie. Not empty.
fn peak_of(part: &[f32], from: usize) -> usize {
    let mut best = 0;
    for (i, &c) in part.iter().enumerate() {
        if c > part[best] {
            best = i;
        }
    }
    from + best
}

/// Otsu's eta of a histogram and whether the photo is two humps: `(eta, bimodal)`. A photo is
/// bimodal when eta is at least [`ETA_BIMODAL`], each side of the Otsu cut holds at least
/// [`CLASS_MIN`] of the pixels and the histogram has a valley between them (see [`has_valley`]).
fn two_humps(hist: &[u64; BINS]) -> (f32, bool) {
    let total: u64 = hist.iter().sum();
    let n = total as f64;
    let Some((cut, between)) = otsu_split(hist, f64::MIN_POSITIVE) else {
        return (0.0, false);
    };
    let mean = hist
        .iter()
        .enumerate()
        .map(|(i, &c)| i as f64 * c as f64)
        .sum::<f64>()
        / n;
    let var = hist
        .iter()
        .enumerate()
        .map(|(i, &c)| (i as f64 - mean).powi(2) * c as f64)
        .sum::<f64>()
        / n;
    // `between` is `n0 n1 / n (m0 - m1)^2 / n`: the between-class variance
    let eta = if var > 0.0 { between / n / var } else { 0.0 };
    let low = hist[..=cut].iter().sum::<u64>() as f64 / n;
    let bimodal =
        eta >= ETA_BIMODAL && low.min(1.0 - low) >= CLASS_MIN && has_valley(&smoothed(hist), cut);
    (eta as f32, bimodal)
}

/// Does the smoothed histogram dip at the Otsu `cut`? The peaks of the two sides are found, and
/// the lowest count between them must be at most [`VALLEY_MAX`] of the lower peak. Otsu's
/// between-class variance is the same all across an empty gap and the first bin of it wins, so the
/// cut can sit at the foot of the left hump: the right side starts after the bins the smoothing
/// carries over from the left hump, and the valley is the lowest count between the peaks.
fn has_valley(smooth: &[f32], cut: usize) -> bool {
    let right_from = cut + 1 + HIST_SMOOTH;
    if right_from >= smooth.len() {
        return false;
    }
    let left = peak_of(&smooth[..=cut], 0);
    let right = peak_of(&smooth[right_from..], right_from);
    let floor = smooth[left..=right]
        .iter()
        .copied()
        .fold(f32::INFINITY, f32::min);
    floor <= VALLEY_MAX * smooth[left].min(smooth[right])
}

/// Key, 0 to 100, that moves the middle of the photo (`median_x`, 0 to 1) a part of the way to the
/// middle of the range: the bias `b` that takes `median_x` to the target is solved, and Key is its
/// stops `log2(b / (1 - b))`, at most [`AUTO_KEY_STOPS`] either side, on the Key scale (50 plus
/// or minus 50 for [`KEY_STOPS`]).
fn key_for(median_x: f32) -> u8 {
    let target = NEUTRAL + KEY_PULL * (median_x - NEUTRAL);
    // `1 / b - 1 = 1 + (m - t) / (t (1 - m))`, and `b / (1 - b)` is its inverse
    let odds_inverse = 1.0 + (median_x - target) / (target * (1.0 - median_x));
    let stops = (-libm::log2f(odds_inverse)).clamp(-AUTO_KEY_STOPS, AUTO_KEY_STOPS);
    (50.0 + 50.0 * stops / KEY_STOPS).round() as u8
}

/// Contrast, 0 to 100, that spreads the middle half of the photo (`iqr`, of the range 0 to 1) to
/// [`IQR_TARGET`]: the slope is clamped to [`SLOPE_RANGE`] (and to 1 or less for two humps, which
/// already have a spread), and Contrast is 50 plus 50 times its log2.
fn contrast_for(iqr: f32, bimodal: bool) -> u8 {
    let slope = (IQR_TARGET / iqr).clamp(SLOPE_RANGE.0, SLOPE_RANGE.1);
    let slope = if bimodal { slope.min(1.0) } else { slope };
    (50.0 + 50.0 * libm::log2f(slope)).round() as u8
}

/// Reads the smoothed L* `smooth` of a photo (the lightness the Pencil view draws from) and sets
/// Key, Contrast and Highlights from it. The photo is normalized by its range (1st to 99th
/// percentile, the Highlights start), as the tone curve does.
pub(super) fn auto(smooth: &[f32]) -> Auto {
    let sorted = Sorted::new(smooth);
    let (lo, hi) = range(&sorted, 0.99);
    let norm = |q: f64| ((sorted.at(q) - lo) / (hi - lo)).clamp(0.0, 1.0);
    let median = sorted.at(0.5);
    let class = class_of(median);
    let (eta, bimodal) = two_humps(&histogram(smooth));
    let iqr = norm(0.75) - norm(0.25);
    let spike = sorted.at(0.999) - sorted.at(0.97) > SPIKE_OVER;
    let highlights = HIGHLIGHTS[class as usize] + if spike { SPIKE_EXTRA } else { 0 };
    Auto {
        key: if bimodal { 50 } else { key_for(norm(0.5)) },
        contrast: contrast_for(iqr, bimodal),
        highlights: highlights.min(HIGHLIGHTS_MAX),
        median,
        class,
        iqr,
        eta,
        bimodal,
        spike,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A ramp of `n` L* values from `a` to `b`.
    fn ramp(a: f32, b: f32, n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| a + (b - a) * i as f32 / (n - 1) as f32)
            .collect()
    }

    #[test]
    fn test_the_class_follows_the_median() {
        assert_eq!(auto(&ramp(5.0, 60.0, 1000)).class, KeyClass::Low);
        assert_eq!(auto(&ramp(10.0, 90.0, 1000)).class, KeyClass::Mid);
        assert_eq!(auto(&ramp(50.0, 98.0, 1000)).class, KeyClass::High);
        assert_eq!(class_of(35.0), KeyClass::Mid);
        assert_eq!(class_of(65.0), KeyClass::Mid);
    }

    #[test]
    fn test_a_dark_photo_is_lifted_and_a_light_one_is_dropped() {
        let dark = auto(&ramp(2.0, 60.0, 1000));
        let light = auto(&ramp(40.0, 98.0, 1000));
        // a ramp that sits low in its own range is not what lifts: the middle of the ramp is the
        // middle of its range, so a plain ramp stays at 50
        assert_eq!((dark.key, light.key), (50, 50));
        // a photo whose middle is under the middle of its range is lifted, over it dropped
        let mut low: Vec<f32> = ramp(10.0, 90.0, 1000);
        low.extend(vec![15.0; 1500]);
        let mut high: Vec<f32> = ramp(10.0, 90.0, 1000);
        high.extend(vec![85.0; 1500]);
        assert!(auto(&low).key > 50, "{}", auto(&low).key);
        assert!(auto(&high).key < 50, "{}", auto(&high).key);
    }

    #[test]
    fn test_key_is_solved_so_the_middle_moves_half_way_to_the_middle() {
        assert_eq!(key_for(0.5), 50);
        // the median at 0.2: target 0.35; the bias that takes 0.2 to 0.35 is about 1.1 stops,
        // held to Auto's 1 stop, which is a quarter of the Key scale (2 stops either side)
        assert_eq!(key_for(0.2), 75);
        assert_eq!(key_for(0.8), 25);
        let (a, b) = (key_for(0.4), key_for(0.3));
        assert!(50 < a && a < b && b <= 75, "{a} {b}");
        // the ends of the range do not divide by zero
        assert_eq!((key_for(0.0), key_for(1.0)), (75, 25));
    }

    #[test]
    fn test_a_narrow_middle_gets_more_contrast_and_a_wide_one_less() {
        assert_eq!(contrast_for(0.45, false), 50);
        assert!(contrast_for(0.2, false) > 50);
        assert_eq!(contrast_for(0.0, false), 100);
        assert_eq!(contrast_for(0.9, false), contrast_for(5.0, false));
        assert!(contrast_for(0.9, false) < 50);
        // two humps never get more
        assert_eq!(contrast_for(0.2, true), 50);
        assert!(contrast_for(0.9, true) < 50);
    }

    #[test]
    fn test_two_humps_are_found_and_one_hump_or_a_ramp_is_not() {
        let mut two = vec![20.0f32; 500];
        two.extend(vec![80.0f32; 500]);
        let a = auto(&two);
        assert!(a.bimodal, "{a:?}");
        assert!(a.eta > 0.8);
        assert_eq!(a.key, 50);
        assert!(a.contrast <= 50);
        // a ramp is uniform: eta 0.75, no valley
        let r = auto(&ramp(0.0, 100.0, 1000));
        assert!(!r.bimodal, "{r:?}");
        // one small hump does not count: a class under 15 percent
        let mut small = vec![30.0f32; 100];
        small.extend(vec![70.0f32; 900]);
        assert!(!auto(&small).bimodal);
        // a flat photo does not panic
        assert!(!auto(&[40.0; 50]).bimodal);
    }

    #[test]
    fn test_highlights_follow_the_key_and_a_spike_adds_one() {
        let mid = auto(&ramp(10.0, 90.0, 1000));
        let high = auto(&ramp(50.0, 98.0, 1000));
        let low = auto(&ramp(2.0, 60.0, 1000));
        assert_eq!((low.highlights, mid.highlights, high.highlights), (1, 2, 5));
        // 99.9th over the 97th by more than 10 L*: a glint on a plain photo
        let mut glint = ramp(30.0, 60.0, 2000);
        glint.extend(vec![98.0; 8]);
        let g = auto(&glint);
        assert!(g.spike);
        assert_eq!(g.highlights, 2 + SPIKE_EXTRA);
        assert!(!mid.spike);
    }

    #[test]
    fn test_the_numbers_are_in_range_and_repeat() {
        let photos = [
            ramp(0.0, 100.0, 500),
            ramp(0.0, 10.0, 500),
            ramp(90.0, 100.0, 500),
            vec![50.0; 500],
        ];
        for p in &photos {
            let a = auto(p);
            let n = a.numbers();
            assert!(
                a.key <= 100 && a.contrast <= 100 && a.highlights <= 25,
                "{a:?}"
            );
            assert!(
                (0.0..=1.0).contains(&n[5]) && (0.0..=1.0).contains(&n[6]),
                "{n:?}"
            );
            assert_eq!(a, auto(p));
        }
        assert_eq!(auto(&ramp(10.0, 90.0, 500)).numbers()[4], 1.0);
    }
}
