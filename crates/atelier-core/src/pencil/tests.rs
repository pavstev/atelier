//! Tests of the Pencil view as a whole: the looks, the set and the accent rule.

use super::drawing::hash;
use super::*;

const TONE: u8 = 0;
const DRAWING: u8 = 1;
const ZONES: u8 = 2;

/// A ramp from black to white, left to right.
fn ramp(w: usize, h: usize) -> Rgb {
    let mut img = Rgb::new(w, h, 3);
    for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
        let v = ((i % w) * 255 / (w - 1)) as u8;
        px.copy_from_slice(&[v, v, v]);
    }
    img
}

/// The distinct colors of a picture.
fn colors(img: &Rgb) -> Vec<[u8; 3]> {
    let mut seen: Vec<[u8; 3]> = img
        .data
        .chunks_exact(3)
        .map(|c| [c[0], c[1], c[2]])
        .collect();
    seen.sort_unstable();
    seen.dedup();
    seen
}

#[test]
fn test_a_ramp_uses_every_pencil_darkest_first() {
    for look in [TONE, ZONES] {
        let p = view(&ramp(256, 64), 255, 0.5, look).unwrap();
        assert_eq!(p.tones.len(), 9);
        assert!(
            p.shares.iter().all(|&s| s > 0),
            "look {look}: {:?}",
            p.shares
        );
        // the left edge is the darkest pencil, the right edge is paper
        assert_eq!(p.image.pixel(0, 0), p.tones[0]);
        assert_eq!(p.image.pixel(255, 0), p.tones[8]);
        assert!(p.tones.windows(2).all(|t| t[0][0] < t[1][0]));
    }
}

#[test]
fn test_tone_is_a_smooth_gray_picture_and_zones_are_flat() {
    let w = ramp(256, 32);
    let tone = view(&w, 255, 0.5, TONE).unwrap();
    let zones = view(&w, 255, 0.5, ZONES).unwrap();
    assert_eq!(colors(&zones.image).len(), 9);
    assert!(
        colors(&tone.image).len() > 60,
        "{}",
        colors(&tone.image).len()
    );
    // the tone only gets lighter from left to right
    let row: Vec<u8> = (0..256).map(|x| tone.image.pixel(x, 0)[1]).collect();
    assert!(row.windows(2).all(|p| p[0] <= p[1]), "{row:?}");
}

#[test]
fn test_a_dropped_pencil_is_never_drawn() {
    // no 5B, no 7B: bits 1 and 2 off
    let tone = view(&ramp(256, 64), 0b1111_1001, 0.5, TONE).unwrap();
    assert_eq!(tone.tones.len(), 7);
    // nothing is darker than the darkest pencil of the set (the 9B)
    let darkest = tone.tones[0][1];
    assert!(tone.image.data.chunks_exact(3).all(|c| c[1] >= darkest));
    let zones = view(&ramp(256, 64), 0b1111_1001, 0.5, ZONES).unwrap();
    assert!(colors(&zones.image).iter().all(|c| zones.tones.contains(c)));
}

#[test]
fn test_drawing_keeps_the_tone_and_adds_grain() {
    let w = ramp(256, 128);
    let tone = view(&w, 255, 0.5, TONE).unwrap();
    let art = view(&w, 255, 0.5, DRAWING).unwrap();
    assert_eq!(tone.tones, art.tones);
    assert_eq!(tone.shares, art.shares);
    assert_ne!(tone.image, art.image);
    // in every column band the mean of the drawing is within 2 byte levels of the tone
    for band in 0..16 {
        let mean = |img: &Rgb| {
            let (mut s, mut n) = (0f64, 0f64);
            for y in 0..128 {
                for x in band * 16..band * 16 + 16 {
                    s += f64::from(img.pixel(x, y)[1]);
                    n += 1.0;
                }
            }
            s / n
        };
        let (t, a) = (mean(&tone.image), mean(&art.image));
        assert!((t - a).abs() < 3.0, "band {band}: tone {t} drawing {a}");
    }
}

#[test]
fn test_a_big_dark_mass_is_not_an_accent_pencil() {
    // 70 percent black, 30 percent a light ramp: the black is drawn in the 5B, not the 9B or 7B
    let (w, h) = (100, 10);
    let mut img = Rgb::new(w, h, 3);
    for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
        let x = i % w;
        let v = if x < 70 { 4 } else { (60 + (x - 70) * 6) as u8 };
        px.copy_from_slice(&[v, v, v]);
    }
    for look in [TONE, ZONES] {
        let p = view(&img, 255, 0.5, look).unwrap();
        assert_eq!(p.shares[0], 0, "look {look}: {:?}", p.shares);
        assert_eq!(p.shares[1], 0, "look {look}: {:?}", p.shares);
        assert!(p.shares[2] >= 60, "look {look}: {:?}", p.shares);
    }
    // a lone 9B on paper keeps its zone: paper never takes the dark mass
    let q = view(&img, 1, 0.5, ZONES).unwrap();
    assert!(q.shares[0] >= 60, "{:?}", q.shares);
}

#[test]
fn test_detail_keeps_more_of_the_fine_texture() {
    // a noisy mid-gray: more detail, more spread between neighbors
    let mut img = Rgb::new(64, 64, 3);
    for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
        let v = 110 + (hash(i % 64, i / 64) * 40.0) as u8;
        px.copy_from_slice(&[v, v, v]);
    }
    let spread = |d: f32| {
        let p = view(&img, 255, d, TONE).unwrap();
        let g: Vec<f64> = p
            .image
            .data
            .chunks_exact(3)
            .map(|c| f64::from(c[1]))
            .collect();
        let mean = g.iter().sum::<f64>() / g.len() as f64;
        g.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / g.len() as f64
    };
    assert!(spread(1.0) > spread(0.0), "{} {}", spread(1.0), spread(0.0));
}

#[test]
fn test_same_input_same_bytes() {
    let w = ramp(64, 64);
    for look in [TONE, DRAWING, ZONES] {
        assert_eq!(view(&w, 255, 0.5, look), view(&w, 255, 0.5, look));
    }
}

#[test]
fn test_bad_numbers_are_bad_input() {
    let w = ramp(32, 32);
    assert!(view(&w, 0, 0.5, TONE).is_err());
    assert!(view(&w, 256, 0.5, TONE).is_err());
    assert!(view(&w, 255, 1.5, TONE).is_err());
    assert!(view(&w, 255, 0.5, 3).is_err());
    assert!(view(&Rgb::new(0, 0, 3), 255, 0.5, TONE).is_err());
}

#[test]
fn test_a_flat_photo_does_not_panic() {
    for look in [TONE, DRAWING, ZONES] {
        let p = view(&Rgb::filled(32, 32, &[120, 120, 120]), 255, 0.5, look).unwrap();
        assert!(p.shares.iter().map(|&s| u32::from(s)).sum::<u32>() >= 100);
    }
}
