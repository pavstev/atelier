//! What Drawing and Hatch share: how dark a tone is, how hard a stroke presses at that darkness,
//! how graphite sits on the paper tooth, and the hold that keeps the local mean at the tone.

use super::grades::PAPER;
use super::paper::scale;
use crate::filters::box_mean;

/// The radius of the box of the hold, in px at a long side of 1024 (a 17 px window, close to the
/// 16 px patch the tone is judged in).
const HOLD_RADIUS: f32 = 8.0;
/// The passes of the hold: the second one takes up what the first left at a clipped stroke.
const HOLD_PASSES: usize = 2;
/// A box mean under this darkness counts as paper: the hold leaves it alone.
const HOLD_FLOOR: f32 = 1e-4;

/// The L* of the darkest tone of the picture, at most `PAPER - 1` (a flat paper picture has no
/// ink). The ink never goes darker than this, so nothing is darker than the darkest pencil in use.
pub(crate) fn darkest(tone: &[f32]) -> f32 {
    tone.iter().copied().fold(PAPER, f32::min).min(PAPER - 1.0)
}

/// How dark the tone `l` is, 0 (paper) to 1 (the `darkest` tone).
pub(crate) fn darkness(l: f32, darkest: f32) -> f32 {
    ((PAPER - l) / (PAPER - darkest)).clamp(0.0, 1.0)
}

/// The L* of the darkness `d`, the way [`darkness`] reads it.
pub(crate) fn tone_of(d: f32, darkest: f32) -> f32 {
    PAPER - d * (PAPER - darkest)
}

/// The pressure at the darkness `d`: the share of the tooth the lead touches. Light work touches
/// few peaks; heavy work fills the whole tooth.
pub(crate) fn pressure(d: f32) -> f32 {
    d.sqrt()
}

/// The share of a peak's darkness a pit of the tooth keeps in the lightest work. Graphite is
/// smeared into the pits, so even a light layer is not a sparse speckle on bare paper.
const PIT_BASE: f32 = 0.35;

/// The factor on the darkness of a stroke that the tooth gives where the lead covers `a` (0 to 1)
/// of it. A pit keeps a share of a peak's darkness: [`PIT_BASE`] in the lightest work, all of it
/// at full darkness (a burnished layer is flat). The mean of the factor over an even tooth is 1
/// for the coverage share `share` (the mean of `a`), so the tone holds.
pub(crate) fn grain_factor(a: f32, share: f32, d: f32) -> f32 {
    let pit = PIT_BASE + (1.0 - PIT_BASE) * d;
    let mean = pit + (1.0 - pit) * share;
    if mean <= f32::EPSILON {
        return 1.0;
    }
    (pit + (1.0 - pit) * a) / mean
}

/// The smoothstep curve between `e0` and `e1`.
pub(crate) fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// The share of the tooth height `h` (0 to 1) the lead of pressure `p` covers: the peaks above
/// `1 - p`, with an edge `w` wide in height (the lay of a soft lead is smooth). The edge is cut
/// back to fit inside 0 to 1, so the mean of the coverage over an even tooth is exactly `p`.
pub(crate) fn lay(h: f32, p: f32, w: f32) -> f32 {
    let w = w.min(p).min(1.0 - p);
    if w <= 0.0 {
        return f32::from(h >= 1.0 - p);
    }
    smoothstep(1.0 - p - w, 1.0 - p + w, h)
}

