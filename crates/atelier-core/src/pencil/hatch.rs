//! The Hatch look: the tone drawn as long graphite lines. Each line is a pencil gray set by the
//! tone, so light skin gets faint lines and the lines only turn black in the darks. Lines follow
//! the form where it is clear and run straight at the Hatch angle where it is not. A line shows
//! when the tone is darker than the line's own threshold (the Praun nesting, by a position hash),
//! and a dark tone gets a second layer across the first.

use super::ink::{darkest, darkness, grain_factor, hold_mean, lay, pressure, smoothstep, tone_of};
use super::paper::{hash, scale};
use crate::edges::field::{Field, bil, structure_field};
use std::f32::consts::PI;

/// The line spacing at density 0 and at density 1, in px at a long side of 1024.
const SPACING: (f32, f32) = (7.0, 3.0);
/// The sigma of the structure tensor, in px at a long side of 1024 (2.7 percent): only a shape
/// bends the lines, not the texture.
const FIELD_SIGMA: f32 = 28.0;
/// The most the hold may scale a line. More blackens a line that stands alone in a light patch.
const HOLD_LIMIT: f32 = 2.5;
/// The anisotropy under which the form gives no direction, and over which it gives one fully.
const COH_RANGE: (f32, f32) = (0.3, 0.8);
/// The gradient (L* per px) under which the form gives no direction, and over which it gives one.
const GRAD_RANGE: (f32, f32) = (0.08, 0.5);
/// The angle bins over half a turn. A direction is drawn by its two nearest bins.
const BINS: usize = 12;
/// How many bins the second layer is turned from the first: 60 degrees, not a right angle, so the
/// holes between the layers are diamonds and not a square grid.
const CROSS_TURN: usize = 4;
/// The spacing of the second layer as a multiple of the first.
const CROSS_SPACING: f32 = 1.3;
/// The salt of the second layer's hashes, so it is not the first one turned.
const CROSS_SALT: i32 = 70_001;
/// The darkness range in which the strokes fade in from bare paper: the tones within about 2 L* of
/// paper stay paper.
const PAPER_RANGE: (f32, f32) = (0.026, 0.06);
/// The share of the paper the first layer covers in the lights and mids, so a line is lighter than
/// the full black of the darkest pencil: half the paper stays bare.
const LIGHT_COVER: f32 = 0.5;
/// The darkness at which the lines cover the whole paper.
const DENSE_AT: f32 = 0.8;
/// The darkness under which the lines come in one at a time (the nesting), each at the ink of
/// this darkness, so a very light tone is a few faint lines and not a wash.
const SPARSE_UNDER: f32 = 0.08;
/// The most coverage the first layer draws. The second layer makes up the rest in the darks.
const FIRST_MAX: f32 = 0.6;
/// The share of a line that is missing in the lightest work (rare gaps; the darks have none). Kept
/// small: on a gray ground a gap reads as a white slit.
const GAP_MAX: f32 = 0.03;
/// The length of a stretch of line that may have a gap, in px at a long side of 1024.
const GAP_LEN: f32 = 70.0;
/// Inside a gap, the share of the stretch (centered) where the line is gone, and the share where
/// it is whole again: between them the line tapers. A short hole and a long taper read as the
/// pencil lifting off, not as a cut.
const GAP_SHAPE: (f32, f32) = (0.05, 0.9);
/// How far a line wanders off its straight path, in px, and the length of one wander, in px at a
/// long side of 1024 (the hand is not a ruler).
const WOBBLE: (f32, f32) = (0.5, 45.0);
/// The weight of the second bin under which a direction is drawn by the first bin alone (and over
/// one minus which, by the second alone).
const BIN_SNAP: f32 = 0.04;
/// The coverage of the second layer from which the paper is solid: nothing needs drawing.
const SOLID: f32 = 0.999;
/// The softest edge a line may have, in px, so a full width line is a solid band.
const MIN_SOFT: f32 = 0.05;
/// The salt of the wander hashes, so they do not repeat the hashes of the gaps.
const WOBBLE_ROLE: i32 = 50_000;
/// The golden ratio's fraction, the step that spreads the line thresholds evenly, so near lines do
/// not all appear together.
const GOLDEN: f32 = 0.618_034;
/// How much a random part moves a line threshold, as a share of 1.
const THRESHOLD_NOISE: f32 = 0.1;
/// The edge of the coverage on the paper tooth, as a share of the tooth height.
const TOOTH_EDGE: f32 = 0.25;

