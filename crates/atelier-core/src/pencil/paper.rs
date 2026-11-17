//! The paper tooth: a deterministic height field in 0 to 1 that graphite catches on, and the one
//! position hash of the Pencil view.

use super::ink::smoothstep;
use crate::error::{Error, Result};
use crate::filters::box_mean;
use crate::img::size_factor;

/// The octaves of the tooth: cell size as a multiple of the paper cell, and weight. The finest
/// octave is the grain; the coarser two give it a little clumping, as real paper has.
/// The grain of the three papers in px at a long side of 1024 (hot pressed, sketch, cold pressed),
/// found on real photos: a smooth sheet is fine and soft, a rough one big and harsh.
const CELL_SMOOTH: f32 = 0.9;
const CELL_MEDIUM: f32 = 1.3;
const CELL_ROUGH: f32 = 2.0;
const OCTAVES: [(f32, f32); 3] = [(1.0, 1.0), (1.8, 0.5), (3.2, 0.3)];
/// How much longer a cell is along the stroke direction than across it, so the grain reads as
/// pencil strokes and not as dots.
const STRETCH: f32 = 2.2;
/// The bins of the rank LUT: the tooth is spread evenly over 0 to 1 in this many steps.
const BINS: usize = 256;
/// The step that tells the lattice of one octave from the next in the hash, so the octaves do not
/// repeat each other.
const OCTAVE_SALT: i32 = 100_003;
/// The radius of the box that takes the clumping out of the tooth, in px at a long side of 1024.
/// Coverage then averages out in a small patch, as it does on a dither threshold.
const FLATTEN_RADIUS: f32 = 6.0;

/// How rough the paper is. The tooth of rougher paper is bigger.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Paper {
    /// Hot pressed: a fine, soft tooth.
    Smooth = 0,
    /// The default sketch paper.
    Medium = 1,
    /// Cold pressed or watercolor paper: a big, harsh tooth.
    Rough = 2,
}

impl Paper {
    /// The paper of this number (0 smooth, 1 medium, 2 rough).
    pub(crate) fn from_index(i: u8) -> Result<Self> {
        match i {
            0 => Ok(Self::Smooth),
            1 => Ok(Self::Medium),
            2 => Ok(Self::Rough),
            _ => Err(Error::bad("pencil paper must be 0 to 2")),
        }
    }

    /// The cell of the finest octave in px at a long side of 1024: the size of one grain.
    fn cell(self) -> f32 {
        match self {
            Self::Smooth => CELL_SMOOTH,
            Self::Medium => CELL_MEDIUM,
            Self::Rough => CELL_ROUGH,
        }
    }
}

/// The factor that scales px sizes tuned for a long side of 1024 to a bigger picture. A smaller
/// picture keeps the sizes, so a tiny test picture does not alias.
pub(crate) fn scale(w: usize, h: usize) -> f32 {
    size_factor(w, h)
}

/// A hash of two integers, from -1 to 1. Uniform, so its mean is zero. The only hash of the Pencil
/// view: a pixel, a lattice point or a stroke id.
pub(crate) fn hash(x: i32, y: i32) -> f32 {
    let mut h = (x as u32).wrapping_mul(0x9E37_79B1) ^ (y as u32).wrapping_mul(0x85EB_CA6B);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^= h >> 15;
    (h >> 8) as f32 / 8_388_607.5 - 1.0
}

/// One octave of value noise (-1 to 1) on a lattice turned by `angle` (`cos`, `sin`) whose cells
/// are `cell.0` px along the angle and `cell.1` px across it.
fn value_noise(w: usize, h: usize, (c, s): (f32, f32), cell: (f32, f32), salt: i32) -> Vec<f32> {
    let at = |x: f32, y: f32| ((x * c + y * s) / cell.0, (y * c - x * s) / cell.1);
    let corners = [
        at(0.0, 0.0),
        at(w as f32, 0.0),
        at(0.0, h as f32),
        at(w as f32, h as f32),
    ];
    let lo = |f: fn(&(f32, f32)) -> f32| corners.iter().map(f).fold(f32::INFINITY, f32::min);
    let (u0, v0) = (
        libm::floorf(lo(|p| p.0)) as i32,
        libm::floorf(lo(|p| p.1)) as i32,
    );
    let hi = |f: fn(&(f32, f32)) -> f32| corners.iter().map(f).fold(f32::NEG_INFINITY, f32::max);
    let (u1, v1) = (
        libm::ceilf(hi(|p| p.0)) as i32 + 1,
        libm::ceilf(hi(|p| p.1)) as i32 + 1,
    );
    let gw = (u1 - u0 + 1) as usize;
    let lattice: Vec<f32> = (v0..=v1)
        .flat_map(|j| (u0..=u1).map(move |i| hash(i.wrapping_add(salt), j)))
        .collect();
    let mut out = Vec::with_capacity(w * h);
    for y in 0..h {
        for x in 0..w {
            let (u, v) = at(x as f32, y as f32);
            let (fu, fv) = (libm::floorf(u), libm::floorf(v));
            let (tu, tv) = (smoothstep(0.0, 1.0, u - fu), smoothstep(0.0, 1.0, v - fv));
            let k = (fv as i32 - v0) as usize * gw + (fu as i32 - u0) as usize;
            let top = lattice[k] + (lattice[k + 1] - lattice[k]) * tu;
            let bottom = lattice[k + gw] + (lattice[k + gw + 1] - lattice[k + gw]) * tu;
            out.push(top + (bottom - top) * tv);
        }
    }
    out
}

