//! The Pencil view: a photo as a study for graphite pencils.
//!
//! The main look is the photo as a gray picture, a little simplified, in the tones graphite can
//! make on paper. The same picture says which pencil each tone is: the legend names one pencil per
//! tone of the set, and the lightest tone is bare paper.
//!
//! The steps:
//!
//! 1. The set is the pencils in `mask` (bit 0 is the darkest, see [`TONES`]) and the paper.
//! 2. The photo is read as Values reads it: L* after a shadow lift, a median and a guided filter
//!    (the simplified photo), and after a 3x3 median (the fine detail). `detail` mixes the two.
//! 3. A tone curve maps the photo lightness onto the pencils. The 1st percentile of the photo
//!    becomes the darkest pencil of the set and its 99th becomes paper. A middle grade is used as
//!    much as a soft one, because the curve leans a little toward equal shares of pixels
//!    ([`TONE_SPREAD`]).
//!    The curve passes through each pencil's tone at the middle of its zone, so a spot of that
//!    tone is exactly that pencil.
//! 4. Looks: Tone is the curve's picture. Drawing is the same picture with graphite grain and
//!    hatching, mean zero, so the tones hold. Zones is the old flat map: one flat tone per pencil,
//!    cut where the pencils change, small shapes merged as in Values.
//! 5. Accent rule: the 9B and the 7B are for the deepest accents. When they would cover over
//!    [`ACCENT_SHARE`] of the picture, no tone goes below the next pencil.
//!
//! The same input gives the same bytes: no randomness (the grain is a hash of the position), no
//! clock.

use crate::error::{Error, Result};
use crate::filters::percentile;
use crate::img::Rgb;
use crate::oklab;
use crate::values::{fields_with, ok_l};

/// The pencils the view knows, darkest first: 9B, 7B, 5B, 2B, HB, H, 3H, 4H. Each is the CIE L*
/// of a firm, even layer of that grade on white paper. Hard grades stay light, a 9B nears the
/// darkest graphite makes (about L* 17, because of its sheen).
pub const TONES: [f32; 8] = [17.0, 26.0, 37.0, 49.0, 60.0, 70.0, 78.0, 86.0];
/// How many pencils there are.
pub const GRADES: u32 = TONES.len() as u32;
/// The L* of bare paper.
const PAPER: f32 = 95.0;
/// How far the cuts of the Zones look lean to equal shares of pixels (0 the plain stretch, 1
/// equal shares), so a middle grade is used as much as a soft one.
const SPREAD: f32 = 0.35;
/// The same lean for the tone curve of Tone and Drawing. It stays small, so the picture follows
/// the photo: a bimodal photo (a light face on a dark ground) keeps the shading of its face.
const TONE_SPREAD: f32 = 0.10;
/// The percentiles of the smoothed L* that become the darkest tone and paper.
const LOW_Q: f64 = 0.01;
const HIGH_Q: f64 = 0.99;
/// The narrowest L* range a photo is stretched from. A flatter photo is centered on its own mean.
const MIN_RANGE: f32 = 12.0;
/// How much of the fine detail the picture keeps at `detail` 0 (the rest is the simplified
/// photo). At `detail` 1 all of it stays.
const RETAIN_MIN: f32 = 0.25;
/// The grain of a pencil zone, as the half height of its swing in L*. It averages out in a
/// patch, so the tone of a zone is the mean of its pixels.
const GRAIN: f32 = 4.5;
/// The weight of the hatching in the grain; the rest is the fine tooth.
const HATCH_WEIGHT: f32 = 0.45;
/// The paper tooth, as the half swing in L*.
const TOOTH: f32 = 1.0;
/// The hatching period at a long side of 1024 px.
const HATCH_PERIOD: f32 = 5.0;

/// The Pencil view: its picture and its levels, darkest first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pencil {
    /// The picture, RGB.
    pub image: Rgb,
    /// The color of each level in the picture (the pencils of the set, then paper), darkest first.
    pub tones: Vec<[u8; 3]>,
    /// The share of the picture each level covers, in percent. A level that covers any pixel
    /// shows at least 1.
    pub shares: Vec<u8>,
}

