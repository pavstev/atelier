//! Edges from an edge map: a painter's line drawing traced from a 1 channel edge strength map.
//! The map is the core's own (`map.rs`, a blurred Sobel gradient).
//!
//! The pipeline:
//!
//! 1. The map to float 0 to 1, a small blur. The orientation comes from the map itself (the
//!    structure tensor of the map), not from the photo.
//! 2. Non maximum suppression across that orientation, so a thick band becomes 1 px. Hysteresis
//!    on the probability with a high and a low threshold per preset.
//! 3. Link the pixels into chains, bridge gaps by good continuation, close near closed chains,
//!    drop short chains, drop chains that run along a longer one (doubles).
//! 4. Weight each chain by `length^0.7 * mean probability`, smooth and simplify its path, rank it
//!    in the ink budget.
//! 5. Draw it with a width from its weight (big forms heavy, detail light) and a taper at both
//!    ends.
//!
//! All sigmas are in px of the work image, tuned for a long side of 1024 px. There is no clock,
//! no randomness and no hash map: the same input gives the same bytes.

use crate::edges::field::{
    Chain, Cover, Kind, LineSet, LinesOpts, RawChain, bil, blur, bridge, dist, drop_duplicates,
    ink_scale, link, nms, path_length, rank, rank_transfer, simplify_vw, structure_field,
    thin_corners,
};
use crate::error::{Error, Result};
use crate::img::{Image, Rgb};

/// The knobs of the pipeline. `preset_opts` has the shipped picks.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct EdgeOpts {
    /// Sigma of the blur on the map before NMS, in px.
    pub pre_blur: f32,
    /// Sigma of the structure tensor of the map, in px.
    pub tensor_sigma: f32,
    /// A thinned pixel at or above this (0 to 1) starts a line.
    pub high: f32,
    /// A line grows over thinned pixels at or above this.
    pub low: f32,
    /// Bridge gaps up to this many px.
    pub bridge_gap: f32,
    /// Only if the chain ends point within this angle (degrees) at the gap.
    pub bridge_deg: f32,
    /// Drop chains shorter than this share of the long side.
    pub min_len: f32,
    /// Drop chains whose mean probability is under this.
    pub min_mean: f32,
    /// A chain is a double when `dup_share` of it lies within this many px of a longer chain.
    pub dup_dist: f32,
    /// See `dup_dist`.
    pub dup_share: f32,
    /// Rounds of the 3 tap smoothing of a path.
    pub smooth_rounds: usize,
    /// Visvalingam Whyatt area for the smoothed path, in px squared.
    pub simplify_area: f32,
    /// The ink budget, in multiples of the long side.
    pub ink_budget: f32,
    /// A chain with this mean probability or more is in the black tone (see [`TONES`]).
    pub strong: f32,
    /// A chain with this mean probability or more (and under `strong`) is in the dark grey tone.
    pub mid: f32,
    /// Length of the taper at each open end, in px.
    pub taper: f32,
    /// Transfer keeps at most this many chains.
    pub transfer_chains: usize,
    /// The widest line (long forms) gets this much more half width than the thinnest.
    pub weight_gain: f32,
}

/// The ink of the three tones a chain's contrast puts it in: black, dark grey and grey. Every
/// line is drawn black; the tone only tells, with the fade, if a chain is too faint to keep
/// ([`too_faint`]).
const TONES: [u8; 3] = [0, 70, 125];
/// The ink every line is drawn in: black.
const INK: u8 = 0;
/// A piece of a line whose fade (see [`fades`]) is this or more is drawn in full ink; under it
/// the ink thins to none at 0, so a lost edge still fades away.
const INK_FULL: f32 = 0.5;
/// The weight (0 to 1, the share of the extra width) that the Edges Even knob pulls every line to.
const EVEN_WEIGHT: f32 = 0.5;
/// A line this share of the long side or longer gets its full weight.
const WEIGHT_LENGTH: f32 = 0.4;
/// Half the width of the thinnest line, in px.
const LINE_HALF: f32 = 0.5;
/// Steps of a drawn segment, in px, so the taper is smooth along long segments.
const DRAW_STEP: f32 = 1.5;
/// Chains whose two ends are within this many px are closed.
const CLOSE_GAP: f32 = 3.0;

