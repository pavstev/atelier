//! Shared filters, one copy each: the Otsu cut of a histogram, the box mean, the guided
//! filter, the percentile, the Sobel gradient and the mode (majority) filter. The Gaussian blur is
//! `edges::field::blur`.

/// The Otsu cut of a 256 bin histogram: the first bin whose split into a dark and a light group
/// has the largest between class variance. `None` when the values fill one bin only.
pub(crate) fn otsu_bin(hist: &[u64; 256]) -> Option<usize> {
    otsu_split(hist, f64::MIN_POSITIVE).map(|(t, _)| t)
}

/// [`otsu_bin`] where each group holds at least `floor` counts, with the spread the cut takes
/// out: the between class sum of squares, `n0 n1 / n (m0 - m1)^2`, in counts times bins squared.
/// `None` when no cut leaves both groups that big.
pub(crate) fn otsu_split(hist: &[u64; 256], floor: f64) -> Option<(usize, f64)> {
    let total: u64 = hist.iter().sum();
    let total = total as f64;
    let sum_all: f64 = hist
        .iter()
        .enumerate()
        .map(|(i, &c)| i as f64 * c as f64)
        .sum();
    let mut best: Option<(usize, f64)> = None;
    let (mut w0, mut sum0) = (0f64, 0f64);
    for (t, &c) in hist.iter().enumerate() {
        w0 += c as f64;
        sum0 += t as f64 * c as f64;
        let w1 = total - w0;
        if w0 < floor || w1 < floor {
            continue;
        }
        let d = sum0 / w0 - (sum_all - sum0) / w1;
        let between = w0 * w1 * d * d;
        if best.is_none_or(|(_, b)| between > b) {
            best = Some((t, between));
        }
    }
    best.map(|(t, b)| (t, b / total))
}

/// Mean over a square window of radius `r`; edge windows are cut short.
pub(crate) fn box_mean(src: &[f32], width: usize, height: usize, radius: usize) -> Vec<f32> {
    let (w, h, r) = (width, height, radius);
    if w == 0 || h == 0 {
        return Vec::new();
    }
    let mut hsum = vec![0f32; w * h];
    let mut pre = vec![0f64; w + 1];
    for y in 0..h {
        let row = &src[y * w..(y + 1) * w];
        for x in 0..w {
            pre[x + 1] = pre[x] + f64::from(row[x]);
        }
        let out = &mut hsum[y * w..(y + 1) * w];
        for x in 0..w {
            out[x] = (pre[(x + r + 1).min(w)] - pre[x.saturating_sub(r)]) as f32;
        }
    }
    let cx: Vec<f64> = (0..w)
        .map(|x| ((x + r + 1).min(w) - x.saturating_sub(r)) as f64)
        .collect();
    let mut out = vec![0f32; w * h];
    let mut col = vec![0f64; w];
    for y in 0..=r.min(h - 1) {
        for x in 0..w {
            col[x] += f64::from(hsum[y * w + x]);
        }
    }
    for y in 0..h {
        let cy = ((y + r + 1).min(h) - y.saturating_sub(r)) as f64;
        for x in 0..w {
            out[y * w + x] = (col[x] / (cx[x] * cy)) as f32;
        }
        if y + r + 1 < h {
            for x in 0..w {
                col[x] += f64::from(hsum[(y + r + 1) * w + x]);
            }
        }
        if y >= r {
            for x in 0..w {
                col[x] -= f64::from(hsum[(y - r) * w + x]);
            }
        }
    }
    out
}

/// Guide statistics of the guided filter: the box mean and the variance of the guide.
pub(crate) struct GuideStats {
    mean: Vec<f32>,
    var: Vec<f32>,
    dims: (usize, usize, usize),
}

impl GuideStats {
    /// Statistics of `guide` over windows of radius `r`.
    pub(crate) fn new(guide: &[f32], w: usize, h: usize, r: usize) -> Self {
        let mean = box_mean(guide, w, h, r);
        let sq: Vec<f32> = guide.iter().map(|v| v * v).collect();
        let corr = box_mean(&sq, w, h, r);
        let var = corr
            .iter()
            .zip(&mean)
            .map(|(c, m)| (c - m * m).max(0.0))
            .collect();
        Self {
            mean,
            var,
            dims: (w, h, r),
        }
    }
}

/// He's guided filter with a gray guide: filters `plane` by `guide`. A window is `2 r + 1` wide
/// and cut short at the border. `eps` is the variance below which the output is flattened.
pub(crate) fn guided(
    guide: &[f32],
    plane: &[f32],
    w: usize,
    h: usize,
    r: usize,
    eps: f32,
) -> Vec<f32> {
    guided_with(&GuideStats::new(guide, w, h, r), guide, plane, eps)
}

