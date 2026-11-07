//! Shapes: the photo cut into a nested hierarchy of paintable shapes (big, medium, small).
//!
//! [`view`] is the entry of the Shapes layer. [`decompose`] is the engine under it. The steps, in
//! order:
//!
//! 1. sRGB to `OKLab`, at the size of the work picture.
//! 2. A rolling guidance filter (4 passes, a guided filter with box sums from an integral image)
//!    removes texture and keeps big edges. The `guide` knob blends the lightness guide with the
//!    color guide.
//! 3. SNIC superpixels on the filtered image, seeds on a fixed grid, ties broken by pixel index.
//! 4. A region adjacency graph and a greedy merge. The cost is a Ward distance in `OKLab` (L weighs
//!    more than a and b), plus the contrast along the shared boundary, plus a small size term.
//!    Ties break by (cost, id). Every merge is recorded in one tree.
//! 5. One merge process runs from fine to coarse. It stops at the small, then the medium, then the
//!    big count. Each stop absorbs the regions below the area floor into their cheapest neighbor
//!    and takes a snapshot. A snapshot is a coarsening of the one before, so the levels nest.
//! 6. The `smooth` knob snaps and then rounds the borders. The seeds are a grid, so on a flat
//!    gradient a border follows the grid in steps of one seed distance. First every pixel on a
//!    small border takes, among its own shape and the shapes of its 4 neighbors, the one whose
//!    mean color in the filtered image is nearest, for as many passes as a seed step is wide. A
//!    border moves to the line where the two means are equally near: straight on a gradient, on
//!    the edge where there is one. The medium and big labels follow from the small ones. Then a
//!    mode filter with a radius that grows with the knob (12 px per step at 1024 px, twice that
//!    where the picture is flat) rounds the big labels, the medium ones within them and the small
//!    ones within those, so the levels still nest.
//! 7. Per shape: the mean `OKLab` color of the original pixels and the value `V = round(L* / 10)`
//!    from the mean linear Y.
//! 8. The auto level: the first level (small, then medium, then big) whose next merge costs more
//!    than twice the median of the last ten merges; medium when none does. Then one level finer
//!    when that pick swallows a small, clearly colored shape of the finer level ([`swallows_subject`]).
//!
//! Same input, same bytes: no randomness, no hash map order, floats only through plain `f32` and
//! `f64` arithmetic and `libm`.

use std::cmp::Reverse;
use std::collections::{BTreeMap, BinaryHeap};

use crate::error::{Error, Result};
use crate::filters::{GuideStats, box_mean, guided, guided_with, mode_filter};
use crate::img::Rgb;
use crate::oklab::{self, Ok3};
use crate::srgb::{l_star, linear_luma_of};

/// Index of the big level in [`Shapes::levels`].
pub const BIG: usize = 0;
/// Index of the medium level in [`Shapes::levels`].
pub const MID: usize = 1;
/// Index of the small level in [`Shapes::levels`].
pub const SMALL: usize = 2;

/// Marks "no label" and "no parent".
const NONE: u32 = u32::MAX;

/// The knobs of the decomposition.
#[derive(Clone, Debug, PartialEq)]
pub struct ShapesOpts {
    /// Passes of the rolling guidance filter.
    pub rgf_iters: usize,
    /// Box radius of the guided filter in pixels at a long side of 1024. It scales with the long side.
    pub rgf_radius: f32,
    /// Range sigma of the guided filter on L. The guided filter uses sigma squared as its eps.
    pub rgf_sigma: f32,
    /// About how many superpixel seeds, on a fixed grid.
    pub seeds: usize,
    /// SNIC compactness: the `OKLab` distance that counts as much as one grid step.
    pub compactness: f32,
    /// Weights of L, a and b in the Ward distance and in the boundary contrast.
    pub weights: [f32; 3],
    /// Weight of the summed boundary contrast in the merge cost.
    pub edge_weight: f32,
    /// Weight of the square root of the smaller area in the merge cost.
    pub size_weight: f32,
    /// A merge whose Ward plus edge cost is at most this is free: it happens even at the count.
    pub free_cost: f32,
    /// Shape counts for big, medium and small. They are upper bounds, see `free_cost`.
    pub counts: [usize; 3],
    /// Area floors in percent of the image for big, medium and small.
    pub floors_pct: [f32; 3],
    /// Steps of the mode filter that rounds the label boundaries. Each step is `smooth_px` of radius at
    /// a long side of 1024, scaled with the long side. 0 turns it off, and the snap of the borders
    /// to the picture with it.
    pub smooth: usize,
    /// Radius of one `smooth` step in pixels at a long side of 1024.
    pub smooth_px: f32,
    /// Weight of the color guide against the lightness guide in the rolling guidance filter,
    /// 0 to 1.
    pub guide: f32,
}

impl Default for ShapesOpts {
    fn default() -> Self {
        Self {
            rgf_iters: 4,
            rgf_radius: 4.0,
            rgf_sigma: 0.07,
            seeds: 2500,
            compactness: 0.1,
            weights: [1.75, 0.75, 0.75],
            edge_weight: 1.0,
            size_weight: 0.01,
            free_cost: 0.25,
            counts: [7, 20, 60],
            floors_pct: [1.5, 0.3, 0.05],
            smooth: 0,
            smooth_px: SMOOTH_PX,
            guide: 0.0,
        }
    }
}

/// One paintable shape.
#[derive(Clone, Debug, PartialEq)]
pub struct Shape {
    /// Pixels in the shape.
    pub area: u32,
    /// Mean `OKLab` color of the original pixels.
    pub color: [f32; 3],
    /// That color as sRGB bytes.
    pub rgb: [u8; 3],
    /// Value 0 (black) to 10 (white), `round(L* / 10)` of the mean linear Y.
    pub value: u8,
    /// Index of the shape that holds this one in the coarser level. `None` for the big level.
    pub parent: Option<u32>,
}

/// One level of the hierarchy.
#[derive(Clone, Debug, PartialEq)]
pub struct Level {
    /// Shape index of every pixel, row by row.
    pub labels: Vec<u32>,
    /// The shapes.
    pub shapes: Vec<Shape>,
}

/// The result: three nested levels on the working size.
#[derive(Clone, Debug, PartialEq)]
pub struct Shapes {
    /// Width of the working copy.
    pub width: usize,
    /// Height of the working copy.
    pub height: usize,
    /// Big, medium and small, see [`BIG`], [`MID`] and [`SMALL`].
    pub levels: [Level; 3],
    /// The level the auto pick chose: [`BIG`], [`MID`] or [`SMALL`].
    pub auto: usize,
    /// Indexed like [`Shapes::levels`]: the cost of the next merge over the median cost of the
    /// last ten merges, at the moment that level was cut.
    pub merge_ratio: [f32; 3],
}

impl Shapes {
    /// Flat fills: every shape in its mean color.
    pub fn fill_rgb(&self, level: usize) -> Rgb {
        let lv = &self.levels[level];
        let data = lv
            .labels
            .iter()
            .flat_map(|&l| lv.shapes[l as usize].rgb)
            .collect();
        Rgb::from_vec(self.width, self.height, 3, data)
    }

