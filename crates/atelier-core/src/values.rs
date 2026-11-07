//! The Values layer: a photo becomes a few flat tones made of whole shapes.
//!
//! A plain posterize cuts a noisy gradient into islands. This pipeline smooths first (shadow
//! lift, median, guided filter), cuts at the fixed teacher steps of a preset, then cleans the
//! label map (mode filter, small regions merged into the neighbor with the closest value, tiny
//! bright or dark accents kept).
//!
//! The steps, with the numbers in [`ValuesOpts`]:
//!
//! 1. Resize to `px` on the long side. sRGB to linear Y (Rec 709), then CIE L*.
//! 2. Shadow lift `L' = 100 (L/100)^g`. `g` depends on the 5th percentile of L*.
//! 3. Median 5x5, then a guided filter on L* (two passes).
//! 4. Quantize. The notan cuts at the light/shadow break. The three preset cuts there first and
//!    then once inside one family, so no step crosses the break. The five preset cuts at Munsell
//!    V2, 4, 6 and 8.
//! 5. Mode filter 5x5. Merge regions under a share of the area. Keep a small region that is two
//!    or more steps away from every neighbor.
//! 6. Paint each step at the tone of the preset (the three preset: the Munsell value of the
//!    step's mean). Every tone is gray, or umber with the tint.
//!
//! The same input gives the same bytes. There is no randomness, no clock and no hash map order
//! (the region merge uses ordered maps). The cube roots and powers go through `libm`.

// Image kernels index several buffers with one counter; iterators would not read better here.
#![allow(clippy::needless_range_loop)]

use std::collections::BTreeMap;

use crate::error::{Error, Result, unit};
use crate::filters::{self, percentile};
use crate::img::{Rgb, neighbors4, size_factor};
use crate::oklab;
use crate::srgb::{l_star, linear_luma_of};

/// The L* tone of each step of the notan preset (two values), darkest first.
const NOTAN_TONES: [f32; 2] = [18.0, 92.0];
/// The tones of a three step re-key of the five preset (a blown out or very dark photo).
const THREE_TONES: [f32; 3] = [20.0, 52.0, 85.0];
const THREE_CUTS: [f32; 2] = [35.0, 68.0];
/// Munsell value V1 to V9 as L* (Newhall 1943, Y relative to magnesium oxide). Value is about
/// L* / 10, and even steps of it look even.
const MUNSELL_L: [f32; 9] = [10.6, 20.5, 30.8, 41.2, 51.6, 61.7, 71.6, 81.3, 91.1];
/// The tones of the five value preset (Munsell V1, 3, 5, 7, 9), and its cuts (V2, 4, 6, 8).
const FIVE_TONES: [f32; 5] = [
    MUNSELL_L[0],
    MUNSELL_L[2],
    MUNSELL_L[4],
    MUNSELL_L[6],
    MUNSELL_L[8],
];
const FIVE_CUTS: [f32; 4] = [MUNSELL_L[1], MUNSELL_L[3], MUNSELL_L[5], MUNSELL_L[7]];
/// A cut over every L*: the step above it stays empty.
const ABOVE_ALL: f32 = 101.0;
/// A step of the three preset holds at least this share of the pixels of the picture, so the
/// split inside a family does not cut off a thin tail.
const THREE_MIN_SHARE: f64 = 0.04;

/// All the knobs of the pipeline. The defaults are the numbers of the research note.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ValuesOpts {
    /// Shadow lift exponent in the normal case.
    pub lift_gamma: f32,
    /// Lift exponent when the 5th percentile of L* is under `dark_p5`.
    pub lift_gamma_dark: f32,
    /// Lift exponent when the 5th percentile of L* is over `light_p5`.
    pub lift_gamma_light: f32,
    /// Below this 5th percentile of L* the photo counts as dark.
    pub dark_p5: f32,
    /// Above this 5th percentile of L* the photo needs no lift.
    pub light_p5: f32,
    /// Radius of the median filter (2 is 5x5).
    pub median_radius: usize,
    /// Radius of the guided filter box.
    pub guide_radius: usize,
    /// Epsilon of the guided filter, with L* scaled to 0..1.
    pub guide_eps: f32,
    /// How many guided filter passes.
    pub guide_passes: usize,
    /// Radius of the mode filter (2 is 5x5).
    pub mode_radius: usize,
    /// A small region this many steps from every neighbor is kept.
    pub protect_steps: u8,
    /// Clamp of the Otsu cut for the notan preset, in L*.
    pub notan_clamp: (f32, f32),
    /// Clamp of the Otsu cut for the family preset, in L*.
    pub family_clamp: (f32, f32),
}