/// The pipeline of a preset. Each preset changes how much of the map is traced, not only how much
/// of it is kept.
fn preset_opts(preset: u8) -> EdgeOpts {
    match preset {
        0 => few_opts(),
        2 => many_opts(),
        3 => transfer_opts(),
        _ => some_opts(),
    }
}

/// The pipeline of preset 1, some lines. The other presets change a few numbers of it.
fn some_opts() -> EdgeOpts {
    EdgeOpts {
        pre_blur: 1.0,
        tensor_sigma: 3.0,
        high: 0.45,
        low: 0.2,
        bridge_gap: 10.0,
        bridge_deg: 40.0,
        min_len: 0.035,
        min_mean: 0.3,
        dup_dist: 4.0,
        dup_share: 0.6,
        smooth_rounds: 6,
        simplify_area: 0.4,
        ink_budget: 7.0,
        strong: 0.55,
        mid: 0.4,
        taper: 10.0,
        transfer_chains: 40,
        weight_gain: 1.0,
    }
}

/// Preset 0, few lines: `some` with higher gates, longer chains and a small ink budget.
fn few_opts() -> EdgeOpts {
    let some = some_opts();
    EdgeOpts {
        high: 0.55,
        low: 0.3,
        min_len: 0.07,
        min_mean: 0.4,
        ink_budget: 3.0,
        ..some
    }
}

/// Preset 2, many lines: `some` with lower gates, shorter chains and a big ink budget.
fn many_opts() -> EdgeOpts {
    let some = some_opts();
    EdgeOpts {
        high: 0.3,
        low: 0.1,
        min_len: 0.015,
        min_mean: 0.2,
        dup_dist: 3.0,
        dup_share: 0.7,
        ink_budget: 16.0,
        mid: 0.3,
        ..some
    }
}

/// Preset 3, transfer: `some` with longer chains and a smaller ink budget.
fn transfer_opts() -> EdgeOpts {
    let some = some_opts();
    EdgeOpts {
        min_len: 0.05,
        min_mean: 0.4,
        ink_budget: 6.0,
        ..some
    }
}

/// A long line (see `is_long_line`) is this share of the long side or longer.
const STRAIGHT_MIN: f32 = 0.12;
/// A long line (see `is_long_line`) has its ends at least this share of its length apart.
const LINE_CHORD: f32 = 0.7;

/// Hysteresis on the thinned map: pixels at or above `high` start, pixels at or above `low` join
/// when they touch (8 neighbors) a started one. Returns 1 for an edge pixel.
fn hysteresis(thin: &[f32], w: usize, high: f32, low: f32) -> Vec<u8> {
    let n = thin.len();
    let h = n / w;
    let mut edges = vec![0u8; n];
    let mut stack: Vec<usize> = (0..n)
        .filter(|&i| thin[i] >= high && thin[i] > 0.0)
        .collect();
    for &i in &stack {
        edges[i] = 1;
    }
    while let Some(i) = stack.pop() {
        let (x, y) = ((i % w) as isize, (i / w) as isize);
        for ny in (y - 1).max(0)..=(y + 1).min(h as isize - 1) {
            for nx in (x - 1).max(0)..=(x + 1).min(w as isize - 1) {
                let j = ny as usize * w + nx as usize;
                if edges[j] == 0 && thin[j] >= low && thin[j] > 0.0 {
                    edges[j] = 1;
                    stack.push(j);
                }
            }
        }
    }
    edges
}

/// One round of the 3 tap smoothing (1 2 1) of a path. The ends of an open path stay; a closed
/// path (last point is the first) is smoothed all around.
fn smooth_once(pts: &[[f32; 2]], closed: bool) -> Vec<[f32; 2]> {
    let n = pts.len();
    if n < 3 {
        return pts.to_vec();
    }
    let at = |i: isize| -> [f32; 2] {
        if closed {
            // n - 1 distinct points on a cycle
            let m = (n - 1) as isize;
            pts[i.rem_euclid(m) as usize]
        } else {
            pts[i.clamp(0, n as isize - 1) as usize]
        }
    };
    let mut out = pts.to_vec();
    let last = if closed { n - 1 } else { n - 2 };
    let first = usize::from(!closed);
    for (i, o) in out.iter_mut().enumerate().take(last + 1).skip(first) {
        let (a, b, c) = (at(i as isize - 1), at(i as isize), at(i as isize + 1));
        *o = [
            0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0],
            0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1],
        ];
    }
    if closed {
        out[n - 1] = out[0];
    }
    out
}