    /// Dark ink lines on every shape boundary, on white paper, except between two shapes of
    /// nearly the same color (see [`same_paint`]): a smooth gradient is not cut into bands. A border
    /// that a coarser level draws is drawn here too. The line is `scale` px wide at a long side of
    /// 1024 and grows with the long side (twice that at 2048); a part of a px is one more px of
    /// lighter ink.
    pub fn outline_rgb(&self, level: usize, scale: f32) -> Rgb {
        let (w, h) = (self.width, self.height);
        // A border drawn at a coarser level stays at the finer ones, so the outlines nest.
        let mut edge = vec![false; w * h];
        for lv in &self.levels[..=level] {
            let border = |a: u32, b: u32| {
                a != b && !same_paint(&lv.shapes[a as usize], &lv.shapes[b as usize])
            };
            for y in 0..h {
                for x in 0..w {
                    let i = y * w + x;
                    edge[i] |= (x + 1 < w && border(lv.labels[i], lv.labels[i + 1]))
                        || (y + 1 < h && border(lv.labels[i], lv.labels[i + w]));
                }
            }
        }
        // whole px in full ink, and the part of a px left over as one more px of lighter ink, so
        // every step of the Edges width knob shows
        let width = line_width(w.max(h), scale);
        let full = width.floor() as usize;
        let part = width - full as f32;
        let core = if full > 0 {
            widen(&edge, w, h, full)
        } else {
            vec![false; w * h]
        };
        let rim = widen(&edge, w, h, full + 1);
        let soft: [u8; 3] = std::array::from_fn(|c| {
            let (paper, ink) = (f32::from(OUTLINE_PAPER[c]), f32::from(OUTLINE_INK[c]));
            (paper + (ink - paper) * part).round() as u8
        });
        let mut data = Vec::with_capacity(w * h * 3);
        for (&inside, &near) in core.iter().zip(&rim) {
            data.extend_from_slice(if inside {
                &OUTLINE_INK
            } else if near {
                &soft
            } else {
                &OUTLINE_PAPER
            });
        }
        Rgb::from_vec(w, h, 3, data)
    }

    /// True when every medium shape lies inside one big shape and every small one inside one
    /// medium shape. For the tests.
    #[cfg(test)]
    pub fn is_nested(&self) -> bool {
        (1..3).all(|l| {
            let mut owner = vec![NONE; self.levels[l].shapes.len()];
            self.levels[l]
                .labels
                .iter()
                .zip(&self.levels[l - 1].labels)
                .all(|(&fine, &coarse)| {
                    let o = &mut owner[fine as usize];
                    if *o == NONE {
                        *o = coarse;
                    }
                    *o == coarse
                })
        })
    }
}

/// How [`view`] paints the shapes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fill {
    /// Every shape in its mean color.
    Color,
    /// Dark ink boundaries on white paper: 1 px at 1024 px, scaled with the long side. The
    /// Masses mode of Edges paints it.
    Outline,
}

/// The settings of the Shapes view.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShapesView {
    /// 0 big, 1 mid, 2 small, 3 auto.
    pub level: u8,
    /// 0 to 1. The shape count of the level is multiplied by `0.5 + detail`.
    pub detail: f32,
    /// How the shapes are painted.
    pub fill: Fill,
    /// 0 to 3: how far the mode filter rounds the boundaries, 12 px of radius per step at
    /// 1024 px. 0 keeps the raw superpixel borders.
    pub smooth: u8,
    /// 0 to 1: the weight of the color guide against the lightness guide.
    pub guide: f32,
    /// How wide the Outline fill draws a border, times its start width (1 px at a long side of
    /// 1024). The other fills do not use it.
    pub outline: f32,
}

/// The largest `OKLab` lightness step of two shapes that still count as one paint: 4 L*, since
/// `OKLab` L runs about 116 per unit of L*.
const SAME_LIGHT: f32 = 4.0 / 116.0;

/// The largest `OKLab` chroma step (distance in a and b) of two shapes of one paint.
const SAME_CHROMA: f32 = 0.02;

/// True when two shapes differ so little in mean color that an outline between them only draws
/// a band of a smooth gradient, not a mass of the picture.
fn same_paint(a: &Shape, b: &Shape) -> bool {
    let [dl, da, db] = [0, 1, 2].map(|k| a.color[k] - b.color[k]);
    dl.abs() < SAME_LIGHT && da.hypot(db) < SAME_CHROMA
}

/// The ink of an outline: dark grey, like the ink of the Edges layer.
const OUTLINE_INK: [u8; 3] = [30, 30, 30];

/// The paper of an outline: white, so the Edges layer makes it clear.
const OUTLINE_PAPER: [u8; 3] = [255, 255, 255];

/// The width in px of an outline at this long side: the start width (the long side over 1024,
/// rounded, at least 1) times `scale`. It may end in a part of a px.
fn line_width(long: usize, scale: f32) -> f32 {
    (long as f32 / 1024.0).round().max(1.0) * scale
}

/// The mask grown to lines `thick` px wide: every marked pixel marks the `thick` pixels from
/// `(thick - 1) / 2` before it to `thick / 2` after it, along x and then along y.
fn widen(mask: &[bool], w: usize, h: usize, thick: usize) -> Vec<bool> {
    let (before, after) = ((thick - 1) / 2, thick / 2);
    let mut wide = vec![false; w * h];
    for y in 0..h {
        for x in 0..w {
            if mask[y * w + x] {
                for xx in x.saturating_sub(before)..=(x + after).min(w - 1) {
                    wide[y * w + xx] = true;
                }
            }
        }
    }
    let mut out = vec![false; w * h];
    for y in 0..h {
        for x in 0..w {
            if wide[y * w + x] {
                for yy in y.saturating_sub(before)..=(y + after).min(h - 1) {
                    out[yy * w + x] = true;
                }
            }
        }
    }
    out
}

/// Cuts `work` and returns the shapes and the index of the level that `v.level` names.
fn cut(work: &Rgb, v: &ShapesView) -> Result<(Shapes, usize)> {
    check_view(work, v)?;
    let mut opts = ShapesOpts {
        smooth: usize::from(v.smooth),
        guide: v.guide,
        ..ShapesOpts::default()
    };
    let scale = 0.5 + v.detail;
    opts.counts = opts
        .counts
        .map(|c| ((c as f32 * scale).round() as usize).max(1));
    let shapes = decompose(work, &opts);
    let level = match v.level {
        0 => BIG,
        1 => MID,
        2 => SMALL,
        _ => shapes.auto,
    };
    Ok((shapes, level))
}

/// The range checks of a Shapes view.
fn check_view(work: &Rgb, v: &ShapesView) -> Result<()> {
    work.require_rgb("shapes needs a non empty 3 channel image")?;
    if v.level > 3 {
        return Err(Error::bad("shapes level must be 0, 1, 2 or 3"));
    }
    if v.smooth > 3 {
        return Err(Error::bad("shapes smooth must be 0 to 3"));
    }
    if !(0.0..=1.0).contains(&v.detail) || !(0.0..=1.0).contains(&v.guide) {
        return Err(Error::bad("shapes detail and guide must be 0 to 1"));
    }
    Ok(())
}

/// The Shapes view: the photo cut into shapes of one level and painted by `v.fill`. The result
/// has the size of `work`.
///
/// # Errors
/// [`BadInput`](crate::error::Error::BadInput) when `work` is not a non empty 3 channel image,
/// `level` is above 3, `smooth` is above 3, or `detail` or `guide` is outside 0 to 1.
pub fn view(work: &Rgb, v: &ShapesView) -> Result<Rgb> {
    let (shapes, level) = cut(work, v)?;
    Ok(paint(&shapes, level, v))
}

/// The last paint order step of [`steps_view`].
pub const STEP_MAX: u8 = 3;

