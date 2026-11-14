//! The Pencil view: a photo as a study for graphite pencils.
//!
//! The main look is the photo as a gray picture, a little simplified, in the tones graphite can
//! make on paper. The same picture says which pencil each tone is: the legend names one pencil per
//! tone of the set, and the lightest tone is bare paper.
//!
//! One small module per idea: `grades` (the levels), `tone` (the curve, Key and Contrast), `local`
//! (Local contrast), `darks` (the accent rule, Deep darks) and `drawing` (the grain).
//!
//! The steps:
//!
//! 1. The set is the pencils in `mask` (bit 0 is the darkest, see [`grades::TONES`]) and the paper.
//! 2. The photo is read as Values reads it: L* after a shadow lift, a median and a guided filter
//!    (the simplified photo), and after a 3x3 median (the fine detail). `detail` mixes the two.
//! 3. A tone curve maps the photo lightness onto the pencils. The 1st percentile of the photo
//!    becomes the darkest pencil of the set and its white point (the 99th at the start, `highlights`)
//!    becomes paper. A middle grade is used as much as a soft one, because the curve leans a
//!    little toward equal shares of pixels ([`tone::TONE_SPREAD`]).
//!    The curve passes through each pencil's tone at the middle of its zone, so a spot of that
//!    tone is exactly that pencil. Before the curve, `local` boosts the detail of the photo (what is
//!    left after a smooth base is taken away), `key` lifts or drops the middle of the photo and
//!    `contrast` steepens or flattens it.
//! 4. Looks: Tone is the curve's picture. Drawing is the same picture with graphite grain and
//!    hatching, mean zero, so the tones hold; `grain` sets its strength. Hatch draws as Drawing
//!    until it has its own strokes. Zones is the old flat map: one flat tone per pencil, cut where
//!    the pencils change, small shapes merged as in Values.
//! 5. Accent rule: the 9B and the 7B are for the deepest accents. When they would cover over
//!    `darks` percent of the picture (20 at the start), no tone goes below the next pencil.
//!
//! Every knob at its start gives the picture the view drew before the knobs existed, to the byte:
//! a neutral knob skips its math. The same input gives the same bytes: no randomness (the grain is
//! a hash of the position), no clock.

mod darks;
mod drawing;
mod grades;
mod local;
mod tone;

#[cfg(test)]
mod tests;

use crate::error::{Error, Result};
use crate::filters::Sorted;
use crate::img::Rgb;
use crate::values::{fields, zone_labels};
use darks::accent_moves;
use grades::{level_of, levels, mids, shares, tint};
use tone::{SPREAD, ToneMap, cuts};

/// How much of the fine detail the picture keeps at `detail` 0 (the rest is the simplified
/// photo). At `detail` 1 all of it stays.
const RETAIN_MIN: f32 = 0.25;
/// The grain knob (0 to 1) at its start: the grain of Drawing as it was before the knob. The grain
/// is scaled by `grain / GRAIN_START`, so 0 draws none and 1 draws twice as much.
const GRAIN_START: f32 = 0.5;

/// Which picture a Pencil view draws.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Look {
    /// The smooth gray picture in the tones of the pencils (the start).
    Tone,
    /// Tone with graphite grain and hatching.
    Drawing,
    /// One flat tone per pencil.
    Zones,
    /// Tonal hatching.
    Hatch,
    /// The Tone picture with only the lightest pencils of the set drawn so far.
    ByPencil,
}

impl Look {
    /// The look of this number (0 Tone, 1 Drawing, 2 Zones, 3 Hatch, 4 By pencil).
    pub(crate) fn from_index(i: u8) -> Result<Self> {
        match i {
            0 => Ok(Self::Tone),
            1 => Ok(Self::Drawing),
            2 => Ok(Self::Zones),
            3 => Ok(Self::Hatch),
            4 => Ok(Self::ByPencil),
            _ => Err(Error::bad("pencil look must be 0 to 4")),
        }
    }
}

/// How rough the paper is: the size of its tooth.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Paper {
    /// Fine tooth.
    Smooth,
    /// Medium tooth (the start).
    Medium,
    /// Coarse tooth.
    Rough,
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
}

/// What a Pencil view takes. The ranges are checked by the caller (`render`); `Default` is the
/// start of every knob.
#[derive(Debug, Clone, PartialEq)]
#[allow(
    dead_code,
    reason = "paper, angle, density and step are read by later modules"
)]
pub(crate) struct Knobs {
    /// The picture to draw.
    pub look: Look,
    /// The pencils of the set, one bit each, bit 0 the 9B (1 to 255).
    pub mask: u32,
    /// How much fine detail stays, 0 to 1.
    pub detail: f32,
    /// Lifts or drops the middle of the photo, 0 to 1 (0.5 changes nothing).
    pub key: f32,
    /// Steepens or flattens the photo around its middle, 0 to 1 (0.5 changes nothing).
    pub contrast: f32,
    /// The percent of the photo at or over the white point, 0 to 25.
    pub highlights: u8,
    /// The most percent of the picture the accent pencils may cover, 0 to 100.
    pub darks: u8,
    /// The boost of the local contrast, 0 to 1 (0 off).
    pub local: f32,
    /// The strength of the grain of Drawing and Hatch, 0 to 1.
    pub grain: f32,
    /// The paper of Drawing and Hatch.
    pub paper: Paper,
    /// The stroke direction in degrees, 0 to 179.
    pub angle: u16,
    /// The line density of Hatch, 0 to 1.
    pub density: f32,
    /// The pencil of the By pencil view, 1 (the lightest) to 8.
    pub step: u8,
}