/// Whether a path is a long, mostly straight line for the tone and the fade (a church plane, a
/// horizon, a bent corner of two planes): it is `STRAIGHT_MIN` of the long side `long` or longer
/// and its ends are at least `LINE_CHORD` of its length apart. A wiggle of texture is not.
fn is_long_line(pts: &[[f32; 2]], long: f32) -> bool {
    let (Some(&a), Some(&b)) = (pts.first(), pts.last()) else {
        return false;
    };
    let length = path_length(pts);
    length >= STRAIGHT_MIN * long && dist(a, b) >= LINE_CHORD * length
}

/// Runs the pipeline on a map. The chains have `contrast` = mean probability.
pub(crate) fn trace(map: &Image<u8>, o: &EdgeOpts) -> LineSet {
    let (w, h) = (map.width, map.height);
    let mut set = LineSet {
        width: w,
        height: h,
        chains: Vec::new(),
        strength: Vec::new(),
    };
    if w < 4 || h < 4 || map.channels != 1 || map.data.len() != w * h {
        return set;
    }
    let run = Run {
        w,
        h,
        k: size_factor(w, h),
        long: w.max(h) as f32,
        o,
    };
    let p: Vec<f32> = map.data.iter().map(|&v| f32::from(v) / 255.0).collect();
    let smooth = blur(&p, w, h, o.pre_blur);
    set.strength.clone_from(&smooth);
    let edges = run.hysteresis_edges(&smooth);
    for c in run.kept_chains(&edges) {
        if let Some(chain) = run.chain_of(c, &smooth) {
            set.chains.push(chain);
        }
    }
    set
}

/// What the steps of `trace` read: the map size, the size factor, the long side and the knobs.
struct Run<'a> {
    w: usize,
    h: usize,
    k: f32,
    long: f32,
    o: &'a EdgeOpts,
}

impl Run<'_> {
    /// The edge pixels of the blurred map: non maximum suppression across the orientation of the
    /// map, hysteresis, then thinned corners.
    fn hysteresis_edges(&self, smooth: &[f32]) -> Vec<u8> {
        let (w, h, n) = (self.w, self.h, self.w * self.h);
        let planes = [smooth.to_vec(), vec![0.0; n], vec![0.0; n]];
        let field = structure_field(&planes, w, h, self.o.tensor_sigma);
        let thin = nms(smooth, &field, w, h);
        let mut edges = hysteresis(&thin, w, self.o.high, self.o.low);
        thin_corners(&mut edges, w, h);
        edges
    }

    /// The chains to draw, before the weighing: linked, bridged, closed, cut by length and without
    /// doubles, in raster order.
    fn kept_chains(&self, edges: &[u8]) -> Vec<RawChain> {
        let o = self.o;
        let lo = LinesOpts {
            bridge_gap: o.bridge_gap,
            bridge_deg: o.bridge_deg,
            dup_dist: o.dup_dist,
            dup_share: o.dup_share,
            ..LinesOpts::default()
        };
        let raw = bridge(link(edges, self.w, self.h), &lo);
        let raw: Vec<RawChain> = raw
            .into_iter()
            .map(|c| self.close_chain(c))
            .filter(|c| path_length(&c.pts) >= o.min_len * self.long)
            .collect();
        let mut kept = drop_duplicates(raw, self.w, self.h, &lo);
        kept.sort_by(|a, b| {
            let ka = (a.pts[0][1] as usize, a.pts[0][0] as usize);
            let kb = (b.pts[0][1] as usize, b.pts[0][0] as usize);
            ka.cmp(&kb).then(a.pts.len().cmp(&b.pts.len()))
        });
        kept
    }

    /// An open chain whose two ends are within `CLOSE_GAP` is closed.
    fn close_chain(&self, mut c: RawChain) -> RawChain {
        let (a, b) = (c.pts[0], c.pts[c.pts.len() - 1]);
        if !c.closed && c.pts.len() >= 8 && dist(a, b) <= CLOSE_GAP * self.k {
            c.pts.push(a);
            c.closed = true;
        }
        c
    }

    /// The path of a chain smoothed and simplified.
    fn shaped_path(&self, pts: Vec<[f32; 2]>, closed: bool) -> Vec<[f32; 2]> {
        let mut pts = pts;
        for _ in 0..self.o.smooth_rounds {
            pts = smooth_once(&pts, closed);
        }
        simplify_vw(&pts, self.o.simplify_area)
    }

    /// The weighed chain of a raw one. `None` when the chain is too faint.
    fn chain_of(&self, c: RawChain, smooth: &[f32]) -> Option<Chain> {
        let (w, h, o) = (self.w, self.h, self.o);
        let mean = c
            .pts
            .iter()
            .map(|q| bil(smooth, w, h, q[0], q[1]))
            .sum::<f32>()
            / c.pts.len() as f32;
        if mean < o.min_mean {
            return None;
        }
        let closed = c.closed;
        let pts = self.shaped_path(c.pts, closed);
        let length = path_length(&pts);
        // a long straight line (a church plane, a horizon) is at least in the dark grey tone
        let straight = is_long_line(&pts, self.long);
        Some(Chain {
            pts,
            closed,
            kind: if mean >= o.strong {
                Kind::Hard
            } else {
                Kind::Soft
            },
            contrast: if straight { mean.max(o.mid) } else { mean },
            length,
            score: libm::powf(length, 0.7) * mean,
            kept: false,
            gain: if mean > 0.0 { 1.0 } else { 0.0 },
        })
    }
}

