//! Tests of the trace module.

use super::*;

/// A soft ring of `radius` px around the middle of a `size` px square.
fn ring(size: usize, radius: f32) -> Image<u8> {
    let c = size as f32 / 2.0;
    let data = (0..size * size)
        .map(|i| {
            let (x, y) = ((i % size) as f32 - c, (i / size) as f32 - c);
            let d = (x * x + y * y).sqrt() - radius;
            (255.0 * libm::expf(-d * d / 18.0)).round() as u8
        })
        .collect();
    Image::from_vec(size, size, 1, data)
}

fn photo(w: usize, h: usize) -> Rgb {
    Rgb::filled(w, h, &[120, 130, 140])
}

fn small_opts() -> EdgeOpts {
    // 128 px is an eighth of the working size: scale the minimum length with it.
    EdgeOpts {
        min_len: 0.12,
        ink_budget: 4.0,
        ..preset_opts(1)
    }
}

#[test]
fn test_edgelines_flat_map_has_no_chains() {
    for v in [0u8, 90, 255] {
        let flat = Image::<u8>::filled(64, 48, &[v]);
        assert!(trace(&flat, &preset_opts(2)).chains.is_empty(), "{v}");
    }
}

#[test]
fn test_edgelines_disc_map_is_one_closed_chain() {
    let set = trace(&ring(128, 40.0), &small_opts());
    let shape: Vec<_> = set
        .chains
        .iter()
        .map(|c| (c.pts[0], c.pts[c.pts.len() - 1], c.length))
        .collect();
    assert_eq!(set.chains.len(), 1, "{shape:?}");
    let c = &set.chains[0];
    assert!(c.closed);
    assert_eq!(c.pts.first(), c.pts.last());
    for p in &c.pts {
        let r = ((p[0] - 64.0).powi(2) + (p[1] - 64.0).powi(2)).sqrt();
        assert!((r - 40.0).abs() < 2.0, "radius {r}");
    }
}

#[test]
fn test_edgelines_same_input_same_bytes() {
    let (img, map) = (photo(96, 96), ring(96, 30.0));
    for preset in 0..4 {
        let a = view(&img, preset, 0.5, &map).unwrap();
        assert_eq!(a, view(&img, preset, 0.5, &map).unwrap());
    }
    assert_eq!(trace(&map, &preset_opts(2)), trace(&map, &preset_opts(2)));
}

#[test]
fn test_edgelines_presets_draw_a_ring() {
    let (img, map) = (photo(128, 128), ring(128, 40.0));
    let dark = |v: &Rgb| v.data.chunks_exact(3).filter(|p| p[0] < 200).count();
    for preset in [1, 3] {
        let out = view(&img, preset, 0.5, &map).unwrap();
        assert_eq!((out.width, out.height), (128, 128));
        assert!(dark(&out) > 100, "preset {preset}");
    }
}

#[test]
fn test_edgelines_refuses_bad_numbers() {
    let (img, map) = (photo(64, 64), ring(64, 20.0));
    assert!(view(&img, 4, 0.5, &map).is_err());
    assert!(view(&img, 1, 1.5, &map).is_err());
    assert!(view(&img, 1, -0.1, &map).is_err());
    assert!(view(&img, 1, f32::NAN, &map).is_err());
    for preset in 0..4 {
        assert!(view(&img, preset, 0.5, &map).is_ok());
    }
}

#[test]
fn test_edgelines_refuses_a_wrong_size_map() {
    let img = photo(64, 64);
    for (w, h, c) in [(63, 64, 1), (64, 63, 1), (32, 32, 1), (64, 64, 3)] {
        let map = Image::<u8>::new(w, h, c);
        assert!(
            matches!(view(&img, 1, 0.5, &map), Err(Error::BadInput(_))),
            "{w}x{h}x{c}"
        );
    }
    let grey = Image::<u8>::filled(64, 64, &[9]);
    assert!(view(&grey, 1, 0.5, &ring(64, 20.0)).is_err());
}

#[test]
fn test_edgelines_tiny_images_do_not_panic() {
    for (w, h) in [(1, 1), (1, 40), (40, 1), (3, 3), (8, 8), (4, 200)] {
        let img = photo(w, h);
        let map = Image::<u8>::filled(w, h, &[200]);
        for preset in 0..4 {
            let out = view(&img, preset, 0.5, &map).unwrap();
            assert_eq!((out.width, out.height), (w, h));
        }
    }
}

