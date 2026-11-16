//! The cross effect: more crossed work in the deepest tones. In Hatch the second layer of lines
//! starts at a lighter tone and a third layer joins it, turned the other way, so the darks are a
//! web of three directions. In Drawing a second paper tooth, turned a quarter, mixes into the first
//! in the darks, so the graphite has a faint crossed grain. Neither changes the share of paper the
//! graphite covers, so the tone holds; the lights are never touched.

use super::ink::smoothstep;

/// How far the first layer's ceiling drops at full cross and full dark, as a share of the paper.
/// The layers that make up the rest start where the first one tops out, so a lower ceiling starts
/// the crossing at a lighter tone.
const FIRST_DROP: f32 = 0.3;
/// The darkness range over which the drop grows from nothing to all of it.
const DROP_RANGE: (f32, f32) = (0.3, 0.6);
/// The share of the crossed coverage the third layer draws at full cross (the rest is the second's).
const THIRD_SHARE: f32 = 0.5;
/// The spacing of the third layer of Hatch as a multiple of the first, a little wider than the
/// second's, so the three do not line up.
pub(crate) const THIRD_SPACING: f32 = 1.6;
/// The salt of the third layer's hashes, so it is not the second one turned.
pub(crate) const THIRD_SALT: i32 = 70_901;
/// The darkness range in which Drawing's second tooth fades in.
const TOOTH_RANGE: (f32, f32) = (0.45, 0.75);
/// The most of the coverage the second tooth takes over, at full cross in the deepest tones.
const TOOTH_SHARE: f32 = 0.5;

/// The second tooth of Drawing and how much of it shows (0 to 1).
#[derive(Clone, Copy)]
pub(crate) struct Crossed<'a> {
    /// The paper tooth turned a quarter from the first.
    pub tooth: &'a [f32],
    /// The cross knob.
    pub amount: f32,
}

/// The three layers of Hatch for the total coverage `all` at the darkness `d`, with `first_max` the
/// ceiling of the first layer at `cross` 0. Each is a coverage, and `1 - (1 - c1)(1 - c2)(1 - c3)`
/// is `all`. At `cross` 0 the third is 0 and the others are the two layers of the plain Hatch.
pub(crate) fn split(all: f32, d: f32, cross: f32, first_max: f32) -> (f32, f32, f32) {
    let ceiling = first_max - cross * FIRST_DROP * smoothstep(DROP_RANGE.0, DROP_RANGE.1, d);
    let first = all.min(ceiling);
    if all <= first {
        return (first, 0.0, 0.0);
    }
    // what is left bare after the first layer, shared out between the second and the third
    let bare = (1.0 - all) / (1.0 - first);
    let third = cross * THIRD_SHARE;
    if third <= 0.0 {
        return (first, 1.0 - bare, 0.0);
    }
    let rest = libm::powf(bare, third);
    if rest <= 0.0 {
        // all the paper is covered
        return (first, 1.0, 1.0);
    }
    (first, 1.0 - bare / rest, 1.0 - rest)
}

/// The coverage of Drawing at a pixel: `a` from the first tooth and `second` from the turned one,
/// mixed in the darks by `amount`. Both are from the same pressure, so their mean over an even
/// tooth is the same and the mix keeps the tone.
pub(crate) fn tooth_mix(a: f32, second: f32, d: f32, amount: f32) -> f32 {
    let weight = amount * TOOTH_SHARE * smoothstep(TOOTH_RANGE.0, TOOTH_RANGE.1, d);
    a + weight * (second - a)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_the_layers_make_up_the_same_coverage() {
        for cross in [0.0f32, 0.3, 1.0] {
            for k in 0..=100 {
                let (d, all) = (k as f32 / 100.0, 0.5 + 0.5 * k as f32 / 100.0);
                let (a, b, c) = split(all, d, cross, 0.6);
                let got = 1.0 - (1.0 - a) * (1.0 - b) * (1.0 - c);
                assert!((got - all).abs() < 1e-4, "cross {cross} d {d}: {got} {all}");
                assert!([a, b, c].iter().all(|x| (0.0..=1.0).contains(x)));
            }
        }
    }

    #[test]
    fn test_cross_zero_is_the_plain_two_layers() {
        let (a, b, c) = split(0.8, 0.7, 0.0, 0.6);
        assert_eq!((a, c), (0.6, 0.0));
        assert!((b - (1.0 - 0.2 / 0.4)).abs() < 1e-6);
    }

    #[test]
    fn test_cross_starts_the_second_layer_at_a_lighter_tone_and_adds_a_third() {
        // the whole coverage 0.5 is what the lights draw: no crossing at cross 0
        assert_eq!(split(0.5, 0.5, 0.0, 0.6).1, 0.0);
        let (first, second, third) = split(0.5, 0.5, 1.0, 0.6);
        assert!(first < 0.5 && second > 0.0 && third > 0.0);
        // a light tone has no crossing at all
        assert_eq!(split(0.5, 0.2, 1.0, 0.6), (0.5, 0.0, 0.0));
    }

    #[test]
    fn test_the_second_tooth_shows_in_the_darks_only() {
        assert_eq!(tooth_mix(0.2, 0.9, 0.3, 1.0), 0.2);
        assert_eq!(tooth_mix(0.2, 0.9, 0.9, 0.0), 0.2);
        let mixed = tooth_mix(0.2, 0.9, 0.9, 1.0);
        assert!(mixed > 0.2 && mixed < 0.9);
    }
}
