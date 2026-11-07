//! Tests of the shapes module.

use super::*;

/// Four flat rectangles of strong, different colors.
fn four_rects() -> Rgb {
    let (w, h) = (96, 64);
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            let c = if x < 30 {
                [200, 40, 40]
            } else if y < 20 {
                [40, 60, 200]
            } else if y < 44 {
                [230, 220, 60]
            } else {
                [40, 160, 60]
            };
            data.extend_from_slice(&c);
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

/// Slow gradients plus two blocks, so merges have real choices.
fn ramps() -> Rgb {
    let (w, h) = (120, 80);
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            let (mut r, mut g, mut b) = (60 + x, 80 + y, 120 + usize::midpoint(x, y));
            if (30..60).contains(&x) && (20..50).contains(&y) {
                (r, g, b) = (230, 200, 90);
            }
            if x >= 90 && y >= 50 {
                (r, g, b) = (20, 20, 30);
            }
            data.extend_from_slice(&[r as u8, g as u8, b as u8]);
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

fn small_opts() -> ShapesOpts {
    ShapesOpts {
        seeds: 60,
        ..ShapesOpts::default()
    }
}

#[test]
fn test_levels_nest() {
    for img in [four_rects(), ramps()] {
        let s = decompose(&img, &small_opts());
        assert!(s.is_nested());
        let counts: Vec<usize> = s.levels.iter().map(|l| l.shapes.len()).collect();
        assert!(
            counts[BIG] <= counts[MID] && counts[MID] <= counts[SMALL],
            "{counts:?}"
        );
        for l in [MID, SMALL] {
            let up = &s.levels[l - 1];
            for sh in &s.levels[l].shapes {
                assert!((sh.parent.unwrap() as usize) < up.shapes.len());
            }
        }
        for lv in &s.levels {
            let total: u32 = lv.shapes.iter().map(|s| s.area).sum();
            assert_eq!(total as usize, s.width * s.height);
        }
    }
}

#[test]
fn test_four_rects_make_four_big_shapes() {
    let s = decompose(&four_rects(), &small_opts());
    let big = &s.levels[BIG];
    assert_eq!(big.shapes.len(), 4, "{:?}", big.shapes);
    // each rectangle is one shape: the labels of its corners differ from the others
    let at = |x: usize, y: usize| big.labels[y * s.width + x];
    let corners = [at(2, 2), at(60, 2), at(60, 30), at(60, 60)];
    for i in 0..4 {
        for j in i + 1..4 {
            assert_ne!(corners[i], corners[j]);
        }
    }
    assert_eq!(big.shapes[at(2, 2) as usize].rgb, [200, 40, 40]);
    assert_eq!(big.shapes[at(60, 30) as usize].rgb, [230, 220, 60]);
}

#[test]
fn test_same_input_same_labels() {
    let img = ramps();
    let a = decompose(&img, &small_opts());
    let b = decompose(&img, &small_opts());
    assert_eq!(a, b);
}

#[test]
fn test_values() {
    let white = Rgb::filled(16, 16, &[255, 255, 255]);
    let black = Rgb::filled(16, 16, &[0, 0, 0]);
    let grey = Rgb::filled(16, 16, &[119, 119, 119]);
    let o = ShapesOpts {
        seeds: 4,
        ..ShapesOpts::default()
    };
    assert_eq!(decompose(&white, &o).levels[BIG].shapes[0].value, 10);
    assert_eq!(decompose(&black, &o).levels[BIG].shapes[0].value, 0);
    assert_eq!(decompose(&grey, &o).levels[BIG].shapes[0].value, 5);
}

/// A grid of 8 x 6 flat cells in 48 different colors, so every level has real choices.
fn cells() -> Rgb {
    let (w, h) = (160, 120);
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            let k = (x / 20) * 7 + (y / 20) * 13;
            let c = [
                (k * 53 + 20) % 256,
                (k * 97 + 60) % 256,
                (k * 31 + 140) % 256,
            ];
            data.extend_from_slice(&c.map(|v| v as u8));
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

fn sv(level: u8, fill: Fill) -> ShapesView {
    ShapesView {
        level,
        detail: 0.5,
        fill,
        smooth: 0,
        guide: 0.5,
        outline: 1.0,
    }
}

/// The pixels of an outline view that sit on a boundary.
fn boundary(img: &Rgb) -> Vec<bool> {
    img.data
        .chunks_exact(3)
        .map(|p| p == OUTLINE_INK.as_slice())
        .collect()
}

#[test]
fn test_view_levels_nest() {
    for img in [cells(), ramps()] {
        for smooth in [0, 2] {
            let at = |level| ShapesView {
                smooth,
                ..sv(level, Fill::Outline)
            };
            let (big, mid, small) = (
                boundary(&view(&img, &at(0)).unwrap()),
                boundary(&view(&img, &at(1)).unwrap()),
                boundary(&view(&img, &at(2)).unwrap()),
            );
            assert!(big.iter().any(|&b| b), "smooth {smooth}: no boundary");
            for i in 0..big.len() {
                assert!(!big[i] || mid[i], "big not in mid at {i}, smooth {smooth}");
                assert!(
                    !mid[i] || small[i],
                    "mid not in small at {i}, smooth {smooth}"
                );
            }
            let (s, _) = cut(&img, &at(2)).unwrap();
            assert!(s.is_nested(), "smooth {smooth}");
        }
    }
}

#[test]
fn test_view_auto_picks_a_level() {
    for img in [cells(), ramps(), four_rects()] {
        let (s, level) = cut(&img, &sv(3, Fill::Color)).unwrap();
        assert!([BIG, MID, SMALL].contains(&level));
        assert_eq!(level, s.auto);
        let auto = view(&img, &sv(3, Fill::Color)).unwrap();
        let named = view(&img, &sv(level as u8, Fill::Color)).unwrap();
        assert_eq!(auto, named);
    }
    // a flat image has no jump, so the pick is the medium level
    let flat = Rgb::filled(48, 32, &[90, 120, 150]);
    assert_eq!(cut(&flat, &sv(3, Fill::Color)).unwrap().1, MID);
}

#[test]
fn test_view_fill_modes_differ() {
    let img = cells();
    let color = view(&img, &sv(1, Fill::Color)).unwrap();
    let outline = view(&img, &sv(1, Fill::Outline)).unwrap();
    assert_ne!(color, outline);
    for out in [&color, &outline] {
        assert_eq!((out.width, out.height, out.channels), (160, 120, 3));
    }
    let marks = boundary(&outline);
    assert!(marks.iter().any(|&b| b));
    for (p, &on) in outline.data.chunks_exact(3).zip(&marks) {
        assert!(on || p == OUTLINE_PAPER.as_slice());
    }
}

#[test]
fn test_view_outline_is_dark_ink_on_light_paper() {
    let out = view(&cells(), &sv(1, Fill::Outline)).unwrap();
    let luma = |p: &[u8]| (u32::from(p[0]) + u32::from(p[1]) + u32::from(p[2])) / 3;
    let marks = boundary(&out);
    for (p, &on) in out.data.chunks_exact(3).zip(&marks) {
        if on {
            assert!(luma(p) <= 40, "ink {p:?}");
        } else {
            assert!(luma(p) >= 240, "paper {p:?}");
        }
    }
    let ink = marks.iter().filter(|&&b| b).count();
    assert!(ink > 0 && ink * 5 < marks.len(), "{ink} ink pixels");
}

#[test]
fn test_outline_width_follows_the_long_side() {
    assert_eq!(line_width(512, 1.0), 1.0);
    assert_eq!(line_width(1024, 1.0), 1.0);
    assert_eq!(line_width(2048, 1.0), 2.0);
    assert_eq!(line_width(4096, 1.0), 4.0);
    let mut mask = vec![false; 10 * 10];
    mask[5 * 10 + 5] = true;
    let wide = widen(&mask, 10, 10, 2);
    assert_eq!(wide.iter().filter(|&&b| b).count(), 4);
    assert!(wide[5 * 10 + 5] && wide[6 * 10 + 6]);
    assert_eq!(widen(&mask, 10, 10, 3).iter().filter(|&&b| b).count(), 9);
}

/// The biggest jump of the border between label 0 (left) and 1 (right) from one row to the
/// next, in px.
fn biggest_step(labels: &[u32], w: usize, h: usize) -> usize {
    let at = |y: usize| {
        labels[y * w..(y + 1) * w]
            .iter()
            .take_while(|&&l| l == 0)
            .count()
    };
    (1..h).map(|y| at(y).abs_diff(at(y - 1))).max().unwrap_or(0)
}

#[test]
fn test_smooth_rounds_a_stepped_border() {
    // a border in steps of 16 px, as seeds on a grid make it on a flat gradient
    let (w, h) = (160, 128);
    let labels: Vec<u32> = (0..w * h)
        .map(|i| u32::from(i % w >= 40 + (i / w / 16) * 16))
        .collect();
    assert_eq!(biggest_step(&labels, w, h), 16);
    let round = mode_filter(
        &labels,
        w,
        h,
        smooth_radius(1, SMOOTH_PX, 1024),
        None,
        2,
        None,
    );
    let step = biggest_step(&round, w, h);
    assert!(step <= 4, "the border still steps {step} px");
    // the radius grows with the knob and the long side
    assert!(smooth_radius(2, SMOOTH_PX, 1024) > smooth_radius(1, SMOOTH_PX, 1024));
    assert!(smooth_radius(1, SMOOTH_PX, 2048) > smooth_radius(1, SMOOTH_PX, 1024));
    assert_eq!(smooth_radius(1, SMOOTH_PX, 64), 1);
}

/// A grey ramp along the direction 30 degrees below the x axis: iso lines run steeply down
/// to the left, so a border that follows them moves about 0.58 px per row.
fn ramp_30() -> Rgb {
    let (w, h) = (160, 160);
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            let t = (0.866 * x as f32 + 0.5 * y as f32) / (1.366 * (w - 1) as f32);
            let v = (40.0 + 180.0 * t).round() as u8;
            data.extend_from_slice(&[v, v, v]);
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

/// For every pair of labels, the runs of consecutive rows where the pair has exactly one
/// vertical border crossing: the x of that crossing per row.
fn border_runs(labels: &[u32], w: usize, h: usize) -> Vec<Vec<usize>> {
    let mut per_pair: BTreeMap<(u32, u32), Vec<(usize, usize)>> = BTreeMap::new();
    for y in 0..h {
        let mut seen: BTreeMap<(u32, u32), Vec<usize>> = BTreeMap::new();
        for x in 0..w - 1 {
            let (a, b) = (labels[y * w + x], labels[y * w + x + 1]);
            if a != b {
                seen.entry((a.min(b), a.max(b))).or_default().push(x);
            }
        }
        for (pair, xs) in seen {
            if let [x] = xs[..] {
                per_pair.entry(pair).or_default().push((y, x));
            }
        }
    }
    let mut runs = Vec::new();
    for pts in per_pair.values() {
        let mut run = vec![pts[0]];
        for &p in &pts[1..] {
            if p.0 == run[run.len() - 1].0 + 1 {
                run.push(p);
            } else {
                runs.push(std::mem::replace(&mut run, vec![p]));
            }
        }
        runs.push(run);
    }
    runs.into_iter()
        .filter(|r| r.len() >= 12)
        .map(|r| r.into_iter().map(|(_, x)| x).collect())
        .collect()
}

#[test]
fn test_smooth_straightens_a_border_on_a_gradient() {
    // seeds about 16 px apart cut the ramp into cells, and the four bands of the small level
    // have staircase borders between them; snapped and rounded, every border is a straight
    // iso line: no jump over 2 px between rows and no tread of 4 rows or more
    let opts = ShapesOpts {
        seeds: 100,
        counts: [2, 3, 4],
        smooth: 1,
        ..ShapesOpts::default()
    };
    let s = decompose(&ramp_30(), &opts);
    let runs = border_runs(&s.levels[SMALL].labels, s.width, s.height);
    assert!(runs.len() >= 3, "{} border runs", runs.len());
    for xs in &runs {
        let mut tread = 1;
        for pair in xs.windows(2) {
            let dx = pair[0].abs_diff(pair[1]);
            assert!(dx <= 2, "a jump of {dx} px in {xs:?}");
            tread = if dx == 0 { tread + 1 } else { 1 };
            assert!(tread < 4, "a tread of {tread} rows in {xs:?}");
        }
    }
}

#[test]
fn test_snap_keeps_a_thin_shape_with_real_edges() {
    // a dark stripe 8 px wide on a light ramp, with labels that miss its edges by up to 4 px
    // in steps; snapped, the stripe has its true area within 5 percent
    let (w, h) = (96, 64);
    let stripe = |x: usize| (40..48).contains(&x);
    let lab: Vec<Ok3> = (0..w * h)
        .map(|i| {
            let (x, y) = (i % w, i / w);
            let l = if stripe(x) {
                0.2
            } else {
                0.6 + 0.2 * x as f32 / w as f32 + 0.05 * y as f32 / h as f32
            };
            [l, 0.0, 0.0]
        })
        .collect();
    let labels: Vec<u32> = (0..w * h)
        .map(|i| {
            let (x, y) = (i % w, i / w);
            let off = [4usize, 0, 2, 3][(y / 16) % 4];
            if x < 40 - off {
                0
            } else if x < 48 + off {
                1
            } else {
                2
            }
        })
        .collect();
    let snapped = snap_labels(&labels, 3, &lab, w, h, [1.75, 0.75, 0.75], 8);
    let area = snapped.iter().filter(|&&l| l == 1).count();
    let want = 8 * h;
    assert!(
        area.abs_diff(want) * 20 <= want,
        "stripe area {area}, want {want}"
    );
    assert_eq!(relabel(&snapped).1, 3);
}

#[test]
fn test_smooth_keeps_levels_nested_and_deterministic() {
    let img = ramps();
    let v = ShapesView {
        smooth: 3,
        ..sv(2, Fill::Color)
    };
    let (a, _) = cut(&img, &v).unwrap();
    let (b, _) = cut(&img, &v).unwrap();
    assert!(a.is_nested());
    assert_eq!(a, b);
}

#[test]
fn test_view_detail_moves_the_count() {
    let img = cells();
    for level in [0, 1, 2] {
        let count = |detail| {
            let v = ShapesView {
                detail,
                ..sv(level, Fill::Color)
            };
            let (s, l) = cut(&img, &v).unwrap();
            s.levels[l].shapes.len()
        };
        let (few, many) = (count(0.0), count(1.0));
        assert!(few < many, "level {level}: {few} then {many}");
    }
}

#[test]
fn test_view_tiny_images_do_not_panic() {
    for (w, h) in [(1, 1), (1, 40), (40, 1), (3, 3), (8, 8), (4, 200)] {
        let data = (0..w * h).flat_map(|i| [(i * 37) as u8, 90, (i * 11) as u8]);
        let img = Rgb::from_vec(w, h, 3, data.collect());
        for level in 0..4 {
            let v = ShapesView {
                smooth: 3,
                ..sv(level, Fill::Outline)
            };
            let out = view(&img, &v).unwrap();
            assert_eq!((out.width, out.height), (w, h));
        }
    }
}

#[test]
fn test_view_bad_args() {
    let img = cells();
    for v in [
        ShapesView {
            level: 4,
            ..sv(0, Fill::Color)
        },
        ShapesView {
            smooth: 4,
            ..sv(0, Fill::Color)
        },
        ShapesView {
            detail: 1.5,
            ..sv(0, Fill::Color)
        },
        ShapesView {
            guide: -0.1,
            ..sv(0, Fill::Color)
        },
        ShapesView {
            detail: f32::NAN,
            ..sv(0, Fill::Color)
        },
    ] {
        assert!(view(&img, &v).is_err(), "{v:?}");
    }
    let grey = crate::img::Image::<u8>::filled(8, 8, &[100]);
    assert!(view(&grey, &sv(0, Fill::Color)).is_err());
}

#[test]
fn test_view_smooth_removes_specks() {
    // a speck of 1 px inside a flat cell is gone after a radius 1 mode filter
    let labels: Vec<u32> = (0..64).map(|i| u32::from(i == 27)).collect();
    let out = mode_filter(&labels, 8, 8, 1, None, 2, None);
    assert!(out.iter().all(|&l| l == 0));
}

/// Two big olive fields with a small yellow blob (1.2% of the image) on the left one.
fn blob_on_fields() -> Rgb {
    let (w, h) = (128, 96);
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            let blob = (20..32).contains(&x) && (40..52).contains(&y);
            data.extend_from_slice(if blob {
                &[225, 215, 70]
            } else if x < 64 {
                &[110, 105, 60]
            } else {
                &[150, 145, 95]
            });
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

#[test]
fn test_auto_keeps_a_small_clear_subject() {
    let img = blob_on_fields();
    let (shapes, level) = cut(&img, &sv(3, Fill::Color)).unwrap();
    let blob_at = |lv: usize| {
        let l = &shapes.levels[lv];
        let w = shapes.width;
        let blob = l.labels[45 * w + 25] as usize;
        let around = l.labels[45 * w + 10] as usize;
        blob != around
    };
    // the plain jump rule picks a level that swallows the blob
    let jump = jump_pick(&shapes.merge_ratio);
    assert!(!blob_at(jump), "the jump pick already keeps the blob");
    assert!(blob_at(level), "auto lost the blob at level {level}");
    assert!(level > jump);
}

#[test]
fn test_auto_does_not_split_a_calm_picture() {
    let (shapes, level) = cut(&four_rects(), &sv(3, Fill::Color)).unwrap();
    assert_eq!(level, jump_pick(&shapes.merge_ratio));
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
fn test_shapes_same_at_2048() {
    let photo = synthetic();
    let big = crate::render::prepare_work(&photo, 2048).unwrap();
    let small = crate::render::prepare_work(&photo, 1024).unwrap();
    assert!(big.width.max(big.height) > small.width.max(small.height) + 100);
    for level in 0..4u32 {
        let a = crate::render::shapes_view(&big, level, 0.5).unwrap().0;
        let a = crate::resize::resize_lanczos(&a, small.width, small.height);
        let b = crate::render::shapes_view(&small, level, 0.5).unwrap().0;
        let sum: u64 = a
            .data
            .iter()
            .zip(&b.data)
            .map(|(&x, &y)| u64::from(x.abs_diff(y)))
            .sum();
        let mean = sum as f64 / a.data.len() as f64;
        assert!(mean <= 6.0, "level {level}: mean {mean:.2}");
    }
}

#[test]
fn test_outline_skips_a_border_between_alike_shapes() {
    // a gentle ramp of 6 grey steps: every cut is under 4 L*, so no ink is drawn
    let (w, h) = (160, 48);
    let mut data = Vec::with_capacity(w * h * 3);
    for _ in 0..h {
        for x in 0..w {
            data.extend_from_slice(&[128 + (x * 6 / w) as u8; 3]);
        }
    }
    let ramp = Rgb::from_vec(w, h, 3, data);
    let out = view(&ramp, &sv(2, Fill::Outline)).unwrap();
    assert!(boundary(&out).iter().all(|&b| !b), "a band of a gradient");
    // a real step keeps its line
    let out = view(&cells(), &sv(2, Fill::Outline)).unwrap();
    assert!(boundary(&out).iter().any(|&b| b));
    let (a, b) = (shape_of([0.60, 0.0, 0.0]), shape_of([0.62, 0.01, 0.0]));
    assert!(same_paint(&a, &b));
    assert!(!same_paint(&a, &shape_of([0.70, 0.0, 0.0])));
    assert!(!same_paint(&a, &shape_of([0.60, 0.05, 0.0])));
}

fn shape_of(color: [f32; 3]) -> Shape {
    Shape {
        area: 1,
        color,
        rgb: [0; 3],
        value: 0,
        parent: None,
    }
}

#[test]
fn test_outline_width_follows_the_scale() {
    // the start width at the start scale, then every step of the Edges width knob in fractions of a px
    assert_eq!(line_width(1024, 1.0), 1.0);
    assert_eq!(line_width(1024, 0.5), 0.5);
    assert_eq!(line_width(1024, 1.5), 1.5);
    assert_eq!(line_width(2048, 1.5), 3.0);
}

#[test]
fn test_piles_join_near_colors_and_keep_values_apart() {
    // two near darks share a pile; a light and a dark of the same hue do not
    let colors = [[0.30, 0.05, 0.02], [0.31, 0.05, 0.03], [0.80, 0.05, 0.02]];
    let (of, mixed) = piles(&colors, &[100, 50, 80]);
    assert_eq!(of[0], of[1]);
    assert_ne!(of[0], of[2]);
    assert_eq!(mixed.len(), 2);
    // the pile color is the area-weighted mean
    let l = mixed[of[0]][0];
    assert!(
        (l - (0.30 * 100.0 + 0.31 * 50.0) / 150.0).abs() < 1e-5,
        "{l}"
    );
    // many colors one value step apart stay at most PILES_MAX piles when the distance allows
    let ramp: Vec<Ok3> = (0..12).map(|i| [0.2 + 0.03 * i as f32, 0.0, 0.0]).collect();
    let (_, mixed) = piles(&ramp, &[10; 12]);
    assert!(mixed.len() <= PILES_MAX, "{}", mixed.len());
}

#[test]
fn test_steps_view_paints_shadows_first_and_accents_last() {
    // a dark left half, a light right half with a small dark spot in it
    let (w, h) = (256usize, 128usize);
    let mut img = Rgb::filled(w, h, &[40, 40, 45]);
    for y in 0..h {
        for x in w / 2..w {
            let i = img.idx(x, y);
            img.data[i..i + 3].copy_from_slice(&[225, 215, 200]);
        }
    }
    let at = |img: &Rgb, x: usize, y: usize| {
        let i = img.idx(x, y);
        [img.data[i], img.data[i + 1], img.data[i + 2]]
    };
    let v = sv(3, Fill::Color);
    let (first, piles) = steps_view(&img, 0, &v).unwrap();
    assert_ne!(
        at(&first, 20, 64),
        CANVAS,
        "the shadow is painted in step 1"
    );
    assert_eq!(at(&first, 230, 64), CANVAS, "the light waits");
    assert_eq!(piles.len(), 1);
    let (lights, mixed) = steps_view(&img, 2, &v).unwrap();
    assert!(lights.data.chunks(3).all(|p| p != CANVAS));
    // the piles of a step come darkest first
    let l: Vec<f32> = mixed.iter().map(|&p| oklab::from_srgb(p)[0]).collect();
    assert!(l.windows(2).all(|x| x[0] <= x[1]), "{l:?}");
    assert!(steps_view(&img, 4, &v).is_err());
}

#[test]
fn test_piles_never_mix_two_color_families() {
    // a warm color and a gray wall of the same value, plus many grays: the warm color keeps its
    // own pile
    let warm: Ok3 = [0.65, 0.05, 0.04];
    let mut colors = vec![warm];
    colors.extend((0..10).map(|i| [0.3 + 0.05 * i as f32, 0.0, 0.0]));
    let mut areas = vec![50u32];
    areas.extend([100u32; 10]);
    let (of, mixed) = piles(&colors, &areas);
    assert!((1..11).all(|i| of[i] != of[0]));
    assert!((mixed[of[0]][1] - 0.05).abs() < 1e-6);
    // the grays alone stay at most PILES_MAX piles
    assert!(mixed.len() <= PILES_MAX + 1, "{}", mixed.len());
}

#[test]
fn test_steps_view_keeps_a_tiny_light_as_an_accent() {
    // a 5 by 5 px light on a dark field: the steps keep it as its own shape and paint it last
    let (w, h) = (256usize, 128usize);
    let mut img = Rgb::filled(w, h, &[50, 45, 40]);
    for y in 61..66 {
        for x in 126..131 {
            let i = img.idx(x, y);
            img.data[i..i + 3].copy_from_slice(&[250, 240, 220]);
        }
    }
    let at = |img: &Rgb| {
        let i = img.idx(128, 63);
        [img.data[i], img.data[i + 1], img.data[i + 2]]
    };
    let v = sv(3, Fill::Color);
    let (under, _) = steps_view(&img, STEP_MAX - 1, &v).unwrap();
    let (last, mixed) = steps_view(&img, STEP_MAX, &v).unwrap();
    assert!(
        at(&under)[0] < 120,
        "the underpaint is dark: {:?}",
        at(&under)
    );
    assert!(at(&last)[0] > 200, "the light comes last: {:?}", at(&last));
    assert!(!mixed.is_empty() && mixed.len() <= LEGEND_MAX);
}
