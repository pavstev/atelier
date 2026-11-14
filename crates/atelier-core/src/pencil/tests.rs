//! Tests of the Pencil view as a whole: the looks, the set, the knobs and the accent rule.

use super::drawing::hash;
use super::*;

const TONE: Look = Look::Tone;
const DRAWING: Look = Look::Drawing;
const ZONES: Look = Look::Zones;
const HATCH: Look = Look::Hatch;

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

/// The view with the start of every knob but the ones given.
fn view_of(work: &Rgb, mask: u32, detail: f32, look: Look) -> Result<Pencil> {
    view(
        work,
        &Knobs {
            look,
            mask,
            detail,
            ..Knobs::default()
        },
    )
}

/// The view of a ramp at the start of every knob but the ones `set` changes.
fn ramp_with(look: Look, set: impl FnOnce(&mut Knobs)) -> Pencil {
    let mut k = Knobs {
        look,
        ..Knobs::default()
    };
    set(&mut k);
    view(&ramp(256, 32), &k).unwrap()
}

/// The mean green byte of a picture.
fn mean(img: &Rgb) -> f64 {
    let g: Vec<f64> = img.data.chunks_exact(3).map(|c| f64::from(c[1])).collect();
    g.iter().sum::<f64>() / g.len() as f64
}

#[test]
fn test_a_ramp_uses_every_pencil_darkest_first() {
    for look in [TONE, ZONES] {
        let p = view_of(&ramp(256, 64), 255, 0.5, look).unwrap();
        assert_eq!(p.tones.len(), 9);
        assert!(
            p.shares.iter().all(|&s| s > 0),
            "look {look:?}: {:?}",
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
    let tone = view_of(&w, 255, 0.5, TONE).unwrap();
    let zones = view_of(&w, 255, 0.5, ZONES).unwrap();
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
    let tone = view_of(&ramp(256, 64), 0b1111_1001, 0.5, TONE).unwrap();
    assert_eq!(tone.tones.len(), 7);
    // nothing is darker than the darkest pencil of the set (the 9B)
    let darkest = tone.tones[0][1];
    assert!(tone.image.data.chunks_exact(3).all(|c| c[1] >= darkest));
    let zones = view_of(&ramp(256, 64), 0b1111_1001, 0.5, ZONES).unwrap();
    assert!(colors(&zones.image).iter().all(|c| zones.tones.contains(c)));
}

#[test]
fn test_drawing_keeps_the_tone_and_adds_grain() {
    let w = ramp(256, 128);
    let tone = view_of(&w, 255, 0.5, TONE).unwrap();
    let art = view_of(&w, 255, 0.5, DRAWING).unwrap();
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
        let p = view_of(&img, 255, 0.5, look).unwrap();
        assert_eq!(p.shares[0], 0, "look {look:?}: {:?}", p.shares);
        assert_eq!(p.shares[1], 0, "look {look:?}: {:?}", p.shares);
        assert!(p.shares[2] >= 60, "look {look:?}: {:?}", p.shares);
        // Deep darks at 100 percent lets the 9B take it
        let k = Knobs {
            look,
            darks: 100,
            ..Knobs::default()
        };
        let q = view(&img, &k).unwrap();
        assert!(q.shares[0] >= 60, "look {look:?}: {:?}", q.shares);
    }
    // a lone 9B on paper keeps its zone: paper never takes the dark mass
    let q = view_of(&img, 1, 0.5, ZONES).unwrap();
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
        let p = view_of(&img, 255, d, TONE).unwrap();
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
    for look in [TONE, DRAWING, ZONES, HATCH] {
        assert_eq!(
            view_of(&w, 255, 0.5, look),
            view_of(&w, 255, 0.5, look),
            "{look:?}"
        );
    }
}

#[test]
fn test_bad_numbers_are_bad_input() {
    let w = ramp(32, 32);
    assert!(view_of(&w, 0, 0.5, TONE).is_err());
    assert!(view_of(&w, 256, 0.5, TONE).is_err());
    assert!(view_of(&w, 255, 1.5, TONE).is_err());
    assert!(view_of(&Rgb::new(0, 0, 3), 255, 0.5, TONE).is_err());
    assert!(Look::from_index(5).is_err());
    assert!(Paper::from_index(3).is_err());
    // a Highlights over 100 is clamped, not a panic
    let k = Knobs {
        highlights: 200,
        ..Knobs::default()
    };
    assert!(view(&w, &k).is_ok());
}

#[test]
fn test_a_flat_photo_does_not_panic() {
    for look in [TONE, DRAWING, ZONES, HATCH] {
        let p = view_of(&Rgb::filled(32, 32, &[120, 120, 120]), 255, 0.5, look).unwrap();
        assert!(p.shares.iter().map(|&s| u32::from(s)).sum::<u32>() >= 100);
    }
}

#[test]
fn test_the_start_knobs_are_the_numbers_of_the_view_before_the_knobs() {
    let k = Knobs::default();
    // the white point was the 99th percentile and the accent share 20 percent, as literals
    assert_eq!(k.white_q(), 0.99);
    assert_eq!(k.accent_share(), 0.2);
    assert_eq!((k.key, k.contrast, k.grain), (0.5, 0.5, 0.5));
    assert_eq!(k.look, Look::Tone);
}

#[test]
fn test_a_key_at_the_middle_changes_nothing_and_a_lighter_key_lightens() {
    let start = ramp_with(TONE, |_| {});
    assert_eq!(start, ramp_with(TONE, |k| k.key = 0.5));
    let (dark, light) = (
        ramp_with(TONE, |k| k.key = 0.1),
        ramp_with(TONE, |k| k.key = 0.9),
    );
    assert!(mean(&dark.image) < mean(&start.image));
    assert!(mean(&start.image) < mean(&light.image));
    // the ends stay: the darkest pencil and paper
    assert_eq!(light.image.pixel(0, 0), light.tones[0]);
    assert_eq!(dark.image.pixel(255, 0), dark.tones[8]);
}

#[test]
fn test_contrast_steepens_the_middle_and_keeps_the_ends() {
    let start = ramp_with(TONE, |_| {});
    assert_eq!(start, ramp_with(TONE, |k| k.contrast = 0.5));
    let (soft, hard) = (
        ramp_with(TONE, |k| k.contrast = 0.0),
        ramp_with(TONE, |k| k.contrast = 1.0),
    );
    let step = |p: &Pencil| {
        // the change of the tone across the middle of the ramp
        i32::from(p.image.pixel(160, 0)[1]) - i32::from(p.image.pixel(96, 0)[1])
    };
    assert!(step(&hard) > step(&soft), "{} {}", step(&hard), step(&soft));
    for p in [&soft, &hard] {
        assert_eq!(p.image.pixel(0, 0), p.tones[0]);
        assert_eq!(p.image.pixel(255, 0), p.tones[8]);
    }
}

#[test]
fn test_more_highlights_leave_more_bare_paper() {
    let paper = |h: u8| *ramp_with(TONE, |k| k.highlights = h).shares.last().unwrap();
    let shares = [0, 1, 5, 25].map(paper);
    assert!(shares.windows(2).all(|p| p[0] <= p[1]), "{shares:?}");
    assert!(shares[3] > shares[1] + 10, "{shares:?}");
    // Zones read the same knob
    let zone = |h: u8| {
        *ramp_with(ZONES, |k| k.highlights = h)
            .shares
            .last()
            .unwrap()
    };
    assert!(zone(25) > zone(1));
}

#[test]
fn test_deep_darks_sets_how_much_the_soft_pencils_may_cover() {
    // 30 percent black: over the 20 percent start, under 40
    let (w, h) = (100, 10);
    let mut img = Rgb::new(w, h, 3);
    for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
        let v = if i % w < 30 {
            4
        } else {
            (60 + (i % w - 30) * 2) as u8
        };
        px.copy_from_slice(&[v, v, v]);
    }
    let soft = |darks: u8| {
        let k = Knobs {
            darks,
            ..Knobs::default()
        };
        let s = view(&img, &k).unwrap().shares;
        s[0] + s[1]
    };
    assert_eq!(soft(0), 0);
    assert_eq!(soft(20), 0);
    assert!(soft(40) >= 25, "{}", soft(40));
}

