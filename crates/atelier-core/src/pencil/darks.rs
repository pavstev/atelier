//! The accent rule of a Pencil view (the Deep darks knob): the softest pencils (9B, 7B) are for the
//! deepest accents, not for big dark areas.

use super::grades::level_of;

/// The pencils under this tone (L*) are accent pencils: the 9B and the 7B. They mark the deepest
/// accents and soft grain, not big areas.
const ACCENT_BELOW: f32 = 30.0;

/// The zone each zone is drawn in: itself, or the next lighter pencil when an accent pencil
/// (with the zones that moved up to it) would cover over the `share` (0 to 1) of the `total`
/// pixels, the Deep darks knob. A bigger dark mass is drawn one pencil lighter (a black backdrop
/// is layered in a 5B), as long as a pencil is there to take it. Paper never takes a dark mass.
pub(super) fn accent_moves(count: &[usize], tones: &[f32], total: usize, share: f64) -> Vec<usize> {
    let n = tones.len();
    let cap = (share * total as f64) as usize;
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

/// The darkest tone a picture may use: the tone of the pencil the darkest zone is moved to by
/// [`accent_moves`], counting how many of the `tone`s fall in each level (`mids` between the
/// levels of `tones`).
pub(super) fn floor(tone: &[f32], tones: &[f32], mids: &[f32], share: f64) -> f32 {
    let mut under = vec![0usize; tones.len()];
    for &l in tone {
        under[level_of(mids, l)] += 1;
    }
    tones[accent_moves(&under, tones, tone.len(), share)[0]]
}

#[cfg(test)]
mod tests {
    use super::super::grades::mids;
    use super::*;

    const TONES: [f32; 5] = [17.0, 26.0, 37.0, 60.0, 95.0];
    /// The Deep darks knob at its start, 20 percent.
    const START: f64 = 0.2;

    #[test]
    fn test_a_small_accent_stays_and_a_big_one_moves_up() {
        // 10 percent in the 9B: it stays
        assert_eq!(
            accent_moves(&[10, 0, 40, 40, 10], &TONES, 100, START),
            vec![0, 1, 2, 3, 4]
        );
        // 50 percent in the 9B: it moves to the 7B, which is over the cap too, so on to the 5B
        assert_eq!(
            accent_moves(&[50, 0, 20, 20, 10], &TONES, 100, START),
            vec![2, 2, 2, 3, 4]
        );
    }

    #[test]
    fn test_paper_and_the_last_pencil_never_take_a_dark_mass() {
        // only 9B and paper: the 9B has nowhere to go
        assert_eq!(
            accent_moves(&[90, 10], &[17.0, 95.0], 100, START),
            vec![0, 1]
        );
    }

    #[test]
    fn test_a_bigger_share_lets_the_accent_pencils_cover_more() {
        let count = [50, 0, 20, 20, 10];
        assert_eq!(accent_moves(&count, &TONES, 100, 0.6)[0], 0);
        assert_eq!(accent_moves(&count, &TONES, 100, 0.2)[0], 2);
        // no share at all: any accent pixel moves up
        assert_eq!(accent_moves(&[1, 0, 49, 40, 10], &TONES, 100, 0.0)[0], 2);
        assert_eq!(accent_moves(&count, &TONES, 100, 1.0)[0], 0);
    }

    #[test]
    fn test_the_floor_is_the_darkest_tone_the_rule_leaves() {
        let m = mids(&TONES);
        let mostly_black: Vec<f32> = [vec![17.0; 70], vec![80.0; 30]].concat();
        assert_eq!(floor(&mostly_black, &TONES, &m, START), TONES[2]);
        assert_eq!(floor(&mostly_black, &TONES, &m, 1.0), TONES[0]);
        let few_black: Vec<f32> = [vec![17.0; 5], vec![80.0; 95]].concat();
        assert_eq!(floor(&few_black, &TONES, &m, START), TONES[0]);
    }
}