/// The local contrast (map strength) where a line is full ink, and where it has faded away.
pub(crate) const FADE_FULL: f32 = 0.55;
pub(crate) const FADE_NONE: f32 = 0.1;
/// Samples either side of a point that the local contrast is averaged over (at `DRAW_STEP`).
const FADE_SPAN: usize = 4;
/// A chain read from the map whose mean fade is under this is dropped, not drawn as a faint
/// scribble.
const FADE_DROP: f32 = 0.3;
/// A long line (see [`is_long_line`]) never fades under this: a church plane or a
/// horizon keeps its line where the light on both sides is close (but not where the edge is
/// lost). `trace` also puts it in at least the dark grey tone.
const FADE_STRAIGHT: f32 = 0.5;
/// The floor of a straight chain is whole where the local contrast is this or more, and grows in
/// from `FADE_NONE`.
const FADE_FLOOR_AT: f32 = 0.25;
/// A Transfer stroke is this many times the size factor wide, in px at a long side of 1024.
const TRANSFER_WIDTH: f32 = 1.2;

/// The size factor of the px sizes tuned at a long side of 1024: 1 up to that side, then the long
/// side over 1024, so a big picture looks like the screen. They never shrink.
pub(crate) fn size_factor(w: usize, h: usize) -> f32 {
    (w.max(h) as f32 / 1024.0).max(1.0)
}

/// The width in px of a Transfer stroke at this size: the start width (whole px) times `scale`,
/// which may leave a part of a px, so every step of the Edges width knob shows.
fn transfer_width(w: usize, h: usize, scale: f32) -> f32 {
    (TRANSFER_WIDTH * w.max(h) as f32 / 1024.0).round().max(1.0) * scale
}

/// The pieces of a chain, each `(from, to, distance of its middle along the chain)`.
fn pieces(c: &Chain, k: f32) -> Vec<([f32; 2], [f32; 2], f32)> {
    let mut out = Vec::new();
    let mut at = 0.0f32;
    for s in c.pts.windows(2) {
        let len = dist(s[0], s[1]);
        let n = (len / (DRAW_STEP * k)).ceil().max(1.0) as usize;
        for j in 0..n {
            let (u0, u1) = (j as f32 / n as f32, (j + 1) as f32 / n as f32);
            let lerp = |u: f32| {
                [
                    s[0][0] + u * (s[1][0] - s[0][0]),
                    s[0][1] + u * (s[1][1] - s[0][1]),
                ]
            };
            out.push((lerp(u0), lerp(u1), at + len * 0.5 * (u0 + u1)));
        }
        at += len;
    }
    out
}

