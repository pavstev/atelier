//! The levels of a Pencil view: the pencils of the set and the paper, their tones and colors, the
//! level a tone belongs to and the share of the picture each level covers.

use crate::error::{Error, Result};
use crate::oklab;
use crate::values::ok_l;

/// The pencils the view knows, darkest first: 9B, 7B, 5B, 2B, HB, H, 3H, 4H. Each is the CIE L*
/// of a firm, even layer of that grade on white paper. Hard grades stay light, a 9B nears the
/// darkest graphite makes (about L* 17, because of its sheen).
pub(super) const TONES: [f32; 8] = [17.0, 26.0, 37.0, 49.0, 60.0, 70.0, 78.0, 86.0];
/// How many pencils there are.
pub(super) const GRADES: u32 = TONES.len() as u32;
/// The L* of bare paper.
pub(super) const PAPER: f32 = 95.0;

/// The L* at which the graphite color turns from a cool gray to the warm white of the paper.
const WARM_FROM: f32 = 70.0;

/// The pencils of `mask`, darkest first, as their tones; paper is added last.
pub(super) fn levels(mask: u32) -> Result<Vec<f32>> {
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

/// The color of CIE lightness `l` on the paper: a gray with a slight cool cast for graphite that
/// turns warm toward the paper white, so the paper (L* 95) is a warm white.
pub(super) fn tint(l: f32) -> [u8; 3] {
    let t = ((l - WARM_FROM) / (PAPER - WARM_FROM)).clamp(0.0, 1.0);
    oklab::to_srgb([ok_l(l), -0.001 + 0.001 * t, -0.005 + 0.011 * t])
}

/// The tones halfway between neighbor levels: a tone at or over the i-th one is level i + 1 or
/// more (see [`level_of`]).
pub(super) fn mids(tones: &[f32]) -> Vec<f32> {
    tones
        .windows(2)
        .map(|t| f32::midpoint(t[0], t[1]))
        .collect()
}

/// The level a tone `l` is drawn as: the nearest one, given the `mids` between the levels.
pub(super) fn level_of(mids: &[f32], l: f32) -> usize {
    mids.partition_point(|&m| m <= l)
}

/// The share of the picture each level covers, in percent, from the pixel `count` of each level
/// out of `total`. A level that covers any pixel shows at least 1. The shares add up to at least
/// 100: when the rounding leaves less, the levels that lost the most to it gain 1 each, the
/// lowest level first on a tie.
pub(super) fn shares(count: &[usize], total: usize) -> Vec<u8> {
    let total = total.max(1);
    let mut out: Vec<usize> = count
        .iter()
        .map(|&c| match c {
            0 => 0,
            c => ((c * 100 + total / 2) / total).clamp(1, 100),
        })
        .collect();
    // what rounding took from a level, in 1/100 of a pixel
    let lost = |out: &[usize], i: usize| (count[i] * 100) as i64 - (out[i] * total) as i64;
    while out.iter().sum::<usize>() < 100 {
        let Some(i) = (0..out.len())
            .filter(|&i| count[i] > 0)
            .max_by_key(|&i| (lost(&out, i), std::cmp::Reverse(i)))
        else {
            break;
        };
        out[i] += 1;
    }
    out.into_iter().map(|s| s as u8).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::next_lcg;

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
    fn test_tones_rise_and_paper_is_the_lightest() {
        assert!(TONES.windows(2).all(|t| t[0] < t[1]));
        assert!(TONES[GRADES as usize - 1] < PAPER);
    }

    #[test]
    fn test_a_tone_is_the_level_it_is_nearest_to() {
        let tones = levels(0b0000_0101).unwrap();
        let m = mids(&tones);
        assert_eq!(m, vec![27.0, 66.0]);
        assert_eq!(level_of(&m, 10.0), 0);
        assert_eq!(level_of(&m, TONES[0]), 0);
        assert_eq!(level_of(&m, 27.0), 1);
        assert_eq!(level_of(&m, TONES[2]), 1);
        assert_eq!(level_of(&m, 90.0), 2);
    }

    #[test]
    fn test_shares_round_and_keep_a_used_level_visible() {
        assert_eq!(shares(&[1, 0, 99], 100), vec![1, 0, 99]);
        // 1 in 1000 would round to 0: it still shows as 1
        assert_eq!(shares(&[1, 999], 1000), vec![1, 100]);
        assert_eq!(shares(&[0, 0], 0), vec![0, 0]);
    }

    #[test]
    fn test_shares_add_up_to_at_least_100() {
        // three equal thirds round to 33 each: the first level gains the missing 1
        assert_eq!(shares(&[1, 1, 1], 3), vec![34, 33, 33]);
        // the level that lost the most to the rounding gains it
        assert_eq!(shares(&[333, 334, 333], 1000), vec![33, 34, 33]);
        // rounding that already adds up is left alone
        assert_eq!(shares(&[324, 330, 346], 1000), vec![32, 33, 35]);
        assert_eq!(shares(&[4, 0, 5, 5], 14), vec![29, 0, 36, 36]);
        // seeded counts: never under 100, never more than one over per level used
        let mut seed = 7u32;
        for _ in 0..200 {
            let count: Vec<usize> = (0..9)
                .map(|_| (next_lcg(&mut seed) >> 20) as usize % 500)
                .collect();
            let total: usize = count.iter().sum::<usize>().max(1);
            let s = shares(&count, total);
            let sum: usize = s.iter().map(|&v| usize::from(v)).sum();
            assert!((100..=100 + count.len()).contains(&sum), "{count:?}: {s:?}");
            assert!(s.iter().zip(&count).all(|(&v, &c)| (c > 0) == (v > 0)));
        }
    }

    #[test]
    fn test_the_paper_is_warmer_than_the_dark_graphite() {
        let [dr, _, db] = tint(TONES[0]);
        let [pr, _, pb] = tint(PAPER);
        assert!(i32::from(dr) - i32::from(db) < i32::from(pr) - i32::from(pb));
    }
}
