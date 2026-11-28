//! The see-through layers: values, shapes and the grid, as RGBA with alpha.

mod common;
use atelier_core::error::Error;
use atelier_core::img::Rgb;
use atelier_core::render::{grid_layer, shapes_layer, shapes_view, values_layer};
use common::{over, work};

#[test]
fn test_grid_layer_alpha_only_on_lines() {
    let w = work();
    let l = grid_layer(&w, 6000).unwrap();
    let v = over(&w, &l);
    for ((p, q), o) in v.data.chunks(3).zip(w.data.chunks(3)).zip(l.rgba.chunks(4)) {
        assert_eq!(o[3] == 0, p == q);
    }
    assert!(l.rgba.chunks(4).any(|o| o[3] > 0));
}

#[test]
fn test_grid_count_draws_squares_that_do_not_divide_the_side() {
    // 300 x 225 px, a paper 30 cm wide in a 4 cm grid: 7.5 squares across, 40 px each
    let w = Rgb::filled(300, 225, &[120, 120, 120]);
    let fine = grid_layer(&w, 7500).unwrap();
    let lit = |x: usize, y: usize| fine.rgba[(y * fine.width + x) * 4 + 3] > 0;
    let across: Vec<usize> = (0..300).filter(|&x| lit(x, 3)).collect();
    let down: Vec<usize> = (0..225).filter(|&y| lit(3, y)).collect();
    // 7 lines across (the 8th square is half), 5 down (225 / 40 is 5.6), 40 px apart, none at an edge
    assert_eq!(across, [40, 80, 120, 160, 200, 240, 280]);
    assert_eq!(down, [40, 80, 120, 160, 200]);
    // a count out of range is BadInput, never a panic
    for milli in [0, 1, 99, 500_001, u32::MAX] {
        assert!(
            matches!(grid_layer(&w, milli), Err(Error::BadInput(_))),
            "{milli}"
        );
    }
    for milli in [100, 500_000] {
        assert!(grid_layer(&w, milli).is_ok());
    }
}

#[test]
fn test_opaque_layers_have_alpha_255() {
    let w = work();
    for l in [
        values_layer(&w, 0, 50.0).unwrap().0,
        shapes_layer(&w, 3, 50.0).unwrap().0,
    ] {
        assert!(l.rgba.chunks(4).all(|o| o[3] == 255));
    }
}

#[test]
fn test_grid_covers_the_whole_photo() {
    let w = work();
    let v = over(&w, &grid_layer(&w, 6000).unwrap());
    let differs = |x: usize, y: usize| v.pixel(x, y) != w.pixel(x, y);
    let (last_x, last_y) = (w.width - 1, w.height - 1);
    assert!((0..w.width).any(|x| differs(x, 0) || differs(x, 1) || differs(x, 2)));
    assert!((0..w.width).any(|x| differs(x, last_y)));
    assert!((0..w.height).any(|y| differs(0, y)));
    assert!((0..w.height).any(|y| differs(last_x, y)));
}

#[test]
fn test_bad_numbers_are_bad_input() {
    let w = work();
    assert!(matches!(grid_layer(&w, 99), Err(Error::BadInput(_))));
    assert!(matches!(values_layer(&w, 4, 50.0), Err(Error::BadInput(_))));
    assert!(matches!(
        values_layer(&w, 1, 100.1),
        Err(Error::BadInput(_))
    ));
}

#[test]
fn test_values_tones_are_darkest_first_and_painted() {
    let w = work();
    let (layer, tones) = values_layer(&w, 1, 50.0).unwrap();
    assert_eq!(tones.len(), 3);
    assert!(tones.windows(2).all(|t| t[0][0] < t[1][0]));
    for o in layer.rgba.chunks(4) {
        assert!(tones.contains(&[o[0], o[1], o[2]]));
    }
}

#[test]
fn test_shapes_layer_color_only() {
    let w = work();
    let (layer, piles) = shapes_layer(&w, 3, 50.0).unwrap();
    let (view, same) = shapes_view(&w, 3, 50.0).unwrap();
    assert_eq!(piles, same);
    for (p, q) in view.data.chunks(3).zip(layer.rgba.chunks(4)) {
        assert_eq!(&q[..3], p);
    }
}

#[test]
fn test_shapes_steps_fill_the_canvas_in_paint_order() {
    // every step paints all the pixels of the step before, and the lights step covers the canvas
    let w = work();
    let steps: Vec<_> = (0..4).map(|s| shapes_view(&w, s, 50.0).unwrap()).collect();
    let white = |img: &atelier_core::img::Rgb| {
        img.data
            .chunks(3)
            .map(|p| p == [255, 255, 255])
            .collect::<Vec<_>>()
    };
    for pair in steps.windows(2) {
        let (before, after) = (white(&pair[0].0), white(&pair[1].0));
        assert!(before.iter().zip(&after).all(|(&b, &a)| b || !a));
    }
    assert!(!white(&steps[2].0).iter().any(|&b| b));
    // a step names the piles it mixes; a step may have none
    assert!(steps[..3].iter().any(|(_, piles)| !piles.is_empty()));
    assert!(shapes_view(&w, 4, 50.0).is_err());
}

#[test]
fn malformed_image_bad_input_everywhere() {
    use atelier_core::render::values_view;
    let mut short = atelier_core::img::Rgb::filled(8, 8, &[10, 20, 30]);
    short.data.truncate(10);
    let gray = atelier_core::img::Rgb::new(8, 8, 1);
    let empty = atelier_core::img::Rgb::new(0, 0, 3);
    for w in [&short, &gray, &empty] {
        assert!(matches!(values_view(w, 0, 50.0), Err(Error::BadInput(_))));
        assert!(matches!(values_layer(w, 0, 50.0), Err(Error::BadInput(_))));
        assert!(matches!(shapes_layer(w, 0, 50.0), Err(Error::BadInput(_))));
        assert!(matches!(grid_layer(w, 6000), Err(Error::BadInput(_))));
        assert!(matches!(shapes_view(w, 0, 50.0), Err(Error::BadInput(_))));
    }
}
