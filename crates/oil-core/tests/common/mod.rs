//! Shared helpers of the tool reference tests (`tools_*.rs`): the synthetic fixture, made-up
//! model maps and the check against a PNG in `tests/reference`.

// Each test file uses a different part of these helpers.
#![allow(dead_code)]

use oil_core::img::Rgb;
use oil_core::render::{Layer, prepare_work};
use std::path::PathBuf;

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

/// A 3 channel PNG as pixels.
pub fn decode_png(bytes: &[u8]) -> Rgb {
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
        .read_info()
        .expect("read the PNG");
    let mut buf = vec![0; reader.output_buffer_size().expect("PNG size")];
    let info = reader.next_frame(&mut buf).expect("decode the PNG");
    assert_eq!(info.color_type, png::ColorType::Rgb);
    buf.truncate(info.buffer_size());
    Rgb::from_vec(info.width as usize, info.height as usize, 3, buf)
}

/// An RGB picture as PNG bytes (8 bit, adaptive filter, fast deflate).
pub fn encode_rgb(img: &Rgb) -> Vec<u8> {
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, img.width as u32, img.height as u32);
    enc.set_color(png::ColorType::Rgb);
    enc.set_depth(png::BitDepth::Eight);
    enc.set_compression(png::Compression::Fast);
    enc.set_filter(png::Filter::Adaptive);
    let mut writer = enc.write_header().expect("write the PNG header");
    writer.write_image_data(&img.data).expect("write the PNG");
    writer.finish().expect("finish the PNG");
    out
}

/// The layer laid over the picture with straight alpha, the way the app stacks it.
pub fn over(base: &Rgb, layer: &Layer) -> Rgb {
    let mut out = base.clone();
    for (px, l) in out.data.chunks_exact_mut(3).zip(layer.rgba.chunks_exact(4)) {
        let alpha = u32::from(l[3]);
        for (p, &s) in px.iter_mut().zip(&l[..3]) {
            *p = ((u32::from(s) * alpha + u32::from(*p) * (255 - alpha) + 127) / 255) as u8;
        }
    }
    out
}

pub fn ref_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/reference")
        .join(format!("{name}.png"))
}

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
