//! Tests of the values module.

use super::*;

/// The view, picture only (no tint).
fn view(work: &Rgb, preset: u8, detail: f32) -> Result<Rgb> {
    super::view(work, preset, detail, 0).map(|v| v.0)
}

fn gray_for_l(l: f32) -> u8 {
    let y = f64::from(y_from_l(l));
    let c = if y <= 0.003_130_8 {
        y * 12.92
    } else {
        libm::pow(y, 1.0 / 2.4) * 1.055 - 0.055
    };
    (c * 255.0).round() as u8
}

/// A flat photo of L* `bg` with a square dot of L* `dot`.
fn dot_photo(bg: f32, dot: f32) -> Rgb {
    // 36 x 36 = 1296 px, under 0.25 percent of 800 x 800 (1600 px). Two guided passes of
    // radius 8 reach 16 px, so the dot must be wider than 32 px to keep its center value.
    let (w, h, d) = (800usize, 800usize, 36usize);
    let mut img = Rgb::filled(w, h, &[gray_for_l(bg); 3]);
    for y in 382..382 + d {
        for x in 382..382 + d {
            let i = img.idx(x, y);
            img.data[i..i + 3].fill(gray_for_l(dot));
        }
    }
    img
}

/// The five value labels of a picture at the default detail (0.5), as the view makes them.
fn five_labels(img: &Rgb) -> Vec<u8> {
    let o = ValuesOpts::default();
    let a = analyze(img, &o);
    let min_px = ((img.width * img.height) as f32 * view_min_area(0.5)).ceil() as u32;
    clean_labels(&a.smooth, img.width, img.height, &FIVE_CUTS, min_px, &o)
}

#[test]
fn test_gradient_gives_five_steps() {
    let (w, h) = (256usize, 64usize);
    let mut img = Rgb::new(w, h, 3);
    for y in 0..h {
        for x in 0..w {
            let i = img.idx(x, y);
            img.data[i..i + 3].fill(x as u8);
        }
    }
    let labels = five_labels(&img);
    assert_eq!(used_steps(&labels), 5);
    for y in 0..h {
        let row = &labels[y * w..(y + 1) * w];
        assert!(row.windows(2).all(|p| p[0] <= p[1]), "row {y} not monotone");
        assert_eq!(row[0], 0);
        assert_eq!(row[w - 1], 4);
    }
}

#[test]
fn test_bright_dot_two_steps_up_survives() {
    let labels = five_labels(&dot_photo(30.0, 70.0));
    assert_eq!(labels[400 * 800 + 400], 3, "the dot is gone");
    assert_eq!(labels[5 * 800 + 5], 1);
    assert_eq!(used_steps(&labels), 2);
}

#[test]
fn test_dot_one_step_up_is_merged() {
    let labels = five_labels(&dot_photo(30.0, 50.0));
    assert_eq!(used_steps(&labels), 1);
    assert_eq!(labels[400 * 800 + 400], 1);
}

#[test]
fn test_median_and_box_on_flat_input() {
    let flat = vec![42.0f32; 20 * 10];
    let m = median(&flat, 20, 10, 2);
    assert!(m.iter().all(|&v| (v - 42.0).abs() < 0.4));
    let b = filters::box_mean(&flat, 20, 10, 8);
    assert!(b.iter().all(|&v| (v - 42.0).abs() < 1e-3));
}

/// How many different colors a picture holds.
fn tone_count(img: &Rgb) -> usize {
    let mut colors: Vec<[u8; 3]> = img
        .data
        .chunks_exact(3)
        .map(|p| [p[0], p[1], p[2]])
        .collect();
    colors.sort_unstable();
    colors.dedup();
    colors.len()
}

/// A horizontal ramp of L* from `lo` at the left to `hi` at the right.
fn ramp(w: usize, h: usize, lo: f32, hi: f32) -> Rgb {
    let mut img = Rgb::new(w, h, 3);
    for y in 0..h {
        for x in 0..w {
            let l = lo + (hi - lo) * x as f32 / (w - 1) as f32;
            let i = img.idx(x, y);
            img.data[i..i + 3].fill(gray_for_l(l));
        }
    }
    img
}

