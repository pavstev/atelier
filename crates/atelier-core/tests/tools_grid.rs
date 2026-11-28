//! The Grid Contrast lines: one tone along a segment, a hold against a wobble in the photo.

use atelier_core::img::Rgb;
use atelier_core::render::grid_layer;

/// Gray stripes 30 px wide, 88 and 111: an `OKLab` lightness of 0.46 and 0.54, a wobble about the
/// split between a dark and a light line.
fn wobble() -> Rgb {
    let mut w = Rgb::filled(480, 360, &[0, 0, 0]);
    for (i, p) in w.data.chunks_exact_mut(3).enumerate() {
        let v = if (i % 480 / 30) % 2 == 0 { 88 } else { 111 };
        p.copy_from_slice(&[v; 3]);
    }
    w
}

#[test]
fn test_contrast_line_keeps_one_tone_along_a_segment() {
    let w = wobble();
    // 6 squares of 80 px: the horizontal line at y 80 runs between the vertical lines at x 80
    // and 160
    let l = grid_layer(&w, 6000).unwrap();
    let at = |x: usize| &l.rgba[(80 * w.width + x) * 4..][..4];
    for x in 90..150 {
        assert!(at(x)[3] > 0, "line at {x}");
        assert_eq!(at(x)[..3], at(90)[..3], "the tone changed at {x}");
    }
}

#[test]
fn test_contrast_line_turns_where_the_photo_changes() {
    // a dark left half and a light right half: the line is light on the left, dark on the right
    let mut w = Rgb::filled(480, 360, &[20, 20, 20]);
    for (i, p) in w.data.chunks_exact_mut(3).enumerate() {
        if i % 480 >= 240 {
            p.copy_from_slice(&[235; 3]);
        }
    }
    let l = grid_layer(&w, 6000).unwrap();
    let at = |x: usize| &l.rgba[(80 * w.width + x) * 4..][..4];
    assert!(at(100)[0] > 200, "light on dark: {:?}", at(100));
    assert!(at(300)[0] < 60, "dark on light: {:?}", at(300));
}