/// The color of CIE lightness `l` on the paper: a gray with a slight cool cast for graphite that
/// turns warm toward the paper white, so the paper (L* 95) is a warm white.
fn tint(l: f32) -> [u8; 3] {
    let t = ((l - 70.0) / (PAPER - 70.0)).clamp(0.0, 1.0);
    oklab::to_srgb([ok_l(l), -0.001 + 0.001 * t, -0.005 + 0.011 * t])
}

/// A hash of a pixel position, from -1 to 1. Uniform, so its mean is zero.
fn hash(x: usize, y: usize) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x9E37_79B1) ^ (y as u32).wrapping_mul(0x85EB_CA6B);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^= h >> 15;
    (h >> 8) as f32 / 8_388_607.5 - 1.0
}

/// A triangle wave of period 1, from -1 to 1, mean zero.
fn triangle(t: f32) -> f32 {
    let f = t - libm::floorf(t);
    4.0 * (f - 0.5).abs() - 1.0
}

/// The L* swing of the drawing at a pixel of tone `l`: fine tooth plus hatching. Light areas keep
/// only the paper tooth. Darker areas get the full grain and, below the middle, a second hatch the
/// other way, so a dark area reads as cross-hatched.
fn swing(x: usize, y: usize, l: f32, period: f32) -> f32 {
    let dark = ((PAPER - l) / (PAPER - 60.0)).clamp(0.0, 1.0);
    let amp = TOOTH + (GRAIN - TOOTH) * dark;
    let cross = ((dark - 0.45) / 0.4).clamp(0.0, 1.0) * 0.5;
    let u = period * std::f32::consts::SQRT_2;
    let h1 = triangle((x as f32 + y as f32) / u);
    let h2 = triangle((x as f32 - y as f32) / u);
    let hatch = h1 * (1.0 - cross) + h2 * cross;
    amp * ((1.0 - HATCH_WEIGHT) * hash(x, y) + HATCH_WEIGHT * hatch)
}

/// The pencils under this tone (L*) are accent pencils: the 9B and the 7B. They mark the deepest
/// accents and soft grain, not big areas.
const ACCENT_BELOW: f32 = 30.0;
/// The most of the picture an accent pencil may cover. A bigger dark mass is drawn one pencil
/// lighter (a black backdrop is layered in a 5B), as long as a pencil is there to take it.
const ACCENT_SHARE: f64 = 0.20;

/// The zone each zone is drawn in: itself, or the next lighter pencil when an accent pencil
/// (with the zones that moved up to it) would cover over [`ACCENT_SHARE`] of the picture. Paper
/// never takes a dark mass.
fn accent_moves(count: &[usize], tones: &[f32], total: usize) -> Vec<usize> {
    let n = tones.len();
    let cap = (ACCENT_SHARE * total as f64) as usize;
    let mut carried = 0;
    let mut to: Vec<usize> = (0..n)
        .map(|i| {
            let here = count[i] + carried;
            if tones[i] < ACCENT_BELOW && here > cap && i + 2 < n {
                carried = here;
                i + 1
            } else {
                carried = 0;
                i
            }
        })
        .collect();
    // follow a move on to where it stops
    for i in (0..n).rev() {
        if to[i] != i {
            to[i] = to[to[i]];
        }
    }
    to
}

/// The pencils of `mask`, darkest first, as their tones; paper is added last.
fn levels(mask: u32) -> Result<Vec<f32>> {
    if mask == 0 || mask >= 1 << GRADES {
        return Err(Error::bad(format!(
            "pencil set must be 1 to {} (one bit per pencil)",
            (1u32 << GRADES) - 1
        )));
    }
    let mut out: Vec<f32> = TONES
        .iter()
        .enumerate()
        .filter(|(i, _)| mask >> i & 1 == 1)
        .map(|(_, &t)| t)
        .collect();
    out.push(PAPER);
    Ok(out)
}

/// The photo lightness that becomes the darkest pencil and paper: the [`LOW_Q`] and [`HIGH_Q`]
/// percentiles of `smooth`, at least [`MIN_RANGE`] apart.
fn range(smooth: &[f32]) -> (f32, f32) {
    let lo = percentile(smooth, LOW_Q);
    let hi = percentile(smooth, HIGH_Q);
    if hi - lo < MIN_RANGE {
        let mid = f32::midpoint(hi, lo);
        (mid - MIN_RANGE / 2.0, mid + MIN_RANGE / 2.0)
    } else {
        (lo, hi)
    }
}

