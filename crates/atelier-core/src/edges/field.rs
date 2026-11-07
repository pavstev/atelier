//! The parts of the Edges layer that `trace.rs` builds on: the structure field, linking, bridging,
//! ranking and the line coverage. The view itself is `trace::view`.
//!
//! All sigmas are in pixels of the working image, tuned for a long side of 1024 px. There is no
//! clock, no randomness and no hash map. Float math is plain `f32` in a fixed order plus `libm`,
//! so the same input gives the same bytes on every platform.

use std::cmp::Reverse;
use std::collections::BinaryHeap;

use crate::filters::sobel;
use crate::img::{Rgb, neighbors8};

/// The knobs of the pipeline. The defaults are the shipped picks.
#[derive(Clone, Debug, PartialEq)]
pub struct LinesOpts {
    /// Bridge gaps up to this many px.
    pub bridge_gap: f32,
    /// Only if the chain ends point within this angle (degrees) at the gap.
    pub bridge_deg: f32,
    /// A chain is a duplicate when `dup_share` of it lies within this many px of a longer chain.
    pub dup_dist: f32,
    /// See `dup_dist`.
    pub dup_share: f32,
    /// Transfer keeps at most this many chains.
    pub transfer_chains: usize,
    /// Transfer always keeps the silhouette: the longest hard chain and the closed or near closed
    /// chains with a point within this many px of it.
    pub silhouette_reach: f32,
}

impl Default for LinesOpts {
    fn default() -> Self {
        Self {
            bridge_gap: 8.0,
            bridge_deg: 40.0,
            dup_dist: 4.0,
            dup_share: 0.6,
            transfer_chains: 40,
            silhouette_reach: 8.0,
        }
    }
}

/// How an edge reads to a painter.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// A clear edge: the median contrast is in the top share.
    Hard,
    /// A weaker edge.
    Soft,
}

/// One tracked path.
#[derive(Clone, Debug, PartialEq)]
pub struct Chain {
    /// Simplified points `[x, y]` in px. The pixel (i, j) has its center at `[i, j]`.
    pub pts: Vec<[f32; 2]>,
    /// The last point is the first point.
    pub closed: bool,
    /// Hard, soft or lost.
    pub kind: Kind,
    /// Median lightness difference across the chain (`OKLab` L, 0 to 1).
    pub contrast: f32,
    /// Length of `pts`, in px.
    pub length: f32,
    /// `length^0.7 * contrast` for a main chain; the inner pass sets its own score.
    pub score: f32,
    /// Inside the ink budget.
    pub kept: bool,
    /// `contrast` over the mean strength of the chain: the strength of the map under a point,
    /// times this, is the local contrast. 0 for a chain that is not read from the map (a strand).
    pub gain: f32,
}

/// All chains of one image: the main chains in raster order of their first pixel, then the inner
/// chains in the same order.
#[derive(Clone, Debug, PartialEq)]
pub struct LineSet {
    /// Width of the traced image.
    pub width: usize,
    /// Height of the traced image.
    pub height: usize,
    /// The chains.
    pub chains: Vec<Chain>,
    /// The edge strength (0 to 1, blurred) the chains were traced from, `width * height` values.
    pub strength: Vec<f32>,
}

// ---------------------------------------------------------------------------------------------
// Filters

/// A normalized Gaussian kernel, `2r + 1` taps with `r = ceil(3 sigma)`.
fn gauss_kernel(sigma: f32) -> Vec<f32> {
    let r = (3.0 * sigma).ceil().max(1.0) as usize;
    let s = f64::from(sigma);
    let mut k: Vec<f32> = (0..=2 * r)
        .map(|i| {
            let d = i as f64 - r as f64;
            libm::exp(-d * d / (2.0 * s * s)) as f32
        })
        .collect();
    let sum: f32 = k.iter().sum();
    for v in &mut k {
        *v /= sum;
    }
    k
}

