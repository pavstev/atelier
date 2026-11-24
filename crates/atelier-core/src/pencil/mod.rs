//! The Pencil view: a photo as a study for graphite pencils.
//!
//! The main look is the photo as a gray picture, a little simplified, in the tones graphite can
//! make on paper. The same picture says which pencil each tone is: the legend names one pencil per
//! tone of the set, and the lightest tone is bare paper.
//!
//! One small module per idea: `grades` (the levels), `tone` (the curve, Key and Contrast), `local`
//! (Local contrast), `darks` (the accent rule, Deep darks), `paper` (the paper tooth), `ink` (the
//! sums Drawing and Hatch share), `drawing` (graphite laid on the tooth), `hatch` (lines that
//! follow the form), `build_up` (By pencil), `auto` (Auto sets Key, Contrast and Highlights from the photo) and `choice`
//! (Suggest pencils picks the best set of 3 to 6).
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
//! 4. Looks: Tone is the curve's picture. Drawing is the same picture laid on the paper tooth:
//!    graphite catches the peaks first and fills the valleys as the tone darkens, so the tones hold;
//!    `grain` sets how much tooth shows, `paper` its size, `angle` its streak. Hatch draws the
//!    picture as lines of graphite that follow the form, with a cross layer in the darks;
//!    `density` sets how close they run. By pencil is the Tone picture with
//!    only the lightest `step` pencils drawn: a tone darker than the pencil of the step is drawn in
//!    that pencil, the shares stay those of the finished picture and the answer marks the level.
//! 5. Accent rule: the 9B and the 7B are for the deepest accents. When they would cover over
//!    `darks` percent of the picture (20 at the start), no tone goes below the next pencil.
//!
//! Every knob at its start gives the picture the view drew before the knobs existed, to the byte:
//! a neutral knob skips its math. The same input gives the same bytes: no randomness (the grain is
//! a hash of the position), no clock.

mod auto;
mod build_up;
mod choice;
mod cross;
mod darks;
mod drawing;
mod grades;
mod hatch;
mod ink;
mod lift;
mod local;
mod paper;
mod smudge;
mod tone;

#[cfg(test)]
mod tests;

use crate::error::{Error, Result};
use crate::filters::Sorted;
use crate::img::Rgb;
use crate::values::{fields, smooth_of};
use grades::{level_of, levels, mids, shares, tint};
use tone::ToneMap;

pub(crate) use paper::Paper;

/// How much of the fine detail the picture keeps at `detail` 0 (the rest is the simplified
/// photo). At `detail` 1 all of it stays.
const RETAIN_MIN: f32 = 0.25;
/// The tone step (L*) at which the Smudge of Drawing counts a pixel half: a step of this size is
/// kept, the few L* of the tooth blend away.
const SMUDGE_EDGE_STOP: f32 = 12.0;
/// The grain knob (0 to 1) at its start: half of the full tooth.
const GRAIN_START: f32 = 0.5;

/// Which picture a Pencil view draws.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Look {
    /// The smooth gray picture in the tones of the pencils (the start).
    Tone,
    /// Tone with graphite grain and hatching.
    Drawing,
    /// Tonal hatching.
    Hatch,
    /// The Tone picture with only the lightest pencils of the set drawn so far.
    ByPencil,
}

impl Look {
    /// The look of this number (0 Tone, 1 Drawing, 3 Hatch, 4 By pencil). 2 is not a look.
    pub(crate) fn from_number(n: u8) -> Result<Self> {
        match n {
            0 => Ok(Self::Tone),
            1 => Ok(Self::Drawing),
            3 => Ok(Self::Hatch),
            4 => Ok(Self::ByPencil),
            _ => Err(Error::bad("pencil look must be 0, 1, 3 or 4")),
        }
    }
}

/// What a Pencil view takes. The ranges are checked by the caller (`render`); `Default` is the
/// start of every knob.
#[derive(Debug, Clone, PartialEq)]
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
    /// How far a blending stump drags the tone along the stroke, 0 to 1 (0 off).
    pub smudge: f32,
    /// How strongly a kneaded eraser lifts marks out of the light tones, 0 to 1 (0 off).
    pub lift: f32,
    /// How much more crossed work the darks get, 0 to 1 (0 off).
    pub cross: f32,
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
            smudge: 0.0,
            lift: 0.0,
            cross: 0.0,
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

