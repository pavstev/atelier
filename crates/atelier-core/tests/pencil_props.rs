//! Property tests of the Pencil calls through the public `render` API only: the range checks, the
//! looks, the set and the knobs, and Auto and Suggest. The pictures are small seeded integer grids
//! (no randomness, no photo). The unit tests in `src/pencil/` hold the per-module checks.

use atelier_core::img::Rgb;
use atelier_core::render::{
    PENCIL_NUMBERS, PencilLayer, pencil_auto, pencil_layer, pencil_suggest,
};

mod common;
use common::support::PENCIL_START;
use common::{gray, srgb_to_linear};

/// The look numbers of the five looks.
const LOOKS: [u32; 4] = [0, 1, 3, 4];
const TONE: u32 = 0;
const DRAWING: u32 = 1;
const HATCH: u32 = 3;
const BY_PENCIL: u32 = 4;

/// How far under the darkest pencil Drawing and Hatch may go, in L*: the rounding of the bytes.
const TEXTURE_SLACK: f64 = 0.5;

/// Slots of the numbers array.
const KEY: usize = 1;
const CONTRAST: usize = 2;
const STEP: usize = 10;

/// A small deterministic hash of two integers, 0 to 255.
fn hash(x: usize, y: usize, seed: u32) -> u32 {
    let mut h = (x as u32)
        .wrapping_mul(0x9E37_79B1)
        .wrapping_add((y as u32).wrapping_mul(0x85EB_CA6B))
        .wrapping_add(seed.wrapping_mul(0xC2B2_AE35));
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h & 255
}

/// A ramp from black to white, left to right.
fn ramp(w: usize, h: usize) -> Rgb {
    gray(w, h, |x, _| (x * 255 / (w - 1)) as u8)
}

/// A seeded scene: a ramp across, soft blocks of tone and a little noise.
fn scene(w: usize, h: usize, seed: u32) -> Rgb {
    gray(w, h, |x, y| {
        let block = hash(x / 16, y / 16, seed) as usize;
        let base = usize::midpoint(x * 255 / (w - 1), block);
        (base + hash(x, y, seed + 1) as usize / 16).min(255) as u8
    })
}

/// The numbers at their start with `set` applied.
fn numbers(set: impl FnOnce(&mut [f64; PENCIL_NUMBERS])) -> [f64; PENCIL_NUMBERS] {
    let mut n = PENCIL_START;
    set(&mut n);
    n
}

fn render(img: &Rgb, look: u32, mask: u32, n: &[f64]) -> PencilLayer {
    pencil_layer(img, look, mask, n).expect("a valid Pencil call")
}

/// The CIE L* of one RGB pixel (sRGB, D65).
fn l_star(p: &[u8]) -> f64 {
    let lin = srgb_to_linear;
    let y = 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
    if y > 216.0 / 24389.0 {
        116.0 * y.cbrt() - 16.0
    } else {
        24389.0 / 27.0 * y
    }
}

/// The mean L* of every `size` x `size` box of a layer, row by row.
fn box_means(l: &PencilLayer, size: usize) -> Vec<f64> {
    let (w, h) = (l.layer.width, l.layer.height);
    let mut out = Vec::new();
    // The boxes at the border are skipped: the texture holds its mean over a window that the border
    // cuts short.
    for by in 1..h / size - 1 {
        for bx in 1..w / size - 1 {
            let mut sum = 0.0;
            for y in by * size..(by + 1) * size {
                for x in bx * size..(bx + 1) * size {
                    sum += l_star(&l.layer.rgba[(y * w + x) * 4..][..3]);
                }
            }
            out.push(sum / (size * size) as f64);
        }
    }
    out
}

fn mean_l(l: &PencilLayer) -> f64 {
    let px = l.layer.rgba.chunks_exact(4);
    let n = px.len() as f64;
    px.map(l_star).sum::<f64>() / n
}

/// The green bytes of a layer.
fn greens(l: &PencilLayer) -> impl Iterator<Item = u8> + '_ {
    l.layer.rgba.chunks_exact(4).map(|p| p[1])
}

/// Masks from a seeded walk: every single bit, all bits, and 40 patterns.
fn masks() -> Vec<u32> {
    let mut out: Vec<u32> = (0..8).map(|b| 1 << b).collect();
    out.push(255);
    let mut seed = 0x2545_F491u32;
    for _ in 0..40 {
        seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        out.push((seed >> 24).max(1));
    }
    out
}

