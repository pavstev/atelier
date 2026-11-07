//! The edge strength map of the Edges layer: the photo's luma blurred with a Gaussian, the Sobel
//! gradient magnitude of that, and the magnitude scaled by its 99th percentile to 0..1. One
//! channel of bytes, the size of the photo. `trace.rs` thins and traces it.

use crate::deblock;
use crate::edges::field::blur;
use crate::error::Result;
use crate::filters::{box_mean, percentile, sobel};
use crate::img::Rgb;

/// The Gaussian sigma in px at 1024 px of the long side. It scales with the photo.
const SIGMA: f32 = 2.0;
/// The share of pixels that reach full strength is the top `1 - PERCENTILE`.
const PERCENTILE: f64 = 0.99;
/// The least scale, as a share of the top, so a nearly flat map is not blown up.
const BINS: usize = 2048;

/// The least ratio of the scale to the median gradient of the picture. A picture of noise only
/// has a p99 of about 2.6 times its median (`NOISE_RATIO` or less): it gets the floor of
/// `NOISE_FLOOR` times the median, so its p99 stays under every start gate. A real photo spreads
/// at least 4.3 times (`PHOTO_RATIO` or more): it gets `NOISE_SPREAD`, which never fires, so a
/// busy photo keeps its black contours. A ramp between.
const NOISE_SPREAD: f32 = 4.0;
const NOISE_FLOOR: f32 = 15.0;
const NOISE_RATIO: f32 = 3.0;
const PHOTO_RATIO: f32 = 4.0;
/// The coarse gradient scale is this many times the fine sigma.
const COARSE_K: f32 = 5.0;
/// The gradient (luma per px at the coarse scale, Sobel units) that counts as a full edge on a
/// calm ground.
const COARSE_FULL: f32 = 7.0;
/// How much a busy neighborhood (its mean coarse gradient, times this) weakens a soft edge.
const COARSE_BUSY: f32 = 1.0;
/// The most a soft edge adds to the map.
const COARSE_CAP: f32 = 0.5;
/// The mean fine strength around a pixel, times this, switches the coarse strength off.
const COARSE_NEAR: f32 = 4.0;
/// The radius of that neighborhood in coarse sigmas.
const COARSE_AREA: f32 = 2.0;

/// The soft edge strength 0..1 of every pixel: the Sobel gradient of the luma at `COARSE_K` times
/// the fine sigma, divided by a fixed full edge plus the mean gradient around it. A soft edge on a
/// calm ground stands out; the same gradient in a busy area (texture) does not.
fn coarse_strength(luma: &[f32], fine: &[f32], w: usize, h: usize, sigma: f32) -> Vec<f32> {
    let s = sigma * COARSE_K;
    let g = blur(luma, w, h, s);
    let (gx, gy) = sobel(&g, w, h);
    let mag: Vec<f32> = gx.iter().zip(&gy).map(|(&x, &y)| x.hypot(y)).collect();
    let r = (s * COARSE_AREA).round().max(1.0) as usize;
    let busy = box_mean(&mag, w, h, r);
    // near a clear fine edge the coarse ridge is only a wide shadow of it: leave it out
    let near = box_mean(fine, w, h, r);
    mag.iter()
        .zip(&busy)
        .zip(&near)
        .map(|((&m, &b), &n)| {
            let c = (m / (COARSE_FULL + COARSE_BUSY * b)).min(COARSE_CAP);
            c * (1.0 - (n * COARSE_NEAR).min(1.0))
        })
        .collect()
}

/// The least ratio of the scale to the median for a map with this p99 and median: `NOISE_FLOOR`
/// for the narrow spread of noise, `NOISE_SPREAD` for a photo, a ramp between.
fn noise_spread(p99: f32, median: f32) -> f32 {
    if median <= 0.0 {
        return NOISE_SPREAD;
    }
    let t = ((p99 / median - NOISE_RATIO) / (PHOTO_RATIO - NOISE_RATIO)).clamp(0.0, 1.0);
    NOISE_FLOOR + (NOISE_SPREAD - NOISE_FLOOR) * t
}

