//! Suggest pencils: the best subset of the eight pencils for a photo, for a count of 3 to 6. There
//! are only C(8, k) subsets (at most 70), so the best one is found exactly, by trying them all.
//! The score is the quantization error of the photo's tones (as in Lloyd-Max and Wu's color
//! quantizer, with the levels fixed to the tones of the pencils).

use super::grades::{GRADES, PAPER, TONES};
use super::tone::range;
use crate::filters::Sorted;

/// The number of bins of the tone histogram.
const BINS: usize = 256;

/// The histogram of the photo's ideal tones: the smoothed L* stretched from the [`range`] of the
/// photo (1st to 99th percentile) onto the range of the pencils, the darkest pencil to paper, in
/// [`BINS`] bins of equal width.
fn histogram(smooth: &[f32]) -> [u64; BINS] {
    let (lo, hi) = range(&Sorted::new(smooth), 0.99);
    let mut hist = [0u64; BINS];
    for &v in smooth {
        let x = ((v - lo) / (hi - lo)).clamp(0.0, 1.0);
        hist[(x * (BINS - 1) as f32).round() as usize] += 1;
    }
    hist
}

/// The ideal tone (L*) at the middle of bin `b`: from the darkest pencil (bin 0) to paper.
fn ideal(b: usize) -> f64 {
    let (first, last) = (f64::from(TONES[0]), f64::from(PAPER));
    first + (last - first) * b as f64 / (BINS - 1) as f64
}

/// The tones of the pencils in `mask` (bit 0 the 9B), then paper, darkest first.
fn tones_of(mask: u32) -> Vec<f64> {
    (0..GRADES as usize)
        .filter(|&i| mask >> i & 1 == 1)
        .map(|i| f64::from(TONES[i]))
        .chain(std::iter::once(f64::from(PAPER)))
        .collect()
}

/// The total weighted squared error of drawing the photo with the pencils of `mask`. The draw maps
/// the photo onto the range of the set (its darkest pencil to paper), so the ideal tone `u` of a
/// bin lands at `u'` and is drawn in the level nearest `u'`; its error is `(u - level)^2` times the
/// pixels of the bin. Sums of whole counts in f64, so the sum is the same on every platform.
fn error(hist: &[u64; BINS], mask: u32) -> f64 {
    let levels = tones_of(mask);
    let (first, darkest) = (f64::from(TONES[0]), levels[0]);
    let (span, set_span) = (f64::from(PAPER) - first, f64::from(PAPER) - darkest);
    let mut total = 0.0;
    for (b, &n) in hist.iter().enumerate() {
        let u = ideal(b);
        let landed = darkest + (u - first) * set_span / span;
        let nearest = levels
            .iter()
            .copied()
            .reduce(|best, l| {
                if (l - landed).abs() < (best - landed).abs() {
                    l
                } else {
                    best
                }
            })
            .unwrap_or(darkest);
        total += (u - nearest).powi(2) * n as f64;
    }
    total
}

/// The smallest gap between two neighbor levels of the set, paper included.
fn min_gap(mask: u32) -> f64 {
    let levels = tones_of(mask);
    levels
        .windows(2)
        .map(|t| t[1] - t[0])
        .fold(f64::INFINITY, f64::min)
}

/// The numbers of the pencils in `mask`, rising: the list that breaks the last tie.
fn bits(mask: u32) -> Vec<u32> {
    (0..GRADES).filter(|&i| mask >> i & 1 == 1).collect()
}

/// Is the set `a` better than `b`? Each is a mask with its error. Less error wins, then the larger
/// smallest gap between tones, then the smaller list of pencil numbers.
fn better(a: (u32, f64), b: (u32, f64)) -> bool {
    a.1.total_cmp(&b.1)
        .then_with(|| min_gap(b.0).total_cmp(&min_gap(a.0)))
        .then_with(|| bits(a.0).cmp(&bits(b.0)))
        .is_lt()
}

/// The set of `count` pencils with the least error, and its error. `None` for a `count` that no
/// set of the eight pencils has (0, or over 8).
fn best(hist: &[u64; BINS], count: u32) -> Option<(u32, f64)> {
    (1..1u32 << GRADES)
        .filter(|m| m.count_ones() == count)
        .map(|m| (m, error(hist, m)))
        .reduce(|a, b| if better(b, a) { b } else { a })
}

