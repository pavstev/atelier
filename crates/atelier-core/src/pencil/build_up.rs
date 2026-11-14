//! The By pencil look: the Tone picture with only the lightest pencils of the set drawn so far. It
//! is a view by pencil (what each pencil adds), not an order of strokes.

/// The level of the pencil a By pencil `step` draws up to, in a set of `pencils` pencils (at
/// least 1) that the levels hold darkest first: step 1 is the lightest pencil, each step adds the
/// next darker one. A `step` over the size of the set takes the darkest pencil of the set, and
/// step 0 the lightest.
pub(super) fn level(pencils: usize, step: u8) -> usize {
    pencils - usize::from(step).clamp(1, pencils)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_step_one_is_the_lightest_pencil_and_each_step_adds_a_darker_one() {
        let levels: Vec<usize> = (1..=8).map(|step| level(8, step)).collect();
        assert_eq!(levels, vec![7, 6, 5, 4, 3, 2, 1, 0]);
    }

    #[test]
    fn test_a_step_over_the_set_is_clamped_to_its_darkest_pencil() {
        assert_eq!(level(3, 8), 0);
        assert_eq!(level(3, 3), 0);
        assert_eq!(level(1, 1), 0);
        assert_eq!(level(1, 200), 0);
        assert_eq!(level(5, 0), 4);
    }
}
