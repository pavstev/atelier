//! The Pencil view: a photo as a study for graphite pencils.
//!
//! The main look is the photo as a gray picture, a little simplified, in the tones graphite can
//! make on paper. The same picture says which pencil each tone is: the legend names one pencil per
//! tone of the set, and the lightest tone is bare paper.
//!
//! One small module per idea: `grades` (the levels), `tone` (the curve), `darks` (the accent
//! rule) and `drawing` (the grain).
//!
//! The steps:
//!
//! 1. The set is the pencils in `mask` (bit 0 is the darkest, see [`grades::TONES`]) and the paper.
//! 2. The photo is read as Values reads it: L* after a shadow lift, a median and a guided filter
//!    (the simplified photo), and after a 3x3 median (the fine detail). `detail` mixes the two.
//! 3. A tone curve maps the photo lightness onto the pencils. The 1st percentile of the photo
//!    becomes the darkest pencil of the set and its 99th becomes paper. A middle grade is used as
//!    much as a soft one, because the curve leans a little toward equal shares of pixels
//!    ([`tone::TONE_SPREAD`]).
//!    The curve passes through each pencil's tone at the middle of its zone, so a spot of that
//!    tone is exactly that pencil.
//! 4. Looks: Tone is the curve's picture. Drawing is the same picture with graphite grain and
//!    hatching, mean zero, so the tones hold. Zones is the old flat map: one flat tone per pencil,
//!    cut where the pencils change, small shapes merged as in Values.
//! 5. Accent rule: the 9B and the 7B are for the deepest accents. When they would cover over
//!    [`darks::ACCENT_SHARE`] of the picture, no tone goes below the next pencil.
//!
//! The same input gives the same bytes: no randomness (the grain is a hash of the position), no
//! clock.

mod darks;
mod drawing;
mod grades;
mod tone;

#[cfg(test)]
mod tests;

use crate::error::{Error, Result};
use crate::filters::Sorted;
use crate::img::Rgb;
use crate::values::{fields, zone_labels};
use darks::accent_moves;
use grades::{level_of, levels, mids, shares, tint};
use tone::{SPREAD, TONE_SPREAD, anchors, curve, cuts, range};

/// How much of the fine detail the picture keeps at `detail` 0 (the rest is the simplified
/// photo). At `detail` 1 all of it stays.
const RETAIN_MIN: f32 = 0.25;

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

/// The Pencil view of `work`. `mask` has one bit per pencil in [`grades::TONES`] order (bit 0 is
/// the 9B, bit 7 the 4H), at least one set. `detail` is 0 to 1: how much fine detail the picture
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
    let (w, h) = (work.width, work.height);
    let n = tones.len();
    let flat: Vec<[u8; 3]> = tones.iter().map(|&l| tint(l)).collect();
    let mut image = Rgb::new(w, h, 3);
    let mut count = vec![0usize; n];
    if look == 2 {
        let (_, labels) = zone_labels(work, detail, |smooth| {
            cuts(&Sorted::new(smooth), &tones, SPREAD)
        })?;
        let mut seen = vec![0usize; n];
        for &z in &labels {
            seen[usize::from(z).min(n - 1)] += 1;
        }
        let moves = accent_moves(&seen, &tones, labels.len());
        for (px, &z) in image.data.chunks_exact_mut(3).zip(&labels) {
            let zone = moves[usize::from(z).min(n - 1)];
            count[zone] += 1;
            px.copy_from_slice(&flat[zone]);
        }
    } else {
        let f = fields(work, detail)?;
        let sorted = Sorted::new(&f.smooth);
        let (lo, hi) = range(&sorted);
        let at = anchors(lo, hi, &cuts(&sorted, &tones, TONE_SPREAD));
        let retain = RETAIN_MIN + (1.0 - RETAIN_MIN) * detail;
        let mids = mids(&tones);
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
            under[level_of(&mids, l)] += 1;
        }
        let floor = tones[accent_moves(&under, &tones, tone.len())[0]];
        let period = drawing::period(w.max(h));
        for (i, (px, l)) in image.data.chunks_exact_mut(3).zip(&mut tone).enumerate() {
            *l = l.max(floor);
            count[level_of(&mids, *l)] += 1;
            let shown = if look == 1 {
                *l + drawing::swing(i % w, i / w, *l, period)
            } else {
                *l
            };
            px.copy_from_slice(&tint(shown));
        }
    }
    Ok(Pencil {
        image,
        tones: flat,
        shares: shares(&count, w * h),
    })
}