impl Default for ValuesOpts {
    fn default() -> Self {
        Self {
            lift_gamma: 0.85,
            lift_gamma_dark: 0.80,
            lift_gamma_light: 1.0,
            dark_p5: 6.0,
            light_p5: 15.0,
            median_radius: 2,
            guide_radius: 8,
            guide_eps: 0.01,
            guide_passes: 2,
            mode_radius: 2,
            protect_steps: 2,
            notan_clamp: (35.0, 60.0),
            family_clamp: (45.0, 65.0),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// L*

/// Linear luminance of a CIE L*.
fn y_from_l(l: f32) -> f32 {
    if l > 8.0 {
        let f = (l + 16.0) / 116.0;
        f * f * f
    } else {
        l * 27.0 / 24389.0
    }
}

/// L* of every pixel.
fn lightness(img: &Rgb) -> Vec<f32> {
    linear_luma_of(img).into_iter().map(l_star).collect()
}

/// The shadow lift of every value. `g == 1` is the identity.
fn lift(l: &[f32], g: f32) -> Vec<f32> {
    if (g - 1.0).abs() < 1e-6 {
        return l.to_vec();
    }
    let lut: Vec<f32> = (0..=4096)
        .map(|i| (100.0 * libm::pow(f64::from(i) / 4096.0, f64::from(g))) as f32)
        .collect();
    l.iter()
        .map(|&v| lut[((v * 40.96).round() as usize).min(4096)])
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Smoothing

/// Median of a square window, edge windows are cut short. Values go through 256 levels
/// (0.39 L* each), counted in a sliding histogram with a coarse level on top.
fn median(l: &[f32], w: usize, h: usize, r: usize) -> Vec<f32> {
    if r == 0 {
        return l.to_vec();
    }
    let q: Vec<u8> = l
        .iter()
        .map(|&v| (v * 2.55).round().clamp(0.0, 255.0) as u8)
        .collect();
    let mut out = vec![0f32; w * h];
    let mut fine = [0u16; 256];
    let mut coarse = [0u16; 16];
    for y in 0..h {
        let (y0, y1) = (y.saturating_sub(r), (y + r).min(h - 1));
        fine.fill(0);
        coarse.fill(0);
        let mut n = 0usize;
        let add = |x: usize, fine: &mut [u16; 256], coarse: &mut [u16; 16], n: &mut usize| {
            for yy in y0..=y1 {
                let v = q[yy * w + x] as usize;
                fine[v] += 1;
                coarse[v >> 4] += 1;
                *n += 1;
            }
        };
        let sub = |x: usize, fine: &mut [u16; 256], coarse: &mut [u16; 16], n: &mut usize| {
            for yy in y0..=y1 {
                let v = q[yy * w + x] as usize;
                fine[v] -= 1;
                coarse[v >> 4] -= 1;
                *n -= 1;
            }
        };
        for x in 0..=r.min(w - 1) {
            add(x, &mut fine, &mut coarse, &mut n);
        }
        for x in 0..w {
            let rank = n / 2;
            let mut acc = 0usize;
            let mut c = 0usize;
            while c < 15 && acc + coarse[c] as usize <= rank {
                acc += coarse[c] as usize;
                c += 1;
            }
            let mut v = c * 16;
            while acc + fine[v] as usize <= rank {
                acc += fine[v] as usize;
                v += 1;
            }
            out[y * w + x] = v as f32 / 2.55;
            if x + r + 1 < w {
                add(x + r + 1, &mut fine, &mut coarse, &mut n);
            }
            if x >= r {
                sub(x - r, &mut fine, &mut coarse, &mut n);
            }
        }
    }
    out
}

/// Guided filter (He et al.) with the image as its own guide. L* goes in as 0..100.
fn guided(l: &[f32], w: usize, h: usize, r: usize, eps: f32, passes: usize) -> Vec<f32> {
    let mut cur: Vec<f32> = l.iter().map(|&v| v * 0.01).collect();
    for _ in 0..passes {
        cur = filters::guided(&cur, &cur, w, h, r, eps);
    }
    cur.iter().map(|&v| (v * 100.0).clamp(0.0, 100.0)).collect()
}

/// The 256 bin histogram of L* values (0 to 100): a bin is 100 / 256 L* wide, and 100 goes in the
/// last bin.
fn l_hist(values: impl Iterator<Item = f32>) -> [u64; 256] {
    let mut hist = [0u64; 256];
    for v in values {
        hist[((v * 2.56) as usize).min(255)] += 1;
    }
    hist
}

/// The Otsu cut of L* over 256 bins, as an L* value (the upper edge of the last dark bin).
fn otsu(l: &[f32]) -> f32 {
    let hist = l_hist(l.iter().copied());
    let best_t = crate::filters::otsu_bin(&hist).unwrap_or(127);
    (best_t + 1) as f32 * 100.0 / 256.0
}

// ---------------------------------------------------------------------------------------------
// Label map

/// Majority filter of the steps (see [`filters::mode_filter`]).
fn mode_filter(labels: &[u8], w: usize, h: usize, r: usize, steps: usize) -> Vec<u8> {
    if r == 0 {
        return labels.to_vec();
    }
    let wide: Vec<u32> = labels.iter().map(|&l| u32::from(l)).collect();
    filters::mode_filter(&wide, w, h, r, None, steps, None)
        .into_iter()
        .map(|l| l as u8)
        .collect()
}

/// The root of region `x` in the merge forest, with the path squeezed.
fn find(parent: &mut [u32], x: u32) -> u32 {
    let mut root = x;
    while parent[root as usize] != root {
        root = parent[root as usize];
    }
    let mut cur = x;
    while parent[cur as usize] != root {
        let next = parent[cur as usize];
        parent[cur as usize] = root;
        cur = next;
    }
    root
}

/// The neighbors of region `a` as current roots, with the border length of each.
fn neighbors(parent: &mut [u32], adj: &[BTreeMap<u32, u32>], a: u32) -> BTreeMap<u32, u32> {
    let mut agg = BTreeMap::new();
    for (&k, &c) in &adj[a as usize] {
        let r = find(parent, k);
        if r != a {
            *agg.entry(r).or_insert(0) += c;
        }
    }
    agg
}

/// What counts as a small region in [`merge_small`], and where it goes. A region under `min_px`
/// pixels goes to the neighbor with the closest step (then the longest border) and stays when it
/// is `protect` or more steps from every neighbor.
struct Merge {
    min_px: u32,
    protect: u8,
}

/// The 4-connected regions of one step in a label map, and what [`merge_small`] knows of each.
/// Ids are in scan order.
struct Regions {
    /// The region id of every pixel.
    comp: Vec<u32>,
    /// The step of each region.
    c_label: Vec<u8>,
    /// The pixels of each region (grows when a region absorbs another).
    size: Vec<u32>,
}

/// Fills the region of pixel `start` (given the id `id`) and gives its size.
fn flood_region(
    labels: &[u8],
    comp: &mut [u32],
    stack: &mut Vec<usize>,
    start: usize,
    id: u32,
    dims: (usize, usize),
) -> u32 {
    let (w, h) = dims;
    let lab = labels[start];
    comp[start] = id;
    stack.push(start);
    let mut count = 0;
    while let Some(p) = stack.pop() {
        count += 1;
        for q in neighbors4(p, w, h).into_iter().flatten() {
            if comp[q] == u32::MAX && labels[q] == lab {
                comp[q] = id;
                stack.push(q);
            }
        }
    }
    count
}

/// Finds the regions of a label map and the size of each.
fn scan_regions(labels: &[u8], w: usize, h: usize) -> Regions {
    let mut r = Regions {
        comp: vec![u32::MAX; w * h],
        c_label: Vec::new(),
        size: Vec::new(),
    };
    let mut stack: Vec<usize> = Vec::new();
    for s in 0..w * h {
        if r.comp[s] != u32::MAX {
            continue;
        }
        let id = r.c_label.len() as u32;
        let count = flood_region(labels, &mut r.comp, &mut stack, s, id, (w, h));
        r.c_label.push(labels[s]);
        r.size.push(count);
    }
    r
}

/// The ids of the regions to merge, smallest first, ties by id.
fn small_regions(r: &Regions, min_px: u32) -> Vec<u32> {
    let mut v: Vec<u32> = (0..r.c_label.len() as u32)
        .filter(|&i| r.size[i as usize] < min_px)
        .collect();
    v.sort_by_key(|&i| (r.size[i as usize], i));
    v
}

/// For each region, the border length it shares with each other region. Only the small regions
/// get a row.
fn border_graph(r: &Regions, w: usize, h: usize, min_px: u32) -> Vec<BTreeMap<u32, u32>> {
    // Borders that touch a small region, as sorted (owner, other) keys.
    let mut keys: Vec<u64> = Vec::new();
    for p in 0..w * h {
        let (x, y) = (p % w, p / w);
        for q in [(x + 1 < w).then(|| p + 1), (y + 1 < h).then(|| p + w)]
            .into_iter()
            .flatten()
        {
            let (a, b) = (r.comp[p], r.comp[q]);
            if a == b {
                continue;
            }
            if r.size[a as usize] < min_px {
                keys.push(u64::from(a) << 32 | u64::from(b));
            }
            if r.size[b as usize] < min_px {
                keys.push(u64::from(b) << 32 | u64::from(a));
            }
        }
    }
    keys.sort_unstable();
    let mut adj: Vec<BTreeMap<u32, u32>> = vec![BTreeMap::new(); r.c_label.len()];
    for k in keys {
        *adj[(k >> 32) as usize]
            .entry((k & 0xFFFF_FFFF) as u32)
            .or_insert(0) += 1;
    }
    adj
}

/// The region that small region `a` goes into, or `None` when it stays.
fn merge_target(
    r: &Regions,
    parent: &mut [u32],
    adj: &[BTreeMap<u32, u32>],
    a: u32,
    protect: u8,
) -> Option<u32> {
    let agg = neighbors(parent, adj, a);
    let la = i32::from(r.c_label[a as usize]);
    // closest step, then the longest border, then the lowest id
    let best = agg
        .iter()
        .map(|(&b, &len)| {
            let step = (i32::from(r.c_label[b as usize]) - la).abs();
            (step, -i64::from(len), b)
        })
        .min();
    let (diff, _, b) = best?;
    if diff >= i32::from(protect) {
        return None;
    }
    Some(b)
}

/// Puts region `a` into region `b`, then joins every neighbor of `b` that has the same step.
fn merge_into(r: &mut Regions, parent: &mut [u32], adj: &mut [BTreeMap<u32, u32>], a: u32, b: u32) {
    absorb(parent, &mut r.size, adj, a, b);
    // The new neighbors of `b` may share its step: they are one region now.
    loop {
        let agg = neighbors(parent, adj, b);
        let same: Vec<u32> = agg
            .keys()
            .copied()
            .filter(|&m| r.c_label[m as usize] == r.c_label[b as usize])
            .collect();
        if same.is_empty() {
            break;
        }
        for m in same {
            absorb(parent, &mut r.size, adj, m, b);
        }
    }
}

/// Merges the small regions of a label map (see [`Merge`]). Regions are taken smallest first,
/// ties by scan order, so the result does not depend on anything but the input.
fn merge_small(labels: &mut [u8], w: usize, h: usize, rule: &Merge) {
    let mut r = scan_regions(labels, w, h);
    let small = small_regions(&r, rule.min_px);
    if small.is_empty() {
        return;
    }
    let mut adj = border_graph(&r, w, h, rule.min_px);
    let mut parent: Vec<u32> = (0..r.c_label.len() as u32).collect();
    for &a in &small {
        if parent[a as usize] != a || r.size[a as usize] >= rule.min_px {
            continue;
        }
        if let Some(b) = merge_target(&r, &mut parent, &adj, a, rule.protect) {
            merge_into(&mut r, &mut parent, &mut adj, a, b);
        }
    }
    for p in 0..w * h {
        labels[p] = r.c_label[find(&mut parent, r.comp[p]) as usize];
    }
}

/// Puts region `a` under root `b`: its size and its border counts move to `b`.
fn absorb(parent: &mut [u32], size: &mut [u32], adj: &mut [BTreeMap<u32, u32>], a: u32, b: u32) {
    parent[a as usize] = b;
    size[b as usize] += size[a as usize];
    let moved = std::mem::take(&mut adj[a as usize]);
    for (k, c) in moved {
        *adj[b as usize].entry(k).or_insert(0) += c;
    }
}

// ---------------------------------------------------------------------------------------------
// Paint

/// `OKLab` lightness of a neutral with CIE lightness `l`.
fn ok_l(l: f32) -> f32 {
    libm::cbrtf(y_from_l(l))
}

/// A gray of CIE lightness `l`.
fn neutral(l: f32) -> [u8; 3] {
    oklab::to_srgb([ok_l(l), 0.0, 0.0])
}

/// Hue of the umber tint, in degrees.
const UMBER_HUE: f32 = 55.0;
/// Chroma of the umber tint at its strongest (mid lightness).
const UMBER_CHROMA: f32 = 0.04;

/// The byte color of a tone of CIE lightness `l`. Tint 0 is gray. Tint 1 is umber: the `OKLab` L
/// of the gray tone, the hue 55 degrees and the chroma `0.04 * sqrt(sin(pi * L))`.
fn tone_color(l: f32, tint: u8) -> [u8; 3] {
    let gray = neutral(l);
    if tint == 0 {
        return gray;
    }
    let lightness = oklab::from_srgb(gray)[0];
    let chroma = UMBER_CHROMA * (std::f32::consts::PI * lightness).sin().max(0.0).sqrt();
    let hue = UMBER_HUE.to_radians();
    oklab::to_srgb([lightness, chroma * hue.cos(), chroma * hue.sin()])
}

/// The L* of a photo before and after the smoothing, and the numbers read from it.
struct Analysis {
    /// L* of every pixel, as it is in the photo.
    raw: Vec<f32>,
    /// `raw` after the shadow lift only.
    lifted: Vec<f32>,
    /// L* after the shadow lift, the median and the guided filter.
    smooth: Vec<f32>,
    /// The raw Otsu cut of `smooth`.
    otsu: f32,
}

/// A size in px (at least 1) of `v` at the factor `k`.
fn px(v: usize, k: f32) -> usize {
    ((v as f32 * k).round() as usize).max(1)
}

/// Steps 1 to 3 of the pipeline: L*, the shadow lift, the median and the guided filter.
fn analyze(img: &Rgb, o: &ValuesOpts) -> Analysis {
    let (w, h) = (img.width, img.height);
    let raw = lightness(img);
    let p5 = percentile(&raw, 0.05);
    let g = if p5 < o.dark_p5 {
        o.lift_gamma_dark
    } else if p5 > o.light_p5 {
        o.lift_gamma_light
    } else {
        o.lift_gamma
    };
    let lifted = lift(&raw, g);
    let med = median(&lifted, w, h, o.median_radius);
    let radius = px(o.guide_radius, size_factor(w, h));
    let smooth = guided(&med, w, h, radius, o.guide_eps, o.guide_passes);
    let otsu = otsu(&smooth);
    Analysis {
        raw,
        lifted,
        smooth,
        otsu,
    }
}

// ---------------------------------------------------------------------------------------------
// The view of the Values tool

/// The Otsu cut under which a photo counts as very dark, in L*.
const KEY_DARK: f32 = 25.0;
/// The Otsu cut over which a photo counts as blown out, in L*.
const KEY_LIGHT: f32 = 75.0;
/// The mode filter radius of the boundary smoothing that runs after the small region merge.
const SMOOTH_RADIUS: usize = 2;

/// The smallest region that survives, as a share of the area. `detail` is 0 to 1: 0 gives 0.05
/// percent (keeps the most), 0.5 gives 0.25 percent, 1 gives 1 percent. Log scale in two halves.
fn view_min_area(detail: f32) -> f32 {
    let d = f64::from(detail);
    let share = if d <= 0.5 {
        0.0005 * libm::pow(5.0, 2.0 * d)
    } else {
        0.0025 * libm::pow(4.0, 2.0 * (d - 0.5))
    };
    share as f32
}

/// The light/shadow break of a photo: its Otsu cut in `clamp`, or the median of L* on a blown
/// out or very dark photo, so both families exist. The notan cuts here, and the three preset
/// cuts here first.
fn family_break(a: &Analysis, clamp: (f32, f32)) -> f32 {
    if a.otsu < KEY_DARK || a.otsu > KEY_LIGHT {
        percentile(&a.smooth, 0.5)
    } else {
        a.otsu.clamp(clamp.0, clamp.1)
    }
}

/// The best Otsu cut of the values in `lo..hi` and the spread it takes out of the picture (the
/// between-class sum of squares, in pixels times L* squared). Each side keeps at least
/// `THREE_MIN_SHARE` of the `total` pixels. `None` when no cut does.
fn split_in(l: &[f32], lo: f32, hi: f32, total: usize) -> Option<(f32, f64)> {
    let hist = l_hist(l.iter().copied().filter(|&v| v >= lo && v < hi));
    let floor = (total as f64 * THREE_MIN_SHARE).max(1.0);
    // a bin is 100 / 256 L* wide: the cut and the spread go back to L*
    let bin = 100.0 / 256.0;
    crate::filters::otsu_split(&hist, floor)
        .map(|(b, g)| ((b + 1) as f32 * bin as f32, g * bin * bin))
}

/// The light and shadow families of a picture, for the paint order of the Shapes view.
pub(crate) struct Families {
    /// The L* of every pixel after the shadow lift: closer to what the eye sees than what the
    /// camera kept.
    pub(crate) lifted: Vec<f32>,
    /// The light/shadow break, the cut of the notan.
    pub(crate) brk: f32,
    /// The cut between the halftones and the lights, inside the light family.
    pub(crate) half: f32,
}

/// The [`Families`] of `work`, cut the way the Values view cuts it. The halftone cut is the Otsu
/// cut of the light family, or halfway from the break to its 98th percentile when that family
/// is too small to split.
pub(crate) fn families(work: &Rgb) -> Families {
    let o = ValuesOpts::default();
    let a = analyze(work, &o);
    let brk = family_break(&a, o.notan_clamp);
    let half = split_in(&a.smooth, brk, f32::MAX, a.smooth.len()).map_or_else(
        || f32::midpoint(brk, percentile(&a.smooth, 0.98)),
        |(c, _)| c,
    );
    Families {
        lifted: a.lifted,
        brk,
        half,
    }
}

/// The cuts of the three value preset. The first is the light/shadow break. The second is the
/// Otsu cut inside the bigger family, so the main mass gets the second step. So no step crosses
/// the break: a lit plane is never grouped with a shadow, the rule of the light and shadow
/// families that painters keep.
fn three_cuts(smooth: &[f32], brk: f32) -> [f32; 2] {
    let total = smooth.len();
    let shadow = split_in(smooth, f32::MIN, brk, total);
    let light = split_in(smooth, brk, f32::MAX, total);
    let prefer_shadow = smooth.iter().filter(|&&v| v < brk).count() * 2 >= total;
    match (shadow, light) {
        (Some((c, _)), Some(_)) if prefer_shadow => [c, brk],
        (_, Some((c, _))) => [brk, c],
        (Some((c, _)), None) => [c, brk],
        // neither family has a second step (two flat tones): the break alone, as two neighbor
        // steps, so a small speck still merges into the mass around it
        (None, None) => [brk, ABOVE_ALL],
    }
}

/// The tone of each of `steps` steps: the whole Munsell value nearest the mean of the step's
/// pixels in `l`, each step at least `gap` values over the one under it, so the masses stay apart.
/// A painter mixes the tone from a value scale. A step with no pixel sits `gap` values over the one
/// under it. `gap` times `steps - 1` must be at most 8. `reach` is the photo's own darkest and
/// lightest L* (see [`SPAN`]).
fn munsell_tones(labels: &[u8], l: &[f32], steps: usize, gap: usize, reach: [f32; 2]) -> Vec<f32> {
    let mut sum = vec![0f64; steps];
    let mut count = vec![0u32; steps];
    for (&s, &v) in labels.iter().zip(l) {
        sum[usize::from(s)] += f64::from(v);
        count[usize::from(s)] += 1;
    }
    let top = MUNSELL_L.len() - 1;
    let mut near: Vec<Option<usize>> = (0..steps)
        .map(|k| (count[k] > 0).then(|| nearest_value((sum[k] / f64::from(count[k])) as f32)))
        .collect();
    // the darkest step reaches V2 and the lightest V8, as far as the photo itself reaches
    if let Some(at) = near.iter_mut().flatten().next() {
        *at = (*at).min(nearest_value(reach[0]).max(SPAN[0]));
    }
    if let Some(at) = near.iter_mut().flatten().next_back() {
        *at = (*at).max(nearest_value(reach[1]).min(SPAN[1]));
    }
    let mut v: Vec<usize> = Vec::with_capacity(steps);
    for at in near {
        let at = at.unwrap_or_else(|| v.last().map_or(0, |&p| p + gap));
        let at = v.last().map_or(at, |&p| at.max(p + gap));
        v.push(at);
    }
    // a step pushed past V9 pulls the ones under it down, so all fit the scale
    for k in (0..steps).rev() {
        let cap = if k + 1 < steps {
            v[k + 1].saturating_sub(gap)
        } else {
            top
        };
        v[k] = v[k].min(cap);
    }
    v.into_iter().map(|i| MUNSELL_L[i]).collect()
}

/// The index of the Munsell value nearest an L*.
fn nearest_value(l: f32) -> usize {
    (0..MUNSELL_L.len())
        .min_by(|&i, &j| {
            (MUNSELL_L[i] - l)
                .abs()
                .total_cmp(&(MUNSELL_L[j] - l).abs())
        })
        .unwrap_or(0)
}

/// A value study spans the paint from near black to near white: the darkest step of the three
/// preset is painted at V2 or darker and its lightest at V8 or lighter (indexes into
/// [`MUNSELL_L`]). Oil ivory black is about V1 and titanium white about V9.7.
const SPAN: [usize; 2] = [1, 7];

/// How far the photo reaches, read as these percentiles of its lifted L*. A photo with no real
/// darks (a light key) or no real lights (a dark key) keeps its key.
const REACH: [f64; 2] = [0.02, 0.98];

/// The three preset keeps its steps at least this many Munsell values apart: true values, but
/// masses a painter can tell apart at a glance.
const THREE_GAP: usize = 2;

/// The Three preset is re-keyed to the photo's own thirds when its middle step covers more than
/// this share of the picture.
const ONE_STEP_MAX: f32 = 0.70;

/// The biggest step of a label map and the share (0 to 1) of the picture it covers.
fn dominant_step(labels: &[u8]) -> (u8, f32) {
    let mut count = [0usize; 256];
    for &s in labels {
        count[usize::from(s)] += 1;
    }
    let (step, most) = (0..=255u8)
        .map(|s| (s, count[usize::from(s)]))
        .max_by_key(|&(s, n)| (n, std::cmp::Reverse(s)))
        .unwrap_or((0, 0));
    (step, most as f32 / labels.len().max(1) as f32)
}

/// How many different steps appear in a label map.
fn used_steps(labels: &[u8]) -> usize {
    let mut used = [false; 256];
    for &s in labels {
        used[usize::from(s)] = true;
    }
    used.iter().filter(|&&u| u).count()
}

/// Quantize `smooth` at `cuts` (rising), then clean it: mode filter, small regions merged, and
/// the boundaries rounded once more with a second mode filter.
fn clean_labels(
    smooth: &[f32],
    w: usize,
    h: usize,
    cuts: &[f32],
    min_px: u32,
    o: &ValuesOpts,
) -> Vec<u8> {
    let steps = cuts.len() + 1;
    let q: Vec<u8> = smooth
        .iter()
        .map(|&v| cuts.iter().filter(|&&c| v >= c).count() as u8)
        .collect();
    let mut labels = mode_filter(&q, w, h, o.mode_radius, steps);
    let rule = Merge {
        min_px,
        protect: o.protect_steps,
    };
    merge_small(&mut labels, w, h, &rule);
    mode_filter(&labels, w, h, SMOOTH_RADIUS, steps)
}

/// The cuts of a family preset. The `side` mass is cut in thirds of its own L* range, the other
/// mass stays one step. `shadow_side` picks the shadow mass (preset 3) or the light mass (4).
/// Labels: the shadow family gives 0 to 2 for the shadows and 3 for the light, the light family
/// gives 0 for the shadow and 1 to 3 for the lights.
fn family_cuts(smooth: &[f32], cut: f32, shadow_side: bool) -> Vec<f32> {
    let mass: Vec<f32> = smooth
        .iter()
        .copied()
        .filter(|&v| (v < cut) == shadow_side)
        .collect();
    if mass.is_empty() {
        return vec![cut];
    }
    if shadow_side {
        let step = (cut - percentile(&mass, 0.02)) / 3.0;
        vec![cut - 2.0 * step, cut - step, cut]
    } else {
        let step = (percentile(&mass, 0.98) - cut) / 3.0;
        vec![cut, cut + step, cut + 2.0 * step]
    }
}

/// Paints a label map with a gray of each tone, and lists the tones in the picture, darkest first.
fn paint_tones(labels: &[u8], tones: &[f32], tint: u8, w: usize, h: usize) -> (Rgb, Vec<[u8; 3]>) {
    let colors: Vec<[u8; 3]> = tones.iter().map(|&l| tone_color(l, tint)).collect();
    let mut image = Rgb::new(w, h, 3);
    let mut used = vec![false; tones.len()];
    for (px, &s) in image.data.chunks_exact_mut(3).zip(labels) {
        px.copy_from_slice(&colors[usize::from(s)]);
        used[usize::from(s)] = true;
    }
    // the tones in the picture, darkest first, as the Munsell scale runs and as the Shapes piles
    // come; a step that paints no pixel is not a tone to mix
    let mut order: Vec<usize> = (0..tones.len()).filter(|&i| used[i]).collect();
    order.sort_by(|&a, &b| tones[a].total_cmp(&tones[b]));
    (image, order.into_iter().map(|i| colors[i]).collect())
}

/// The view of the Values tool: flat tones made of whole shapes.
///
/// `preset`: 0 notan (2 tones), 1 three, 2 five, 3 shadow family (the shadow mass in three steps,
/// the light mass one flat tone at its mean), 4 light family (the mirror), 5 families (three
/// steps that follow the light and shadow families). `detail` is 0 to 1 and
/// sets the smallest shape that survives: 0 keeps the most (0.05 percent of the area), 1 the
/// least (1 percent).
///
/// The three preset cuts at L* 35 and 68 (lifted) and paints L* 20, 52 and 85. When its middle
/// step covers over 70 percent of the picture, the cuts move to the photo's own thirds.
///
/// The families preset follows the light and shadow families: it cuts at the light/shadow break
/// (the notan cut), then once more inside the bigger family (see [`three_cuts`]). Each of its steps is painted at the whole Munsell value
/// nearest the mean of its lifted L*, at least two values apart (see [`munsell_tones`]), so the
/// tone is a value a painter can mix. The darkest step goes to V2 or darker and the lightest to V8
/// or lighter, as far as the photo reaches, so the study spans the paint.
///
/// The Key rule: a photo whose Otsu cut is over 75 or under 25 (blown out, very dark) can leave
/// the five preset with fewer than 3 steps. Then the cuts move to the photo's own 33 and 66
/// percentiles of L* and the three tones are used. The notan, the families preset and the family
/// presets cut at the median of L* on such a photo, so both masses exist.
///
/// It returns the picture and its tones as painted bytes, darkest first. `tint` 0 paints grays,
/// 1 paints umber (see [`tone_color`]).
///
/// # Errors
/// `BadInput` for a `tint` above 1, a `preset` of 6 or more, a `detail` outside 0 to 1, an image that is not RGB or
/// is empty.
pub fn view(work: &Rgb, preset: u8, detail: f32, tint: u8) -> Result<(Rgb, Vec<[u8; 3]>)> {
    check_view_args(preset, detail, tint)?;
    work.require_rgb("values needs a non-empty RGB image")?;
    let run = ViewRun::new(work, detail, tint);
    Ok(match preset {
        0 => run.notan(),
        1 => run.three(),
        2 => run.five(),
        5 => run.families(),
        _ => run.family_side(preset == 3),
    })
}

/// The range checks of [`view`] on its three numbers.
fn check_view_args(preset: u8, detail: f32, tint: u8) -> Result<()> {
    if tint > 1 {
        return Err(Error::bad("tint must be 0 or 1"));
    }
    if preset > 5 {
        return Err(Error::bad(format!("values preset {preset} is not 0 to 5")));
    }
    unit(detail, "values detail is not 0 to 1")
}

/// The mean of `raw` over each of the `steps` steps of `labels` (50 for a step with no pixel).
fn step_means(labels: &[u8], raw: &[f32], steps: usize) -> Vec<f32> {
    let mut sum = vec![0f64; steps];
    let mut count = vec![0u32; steps];
    for (&s, &l) in labels.iter().zip(raw) {
        sum[usize::from(s)] += f64::from(l);
        count[usize::from(s)] += 1;
    }
    sum.iter()
        .zip(&count)
        .map(|(&s, &n)| {
            if n == 0 {
                50.0
            } else {
                (s / f64::from(n)) as f32
            }
        })
        .collect()
}

/// A painted view and its tones, darkest first (see [`paint_tones`]).
type Painted = (Rgb, Vec<[u8; 3]>);

/// What the preset branches of [`view`] share: the analysis of the photo and the sizes.
struct ViewRun {
    a: Analysis,
    o: ValuesOpts,
    w: usize,
    h: usize,
    /// The smallest shape that survives, in px.
    min_px: u32,
    tint: u8,
    /// The photo is blown out or very dark (the Otsu cut is outside `KEY_DARK` to `KEY_LIGHT`).
    extreme: bool,
}

impl ViewRun {
    /// Analyzes `work`.
    fn new(work: &Rgb, detail: f32, tint: u8) -> Self {
        let o = ValuesOpts::default();
        let (w, h) = (work.width, work.height);
        let a = analyze(work, &o);
        let min_px = ((w * h) as f32 * view_min_area(detail)).ceil() as u32;
        let extreme = a.otsu < KEY_DARK || a.otsu > KEY_LIGHT;
        Self {
            a,
            o,
            w,
            h,
            min_px,
            tint,
            extreme,
        }
    }

    /// The cleaned label map at `cuts`.
    fn labels_for(&self, cuts: &[f32]) -> Vec<u8> {
        clean_labels(&self.a.smooth, self.w, self.h, cuts, self.min_px, &self.o)
    }

    /// Paints `labels` at `tones`.
    fn paint(&self, labels: &[u8], tones: &[f32]) -> Painted {
        paint_tones(labels, tones, self.tint, self.w, self.h)
    }

    /// The Key rule: the labels cut at the photo's own 33 and 66 percentiles, painted with the
    /// three tones.
    fn rekeyed(&self) -> Painted {
        let rekey = [
            percentile(&self.a.smooth, 0.33),
            percentile(&self.a.smooth, 0.66),
        ];
        self.paint(&self.labels_for(&rekey), &THREE_TONES)
    }

    /// Preset 0: two tones, cut at the light/shadow break.
    fn notan(&self) -> Painted {
        let cut = family_break(&self.a, self.o.notan_clamp);
        let labels = self.labels_for(&[cut]);
        self.paint(&labels, &NOTAN_TONES)
    }

    /// Preset 1: three tones at fixed cuts, re-keyed on a photo that leaves a step empty.
    fn three(&self) -> Painted {
        let labels = self.labels_for(&THREE_CUTS);
        // one step over most of the picture (a pale church, a mid-key flock) is as flat as a
        // missing step: the three tones are cut at the photo's own thirds. Only the middle
        // step counts: a light key (a white sky over a street) and a dark key (a dark room)
        // are real keys, and the re-key would invert them.
        let (step, share) = dominant_step(&labels);
        let flat = share > ONE_STEP_MAX && step == 1;
        if (self.extreme && used_steps(&labels) < 3) || flat {
            return self.rekeyed();
        }
        self.paint(&labels, &THREE_TONES)
    }

    /// Preset 2: five tones at the Munsell cuts, re-keyed on a photo that leaves steps empty.
    fn five(&self) -> Painted {
        let labels = self.labels_for(&FIVE_CUTS);
        if self.extreme && used_steps(&labels) < 3 {
            return self.rekeyed();
        }
        self.paint(&labels, &FIVE_TONES)
    }

    /// Preset 5: three steps that follow the light and shadow families, painted at Munsell values.
    fn families(&self) -> Painted {
        let a = &self.a;
        // the light/shadow break first, then the family that needs a second step most
        let cuts = three_cuts(&a.smooth, family_break(a, self.o.notan_clamp));
        let labels = self.labels_for(&cuts);
        let reach = REACH.map(|q| percentile(&a.lifted, q));
        let tones = munsell_tones(&labels, &a.lifted, cuts.len() + 1, THREE_GAP, reach);
        self.paint(&labels, &tones)
    }

    /// Presets 3 and 4: the shadow (or the light) mass in three steps, the other mass flat.
    fn family_side(&self, shadow_side: bool) -> Painted {
        let a = &self.a;
        let cut = family_break(a, self.o.family_clamp);
        let cuts = family_cuts(&a.smooth, cut, shadow_side);
        let labels = self.labels_for(&cuts);
        // Every step is painted at the mean L* of its pixels.
        let tones = step_means(&labels, &a.raw, cuts.len() + 1);
        self.paint(&labels, &tones)
    }
}

#[cfg(test)]
mod tests;