/// The cuts between the levels, in the L* of the smoothed photo. They blend the plain stretch
/// (the [`range`] of the photo onto the range of the set) with equal shares of pixels.
fn cuts(smooth: &[f32], tones: &[f32], spread: f32) -> Vec<f32> {
    let (lo, hi) = range(smooth);
    let (first, last) = (tones[0], tones[tones.len() - 1]);
    let n = tones.len();
    let mut prev = f32::MIN;
    (0..n - 1)
        .map(|i| {
            let mid = f32::midpoint(tones[i], tones[i + 1]);
            let stretch = lo + (mid - first) / (last - first) * (hi - lo);
            let equal = percentile(smooth, (i + 1) as f64 / n as f64);
            let cut = ((1.0 - spread) * stretch + spread * equal).max(prev);
            prev = cut;
            cut
        })
        .collect()
}

/// The photo lightness at the middle of each zone, rising: the points of the tone curve that map
/// to the tones of the levels. `lo` and `hi` are the ends of the photo's [`range`].
fn anchors(lo: f32, hi: f32, cuts: &[f32]) -> Vec<f32> {
    let edges: Vec<f32> = std::iter::once(lo)
        .chain(cuts.iter().copied())
        .chain(std::iter::once(hi))
        .collect();
    let mut prev = f32::MIN;
    edges
        .windows(2)
        .map(|e| {
            let at = f32::midpoint(e[0], e[1]).max(prev + 0.001);
            prev = at;
            at
        })
        .collect()
}

/// The tone of the photo lightness `v`: straight lines between the `anchors`, flat outside them.
fn curve(v: f32, anchors: &[f32], tones: &[f32]) -> f32 {
    let n = anchors.len();
    if v <= anchors[0] {
        return tones[0];
    }
    if v >= anchors[n - 1] {
        return tones[n - 1];
    }
    let k = anchors.partition_point(|&a| a <= v);
    let t = (v - anchors[k - 1]) / (anchors[k] - anchors[k - 1]);
    tones[k - 1] + t * (tones[k] - tones[k - 1])
}