#[test]
fn test_view_presets_give_their_step_counts() {
    let img = ramp(320, 64, 3.0, 97.0);
    for (preset, tones) in [(0u8, 2usize), (1, 3), (2, 5), (3, 4), (4, 4), (5, 3)] {
        let out = view(&img, preset, 0.5).expect("view");
        assert_eq!((out.width, out.height), (320, 64));
        assert_eq!(tone_count(&out), tones, "preset {preset}");
    }
}

#[test]
fn test_view_key_rule_adds_steps() {
    // A blown out photo: 95 percent of the width is a ramp around L* 90, the rest is white.
    let (w, h) = (400usize, 80usize);
    let mut img = ramp(w, h, 82.0, 98.0);
    for y in 0..h {
        for x in w * 95 / 100..w {
            let i = img.idx(x, y);
            img.data[i..i + 3].fill(255);
        }
    }
    let a = analyze(&img, &ValuesOpts::default());
    assert!(a.otsu > KEY_LIGHT, "the photo is not blown out: {}", a.otsu);
    let o = ValuesOpts::default();
    let min_px = ((w * h) as f32 * view_min_area(0.5)).ceil() as u32;
    let plain = clean_labels(&a.smooth, w, h, &THREE_CUTS, min_px, &o);
    assert!(used_steps(&plain) < 3, "the plain cut already has 3 steps");
    assert_eq!(tone_count(&view(&img, 1, 0.5).expect("view")), 3);
    assert_eq!(tone_count(&view(&img, 2, 0.5).expect("view")), 3);
    // the same on a very dark photo
    let dark = ramp(w, h, 1.0, 17.0);
    assert!(analyze(&dark, &ValuesOpts::default()).otsu < KEY_DARK);
    assert_eq!(tone_count(&view(&dark, 1, 0.5).expect("view")), 3);
    // the notan stays two tones
    assert_eq!(tone_count(&view(&img, 0, 0.5).expect("view")), 2);
}

#[test]
fn test_view_bad_preset() {
    let img = ramp(32, 32, 10.0, 90.0);
    for preset in [6u8, 7, 255] {
        assert!(
            matches!(
                view(&img, preset, 0.5),
                Err(crate::error::Error::BadInput(_))
            ),
            "preset {preset}"
        );
    }
    for detail in [-0.1f32, 1.1, f32::NAN] {
        assert!(view(&img, 1, detail).is_err(), "detail {detail}");
    }
    assert!(view(&Rgb::from_vec(2, 2, 1, vec![0; 4]), 1, 0.5).is_err());
}

#[test]
fn test_view_min_area_hits_its_marks() {
    for (detail, share) in [(0.0f32, 0.0005f32), (0.5, 0.0025), (1.0, 0.01)] {
        assert!(
            (view_min_area(detail) - share).abs() < 1e-6,
            "detail {detail}"
        );
    }
}

#[test]
fn test_view_same_input_same_bytes() {
    let img = ramp(128, 48, 5.0, 95.0);
    for preset in 0..5u8 {
        assert_eq!(view(&img, preset, 0.3), view(&img, preset, 0.3));
    }
}

fn pixel(img: &Rgb, x: usize, y: usize) -> [u8; 3] {
    let p = img.pixel(x, y);
    [p[0], p[1], p[2]]
}

/// The synthetic photo of the reference tests.
fn synthetic() -> Rgb {
    let mut reader = png::Decoder::new(std::io::Cursor::new(
        &include_bytes!("../../tests/fixtures/synthetic.png")[..],
    ))
    .read_info()
    .unwrap();
    let mut buf = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut buf).unwrap();
    buf.truncate(info.buffer_size());
    Rgb::from_vec(info.width as usize, info.height as usize, 3, buf)
}

#[test]
fn test_values_same_at_2048() {
    let photo = synthetic();
    let big = crate::render::prepare_work(&photo, 2048).unwrap();
    let small = crate::render::prepare_work(&photo, 1024).unwrap();
    assert!(big.width.max(big.height) > small.width.max(small.height) + 100);
    for preset in 0..5u8 {
        let a = view(&big, preset, 0.5).unwrap();
        let a = crate::resize::resize_lanczos(&a, small.width, small.height);
        let b = view(&small, preset, 0.5).unwrap();
        let sum: u64 = a
            .data
            .iter()
            .zip(&b.data)
            .map(|(&x, &y)| u64::from(x.abs_diff(y)))
            .sum();
        let mean = sum as f64 / a.data.len() as f64;
        assert!(mean <= 6.0, "preset {preset}: mean {mean:.2}");
    }
}