fn line(x0: f32, x1: f32, y0: f32, y1: f32) -> Vec<[f32; 2]> {
    let n = 20;
    (0..=n)
        .map(|i| {
            let t = i as f32 / n as f32;
            [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]
        })
        .collect()
}

#[test]
fn test_edgelines_smoothing_keeps_ends_and_closure() {
    let open: Vec<[f32; 2]> = (0..10).map(|i| [i as f32, (i % 2) as f32]).collect();
    let s = smooth_once(&open, false);
    assert_eq!((s[0], s[9]), (open[0], open[9]));
    let mut closed = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]];
    closed.push(closed[0]);
    let s = smooth_once(&closed, true);
    assert_eq!(s[0], s[4]);
}

/// Gray byte of CIE L* (0 to 100).
fn gray_of_lstar(l: f64) -> u8 {
    let y = ((l + 16.0) / 116.0).powi(3);
    let v = if y <= 0.003_130_8 {
        12.92 * y
    } else {
        1.055 * y.powf(1.0 / 2.4) - 0.055
    };
    (v * 255.0).round().clamp(0.0, 255.0) as u8
}

/// A gray picture from a function of L* at (x, y).
fn gray_picture(w: usize, h: usize, f: impl Fn(usize, usize) -> f64) -> Rgb {
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            data.extend_from_slice(&[gray_of_lstar(f(x, y)); 3]);
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

/// Pixels of an Edges draw that carry ink (darker than the paper).
fn ink_at(out: &Rgb) -> Vec<bool> {
    out.data.chunks_exact(3).map(|p| p[0] < 200).collect()
}

const RING: (f64, f64, f64) = (768.0, 384.0, 150.0);

/// 1024 x 768: a hard square (L* 20 on 80) on the left, a soft ring (L* 60 on 68, 6 px blur) on
/// the right.
fn soft_ring_picture() -> Rgb {
    gray_picture(1024, 768, |x, y| {
        if x < 512 {
            return if (100..300).contains(&x) && (200..500).contains(&y) {
                20.0
            } else {
                80.0
            };
        }
        let d = ((x as f64 - RING.0).powi(2) + (y as f64 - RING.1).powi(2)).sqrt() - RING.2;
        // a smooth step 6 px wide (a Gaussian edge profile of sigma 3)
        let t = f64::midpoint(1.0, libm::erf(d / (6.0 * std::f64::consts::SQRT_2)));
        60.0 + (68.0 - 60.0) * t
    })
}

fn lines_at(work: &Rgb, amount: f64) -> Vec<bool> {
    ink_at(&crate::render::edges_view(work, 0, amount, 3, 0.0).unwrap())
}

#[test]
fn test_soft_ring_found() {
    let ink = lines_at(&soft_ring_picture(), 67.0);
    let steps = 720;
    let found = (0..steps)
        .filter(|k| {
            let a = f64::from(*k) * std::f64::consts::TAU / f64::from(steps);
            let (cx, cy) = (RING.0 + RING.2 * a.cos(), RING.1 + RING.2 * a.sin());
            (-3..=3).any(|dy: i32| {
                (-3..=3).any(|dx: i32| {
                    let (x, y) = ((cx as i32 + dx) as usize, (cy as i32 + dy) as usize);
                    ink[y * 1024 + x]
                })
            })
        })
        .count();
    let share = found as f64 / f64::from(steps);
    assert!(share >= 0.6, "ring share {share:.2}");
}

#[test]
fn test_noise_stays_quiet() {
    let (w, h) = (1024, 768);
    let mut state: u64 = 3;
    let mut next = || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        ((state >> 11) as f64 + 0.5) / (1u64 << 53) as f64
    };
    let noise: Vec<f64> = (0..w * h)
        .map(|_| {
            let (u, v) = (next(), next());
            6.0 * (-2.0 * u.ln()).sqrt() * (std::f64::consts::TAU * v).cos()
        })
        .collect();
    let work = gray_picture(w, h, |x, y| 50.0 + noise[y * w + x]);
    let ink = lines_at(&work, 67.0);
    let share = ink.iter().filter(|&&b| b).count() as f64 / ink.len() as f64;
    assert!(share < 0.002, "noise ink {:.4} percent", share * 100.0);
}

#[test]
fn test_amount_monotone() {
    let work = soft_ring_picture();
    let mut last = 0;
    for amount in [0.0, 25.0, 50.0, 75.0, 100.0] {
        let n = lines_at(&work, amount).iter().filter(|&&b| b).count();
        assert!(n >= last, "amount {amount}: {n} ink px after {last}");
        last = n;
    }
}