/// A small shape is an accent when its mean lifted L* is this far from the block-in shape it lies
/// in, darker in the shadow family or lighter among the lights.
const ACCENT_L: f32 = 10.0;
/// ...and it covers at most this share of the picture...
const ACCENT_SHARE: f32 = 0.02;
/// ...and at least this share (about 80 px at 1024 px), so a lone pixel is not an accent.
const ACCENT_MIN_SHARE: f32 = 0.0001;
/// The paint steps cut finer than the other Shapes views: this many superpixel seeds (about 9 px
/// apart at 1024 px)...
const STEPS_SEEDS: usize = 9000;
/// ...these shape counts for big, medium and small at the middle of the Detail knob...
const STEPS_COUNTS: [usize; 3] = [12, 60, 400];
/// ...these area floors in percent (the smallest shape is about 30 px at 1024 px)...
const STEPS_FLOORS_PCT: [f32; 3] = [1.0, 0.1, 0.004];
/// ...and a border rounding of this radius in pixels at 1024 px, so an eye, a nostril or a
/// highlight keeps its own shape.
const STEPS_SMOOTH_PX: f32 = 2.0;
/// A cell painted in the underpaint of an accent: it names no pile of the legend.
const NO_PILE: usize = usize::MAX;
/// The legend lists at most this many piles per step, the ones that cover the most.
const LEGEND_MAX: usize = 8;
/// Two shapes of one step share a pile of mixed paint when their mean colors are this close: the
/// `OKLab` distance with the lightness counted twice, so a pile stays within a third of a value.
const PILE_DIST: f32 = 0.06;
/// A color family mixes at most this many piles in a step (Gurney mixes a string of 4 to 5 value
/// piles; the mind holds about 4 at once)...
const PILES_MAX: usize = 4;
/// ...unless that needs a pile distance over this, about three quarters of a value.
const PILE_DIST_MAX: f32 = 0.15;
/// Two colors are one color family (skin, foliage, sky, the grays) when their hue and chroma, the
/// a and b of `OKLab`, are this close. A pile never mixes two families, so skin never takes the
/// pile of a gray wall.
const FAMILY_AB: f32 = 0.035;
/// The bare canvas, where nothing is painted yet.
const CANVAS: [u8; 3] = [255, 255, 255];

/// The Shapes view as a paint order: the photo cut fine (see `STEPS_SEEDS`) and laid on a white canvas in the order a painter lays it for fat
/// over lean. `step` 0 paints the shadow family (thin, lean); 1 adds the halftones; 2 adds the
/// lights (thick); 3 adds the accents, small shapes far in value from the medium shape that holds
/// them (the darkest darks and the brightest lights, last and thickest; before that they show
/// the underpaint). The families are those of the Values view (see
/// [`crate::values::families`]). Each shape is painted in its own mean color. In each step,
/// shapes of near the same color share one pile of mixed paint. It returns the picture and the
/// piles mixed in `step`, darkest first, as sRGB bytes.
///
/// # Errors
/// The errors of [`view`], and [`BadInput`](crate::error::Error::BadInput) for a `step` over
/// [`STEP_MAX`].
pub fn steps_view(work: &Rgb, step: u8, v: &ShapesView) -> Result<(Rgb, Vec<[u8; 3]>)> {
    if step > STEP_MAX {
        return Err(Error::bad("shapes step must be 0 to 3"));
    }
    check_view(work, v)?;
    let families = crate::values::families(work);
    // the Detail knob scales the counts from a quarter to four times
    let scale = libm::powf(4.0, 2.0 * v.detail - 1.0);
    let shapes = cut_steps(work, v, scale);
    let plan = plan_steps(&shapes, &families);
    let cells = step_cells(&shapes, &plan, step);
    Ok(finish_steps(&cells, &plan.piles, step, work))
}

/// The cut of the paint steps (see `STEPS_SEEDS`), with the shape counts times `scale`.
fn cut_steps(work: &Rgb, v: &ShapesView, scale: f32) -> Shapes {
    let opts = ShapesOpts {
        seeds: STEPS_SEEDS,
        counts: STEPS_COUNTS.map(|c| ((c as f32 * scale).round() as usize).max(1)),
        floors_pct: STEPS_FLOORS_PCT,
        smooth: 1,
        smooth_px: STEPS_SMOOTH_PX,
        guide: v.guide,
        ..ShapesOpts::default()
    };
    decompose(work, &opts)
}

/// The mean of `l` over each shape of a level.
fn mean_per_shape(lv: &Level, l: &[f32]) -> Vec<f32> {
    let mut sum = vec![0f64; lv.shapes.len()];
    for (&s, &v) in lv.labels.iter().zip(l) {
        sum[s as usize] += f64::from(v);
    }
    sum.iter()
        .zip(&lv.shapes)
        .map(|(&t, s)| (t / f64::from(s.area.max(1))) as f32)
        .collect()
}

/// The paint order of one cut, on its small level: the step and pile of every shape, and the
/// piles of each step.
struct StepPlan {
    /// The step of every small shape: 0 to 2 by its value family, 3 for an accent.
    step: Vec<u8>,
    /// The pile of every small shape, in the piles of its step.
    pile: Vec<usize>,
    /// The medium shape that holds each small shape.
    owner: Vec<u32>,
    /// The step of every medium shape: an accent is underpainted in its owner's color and step.
    under: Vec<u8>,
    /// The piles of each step, steps 0 to 3.
    piles: Vec<Vec<Ok3>>,
}

/// Plans the paint order of [`steps_view`]. Every shape of the small level is painted in the
/// step of its value family, or last as an accent when it is far in value from the medium shape
/// that holds it.
fn plan_steps(s: &Shapes, f: &crate::values::Families) -> StepPlan {
    let (mid, small) = (&s.levels[MID], &s.levels[SMALL]);
    let family_step = |l: f32| {
        if l < f.brk {
            0
        } else if l < f.half {
            1
        } else {
            2
        }
    };
    let small_l = mean_per_shape(small, &f.lifted);
    let mid_l = mean_per_shape(mid, &f.lifted);
    let mut owner = vec![0u32; small.shapes.len()];
    for (&a, &b) in small.labels.iter().zip(&mid.labels) {
        owner[a as usize] = b;
    }
    let total = small.labels.len() as f32;
    let step: Vec<u8> = small
        .shapes
        .iter()
        .enumerate()
        .map(|(i, sh)| {
            let d = small_l[i] - mid_l[owner[i] as usize];
            let share = sh.area as f32 / total;
            let accent = (ACCENT_MIN_SHARE..=ACCENT_SHARE).contains(&share)
                && ((d <= -ACCENT_L && small_l[i] < f.brk)
                    || (d >= ACCENT_L && small_l[i] >= f.half));
            if accent {
                STEP_MAX
            } else {
                family_step(small_l[i])
            }
        })
        .collect();
    let under = mid_l.iter().map(|&l| family_step(l)).collect();
    let mut pile = vec![0usize; small.shapes.len()];
    let mut all = Vec::with_capacity(usize::from(STEP_MAX) + 1);
    for k in 0..=STEP_MAX {
        let ids: Vec<usize> = (0..small.shapes.len()).filter(|&i| step[i] == k).collect();
        let colors: Vec<Ok3> = ids.iter().map(|&i| small.shapes[i].color).collect();
        let areas: Vec<u32> = ids.iter().map(|&i| small.shapes[i].area).collect();
        let (of, piles) = piles(&colors, &areas);
        for (&i, &p) in ids.iter().zip(&of) {
            pile[i] = p;
        }
        all.push(piles);
    }
    StepPlan {
        step,
        pile,
        owner,
        under,
        piles: all,
    }
}

/// One painted pixel: its step, its pile in that step (or `NO_PILE`) and its color.
type Cell = Option<(u8, usize, [u8; 3])>;

