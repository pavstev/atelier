//! Reference check of the study tools (values, shapes, edges, grid): each view of the synthetic fixture at 128 px must stay
//! within a small mean difference of a PNG in `tests/reference`. `ATELIER_BLESS=1` writes the PNGs.

mod common;

use atelier_core::img::Rgb;
use atelier_core::render;
use common::support::{EDGES_EVEN, EDGES_WIDTH};
use common::{check, mean_diff, over, work};
/// The Grid width that draws 1 px lines on the 128 px fixture (16 px at a long side of 2048).
const GRID_WIDTH: u32 = 16;

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
    let img = w.clone();
    for preset in 0..6 {
        let got = render::values_view(&img, preset, 50.0, 0).unwrap().0;
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
    let img = w.clone();
    for step in 0..4 {
        let got = render::shapes_view(&img, step, 50.0).unwrap().0;
        assert_eq!((got.width, got.height), (w.width, w.height));
        check(&format!("shapes_{step}"), &got);
    }
}

#[test]
fn test_lines_reference() {
    let w = work();
    let img = w.clone();
    // Lines at 0, 33 and 67, and Transfer at 50
    for (preset, (mode, amount)) in [(0, 0.0), (0, 33.0), (0, 67.0), (1, 50.0)]
        .into_iter()
        .enumerate()
    {
        let plain = render::edges_view(&img, mode, amount, EDGES_WIDTH, EDGES_EVEN).unwrap();
        check(&format!("lines_{preset}_edges"), &plain);
    }
}

#[test]
fn test_grid_reference() {
    let w = work();
    let img = w.clone();
    for mode in 0..3 {
        let got = over(
            &img,
            &render::grid_layer(&img, mode, 8, GRID_WIDTH, 2, render::GRID_CONTRAST, 0).unwrap(),
        );
        // the lines cover the whole photo: no crop
        assert_eq!((got.width, got.height), (w.width, w.height));
        check(&format!("grid_{mode}"), &got);
    }
}
