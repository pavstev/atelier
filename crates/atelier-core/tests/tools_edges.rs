//! The Edges layer on small made-up pictures: what its lines follow.

use atelier_core::img::Rgb;
use atelier_core::render::edges_layer;

/// Pixels with any ink in the columns `from..to`.
fn ink_in(w: &Rgb, from: usize, to: usize) -> usize {
    let l = edges_layer(w, 0, 67.0, 3, 0.0).unwrap();
    l.rgba
        .chunks(4)
        .enumerate()
        .filter(|(i, p)| (from..to).contains(&(i % l.width)) && p[3] > 0)
        .count()
}

/// A black strip, then two flat colors of the same brightness (luma 124 for both): a hard luma
/// edge at column 24 and a color edge of equal brightness at column 64.
fn equal_brightness() -> Rgb {
    let (w, h) = (128, 96);
    let mut data = Vec::new();
    for _ in 0..h {
        for x in 0..w {
            data.extend_from_slice(match x {
                0..24 => &[0, 0, 0],
                24..64 => &[200, 100, 50],
                _ => &[50, 150, 186],
            });
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

/// A black strip, then a pale wall with a soft plane edge at column 80: the light steps down by
/// `step` over 24 px.
fn soft_plane(step: f32) -> Rgb {
    let (w, h) = (160, 96);
    let mut data = Vec::new();
    for _ in 0..h {
        for x in 0..w {
            let v = if x < 24 {
                0.0
            } else {
                200.0 - step * ((x as f32 - 68.0) / 24.0).clamp(0.0, 1.0)
            };
            let v = v.round() as u8;
            data.extend_from_slice(&[v, v, v]);
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

#[test]
fn test_edges_keep_a_soft_plane_edge_on_a_calm_wall() {
    let w = soft_plane(12.0);
    assert!(ink_in(&w, 60, 100) > 0, "no line on the soft plane edge");
    assert_eq!(
        ink_in(&w, 36, 52) + ink_in(&w, 112, 160),
        0,
        "ink on a flat wall"
    );
}

#[test]
fn test_edges_sketch_draws_graphite_strokes_on_the_same_edge() {
    let w = equal_brightness();
    let sketch = edges_layer(&w, 3, 67.0, 3, 0.0).unwrap();
    let again = edges_layer(&w, 3, 67.0, 3, 0.0).unwrap();
    assert_eq!(sketch, again, "same input, other bytes");
    let inked: Vec<&[u8]> = sketch.rgba.chunks(4).filter(|p| p[3] > 0).collect();
    let at = |from: usize, to: usize| {
        sketch
            .rgba
            .chunks(4)
            .enumerate()
            .filter(|(i, p)| (from..to).contains(&(i % sketch.width)) && p[3] > 0)
            .count()
    };
    assert!(at(16, 32) > 0, "no stroke on the luma edge");
    assert!(at(56, 72) > 0, "no stroke on the color edge");
    assert_eq!(at(40, 52) + at(76, 128), 0, "ink on a flat color");
    // one gray that is not black
    assert!(inked.iter().all(|p| p[0] == p[1] && p[1] == p[2]));
    assert!(inked.iter().all(|p| p[0] > 10 && p[0] < 120));
    // not the Lines picture
    assert_ne!(sketch, edges_layer(&w, 0, 67.0, 3, 0.0).unwrap());
    // a mode out of range is an error, never a panic
    assert!(edges_layer(&w, 4, 67.0, 3, 0.0).is_err());
}

#[test]
fn test_edges_draw_a_color_edge_of_equal_brightness() {
    let w = equal_brightness();
    assert!(ink_in(&w, 16, 32) > 0, "no line on the luma edge");
    assert!(ink_in(&w, 56, 72) > 0, "no line on the color edge");
    assert_eq!(
        ink_in(&w, 40, 52) + ink_in(&w, 76, 128),
        0,
        "ink on a flat color"
    );
}
