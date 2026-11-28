//! Reference check of the study tools (values, shapes, grid): each view of the synthetic fixture at 128 px must stay
//! within a small mean difference of a PNG in `tests/reference`. `ATELIER_BLESS=1` writes the PNGs.

mod common;

use atelier_core::img::Rgb;
use atelier_core::render;
use common::{check, mean_diff, over, work};

#[test]
fn test_mean_diff_of_black_and_white_is_255() {
    let black = Rgb::filled(4, 4, &[0, 0, 0]);
    let white = Rgb::filled(4, 4, &[255, 255, 255]);
    assert_eq!(mean_diff(&black, &white), 255.0);
    assert_eq!(mean_diff(&white, &white), 0.0);
    let other = Rgb::filled(2, 4, &[0, 0, 0]);
    assert!(mean_diff(&black, &other).is_infinite());
}

#[test]
fn test_values_reference() {
    let w = work();
    for preset in 0..4 {
        let got = render::values_view(&w, preset, 50.0).unwrap().0;
        assert_eq!((got.width, got.height), (w.width, w.height));
        assert!(
            got.data.chunks(3).all(|p| p[0] == p[1] && p[1] == p[2]),
            "values {preset} is gray"
        );
        check(&format!("values_{preset}"), &got);
    }
}

#[test]
fn test_shapes_reference() {
    let w = work();
    for step in 0..4 {
        let got = render::shapes_view(&w, step, 50.0).unwrap().0;
        assert_eq!((got.width, got.height), (w.width, w.height));
        check(&format!("shapes_{step}"), &got);
    }
}

#[test]
fn test_grid_reference() {
    let w = work();
    // 8 whole squares across, and 7.5 squares (a grid of cm on a paper): the part square at the
    // right and the bottom
    for (name, milli) in [("grid_8", 8000), ("grid_7500", 7500)] {
        let got = over(&w, &render::grid_layer(&w, milli).unwrap());
        // the lines cover the whole photo: no crop
        assert_eq!((got.width, got.height), (w.width, w.height));
        check(name, &got);
    }
}