/// The cell of every pixel in the picture of `step`, or none for the bare canvas. Before the last
/// step an accent shows the color of the medium shape that holds it.
fn step_cells(s: &Shapes, plan: &StepPlan, step: u8) -> Vec<Cell> {
    let (mid, small) = (&s.levels[MID], &s.levels[SMALL]);
    small
        .labels
        .iter()
        .map(|&a| {
            let a = a as usize;
            let k = plan.step[a];
            if k <= step {
                Some((k, plan.pile[a], small.shapes[a].rgb))
            } else if k == STEP_MAX {
                let m = plan.owner[a] as usize;
                (plan.under[m] <= step).then(|| (plan.under[m], NO_PILE, mid.shapes[m].rgb))
            } else {
                None
            }
        })
        .collect()
}

/// The picture of [`steps_view`] from its cells, and the piles mixed in `step`: the
/// `LEGEND_MAX` that cover the most of the picture, darkest first, as sRGB bytes.
fn finish_steps(cells: &[Cell], piles: &[Vec<Ok3>], step: u8, work: &Rgb) -> (Rgb, Vec<[u8; 3]>) {
    let mut area = vec![0u32; piles[usize::from(step)].len()];
    let data = cells
        .iter()
        .flat_map(|&c| match c {
            Some((k, p, rgb)) => {
                if k == step && p != NO_PILE {
                    area[p] += 1;
                }
                rgb
            }
            None => CANVAS,
        })
        .collect();
    let mut shown: Vec<usize> = (0..area.len()).filter(|&p| area[p] > 0).collect();
    shown.sort_by_key(|&p| (Reverse(area[p]), p));
    shown.truncate(LEGEND_MAX);
    let mut mixed: Vec<Ok3> = shown.iter().map(|&p| piles[usize::from(step)][p]).collect();
    mixed.sort_by(|a, b| a[0].total_cmp(&b[0]));
    let mixed = mixed.into_iter().map(oklab::to_srgb).collect();
    (Rgb::from_vec(work.width, work.height, 3, data), mixed)
}

/// The paint distance of two `OKLab` colors: lightness counts twice.
fn pile_distance(a: Ok3, b: Ok3) -> f32 {
    let [dl, da, db] = [0, 1, 2].map(|k| a[k] - b[k]);
    ((2.0 * dl).powi(2) + da * da + db * db).sqrt()
}

/// Groups the colors of one color family into piles of mixed paint. The biggest area goes first; each color joins the
/// first pile within the pile distance of the pile's area-weighted mean, or starts a new one.
/// The distance starts at `PILE_DIST` and grows by a quarter while there are more than
/// `PILES_MAX` piles, up to `PILE_DIST_MAX`. Gives the pile of each color and the pile colors.
fn value_piles(colors: &[Ok3], areas: &[u32]) -> (Vec<usize>, Vec<Ok3>) {
    let mut order: Vec<usize> = (0..colors.len()).collect();
    order.sort_by_key(|&i| (Reverse(areas[i]), i));
    let mut dist = PILE_DIST;
    loop {
        let mut of = vec![0usize; colors.len()];
        let mut sums: Vec<([f64; 3], f64)> = Vec::new();
        let mean = |(s, n): &([f64; 3], f64)| s.map(|v| (v / n) as f32);
        for &i in &order {
            let c = colors[i];
            let wgt = f64::from(areas[i].max(1));
            let at = sums.iter().position(|p| pile_distance(mean(p), c) <= dist);
            let at = at.unwrap_or_else(|| {
                sums.push(([0.0; 3], 0.0));
                sums.len() - 1
            });
            let (s, n) = &mut sums[at];
            for k in 0..3 {
                s[k] += f64::from(c[k]) * wgt;
            }
            *n += wgt;
            of[i] = at;
        }
        if sums.len() <= PILES_MAX || dist >= PILE_DIST_MAX {
            return (of, sums.iter().map(mean).collect());
        }
        dist = (dist * 1.25).min(PILE_DIST_MAX);
    }
}

/// The distance of two colors in hue and chroma only: the a and b of `OKLab`.
fn ab_distance(a: Ok3, b: Ok3) -> f32 {
    (a[1] - b[1]).hypot(a[2] - b[2])
}

/// Groups colors into piles of mixed paint: first into color families (the biggest area first,
/// each color joins the first family whose area-weighted mean a and b are within `FAMILY_AB`),
/// then each family into value piles (see [`value_piles`]). Gives the pile of each color and the
/// pile colors.
fn piles(colors: &[Ok3], areas: &[u32]) -> (Vec<usize>, Vec<Ok3>) {
    let mut order: Vec<usize> = (0..colors.len()).collect();
    order.sort_by_key(|&i| (Reverse(areas[i]), i));
    let mut family = vec![0usize; colors.len()];
    let mut sums: Vec<([f64; 2], f64)> = Vec::new();
    for &i in &order {
        let c = colors[i];
        let at = sums.iter().position(|&([a, b], n)| {
            ab_distance([0.0, (a / n) as f32, (b / n) as f32], c) <= FAMILY_AB
        });
        let at = at.unwrap_or_else(|| {
            sums.push(([0.0; 2], 0.0));
            sums.len() - 1
        });
        let wgt = f64::from(areas[i].max(1));
        let (s, n) = &mut sums[at];
        s[0] += f64::from(c[1]) * wgt;
        s[1] += f64::from(c[2]) * wgt;
        *n += wgt;
        family[i] = at;
    }
    let mut of = vec![0usize; colors.len()];
    let mut all = Vec::new();
    for f in 0..sums.len() {
        let ids: Vec<usize> = (0..colors.len()).filter(|&i| family[i] == f).collect();
        let fc: Vec<Ok3> = ids.iter().map(|&i| colors[i]).collect();
        let fa: Vec<u32> = ids.iter().map(|&i| areas[i]).collect();
        let (fo, fp) = value_piles(&fc, &fa);
        for (&i, &p) in ids.iter().zip(&fo) {
            of[i] = all.len() + p;
        }
        all.extend(fp);
    }
    (of, all)
}

/// One level of the shapes painted by the fill of `v`.
fn paint(shapes: &Shapes, level: usize, v: &ShapesView) -> Rgb {
    match v.fill {
        Fill::Color => shapes.fill_rgb(level),
        Fill::Outline => shapes.outline_rgb(level, v.outline),
    }
}

/// Cuts an RGB image into the three nested levels.
///
/// # Panics
/// When the image is not 3 channels or has no pixels.
pub fn decompose(src: &Rgb, opts: &ShapesOpts) -> Shapes {
    assert!(
        src.channels == 3 && src.width > 0 && src.height > 0,
        "shapes needs a non empty RGB image"
    );
    let work = src;
    let (w, h) = (work.width, work.height);
    let lab = oklab::image_to_oklab(work);
    let luma = linear_luma_of(work);
    let radius = ((opts.rgf_radius * w.max(h) as f32 / 1024.0).round() as usize).max(1);
    let filtered = rolling_guidance(&lab, w, h, radius, opts);
    let (sp, n_sp) = snic(&filtered, w, h, opts.seeds, opts.compactness);
    let mut rag = Rag::new(&filtered, &sp, n_sp, w, opts);

    let total = (w * h) as f32;
    let mut snaps: [Option<(Vec<u32>, usize)>; 3] = [None, None, None];
    let mut merge_ratio = [0f32; 3];
    for lvl in [SMALL, MID, BIG] {
        rag.run_until(opts.counts[lvl]);
        merge_ratio[lvl] = rag.next_merge_ratio();
        let floor = (opts.floors_pct[lvl] / 100.0 * total).ceil() as u32;
        rag.absorb(floor);
        snaps[lvl] = Some(rag.snapshot(&sp, n_sp));
    }
    let [Some(big), Some(mid), Some(small)] = snaps else {
        unreachable!("all three levels are set above")
    };
    let [big, mid, small] = if opts.smooth > 0 {
        let r = smooth_radius(opts.smooth, opts.smooth_px, w.max(h));
        let passes = seed_step(w, h, opts.seeds).round() as usize;
        let snapped = snap_labels(&small.0, small.1, &filtered, w, h, opts.weights, passes);
        let flat = flat_map(&filtered, w, h, WIDE * r, opts.weights);
        smooth_levels(lift([big, mid, small], snapped), w, h, r, &flat)
    } else {
        [big, mid, small]
    };
    let auto = jump_pick(&merge_ratio);
    let mut levels = [big, mid, small].map(|(labels, count)| Level {
        shapes: shape_stats(&labels, count, &lab, &luma),
        labels,
    });
    for l in [MID, SMALL] {
        let firsts = first_pixels(&levels[l].labels, levels[l].shapes.len());
        let parents: Vec<u32> = firsts
            .iter()
            .map(|&p| levels[l - 1].labels[p as usize])
            .collect();
        for (s, p) in levels[l].shapes.iter_mut().zip(parents) {
            s.parent = Some(p);
        }
    }
    // A small, clear subject that the picked level swallows asks for the next finer level.
    let auto = if auto != SMALL && swallows_subject(&levels[auto], &levels[auto + 1], total, opts) {
        auto + 1
    } else {
        auto
    };
    Shapes {
        width: w,
        height: h,
        levels,
        auto,
        merge_ratio,
    }
}