/// Scales `dark` (darkness, 0 to 1) so its box mean follows the box mean of `target`: a patch that
/// came out too dark or too light by chance of the tooth or the strokes is eased back. A stroke
/// never goes past full darkness, and the scale stays within `limit` (over 1) and its inverse: a
/// bigger limit holds the tone better and may blacken a stroke that stands alone.
pub(crate) fn hold_mean(dark: &mut [f32], target: &[f32], (w, h): (usize, usize), limit: f32) {
    let radius = (HOLD_RADIUS * scale(w, h)) as usize;
    let want = box_mean(target, w, h, radius);
    for _ in 0..HOLD_PASSES {
        let have = box_mean(dark, w, h, radius);
        for ((d, &t), &a) in dark.iter_mut().zip(&want).zip(&have) {
            if a > HOLD_FLOOR {
                *d = (*d * (t / a).clamp(1.0 / limit, limit)).min(1.0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_darkest_is_the_darkest_tone_and_stays_under_paper() {
        assert!((darkest(&[40.0, 17.0, 80.0]) - 17.0).abs() < 1e-6);
        assert!((darkest(&[PAPER, PAPER]) - (PAPER - 1.0)).abs() < 1e-6);
    }

    #[test]
    fn test_darkness_and_tone_of_are_inverse() {
        for l in [17.0f32, 40.0, 70.0, 95.0] {
            assert!((tone_of(darkness(l, 17.0), 17.0) - l).abs() < 1e-4);
        }
        assert!(darkness(10.0, 17.0) <= 1.0);
        assert!(darkness(99.0, 17.0) >= 0.0);
    }

    #[test]
    fn test_pressure_runs_from_nothing_to_the_whole_tooth() {
        assert_eq!(pressure(0.0), 0.0);
        assert!((pressure(1.0) - 1.0).abs() < 1e-6);
        assert!(pressure(0.25) > 0.25);
    }

    #[test]
    fn test_the_grain_factor_has_a_mean_of_one() {
        for d in [0.05f32, 0.4, 0.9] {
            let p = pressure(d);
            let n = 10_000;
            let mean: f32 = (0..n)
                .map(|i| grain_factor(lay((i as f32 + 0.5) / n as f32, p, 0.2), p, d))
                .sum::<f32>()
                / n as f32;
            assert!((mean - 1.0).abs() < 0.01, "{d}: {mean}");
        }
        // full darkness is flat
        assert!((grain_factor(1.0, 1.0, 1.0) - 1.0).abs() < 1e-6);
        assert_eq!(grain_factor(0.0, 0.0, 0.0), 1.0);
    }

    #[test]
    fn test_lay_covers_the_share_p_of_an_even_tooth() {
        for p in [0.1f32, 0.5, 0.9] {
            for w in [0.0f32, 0.05, 0.3] {
                let n = 10_000;
                let mean: f32 = (0..n)
                    .map(|i| lay((i as f32 + 0.5) / n as f32, p, w))
                    .sum::<f32>()
                    / n as f32;
                assert!((mean - p).abs() < 0.005, "p {p} w {w}: {mean}");
            }
        }
        assert!((lay(0.5, 1.0, 0.1) - 1.0).abs() < 1e-6);
        assert!(lay(0.5, 0.0, 0.1).abs() < 1e-6);
    }

    #[test]
    fn test_hold_mean_eases_a_dark_patch_back() {
        let (w, h) = (64, 64);
        let target = vec![0.3; w * h];
        let mut dark: Vec<f32> = (0..w * h)
            .map(|i| if i % 2 == 0 { 0.8 } else { 0.2 })
            .collect();
        hold_mean(&mut dark, &target, (w, h), 3.0);
        let mean = dark.iter().sum::<f32>() / dark.len() as f32;
        assert!((mean - 0.3).abs() < 0.02, "{mean}");
        assert!(dark.iter().all(|&d| d <= 1.0));
    }

    #[test]
    fn test_hold_mean_leaves_paper_and_flat_alone() {
        let mut paper = vec![0.0; 32 * 32];
        hold_mean(&mut paper, &vec![0.2; 32 * 32], (32, 32), 3.0);
        assert!(paper.iter().all(|&d| d == 0.0));
        let mut flat = vec![0.4; 32 * 32];
        hold_mean(&mut flat, &vec![0.4; 32 * 32], (32, 32), 3.0);
        assert!(flat.iter().all(|&d| (d - 0.4).abs() < 1e-5));
    }
}
