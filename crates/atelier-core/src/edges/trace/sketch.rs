//! The Sketch mode of Edges: the kept chains drawn as loose graphite strokes, not clean lines.
//!
//! A long chain is cut into strokes of about 100 to 200 px that overlap a little, like a hand that
//! lifts and lands again. Each stroke presses in at the start, lifts at the end, wavers a little
//! across its path and changes its pressure along it. The strongest chains get a second, lighter
//! pass beside the first. Weak chains start late and stop early. A grain makes the edge uneven.
//! All noise comes from a hash of the chain (its first point and length), never from a clock.

use super::{EdgeOpts, INK_FULL, WEIGHT_LENGTH, fades, pieces, ramp};
use crate::edges::field::{Chain, Cover, LineSet, dist};
use crate::img::{Rgb, size_factor};
use crate::pencil::paper::hash;

/// The gray of graphite on white paper (0 black, 255 white): the one tone of the mode.
pub(crate) const GRAPHITE: u8 = 44;
/// The most a stroke covers at full pressure (0 to 1).
const PRESS_MAX: f32 = 1.0;
/// Spacing of the points of a stroke, in px at a long side of 1024.
const STEP: f32 = 2.0;
/// A stroke is this many px long at least and this many more at most (times the size factor).
const STROKE_MIN: f32 = 110.0;
const STROKE_SPAN: f32 = 110.0;
/// Overlap of two strokes of one chain, in points.
const OVERLAP: usize = 3;
/// Half width of the thinnest stroke, and the gain for the heaviest, in px (times the size factor).
const HALF_MIN: f32 = 1.0;
const HALF_GAIN: f32 = 1.3;
/// How far a stroke wavers across its path, in px.
const WOBBLE: f32 = 1.2;
/// The chains whose weight (length times contrast) is this or more are drawn twice.
const DOUBLE_FROM: f32 = 0.3;
/// The second pass lies this far beside the first, in px, and presses this hard.
const DOUBLE_LIFT: f32 = 1.4;
const DOUBLE_PRESS: f32 = 0.5;

/// A number from 0 to 1, from two integers.
fn unit(a: i32, b: i32) -> f32 {
    hash(a, b) * 0.5 + 0.5
}

/// Smooth value noise of one number, from -1 to 1. `salt` picks one of several noises.
fn noise(t: f32, seed: i32, salt: i32) -> f32 {
    let i = t.floor();
    let f = t - i;
    let f = f * f * (3.0 - 2.0 * f);
    let at = |j: i32| hash(j.wrapping_add(salt.wrapping_mul(7919)), seed);
    let i = i as i32;
    at(i) * (1.0 - f) + at(i.wrapping_add(1)) * f
}