#[test]
fn test_every_number_slot_refuses_a_bad_value() {
    let img = ramp(32, 8);
    // slot, lowest, highest, whole numbers only
    let slots: [(usize, f64, f64, bool); PENCIL_NUMBERS] = [
        (0, 0.0, 100.0, false),
        (1, 0.0, 100.0, false),
        (2, 0.0, 100.0, false),
        (3, 0.0, 25.0, true),
        (4, 0.0, 100.0, true),
        (5, 0.0, 100.0, false),
        (6, 0.0, 100.0, false),
        (7, 0.0, 2.0, true),
        (8, 0.0, 179.0, true),
        (9, 0.0, 100.0, false),
        (10, 1.0, 8.0, true),
        (11, 0.0, 100.0, false),
        (12, 0.0, 100.0, false),
        (13, 0.0, 100.0, false),
    ];
    for (slot, lo, hi, whole) in slots {
        // the ends are fine
        for ok in [lo, hi] {
            let n = numbers(|n| n[slot] = ok);
            assert!(
                pencil_layer(&img, TONE, 255, &n).is_ok(),
                "slot {slot} at {ok}"
            );
        }
        let mut bad = vec![
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
            lo - 1.0,
            hi + 1.0,
        ];
        if whole {
            bad.push(lo + 0.5);
        }
        for value in bad {
            let n = numbers(|n| n[slot] = value);
            for look in LOOKS {
                assert!(
                    pencil_layer(&img, look, 255, &n).is_err(),
                    "slot {slot} look {look} value {value}"
                );
            }
        }
    }
}

#[test]
fn test_a_bad_look_set_or_length_is_an_error() {
    let img = ramp(32, 8);
    assert!(pencil_layer(&img, 5, 255, &PENCIL_START).is_err());
    assert!(pencil_layer(&img, u32::MAX, 255, &PENCIL_START).is_err());
    assert!(pencil_layer(&img, TONE, 0, &PENCIL_START).is_err());
    assert!(pencil_layer(&img, TONE, 256, &PENCIL_START).is_err());
    for len in [0, 1, PENCIL_NUMBERS - 1, PENCIL_NUMBERS + 1, 32] {
        let n = vec![50.0; len];
        assert!(pencil_layer(&img, TONE, 255, &n).is_err(), "length {len}");
    }
    // an image that is not RGB
    let flat = Rgb::from_vec(4, 4, 1, vec![128; 16]);
    assert!(pencil_layer(&flat, TONE, 255, &PENCIL_START).is_err());
}

#[test]
fn test_every_look_gives_the_same_bytes_twice() {
    let img = scene(96, 64, 3);
    for look in LOOKS {
        let n = numbers(|n| {
            n[KEY] = 60.0;
            n[CONTRAST] = 65.0;
            n[5] = 30.0;
            n[STEP] = 3.0;
        });
        let a = render(&img, look, 0b1011_0101, &n);
        let b = render(&img, look, 0b1011_0101, &n);
        assert_eq!(a, b, "look {look}");
    }
}

#[test]
fn test_shares_cover_the_picture_in_every_look() {
    let img = scene(64, 48, 5);
    for look in LOOKS {
        for mask in masks() {
            let l = render(&img, look, mask, &PENCIL_START);
            let n = mask.count_ones() as usize + 1;
            assert_eq!(l.tones.len(), n, "look {look} mask {mask}");
            assert_eq!(l.shares.len(), n, "look {look} mask {mask}");
            let sum: u32 = l.shares.iter().map(|&s| u32::from(s)).sum();
            assert!(sum >= 100, "look {look} mask {mask}: {:?}", l.shares);
        }
    }
}

#[test]
fn test_nothing_is_darker_than_the_darkest_pencil_of_the_set() {
    let img = scene(64, 48, 7);
    for look in LOOKS {
        // The texture looks lay grain over the tone but keep their ink floor at the darkest tone.
        let slack = if look == DRAWING || look == HATCH {
            TEXTURE_SLACK
        } else {
            0.0
        };
        for mask in masks() {
            let l = render(&img, look, mask, &PENCIL_START);
            let darkest = l_star(&l.tones[0]) - slack;
            assert!(
                l.layer
                    .rgba
                    .chunks_exact(4)
                    .all(|p| l_star(p) >= darkest - 1e-9),
                "look {look} mask {mask}"
            );
        }
    }
}

#[test]
fn test_by_pencil_stops_at_the_step_and_marks_its_level() {
    let img = scene(64, 48, 9);
    for mask in masks() {
        let pencils = mask.count_ones() as usize;
        for step in 1..=8u32 {
            let l = render(
                &img,
                BY_PENCIL,
                mask,
                &numbers(|n| n[STEP] = f64::from(step)),
            );
            // step 1 is the lightest pencil; a step over the set is the darkest pencil of it
            let level = pencils - (step as usize).min(pencils);
            assert_eq!(l.mark, Some(level as u8), "mask {mask} step {step}");
            let floor = l.tones[level][1];
            assert!(greens(&l).all(|g| g >= floor), "mask {mask} step {step}");
        }
    }
    // the other looks mark nothing
    for look in [TONE, DRAWING, HATCH] {
        assert_eq!(
            render(&img, look, 255, &PENCIL_START).mark,
            None,
            "look {look}"
        );
    }
}

