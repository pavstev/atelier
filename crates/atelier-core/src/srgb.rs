//! The sRGB transfer curve, written once: a byte to linear light and back.
//!
//! The f64 pair is for the exact curve. The f32 table is for the tools that
//! turn a whole picture into lightness (Values, Shapes). Both come from the same f64 formula, so
//! the table is the f64 value cast to f32. `oklab` keeps its own encoder: it takes f32 and clamps
//! first, which is not the same arithmetic. The Rec. 709 luma of the bytes is here too, and the
//! Rec. 601 luma of the bytes.

use std::sync::OnceLock;

use crate::img::Rgb;

/// An sRGB byte as linear light, in `f64`.
pub(crate) fn to_linear_f64(v: u8) -> f64 {
    let c = f64::from(v) / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        libm::pow((c + 0.055) / 1.055, 2.4)
    }
}

/// Linear light of every sRGB byte, as `f32`.
pub(crate) fn linear_table() -> &'static [f32; 256] {
    static T: OnceLock<[f32; 256]> = OnceLock::new();
    T.get_or_init(|| std::array::from_fn(|i| to_linear_f64(i as u8) as f32))
}

/// The linear luminance Y of one pixel (Rec. 709 weights), from its three sRGB bytes.
pub(crate) fn linear_luma(px: &[u8]) -> f32 {
    let t = linear_table();
    0.2126 * t[px[0] as usize] + 0.7152 * t[px[1] as usize] + 0.0722 * t[px[2] as usize]
}

/// The linear luminance Y of every pixel of an RGB image, as [`linear_luma`].
pub(crate) fn linear_luma_of(img: &Rgb) -> Vec<f32> {
    img.data.chunks_exact(3).map(linear_luma).collect()
}

/// The Rec. 601 luma of every pixel of an RGB image, 0 to 255, on the sRGB bytes as they are (no
/// linear light). Edges and the deblock finder use it.
pub(crate) fn luma601(img: &Rgb) -> Vec<f32> {
    img.data
        .chunks_exact(3)
        .map(|p| 0.299 * f32::from(p[0]) + 0.587 * f32::from(p[1]) + 0.114 * f32::from(p[2]))
        .collect()
}

/// CIE L* (0..=100) of a linear luminance.
pub(crate) fn l_star(y: f32) -> f32 {
    let f = if y > 216.0 / 24389.0 {
        libm::cbrtf(y)
    } else {
        (24389.0 / 27.0 * y + 16.0) / 116.0
    };
    (116.0 * f - 16.0).clamp(0.0, 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_the_table_is_the_f64_curve_cast_to_f32() {
        let t = linear_table();
        assert_eq!(t[0], 0.0);
        assert_eq!(t[255], 1.0);
        for v in 0..=255u8 {
            assert_eq!(t[v as usize], to_linear_f64(v) as f32, "{v}");
        }
    }

    #[test]
    fn test_luma_of_grey_is_its_linear_value() {
        let g = linear_luma(&[128, 128, 128]);
        assert!((g - linear_table()[128]).abs() < 1e-6, "{g}");
        assert!((linear_luma(&[255, 255, 255]) - 1.0).abs() < 1e-6);
    }
}