/// The Pencil view of `work`. See [`Knobs`] for what it takes.
///
/// # Errors
/// `BadInput` for a `mask` that is 0 or has a bit over the pencils, a `detail` outside 0 to 1, or
/// an image that is not RGB or is empty.
pub(crate) fn view(work: &Rgb, k: &Knobs) -> Result<Pencil> {
    let tones = levels(k.mask)?;
    let flat: Vec<[u8; 3]> = tones.iter().map(|&l| tint(l)).collect();
    // the set always has paper after its pencils
    let mark = (k.look == Look::ByPencil).then(|| build_up::level(tones.len() - 1, k.step));
    let (image, count) = tone_picture(work, k, &tones, mark)?;
    Ok(Pencil {
        image,
        tones: flat,
        shares: shares(&count, work.width * work.height),
        mark: mark.map(|level| level as u8),
    })
}

/// What Auto reads from `work` and the Key, Contrast and Highlights it sets: see [`auto::Auto`].
pub(crate) fn read_auto(work: &Rgb) -> auto::Auto {
    auto::auto(&smooth_of(work))
}

/// The mask of the `count` pencils (1 to 8) that best fit `work`: see [`choice`].
///
/// # Errors
/// `BadInput` for a `count` outside 1 to 8, or an image that is not RGB or is empty.
pub(crate) fn suggest(work: &Rgb, count: u32) -> Result<u32> {
    let smooth = smooth_of(work);
    choice::suggest(&smooth, count).ok_or_else(|| Error::bad("pencil count must be 1 to 8"))
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

/// The pictures that follow the photo's tones: Tone and, with grain, Drawing and Hatch. With
/// `drawn_to` (By pencil) a tone darker than that level's pencil is drawn in that pencil, but the
/// shares stay those of the finished picture.
fn tone_picture(work: &Rgb, k: &Knobs, tones: &[f32], drawn_to: Option<usize>) -> Result<Painting> {
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
    let mut tone: Vec<f32> = v.iter().map(|&v| map.map(v)).collect();
    // the eraser lifts the light tones before the shares are counted, so the legend shows its paper
    if k.lift > 0.0 && matches!(k.look, Look::Tone | Look::Drawing | Look::Hatch) {
        tone = lift::lift(&tone, (w, h), k.lift);
    }
    let mids = mids(tones);
    // no tone is darker than the pencil an over-big accent mass moves up to
    let floor = darks::floor(&tone, tones, &mids, k.accent_share());
    let step_floor = drawn_to.map(|level| tones[level]);
    let mut count = vec![0usize; tones.len()];
    let drawn: Vec<f32> = tone
        .iter()
        .map(|&l| {
            let l = l.max(floor);
            count[level_of(&mids, l)] += 1;
            step_floor.map_or(l, |s| l.max(s))
        })
        .collect();
    let shown = textured(drawn, &f.smooth, (w, h), k);
    let mut image = Rgb::new(w, h, 3);
    for (px, &l) in image.data.chunks_exact_mut(3).zip(&shown) {
        px.copy_from_slice(&tint(l));
    }
    Ok((image, count))
}

/// The shown L* per pixel of the picture `tone` in the look of `k`: Drawing on the paper tooth,
/// Hatch as lines that follow `guide` (the smoothed L*), the others as they are, then the smudge.
/// The one place the texture looks are called.
fn textured(tone: Vec<f32>, guide: &[f32], (w, h): (usize, usize), k: &Knobs) -> Vec<f32> {
    let angle = f32::from(k.angle);
    let shown = match k.look {
        Look::Drawing => {
            let tooth = paper::tooth(w, h, k.paper, angle);
            // the crossed tooth runs a quarter turn from the first
            let turned = (k.cross > 0.0).then(|| paper::tooth(w, h, k.paper, angle + 90.0));
            let crossed = turned.as_deref().map(|tooth| cross::Crossed {
                tooth,
                amount: k.cross,
            });
            drawing::draw(&tone, w, h, &tooth, k.grain, k.paper, crossed)
        }
        Look::Hatch => {
            let tooth = paper::tooth(w, h, k.paper, angle);
            hatch::draw(
                &tone, guide, w, h, &tooth, k.grain, angle, k.density, k.cross,
            )
        }
        Look::Tone | Look::ByPencil => tone,
    };
    // the stump works on the drawn graphite; By pencil keeps its tone for the step
    match k.look {
        // Drawing keeps its clear edges: only the tooth and the grain blend (bench 2026-11-23)
        Look::Drawing => {
            smudge::drag_stopped(&shown, (w, h), angle, k.smudge, Some(SMUDGE_EDGE_STOP))
        }
        Look::Tone | Look::Hatch => smudge::drag(&shown, (w, h), angle, k.smudge),
        Look::ByPencil => shown,
    }
}