/// 0 at 0 or under, 1 at 1 or over, smooth between.
fn smooth(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// The points of `pts` every `step` px of path, the end included.
fn resample(pts: &[[f32; 2]], step: f32) -> Vec<[f32; 2]> {
    let mut out = vec![pts[0]];
    let (mut walked, mut next) = (0.0f32, step);
    for s in pts.windows(2) {
        let len = dist(s[0], s[1]);
        while len > 0.0 && next <= walked + len {
            let u = (next - walked) / len;
            out.push([
                s[0][0] + u * (s[1][0] - s[0][0]),
                s[0][1] + u * (s[1][1] - s[0][1]),
            ]);
            next += step;
        }
        walked += len;
    }
    let last = pts[pts.len() - 1];
    if dist(out[out.len() - 1], last) > 0.3 * step {
        out.push(last);
    }
    out
}

/// What one stroke needs besides its points.
#[derive(Clone, Copy)]
struct Pen {
    seed: i32,
    /// The size factor.
    k: f32,
    /// Half width at full pressure, in px.
    half: f32,
    /// The most pressure of the stroke (0 to 1).
    level: f32,
    /// A constant shift across the path, in px.
    lift: f32,
    /// Index of the stroke's first point in the chain's points.
    first: usize,
}

/// The fade of a chain at the distance `g` along it, from the fades of its pieces.
fn fade_at(mids: &[f32], vals: &[f32], g: f32) -> f32 {
    if vals.is_empty() {
        return 1.0;
    }
    let j = mids.partition_point(|&m| m < g);
    if j == 0 {
        return vals[0];
    }
    if j >= vals.len() {
        return vals[vals.len() - 1];
    }
    let u = (g - mids[j - 1]) / (mids[j] - mids[j - 1]).max(1e-3);
    vals[j - 1] + (vals[j] - vals[j - 1]) * u
}

/// One stroke: the points `pts` (`STEP * k` apart), pressed in at the start and lifted at the end.
fn stroke(cover: &mut Cover, pts: &[[f32; 2]], pen: &Pen, fade: &(Vec<f32>, Vec<f32>)) {
    let n = pts.len();
    if n < 2 {
        return;
    }
    let step = STEP * pen.k;
    let total = (n - 1) as f32 * step;
    let rise = (10.0 + 14.0 * unit(pen.seed, 11)) * pen.k;
    let fall = (22.0 + 26.0 * unit(pen.seed, 12)) * pen.k;
    let mut prev: Option<([f32; 2], f32, f32)> = None;
    for i in 0..n {
        let s = i as f32 * step;
        let g = (pen.first + i) as f32 * step;
        let (a, b) = (pts[i.saturating_sub(1)], pts[(i + 1).min(n - 1)]);
        let l = dist(a, b).max(1e-3);
        let (nx, ny) = (-(b[1] - a[1]) / l, (b[0] - a[0]) / l);
        let off = pen.lift + WOBBLE * pen.k * noise(g / (30.0 * pen.k), pen.seed, 1);
        let p = [pts[i][0] + nx * off, pts[i][1] + ny * off];
        let hold = 0.8 + 0.2 * noise(g / (45.0 * pen.k), pen.seed, 2);
        let press =
            pen.level * (0.12 + 0.88 * smooth(s / rise) * smooth((total - s) / fall)) * hold;
        let f = (fade_at(&fade.0, &fade.1, g) / INK_FULL).min(1.0);
        let cover_at = (0.28 + 0.72 * press).min(1.0) * PRESS_MAX * f;
        let half = pen.half * (0.4 + 0.6 * press);
        if let Some((q, h0, c0)) = prev {
            cover.segment(q, p, f32::midpoint(h0, half), f32::midpoint(c0, cover_at));
        }
        prev = Some((p, half, cover_at));
    }
}

/// The strokes of one chain, one pass (`lift` 0) or the second one beside it.
fn pass(
    cover: &mut Cover,
    pts: &[[f32; 2]],
    pen: &Pen,
    cut: (usize, usize),
    fade: &(Vec<f32>, Vec<f32>),
) {
    let n = pts.len();
    let (from, to) = (cut.0, n.saturating_sub(cut.1));
    if to < from + 2 {
        return;
    }
    let mut at = from;
    let mut idx = 0;
    while at + 1 < to {
        let want = ((STROKE_MIN + STROKE_SPAN * unit(pen.seed, 20 + idx)) * pen.k / (STEP * pen.k))
            as usize;
        let end = if to - at < want + want / 2 {
            to
        } else {
            at + want
        };
        let sub = Pen {
            first: pen.first + at,
            seed: pen.seed.wrapping_add(idx * 131),
            ..*pen
        };
        stroke(cover, &pts[at..end], &sub, fade);
        if end >= to {
            break;
        }
        at = end - OVERLAP;
        idx += 1;
    }
}

/// A seed from the chain: its first point and its length, so the same chain draws the same way.
fn chain_seed(c: &Chain) -> i32 {
    let p = c.pts[0];
    (p[0].round() as i32)
        .wrapping_mul(7919)
        .wrapping_add((p[1].round() as i32).wrapping_mul(104_729))
        ^ (c.length.round() as i32).wrapping_mul(31)
}

/// The Sketch picture: graphite strokes of the kept chains on white. `scale` multiplies every
/// width (1 is the start width).
pub(super) fn draw(set: &LineSet, o: &EdgeOpts, scale: f32) -> Rgb {
    let long = set.width.max(set.height) as f32;
    let k = size_factor(set.width, set.height);
    let mut cover = Cover::new(set.width, set.height);
    for c in set.chains.iter().filter(|c| c.kept && c.pts.len() >= 2) {
        let seed = chain_seed(c);
        let t = (c.length / (WEIGHT_LENGTH * long)).min(1.0);
        let strength = ((c.contrast - 0.2) / 0.6).clamp(0.0, 1.0);
        let weight = t * strength;
        let parts = pieces(c, k);
        let vals = fades(c, &parts, set);
        let fade = (parts.iter().map(|p| p.2).collect::<Vec<_>>(), vals);
        let pts = resample(&c.pts, STEP * k);
        let n = pts.len();
        // weak chains start late and stop early; a closed chain is drawn whole
        let weak = 1.0 - ramp(c.contrast, 0.15, 0.55);
        let cut = if c.closed {
            (0, 0)
        } else {
            (
                (weak * 0.2 * unit(seed, 1) * n as f32) as usize,
                (weak * 0.12 * unit(seed, 2) * n as f32) as usize,
            )
        };
        let level = (0.55 + 0.45 * ramp(c.contrast, 0.1, 0.6)).min(1.0);
        let pen = Pen {
            seed,
            k,
            half: (HALF_MIN + HALF_GAIN * o.weight_gain * weight) * k * scale,
            level,
            lift: 0.0,
            first: 0,
        };
        pass(&mut cover, &pts, &pen, cut, &fade);
        if weight >= DOUBLE_FROM {
            let side = if unit(seed, 3) < 0.5 { -1.0 } else { 1.0 };
            let second = Pen {
                seed: seed.wrapping_add(977),
                half: pen.half * 0.75,
                level: level * DOUBLE_PRESS,
                lift: side * (DOUBLE_LIFT + 0.8 * unit(seed, 4)) * k,
                ..pen
            };
            let trim = (
                cut.0 + (0.06 * (1.0 + unit(seed, 5)) * n as f32) as usize,
                cut.1 + (0.06 * (1.0 + unit(seed, 6)) * n as f32) as usize,
            );
            pass(&mut cover, &pts, &second, trim, &fade);
        }
    }
    cover.map(|x, y, c| {
        // a grain: the ink sits in the tooth of the paper and the edge breaks up
        let g = unit(x as i32, (y as i32).wrapping_add(40_503));
        (c * (0.8 + 0.2 * g) - 0.2 * (1.0 - g) * (1.0 - c)).clamp(0.0, 1.0)
    });
    let mut img = Rgb::filled(set.width, set.height, &[255, 255, 255]);
    cover.paint(&mut img, GRAPHITE);
    img
}