/// The synthetic photo of the reference tests.
fn synthetic() -> Rgb {
    let mut reader = png::Decoder::new(std::io::Cursor::new(
        &include_bytes!("../../../tests/fixtures/synthetic.png")[..],
    ))
    .read_info()
    .unwrap();
    let mut buf = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut buf).unwrap();
    buf.truncate(info.buffer_size());
    Rgb::from_vec(info.width as usize, info.height as usize, 3, buf)
}

#[test]
fn test_edges_same_at_2048() {
    let photo = synthetic();
    let big = crate::render::prepare_work(&photo, 2048).unwrap();
    let small = crate::render::prepare_work(&photo, 1024).unwrap();
    assert!(big.width.max(big.height) > small.width.max(small.height) + 100);
    for (mode, amount) in [(0, 33.0), (0, 67.0), (1, 50.0)] {
        let a = crate::render::edges_view(&big, mode, amount, 3, 0.0).unwrap();
        let a = crate::resize::resize_lanczos(&a, small.width, small.height);
        let b = crate::render::edges_view(&small, mode, amount, 3, 0.0).unwrap();
        let sum: u64 = a
            .data
            .iter()
            .zip(&b.data)
            .map(|(&x, &y)| u64::from(x.abs_diff(y)))
            .sum();
        let mean = sum as f64 / a.data.len() as f64;
        assert!(mean <= 8.0, "mode {mode} amount {amount}: mean {mean:.2}");
    }
}

#[test]
fn test_lost_edge_fades() {
    // a vertical step whose contrast falls from L* 60 at the top to L* 4 at the bottom
    // two full contrast steps at the sides set the scale of the map
    let (w, h) = (1024, 1024);
    let work = gray_picture(w, h, |x, y| {
        let contrast = 60.0 - 56.0 * (y as f64 / h as f64);
        if !(100..924).contains(&x) {
            10.0
        } else if x < w / 2 {
            70.0
        } else {
            70.0 - contrast
        }
    });
    let out = crate::render::edges_view(&work, 0, 67.0, 3, 0.0).unwrap();
    let mean_alpha = |rows: std::ops::Range<usize>| -> f64 {
        let mut sum = 0.0;
        let mut n = 0.0;
        for y in rows {
            for x in (w / 2 - 6)..(w / 2 + 6) {
                sum += 255.0 - f64::from(out.data[(y * w + x) * 3]);
                n += 1.0;
            }
        }
        sum / n / 255.0
    };
    let hard = mean_alpha(60..210);
    let soft = mean_alpha(940..1010);
    assert!(hard > 0.1, "hard end alpha {hard:.3}");
    assert!(soft < 0.3 * hard, "soft {soft:.3} hard {hard:.3}");
}

#[test]
fn test_transfer_one_width() {
    let (w, h) = (1024, 768);
    let work = gray_picture(w, h, |x, _| if x < 400 { 20.0 } else { 80.0 });
    let out = crate::render::edges_view(&work, 1, 50.0, 3, 0.0).unwrap();
    let row = &out.data[(h / 2) * w * 3..(h / 2 + 1) * w * 3];
    let covers: Vec<f32> = row
        .chunks_exact(3)
        .map(|p| (255.0 - f32::from(p[0])) / 255.0)
        .filter(|&c| c > 0.0)
        .collect();
    let want = ((1.2 * w as f32 / 1024.0).round() as usize).max(1);
    let total: f32 = covers.iter().sum();
    assert!(
        (total - want as f32).abs() < 0.05,
        "stroke width {total} {covers:?}"
    );
    assert!(covers.iter().any(|&c| c > 0.999), "full black {covers:?}");
}