/// How much of its ink each piece of a chain keeps (0 to 1): the local contrast, averaged along
/// the chain, against the contrast of the chain itself (at most `FADE_FULL`). Where a line loses
/// its edge it fades out, and where it finds it again it comes back. A long line keeps at least
/// `FADE_STRAIGHT`. A chain that is not read from the map keeps all of it.
fn fades(c: &Chain, parts: &[([f32; 2], [f32; 2], f32)], set: &LineSet) -> Vec<f32> {
    if c.gain <= 0.0 {
        return vec![1.0; parts.len()];
    }
    let long = set.width.max(set.height) as f32;
    let floor = if is_long_line(&c.pts, long) {
        FADE_STRAIGHT
    } else {
        0.0
    };
    let local: Vec<f32> = parts
        .iter()
        .map(|(a, b, _)| {
            let m = [f32::midpoint(a[0], b[0]), f32::midpoint(a[1], b[1])];
            bil(&set.strength, set.width, set.height, m[0], m[1]) * c.gain
        })
        .collect();
    (0..local.len())
        .map(|i| {
            let (lo, hi) = (
                i.saturating_sub(FADE_SPAN),
                (i + FADE_SPAN + 1).min(local.len()),
            );
            let v = local[lo..hi].iter().sum::<f32>() / (hi - lo) as f32;
            // the floor grows in as the edge comes back: a lost edge still fades out
            ramp(v, FADE_NONE, FADE_FULL).max(floor * ramp(v, FADE_NONE, FADE_FLOOR_AT))
        })
        .collect()
}

/// 0 under `lo`, 1 over `hi`, a ramp between.
fn ramp(v: f32, lo: f32, hi: f32) -> f32 {
    ((v - lo) / (hi - lo)).clamp(0.0, 1.0)
}

/// The index in [`TONES`] of a chain: black, dark grey or grey by its contrast.
fn tone_of(c: &Chain, o: &EdgeOpts) -> usize {
    if c.contrast >= o.strong {
        0
    } else if c.contrast >= o.mid {
        1
    } else {
        2
    }
}

/// Whether a chain would only be a faint scribble: its mean fade times the darkness of its tone
/// (1 for black) is under `FADE_DROP`. A chain with no gain never fades, so it stays.
fn too_faint(c: &Chain, set: &LineSet, o: &EdgeOpts) -> bool {
    if c.gain <= 0.0 {
        return false;
    }
    let fade = fades(c, &pieces(c, size_factor(set.width, set.height)), set);
    let dark = f32::from(255 - TONES[tone_of(c, o)]) / 255.0;
    !fade.is_empty() && dark * fade.iter().sum::<f32>() / (fade.len() as f32) < FADE_DROP
}

/// The kept chains, black on white. Each chain has a half width from its length and contrast, and
/// a taper at open ends; the width and the ink follow the local contrast along it, so a lost edge
/// fades (the ink is full down to [`INK_FULL`]). `even` (0 to 1) pulls every line toward one middle width ([`EVEN_WEIGHT`]): at 1 each
/// line has that width end to end, with no taper and no thinning where it fades (its ink still
/// fades). `transfer` draws every chain with one width and no taper. `scale` multiplies every
/// width (1 is the start width).
fn draw(set: &LineSet, o: &EdgeOpts, transfer: bool, scale: f32, even: f32) -> Rgb {
    let long = set.width.max(set.height) as f32;
    let k = size_factor(set.width, set.height);
    let mut img = Rgb::filled(set.width, set.height, &[255, 255, 255]);
    let mut cover = Cover::new(set.width, set.height);
    if transfer {
        let half = transfer_width(set.width, set.height, scale) / 2.0;
        for c in set.chains.iter().filter(|c| c.kept) {
            for (a, b, _) in pieces(c, k) {
                cover.segment(a, b, half, 1.0);
            }
        }
        cover.paint(&mut img, INK);
        return img;
    }
    let toward = |v: f32, to: f32| v + (to - v) * even;
    for c in set.chains.iter().filter(|c| c.kept) {
        let t = (c.length / (WEIGHT_LENGTH * long)).min(1.0);
        let strength = ((c.contrast - 0.2) / 0.6).clamp(0.0, 1.0);
        let weight = toward(t * strength, EVEN_WEIGHT);
        let base = LINE_HALF * k + 0.9 * o.weight_gain * weight * k;
        let parts = pieces(c, k);
        let fade = fades(c, &parts, set);
        for ((a, b, mid), f) in parts.into_iter().zip(fade) {
            let ramp = if c.closed {
                1.0
            } else {
                (mid.min(c.length - mid) / o.taper).clamp(0.0, 1.0)
            };
            let thin = LINE_HALF * 0.6 * k;
            let half =
                (thin + (base - thin) * toward(ramp, 1.0)) * toward(0.5 + 0.5 * f, 1.0) * scale;
            cover.segment(a, b, half, (f / INK_FULL).min(1.0));
        }
    }
    cover.paint(&mut img, INK);
    img
}