// ---------------------------------------------------------------------------------------------
// Eval fixes: one step over most of the picture

#[test]
fn test_dominant_step_is_the_biggest_step_and_its_share() {
    assert_eq!(dominant_step(&[1, 1, 1, 0]), (1, 0.75));
    assert_eq!(dominant_step(&[]), (0, 0.0));
}

#[test]
fn test_three_is_rekeyed_when_one_step_covers_most_of_the_picture() {
    // a pale photo: 85 percent a flat L* 60 (the middle step), a darker and a lighter strip
    let (w, h) = (400usize, 100usize);
    let mut img = Rgb::filled(w, h, &[gray_for_l(60.0); 3]);
    for y in 0..h {
        for x in 0..w {
            let l = if x < 30 {
                30.0
            } else if x >= 370 {
                80.0
            } else {
                // a faint ramp over the middle so the thirds are different values
                55.0 + 10.0 * x as f32 / w as f32
            };
            let i = img.idx(x, y);
            img.data[i..i + 3].fill(gray_for_l(l));
        }
    }
    let o = ValuesOpts::default();
    let a = analyze(&img, &o);
    let min_px = ((w * h) as f32 * view_min_area(0.5)).ceil() as u32;
    let plain = clean_labels(&a.smooth, w, h, &THREE_CUTS, min_px, &o);
    let (step, share) = dominant_step(&plain);
    assert!(
        step == 1 && share > ONE_STEP_MAX,
        "not the middle step: {step} {share}"
    );
    let out = view(&img, 1, 0.5).unwrap();
    let dark = pixel(&out, 15, 50);
    let mid = pixel(&out, 200, 50);
    let light = pixel(&out, 385, 50);
    assert!(dark != mid && mid != light, "still flat");
    // the Five preset is left alone
    assert!(tone_count(&view(&img, 2, 0.5).unwrap()) <= 5);
}

#[test]
fn test_three_keeps_a_light_or_a_dark_key() {
    // a high-key photo: 85 percent a flat L* 92 (the lightest step), a mid and a dark strip
    let (w, h) = (400usize, 100usize);
    let mut img = Rgb::filled(w, h, &[gray_for_l(92.0); 3]);
    for y in 0..h {
        for x in 0..w {
            let l = if x < 30 {
                30.0
            } else if x >= 370 {
                55.0
            } else {
                92.0
            };
            let i = img.idx(x, y);
            img.data[i..i + 3].fill(gray_for_l(l));
        }
    }
    let o = ValuesOpts::default();
    let a = analyze(&img, &o);
    let min_px = ((w * h) as f32 * view_min_area(0.5)).ceil() as u32;
    let plain = clean_labels(&a.smooth, w, h, &THREE_CUTS, min_px, &o);
    let (step, share) = dominant_step(&plain);
    assert!(
        step == 2 && share > ONE_STEP_MAX,
        "not light: {step} {share}"
    );
    // the field stays the lightest tone, as in the plain cut
    let out = view(&img, 1, 0.5).unwrap();
    assert_eq!(
        pixel(&out, 200, 50),
        pixel(&paint_tones(&plain, &THREE_TONES, 0, w, h).0, 200, 50)
    );
    // the same photo upside down in value: 85 percent L* 8 (the darkest step)
    let mut dark_img = img.clone();
    for p in &mut dark_img.data {
        *p = 255 - *p;
    }
    let a = analyze(&dark_img, &o);
    let plain = clean_labels(&a.smooth, w, h, &THREE_CUTS, min_px, &o);
    let (step, share) = dominant_step(&plain);
    assert!(
        step == 0 && share > ONE_STEP_MAX,
        "not dark: {step} {share}"
    );
    let out = view(&dark_img, 1, 0.5).unwrap();
    assert_eq!(
        pixel(&out, 200, 50),
        pixel(&paint_tones(&plain, &THREE_TONES, 0, w, h).0, 200, 50)
    );
}