#[test]
fn test_amount_past_many_draws_clearly_more() {
    // past 67 the gates and the least length and mean fall
    let (many, rich) = (amount_opts(67.0), amount_opts(100.0));
    assert!(rich.high < many.high && rich.low < many.low);
    assert!(rich.min_mean < many.min_mean && rich.min_len < many.min_len);
    // one long line and many short dashes (12 px, under the least length of many): the last
    // third of the knob keeps the dashes too
    let (w, h) = (1024, 512);
    let map = Image::from_vec(
        w,
        h,
        1,
        (0..w * h)
            .map(|i| {
                let (x, y) = (i % w, i / w);
                let dash = (x % 32 == 16 && y % 40 < 12 && y > 100) || (x == 8 && y > 20);
                u8::from(dash) * 230
            })
            .collect(),
    );
    let map = Image::from_vec(w, h, 1, {
        let soft = blur(
            &map.data.iter().map(|&v| f32::from(v)).collect::<Vec<_>>(),
            w,
            h,
            1.0,
        );
        soft.iter().map(|&v| (v * 2.5).min(255.0) as u8).collect()
    });
    let work = photo(w, h);
    let count = |amount: f32| {
        let out = view_amount(&work, false, amount, 1.0, 0.0, &map).unwrap();
        out.data.chunks_exact(3).filter(|p| p[0] < 200).count()
    };
    let (at67, at100) = (count(67.0), count(100.0));
    assert!(
        at100 * 100 >= at67 * 115,
        "{at67} ink px at 67, {at100} at 100"
    );
}

#[test]
fn test_edgelines_a_faint_chain_drops_and_a_long_straight_one_stays() {
    // a map of 0.15 everywhere: a curvy chain fades under the drop, a long straight one has a floor
    let o = preset_opts(1);
    let set = LineSet {
        width: 256,
        height: 256,
        chains: Vec::new(),
        strength: vec![0.15; 256 * 256],
    };
    let chain = |pts: Vec<[f32; 2]>| Chain {
        length: path_length(&pts),
        pts,
        closed: false,
        kind: Kind::Soft,
        contrast: 0.6,
        score: 1.0,
        kept: true,
        gain: 1.0,
    };
    let curvy: Vec<[f32; 2]> = (0..40)
        .map(|i| {
            let a = i as f32 * 0.15;
            [128.0 + 30.0 * libm::cosf(a), 128.0 + 30.0 * libm::sinf(a)]
        })
        .collect();
    assert!(too_faint(&chain(curvy), &set, &o));
    // at 0.22 a long straight chain keeps its floor, a curvy one still drops
    let low = LineSet {
        strength: vec![0.22; 256 * 256],
        chains: Vec::new(),
        ..set
    };
    let straight = line(20.0, 200.0, 50.0, 50.0);
    assert!(!too_faint(&chain(straight), &low, &o));
    let curvy: Vec<[f32; 2]> = (0..40)
        .map(|i| {
            let a = i as f32 * 0.15;
            [128.0 + 30.0 * libm::cosf(a), 128.0 + 30.0 * libm::sinf(a)]
        })
        .collect();
    assert!(too_faint(&chain(curvy), &low, &o));
    // a chain drawn from the model (gain 0) never fades
    let mut part = chain(line(20.0, 40.0, 60.0, 64.0));
    part.gain = 0.0;
    assert!(!too_faint(&part, &set, &o));
    // on a map of 0.35 a black chain stays and a grey one of the same fade is a faint scribble
    let mid = LineSet {
        strength: vec![0.35; 256 * 256],
        ..set
    };
    let curve = || chain(line(20.0, 60.0, 60.0, 70.0));
    assert!(!too_faint(&curve(), &mid, &o));
    let grey = Chain {
        contrast: 0.2,
        ..curve()
    };
    assert!(too_faint(&grey, &mid, &o));
}

#[test]
fn test_edgelines_a_long_straight_line_is_at_least_dark_grey() {
    // two faint lines: a long straight one and a wavy one of the same strength
    let size = 128;
    let map = Image::from_vec(
        size,
        size,
        1,
        (0..size * size)
            .map(|i| {
                let (x, y) = ((i % size) as f32, (i / size) as f32);
                let wave = 96.0 + 12.0 * libm::sinf(y / 5.0);
                let d = (x - 32.0).abs().min((x - wave).abs());
                if (10.0..118.0).contains(&y) {
                    (90.0 * libm::expf(-d * d / 4.0)) as u8
                } else {
                    0
                }
            })
            .collect(),
    );
    let o = EdgeOpts {
        high: 0.15,
        low: 0.05,
        min_mean: 0.05,
        ..small_opts()
    };
    let set = trace(&map, &o);
    let at = |x0: f32, x1: f32| {
        set.chains
            .iter()
            .find(|c| c.pts.iter().all(|p| (x0..x1).contains(&p[0])))
            .map(|c| c.contrast)
            .unwrap()
    };
    assert!(at(28.0, 36.0) >= o.mid, "straight {}", at(28.0, 36.0));
    assert!(at(80.0, 112.0) < o.mid, "wavy {}", at(80.0, 112.0));
}