/// The auto level needs the next merge to cost more than this many times the median of the last
/// ten merges.
const AUTO_JUMP: f32 = 2.0;

/// The first level (small, medium, big) whose next merge jumps; medium when none does.
fn jump_pick(merge_ratio: &[f32; 3]) -> usize {
    [SMALL, MID, BIG]
        .into_iter()
        .find(|&l| merge_ratio[l] > AUTO_JUMP)
        .unwrap_or(MID)
}

/// A shape of the finer level counts as a subject when it covers at least this share of the
/// image, in percent.
const SUBJECT_AREA_PCT: f32 = 0.5;

/// A subject is swallowed when the coarse shape that holds it is at least this many times bigger.
const SUBJECT_ROOM: f32 = 3.0;

/// A subject is clear when its mean color is this far (weighted `OKLab`) from the mean color of
/// the coarse shape that holds it. A lemon on olive cloth is 0.34. The biggest step in the two
/// landscapes of the bench is 0.2.
const SUBJECT_STEP: f32 = 0.25;

/// True when some shape of `fine` is big enough and clearly different in color from the shape of
/// `coarse` that swallows it. Both levels come from one cut, so every fine shape has a parent.
fn swallows_subject(coarse: &Level, fine: &Level, total: f32, opts: &ShapesOpts) -> bool {
    let floor = SUBJECT_AREA_PCT / 100.0 * total;
    fine.shapes.iter().any(|s| {
        let area = s.area as f32;
        let Some(p) = s.parent.map(|p| &coarse.shapes[p as usize]) else {
            return false;
        };
        let step: f32 = (0..3)
            .map(|k| opts.weights[k] * (s.color[k] - p.color[k]).powi(2))
            .sum::<f32>()
            .sqrt();
        area >= floor && p.area as f32 >= SUBJECT_ROOM * area && step >= SUBJECT_STEP
    })
}

/// Snaps the borders of the small labels to the picture. For every pair of shapes that share a
/// border, a pixel's color projects on the line from the one mean color to the other (0 at the
/// first, 1 at the second, in the filtered image, weighted like the merge), and the threshold of
/// the pair is the mean projection of the pixels along their border. Then `passes` times, every
/// pixel on a border moves to the neighbor shape its projection is past the threshold of, the one
/// it is past by the most. So a border moves, one px per pass, to the iso line of its threshold:
/// straight on a flat gradient, where the superpixel cells gave a staircase, and on the edge where
/// there is one, while its mean position stays where the merge put it. A pair with no border at
/// the start, or with the same mean, does not trade pixels. Every pass reads the labels of the
/// pass before, so the order of the pixels does not matter.
fn snap_labels(
    labels: &[u32],
    count: usize,
    lab: &[Ok3],
    w: usize,
    h: usize,
    weights: [f32; 3],
    passes: usize,
) -> Vec<u32> {
    let mut snap = Snap {
        lab,
        mean: label_means(labels, count, lab),
        weights,
        count,
        threshold: Vec::new(),
    };
    snap.threshold = snap.border_thresholds(labels, w, h);
    let mut cur = labels.to_vec();
    // the pixels to look at in the next pass, each once
    let mut seen = vec![0u32; w * h];
    let mut active: Vec<usize> = (0..w * h)
        .filter(|&i| {
            around(i, w, h)
                .into_iter()
                .flatten()
                .any(|j| cur[j] != cur[i])
        })
        .collect();
    for pass in 1..=passes as u32 {
        if active.is_empty() {
            break;
        }
        let moves = snap.moves(&cur, &active, w, h);
        active.clear();
        for &(i, l) in &moves {
            cur[i] = l;
        }
        for &(i, _) in &moves {
            for j in std::iter::once(i).chain(around(i, w, h).into_iter().flatten()) {
                if seen[j] != pass {
                    seen[j] = pass;
                    active.push(j);
                }
            }
        }
    }
    cur
}

/// The mean color of every label (`count` labels), summed in `f64`.
fn label_means(labels: &[u32], count: usize, lab: &[Ok3]) -> Vec<[f32; 3]> {
    let mut sum = vec![[0f64; 3]; count];
    let mut n = vec![0u32; count];
    for (&l, c) in labels.iter().zip(lab) {
        let s = &mut sum[l as usize];
        for k in 0..3 {
            s[k] += f64::from(c[k]);
        }
        n[l as usize] += 1;
    }
    sum.iter()
        .zip(&n)
        .map(|(s, &n)| {
            let inv = 1.0 / f64::from(n.max(1));
            [
                (s[0] * inv) as f32,
                (s[1] * inv) as f32,
                (s[2] * inv) as f32,
            ]
        })
        .collect()
}

/// The up, left, right and down neighbors of pixel `i` that lie in a `w` by `h` image.
fn around(i: usize, w: usize, h: usize) -> [Option<usize>; 4] {
    let (x, y) = (i % w, i / w);
    [
        (y > 0).then(|| i - w),
        (x > 0).then(|| i - 1),
        (x + 1 < w).then(|| i + 1),
        (y + 1 < h).then(|| i + w),
    ]
}

/// What the border snap needs to judge a pixel: the filtered colors, the mean color of every shape
/// and the threshold of every pair of shapes.
struct Snap<'a> {
    lab: &'a [Ok3],
    mean: Vec<[f32; 3]>,
    weights: [f32; 3],
    count: usize,
    /// The threshold of the pair (lo, hi) at `lo * count + hi`, `None` for a pair with no border.
    threshold: Vec<Option<f32>>,
}