/// How far the box means of a look are from the Tone picture: the mean and the worst box, in L*.
fn box_error(look: u32) -> (f64, f64) {
    let img = ramp(256, 96);
    let tone = box_means(&render(&img, TONE, 255, &PENCIL_START), 16);
    let drawn = box_means(&render(&img, look, 255, &PENCIL_START), 16);
    let errors: Vec<f64> = tone
        .iter()
        .zip(&drawn)
        .map(|(t, d)| (t - d).abs())
        .collect();
    (
        errors.iter().sum::<f64>() / errors.len() as f64,
        errors.iter().fold(0.0, |a, &e| a.max(e)),
    )
}

#[test]
fn test_drawing_and_hatch_keep_the_tone_of_a_16_px_box() {
    // The texture must not move the tone. Drawing: measured mean 0.10 and worst 0.38 L*; the limits
    // are those of its unit test (mean 0.5, worst 2.0). Hatch: three or four lines fall in a box, so
    // a box can be off by a line. The limits are those of the ramp test in `src/pencil/hatch.rs`
    // (mean 2.5, worst 12) with a little room: measured on this ramp, mean 1.61 and worst 12.48 (a
    // band near tone 56). Tighten them if Hatch gets better.
    let (mean, worst) = box_error(DRAWING);
    assert!(
        mean <= 0.5 && worst <= 2.0,
        "Drawing: mean {mean:.2}, worst {worst:.2}"
    );
    let (mean, worst) = box_error(HATCH);
    assert!(
        mean <= 2.5 && worst <= 13.5,
        "Hatch: mean {mean:.2}, worst {worst:.2}"
    );
}

#[test]
fn test_a_lighter_key_lightens_and_more_contrast_spreads_the_tones() {
    let img = scene(96, 64, 11);
    let means: Vec<f64> = [20.0, 35.0, 50.0, 65.0, 80.0]
        .iter()
        .map(|&k| mean_l(&render(&img, TONE, 255, &numbers(|n| n[KEY] = k))))
        .collect();
    assert!(means.windows(2).all(|m| m[0] < m[1]), "key means {means:?}");

    // On a ramp more contrast darkens the dark half and lightens the light half.
    let ramp = ramp(128, 16);
    let half = |contrast: f64, light: bool| {
        let l = render(&ramp, TONE, 255, &numbers(|n| n[CONTRAST] = contrast));
        let (w, h) = (l.layer.width, l.layer.height);
        let cols = if light { w * 3 / 4..w } else { 0..w / 4 };
        let mut sum = 0.0;
        for y in 0..h {
            for x in cols.clone() {
                sum += l_star(&l.layer.rgba[(y * w + x) * 4..][..3]);
            }
        }
        sum / (h * cols.len()) as f64
    };
    let (dark_low, dark_high) = (half(25.0, false), half(75.0, false));
    let (light_low, light_high) = (half(25.0, true), half(75.0, true));
    assert!(
        dark_high < dark_low,
        "dark quarter {dark_low} -> {dark_high}"
    );
    assert!(
        light_high > light_low,
        "light quarter {light_low} -> {light_high}"
    );
}

#[test]
fn test_suggest_gives_count_bits_in_range() {
    let photos = [scene(64, 48, 13), ramp(64, 16), scene(80, 40, 17)];
    for img in &photos {
        for count in 3..=6u32 {
            let mask = pencil_suggest(img, count).unwrap();
            assert!((1..=255).contains(&mask), "count {count} mask {mask}");
            assert_eq!(mask.count_ones(), count, "count {count} mask {mask:#b}");
            assert_eq!(mask, pencil_suggest(img, count).unwrap());
            // the mask is a set the call accepts
            let l = render(img, TONE, mask, &PENCIL_START);
            assert_eq!(l.tones.len(), count as usize + 1);
        }
    }
    for bad in [0, 2, 7, 8, u32::MAX] {
        assert!(pencil_suggest(&photos[0], bad).is_err(), "count {bad}");
    }
}

#[test]
fn test_auto_lands_in_range_and_keeps_the_key_of_a_two_hump_photo() {
    for img in [scene(64, 48, 19), ramp(64, 16), gray(32, 32, |_, _| 128)] {
        let a = pencil_auto(&img).unwrap();
        assert!(
            (0.0..=100.0).contains(&a[0]) && a[0].fract() == 0.0,
            "key {a:?}"
        );
        assert!(
            (0.0..=100.0).contains(&a[1]) && a[1].fract() == 0.0,
            "contrast {a:?}"
        );
        assert!(
            (0.0..=25.0).contains(&a[2]) && a[2].fract() == 0.0,
            "highlights {a:?}"
        );
        assert_eq!(a, pencil_auto(&img).unwrap());
    }
    // two humps of tone, a dark one and a light one, half of the pixels each
    let two = gray(96, 64, |x, y| {
        let spread = (hash(x, y, 23) / 16) as u8;
        if x < 48 { 40 + spread } else { 200 + spread }
    });
    let a = pencil_auto(&two).unwrap();
    assert_eq!(a[7], 1.0, "bimodal flag {a:?}");
    assert_eq!(a[0], 50.0, "key of two humps {a:?}");
    assert!(a[1] <= 50.0, "two humps never get more contrast {a:?}");
}