/// Separable Gaussian blur, borders replicated.
pub(crate) fn blur(src: &[f32], w: usize, h: usize, sigma: f32) -> Vec<f32> {
    if sigma <= 0.0 {
        return src.to_vec();
    }
    let k = gauss_kernel(sigma);
    let r = k.len() / 2;
    let mut tmp = vec![0f32; w * h];
    let mut row = vec![0f32; w + 2 * r];
    for y in 0..h {
        let s = &src[y * w..(y + 1) * w];
        for (i, v) in row.iter_mut().enumerate() {
            *v = s[(i as isize - r as isize).clamp(0, w as isize - 1) as usize];
        }
        for (x, o) in tmp[y * w..(y + 1) * w].iter_mut().enumerate() {
            let win = &row[x..=x + 2 * r];
            *o = win.iter().zip(&k).map(|(a, b)| a * b).sum();
        }
    }
    let mut out = vec![0f32; w * h];
    for y in 0..h {
        let o = &mut out[y * w..(y + 1) * w];
        for (j, &kj) in k.iter().enumerate() {
            let sy = (y as isize + j as isize - r as isize).clamp(0, h as isize - 1) as usize;
            for (a, b) in o.iter_mut().zip(&tmp[sy * w..(sy + 1) * w]) {
                *a += kj * *b;
            }
        }
    }
    out
}

/// Bilinear sample of a plane, clamped at the border.
#[inline]
pub(crate) fn bil(p: &[f32], w: usize, h: usize, x: f32, y: f32) -> f32 {
    let x = x.clamp(0.0, (w - 1) as f32);
    let y = y.clamp(0.0, (h - 1) as f32);
    let (x0, y0) = (x as usize, y as usize);
    let (x1, y1) = ((x0 + 1).min(w - 1), (y0 + 1).min(h - 1));
    let (tx, ty) = (x - x0 as f32, y - y0 as f32);
    let top = p[y0 * w + x0] * (1.0 - tx) + p[y0 * w + x1] * tx;
    let bottom = p[y1 * w + x0] * (1.0 - tx) + p[y1 * w + x1] * tx;
    top * (1.0 - ty) + bottom * ty
}

// ---------------------------------------------------------------------------------------------
// Flow field

/// The unit tangent of the edge flow at each pixel (only up to its sign) and the gradient
/// strength.
pub(crate) struct Field {
    pub(crate) tx: Vec<f32>,
    pub(crate) ty: Vec<f32>,
    pub(crate) g: Vec<f32>,
}

/// Di Zenzo structure tensor of the three planes, smoothed, as a tangent field.
pub(crate) fn structure_field(planes: &[Vec<f32>; 3], w: usize, h: usize, sigma: f32) -> Field {
    let n = w * h;
    let (mut jxx, mut jxy, mut jyy) = (vec![0f32; n], vec![0f32; n], vec![0f32; n]);
    for p in planes {
        let (gx, gy) = sobel(p, w, h);
        for i in 0..n {
            let (gx, gy) = (gx[i] * 0.125, gy[i] * 0.125);
            jxx[i] += gx * gx;
            jxy[i] += gx * gy;
            jyy[i] += gy * gy;
        }
    }
    let jxx = blur(&jxx, w, h, sigma);
    let jxy = blur(&jxy, w, h, sigma);
    let jyy = blur(&jyy, w, h, sigma);
    let mut f = Field {
        tx: vec![1.0; n],
        ty: vec![0.0; n],
        g: vec![0.0; n],
    };
    for i in 0..n {
        let a = jxx[i] - jyy[i];
        let b = 2.0 * jxy[i];
        let r = (a * a + b * b).sqrt();
        f.g[i] = (jxx[i] + jyy[i]).max(0.0).sqrt();
        if r > 1e-20 {
            // The gradient direction (cos t, sin t) from the double angle; the tangent is
            // perpendicular to it.
            let c = f32::midpoint(1.0, a / r).max(0.0).sqrt();
            let s = f32::midpoint(1.0, -a / r).max(0.0).sqrt();
            let s = if b < 0.0 { -s } else { s };
            f.tx[i] = -s;
            f.ty[i] = c;
        }
    }
    f
}

// ---------------------------------------------------------------------------------------------
// Flow based `DoG`