/// What a layer of lines draws at a tone: the share of the lines that show, their width as a
/// share of the spacing and the share of each line that is drawn.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Plan {
    share: f32,
    width: f32,
    fill: f32,
}

/// The plan of a layer that covers the share `c` of the paper where its `share` of the lines show.
/// The gaps are rarer the darker the layer.
fn plan(c: f32, share: f32) -> Plan {
    let fill = 1.0 - GAP_MAX * (1.0 - c);
    Plan {
        share,
        width: (c / fill).min(1.0),
        fill,
    }
}

/// The share of the paper the lines cover at the darkness `d`: [`LIGHT_COVER`] while the ink is
/// still getting darker, then it climbs to the whole paper at [`DENSE_AT`] (an even, dense
/// hatch with no bare specks) and stays there.
fn coverage(d: f32) -> f32 {
    if d <= LIGHT_COVER {
        return LIGHT_COVER;
    }
    let gain = (1.0 / DENSE_AT - 1.0) * smoothstep(LIGHT_COVER, DENSE_AT, d);
    (d * (1.0 + gain)).min(1.0)
}

/// The share of the first layer's lines that show at the darkness `d`.
fn lines_share(d: f32) -> f32 {
    (d / SPARSE_UNDER).min(1.0)
}

/// How dark a line is at the tone darkness `d`, as a share of full darkness: the ink that makes
/// the mean of the covered lines the tone. A light tone is a gray line (in L*, about
/// `2 * tone - paper`), and the ink reaches full darkness at half darkness.
fn ink(d: f32) -> f32 {
    if d <= 0.0 {
        return 0.0;
    }
    (d / (coverage(d) * lines_share(d))).min(1.0)
}

/// The two layers for the darkness `d` as coverage: the first covers up to [`FIRST_MAX`], the
/// second makes up the rest, so `1 - (1 - c1)(1 - c2)` is [`coverage`].
fn layers(d: f32) -> (f32, f32) {
    if d <= 0.0 {
        return (0.0, 0.0);
    }
    let all = coverage(d);
    let first = all.min(FIRST_MAX);
    let second = if all > first {
        1.0 - (1.0 - all) / (1.0 - first)
    } else {
        0.0
    };
    (first, second)
}

/// The share (0 to 1) the strokes fade in from bare paper at the darkness `d`.
fn fade(d: f32) -> f32 {
    smoothstep(PAPER_RANGE.0, PAPER_RANGE.1, d)
}

/// The two bins a direction (the double angle vector `(cos 2a, sin 2a)`) lies between and the
/// weight of the second.
fn bins(double: (f32, f32)) -> (usize, usize, f32) {
    let angle = 0.5 * libm::atan2f(double.1, double.0);
    let t = (angle / PI * BINS as f32).rem_euclid(BINS as f32);
    let b = (libm::floorf(t) as usize).min(BINS - 1);
    (b, (b + 1) % BINS, t - b as f32)
}

/// The unit vector of the bin `b`: its angle is `b` over [`BINS`] of half a turn.
fn bin_dir(b: usize) -> (f32, f32) {
    let a = b as f32 * PI / BINS as f32;
    (libm::cosf(a), libm::sinf(a))
}

/// The double angle vector of the line direction at pixel `i`: the form's tangent where it gives a
/// direction, the default direction `fallback` where it does not (a blend of double angles, so it
/// is continuous).
fn direction(f: &Field, i: usize, fallback: (f32, f32)) -> (f32, f32) {
    let own = (
        f.tx[i] * f.tx[i] - f.ty[i] * f.ty[i],
        2.0 * f.tx[i] * f.ty[i],
    );
    let sure = smoothstep(COH_RANGE.0, COH_RANGE.1, f.coh[i])
        * smoothstep(GRAD_RANGE.0, GRAD_RANGE.1, f.g[i]);
    (
        fallback.0 + sure * (own.0 - fallback.0),
        fallback.1 + sure * (own.1 - fallback.1),
    )
}

