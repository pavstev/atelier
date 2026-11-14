//! The accent rule of a Pencil view: the softest pencils (9B, 7B) are for the deepest accents, not
//! for big dark areas.

/// The pencils under this tone (L*) are accent pencils: the 9B and the 7B. They mark the deepest
/// accents and soft grain, not big areas.
const ACCENT_BELOW: f32 = 30.0;
/// The most of the picture an accent pencil may cover. A bigger dark mass is drawn one pencil
/// lighter (a black backdrop is layered in a 5B), as long as a pencil is there to take it.
pub(super) const ACCENT_SHARE: f64 = 0.20;

/// The zone each zone is drawn in: itself, or the next lighter pencil when an accent pencil
/// (with the zones that moved up to it) would cover over [`ACCENT_SHARE`] of the picture. Paper
/// never takes a dark mass.
pub(super) fn accent_moves(count: &[usize], tones: &[f32], total: usize) -> Vec<usize> {
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

#[cfg(test)]
mod tests {
    use super::*;

    const TONES: [f32; 5] = [17.0, 26.0, 37.0, 60.0, 95.0];

    #[test]
    fn test_a_small_accent_stays_and_a_big_one_moves_up() {
        // 10 percent in the 9B: it stays
        assert_eq!(
            accent_moves(&[10, 0, 40, 40, 10], &TONES, 100),
            vec![0, 1, 2, 3, 4]
        );
        // 50 percent in the 9B: it moves to the 7B, which is over the cap too, so on to the 5B
        assert_eq!(
            accent_moves(&[50, 0, 20, 20, 10], &TONES, 100),
            vec![2, 2, 2, 3, 4]
        );
    }

    #[test]
    fn test_paper_and_the_last_pencil_never_take_a_dark_mass() {
        // only 9B and paper: the 9B has nowhere to go
        assert_eq!(accent_moves(&[90, 10], &[17.0, 95.0], 100), vec![0, 1]);
    }
}
