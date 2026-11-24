//! Shared helpers of the tool reference tests (`tools_*.rs`): the synthetic fixture and the check
//! against a PNG in `tests/reference`. `over`, the PNG encoder and the start values of the app
//! come from the examples' `support` module.

// Each test file uses a different part of these helpers, so some are dead code or unused imports in
// one file and used in another.
#![allow(dead_code, unused_imports)]

use atelier_core::img::Rgb;
use atelier_core::render::prepare_work;
use std::path::PathBuf;

#[path = "../../examples/support/mod.rs"]
pub mod support;
pub use support::over;

pub const LONG: u32 = 128;
pub const LIMIT: f64 = 3.0;
pub const FIXTURE: &[u8] = include_bytes!("../fixtures/synthetic.png");

/// Mean absolute difference per byte of two images, 0.0 to 255.0. Images of another size or
/// channel count give infinity, so a wrong size always fails.
pub fn mean_diff(a: &Rgb, b: &Rgb) -> f64 {
    if (a.width, a.height, a.channels) != (b.width, b.height, b.channels) || a.data.is_empty() {
        return f64::INFINITY;
    }
    let sum: u64 = a
        .data
        .iter()
        .zip(&b.data)
        .map(|(&x, &y)| u64::from(x.abs_diff(y)))
        .sum();
    sum as f64 / a.data.len() as f64
}

/// The synthetic fixture shrunk to the work size.
pub fn work() -> Rgb {
    prepare_work(&decode_png(FIXTURE), LONG).expect("prepare the fixture")
}

/// The color bytes of a layer, without its alpha.
pub fn rgb_of(layer: &atelier_core::render::Layer) -> Rgb {
    let data = layer
        .rgba
        .chunks_exact(4)
        .flat_map(|p| [p[0], p[1], p[2]])
        .collect();
    Rgb::from_vec(layer.width, layer.height, 3, data)
}

/// A made-up picture with a pattern, so the filters have edges to find.
pub fn pattern(w: usize, h: usize, channels: usize) -> Rgb {
    let data = (0..w * h * channels)
        .map(|i| ((i * 37) ^ (i / 3 * 11)) as u8)
        .collect();
    Rgb::from_vec(w, h, channels, data)
}

/// A gray picture: `f(x, y)` is the byte of every channel.
pub fn gray(w: usize, h: usize, f: impl Fn(usize, usize) -> u8) -> Rgb {
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        for x in 0..w {
            let v = f(x, y);
            data.extend_from_slice(&[v, v, v]);
        }
    }
    Rgb::from_vec(w, h, 3, data)
}

/// An sRGB byte as linear light, 0.0 to 1.0. Written out on purpose: the tests that use it are
/// oracles that must not call the core's `srgb` module.
pub fn srgb_to_linear(v: u8) -> f64 {
    let c = f64::from(v) / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// A 3 channel PNG as pixels.
pub fn decode_png(bytes: &[u8]) -> Rgb {
    support::decode(bytes).expect("decode the PNG")
}

/// An RGB picture as PNG bytes (8 bit, adaptive filter, fast deflate).
pub fn encode_rgb(img: &Rgb) -> Vec<u8> {
    support::png_bytes(img).expect("write the PNG")
}

/// The path of the reference picture `name` in `tests/reference`.
pub fn ref_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/reference")
        .join(format!("{name}.png"))
}

/// A reference picture as pixels; a missing file says how to bless it.
pub fn read_png(path: &PathBuf) -> Rgb {
    let bytes = std::fs::read(path).unwrap_or_else(|e| {
        panic!(
            "no reference {} ({e}); run once with ATELIER_BLESS=1",
            path.display()
        )
    });
    decode_png(&bytes)
}

/// Writes the reference (bless) or compares to it.
pub fn check(name: &str, got: &Rgb) {
    let path = ref_path(name);
    if std::env::var_os("ATELIER_BLESS").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let bytes = encode_rgb(got);
        assert!(
            bytes.len() < 40_000,
            "{name}: reference is {} bytes",
            bytes.len()
        );
        std::fs::write(&path, bytes).unwrap();
        return;
    }
    let want = read_png(&path);
    assert_eq!(
        (got.width, got.height),
        (want.width, want.height),
        "{name}: size differs from the reference"
    );
    let d = mean_diff(got, &want);
    assert!(d <= LIMIT, "{name}: mean difference {d:.3} is over {LIMIT}");
}
