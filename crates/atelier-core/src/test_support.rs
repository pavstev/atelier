//! Shared helpers of the unit tests: the synthetic photo, a mean difference, the size check
//! "the same look at 2048 px and at 1024 px" and gray pictures made from L* values.

use crate::img::Rgb;
use crate::render::prepare_work;
use crate::resize::resize_lanczos;

/// The synthetic photo of the reference tests.
pub fn synthetic() -> Rgb {
    let mut reader = png::Decoder::new(std::io::Cursor::new(
        &include_bytes!("../tests/fixtures/synthetic.png")[..],
    ))
    .read_info()
    .unwrap();
    let mut buf = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut buf).unwrap();
    buf.truncate(info.buffer_size());
    Rgb::from_vec(info.width as usize, info.height as usize, 3, buf)
}

/// Mean absolute difference per byte of two pictures of the same size, 0.0 to 255.0.
pub fn mean_abs_diff(a: &Rgb, b: &Rgb) -> f64 {
    let sum: u64 = a
        .data
        .iter()
        .zip(&b.data)
        .map(|(&x, &y)| u64::from(x.abs_diff(y)))
        .sum();
    sum as f64 / a.data.len() as f64
}

/// Checks that a view looks the same on the synthetic photo at 2048 px and at 1024 px. For each
/// case, `view` draws both work pictures, the big one is shrunk to the small one, and the mean
/// difference must stay within `tol`.
pub fn assert_same_at_2048<C: std::fmt::Debug>(
    cases: &[C],
    tol: f64,
    view: impl Fn(&Rgb, &C) -> Rgb,
) {
    let photo = synthetic();
    let big = prepare_work(&photo, 2048).unwrap();
    let small = prepare_work(&photo, 1024).unwrap();
    assert!(big.width.max(big.height) > small.width.max(small.height) + 100);
    for case in cases {
        let a = resize_lanczos(&view(&big, case), small.width, small.height);
        let b = view(&small, case);
        let mean = mean_abs_diff(&a, &b);
        assert!(mean <= tol, "{case:?}: mean {mean:.2}");
    }
}

/// The next number of a seeded linear congruential generator (a fixed test sequence, no clock).
pub fn next_lcg(seed: &mut u32) -> u32 {
    *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    *seed
}

/// The mean of `v`.
pub fn mean(v: &[f32]) -> f32 {
    v.iter().sum::<f32>() / v.len() as f32
}

/// A tone plane `w` by `h` of one tone `l` with one dark pixel (17.0) in the corner, so the tone
/// is not the darkest.
pub fn flat_tone(l: f32, w: usize, h: usize) -> Vec<f32> {
    let mut v = vec![l; w * h];
    v[0] = 17.0;
    v
}

/// A tone plane `w` by `h` that ramps from 17 to 95 left to right.
pub fn ramp_tone(w: usize, h: usize) -> Vec<f32> {
    (0..w * h)
        .map(|i| 17.0 + 78.0 * (i % w) as f32 / (w - 1) as f32)
        .collect()
}

/// The mean of the `size` px box at `(x0, y0)` of a plane `w` wide.
pub fn box_mean(v: &[f32], w: usize, (x0, y0): (usize, usize), size: usize) -> f32 {
    let mut s = 0.0;
    for y in y0..y0 + size {
        for x in x0..x0 + size {
            s += v[y * w + x];
        }
    }
    s / (size * size) as f32
}

/// The mean and the largest gap between the 16 px box means of `shown` and `tone`, on a grid of
/// boxes 8 px apart that keeps `margin` px from the border (a hold is cut short there).
pub fn box_gaps(shown: &[f32], tone: &[f32], (w, h): (usize, usize), margin: usize) -> (f32, f32) {
    let (mut sum, mut worst, mut n) = (0.0f32, 0.0f32, 0.0f32);
    for y in (margin..=h - margin - 16).step_by(8) {
        for x in (margin..=w - margin - 16).step_by(8) {
            let gap = (box_mean(shown, w, (x, y), 16) - box_mean(tone, w, (x, y), 16)).abs();
            sum += gap;
            worst = worst.max(gap);
            n += 1.0;
        }
    }
    (sum / n, worst)
}

/// The gray byte (sRGB) of CIE L* `l`, 0 to 100.
pub fn gray_for_l(l: impl Into<f64>) -> u8 {
    let l: f64 = l.into();
    let y = if l > 8.0 {
        ((l + 16.0) / 116.0).powi(3)
    } else {
        l * 27.0 / 24389.0
    };
    let c = if y <= 0.003_130_8 {
        y * 12.92
    } else {
        libm::pow(y, 1.0 / 2.4) * 1.055 - 0.055
    };
    (c * 255.0).round().clamp(0.0, 255.0) as u8
}

/// A gray picture whose L* at (x, y) is `f(x, y)`.
pub fn gray_picture(w: usize, h: usize, f: impl Fn(usize, usize) -> f64) -> Rgb {
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            data.extend_from_slice(&[gray_for_l(f(x, y)); 3]);
        }
    }
    Rgb::from_vec(w, h, 3, data)
}
