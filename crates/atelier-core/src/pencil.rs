//! The Pencil view: a photo as a study for graphite pencils, one grade per zone.
//!
//! The photo is smoothed as Values does it (shadow lift, median, guided filter), stretched to the
//! range graphite can reach on paper, and cut into zones. Each zone is one pencil of the set the
//! caller owns, and the lightest zone is bare paper. The zone map is cleaned like Values (mode
//! filter, small shapes merged), so a pencil is never asked to draw a speck.
//!
//! The steps:
//!
//! 1. The set is the pencils in `mask` (bit 0 is the darkest, see [`TONES`]) and the paper.
//! 2. The smoothed L* of the photo is stretched so its 1st percentile is the darkest pencil of
//!    the set and its 99th percentile is paper. The cuts sit half way between two tones. They are
//!    a blend of the plain stretch and of equal shares of pixels ([`SPREAD`]), so a middle grade
//!    is used as much as a soft one.
//! 3. Map view: each zone is flat, at the tone of its pencil. Drawing view: the same zones with a
//!    graphite grain and a light hatching on paper, mean zero, so each zone keeps its tone.
//!
//! The same input gives the same bytes: no randomness (the grain is a hash of the position), no
//! clock.

use crate::error::{Error, Result};
use crate::filters::percentile;
use crate::img::Rgb;
use crate::oklab;
use crate::values::{labels_with, ok_l};

/// The pencils the view knows, darkest first: 9B, 7B, 5B, 2B, HB, H, 3H, 4H. Each is the CIE L*
/// of a firm, even layer of that grade on white paper. Hard grades stay light, a 9B nears the
/// darkest graphite makes (about L* 17, because of its sheen).
pub const TONES: [f32; 8] = [17.0, 26.0, 37.0, 49.0, 60.0, 70.0, 78.0, 86.0];
/// How many pencils there are.
pub const GRADES: u32 = TONES.len() as u32;
/// The L* of bare paper.
const PAPER: f32 = 95.0;
/// How far the cuts lean to equal shares of pixels (0 the plain stretch, 1 equal shares).
const SPREAD: f32 = 0.35;
/// The percentiles of the smoothed L* that become the darkest tone and paper.
const LOW_Q: f64 = 0.01;
const HIGH_Q: f64 = 0.99;
/// The narrowest L* range a photo is stretched from. A flatter photo is centered on its own mean.
const MIN_RANGE: f32 = 12.0;
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

/// The graphite color of CIE lightness `l`: a gray with a slight cool cast. Paper is warm.
fn graphite(l: f32) -> [u8; 3] {
    oklab::to_srgb([ok_l(l), -0.001, -0.005])
}