/// The mask (bit 0 the 9B) of the `count` pencils that best fit the photo `smooth` (its smoothed
/// L*). `None` for a `count` of 0 or over the eight pencils.
pub(super) fn suggest(smooth: &[f32], count: u32) -> Option<u32> {
    best(&histogram(smooth), count).map(|(mask, _)| mask)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A histogram with `n` pixels at each of the bins.
    fn at(bins: &[(usize, u64)]) -> [u64; BINS] {
        let mut h = [0u64; BINS];
        for &(b, n) in bins {
            h[b] = n;
        }
        h
    }

    #[test]
    fn test_the_best_set_for_a_photo_of_the_pencil_tones_is_those_pencils() {
        // pixels only at the tones of the 9B, 2B, H and 4H (and paper): that set has no error
        let tone_bin = |l: f32| ((f64::from(l) - 17.0) / 78.0 * 255.0).round() as usize;
        let h = at(&[
            (tone_bin(TONES[0]), 100),
            (tone_bin(TONES[3]), 100),
            (tone_bin(TONES[5]), 100),
            (tone_bin(TONES[7]), 100),
            (255, 100),
        ]);
        let (mask, err) = best(&h, 4).unwrap();
        assert_eq!(mask, 0b1010_1001);
        // a bin sits within half a bin of its tone: the error is that rounding only
        assert!(err < 500.0 * 0.2f64.powi(2) * 5.0, "{err}");
    }

    #[test]
    fn test_a_light_photo_gets_the_light_pencils_and_a_dark_one_the_soft() {
        // all the weight in the lightest third of the tones: soft pencils would be wasted
        let light = at(&[(170, 500), (200, 500), (230, 500), (255, 500)]);
        let dark = at(&[(0, 500), (30, 500), (60, 500), (90, 500)]);
        let (l, d) = (best(&light, 3).unwrap().0, best(&dark, 3).unwrap().0);
        // the darkest pencil of the set is mapped to the darkest tone, so it always matters:
        // the light photo has its pencils from the middle up, the dark one keeps the 9B
        assert!(d & 1 == 1, "{d:#b}");
        assert!(l.leading_zeros() <= d.leading_zeros(), "{l:#b} {d:#b}");
    }

    #[test]
    fn test_a_set_of_the_asked_size_and_less_error_with_more_pencils() {
        // a spread of tones, seeded
        let mut seed = 99u32;
        let h: Vec<(usize, u64)> = (0..40)
            .map(|_| {
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((seed >> 8) as usize % BINS, u64::from(seed >> 24) + 1)
            })
            .collect();
        let hist = at(&h);
        let mut last = f64::INFINITY;
        for count in 1..=8 {
            let (mask, err) = best(&hist, count).unwrap();
            assert_eq!(mask.count_ones(), count);
            assert!(err <= last + 1e-6, "{count}: {err} {last}");
            last = err;
        }
        assert!(best(&hist, 0).is_none() && best(&hist, 9).is_none());
        // the same input, the same set
        assert_eq!(best(&hist, 5), best(&hist, 5));
    }

    #[test]
    fn test_ties_go_to_the_wider_gap_then_the_smaller_list() {
        // no pixels: every set has the error 0, so the widest smallest gap wins, then the list
        let (mask, err) = best(&[0u64; BINS], 3).unwrap();
        assert_eq!(err, 0.0);
        let widest = (1..256u32)
            .filter(|m| m.count_ones() == 3)
            .map(min_gap)
            .fold(0.0, f64::max);
        assert_eq!(min_gap(mask), widest);
        // less error wins first
        assert!(better((0b1011, 1.0), (0b111, 2.0)));
        // then the wider smallest gap: 9B, 5B (gap 20) against 9B, 7B, 5B (gap 9)
        assert!(better((0b101, 1.0), (0b111, 1.0)));
        // then the smaller list: 9B, 7B, 5B and 9B, 7B, 2B both have the smallest gap 9
        assert_eq!(min_gap(0b0111), min_gap(0b1011));
        assert!(better((0b0111, 1.0), (0b1011, 1.0)));
        assert!(!better((0b1011, 1.0), (0b0111, 1.0)));
    }

    #[test]
    fn test_suggest_reads_a_photo_and_refuses_a_bad_count() {
        let smooth: Vec<f32> = (0..1000).map(|i| i as f32 / 10.0).collect();
        for count in 3..=6 {
            let mask = suggest(&smooth, count).unwrap();
            assert_eq!(mask.count_ones(), count);
            assert!((1..256).contains(&mask));
        }
        assert_eq!(suggest(&smooth, 0), None);
        assert_eq!(suggest(&smooth, 9), None);
        // a flat photo does not panic
        assert!(suggest(&[50.0; 64], 4).is_some());
    }
}