/// Keeps a pixel only if its response is a local maximum across the flow.
pub(crate) fn nms(resp: &[f32], f: &Field, w: usize, h: usize) -> Vec<f32> {
    let mut out = vec![0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let i = y * w + x;
            let r = resp[i];
            if r <= 0.0 {
                continue;
            }
            let (nx, ny) = (-f.ty[i], f.tx[i]);
            let (fx, fy) = (x as f32, y as f32);
            let a = bil(resp, w, h, fx + nx, fy + ny);
            let b = bil(resp, w, h, fx - nx, fy - ny);
            if r >= a && r > b {
                out[i] = r;
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Linking

/// A path of pixel centers before it is simplified.
pub(crate) struct RawChain {
    pub(crate) pts: Vec<[f32; 2]>,
    pub(crate) closed: bool,
}

/// Removes the corner pixel of every L shaped step, in raster order. The two neighbors stay
/// 8 connected, so no chain breaks, and the staircase is one pixel wide.
pub(crate) fn thin_corners(e: &mut [u8], w: usize, h: usize) {
    for i in 0..w * h {
        if e[i] == 0 {
            continue;
        }
        let mut count = 0;
        let (mut vert, mut horiz) = (0, 0);
        for (k, dx, _, j) in neighbors8(i, w, h) {
            if e[j] != 0 {
                count += 1;
                if k < 4 {
                    if dx == 0 {
                        vert += 1;
                    } else {
                        horiz += 1;
                    }
                }
            }
        }
        if count == 2 && vert == 1 && horiz == 1 {
            e[i] = 0;
        }
    }
}

/// Follows unvisited edge pixels from `start`, steering by the heading of the last 5 steps.
/// Returns the pixels after `start` in order.
fn walk(e: &[u8], visited: &mut [bool], w: usize, h: usize, start: usize) -> Vec<usize> {
    let mut out: Vec<usize> = Vec::new();
    let mut cur = start;
    let mut head: Option<(f32, f32)> = None;
    loop {
        let mut best: Option<usize> = None;
        let mut best_score = f32::NEG_INFINITY;
        for (k, dx, dy, j) in neighbors8(cur, w, h) {
            if e[j] == 0 || visited[j] {
                continue;
            }
            let len = if k < 4 { 1.0 } else { std::f32::consts::SQRT_2 };
            let score = match head {
                Some((hx, hy)) => (dx as f32 * hx + dy as f32 * hy) / len,
                None => {
                    if k < 4 {
                        1.0
                    } else {
                        0.5
                    }
                }
            };
            if score > best_score {
                best_score = score;
                best = Some(j);
            }
        }
        let Some(j) = best else { break };
        visited[j] = true;
        out.push(j);
        let back = if out.len() >= 5 {
            out[out.len() - 5]
        } else {
            start
        };
        let (hx, hy) = (
            (j % w) as f32 - (back % w) as f32,
            (j / w) as f32 - (back / w) as f32,
        );
        let hl = (hx * hx + hy * hy).sqrt();
        head = Some((hx / hl, hy / hl));
        cur = j;
    }
    out
}

/// Links the edge pixels into chains. Open chains start at their end pixels, in raster order;
/// what is left (loops, branches) starts at the first free pixel in raster order.
pub(crate) fn link(e: &[u8], w: usize, h: usize) -> Vec<RawChain> {
    let n = w * h;
    let count = |i: usize| neighbors8(i, w, h).filter(|&(.., j)| e[j] != 0).count();
    let mut visited = vec![false; n];
    let mut chains = Vec::new();
    let pt = |i: usize| [(i % w) as f32, (i / w) as f32];
    let mut build = |start: usize, visited: &mut Vec<bool>| {
        visited[start] = true;
        let a = walk(e, visited, w, h, start);
        let b = walk(e, visited, w, h, start);
        let mut idx: Vec<usize> = b.into_iter().rev().collect();
        idx.push(start);
        idx.extend(a);
        let mut pts: Vec<[f32; 2]> = idx.iter().map(|&i| pt(i)).collect();
        let (f, l) = (idx[0], idx[idx.len() - 1]);
        let adjacent = (f % w).abs_diff(l % w) <= 1 && (f / w).abs_diff(l / w) <= 1;
        let closed = idx.len() >= 8 && adjacent;
        if closed {
            pts.push(pts[0]);
        }
        chains.push(RawChain { pts, closed });
    };
    for i in 0..n {
        if e[i] != 0 && !visited[i] && count(i) == 1 {
            build(i, &mut visited);
        }
    }
    for i in 0..n {
        if e[i] != 0 && !visited[i] {
            build(i, &mut visited);
        }
    }
    chains
}

pub(crate) fn dist(a: [f32; 2], b: [f32; 2]) -> f32 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    (dx * dx + dy * dy).sqrt()
}

pub(crate) fn path_length(pts: &[[f32; 2]]) -> f32 {
    pts.windows(2).map(|s| dist(s[0], s[1])).sum()
}

/// An end of an open chain: the point and the unit heading that leaves the chain there.
fn chain_end(c: &RawChain, at_end: bool) -> ([f32; 2], [f32; 2]) {
    let n = c.pts.len();
    let k = 5.min(n - 1);
    let (p, q) = if at_end {
        (c.pts[n - 1], c.pts[n - 1 - k])
    } else {
        (c.pts[0], c.pts[k])
    };
    let d = dist(q, p).max(1e-6);
    (p, [(p[0] - q[0]) / d, (p[1] - q[1]) / d])
}

/// Joins chain ends that are close and point at each other. Up to 4 rounds.
pub(crate) fn bridge(mut chains: Vec<RawChain>, o: &LinesOpts) -> Vec<RawChain> {
    if o.bridge_gap <= 0.0 {
        return chains;
    }
    let cos_lim = libm::cosf(o.bridge_deg.to_radians());
    let cell = o.bridge_gap.ceil().max(1.0);
    for _round in 0..4 {
        let ends = open_ends(&chains);
        if ends.is_empty() {
            break;
        }
        let grid = EndGrid::new(&chains, ends, cell);
        let joins = find_joins(&chains, &grid, o, cos_lim);
        if joins.is_empty() {
            break;
        }
        chains = apply_joins(chains, &joins);
    }
    chains
}

/// One join: chain `a` at its end (`true`) or start, to chain `b` at its end or start.
type Join = (usize, bool, usize, bool);

/// The two ends `(chain, at_end)` of every open chain with two points or more, in chain order.
fn open_ends(chains: &[RawChain]) -> Vec<(usize, bool)> {
    chains
        .iter()
        .enumerate()
        .filter(|(_, c)| !c.closed && c.pts.len() >= 2)
        .flat_map(|(i, _)| [(i, false), (i, true)])
        .collect()
}

/// The chain ends binned in square cells of the gap, to look for the ends near a point.
struct EndGrid {
    ends: Vec<(usize, bool)>,
    cell: f32,
    gw: usize,
    gh: usize,
    /// For every cell, the indexes into `ends` of the ends that lie in it.
    cells: Vec<Vec<usize>>,
}

impl EndGrid {
    /// Bins `ends` (not empty) of `chains` in cells of `cell` px.
    fn new(chains: &[RawChain], ends: Vec<(usize, bool)>, cell: f32) -> Self {
        let (mut maxx, mut maxy) = (0f32, 0f32);
        for c in chains {
            for p in &c.pts {
                maxx = maxx.max(p[0]);
                maxy = maxy.max(p[1]);
            }
        }
        let gw = (maxx / cell) as usize + 1;
        let gh = (maxy / cell) as usize + 1;
        let mut cells: Vec<Vec<usize>> = vec![Vec::new(); gw * gh];
        for (ei, &(c, at_end)) in ends.iter().enumerate() {
            let (p, _) = chain_end(&chains[c], at_end);
            cells[(p[1] / cell) as usize * gw + (p[0] / cell) as usize].push(ei);
        }
        Self {
            ends,
            cell,
            gw,
            gh,
            cells,
        }
    }
}

/// The closest end that the end `(p, hd)` of chain `c` can join, within `gap` px and the angle
/// `cos_lim`, among the ends of unused chains in the 3 by 3 cells around `p`.
fn nearest_partner(
    chains: &[RawChain],
    grid: &EndGrid,
    used: &[bool],
    c: usize,
    (p, hd): ([f32; 2], [f32; 2]),
    (gap, cos_lim): (f32, f32),
) -> Option<usize> {
    let (cx, cy) = ((p[0] / grid.cell) as isize, (p[1] / grid.cell) as isize);
    let mut best: Option<(f32, usize)> = None;
    for gy in (cy - 1).max(0)..=(cy + 1).min(grid.gh as isize - 1) {
        for gx in (cx - 1).max(0)..=(cx + 1).min(grid.gw as isize - 1) {
            for &ei in &grid.cells[gy as usize * grid.gw + gx as usize] {
                let (c2, e2) = grid.ends[ei];
                if c2 == c || used[c2] {
                    continue;
                }
                let (q, hd2) = chain_end(&chains[c2], e2);
                let d = dist(p, q);
                if d > gap || d < 1e-6 {
                    continue;
                }
                let v = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
                let a = hd[0] * v[0] + hd[1] * v[1];
                let b = -(hd2[0] * v[0] + hd2[1] * v[1]);
                if a < cos_lim || b < cos_lim {
                    continue;
                }
                // Ends come in index order, so a tie keeps the earlier one.
                if best.is_none_or(|(bd, _)| d < bd) {
                    best = Some((d, ei));
                }
            }
        }
    }
    best.map(|(_, ei)| ei)
}

/// Pairs each unused chain end with its closest partner. A chain joins once per round.
fn find_joins(chains: &[RawChain], grid: &EndGrid, o: &LinesOpts, cos_lim: f32) -> Vec<Join> {
    let mut used = vec![false; chains.len()];
    let mut joins: Vec<Join> = Vec::new();
    for &(c, at_end) in &grid.ends {
        if used[c] {
            continue;
        }
        let end = chain_end(&chains[c], at_end);
        if let Some(ei) = nearest_partner(chains, grid, &used, c, end, (o.bridge_gap, cos_lim)) {
            let (c2, e2) = grid.ends[ei];
            used[c] = true;
            used[c2] = true;
            joins.push((c, at_end, c2, e2));
        }
    }
    joins
}

/// The chains with every join made: a joined pair becomes one open chain, put after the rest.
fn apply_joins(chains: Vec<RawChain>, joins: &[Join]) -> Vec<RawChain> {
    let mut slots: Vec<Option<RawChain>> = chains.into_iter().map(Some).collect();
    let mut next: Vec<RawChain> = Vec::new();
    for &(a, a_end, b, b_end) in joins {
        let (Some(ca), Some(cb)) = (slots[a].take(), slots[b].take()) else {
            continue;
        };
        let mut pts = ca.pts;
        if !a_end {
            pts.reverse();
        }
        let mut tail = cb.pts;
        if b_end {
            tail.reverse();
        }
        pts.extend(tail);
        next.push(RawChain { pts, closed: false });
    }
    let mut merged: Vec<RawChain> = slots.into_iter().flatten().collect();
    merged.extend(next);
    merged
}

/// Drops a chain when `dup_share` of its points lie within `dup_dist` px of a longer chain.
/// Longer chains go first; equal lengths go by their order in `chains`. The survivors keep
/// their order.
pub(crate) fn drop_duplicates(
    chains: Vec<RawChain>,
    w: usize,
    h: usize,
    o: &LinesOpts,
) -> Vec<RawChain> {
    drop_duplicates_after(chains, 0, w, h, o)
}

/// Like `drop_duplicates`, but the first `seeds` chains always count as the longer ones: they
/// mark the ground first and are not returned.
fn drop_duplicates_after(
    chains: Vec<RawChain>,
    seeds: usize,
    w: usize,
    h: usize,
    o: &LinesOpts,
) -> Vec<RawChain> {
    if o.dup_dist <= 0.0 {
        return chains.into_iter().skip(seeds).collect();
    }
    let reach = o.dup_dist.ceil() as isize;
    let r2 = o.dup_dist * o.dup_dist;
    let mut order: Vec<usize> = (0..chains.len()).collect();
    let lens: Vec<f32> = chains.iter().map(|c| path_length(&c.pts)).collect();
    order.sort_by(|&a, &b| {
        (b < seeds)
            .cmp(&(a < seeds))
            .then(lens[b].total_cmp(&lens[a]))
            .then(a.cmp(&b))
    });
    let mut near = vec![false; w * h];
    let mut keep = vec![false; chains.len()];
    for i in order {
        let px: Vec<(isize, isize)> = chains[i]
            .pts
            .iter()
            .map(|p| (p[0] as isize, p[1] as isize))
            .collect();
        let hit = px
            .iter()
            .filter(|&&(x, y)| near[y as usize * w + x as usize])
            .count();
        if i >= seeds && hit as f32 >= o.dup_share * px.len() as f32 {
            continue;
        }
        keep[i] = true;
        for &(x, y) in &px {
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    let (nx, ny) = (x + dx, y + dy);
                    if nx >= 0
                        && ny >= 0
                        && nx < w as isize
                        && ny < h as isize
                        && (dx * dx + dy * dy) as f32 <= r2
                    {
                        near[ny as usize * w + nx as usize] = true;
                    }
                }
            }
        }
    }
    chains
        .into_iter()
        .zip(keep)
        .skip(seeds)
        .filter_map(|(c, k)| k.then_some(c))
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Simplify, class, rank

/// Visvalingam Whyatt: drops the point with the smallest triangle until all triangles have at
/// least `min_area`. The ends stay.
pub(crate) fn simplify_vw(pts: &[[f32; 2]], min_area: f32) -> Vec<[f32; 2]> {
    let n = pts.len();
    if n < 3 {
        return pts.to_vec();
    }
    let tri = |a: usize, b: usize, c: usize| {
        let (p, q, r) = (pts[a], pts[b], pts[c]);
        0.5 * ((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])).abs()
    };
    let mut prev: Vec<usize> = (0..n).map(|i| i.saturating_sub(1)).collect();
    let mut next: Vec<usize> = (0..n).map(|i| (i + 1).min(n - 1)).collect();
    let mut alive = vec![true; n];
    let mut ver = vec![0u32; n];
    let mut area = vec![f32::INFINITY; n];
    let mut heap: BinaryHeap<Reverse<(u32, usize, u32)>> = BinaryHeap::new();
    let first: Vec<f32> = (1..n - 1).map(|i| tri(i - 1, i, i + 1)).collect();
    area[1..n - 1].copy_from_slice(&first);
    for (k, a) in first.iter().enumerate() {
        heap.push(Reverse((a.to_bits(), k + 1, 0)));
    }
    while let Some(Reverse((bits, i, v))) = heap.pop() {
        if !alive[i] || ver[i] != v {
            continue;
        }
        let a = f32::from_bits(bits);
        if a >= min_area {
            break;
        }
        alive[i] = false;
        let (p, q) = (prev[i], next[i]);
        next[p] = q;
        prev[q] = p;
        for m in [p, q] {
            if m == 0 || m == n - 1 {
                continue;
            }
            area[m] = tri(prev[m], m, next[m]).max(a);
            ver[m] += 1;
            heap.push(Reverse((area[m].to_bits(), m, ver[m])));
        }
    }
    (0..n).filter(|&i| alive[i]).map(|i| pts[i]).collect()
}