/// The line direction of a picture (the double angle vector of [`direction`] per pixel), read from
/// the structure of the guide at half size, where it is four times cheaper and as smooth as the
/// field needs to be.
struct Flow {
    cos: Vec<f32>,
    sin: Vec<f32>,
    size: (usize, usize),
}

impl Flow {
    /// The flow of `guide` (`w` by `h`) with the tensor smoothed by `sigma` px of the full size.
    fn new(guide: &[f32], (w, h): (usize, usize), sigma: f32, fallback: (f32, f32)) -> Self {
        let (hw, hh) = (w.div_ceil(2), h.div_ceil(2));
        let mut small = vec![0f32; hw * hh];
        for y in 0..hh {
            for x in 0..hw {
                let (x1, y1) = ((2 * x + 1).min(w - 1), (2 * y + 1).min(h - 1));
                small[y * hw + x] = 0.25
                    * (guide[2 * y * w + 2 * x]
                        + guide[2 * y * w + x1]
                        + guide[y1 * w + 2 * x]
                        + guide[y1 * w + x1]);
            }
        }
        let field = structure_field(&[&small], hw, hh, 0.5 * sigma);
        let (cos, sin): (Vec<f32>, Vec<f32>) =
            (0..hw * hh).map(|i| direction(&field, i, fallback)).unzip();
        Self {
            cos,
            sin,
            size: (hw, hh),
        }
    }

    /// The double angle vector at the pixel `(x, y)` of the full size.
    fn at(&self, x: f32, y: f32) -> (f32, f32) {
        // the center of the half size pixel `k` is at `2 k + 0.5` of the full size
        let (fx, fy) = (0.5 * x - 0.25, 0.5 * y - 0.25);
        (
            bil(&self.cos, self.size.0, self.size.1, fx, fy),
            bil(&self.sin, self.size.0, self.size.1, fx, fy),
        )
    }
}

/// The threshold of line `i` in 0 to 1: a golden ratio run with a little noise.
fn threshold(i: i32, salt: i32) -> f32 {
    let t = i as f32 * GOLDEN + 0.5 + THRESHOLD_NOISE * hash(i.wrapping_add(salt), 0);
    t - libm::floorf(t)
}

/// The sideways wander of line `id` at `along` px, in px: value noise along the line, so it is
/// smooth, with the length of one wander `len`.
fn wander(id: i32, along: f32, len: f32) -> f32 {
    let t = along / len;
    let k = libm::floorf(t);
    let at = |j: f32| hash(id, WOBBLE_ROLE.wrapping_add(j as i32));
    let (a, b) = (at(k), at(k + 1.0));
    WOBBLE.0 * (a + (b - a) * smoothstep(0.0, 1.0, t - k))
}

/// The share (0 to 1) of the line that is there at `s` (0 to 1) along a stretch with a gap: gone
/// in the middle, whole at the ends, tapering between.
fn gap_taper(s: f32) -> f32 {
    smoothstep(GAP_SHAPE.0, GAP_SHAPE.1, (2.0 * s - 1.0).abs())
}

/// The sizes of one layer of lines, in px: the spacing, the stretch that may have a gap and the
/// length of a wander.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Lines {
    spacing: f32,
    stretch: f32,
    wander: f32,
}