#[test]
fn test_three_cuts_keep_the_light_and_shadow_families() {
    // the bigger family gets the second step: here the shadow side (a dark and a mid shadow)
    let mut l = vec![15.0f32; 30];
    l.extend([35.0; 30]);
    l.extend([85.0; 40]);
    let [c, brk] = three_cuts(&l, 55.0);
    assert!(
        (15.0..=35.0).contains(&c) && (brk - 55.0).abs() < 1e-6,
        "{c} {brk}"
    );
    // the mirror: the light side is bigger
    let mut l = vec![15.0f32; 40];
    l.extend([70.0; 30]);
    l.extend([90.0; 30]);
    let [brk, c] = three_cuts(&l, 55.0);
    assert!(
        (70.0..=90.0).contains(&c) && (brk - 55.0).abs() < 1e-6,
        "{c} {brk}"
    );
    // no family to split: the break alone
    assert_eq!(three_cuts(&[50.0; 40], 55.0), [55.0, ABOVE_ALL]);
}

/// A reach that pins nothing: the photo reaches neither V2 nor V8.
const NO_REACH: [f32; 2] = [100.0, 0.0];

#[test]
fn test_munsell_tones_span_the_paint_as_far_as_the_photo_reaches() {
    // a photo from L* 8 to 95: the darkest step goes to V2, the lightest to V8
    let tones = munsell_tones(&[0, 1, 2], &[50.0, 52.0, 53.0], 3, 2, [8.0, 95.0]);
    assert_eq!(tones, vec![MUNSELL_L[1], MUNSELL_L[4], MUNSELL_L[7]]);
    // a light key (L* 70 to 95) keeps its key
    let tones = munsell_tones(&[0, 1, 2], &[90.0, 91.0, 91.0], 3, 2, [70.0, 95.0]);
    assert_eq!(tones, vec![MUNSELL_L[4], MUNSELL_L[6], MUNSELL_L[8]]);
    // a dark key (L* 5 to 40) keeps its key
    let tones = munsell_tones(&[0, 1, 2], &[10.0, 20.0, 30.0], 3, 2, [5.0, 40.0]);
    assert_eq!(tones, vec![MUNSELL_L[0], MUNSELL_L[2], MUNSELL_L[4]]);
}

#[test]
fn test_munsell_tones_are_whole_values_two_apart() {
    let tones = munsell_tones(
        &[0, 0, 1, 1, 2],
        &[18.0, 19.0, 40.0, 41.0, 82.0],
        3,
        2,
        NO_REACH,
    );
    assert_eq!(tones, vec![MUNSELL_L[1], MUNSELL_L[3], MUNSELL_L[7]]);
    // close means move apart, two values each
    let tones = munsell_tones(&[0, 1, 2], &[50.0, 52.0, 53.0], 3, 2, NO_REACH);
    assert_eq!(tones, vec![MUNSELL_L[4], MUNSELL_L[6], MUNSELL_L[8]]);
    // at the top of the scale the steps move down
    let tones = munsell_tones(&[0, 1, 2], &[90.0, 91.0, 91.0], 3, 2, NO_REACH);
    assert_eq!(tones, vec![MUNSELL_L[4], MUNSELL_L[6], MUNSELL_L[8]]);
    // a step with no pixel sits two values over the one under it
    let tones = munsell_tones(&[0, 2], &[30.0, 80.0], 3, 2, NO_REACH);
    assert_eq!(tones, vec![MUNSELL_L[2], MUNSELL_L[4], MUNSELL_L[7]]);
    // a gap of one
    let tones = munsell_tones(&[0, 1, 2], &[50.0, 52.0, 53.0], 3, 1, NO_REACH);
    assert_eq!(tones, vec![MUNSELL_L[4], MUNSELL_L[5], MUNSELL_L[6]]);
}

#[test]
fn test_families_keeps_two_flat_tones_apart() {
    // half L* 40, half L* 60: no family has a second step, the break still splits the two
    let (w, h) = (800usize, 100usize);
    let mut img = Rgb::filled(w, h, &[gray_for_l(40.0); 3]);
    for y in 0..h {
        for x in w / 2..w {
            let i = img.idx(x, y);
            img.data[i..i + 3].fill(gray_for_l(60.0));
        }
    }
    let out = view(&img, 5, 0.5).unwrap();
    assert!(pixel(&out, 20, 50)[0] < pixel(&out, 780, 50)[0]);
    assert_eq!(tone_count(&out), 2);
}