/// Edge strength 0..255 of every pixel of an RGB image.
///
/// # Errors
/// [`crate::error::Error::BadInput`] for an image that is not a prepared RGB work image.
pub(crate) fn strength(work: &Rgb) -> Result<Rgb> {
    work.require_work()?;
    // block noise would fill Lines with short wiggles along the 8 px grid
    let calmed = deblock::calm(work);
    let work: &Rgb = &calmed;
    let (w, h) = (work.width, work.height);
    let luma: Vec<f32> = work
        .data
        .chunks_exact(3)
        .map(|p| 0.299 * f32::from(p[0]) + 0.587 * f32::from(p[1]) + 0.114 * f32::from(p[2]))
        .collect();
    let sigma = SIGMA * w.max(h) as f32 / 1024.0;
    let g = blur(&luma, w, h, sigma.max(0.5));
    let (gx, gy) = sobel(&g, w, h);
    let mag: Vec<f32> = gx.iter().zip(&gy).map(|(&x, &y)| x.hypot(y)).collect();
    let top = mag.iter().copied().fold(0.0_f32, f32::max);
    let mut out = Rgb::new(w, h, 1);
    if top <= 0.0 {
        return Ok(out);
    }
    // a picture of noise only has a narrow spread: its p99 is a few times its median. A real
    // photo spreads wider, so the scale never drops under a small multiple of the median. A busy
    // texture lifts the median but keeps its strong edges at full strength.
    let (p99, median) = (percentile(&mag, PERCENTILE), percentile(&mag, 0.5));
    let scale = p99
        .max(noise_spread(p99, median) * median)
        .max(top / BINS as f32);
    // the coarse scale finds the soft edges that the fine scale drowns in grain
    let fine: Vec<f32> = mag.iter().map(|&m| (m / scale).min(1.0)).collect();
    let coarse = coarse_strength(&luma, &fine, w, h, sigma.max(0.5));
    for ((o, &f), &c) in out.data.iter_mut().zip(&fine).zip(&coarse) {
        *o = (f.max(c) * 255.0).round().clamp(0.0, 255.0) as u8;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_a_flat_photo_has_no_edges() {
        let flat = Rgb::filled(64, 48, &[120, 120, 120]);
        let map = strength(&flat).unwrap();
        assert_eq!((map.width, map.height, map.channels), (64, 48, 1));
        assert!(map.data.iter().all(|&v| v == 0));
    }

    #[test]
    fn test_a_step_edge_is_strongest_on_the_step() {
        let mut img = Rgb::filled(64, 64, &[20, 20, 20]);
        for y in 0..64 {
            for x in 32..64 {
                img.data[(y * 64 + x) * 3..(y * 64 + x) * 3 + 3].copy_from_slice(&[230, 230, 230]);
            }
        }
        let map = strength(&img).unwrap();
        let at = |x: usize, y: usize| map.data[y * 64 + x];
        assert_eq!(at(31, 32), 255);
        assert!(at(8, 32) < 10 && at(56, 32) < 10);
    }

    #[test]
    fn test_a_busy_texture_keeps_its_strong_step_at_full_strength() {
        // fine stripes everywhere (a fruit stall, a church door) and one big step of light
        let (w, h) = (128, 64);
        let mut img = Rgb::filled(w, h, &[0, 0, 0]);
        for y in 0..h {
            for x in 0..w {
                let base = if x < 64 { 40.0 } else { 200.0 };
                let v = base + 25.0 * libm::sinf(y as f32 * std::f32::consts::TAU / 7.0);
                let v = v.round() as u8;
                img.data[(y * w + x) * 3..(y * w + x) * 3 + 3].copy_from_slice(&[v, v, v]);
            }
        }
        let map = strength(&img).unwrap();
        let peak = (60..68).map(|x| map.data[32 * w + x]).max().unwrap();
        assert!(peak >= 250, "the step is at {peak}");
    }
}