/// The paper color: a warm white.
fn paper_color() -> [u8; 3] {
    oklab::to_srgb([ok_l(PAPER), 0.0, 0.006])
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

/// The L* swing of the drawing at a pixel of a pencil zone: fine tooth plus hatching. The hatch
/// leans the other way in every second zone, so a dark area reads as cross-hatched.
fn swing(x: usize, y: usize, zone: u8, period: f32) -> f32 {
    let (sx, sy) = if zone.is_multiple_of(2) {
        (1.0, 1.0)
    } else {
        (1.0, -1.0)
    };
    let t = (x as f32 * sx + y as f32 * sy) / (period * std::f32::consts::SQRT_2);
    GRAIN * ((1.0 - HATCH_WEIGHT) * hash(x, y) + HATCH_WEIGHT * triangle(t))
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

/// The cuts between the levels, in the L* of the smoothed photo. They blend the plain stretch
/// ([`LOW_Q`] to [`HIGH_Q`] of the photo onto the range of the set) with equal shares of pixels.
fn cuts(smooth: &[f32], tones: &[f32]) -> Vec<f32> {
    let mut lo = percentile(smooth, LOW_Q);
    let mut hi = percentile(smooth, HIGH_Q);
    if hi - lo < MIN_RANGE {
        let mid = f32::midpoint(hi, lo);
        lo = mid - MIN_RANGE / 2.0;
        hi = mid + MIN_RANGE / 2.0;
    }
    let (first, last) = (tones[0], tones[tones.len() - 1]);
    let n = tones.len();
    let mut prev = f32::MIN;
    (0..n - 1)
        .map(|i| {
            let mid = f32::midpoint(tones[i], tones[i + 1]);
            let stretch = lo + (mid - first) / (last - first) * (hi - lo);
            let equal = percentile(smooth, (i + 1) as f64 / n as f64);
            let cut = ((1.0 - SPREAD) * stretch + SPREAD * equal).max(prev);
            prev = cut;
            cut
        })
        .collect()
}

/// The Pencil view of `work`. `mask` has one bit per pencil in [`TONES`] order (bit 0 is the
/// 9B, bit 7 the 4H), at least one set. `detail` is 0 to 1, as in Values: the smallest zone that
/// survives. `drawing` false gives the flat map; true gives the grain and hatching on paper.
///
/// # Errors
/// `BadInput` for a `mask` that is 0 or has a bit over the pencils, a `detail` outside 0 to 1,
/// or an image that is not RGB or is empty.
pub fn view(work: &Rgb, mask: u32, detail: f32, drawing: bool) -> Result<Pencil> {
    let tones = levels(mask)?;
    let mut labels = labels_with(work, detail, |smooth| cuts(smooth, &tones))?;
    let (w, h) = (work.width, work.height);
    let n = tones.len();
    let mut seen = vec![0usize; n];
    for &z in &labels {
        seen[usize::from(z).min(n - 1)] += 1;
    }
    let moves = accent_moves(&seen, &tones, labels.len());
    for z in &mut labels {
        *z = moves[usize::from(*z).min(n - 1)] as u8;
    }
    let flat: Vec<[u8; 3]> = tones
        .iter()
        .enumerate()
        .map(|(i, &l)| {
            if i == n - 1 {
                paper_color()
            } else {
                graphite(l)
            }
        })
        .collect();
    let period = HATCH_PERIOD * (w.max(h) as f32 / 1024.0).max(1.0);
    let mut image = Rgb::new(w, h, 3);
    let mut count = vec![0usize; n];
    for (i, (px, &z)) in image.data.chunks_exact_mut(3).zip(&labels).enumerate() {
        let zone = usize::from(z).min(n - 1);
        count[zone] += 1;
        if !drawing {
            px.copy_from_slice(&flat[zone]);
            continue;
        }
        let (x, y) = (i % w, i / w);
        let l = if zone == n - 1 {
            PAPER + TOOTH * hash(x, y)
        } else {
            tones[zone] + swing(x, y, z, period)
        };
        px.copy_from_slice(&if zone == n - 1 {
            oklab::to_srgb([ok_l(l), 0.0, 0.006])
        } else {
            graphite(l)
        });
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

    /// A ramp from black to white, left to right.
    fn ramp(w: usize, h: usize) -> Rgb {
        let mut img = Rgb::new(w, h, 3);
        for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
            let v = ((i % w) * 255 / (w - 1)) as u8;
            px.copy_from_slice(&[v, v, v]);
        }
        img
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
        let p = view(&ramp(256, 64), 255, 0.0, false).unwrap();
        assert_eq!(p.tones.len(), 9);
        assert!(p.shares.iter().all(|&s| s > 0), "{:?}", p.shares);
        // the left edge is the darkest pencil, the right edge is paper
        assert_eq!(p.image.pixel(0, 0), p.tones[0]);
        assert_eq!(p.image.pixel(255, 0), p.tones[8]);
        // the tones get lighter
        assert!(p.tones.windows(2).all(|t| t[0][0] < t[1][0]));
    }

    #[test]
    fn test_a_dropped_pencil_is_never_drawn() {
        // no 5B, no 7B: bits 1 and 2 off
        let p = view(&ramp(256, 64), 0b1111_1001, 0.0, false).unwrap();
        assert_eq!(p.tones.len(), 7);
        let mut seen: Vec<[u8; 3]> = p
            .image
            .data
            .chunks_exact(3)
            .map(|c| [c[0], c[1], c[2]])
            .collect();
        seen.sort_unstable();
        seen.dedup();
        assert!(seen.iter().all(|c| p.tones.contains(c)));
    }

    #[test]
    fn test_drawing_zones_keep_their_tone() {
        let w = ramp(256, 128);
        let map = view(&w, 255, 0.0, false).unwrap();
        let art = view(&w, 255, 0.0, true).unwrap();
        assert_eq!(map.tones, art.tones);
        assert_ne!(map.image, art.image);
        // each zone's mean in the drawing is within 1.5 L* units (about 3 byte levels) of its tone
        let mut sum = [(0f64, 0usize); 9];
        for (m, a) in map
            .image
            .data
            .chunks_exact(3)
            .zip(art.image.data.chunks_exact(3))
        {
            let z = map.tones.iter().position(|t| t == m).unwrap();
            sum[z].0 += f64::from(a[1]);
            sum[z].1 += 1;
        }
        for (z, (s, n)) in sum.iter().enumerate() {
            let mean = s / *n as f64;
            let tone = f64::from(map.tones[z][1]);
            assert!(
                (mean - tone).abs() < 3.0,
                "zone {z}: mean {mean} tone {tone}"
            );
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
        let p = view(&img, 255, 0.0, false).unwrap();
        assert_eq!(p.shares[0], 0, "{:?}", p.shares);
        assert_eq!(p.shares[1], 0, "{:?}", p.shares);
        assert!(p.shares[2] >= 60, "{:?}", p.shares);
        // a lone 9B on paper keeps its zone: paper never takes the dark mass
        let q = view(&img, 1, 0.0, false).unwrap();
        assert!(q.shares[0] >= 60, "{:?}", q.shares);
    }

    #[test]
    fn test_same_input_same_bytes() {
        let w = ramp(64, 64);
        assert_eq!(view(&w, 255, 0.5, true), view(&w, 255, 0.5, true));
    }

    #[test]
    fn test_bad_numbers_are_bad_input() {
        let w = ramp(32, 32);
        assert!(view(&w, 0, 0.5, false).is_err());
        assert!(view(&w, 256, 0.5, false).is_err());
        assert!(view(&w, 255, 1.5, false).is_err());
        assert!(view(&Rgb::new(0, 0, 3), 255, 0.5, false).is_err());
    }

    #[test]
    fn test_a_flat_photo_does_not_panic() {
        let p = view(&Rgb::filled(32, 32, &[120, 120, 120]), 255, 0.5, true).unwrap();
        assert!(p.shares.iter().map(|&s| u32::from(s)).sum::<u32>() >= 100);
    }
}
