//! The see-through layers: edges, values, shapes and the grid, as RGBA with alpha.

mod common;
use atelier_core::render::{
    GRID_CONTRAST, edges_layer, edges_view, grid_layer, prepare_work, shapes_layer, shapes_view,
    values_layer,
};
use common::{FIXTURE, decode_png, over, work};

#[test]
fn test_edges_layer_alpha_is_ink() {
    let w = work();
    let v = edges_view(&w, 1, 50.0, 3, 0.0).unwrap();
    let l = edges_layer(&w, 1, 50.0, 3, 0.0).unwrap();
    assert_eq!(
        (l.width, l.height, l.rgba.len()),
        (w.width, w.height, w.width * w.height * 4)
    );
    for (p, q) in v.data.chunks(3).zip(l.rgba.chunks(4)) {
        assert_eq!(&q[..3], p);
        assert_eq!(q[3], 255 - p[0].max(p[1]).max(p[2]));
    }
}

#[test]
fn test_grid_layer_alpha_only_on_lines() {
    let w = work();
    let l = grid_layer(&w, 2, 6, 16, 2, GRID_CONTRAST, 0).unwrap();
    let v = over(&w, &l);
    for ((p, q), o) in v.data.chunks(3).zip(w.data.chunks(3)).zip(l.rgba.chunks(4)) {
        assert_eq!(o[3] == 0, p == q);
    }
    assert!(l.rgba.chunks(4).any(|o| o[3] > 0));
}

#[test]
fn test_opaque_layers_have_alpha_255() {
    let w = work();
    for l in [
        values_layer(&w, 0, 50.0, 0).unwrap().0,
        shapes_layer(&w, 3, 50.0).unwrap().0,
    ] {
        assert!(l.rgba.chunks(4).all(|o| o[3] == 255));
    }
}

#[test]
fn test_grid_covers_the_whole_photo() {
    let w = work();
    let v = over(&w, &grid_layer(&w, 1, 6, 16, 2, 0x00FF_FFFF, 0).unwrap());
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
    assert!(grid_layer(&w, 3, 6, 2, 2, GRID_CONTRAST, 0).is_err());
    assert!(grid_layer(&w, 1, 5, 2, 2, GRID_CONTRAST, 0).is_err());
    assert!(grid_layer(&w, 1, 6, 17, 2, GRID_CONTRAST, 0).is_err());
    assert!(grid_layer(&w, 1, 6, 2, 3, GRID_CONTRAST, 0).is_err());
    assert!(grid_layer(&w, 1, 6, 2, 2, GRID_CONTRAST + 1, 0).is_err());
    assert!(edges_layer(&w, 3, 50.0, 3, 0.0).is_err());
    assert!(edges_layer(&w, 0, 100.1, 3, 0.0).is_err());
    for width in [0, 11] {
        assert!(edges_layer(&w, 0, 50.0, width, 0.0).is_err());
    }
    for even in [-0.1, 100.1, f64::NAN] {
        assert!(edges_layer(&w, 0, 50.0, 3, even).is_err());
    }
}

#[test]
fn test_edges_even_knob_moves_lines_only() {
    let w = work();
    let at = |mode: u32, even: f64| edges_layer(&w, mode, 67.0, 5, even).unwrap();
    assert_ne!(at(0, 0.0), at(0, 100.0));
    // Transfer draws one width anyway
    assert_eq!(at(1, 0.0), at(1, 100.0));
}

#[test]
fn test_edges_width_knob_adds_ink_in_every_mode() {
    // the screen size, where every mode has room to widen
    let w = prepare_work(&decode_png(FIXTURE), 1024).unwrap();
    let ink = |mode: u32, width: u32| {
        edges_layer(&w, mode, 67.0, width, 0.0)
            .unwrap()
            .rgba
            .chunks(4)
            .map(|o| u64::from(o[3]))
            .sum::<u64>()
    };
    // every step of the knob shows, in every mode
    for mode in 0..3 {
        let inks: Vec<u64> = (1..=10).map(|width| ink(mode, width)).collect();
        assert!(
            inks.windows(2).all(|p| p[1] > p[0]),
            "mode {mode}: {inks:?}"
        );
    }
}