impl Snap<'_> {
    /// The projection of pixel `i` on the line from mean `a` to mean `b`, and the length of that
    /// line, both in weighted color units; `None` when the means are the same.
    fn project(&self, i: usize, a: u32, b: u32) -> Option<(f32, f32)> {
        let (c, ma, mb) = (self.lab[i], self.mean[a as usize], self.mean[b as usize]);
        let (mut along, mut len2) = (0f32, 0f32);
        for k in 0..3 {
            let d = mb[k] - ma[k];
            along += self.weights[k] * (c[k] - ma[k]) * d;
            len2 += self.weights[k] * d * d;
        }
        (len2 > SAME_MEAN).then(|| (along / len2, len2.sqrt()))
    }

    /// The threshold of every pair (lo, hi) at `lo * count + hi`: the mean projection of the
    /// pixels along the border of the pair.
    fn border_thresholds(&self, labels: &[u32], w: usize, h: usize) -> Vec<Option<f32>> {
        let mut threshold = vec![(0f64, 0u32); self.count * self.count];
        for i in 0..w * h {
            for j in [
                (i % w + 1 < w).then(|| i + 1),
                (i / w + 1 < h).then(|| i + w),
            ]
            .into_iter()
            .flatten()
            {
                let (a, b) = (labels[i], labels[j]);
                if a == b {
                    continue;
                }
                let (lo, hi) = (a.min(b), a.max(b));
                let t = &mut threshold[lo as usize * self.count + hi as usize];
                for p in [i, j] {
                    if let Some((along, _)) = self.project(p, lo, hi) {
                        t.0 += f64::from(along);
                        t.1 += 1;
                    }
                }
            }
        }
        threshold
            .iter()
            .map(|&(s, n)| (n > 0).then(|| (s / f64::from(n)) as f32))
            .collect()
    }

    /// How far past the threshold pixel `i` of shape `own` is toward shape `other`, in weighted
    /// color units; `None` when the pair does not trade pixels.
    fn margin(&self, i: usize, own: u32, other: u32) -> Option<f32> {
        let (lo, hi) = (own.min(other), own.max(other));
        let t = self.threshold[lo as usize * self.count + hi as usize]?;
        let (along, len) = self.project(i, lo, hi)?;
        let past = if own == lo { along - t } else { t - along };
        Some(past * len)
    }

    /// The pixels of `active` that change shape in one pass, with their new shape. Each reads the
    /// labels `cur` of the pass before.
    fn moves(&self, cur: &[u32], active: &[usize], w: usize, h: usize) -> Vec<(usize, u32)> {
        let mut moves: Vec<(usize, u32)> = Vec::new();
        for &i in active {
            let own = cur[i];
            let (mut best, mut best_margin) = (own, 0f32);
            for j in around(i, w, h).into_iter().flatten() {
                let l = cur[j];
                if l != own
                    && l != best
                    && let Some(m) = self.margin(i, own, l)
                    && m > best_margin
                {
                    (best, best_margin) = (l, m);
                }
            }
            if best != own {
                moves.push((i, best));
            }
        }
        moves
    }
}

/// Two mean colors closer than this (squared, weighted) count as the same: the border between
/// them does not snap.
const SAME_MEAN: f32 = 1e-8;

/// The three levels with the small labels replaced by `small`, the medium and big labels lifted
/// from them through the parents the input levels define, so the levels nest.
fn lift([big, mid, small]: [(Vec<u32>, usize); 3], snapped: Vec<u32>) -> [(Vec<u32>, usize); 3] {
    let mut to_mid = vec![NONE; small.1];
    let mut to_big = vec![NONE; small.1];
    for ((&s, &m), &b) in small.0.iter().zip(&mid.0).zip(&big.0) {
        to_mid[s as usize] = m;
        to_big[s as usize] = b;
    }
    let new_mid = snapped.iter().map(|&s| to_mid[s as usize]).collect();
    let new_big = snapped.iter().map(|&s| to_big[s as usize]).collect();
    [(new_big, big.1), (new_mid, mid.1), (snapped, small.1)]
}

/// Rounds the boundaries: a mode filter of radius `r` on the big labels, then on the medium labels
/// and then on the small ones, each limited to the children of the shape the level above chose at
/// that pixel, so the three levels still nest. A big border is voted on by the big shapes, so the
/// small shapes along it do not split the vote. Where `flat` marks the picture as flat the radius
/// is `WIDE` times `r`: a border there follows faint wobbles of the gradient, and the wider vote
/// irons them out, while a thin shape with real edges keeps its size. Each level is relabeled in
/// order of first pixel, so the label ids stay dense.
fn smooth_levels(
    [big, mid, small]: [(Vec<u32>, usize); 3],
    w: usize,
    h: usize,
    r: usize,
    flat: &[bool],
) -> [(Vec<u32>, usize); 3] {
    // the shape of the coarser level that holds each shape of the finer one
    let parents = |fine: &(Vec<u32>, usize), coarse: &[u32]| -> Vec<u32> {
        let mut up = vec![NONE; fine.1];
        for (&f, &c) in fine.0.iter().zip(coarse) {
            up[f as usize] = c;
        }
        up
    };
    let wide = Some((WIDE * r, flat));
    let round_big = mode_filter(&big.0, w, h, r, wide, big.1, None);
    let to_big = parents(&mid, &big.0);
    let round_mid = mode_filter(&mid.0, w, h, r, wide, mid.1, Some((&to_big, &round_big)));
    let to_mid = parents(&small, &mid.0);
    let round_small = mode_filter(
        &small.0,
        w,
        h,
        r,
        wide,
        small.1,
        Some((&to_mid, &round_mid)),
    );
    [round_big, round_mid, round_small].map(|labels| relabel(&labels))
}

/// The radius in px of the mode filter for the `smooth` knob (1 to 3) on a picture of this long
/// side: `px` per step at 1024 px (`SMOOTH_PX` in most views), scaled with the long side, at least `smooth`. The
/// superpixel seeds are about 17 px apart at 1024 px, so one step is wide enough to round a border
/// that follows them.
fn smooth_radius(smooth: usize, px: f32, long: usize) -> usize {
    let scaled = (smooth as f32 * px * long as f32 / 1024.0).round() as usize;
    scaled.max(smooth)
}

/// Mode filter radius per smooth step, in px at a long side of 1024.
const SMOOTH_PX: f32 = 12.0;

/// How many times `r` the mode filter radius is where the picture is flat.
const WIDE: usize = 2;

/// Mean squared weighted gradient of `lab` (forward differences along x and y) over the square of
/// radius `r` around a pixel below this marks the picture as flat there. A flat gradient of 0.1 L
/// over 300 px gives about 2e-7, a real edge in the window 1e-4 and more.
const FLAT_GRAD: f32 = 4e-6;

/// Where the picture is flat: the mean squared weighted gradient of `lab` over the square of
/// radius `r` around the pixel is below `FLAT_GRAD`.
fn flat_map(lab: &[Ok3], w: usize, h: usize, r: usize, weights: [f32; 3]) -> Vec<bool> {
    let dist = |a: Ok3, b: Ok3| -> f32 {
        (0..3)
            .map(|k| weights[k] * (a[k] - b[k]) * (a[k] - b[k]))
            .sum()
    };
    let grad: Vec<f32> = (0..w * h)
        .map(|i| {
            let (x, y) = (i % w, i / w);
            let dx = if x + 1 < w {
                dist(lab[i], lab[i + 1])
            } else {
                0.0
            };
            let dy = if y + 1 < h {
                dist(lab[i], lab[i + w])
            } else {
                0.0
            };
            dx + dy
        })
        .collect();
    box_mean(&grad, w, h, r)
        .into_iter()
        .map(|g| g < FLAT_GRAD)
        .collect()
}

/// Labels renumbered 0.. in order of first pixel, and how many there are.
fn relabel(labels: &[u32]) -> (Vec<u32>, usize) {
    let top = labels.iter().copied().max().map_or(0, |m| m as usize + 1);
    let mut map = vec![NONE; top];
    let mut next = 0u32;
    let out = labels
        .iter()
        .map(|&l| {
            let m = &mut map[l as usize];
            if *m == NONE {
                *m = next;
                next += 1;
            }
            *m
        })
        .collect();
    (out, next as usize)
}