/// The Pencil view of `work`. `mask` has one bit per pencil in [`TONES`] order (bit 0 is the
/// 9B, bit 7 the 4H), at least one set. `detail` is 0 to 1: how much fine detail the picture
/// keeps (0 the simplified photo plus a quarter of the fine detail, 1 all of it), and, for
/// Zones, the smallest zone that survives as in Values. `look` is 0 Tone (the smooth gray
/// picture), 1 Drawing (Tone with grain and hatching) or 2 Zones (flat tones, one per pencil).
///
/// # Errors
/// `BadInput` for a `mask` that is 0 or has a bit over the pencils, a `look` over 2, a `detail`
/// outside 0 to 1, or an image that is not RGB or is empty.
pub fn view(work: &Rgb, mask: u32, detail: f32, look: u8) -> Result<Pencil> {
    if look > 2 {
        return Err(Error::bad("pencil look must be 0 to 2"));
    }
    let tones = levels(mask)?;
    let f = fields_with(work, detail, |smooth| cuts(smooth, &tones, SPREAD))?;
    let (w, h) = (work.width, work.height);
    let n = tones.len();
    let flat: Vec<[u8; 3]> = tones.iter().map(|&l| tint(l)).collect();
    let mut image = Rgb::new(w, h, 3);
    let mut count = vec![0usize; n];
    if look == 2 {
        let mut seen = vec![0usize; n];
        for &z in &f.labels {
            seen[usize::from(z).min(n - 1)] += 1;
        }
        let moves = accent_moves(&seen, &tones, f.labels.len());
        for (px, &z) in image.data.chunks_exact_mut(3).zip(&f.labels) {
            let zone = moves[usize::from(z).min(n - 1)];
            count[zone] += 1;
            px.copy_from_slice(&flat[zone]);
        }
    } else {
        let (lo, hi) = range(&f.smooth);
        let at = anchors(lo, hi, &cuts(&f.smooth, &tones, TONE_SPREAD));
        let retain = RETAIN_MIN + (1.0 - RETAIN_MIN) * detail;
        let mids: Vec<f32> = tones
            .windows(2)
            .map(|t| f32::midpoint(t[0], t[1]))
            .collect();
        let level = |l: f32| mids.partition_point(|&m| m <= l);
        let mut tone: Vec<f32> = (0..w * h)
            .map(|i| {
                curve(
                    f.smooth[i] + retain * (f.fine[i] - f.smooth[i]),
                    &at,
                    &tones,
                )
            })
            .collect();
        // no tone is darker than the pencil an over-big accent mass moves up to
        let mut under = vec![0usize; n];
        for &l in &tone {
            under[level(l)] += 1;
        }
        let floor = tones[accent_moves(&under, &tones, tone.len())[0]];
        let period = HATCH_PERIOD * (w.max(h) as f32 / 1024.0).max(1.0);
        for (i, (px, l)) in image.data.chunks_exact_mut(3).zip(&mut tone).enumerate() {
            *l = l.max(floor);
            count[level(*l)] += 1;
            let shown = if look == 1 {
                *l + swing(i % w, i / w, *l, period)
            } else {
                *l
            };
            px.copy_from_slice(&tint(shown));
        }
    }
    let total = (w * h).max(1);
    let shares = count
        .iter()
        .map(|&c| match c {
            0 => 0,
            c => ((c * 100 + total / 2) / total).clamp(1, 100) as u8,
        })
        .collect();
    Ok(Pencil {
        image,
        tones: flat,
        shares,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const TONE: u8 = 0;
    const DRAWING: u8 = 1;
    const ZONES: u8 = 2;

    /// A ramp from black to white, left to right.
    fn ramp(w: usize, h: usize) -> Rgb {
        let mut img = Rgb::new(w, h, 3);
        for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
            let v = ((i % w) * 255 / (w - 1)) as u8;
            px.copy_from_slice(&[v, v, v]);
        }
        img
    }

    /// The distinct colors of a picture.
    fn colors(img: &Rgb) -> Vec<[u8; 3]> {
        let mut seen: Vec<[u8; 3]> = img
            .data
            .chunks_exact(3)
            .map(|c| [c[0], c[1], c[2]])
            .collect();
        seen.sort_unstable();
        seen.dedup();
        seen
    }

    #[test]
    fn test_levels_are_the_set_then_paper() {
        assert_eq!(levels(0b1111_1111).unwrap().len(), 9);
        assert_eq!(
            levels(0b0000_0101).unwrap(),
            vec![TONES[0], TONES[2], PAPER]
        );
        assert!(levels(0).is_err());
        assert!(levels(256).is_err());
    }

    #[test]
    fn test_a_ramp_uses_every_pencil_darkest_first() {
        for look in [TONE, ZONES] {
            let p = view(&ramp(256, 64), 255, 0.5, look).unwrap();
            assert_eq!(p.tones.len(), 9);
            assert!(
                p.shares.iter().all(|&s| s > 0),
                "look {look}: {:?}",
                p.shares
            );
            // the left edge is the darkest pencil, the right edge is paper
            assert_eq!(p.image.pixel(0, 0), p.tones[0]);
            assert_eq!(p.image.pixel(255, 0), p.tones[8]);
            assert!(p.tones.windows(2).all(|t| t[0][0] < t[1][0]));
        }
    }

    #[test]
    fn test_tone_is_a_smooth_gray_picture_and_zones_are_flat() {
        let w = ramp(256, 32);
        let tone = view(&w, 255, 0.5, TONE).unwrap();
        let zones = view(&w, 255, 0.5, ZONES).unwrap();
        assert_eq!(colors(&zones.image).len(), 9);
        assert!(
            colors(&tone.image).len() > 60,
            "{}",
            colors(&tone.image).len()
        );
        // the tone only gets lighter from left to right
        let row: Vec<u8> = (0..256).map(|x| tone.image.pixel(x, 0)[1]).collect();
        assert!(row.windows(2).all(|p| p[0] <= p[1]), "{row:?}");
    }

    #[test]
    fn test_a_dropped_pencil_is_never_drawn() {
        // no 5B, no 7B: bits 1 and 2 off
        let tone = view(&ramp(256, 64), 0b1111_1001, 0.5, TONE).unwrap();
        assert_eq!(tone.tones.len(), 7);
        // nothing is darker than the darkest pencil of the set (the 9B)
        let darkest = tone.tones[0][1];
        assert!(tone.image.data.chunks_exact(3).all(|c| c[1] >= darkest));
        let zones = view(&ramp(256, 64), 0b1111_1001, 0.5, ZONES).unwrap();
        assert!(colors(&zones.image).iter().all(|c| zones.tones.contains(c)));
    }

    #[test]
    fn test_drawing_keeps_the_tone_and_adds_grain() {
        let w = ramp(256, 128);
        let tone = view(&w, 255, 0.5, TONE).unwrap();
        let art = view(&w, 255, 0.5, DRAWING).unwrap();
        assert_eq!(tone.tones, art.tones);
        assert_eq!(tone.shares, art.shares);
        assert_ne!(tone.image, art.image);
        // in every column band the mean of the drawing is within 2 byte levels of the tone
        for band in 0..16 {
            let mean = |img: &Rgb| {
                let (mut s, mut n) = (0f64, 0f64);
                for y in 0..128 {
                    for x in band * 16..band * 16 + 16 {
                        s += f64::from(img.pixel(x, y)[1]);
                        n += 1.0;
                    }
                }
                s / n
            };
            let (t, a) = (mean(&tone.image), mean(&art.image));
            assert!((t - a).abs() < 3.0, "band {band}: tone {t} drawing {a}");
        }
    }

    #[test]
    fn test_a_big_dark_mass_is_not_an_accent_pencil() {
        // 70 percent black, 30 percent a light ramp: the black is drawn in the 5B, not the 9B or 7B
        let (w, h) = (100, 10);
        let mut img = Rgb::new(w, h, 3);
        for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
            let x = i % w;
            let v = if x < 70 { 4 } else { (60 + (x - 70) * 6) as u8 };
            px.copy_from_slice(&[v, v, v]);
        }
        for look in [TONE, ZONES] {
            let p = view(&img, 255, 0.5, look).unwrap();
            assert_eq!(p.shares[0], 0, "look {look}: {:?}", p.shares);
            assert_eq!(p.shares[1], 0, "look {look}: {:?}", p.shares);
            assert!(p.shares[2] >= 60, "look {look}: {:?}", p.shares);
        }
        // a lone 9B on paper keeps its zone: paper never takes the dark mass
        let q = view(&img, 1, 0.5, ZONES).unwrap();
        assert!(q.shares[0] >= 60, "{:?}", q.shares);
    }

    #[test]
    fn test_detail_keeps_more_of_the_fine_texture() {
        // a noisy mid-gray: more detail, more spread between neighbors
        let mut img = Rgb::new(64, 64, 3);
        for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
            let v = 110 + (hash(i % 64, i / 64) * 40.0) as u8;
            px.copy_from_slice(&[v, v, v]);
        }
        let spread = |d: f32| {
            let p = view(&img, 255, d, TONE).unwrap();
            let g: Vec<f64> = p
                .image
                .data
                .chunks_exact(3)
                .map(|c| f64::from(c[1]))
                .collect();
            let mean = g.iter().sum::<f64>() / g.len() as f64;
            g.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / g.len() as f64
        };
        assert!(spread(1.0) > spread(0.0), "{} {}", spread(1.0), spread(0.0));
    }

    #[test]
    fn test_same_input_same_bytes() {
        let w = ramp(64, 64);
        for look in [TONE, DRAWING, ZONES] {
            assert_eq!(view(&w, 255, 0.5, look), view(&w, 255, 0.5, look));
        }
    }

    #[test]
    fn test_bad_numbers_are_bad_input() {
        let w = ramp(32, 32);
        assert!(view(&w, 0, 0.5, TONE).is_err());
        assert!(view(&w, 256, 0.5, TONE).is_err());
        assert!(view(&w, 255, 1.5, TONE).is_err());
        assert!(view(&w, 255, 0.5, 3).is_err());
        assert!(view(&Rgb::new(0, 0, 3), 255, 0.5, TONE).is_err());
    }

    #[test]
    fn test_a_flat_photo_does_not_panic() {
        for look in [TONE, DRAWING, ZONES] {
            let p = view(&Rgb::filled(32, 32, &[120, 120, 120]), 255, 0.5, look).unwrap();
            assert!(p.shares.iter().map(|&s| u32::from(s)).sum::<u32>() >= 100);
        }
    }
}