/// The coverage (0 to 1) at `pos` of the lines of direction `dir` as the `plan` draws them. A line
/// has a soft edge about 1 px wide.
fn stripe(pos: (f32, f32), dir: (f32, f32), lines: Lines, plan: Plan, salt: i32) -> f32 {
    let along = pos.0 * dir.0 + pos.1 * dir.1;
    let across = (pos.1 * dir.0 - pos.0 * dir.1) / lines.spacing;
    let line = libm::floorf(across) as i32;
    if plan.share <= threshold(line, salt) {
        return 0.0;
    }
    let id = line.wrapping_add(salt);
    let run = along / lines.stretch + 0.5 + 0.5 * hash(id, 1);
    let piece = libm::floorf(run);
    let whole = if 0.5 + 0.5 * hash(id, piece as i32) >= plan.fill {
        gap_taper(run - piece)
    } else {
        1.0
    };
    let width = plan.width * lines.spacing * whole;
    // the soft edge is 1 px, less where the lines nearly touch, and lines that touch do not wander
    let bare = (lines.spacing - width).max(0.0);
    let soft = bare.clamp(MIN_SOFT, 1.0);
    let sway = wander(id, along, lines.wander) * bare / lines.spacing;
    let off = (across - libm::floorf(across) - 0.5) * lines.spacing + sway;
    let edge = ((f32::midpoint(width, soft) - off.abs()) / soft).clamp(0.0, 1.0);
    // a line thinner than a px is fainter, not just thinner
    smoothstep(0.0, 1.0, edge) * width.min(1.0)
}

/// The coverage of one layer at a pixel whose direction lies between bins `b0` and `b1`
/// (`weight` on `b1`), with the layer turned by `turn` bins.
fn layer_cover(
    pos: (f32, f32),
    (b0, b1, weight): (usize, usize, f32),
    turn: usize,
    lines: Lines,
    plan: Plan,
    salt: i32,
) -> f32 {
    if plan.share <= 0.0 {
        return 0.0;
    }
    let one = |b: usize| stripe(pos, bin_dir((b + turn) % BINS), lines, plan, salt);
    // a direction next to a bin is drawn by that bin alone (half the work, no visible change)
    if weight < BIN_SNAP {
        one(b0)
    } else if weight > 1.0 - BIN_SNAP {
        one(b1)
    } else {
        (1.0 - weight) * one(b0) + weight * one(b1)
    }
}

/// The shown L* of the Hatch look, per pixel. `tone` is the Tone picture (L*), `guide` the smoothed
/// L* the strokes follow, `tooth` the paper tooth, `grain` 0 to 1 how much the tooth breaks the
/// strokes, `angle_deg` the direction where the form gives none and `density` 0 to 1 how close the
/// lines run. The 16 px box mean of the result follows `tone`; light areas stay paper.
#[allow(
    clippy::too_many_arguments,
    reason = "the picture, its size, the tooth and the four knobs: a flat call is the plainest"
)]
pub(crate) fn draw(
    tone: &[f32],
    guide: &[f32],
    w: usize,
    h: usize,
    tooth: &[f32],
    grain: f32,
    angle_deg: f32,
    density: f32,
) -> Vec<f32> {
    let px = scale(w, h);
    let spacing = (SPACING.0 + (SPACING.1 - SPACING.0) * density) * px;
    let first_lines = Lines {
        spacing,
        stretch: GAP_LEN * px,
        wander: WOBBLE.1 * px,
    };
    let cross_lines = Lines {
        spacing: spacing * CROSS_SPACING,
        ..first_lines
    };
    let turn = angle_deg.to_radians();
    let fallback = (libm::cosf(2.0 * turn), libm::sinf(2.0 * turn));
    let flow = Flow::new(guide, (w, h), FIELD_SIGMA * px, fallback);
    let dark = darkest(tone);
    let want: Vec<f32> = tone
        .iter()
        .map(|&l| {
            let d = darkness(l, dark);
            d * fade(d)
        })
        .collect();
    let mut shown = Vec::with_capacity(tone.len());
    for (i, &d) in want.iter().enumerate() {
        let (x, y) = ((i % w) as f32, (i / w) as f32);
        let (c1, c2) = layers(d);
        let at = bins(flow.at(x, y));
        let cover = if c2 >= SOLID {
            1.0
        } else {
            let first = layer_cover((x, y), at, 0, first_lines, plan(c1, lines_share(d)), 0);
            let second = layer_cover(
                (x, y),
                at,
                CROSS_TURN,
                cross_lines,
                plan(c2, 1.0),
                CROSS_SALT,
            );
            1.0 - (1.0 - first) * (1.0 - second)
        };
        let p = pressure(d);
        let a = lay(tooth[i], p, TOOTH_EDGE);
        let f = 1.0 + grain * (grain_factor(a, p, d) - 1.0);
        shown.push((ink(d) * cover * f).min(1.0));
    }
    hold_mean(&mut shown, &want, (w, h), HOLD_LIMIT);
    shown.iter().map(|&d| tone_of(d, dark)).collect()
}

