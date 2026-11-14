//! The Drawing look: the tone laid on the paper tooth. Graphite catches the peaks first, so a light
//! tone is a few soft peaks and a dark tone fills the tooth; a soft grade lays smoother than a hard
//! one. The tone of a patch stays the tone.

use super::grades::TONES;
use super::ink::{darkest, darkness, grain_factor, hold_mean, lay, pressure, tone_of};
use super::paper::Paper;

/// The width of the coverage edge on each paper, as a share of the tooth height: rough paper is
/// crisp, smooth paper is soft.
fn paper_edge(paper: Paper) -> f32 {
    match paper {
        Paper::Smooth => 0.30,
        Paper::Medium => 0.22,
        Paper::Rough => 0.12,
    }
}
/// The most the hold may scale the grain of a patch: a pit may deepen a lot, the grain is soft.
const HOLD_LIMIT: f32 = 3.0;
/// What the softest grade adds to the edge width, as a share of the tooth height.
const SOFT_EDGE: f32 = 0.15;
/// The L* under which graphite shows its sheen.
const SHEEN_UNDER: f32 = 30.0;
/// The L* span over which the sheen grows from nothing to full under [`SHEEN_UNDER`].
const SHEEN_RAMP: f32 = 10.0;
/// The most the sheen moves a pixel, in L*.
const SHEEN_MAX: f32 = 2.0;
/// The slope of the tooth (height per px) at which the sheen is at its most.
const SHEEN_SLOPE: f32 = 0.25;
/// The light of the sheen: from the upper left, a unit vector `(x, y)` with y down.
const LIGHT: (f32, f32) = (
    -std::f32::consts::FRAC_1_SQRT_2,
    -std::f32::consts::FRAC_1_SQRT_2,
);

/// How soft the grade at the tone `l` is, 1 for the 9B to 0 for the 4H and lighter, in between a
/// straight line between the grade tones.
fn softness(l: f32) -> f32 {
    let last = TONES.len() - 1;
    if l <= TONES[0] {
        return 1.0;
    }
    if l >= TONES[last] {
        return 0.0;
    }
    let k = TONES.partition_point(|&t| t <= l) - 1;
    let t = (l - TONES[k]) / (TONES[k + 1] - TONES[k]);
    1.0 - (k as f32 + t) / last as f32
}

/// The sheen of a pixel of tone `l` with coverage `a`: zero mean, because it follows the slope of
/// the tooth, and only in the deepest tones. In L*, at most [`SHEEN_MAX`].
fn sheen(l: f32, a: f32, slope: (f32, f32)) -> f32 {
    let weight = ((SHEEN_UNDER - l) / SHEEN_RAMP).clamp(0.0, 1.0);
    let lit = (slope.0 * LIGHT.0 + slope.1 * LIGHT.1) / SHEEN_SLOPE;
    SHEEN_MAX * weight * a * a * lit.clamp(-1.0, 1.0)
}

/// The slope of the tooth at pixel `(x, y)`: central differences, one sided at the border.
fn slope(tooth: &[f32], w: usize, h: usize, x: usize, y: usize) -> (f32, f32) {
    let at = |x: usize, y: usize| tooth[y * w + x];
    let (x0, x1) = (x.saturating_sub(1), (x + 1).min(w - 1));
    let (y0, y1) = (y.saturating_sub(1), (y + 1).min(h - 1));
    (
        (at(x1, y) - at(x0, y)) / (x1 - x0).max(1) as f32,
        (at(x, y1) - at(x, y0)) / (y1 - y0).max(1) as f32,
    )
}

