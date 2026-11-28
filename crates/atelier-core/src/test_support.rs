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