#[cfg(test)]
mod tests {
    use super::super::paper::{Paper, tooth};
    use super::*;

    /// The picture of `tone` with the default knobs but for `angle` and `density`.
    fn run(
        tone: &[f32],
        guide: &[f32],
        (w, h): (usize, usize),
        angle: f32,
        density: f32,
    ) -> Vec<f32> {
        let t = tooth(w, h, Paper::Medium, angle);
        draw(tone, guide, w, h, &t, 0.5, angle, density)
    }

    /// A picture `w` by `h` of one tone with one dark pixel in the corner, so the tone is not the
    /// darkest.
    fn flat(l: f32, w: usize, h: usize) -> Vec<f32> {
        let mut v = vec![l; w * h];
        v[0] = 17.0;
        v
    }

    /// The mean of the 16 px box at `(x0, y0)`.
    fn box16(v: &[f32], w: usize, (x0, y0): (usize, usize)) -> f32 {
        let mut s = 0.0;
        for y in y0..y0 + 16 {
            for x in x0..x0 + 16 {
                s += v[y * w + x];
            }
        }
        s / 256.0
    }

    /// The mean and the largest gap between the 16 px box means of `shown` and `tone`, on a grid of
    /// boxes that keeps 16 px from the border (the hold is cut short there). Lines 5 px apart put
    /// three or four of them in a box, so a box can be off by a line: the gaps are wider than
    /// Drawing's.
    fn gaps(shown: &[f32], tone: &[f32], (w, h): (usize, usize)) -> (f32, f32) {
        let (mut sum, mut worst, mut n) = (0.0f32, 0.0f32, 0.0f32);
        for y in (16..=h - 32).step_by(8) {
            for x in (16..=w - 32).step_by(8) {
                let gap = (box16(shown, w, (x, y)) - box16(tone, w, (x, y))).abs();
                sum += gap;
                worst = worst.max(gap);
                n += 1.0;
            }
        }
        (sum / n, worst)
    }

    #[test]
    fn test_the_ink_is_a_pencil_gray_that_follows_the_tone() {
        // a mid tone (L* 56, darkness 0.5) is drawn by lines of full darkness, a light one by gray lines
        assert!((ink(0.5) - 1.0).abs() < 1e-6);
        assert!((ink(0.2) - 0.4).abs() < 1e-6);
        assert_eq!(ink(0.0), 0.0);
        // the faintest lines are all the same gray, there are just fewer of them
        assert!((ink(0.02) - 2.0 * SPARSE_UNDER).abs() < 1e-5);
        // the darks are dense: the lines cover the whole paper, a little under full ink
        assert!((coverage(DENSE_AT) - 1.0).abs() < 1e-5 && ink(DENSE_AT) > 0.75);
        assert!(ink(0.9) <= 1.0);
    }

    #[test]
    fn test_the_first_layer_covers_half_the_paper_in_the_lights_and_mids() {
        for d in [0.02f32, 0.08, 0.2, 0.4, 0.5] {
            let (a, b) = layers(d);
            assert!((a - 0.5).abs() < 1e-4 && b == 0.0, "{d}: {a} {b}");
        }
        assert_eq!(layers(0.0), (0.0, 0.0));
    }