/// Marks the best chains that fit in `budget` px of total length. A chain that does not fit is
/// skipped, so one very long chain cannot empty the drawing. Equal scores go to the lower id.
pub(crate) fn rank(chains: &mut [Chain], budget: f32) {
    let mut order: Vec<usize> = (0..chains.len()).collect();
    order.sort_by(|&a, &b| chains[b].score.total_cmp(&chains[a].score).then(a.cmp(&b)));
    let mut used = 0f32;
    for i in order {
        if used + chains[i].length > budget {
            continue;
        }
        used += chains[i].length;
        chains[i].kept = true;
    }
}

// ---------------------------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------------------------

/// Distance from the point `p` to the segment `a` to `b`.
pub(crate) fn point_segment(p: [f32; 2], a: [f32; 2], b: [f32; 2]) -> f32 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let len2 = dx * dx + dy * dy;
    let t = if len2 > 0.0 {
        (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let (ex, ey) = (p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    (ex * ex + ey * ey).sqrt()
}

/// True when some point of `c` lies within `reach` px of the path `of`.
fn touches(c: &Chain, of: &Chain, reach: f32) -> bool {
    c.pts.iter().any(|&p| {
        of.pts
            .windows(2)
            .any(|s| point_segment(p, s[0], s[1]) <= reach)
    })
}

/// The silhouette: the longest chain of the hard kind (the lower id on a tie), then the closed
/// or near closed chains that touch it. Ids in that order, empty when no chain is hard.
fn silhouette(chains: &[Chain], reach: f32) -> Vec<usize> {
    let mut longest: Option<usize> = None;
    for (i, c) in chains.iter().enumerate() {
        if c.kind == Kind::Hard && longest.is_none_or(|j| c.length > chains[j].length) {
            longest = Some(i);
        }
    }
    let Some(s) = longest else {
        return Vec::new();
    };
    let mut out = vec![s];
    for (i, c) in chains.iter().enumerate() {
        let near_closed = c.closed
            || c.pts
                .first()
                .zip(c.pts.last())
                .is_some_and(|(&a, &b)| dist(a, b) <= reach);
        if i != s && near_closed && touches(c, &chains[s], reach) {
            out.push(i);
        }
    }
    out
}

/// Transfer: marks the silhouette, then the chains by `contrast * length^0.5` while they fit in
/// `budget` px, at most `transfer_chains` in all. A long straight edge does not win just by being
/// long, and texture with weak contrast stays out.
pub(crate) fn rank_transfer(chains: &mut [Chain], budget: f32, o: &LinesOpts) {
    for c in chains.iter_mut() {
        c.kept = false;
    }
    let mut used = 0f32;
    let mut count = 0usize;
    for i in silhouette(chains, o.silhouette_reach) {
        if count >= o.transfer_chains {
            break;
        }
        chains[i].kept = true;
        used += chains[i].length;
        count += 1;
    }
    let weight = |c: &Chain| c.contrast * libm::sqrtf(c.length);
    let mut order: Vec<usize> = (0..chains.len()).collect();
    order.sort_by(|&a, &b| {
        weight(&chains[b])
            .total_cmp(&weight(&chains[a]))
            .then(a.cmp(&b))
    });
    for i in order {
        if count >= o.transfer_chains {
            break;
        }
        if chains[i].kept {
            continue;
        }
        if used + chains[i].length > budget {
            continue;
        }
        used += chains[i].length;
        chains[i].kept = true;
        count += 1;
    }
}

// ---------------------------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------------------------

/// A coverage plane: 0 is paper, 1 is full ink.
pub(crate) struct Cover {
    w: usize,
    h: usize,
    v: Vec<f32>,
}

impl Cover {
    pub(crate) fn new(w: usize, h: usize) -> Self {
        Self {
            w,
            h,
            v: vec![0.0; w * h],
        }
    }

    /// Ink along the segment `a` to `b`: full inside `half` px, one px of soft edge, times
    /// `alpha` (0 to 1).
    pub(crate) fn segment(&mut self, a: [f32; 2], b: [f32; 2], half: f32, alpha: f32) {
        let reach = half + 1.0;
        let x0 = (a[0].min(b[0]) - reach).floor().max(0.0) as usize;
        let y0 = (a[1].min(b[1]) - reach).floor().max(0.0) as usize;
        let x1 = ((a[0].max(b[0]) + reach).ceil().max(0.0) as usize).min(self.w - 1);
        let y1 = ((a[1].max(b[1]) + reach).ceil().max(0.0) as usize).min(self.h - 1);
        for y in y0..=y1 {
            for x in x0..=x1 {
                let d = point_segment([x as f32, y as f32], a, b);
                let c = (half + 0.5 - d).clamp(0.0, 1.0) * alpha;
                let o = &mut self.v[y * self.w + x];
                *o = o.max(c);
            }
        }
    }

    /// Blends `grey` over the image by the coverage.
    pub(crate) fn paint(&self, img: &mut Rgb, grey: u8) {
        for (px, &c) in img.data.chunks_exact_mut(3).zip(&self.v) {
            if c > 0.0 {
                for o in px {
                    *o = (f32::from(*o) * (1.0 - c) + f32::from(grey) * c).round() as u8;
                }
            }
        }
    }
}

/// The `ink` knob (0 to 1) as a factor on the budget: 0.25 at 0, 1 at 0.5, 2 at 1.
pub(crate) fn ink_scale(ink: f32) -> f32 {
    if ink <= 0.5 {
        0.25 + 1.5 * ink
    } else {
        1.0 + 2.0 * (ink - 0.5)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lines_simplify_keeps_corners_and_drops_steps() {
        let pts: Vec<[f32; 2]> = (0..10)
            .map(|i| [i as f32, 0.0])
            .chain((1..10).map(|i| [9.0, i as f32]))
            .collect();
        let s = simplify_vw(&pts, 1.0);
        assert_eq!(s, vec![[0.0, 0.0], [9.0, 0.0], [9.0, 9.0]]);
    }

    #[test]
    fn test_lines_bridge_joins_a_gap() {
        let a = RawChain {
            pts: (0..10).map(|i| [i as f32, 5.0]).collect(),
            closed: false,
        };
        let b = RawChain {
            pts: (13..25).map(|i| [i as f32, 5.0]).collect(),
            closed: false,
        };
        let out = bridge(vec![a, b], &LinesOpts::default());
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].pts.len(), 22);
    }
}