impl Default for Knobs {
    fn default() -> Self {
        Self {
            look: Look::Tone,
            mask: 255,
            detail: 0.5,
            key: tone::NEUTRAL,
            contrast: tone::NEUTRAL,
            highlights: 1,
            darks: 20,
            local: 0.0,
            grain: GRAIN_START,
            paper: Paper::Medium,
            angle: 45,
            density: 0.5,
            step: 1,
        }
    }
}

impl Knobs {
    /// The share of the photo under the white point: 0.99 at the start of Highlights.
    fn white_q(&self) -> f64 {
        f64::from(100u8.saturating_sub(self.highlights)) / 100.0
    }

    /// The share of the picture the accent pencils may cover: 0.2 at the start of Deep darks.
    fn accent_share(&self) -> f64 {
        f64::from(self.darks) / 100.0
    }
}

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
    /// The level of the pencil the picture is drawn up to, when the look shows one.
    pub mark: Option<u8>,
}

/// A picture and how many pixels each level covers.
type Painting = (Rgb, Vec<usize>);

/// The Pencil view of `work`. See [`Knobs`] for what it takes. `detail` also sets, for Zones, the
/// smallest zone that survives as in Values.
///
/// # Errors
/// `BadInput` for a `mask` that is 0 or has a bit over the pencils, a `detail` outside 0 to 1, or
/// an image that is not RGB or is empty.
pub(crate) fn view(work: &Rgb, k: &Knobs) -> Result<Pencil> {
    let tones = levels(k.mask)?;
    let flat: Vec<[u8; 3]> = tones.iter().map(|&l| tint(l)).collect();
    let (image, count) = match k.look {
        Look::Zones => zones(work, k, &tones, &flat)?,
        _ => tone_picture(work, k, &tones)?,
    };
    Ok(Pencil {
        image,
        tones: flat,
        shares: shares(&count, work.width * work.height),
        mark: None,
    })
}

/// The Zones look: one flat tone (the color `flat`) per pencil, the accent rule applied to the
/// zones.
fn zones(work: &Rgb, k: &Knobs, tones: &[f32], flat: &[[u8; 3]]) -> Result<Painting> {
    let n = tones.len();
    let high_q = k.white_q();
    let (_, labels) = zone_labels(work, k.detail, |smooth| {
        cuts(&Sorted::new(smooth), tones, SPREAD, high_q)
    })?;
    let mut seen = vec![0usize; n];
    for &z in &labels {
        seen[usize::from(z).min(n - 1)] += 1;
    }
    let moves = accent_moves(&seen, tones, labels.len(), k.accent_share());
    let mut image = Rgb::new(work.width, work.height, 3);
    let mut count = vec![0usize; n];
    for (px, &z) in image.data.chunks_exact_mut(3).zip(&labels) {
        let zone = moves[usize::from(z).min(n - 1)];
        count[zone] += 1;
        px.copy_from_slice(&flat[zone]);
    }
    Ok((image, count))
}

/// The photo lightness each pixel is drawn from: the simplified photo plus the share of the fine
/// detail that `detail` keeps.
fn lightness(smooth: &[f32], fine: &[f32], detail: f32) -> Vec<f32> {
    let retain = RETAIN_MIN + (1.0 - RETAIN_MIN) * detail;
    smooth
        .iter()
        .zip(fine)
        .map(|(&s, &f)| s + retain * (f - s))
        .collect()
}

/// The pictures that follow the photo's tones: Tone and, with grain, Drawing and Hatch.
fn tone_picture(work: &Rgb, k: &Knobs, tones: &[f32]) -> Result<Painting> {
    let (w, h) = (work.width, work.height);
    let f = fields(work, k.detail)?;
    let map = ToneMap::new(
        &Sorted::new(&f.smooth),
        tones,
        k.white_q(),
        k.key,
        k.contrast,
    );
    let mut v = lightness(&f.smooth, &f.fine, k.detail);
    if k.local > 0.0 {
        v = local::boost(&v, w, h, k.local);
    }
    let tone: Vec<f32> = v.iter().map(|&v| map.map(v)).collect();
    let mids = mids(tones);
    // no tone is darker than the pencil an over-big accent mass moves up to
    let floor = darks::floor(&tone, tones, &mids, k.accent_share());
    let grain = matches!(k.look, Look::Drawing | Look::Hatch).then(|| k.grain / GRAIN_START);
    let period = drawing::period(w.max(h));
    let mut image = Rgb::new(w, h, 3);
    let mut count = vec![0usize; tones.len()];
    for (i, (px, &l)) in image.data.chunks_exact_mut(3).zip(&tone).enumerate() {
        let l = l.max(floor);
        count[level_of(&mids, l)] += 1;
        let shown = grain.map_or(l, |g| l + g * drawing::swing(i % w, i / w, l, period));
        px.copy_from_slice(&tint(shown));
    }
    Ok((image, count))
}