/// `v` spread evenly over 0 to 1 by rank, through a [`BINS`] step LUT with a linear step inside
/// each bin. A flat `v` gives 0.5 everywhere.
fn rank(v: &[f32]) -> Vec<f32> {
    let lo = v.iter().copied().fold(f32::INFINITY, f32::min);
    let hi = v.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let span = hi - lo;
    if span <= f32::EPSILON {
        return vec![0.5; v.len()];
    }
    let pos = |x: f32| ((x - lo) / span * BINS as f32).clamp(0.0, BINS as f32 - 1e-3);
    let mut count = [0u32; BINS];
    for &x in v {
        count[pos(x) as usize] += 1;
    }
    let mut before = [0f32; BINS];
    let mut run = 0u32;
    for (b, &c) in before.iter_mut().zip(&count) {
        *b = run as f32;
        run += c;
    }
    let n = v.len() as f32;
    v.iter()
        .map(|&x| {
            let p = pos(x);
            let bin = p as usize;
            (before[bin] + (p - bin as f32) * count[bin] as f32) / n
        })
        .collect()
}

/// The paper tooth of a `w` by `h` picture: a height in 0 to 1 per pixel, spread evenly (a third
/// of the pixels are under 0.33). It is three octaves of hashed value noise, about 3 px across on
/// medium paper at a long side of 1024 (scaled with the long side), stretched along `angle_deg`
/// so it reads as pencil strokes. Rougher paper has a bigger grain.
pub(crate) fn tooth(w: usize, h: usize, paper: Paper, angle_deg: f32) -> Vec<f32> {
    let a = angle_deg.to_radians();
    let dir = (libm::cosf(a), libm::sinf(a));
    let cell = paper.cell() * scale(w, h);
    let mut raw = vec![0f32; w * h];
    for (k, &(mult, weight)) in OCTAVES.iter().enumerate() {
        let size = cell * mult;
        let noise = value_noise(w, h, dir, (size * STRETCH, size), k as i32 * OCTAVE_SALT);
        for (r, n) in raw.iter_mut().zip(&noise) {
            *r += weight * n;
        }
    }
    let radius = (FLATTEN_RADIUS * scale(w, h)) as usize;
    let base = box_mean(&raw, w, h, radius);
    for (r, b) in raw.iter_mut().zip(&base) {
        *r -= b;
    }
    rank(&raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The mean absolute step between neighbors `(dx, dy)` apart.
    fn step(t: &[f32], w: usize, h: usize, (dx, dy): (usize, usize)) -> f32 {
        let mut sum = 0.0;
        for y in 0..h - dy {
            for x in 0..w - dx {
                sum += (t[y * w + x] - t[(y + dy) * w + x + dx]).abs();
            }
        }
        sum / ((w - dx) * (h - dy)) as f32
    }

    #[test]
    fn test_hash_is_in_range_and_has_a_zero_mean() {
        let v: Vec<f32> = (0..4096).map(|i| hash(i % 64, i / 64)).collect();
        assert!(v.iter().all(|x| (-1.0..=1.0).contains(x)));
        assert!((v.iter().sum::<f32>() / 4096.0).abs() < 0.05);
        assert_ne!(hash(1, 2), hash(2, 1));
    }

    #[test]
    fn test_rank_spreads_evenly() {
        // a skewed spread of values: squares of an even run
        let v: Vec<f32> = (0..10_000).map(|i| (i as f32 / 10_000.0).powi(2)).collect();
        let r = rank(&v);
        for q in [0.25f32, 0.5, 0.9] {
            let share = r.iter().filter(|&&x| x < q).count() as f32 / r.len() as f32;
            assert!((share - q).abs() < 0.01, "{q}: {share}");
        }
        assert_eq!(rank(&[3.0; 5]), vec![0.5; 5]);
    }

    #[test]
    fn test_tooth_is_in_range_and_even() {
        let t = tooth(128, 96, Paper::Medium, 45.0);
        assert_eq!(t.len(), 128 * 96);
        assert!(t.iter().all(|x| (0.0..=1.0).contains(x)));
        for q in [0.2f32, 0.5, 0.8] {
            let share = t.iter().filter(|&&x| x < q).count() as f32 / t.len() as f32;
            assert!((share - q).abs() < 0.02, "{q}: {share}");
        }
    }

    #[test]
    fn test_tooth_is_the_same_every_time_and_follows_the_angle() {
        assert_eq!(
            tooth(64, 64, Paper::Rough, 30.0),
            tooth(64, 64, Paper::Rough, 30.0)
        );
        assert_ne!(
            tooth(64, 64, Paper::Rough, 30.0),
            tooth(64, 64, Paper::Rough, 120.0)
        );
    }

    #[test]
    fn test_tooth_is_stretched_along_the_angle() {
        let (w, h) = (160, 160);
        let along_x = tooth(w, h, Paper::Medium, 0.0);
        assert!(step(&along_x, w, h, (1, 0)) < step(&along_x, w, h, (0, 1)));
        let along_y = tooth(w, h, Paper::Medium, 90.0);
        assert!(step(&along_y, w, h, (0, 1)) < step(&along_y, w, h, (1, 0)));
    }

    #[test]
    fn test_rougher_paper_has_a_bigger_grain() {
        let (w, h) = (160, 160);
        let smooth = step(&tooth(w, h, Paper::Smooth, 0.0), w, h, (0, 1));
        let rough = step(&tooth(w, h, Paper::Rough, 0.0), w, h, (0, 1));
        assert!(rough < smooth, "{rough} {smooth}");
    }

    #[test]
    fn test_scale_follows_the_long_side_and_never_shrinks() {
        assert!((scale(2048, 100) - 2.0).abs() < 1e-6);
        assert!((scale(64, 64) - 1.0).abs() < 1e-6);
    }
}
