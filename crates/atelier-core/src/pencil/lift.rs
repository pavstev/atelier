//! The lift effect: marks of a kneaded eraser in the light tones. A kneaded eraser is pressed on the
//! graphite and lifts some of it, so a soft streak of the tone goes back toward bare paper. The marks
//! are fixed by a position hash: one mark per grid cell at most, with its own place, angle, length
//! and width, so the same picture always gets the same marks. Only tones lighter than [`FROM`] are
//! touched: a dark tone is too heavy to lift.

use super::grades::PAPER;
use super::ink::smoothstep;
use super::paper::hash;
use crate::img::size_factor;

/// The tones at and under this L* are never touched.
const FROM: f32 = 70.0;
/// The L* over which the lift grows from nothing to full above [`FROM`].
const RAMP: f32 = 12.0;
/// The grid of the marks, in px at a long side of 1024: at most one mark per cell.
const CELL: f32 = 40.0;
/// The share of the cells that have a mark.
const PRESENCE: f32 = 0.7;
/// The half length of a mark as a share of the cell (the least, then the most).
const HALF_LONG: (f32, f32) = (0.22, 0.45);
/// The half width of a mark as a share of the cell (the least, then the most).
const HALF_WIDE: (f32, f32) = (0.05, 0.1);
/// The share of its half width over which a mark fades out at its edge.
const SOFT: f32 = 0.6;
/// The share of the way to paper that a full mark at full strength lifts a tone.
const PULL: f32 = 0.7;
/// The salt of the lift hashes, so they do not repeat the hashes of the paper.
const ROLE: i32 = 90_001;

/// One mark: its center, its direction (a unit vector) and its half length and half width, in px.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Mark {
    at: (f32, f32),
    dir: (f32, f32),
    long: f32,
    wide: f32,
}

/// A hash in 0 to 1 for the cell `(cx, cy)` and the part `part` of its mark (each part has its own
/// salt, so the parts do not repeat each other).
fn unit(cx: i32, cy: i32, part: i32) -> f32 {
    0.5 + 0.5 * hash(cx.wrapping_add(ROLE).wrapping_add(part), cy)
}

/// The mark of the cell `(cx, cy)` with the cell `size` px wide, or none.
fn mark(cx: i32, cy: i32, size: f32) -> Option<Mark> {
    if unit(cx, cy, 0) >= PRESENCE {
        return None;
    }
    let turn = std::f32::consts::PI * unit(cx, cy, 3);
    let pick = |part: i32, (lo, hi): (f32, f32)| (lo + (hi - lo) * unit(cx, cy, part)) * size;
    Some(Mark {
        at: (
            (cx as f32 + 0.25 + 0.5 * unit(cx, cy, 1)) * size,
            (cy as f32 + 0.25 + 0.5 * unit(cx, cy, 2)) * size,
        ),
        dir: (libm::cosf(turn), libm::sinf(turn)),
        long: pick(4, HALF_LONG),
        wide: pick(5, HALF_WIDE),
    })
}

/// How much of the mark `m` covers the point `(x, y)`: 1 in its core, 0 outside, soft between.
fn cover(m: &Mark, x: f32, y: f32) -> f32 {
    let (dx, dy) = (x - m.at.0, y - m.at.1);
    let along = (dx * m.dir.0 + dy * m.dir.1).clamp(-m.long, m.long);
    let (px, py) = (dx - along * m.dir.0, dy - along * m.dir.1);
    let dist = libm::sqrtf(px * px + py * py) / m.wide;
    1.0 - smoothstep(1.0 - SOFT, 1.0, dist)
}

/// The picture `tone` (L*, `w` by `h`) with the marks of a kneaded eraser at strength `amount` (0 to
/// 1). 0 is the same picture, to the byte. A lifted tone moves toward paper and never past it.
pub(crate) fn lift(tone: &[f32], (w, h): (usize, usize), amount: f32) -> Vec<f32> {
    if amount <= 0.0 {
        return tone.to_vec();
    }
    let size = CELL * size_factor(w, h);
    let (cols, rows) = (
        libm::ceilf(w as f32 / size) as i32 + 1,
        libm::ceilf(h as f32 / size) as i32 + 1,
    );
    let marks: Vec<Option<Mark>> = (0..rows)
        .flat_map(|cy| (0..cols).map(move |cx| (cx, cy)))
        .map(|(cx, cy)| mark(cx, cy, size))
        .collect();
    let mut out = Vec::with_capacity(tone.len());
    for (i, &l) in tone.iter().enumerate() {
        let light = smoothstep(FROM, FROM + RAMP, l);
        if light <= 0.0 {
            out.push(l);
            continue;
        }
        let (x, y) = ((i % w) as f32 + 0.5, (i / w) as f32 + 0.5);
        let (cx, cy) = (libm::floorf(x / size) as i32, libm::floorf(y / size) as i32);
        let mut hit = 0.0f32;
        for ny in (cy - 1).max(0)..=(cy + 1).min(rows - 1) {
            for nx in (cx - 1).max(0)..=(cx + 1).min(cols - 1) {
                if let Some(m) = &marks[(ny * cols + nx) as usize] {
                    hit = hit.max(cover(m, x, y));
                }
            }
        }
        let pull = (amount * PULL * light * hit).min(1.0);
        out.push(l + pull * (PAPER - l).max(0.0));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::mean;

    #[test]
    fn test_zero_is_the_same_picture_to_the_byte() {
        let tone: Vec<f32> = (0..64 * 48).map(|i| 40.0 + (i % 50) as f32).collect();
        assert_eq!(lift(&tone, (64, 48), 0.0), tone);
    }

    #[test]
    fn test_only_tones_lighter_than_seventy_are_touched() {
        let (w, h) = (160, 120);
        for l in [10.0f32, 40.0, 69.0, FROM] {
            let tone = vec![l; w * h];
            assert_eq!(lift(&tone, (w, h), 1.0), tone, "tone {l}");
        }
        // a light picture has marks, and every lifted pixel is lighter and not past paper
        let tone = vec![88.0f32; w * h];
        let got = lift(&tone, (w, h), 1.0);
        assert!(got.iter().any(|&l| l > 90.0));
        assert!(got.iter().all(|&l| (88.0..=PAPER).contains(&l)));
    }

    #[test]
    fn test_a_stronger_lift_lifts_more() {
        let (w, h) = (160, 120);
        let tone = vec![85.0f32; w * h];
        let half = lift(&tone, (w, h), 0.5);
        let full = lift(&tone, (w, h), 1.0);
        assert!(mean(&full) > mean(&half) && mean(&half) > mean(&tone));
    }

    #[test]
    fn test_the_marks_are_streaks_that_cover_a_small_share() {
        let (w, h) = (256, 192);
        let got = lift(&vec![85.0f32; w * h], (w, h), 1.0);
        let share = got.iter().filter(|&&l| l > 85.5).count() as f32 / got.len() as f32;
        assert!((0.03..0.3).contains(&share), "{share}");
        // the mean of the lift stays small
        assert!(mean(&got) - 85.0 < 2.0);
    }

    #[test]
    fn test_same_input_same_picture() {
        let tone: Vec<f32> = (0..90 * 70).map(|i| 60.0 + (i % 35) as f32).collect();
        assert_eq!(lift(&tone, (90, 70), 0.8), lift(&tone, (90, 70), 0.8));
    }
}
