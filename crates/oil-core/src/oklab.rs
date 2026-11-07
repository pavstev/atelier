//! `OKLab`: the space the Values and Shapes tools measure color in.
//!
//! `OKLab` (Ottosson, 2020) keeps equal steps closer to equal looks than 8-bit Lab does, and it
//! has no 8-bit rounding. L runs from 0 (black) to 1 (white); a and b are about -0.4 to 0.4.
//! Points are `[L, a, b]` in `f32`. Going back to sRGB rounds to the nearest byte.
//!
//! Every step is plain `f32` arithmetic plus one table of `libm` values, so the same input gives
//! the same bytes on every machine. The cube root is a bit-trick start and three Newton steps.

use crate::img::Rgb;
use crate::srgb::linear_table;

/// A color as `[L, a, b]`.
pub(crate) type Ok3 = [f32; 3];

/// Linear light to an sRGB value in 0..=1 (clamped first).
fn encode(v: f32) -> f32 {
    let v = f64::from(v.clamp(0.0, 1.0));
    let e = if v <= 0.003_130_8 {
        v * 12.92
    } else {
        libm::pow(v, 1.0 / 2.4) * 1.055 - 0.055
    };
    e as f32
}

/// Cube root of a value in 0..=1 or a bit above. Same bits on every machine.
fn cbrt(x: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    let mut y = f32::from_bits(x.to_bits() / 3 + 709_921_077);
    for _ in 0..3 {
        y = (2.0 * y + x / (y * y)) * (1.0 / 3.0);
    }
    y
}

/// One linear-light color to `OKLab`.
fn from_linear(r: f32, g: f32, b: f32) -> Ok3 {
    let l = cbrt(0.412_221_47 * r + 0.536_332_55 * g + 0.051_445_995 * b);
    let m = cbrt(0.211_903_5 * r + 0.680_699_5 * g + 0.107_396_96 * b);
    let s = cbrt(0.088_302_46 * r + 0.281_718_85 * g + 0.629_978_7 * b);
    [
        0.210_454_26 * l + 0.793_617_8 * m - 0.004_072_047 * s,
        1.977_998_5 * l - 2.428_592_2 * m + 0.450_593_7 * s,
        0.025_904_037 * l + 0.782_771_77 * m - 0.808_675_77 * s,
    ]
}

/// `OKLab` of one sRGB byte color.
pub(crate) fn from_srgb(px: [u8; 3]) -> Ok3 {
    let t = linear_table();
    from_linear(t[px[0] as usize], t[px[1] as usize], t[px[2] as usize])
}

/// `OKLab` of every pixel of an RGB image, row by row.
pub(crate) fn image_to_oklab(src: &Rgb) -> Vec<Ok3> {
    src.data
        .chunks_exact(3)
        .map(|p| from_srgb([p[0], p[1], p[2]]))
        .collect()
}

/// The nearest sRGB byte color: out-of-gamut values are clamped, the rest is rounded.
pub(crate) fn to_srgb(c: Ok3) -> [u8; 3] {
    let l = c[0] + 0.396_337_78 * c[1] + 0.215_803_76 * c[2];
    let m = c[0] - 0.105_561_346 * c[1] - 0.063_854_17 * c[2];
    let s = c[0] - 0.089_484_18 * c[1] - 1.291_485_5 * c[2];
    let (l, m, s) = (l * l * l, m * m * m, s * s * s);
    let lin = [
        4.076_741_7 * l - 3.307_711_6 * m + 0.230_969_93 * s,
        -1.268_438 * l + 2.609_757_4 * m - 0.341_319_4 * s,
        -0.004_196_086 * l - 0.703_418_6 * m + 1.707_614_7 * s,
    ];
    lin.map(|v| (encode(v) * 255.0).round().clamp(0.0, 255.0) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cbrt_close_to_libm() {
        let mut worst = 0f32;
        for i in 1..=2000 {
            let x = (i as f32 / 2000.0).powi(3) * 1.2;
            let want = libm::cbrtf(x);
            worst = worst.max(((cbrt(x) - want) / want).abs());
        }
        assert!(worst < 2e-6, "worst relative error {worst}");
        assert_eq!(cbrt(0.0), 0.0);
        assert_eq!(cbrt(-1.0), 0.0);
    }

    #[test]
    fn test_known_colors() {
        let white = from_srgb([255, 255, 255]);
        assert!((white[0] - 1.0).abs() < 1e-4, "{white:?}");
        assert!(white[1].abs() < 1e-4 && white[2].abs() < 1e-4);
        assert_eq!(from_srgb([0, 0, 0]), [0.0; 3]);
        // Ottosson's reference values for pure red
        let red = from_srgb([255, 0, 0]);
        for (g, w) in red.iter().zip([0.627_955, 0.224_863, 0.125_846]) {
            assert!((g - w).abs() < 2e-4, "{red:?}");
        }
    }

    #[test]
    fn test_every_byte_color_round_trips() {
        for r in (0..=255u8).step_by(5) {
            for g in (0..=255u8).step_by(5) {
                for b in (0..=255u8).step_by(5) {
                    assert_eq!(to_srgb(from_srgb([r, g, b])), [r, g, b]);
                }
            }
        }
        for v in 0..=255u8 {
            assert_eq!(to_srgb(from_srgb([v, v, v])), [v, v, v]);
        }
    }

    #[test]
    fn test_rounds_and_clamps() {
        // a tiny nudge rounds back to the same byte color, it never truncates down
        let a = from_srgb([200, 100, 50]);
        assert_eq!(to_srgb([a[0] + 1e-5, a[1], a[2]]), [200, 100, 50]);
        assert_eq!(to_srgb([a[0] - 1e-5, a[1], a[2]]), [200, 100, 50]);
        // far outside the gamut stays in 0..=255
        assert_eq!(to_srgb([2.0, 0.0, 0.0]), [255, 255, 255]);
        assert_eq!(to_srgb([-1.0, 0.0, 0.0]), [0, 0, 0]);
    }
}