/// The `OKLab` L of an sRGB byte color.
fn ok_l(c: [u8; 3]) -> f64 {
    let lin = |v: u8| {
        let c = f64::from(v) / 255.0;
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    let l = (0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b).cbrt();
    let m = (0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b).cbrt();
    let s = (0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b).cbrt();
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s
}

#[test]
fn test_umber_keeps_lightness() {
    let w = work();
    for preset in 0..6 {
        let (_, gray) = values_layer(&w, preset, 50.0, 0).unwrap();
        let (layer, umber) = values_layer(&w, preset, 50.0, 1).unwrap();
        assert_eq!(gray.len(), umber.len());
        assert!(!umber.is_empty());
        assert!(layer.rgba.chunks(4).all(|o| o[3] == 255));
        for (g, u) in gray.iter().zip(&umber) {
            assert!(g[0] == g[1] && g[1] == g[2], "gray tone {g:?}");
            assert!((ok_l(*g) - ok_l(*u)).abs() < 0.01, "{g:?} {u:?}");
            assert!(u[0] > u[2], "red over blue {u:?}");
        }
    }
    assert!(values_layer(&w, 1, 50.0, 2).is_err());
}

#[test]
fn test_values_tones_are_darkest_first_and_painted() {
    let w = work();
    let (layer, tones) = values_layer(&w, 1, 50.0, 0).unwrap();
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

/// A made-up picture with many edges of every strength: soft blocks of two sizes.
fn busy() -> atelier_core::img::Rgb {
    let (n, mut data) = (128usize, Vec::new());
    for y in 0..n {
        for x in 0..n {
            let cell = |s: usize, k: usize| {
                ((((x / s) * 7919 + (y / s) * 104_729 + k) * 2_654_435_761) >> 8) % 256
            };
            let v = (cell(32, 1) * 3 + cell(11, 2) * 2 + cell(5, 3) / 2) / 5;
            data.extend_from_slice(&[v as u8, v as u8, (v / 2 + 40) as u8]);
        }
    }
    atelier_core::img::Rgb::from_vec(n, n, 3, data)
}

/// Pixels with any ink.
fn ink(l: &atelier_core::render::Layer) -> usize {
    l.rgba.chunks(4).filter(|p| p[3] > 0).count()
}

#[test]
fn test_amount_marks() {
    let w = busy();
    let few = edges_layer(&w, 0, 0.0, 3, 0.0).unwrap();
    let some = edges_layer(&w, 0, 33.0, 3, 0.0).unwrap();
    let many = edges_layer(&w, 0, 67.0, 3, 0.0).unwrap();
    let most = edges_layer(&w, 0, 100.0, 3, 0.0).unwrap();
    assert!(ink(&many) > 0 && ink(&few) <= ink(&many));
    assert_ne!(some, few);
    assert_ne!(some, many);
    assert!(ink(&few) < ink(&many));
    assert!(ink(&most) >= ink(&many));
}

#[test]
fn test_transfer_mode() {
    let w = work();
    let t = edges_layer(&w, 1, 50.0, 3, 0.0).unwrap();
    assert!(ink(&t) > 0);
    assert_ne!(t, edges_layer(&w, 0, 50.0, 3, 0.0).unwrap());
}

#[test]
fn test_masses_borders_only() {
    let w = work();
    let v = edges_view(&w, 2, 0.0, 3, 0.0).unwrap();
    let l = edges_layer(&w, 2, 0.0, 3, 0.0).unwrap();
    let n = ink(&l);
    assert!(n > 0 && n < w.width * w.height / 2);
    for (p, q) in v.data.chunks(3).zip(l.rgba.chunks(4)) {
        let on = p != [255, 255, 255];
        assert_eq!(q[3] > 0, on);
    }
}

#[test]
fn test_masses_amount_picks_level() {
    let w = work();
    let big = ink(&edges_layer(&w, 2, 0.0, 3, 0.0).unwrap());
    let small = ink(&edges_layer(&w, 2, 100.0, 3, 0.0).unwrap());
    assert!(big < small, "{big} {small}");
}