/// The shown L* of the Drawing look, per pixel. `tone` is the Tone picture (L*), `tooth` the paper
/// tooth of the same size, `grain` 0 (the flat tone) to 1 (all the grain). The 16 px box mean of
/// the result follows `tone`; no pixel is darker than the darkest of `tone` (the sheen keeps to it).
pub(crate) fn draw(
    tone: &[f32],
    w: usize,
    h: usize,
    tooth: &[f32],
    grain: f32,
    paper: Paper,
) -> Vec<f32> {
    if grain <= 0.0 {
        return tone.to_vec();
    }
    let dark = darkest(tone);
    let flat: Vec<f32> = tone.iter().map(|&l| darkness(l, dark)).collect();
    let edge = paper_edge(paper);
    let mut cover = Vec::with_capacity(tone.len());
    let mut shown: Vec<f32> = Vec::with_capacity(tone.len());
    for ((&l, &d), &t) in tone.iter().zip(&flat).zip(tooth) {
        let p = pressure(d);
        let a = lay(t, p, edge + SOFT_EDGE * softness(l));
        cover.push(a);
        shown.push((d * (1.0 + grain * (grain_factor(a, p, d) - 1.0))).min(1.0));
    }
    hold_mean(&mut shown, &flat, (w, h), HOLD_LIMIT);
    let mut out = Vec::with_capacity(tone.len());
    for (i, &d) in shown.iter().enumerate() {
        let l = tone_of(d, dark);
        let s = sheen(tone[i], cover[i], slope(tooth, w, h, i % w, i / w));
        out.push((l + grain * s).max(dark));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::grades::PAPER;
    use super::super::paper::tooth;
    use super::*;

    /// The mean of the `size` px box at `(x0, y0)`.
    fn box_at(v: &[f32], w: usize, (x0, y0): (usize, usize), size: usize) -> f32 {
        let mut s = 0.0;
        for y in y0..y0 + size {
            for x in x0..x0 + size {
                s += v[y * w + x];
            }
        }
        s / (size * size) as f32
    }

    /// The mean and the largest gap between the 16 px box means of `shown` and `tone` over a grid
    /// of boxes. The hold works on a 17 px window, so a 16 px box may be off by a little.
    fn gaps(shown: &[f32], tone: &[f32], w: usize, h: usize) -> (f32, f32) {
        let (mut sum, mut worst, mut n) = (0.0f32, 0.0f32, 0.0f32);
        for y in (0..=h - 16).step_by(8) {
            for x in (0..=w - 16).step_by(8) {
                let gap = (box_at(shown, w, (x, y), 16) - box_at(tone, w, (x, y), 16)).abs();
                sum += gap;
                worst = worst.max(gap);
                n += 1.0;
            }
        }
        (sum / n, worst)
    }

    #[test]
    fn test_softness_runs_from_the_9b_to_the_4h() {
        assert!((softness(10.0) - 1.0).abs() < 1e-6);
        assert!(softness(TONES[7] + 5.0).abs() < 1e-6);
        assert!((softness(TONES[3]) - (1.0 - 3.0 / 7.0)).abs() < 1e-5);
        assert!(softness(30.0) > softness(60.0));
    }

    #[test]
    fn test_sheen_is_small_zero_mean_and_only_in_the_deepest_tones() {
        assert_eq!(sheen(50.0, 1.0, (0.3, 0.3)), 0.0);
        assert_eq!(sheen(20.0, 0.0, (0.3, 0.3)), 0.0);
        let up = sheen(17.0, 1.0, (0.4, 0.4));
        let down = sheen(17.0, 1.0, (-0.4, -0.4));
        assert!((up + down).abs() < 1e-6);
        assert!(up.abs() <= SHEEN_MAX + 1e-6);
    }

    #[test]
    fn test_a_ramp_keeps_the_local_mean() {
        let (w, h) = (256, 128);
        let tone: Vec<f32> = (0..w * h)
            .map(|i| 17.0 + 78.0 * (i % w) as f32 / (w - 1) as f32)
            .collect();
        for paper in [Paper::Smooth, Paper::Medium, Paper::Rough] {
            let t = tooth(w, h, paper, 45.0);
            let shown = draw(&tone, w, h, &t, 1.0, paper);
            let (mean, worst) = gaps(&shown, &tone, w, h);
            assert!(mean < 0.5 && worst < 2.5, "{paper:?}: {mean} {worst}");
        }
    }

    #[test]
    fn test_a_flat_dark_patch_keeps_the_local_mean() {
        let (w, h) = (96, 96);
        for l in [26.0f32, 37.0, 60.0] {
            let mut tone = vec![l; w * h];
            tone[0] = 17.0;
            let t = tooth(w, h, Paper::Medium, 45.0);
            let shown = draw(&tone, w, h, &t, 1.0, Paper::Medium);
            let (mean, worst) = gaps(&shown, &tone, w, h);
            assert!(mean < 0.5 && worst < 2.0, "{l}: {mean} {worst}");
        }
    }

    #[test]
    fn test_grain_zero_is_the_flat_tone_and_grain_adds_texture() {
        let (w, h) = (64, 64);
        let tone: Vec<f32> = (0..w * h).map(|i| 30.0 + (i % w) as f32).collect();
        let t = tooth(w, h, Paper::Medium, 45.0);
        assert_eq!(draw(&tone, w, h, &t, 0.0, Paper::Medium), tone);
        let half = draw(&tone, w, h, &t, 0.5, Paper::Medium);
        let full = draw(&tone, w, h, &t, 1.0, Paper::Medium);
        let spread = |v: &[f32]| v.iter().zip(&tone).map(|(a, b)| (a - b).abs()).sum::<f32>();
        assert!(spread(&half) > 0.0 && spread(&full) > spread(&half));
    }

    #[test]
    fn test_nothing_is_darker_than_the_darkest_tone() {
        let (w, h) = (64, 64);
        let tone: Vec<f32> = (0..w * h).map(|i| 26.0 + (i % w) as f32).collect();
        let t = tooth(w, h, Paper::Smooth, 0.0);
        let shown = draw(&tone, w, h, &t, 1.0, Paper::Smooth);
        assert!(shown.iter().all(|&l| l >= 26.0 - 1e-4));
        assert!(shown.iter().all(|&l| l <= PAPER + 1e-4));
    }

    #[test]
    fn test_same_input_same_picture() {
        let (w, h) = (48, 48);
        let tone: Vec<f32> = (0..w * h).map(|i| 20.0 + (i % w) as f32 * 1.5).collect();
        let t = tooth(w, h, Paper::Rough, 60.0);
        assert_eq!(
            draw(&tone, w, h, &t, 0.7, Paper::Rough),
            draw(&tone, w, h, &t, 0.7, Paper::Rough)
        );
    }
}
