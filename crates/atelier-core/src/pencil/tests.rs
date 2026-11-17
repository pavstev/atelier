//! Tests of the Pencil view as a whole: the looks, the set, the knobs and the accent rule.

use super::paper::hash;
use super::*;

const TONE: Look = Look::Tone;
const DRAWING: Look = Look::Drawing;
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
    {
        let look = TONE;
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
fn test_tone_is_a_smooth_gray_picture() {
    let w = ramp(256, 32);
    let tone = view_of(&w, 255, 0.5, TONE).unwrap();
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
    {
        let look = TONE;
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
}

#[test]
fn test_detail_keeps_more_of_the_fine_texture() {
    // a noisy mid-gray: more detail, more spread between neighbors
    let mut img = Rgb::new(64, 64, 3);
    for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
        let v = 110 + (hash((i % 64) as i32, (i / 64) as i32) * 40.0) as u8;
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
    for look in [TONE, DRAWING, HATCH] {
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
    assert!(Look::from_number(5).is_err());
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
    for look in [TONE, DRAWING, HATCH] {
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
fn test_local_contrast_is_off_at_zero_and_adds_texture_when_on() {
    // a mid-gray with a faint texture, about 4 L* either way
    let mut img = Rgb::new(64, 64, 3);
    for (i, px) in img.data.chunks_exact_mut(3).enumerate() {
        let v = 110 + (hash((i % 64) as i32, (i / 64) as i32) * 8.0) as i32;
        px.copy_from_slice(&[v as u8; 3]);
    }
    let draw = |local: f32| {
        let k = Knobs {
            local,
            detail: 1.0,
            ..Knobs::default()
        };
        view(&img, &k).unwrap()
    };
    let spread = |p: &Pencil| {
        let m = mean(&p.image);
        let g: Vec<f64> = p
            .image
            .data
            .chunks_exact(3)
            .map(|c| f64::from(c[1]))
            .collect();
        g.iter().map(|v| (v - m).powi(2)).sum::<f64>() / g.len() as f64
    };
    let (off, some, full) = (draw(0.0), draw(0.5), draw(1.0));
    assert_eq!(off, view_of(&img, 255, 1.0, TONE).unwrap());
    assert!(spread(&off) < spread(&some) && spread(&some) < spread(&full));
    // the tones and the picture's ends are still the pencils
    assert_eq!(off.tones, full.tones);
}

/// By pencil on a ramp at `step`, with the pencils of `mask`.
fn by_pencil(mask: u32, step: u8) -> Pencil {
    let k = Knobs {
        look: Look::ByPencil,
        mask,
        step,
        ..Knobs::default()
    };
    view(&ramp(256, 16), &k).unwrap()
}

#[test]
fn test_by_pencil_draws_only_the_lightest_pencils_up_to_the_step() {
    let tone = view_of(&ramp(256, 16), 255, 0.5, TONE).unwrap();
    assert_eq!(tone.mark, None);
    for step in 1..=8u8 {
        let p = by_pencil(255, step);
        // step 1 is the lightest pencil (level 7), step 8 the darkest (level 0)
        let mark = 8 - usize::from(step);
        assert_eq!(p.mark, Some(mark as u8), "step {step}");
        // nothing is darker than the pencil of the step
        let floor = p.tones[mark][1];
        assert!(
            p.image.data.chunks_exact(3).all(|c| c[1] >= floor),
            "step {step}"
        );
        // the legend keeps the shares of the finished Tone picture
        assert_eq!(p.shares, tone.shares, "step {step}");
        assert_eq!(p.tones, tone.tones);
    }
    // with every pencil down, it is the Tone picture
    assert_eq!(by_pencil(255, 8).image, tone.image);
    // a lighter step only lightens
    let (a, b) = (by_pencil(255, 3), by_pencil(255, 4));
    assert!(a.image.data.iter().zip(&b.image.data).all(|(x, y)| x >= y));
    assert_ne!(a.image, b.image);
}

#[test]
fn test_a_step_over_the_set_takes_the_darkest_pencil_of_the_set() {
    // three pencils: 7B, HB, 4H
    let p = by_pencil(0b1001_0010, 8);
    assert_eq!(p.tones.len(), 4);
    assert_eq!(p.mark, Some(0));
    assert_eq!(p.image, by_pencil(0b1001_0010, 3).image);
    // a set of one: the only pencil is every step
    assert_eq!(by_pencil(1, 5).mark, Some(0));
    assert_eq!(by_pencil(1, 1).mark, Some(0));
}

#[test]
fn test_hatch_keeps_the_levels_and_the_same_input_gives_the_same_bytes() {
    let w = ramp(128, 64);
    let tone = view_of(&w, 255, 0.5, TONE).unwrap();
    let hatch = view_of(&w, 255, 0.5, HATCH).unwrap();
    assert_eq!(tone.tones, hatch.tones);
    assert_eq!(tone.shares, hatch.shares);
    assert_ne!(tone.image, hatch.image);
    assert_ne!(hatch.image, view_of(&w, 255, 0.5, DRAWING).unwrap().image);
    assert_eq!(hatch, view_of(&w, 255, 0.5, HATCH).unwrap());
}

#[test]
fn test_rougher_paper_and_another_angle_are_other_drawings() {
    let base = ramp_with(DRAWING, |_| {});
    assert_ne!(
        ramp_with(DRAWING, |k| k.paper = Paper::Rough).image,
        base.image
    );
    assert_ne!(ramp_with(DRAWING, |k| k.angle = 120).image, base.image);
    let hatch = ramp_with(HATCH, |_| {});
    assert_ne!(ramp_with(HATCH, |k| k.density = 1.0).image, hatch.image);
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
        {
            let look = TONE;
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

#[test]
fn look_two_is_bad_input() {
    assert!(matches!(Look::from_number(2), Err(Error::BadInput(_))));
}

#[test]
fn looks_keep_ids() {
    assert_eq!(Look::from_number(0).unwrap(), Look::Tone);
    assert_eq!(Look::from_number(1).unwrap(), Look::Drawing);
    assert_eq!(Look::from_number(3).unwrap(), Look::Hatch);
    assert_eq!(Look::from_number(4).unwrap(), Look::ByPencil);
}