/// [`guided`] with the statistics of the guide already taken, to filter several planes by one
/// guide.
pub(crate) fn guided_with(stats: &GuideStats, guide: &[f32], plane: &[f32], eps: f32) -> Vec<f32> {
    let (w, h, r) = stats.dims;
    let n = guide.len();
    let mean_p = box_mean(plane, w, h, r);
    let ip: Vec<f32> = guide.iter().zip(plane).map(|(i, p)| i * p).collect();
    let corr_ip = box_mean(&ip, w, h, r);
    let mut a = Vec::with_capacity(n);
    let mut b = Vec::with_capacity(n);
    for k in 0..n {
        let cov = corr_ip[k] - stats.mean[k] * mean_p[k];
        let ak = cov / (stats.var[k] + eps);
        a.push(ak);
        b.push(mean_p[k] - ak * stats.mean[k]);
    }
    let ma = box_mean(&a, w, h, r);
    let mb = box_mean(&b, w, h, r);
    (0..n).map(|k| ma[k] * guide[k] + mb[k]).collect()
}

/// The value at the share `q` (0..1) of `v`: the one at rank `ceil(len * q)`, at least the first.
/// 0 for an empty list.
pub(crate) fn percentile(v: &[f32], q: f64) -> f32 {
    if v.is_empty() {
        return 0.0;
    }
    let rank = ((v.len() as f64 * q).ceil() as usize).clamp(1, v.len());
    let mut copy = v.to_vec();
    *copy.select_nth_unstable_by(rank - 1, f32::total_cmp).1
}

/// The 3x3 Sobel gradient `(gx, gy)` of a plane, unscaled, the border replicated.
pub(crate) fn sobel(p: &[f32], w: usize, h: usize) -> (Vec<f32>, Vec<f32>) {
    let mut gx = vec![0f32; w * h];
    let mut gy = vec![0f32; w * h];
    let at = |x: isize, y: isize| {
        p[y.clamp(0, h as isize - 1) as usize * w + x.clamp(0, w as isize - 1) as usize]
    };
    for y in 0..h {
        for x in 0..w {
            let (xi, yi) = (x as isize, y as isize);
            gx[y * w + x] = (at(xi + 1, yi - 1) + 2.0 * at(xi + 1, yi) + at(xi + 1, yi + 1))
                - (at(xi - 1, yi - 1) + 2.0 * at(xi - 1, yi) + at(xi - 1, yi + 1));
            gy[y * w + x] = (at(xi - 1, yi + 1) + 2.0 * at(xi, yi + 1) + at(xi + 1, yi + 1))
                - (at(xi - 1, yi - 1) + 2.0 * at(xi, yi - 1) + at(xi + 1, yi - 1));
        }
    }
    (gx, gy)
}