#[test]
fn test_hatch_draws_as_drawing_until_it_has_its_own_strokes() {
    let w = ramp(64, 32);
    assert_eq!(
        view_of(&w, 255, 0.5, HATCH).unwrap(),
        view_of(&w, 255, 0.5, DRAWING).unwrap()
    );
}

#[test]
fn test_grain_scales_the_drawing_and_zero_is_the_tone() {
    let tone = ramp_with(TONE, |_| {});
    assert_eq!(ramp_with(DRAWING, |k| k.grain = 0.0).image, tone.image);
    let swing = |grain: f32| {
        let art = ramp_with(DRAWING, |k| k.grain = grain);
        let diff = |a: &Pencil, b: &Pencil| {
            a.image
                .data
                .iter()
                .zip(&b.image.data)
                .map(|(&x, &y)| u64::from(x.abs_diff(y)))
                .sum::<u64>()
        };
        diff(&art, &tone)
    };
    assert!(swing(0.25) < swing(0.5) && swing(0.5) < swing(1.0));
}

#[test]
fn test_nothing_is_darker_than_the_darkest_pencil_and_shares_cover_the_picture() {
    // seeded masks, one bit pattern each
    let mut seed = 0x2545_F491u32;
    for _ in 0..24 {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let mask = (seed >> 24).max(1);
        for look in [TONE, ZONES] {
            let p = view_of(&ramp(128, 8), mask, 0.5, look).unwrap();
            assert_eq!(p.tones.len(), mask.count_ones() as usize + 1);
            let darkest = p.tones[0][1];
            assert!(
                p.image.data.chunks_exact(3).all(|c| c[1] >= darkest),
                "mask {mask} look {look:?}"
            );
            let sum: u32 = p.shares.iter().map(|&s| u32::from(s)).sum();
            assert!(sum >= 100, "mask {mask} look {look:?}: {:?}", p.shares);
        }
    }
}