/// The Edges view from the edge map: a drawing of the kept chains, black on white, the size
/// of `work`. The presets are 0 few, 1 some, 2 many, 3 transfer and `ink` 0 to 1
/// scales the budget the same way, but the lines come from `edges`.
///
/// # Errors
/// [`BadInput`](crate::error::Error::BadInput) when `work` is not a non empty 3 channel image,
/// `edges` is not a 1 channel image of the work size, `preset` is above 3 or `ink` is outside
/// 0 to 1.
#[cfg(test)]
pub fn view(work: &Rgb, preset: u8, ink: f32, edges: &Image<u8>) -> Result<Rgb> {
    if preset > 3 {
        return Err(Error::bad("lines preset must be 0, 1, 2 or 3"));
    }
    view_opts(work, preset_opts(preset), preset == 3, ink, 1.0, 0.0, edges)
}

/// The Edges view of the app: `transfer` false draws lines, with the pipeline `amount_opts` gives
/// for `amount` (0 to 100); true draws the transfer, where `amount` takes the place of the old ink
/// knob. The ink knob itself stays at its middle value (0.5). `scale` multiplies every line width
/// (1 is the start width). `even` (0 to 1) pulls the line widths of Lines toward one width (see
/// `draw`).
///
/// # Errors
/// The errors of `view`, and [`BadInput`](crate::error::Error::BadInput) when `amount` is outside
/// 0 to 100.
pub fn view_amount(
    work: &Rgb,
    transfer: bool,
    amount: f32,
    scale: f32,
    even: f32,
    edges: &Image<u8>,
) -> Result<Rgb> {
    if !(0.0..=100.0).contains(&amount) {
        return Err(Error::bad("edges amount must be 0 to 100"));
    }
    let (opts, ink) = if transfer {
        (preset_opts(3), amount / 100.0)
    } else {
        (amount_opts(amount), 0.5)
    };
    view_opts(work, opts, transfer, ink, scale, even, edges)
}

/// The pipeline past many, at an amount of 100: lower gates, shorter and fainter chains, darker
/// tones and bolder long forms and twice the ink, so the last third of the knob
/// draws clearly more.
fn rich_opts() -> EdgeOpts {
    let many = preset_opts(2);
    EdgeOpts {
        high: 0.2,
        low: 0.07,
        min_len: 0.008,
        min_mean: 0.13,
        strong: 0.42,
        mid: 0.22,
        weight_gain: 1.4,
        ink_budget: many.ink_budget * 2.0,
        ..many
    }
}