/// The label of the most pixels in the `(2r + 1)` square around each pixel, so a border steps no
/// more than a few px. With `wide = Some((rw, flat))` the square has radius `rw` at the pixels
/// `flat` marks. A tie keeps the pixel's own label when it is among the leaders, else takes the
/// lowest id. Windows are cut short at the border. It counts each label with box sums from an
/// integral image over the box of the label grown by the radius, so the cost does not grow with
/// the radius and every sum is an integer. Labels are below `count`.
///
/// With `within = Some((parent, chosen))` a pixel only takes a label whose `parent` is the
/// `chosen` label of that pixel, which is how a finer level stays inside the coarser one.
pub(crate) fn mode_filter(
    labels: &[u32],
    w: usize,
    h: usize,
    r: usize,
    wide: Option<(usize, &[bool])>,
    count: usize,
    within: Option<(&[u32], &[u32])>,
) -> Vec<u32> {
    let (rw, flat) = wide.map_or((r, &[][..]), |(rw, flat)| (rw.max(r), flat));
    let radius = |i: usize| {
        if flat.get(i).copied().unwrap_or(false) {
            rw
        } else {
            r
        }
    };
    // x0, y0, x1, y1 of every label
    let mut bbox = vec![(usize::MAX, usize::MAX, 0usize, 0usize); count];
    for (i, &l) in labels.iter().enumerate() {
        let (x, y) = (i % w, i / w);
        let b = &mut bbox[l as usize];
        *b = (b.0.min(x), b.1.min(y), b.2.max(x), b.3.max(y));
    }
    let mut best = vec![0u32; labels.len()];
    let mut pick = labels.to_vec();
    for (l, &(bx0, by0, bx1, by1)) in bbox.iter().enumerate() {
        if bx0 == usize::MAX {
            continue;
        }
        let (x0, x1) = (bx0.saturating_sub(rw), (bx1 + rw).min(w - 1));
        let (y0, y1) = (by0.saturating_sub(rw), (by1 + rw).min(h - 1));
        let (bw, bh) = (x1 - x0 + 1, y1 - y0 + 1);
        // integral[(y + 1) * (bw + 1) + x + 1]: the label's pixels in the box up to (x, y)
        let stride = bw + 1;
        let mut integral = vec![0u32; stride * (bh + 1)];
        for y in 0..bh {
            let mut row = 0u32;
            for x in 0..bw {
                row += u32::from(labels[(y0 + y) * w + x0 + x] == l as u32);
                integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
            }
        }
        for y in 0..bh {
            for x in 0..bw {
                let i = (y0 + y) * w + x0 + x;
                if within.is_some_and(|(parent, chosen)| parent[l] != chosen[i]) {
                    continue;
                }
                let rr = radius(i);
                let (a, b) = (x.saturating_sub(rr), (x + rr + 1).min(bw));
                let (c, d) = (y.saturating_sub(rr), (y + rr + 1).min(bh));
                let score = integral[d * stride + b] + integral[c * stride + a]
                    - integral[c * stride + b]
                    - integral[d * stride + a];
                if score > best[i] || (score == best[i] && labels[i] == l as u32) {
                    best[i] = score;
                    pick[i] = l as u32;
                }
            }
        }
    }
    pick
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_box_mean_empty_picture_is_empty() {
        assert!(box_mean(&[], 0, 0, 3).is_empty());
        assert!(box_mean(&[], 4, 0, 1).is_empty());
        assert!(box_mean(&[], 0, 4, 1).is_empty());
    }

    #[test]
    fn test_box_mean_identity_and_clamp() {
        assert_eq!(
            box_mean(&[1.0, 3.0, 5.0, 7.0], 2, 2, 0),
            vec![1.0, 3.0, 5.0, 7.0]
        );
        assert_eq!(box_mean(&[0.0, 4.0], 2, 1, 1), vec![2.0, 2.0]);
    }

    #[test]
    fn test_otsu_splits_two_groups_and_none_for_a_flat_list() {
        let mut hist = [0u64; 256];
        hist[40] = 10;
        hist[200] = 10;
        assert_eq!(otsu_bin(&hist), Some(40));
        let mut flat = [0u64; 256];
        flat[90] = 7;
        assert_eq!(otsu_bin(&flat), None);
        assert_eq!(otsu_bin(&[0u64; 256]), None);
    }
    fn lcg(seed: u64, n: usize) -> Vec<f32> {
        let mut s = seed;
        (0..n)
            .map(|_| {
                s = s
                    .wrapping_mul(6364136223846793005)
                    .wrapping_add(1442695040888963407);
                (s >> 40) as f32 / (1u64 << 24) as f32
            })
            .collect()
    }

    #[test]
    fn test_guided_flat_is_flat() {
        let flat = vec![0.37f32; 20 * 15];
        let out = guided(&flat, &flat, 20, 15, 3, 0.01);
        assert!(
            out.iter().all(|&v| (v - 0.37).abs() < 1e-5),
            "{:?}",
            &out[..4]
        );
    }

    #[test]
    fn test_mode_tie_keeps_own() {
        let labels = [1u32, 2, 3, 2, 1, 3, 3, 1, 2];
        let out = mode_filter(&labels, 3, 3, 1, None, 4, None);
        assert_eq!(out[4], 1);
    }

    #[test]
    fn test_gaussian_keeps_mean() {
        let p = lcg(7, 32 * 32);
        let q = crate::edges::field::blur(&p, 32, 32, 2.0);
        let mean = |v: &[f32]| v.iter().map(|&x| f64::from(x)).sum::<f64>() / v.len() as f64;
        assert!(
            (mean(&p) - mean(&q)).abs() < 1e-3,
            "{} {}",
            mean(&p),
            mean(&q)
        );
    }

    #[test]
    fn test_box_mean_border() {
        let p = vec![5.0f32; 9 * 7];
        let out = box_mean(&p, 9, 7, 2);
        assert!((out[0] - 5.0).abs() < 1e-5 && (out[9 * 7 - 1] - 5.0).abs() < 1e-5);
    }

    #[test]
    fn test_percentile_is_the_ceil_rank() {
        let v = [5.0f32, 1.0, 3.0, 2.0, 4.0];
        assert_eq!(percentile(&v, 0.5), 3.0);
        assert_eq!(percentile(&v, 0.0), 1.0);
        assert_eq!(percentile(&v, 1.0), 5.0);
    }
}