/// Mean color, mean Y, area and value of every label, from the original pixels.
fn shape_stats(labels: &[u32], count: usize, lab: &[Ok3], luma: &[f32]) -> Vec<Shape> {
    let mut sum = vec![[0f64; 4]; count];
    let mut area = vec![0u32; count];
    for (i, &l) in labels.iter().enumerate() {
        let s = &mut sum[l as usize];
        for c in 0..3 {
            s[c] += f64::from(lab[i][c]);
        }
        s[3] += f64::from(luma[i]);
        area[l as usize] += 1;
    }
    sum.iter()
        .zip(&area)
        .map(|(s, &a)| {
            let n = f64::from(a.max(1));
            let color = [(s[0] / n) as f32, (s[1] / n) as f32, (s[2] / n) as f32];
            let value = (l_star((s[3] / n) as f32) / 10.0).round().clamp(0.0, 10.0) as u8;
            Shape {
                area: a,
                color,
                rgb: oklab::to_srgb(color),
                value,
                parent: None,
            }
        })
        .collect()
}

/// The first pixel (in row order) of every label.
fn first_pixels(labels: &[u32], count: usize) -> Vec<u32> {
    let mut first = vec![NONE; count];
    for (i, &l) in labels.iter().enumerate() {
        if first[l as usize] == NONE {
            first[l as usize] = i as u32;
        }
    }
    first
}

// ---------------------------------------------------------------------------------------------
// Rolling guidance filter with a guided filter as the joint filter.
// ---------------------------------------------------------------------------------------------

/// How much a and b count in the color guide, so their small range weighs like L.
const COLOR_GAIN: f32 = 3.0;

/// Rolling guidance filter (Zhang et al. 2014). The first pass has a flat guide, so it is a box
/// blur that removes small structure. Each later pass filters the original with the last result
/// as the guide, which brings the big edges back.
fn rolling_guidance(lab: &[Ok3], w: usize, h: usize, r: usize, opts: &ShapesOpts) -> Vec<Ok3> {
    let planes: [Vec<f32>; 3] = std::array::from_fn(|c| lab.iter().map(|p| p[c]).collect());
    let mut cur: [Vec<f32>; 3] = std::array::from_fn(|c| box_mean(&planes[c], w, h, r));
    let eps = opts.rgf_sigma * opts.rgf_sigma;
    let g = opts.guide.clamp(0.0, 1.0);
    for _ in 1..opts.rgf_iters {
        // L is always guided by L. Each of a and b is guided by a blend of L and itself.
        let lstats = GuideStats::new(&cur[0], w, h, r);
        let next: [Vec<f32>; 3] = std::array::from_fn(|c| {
            if c == 0 || g == 0.0 {
                guided_with(&lstats, &cur[0], &planes[c], eps)
            } else {
                let guide: Vec<f32> = cur[0]
                    .iter()
                    .zip(&cur[c])
                    .map(|(&l, &v)| (1.0 - g) * l + g * COLOR_GAIN * v)
                    .collect();
                guided(&guide, &planes[c], w, h, r, eps)
            }
        });
        cur = next;
    }
    (0..w * h)
        .map(|i| [cur[0][i], cur[1][i], cur[2][i]])
        .collect()
}

// ---------------------------------------------------------------------------------------------
// SNIC superpixels (Achanta and Susstrunk, CVPR 2017).
// ---------------------------------------------------------------------------------------------

/// The distance in px between two seeds of a grid of about `seeds` on `w` by `h` pixels.
fn seed_step(w: usize, h: usize, seeds: usize) -> f32 {
    ((w * h) as f32 / seeds.max(1) as f32).sqrt().max(1.0)
}

/// Superpixel labels (0..count) of every pixel and the count.
/// SNIC superpixels.
fn snic(lab: &[Ok3], w: usize, h: usize, seeds: usize, compact: f32) -> (Vec<u32>, usize) {
    let step = seed_step(w, h, seeds);
    let nx = ((w as f32 / step).round() as usize).clamp(1, w);
    let ny = ((h as f32 / step).round() as usize).clamp(1, h);
    let n = nx * ny;
    let inv_m2 = 1.0 / (compact * compact);
    let inv_s2 = 1.0 / (step * step);
    let mut labels = vec![NONE; w * h];
    let mut sum = vec![[0f64; 5]; n];
    let mut cnt = vec![0u32; n];
    // (distance bits, pixel index, label): the smallest distance first, ties by pixel index
    let mut heap: BinaryHeap<Reverse<(u32, u32, u32)>> = BinaryHeap::new();
    for gy in 0..ny {
        for gx in 0..nx {
            let x = (2 * gx + 1) * w / (2 * nx);
            let y = (2 * gy + 1) * h / (2 * ny);
            let k = gy * nx + gx;
            heap.push(Reverse((0, (y * w + x) as u32, k as u32)));
        }
    }
    while let Some(Reverse((_, i, k))) = heap.pop() {
        let i = i as usize;
        if labels[i] != NONE {
            continue;
        }
        let k = k as usize;
        labels[i] = k as u32;
        let (x, y) = (i % w, i / w);
        let c = lab[i];
        let s = &mut sum[k];
        s[0] += f64::from(c[0]);
        s[1] += f64::from(c[1]);
        s[2] += f64::from(c[2]);
        s[3] += x as f64;
        s[4] += y as f64;
        cnt[k] += 1;
        let inv = 1.0 / f64::from(cnt[k]);
        let m = [
            (s[0] * inv) as f32,
            (s[1] * inv) as f32,
            (s[2] * inv) as f32,
            (s[3] * inv) as f32,
            (s[4] * inv) as f32,
        ];
        let around = [
            (x > 0).then(|| i - 1),
            (x + 1 < w).then(|| i + 1),
            (y > 0).then(|| i - w),
            (y + 1 < h).then(|| i + w),
        ];
        for j in around.into_iter().flatten() {
            if labels[j] != NONE {
                continue;
            }
            let p = lab[j];
            let (dl, da, db) = (p[0] - m[0], p[1] - m[1], p[2] - m[2]);
            let (dx, dy) = ((j % w) as f32 - m[3], (j / w) as f32 - m[4]);
            let d = (dl * dl + da * da + db * db) * inv_m2 + (dx * dx + dy * dy) * inv_s2;
            heap.push(Reverse((d.to_bits(), j as u32, k as u32)));
        }
    }
    (labels, n)
}

// ---------------------------------------------------------------------------------------------
// Region adjacency graph and the greedy merge tree.
// ---------------------------------------------------------------------------------------------

/// The shared boundary of two regions: its length and the summed color step across it.
#[derive(Clone, Copy)]
struct Edge {
    len: u32,
    grad: f64,
}

/// A region: a superpixel or the merge of two regions.
struct Node {
    area: u32,
    sum: [f64; 3],
    adj: BTreeMap<u32, Edge>,
    alive: bool,
}

/// The graph, the heap of candidate merges and the tree (`parent`). The leaves are the
/// superpixels; a merge makes a new node at the end of `nodes`.
struct Rag<'a> {
    nodes: Vec<Node>,
    parent: Vec<u32>,
    /// Candidate merges, cheapest first: the cost bits and the two ids.
    heap: BinaryHeap<Reverse<(u32, u32, u32)>>,
    alive: usize,
    /// The total cost of every merge `run_until` made, in order.
    costs: Vec<f32>,
    opts: &'a ShapesOpts,
}