/// The pipeline for an `amount` of lines: straight interpolation between the marks 0 few, 33 some,
/// 67 many and 100 rich (see [`rich_opts`]).
fn amount_opts(amount: f32) -> EdgeOpts {
    if amount <= 0.0 {
        return preset_opts(0);
    }
    if (amount - 33.0).abs() < f32::EPSILON {
        return preset_opts(1);
    }
    if (amount - 67.0).abs() < f32::EPSILON {
        return preset_opts(2);
    }
    if amount < 33.0 {
        lerp_opts(&preset_opts(0), &preset_opts(1), amount / 33.0)
    } else if amount < 67.0 {
        lerp_opts(&preset_opts(1), &preset_opts(2), (amount - 33.0) / 34.0)
    } else {
        lerp_opts(&preset_opts(2), &rich_opts(), (amount - 67.0) / 33.0)
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn lerp_count(a: usize, b: usize, t: f32) -> usize {
    lerp(a as f32, b as f32, t).round() as usize
}

/// Every number of `a` moved the share `t` of the way to `b`.
fn lerp_opts(a: &EdgeOpts, b: &EdgeOpts, t: f32) -> EdgeOpts {
    EdgeOpts {
        pre_blur: lerp(a.pre_blur, b.pre_blur, t),
        tensor_sigma: lerp(a.tensor_sigma, b.tensor_sigma, t),
        high: lerp(a.high, b.high, t),
        low: lerp(a.low, b.low, t),
        bridge_gap: lerp(a.bridge_gap, b.bridge_gap, t),
        bridge_deg: lerp(a.bridge_deg, b.bridge_deg, t),
        min_len: lerp(a.min_len, b.min_len, t),
        min_mean: lerp(a.min_mean, b.min_mean, t),
        dup_dist: lerp(a.dup_dist, b.dup_dist, t),
        dup_share: lerp(a.dup_share, b.dup_share, t),
        smooth_rounds: lerp_count(a.smooth_rounds, b.smooth_rounds, t),
        simplify_area: lerp(a.simplify_area, b.simplify_area, t),
        ink_budget: lerp(a.ink_budget, b.ink_budget, t),
        strong: lerp(a.strong, b.strong, t),
        mid: lerp(a.mid, b.mid, t),
        taper: lerp(a.taper, b.taper, t),
        transfer_chains: lerp_count(a.transfer_chains, b.transfer_chains, t),
        weight_gain: lerp(a.weight_gain, b.weight_gain, t),
    }
}

/// The sizes in px of a pipeline, tuned at a long side of 1024, grown by the size factor `k`
/// (see [`size_factor`]): sigmas, gaps and the taper by `k`, the simplify area by `k` squared. The
/// rounds of the 3 tap smoothing go with `k` squared too, as a path has `k` times the points.
fn scale_opts(o: EdgeOpts, k: f32) -> EdgeOpts {
    if k <= 1.0 {
        return o;
    }
    EdgeOpts {
        pre_blur: o.pre_blur * k,
        tensor_sigma: o.tensor_sigma * k,
        bridge_gap: o.bridge_gap * k,
        dup_dist: o.dup_dist * k,
        smooth_rounds: (o.smooth_rounds as f32 * k * k).round() as usize,
        simplify_area: o.simplify_area * k * k,
        taper: o.taper * k,
        ..o
    }
}

/// The body of `view` for a pipeline that is already picked.
fn view_opts(
    work: &Rgb,
    opts: EdgeOpts,
    transfer: bool,
    ink: f32,
    scale: f32,
    even: f32,
    edges: &Image<u8>,
) -> Result<Rgb> {
    check_view_inputs(work, ink, edges)?;
    let k = size_factor(work.width, work.height);
    let opts = scale_opts(
        EdgeOpts {
            ink_budget: opts.ink_budget * ink_scale(ink),
            ..opts
        },
        k,
    );
    let mut set = trace(edges, &opts);
    if !transfer {
        drop_faint(&mut set, &opts);
    }
    let long = work.width.max(work.height) as f32;
    let budget = opts.ink_budget * long;
    if transfer {
        let lo = LinesOpts {
            transfer_chains: opts.transfer_chains,
            silhouette_reach: LinesOpts::default().silhouette_reach * k,
            ..LinesOpts::default()
        };
        rank_transfer(&mut set.chains, budget, &lo);
    } else {
        rank(&mut set.chains, budget);
    }
    Ok(draw(&set, &opts, transfer, scale, even))
}

/// The range checks of `view_opts`: `work` is a non empty 3 channel image, `ink` is 0 to 1 and
/// `edges` is a 1 channel image of the work size.
fn check_view_inputs(work: &Rgb, ink: f32, edges: &Image<u8>) -> Result<()> {
    work.require_rgb("lines needs a non empty 3 channel image")?;
    if !(0.0..=1.0).contains(&ink) {
        return Err(Error::bad("lines ink must be 0 to 1"));
    }
    if (edges.width, edges.height) != (work.width, work.height)
        || edges.channels != 1
        || edges.data.len() != edges.width * edges.height
    {
        return Err(Error::bad(
            "lines edges must be a 1 channel image of the work size",
        ));
    }
    Ok(())
}

/// A chain that would fade to a faint scribble is dropped before the rank (not in transfer), so its
/// ink goes to a clear line.
fn drop_faint(set: &mut LineSet, opts: &EdgeOpts) {
    let keep: Vec<bool> = set
        .chains
        .iter()
        .map(|c| !too_faint(c, set, opts))
        .collect();
    let mut it = keep.iter();
    set.chains.retain(|_| *it.next().unwrap_or(&true));
}

#[cfg(test)]
mod tests;