#[test]
fn test_auto_reads_a_dark_photo_as_low_key() {
    // tones 8 to 60 (L* 2 to 24), and the same picture turned to the light end
    let low =
        |x: usize, y: usize, seed: u32| (8 + hash(x, y, seed) / 8 + (x * 20 / 63) as u32) as u8;
    let dark = gray(64, 48, |x, y| low(x, y, 29));
    let light = gray(64, 48, |x, y| 255 - low(x, y, 31));
    assert_eq!(pencil_auto(&dark).unwrap()[4], 0.0, "dark photo is low key");
    assert_eq!(
        pencil_auto(&light).unwrap()[4],
        2.0,
        "light photo is high key"
    );
}

/// The FNV-1a hash of the RGB bytes of a layer (the alpha byte is always 255).
fn fnv(l: &PencilLayer) -> u32 {
    l.layer
        .rgba
        .chunks_exact(4)
        .flat_map(|px| px[..3].iter().copied())
        .fold(2_166_136_261u32, |h, v| {
            (h ^ u32::from(v)).wrapping_mul(16_777_619)
        })
}

#[test]
fn test_drawing_and_hatch_with_the_effects_off_are_the_bytes_of_commit_372f8530() {
    // Pencil v3: smudge, lift and cross start at 0, and 0 skips their math. These hashes were taken
    // from the view at commit 372f8530, before the three effects, on the same 128 px fixture. The
    // Hatch hash was taken again on 2026-11-23, when Hatch got softer lines: the
    // lines moved, and the effects at 0 still add nothing to them.
    let w = common::work();
    for (look, name, was) in [(1, "drawing", 32_247_863), (3, "hatch", 3_583_726_232)] {
        let got = fnv(&render(&w, look, 255, &PENCIL_START));
        assert_eq!(got, was, "{name} moved from the bytes of 372f8530");
    }
}

#[test]
fn test_tone_at_the_start_knobs_are_the_bytes_they_were_before_the_knobs() {
    // Rule zero of Pencil v2: a neutral knob changes nothing. This hash was taken from the
    // view as it was before the knobs (commit 528c2c77) on the 128 px fixture of the reference
    // tests. The reference check allows a mean difference of 3.0, so it would miss a small drift.
    let w = common::work();
    {
        let (look, name, was) = (0, "tone", 507_565_147);
        let got = fnv(&render(&w, look, 255, &PENCIL_START));
        assert_eq!(got, was, "{name} moved from the bytes before the knobs");
    }
}

/// Slots of the three effects.
const SMUDGE: usize = 11;
const LIFT: usize = 12;
const CROSS: usize = 13;

/// The checks every effect shares, on the 128 px fixture: at 0 and at 100, in each look it works in
/// (`looks`) it moves the picture, and keeps its mean L* within `limit`; in the other looks it does
/// nothing; two runs give the same bytes.
fn check_effect(slot: usize, name: &str, looks: &[u32], limit: f64) {
    let w = common::work();
    let full = numbers(|n| n[slot] = 100.0);
    for look in LOOKS {
        let off = render(&w, look, 255, &PENCIL_START);
        let on = render(&w, look, 255, &full);
        if looks.contains(&look) {
            assert!(on != off, "{name} does not move look {look}");
            let gap = (mean_l(&on) - mean_l(&off)).abs();
            assert!(gap <= limit, "{name} look {look}: mean moved {gap:.2} L*");
            assert!(
                on == render(&w, look, 255, &full),
                "{name} look {look}: two runs differ"
            );
        } else {
            assert!(on == off, "{name} should leave look {look} alone");
        }
    }
}

#[test]
fn test_smudge_blends_along_the_stroke_and_keeps_the_mean_within_one_l_star() {
    check_effect(SMUDGE, "smudge", &[TONE, DRAWING, HATCH], 1.0);
}

#[test]
fn test_lift_pulls_light_streaks_toward_paper_and_moves_the_mean_by_two_l_star_at_most() {
    check_effect(LIFT, "lift", &[TONE, DRAWING, HATCH], 2.0);
}

#[test]
fn test_cross_adds_crossed_work_in_the_darks_of_drawing_and_hatch_only() {
    check_effect(CROSS, "cross", &[DRAWING, HATCH], 1.0);
}