impl<'a> Rag<'a> {
    fn new(lab: &[Ok3], sp: &[u32], n: usize, w: usize, opts: &'a ShapesOpts) -> Self {
        let mut nodes: Vec<Node> = (0..n)
            .map(|_| Node {
                area: 0,
                sum: [0.0; 3],
                adj: BTreeMap::new(),
                alive: true,
            })
            .collect();
        for (p, &l) in lab.iter().zip(sp) {
            let node = &mut nodes[l as usize];
            node.area += 1;
            for (s, &v) in node.sum.iter_mut().zip(p) {
                *s += f64::from(v);
            }
        }
        let wt = opts.weights;
        let link = |nodes: &mut Vec<Node>, i: usize, j: usize| {
            let (a, b) = (sp[i], sp[j]);
            if a == b {
                return;
            }
            let (dl, da, db) = (
                lab[i][0] - lab[j][0],
                lab[i][1] - lab[j][1],
                lab[i][2] - lab[j][2],
            );
            let step = f64::from((wt[0] * dl * dl + wt[1] * da * da + wt[2] * db * db).sqrt());
            for (x, y) in [(a, b), (b, a)] {
                let e = nodes[x as usize]
                    .adj
                    .entry(y)
                    .or_insert(Edge { len: 0, grad: 0.0 });
                e.len += 1;
                e.grad += step;
            }
        };
        let h = lab.len() / w;
        for y in 0..h {
            for x in 0..w {
                let i = y * w + x;
                if x + 1 < w {
                    link(&mut nodes, i, i + 1);
                }
                if y + 1 < h {
                    link(&mut nodes, i, i + w);
                }
            }
        }
        let mut rag = Self {
            parent: vec![NONE; n],
            nodes,
            heap: BinaryHeap::new(),
            alive: n,
            costs: Vec::new(),
            opts,
        };
        for a in 0..n {
            let list: Vec<(u32, Edge)> = rag.nodes[a].adj.iter().map(|(&x, &e)| (x, e)).collect();
            for (x, e) in list {
                if (x as usize) > a {
                    rag.push_pair(a, x as usize, &e);
                }
            }
        }
        rag
    }

    /// (total cost, Ward plus edge cost) of merging `a` and `b` that share the edge `e`.
    fn pair(&self, a: usize, b: usize, e: &Edge) -> (f32, f32) {
        let (na, nb) = (&self.nodes[a], &self.nodes[b]);
        let (fa, fb) = (f64::from(na.area), f64::from(nb.area));
        let mut d2 = 0f64;
        for c in 0..3 {
            let d = na.sum[c] / fa - nb.sum[c] / fb;
            d2 += f64::from(self.opts.weights[c]) * d * d;
        }
        let ward = fa * fb / (fa + fb) * d2;
        let base = (ward + f64::from(self.opts.edge_weight) * e.grad) as f32;
        let size = self.opts.size_weight * (fa.min(fb) as f32).sqrt();
        (base + size, base)
    }

    fn push_pair(&mut self, a: usize, b: usize, e: &Edge) {
        let (total, _) = self.pair(a, b, e);
        self.heap
            .push(Reverse((total.to_bits(), a.min(b) as u32, a.max(b) as u32)));
    }

    /// Merges two alive neighbors into a new node and returns its id.
    fn merge(&mut self, a: usize, b: usize) -> usize {
        let c = self.nodes.len();
        let adj_a = std::mem::take(&mut self.nodes[a].adj);
        let adj_b = std::mem::take(&mut self.nodes[b].adj);
        let mut adj: BTreeMap<u32, Edge> = BTreeMap::new();
        for (x, e) in adj_a.into_iter().chain(adj_b) {
            if x as usize == a || x as usize == b {
                continue;
            }
            adj.entry(x)
                .and_modify(|t| {
                    t.len += e.len;
                    t.grad += e.grad;
                })
                .or_insert(e);
        }
        let (area, sum) = {
            let (na, nb) = (&self.nodes[a], &self.nodes[b]);
            (na.area + nb.area, [0, 1, 2].map(|k| na.sum[k] + nb.sum[k]))
        };
        self.nodes[a].alive = false;
        self.nodes[b].alive = false;
        self.parent[a] = c as u32;
        self.parent[b] = c as u32;
        self.parent.push(NONE);
        let list: Vec<(u32, Edge)> = adj.iter().map(|(&x, &e)| (x, e)).collect();
        for &(x, e) in &list {
            let other = &mut self.nodes[x as usize].adj;
            other.remove(&(a as u32));
            other.remove(&(b as u32));
            other.insert(c as u32, e);
        }
        self.nodes.push(Node {
            area,
            sum,
            adj,
            alive: true,
        });
        self.alive -= 1;
        for (x, e) in list {
            self.push_pair(c, x as usize, &e);
        }
        c
    }

    /// The cheapest candidate whose two regions are both alive.
    fn top_valid(&mut self) -> Option<(usize, usize)> {
        while let Some(&Reverse((_, a, b))) = self.heap.peek() {
            if self.nodes[a as usize].alive && self.nodes[b as usize].alive {
                return Some((a as usize, b as usize));
            }
            self.heap.pop();
        }
        None
    }

    /// Merges the cheapest pair while more than `target` regions are left, and also while the
    /// cheapest pair is free (`free_cost`).
    fn run_until(&mut self, target: usize) {
        while self.alive > 1 {
            let Some((a, b)) = self.top_valid() else {
                break;
            };
            let e = self.nodes[a].adj[&(b as u32)];
            let (total, base) = self.pair(a, b, &e);
            if self.alive > target || base <= self.opts.free_cost {
                self.heap.pop();
                self.merge(a, b);
                self.costs.push(total);
            } else {
                break;
            }
        }
    }

    /// The cost of the next merge over the median cost of the last ten merges. 0 when there is
    /// no next merge or no merge yet.
    fn next_merge_ratio(&mut self) -> f32 {
        let Some((a, b)) = self.top_valid() else {
            return 0.0;
        };
        let e = self.nodes[a].adj[&(b as u32)];
        let next = self.pair(a, b, &e).0;
        let from = self.costs.len().saturating_sub(10);
        let mut last: Vec<f32> = self.costs[from..].to_vec();
        if last.is_empty() {
            return 0.0;
        }
        last.sort_by(f32::total_cmp);
        let median = last[last.len() / 2];
        next / median.max(1e-6)
    }

    /// Merges every region below `floor` pixels into its cheapest neighbor, the smallest first.
    fn absorb(&mut self, floor: u32) {
        while self.alive > 1 {
            let mut pick: Option<(usize, usize)> = None;
            for (i, n) in self.nodes.iter().enumerate() {
                if !n.alive || pick.is_some_and(|(j, _)| n.area >= self.nodes[j].area) {
                    continue;
                }
                if n.area >= floor {
                    continue;
                }
                if let Some(x) = self.absorb_target(i) {
                    pick = Some((i, x));
                }
            }
            let Some((a, x)) = pick else {
                break;
            };
            self.merge(a, x);
        }
    }

    /// The neighbor of `a` that `absorb` merges it into: the cheapest.
    fn absorb_target(&self, a: usize) -> Option<usize> {
        let mut best: Option<(f32, usize)> = None;
        for (&x, e) in &self.nodes[a].adj {
            let key = self.pair(a, x as usize, e).0;
            if best.is_none_or(|(k, _)| key < k) {
                best = Some((key, x as usize));
            }
        }
        best.map(|(_, x)| x)
    }

    /// Region label of every pixel for the regions alive now, and their count.
    fn snapshot(&self, sp: &[u32], n_sp: usize) -> (Vec<u32>, usize) {
        let mut index = vec![NONE; self.nodes.len()];
        let mut count = 0usize;
        for (i, n) in self.nodes.iter().enumerate() {
            if n.alive {
                index[i] = count as u32;
                count += 1;
            }
        }
        let root: Vec<u32> = (0..n_sp)
            .map(|s| {
                let mut r = s;
                while !self.nodes[r].alive {
                    r = self.parent[r] as usize;
                }
                index[r]
            })
            .collect();
        (sp.iter().map(|&s| root[s as usize]).collect(), count)
    }
}

#[cfg(test)]
mod tests;