    #[test]
    fn test_the_cross_layer_starts_in_the_darks_and_the_darkness_adds_up() {
        let mut last = 0.0;
        for k in 1..=20 {
            let d = k as f32 / 20.0;
            let (a, b) = layers(d);
            let all = 1.0 - (1.0 - a) * (1.0 - b);
            assert!((ink(d) * lines_share(d) * all - d).abs() < 1e-4, "{d}");
            assert!(b == 0.0 || d > 0.55, "{d}");
            assert!(b > 0.0 || d < 0.7, "{d}");
            assert!(all >= last - 1e-5);
            last = all;
        }
    }

    #[test]
    fn test_a_plan_has_rare_gaps_and_no_gap_in_full_darkness() {
        let light = plan(0.5, 1.0);
        assert!(light.fill > 0.9 && light.fill < 1.0);
        assert!((light.width * light.fill - 0.5).abs() < 1e-5);
        assert!((plan(1.0, 1.0).fill - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_light_work_fades_to_paper_within_two_l_star() {
        assert_eq!(fade(0.0), 0.0);
        assert_eq!(fade(PAPER_RANGE.0), 0.0);
        assert!((fade(PAPER_RANGE.1) - 1.0).abs() < 1e-6);
        // 2 L* under paper is a darkness of 2 / 78: still bare
        assert_eq!(fade(2.0 / 78.0), 0.0);
    }

    #[test]
    fn test_a_gap_is_gone_in_the_middle_and_whole_at_the_ends() {
        assert_eq!(gap_taper(0.5), 0.0);
        assert!((gap_taper(0.0) - 1.0).abs() < 1e-6);
        assert!((gap_taper(1.0) - 1.0).abs() < 1e-6);
        assert!(gap_taper(0.1) > gap_taper(0.3));
    }

    #[test]
    fn test_a_wander_is_smooth_and_small() {
        let mut last = wander(3, 0.0, 45.0);
        for a in 1..400 {
            let now = wander(3, a as f32 * 0.5, 45.0);
            assert!((now - last).abs() < 0.1, "{a}");
            assert!(now.abs() <= WOBBLE.0 + 1e-6);
            last = now;
        }
    }

    #[test]
    fn test_bins_hold_the_two_nearest_directions() {
        assert_eq!(bins((1.0, 0.0)), (0, 1, 0.0));
        assert_eq!(bins((-1.0, 0.0)).0, BINS / 2);
        // 45 degrees: double angle (0, 1)
        let (b, _, f) = bins((0.0, 1.0));
        assert_eq!(b, BINS / 4);
        assert!(f.abs() < 1e-4);
        assert_eq!(bins((0.0, -1.0)).0, 3 * BINS / 4);
    }

    #[test]
    fn test_the_form_gives_the_direction_only_where_it_is_sure() {
        let n = 1;
        let field = Field {
            tx: vec![0.0; n],
            ty: vec![1.0; n],
            g: vec![1.0; n],
            coh: vec![1.0; n],
        };
        // a vertical tangent: double angle (-1, 0)
        let fallback = (1.0, 0.0);
        let sure = direction(&field, 0, fallback);
        assert!((sure.0 + 1.0).abs() < 1e-5 && sure.1.abs() < 1e-5);
        let unsure = Field {
            coh: vec![0.2; n],
            ..field
        };
        assert_eq!(direction(&unsure, 0, fallback), fallback);
    }

    #[test]
    fn test_a_stripe_follows_its_direction_and_an_empty_plan_draws_nothing() {
        let full = Plan {
            share: 1.0,
            width: 0.5,
            fill: 1.0,
        };
        let none = Plan { share: 0.0, ..full };
        let lines = Lines {
            spacing: 6.0,
            stretch: 1000.0,
            wander: 1000.0,
        };
        let along_x = |x: f32, y: f32| stripe((x, y), (1.0, 0.0), lines, full, 0);
        assert_eq!(stripe((3.0, 4.0), (1.0, 0.0), lines, none, 0), 0.0);
        // the lines run along x: the coverage hardly changes along a short run
        for y in 0..12 {
            assert!(
                (along_x(2.0, y as f32) - along_x(5.0, y as f32)).abs() < 0.05,
                "{y}"
            );
        }
        // and a line is found once in a spacing
        let hit = (0..6).filter(|&y| along_x(2.0, y as f32) > 0.5).count();
        assert!((1..=4).contains(&hit), "{hit}");
    }

    #[test]
    fn test_a_flat_dark_patch_keeps_the_local_mean() {
        let (w, h) = (96, 96);
        for l in [85.0f32, 70.0, 49.0, 26.0] {
            let tone = flat(l, w, h);
            let shown = run(&tone, &tone, (w, h), 45.0, 0.5);
            let (mean, worst) = gaps(&shown, &tone, (w, h));
            assert!(mean < 1.5 && worst < 10.0, "{l}: {mean} {worst}");
        }
    }

    #[test]
    fn test_a_ramp_keeps_the_local_mean() {
        let (w, h) = (192, 96);
        let tone: Vec<f32> = (0..w * h)
            .map(|i| 17.0 + 78.0 * (i % w) as f32 / (w - 1) as f32)
            .collect();
        let shown = run(&tone, &tone, (w, h), 45.0, 0.5);
        let (mean, worst) = gaps(&shown, &tone, (w, h));
        assert!(mean < 2.5 && worst < 12.0, "{mean} {worst}");
    }

    #[test]
    fn test_paper_stays_paper_and_light_skin_still_gets_lines() {
        let (w, h) = (64, 64);
        let paper = vec![95.0; w * h];
        assert!(
            run(&paper, &paper, (w, h), 45.0, 0.5)
                .iter()
                .all(|&l| (l - 95.0).abs() < 1e-3)
        );
        // a light skin tone is faint gray lines: darker than paper, lighter than the pencil
        let skin = flat(82.0, w, h);
        let shown = run(&skin, &skin, (w, h), 45.0, 0.5);
        // (the corner pixel of `flat` is the darkest tone, leave the first rows out)
        let darkest = shown[w * 16..].iter().copied().fold(95.0, f32::min);
        assert!(darkest < 90.0 && darkest > 40.0, "{darkest}");
    }

    #[test]
    fn test_a_darker_tone_has_more_ink() {
        let (w, h) = (64, 64);
        let mean = |l: f32| {
            let tone = flat(l, w, h);
            let shown = run(&tone, &tone, (w, h), 45.0, 0.5);
            shown.iter().sum::<f32>() / shown.len() as f32
        };
        assert!(mean(80.0) > mean(60.0) && mean(60.0) > mean(40.0));
    }

    #[test]
    fn test_lines_follow_the_form() {
        // a vertical ramp: the tone runs along x, so the lines run along x too
        let (w, h) = (128, 128);
        let guide: Vec<f32> = (0..w * h).map(|i| 30.0 + 0.4 * (i / w) as f32).collect();
        let tone = flat(60.0, w, h);
        let shown = run(&tone, &guide, (w, h), 90.0, 0.5);
        let step = |dx: usize, dy: usize| {
            let mut s = 0.0;
            for y in 20..h - 20 - dy {
                for x in 20..w - 20 - dx {
                    s += (shown[y * w + x] - shown[(y + dy) * w + x + dx]).abs();
                }
            }
            s
        };
        assert!(
            step(1, 0) < 0.5 * step(0, 1),
            "{} {}",
            step(1, 0),
            step(0, 1)
        );
    }

    #[test]
    fn test_density_closes_the_lines_and_the_same_input_gives_the_same_picture() {
        let (w, h) = (96, 96);
        let tone = flat(60.0, w, h);
        let count = |density: f32| {
            let shown = run(&tone, &tone, (w, h), 0.0, density);
            // the lines run along x: count the changes down one column
            (1..h)
                .filter(|&y| (shown[y * w + 40] - shown[(y - 1) * w + 40]).abs() > 8.0)
                .count()
        };
        assert!(count(1.0) > count(0.0), "{} {}", count(1.0), count(0.0));
        assert_eq!(
            run(&tone, &tone, (w, h), 30.0, 0.5),
            run(&tone, &tone, (w, h), 30.0, 0.5)
        );
    }
}
