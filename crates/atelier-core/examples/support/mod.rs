//! Shared helpers of the examples (`bench`, `edge_score`) and the reference tests: the photo folder
//! scan, the PNG decoder and encoder, the `over` rule and the start values of the app. It is a
//! module of each of them (`mod support;`), not an example of its own.

#![allow(dead_code, reason = "each user takes a part of these helpers")]

use atelier_core::img::{Image, Rgb};
use atelier_core::render::Layer;
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// The Edges width of the app at start (`DEFAULTS` in `app/web/src/features/tools/settings.ts`).
pub const EDGES_WIDTH: u32 = 5;
/// The start Even of the app (`DEFAULTS.edges.even` in `app/web/src/features/tools/settings.ts`).
pub const EDGES_EVEN: f64 = 50.0;

/// The result type of the examples.
pub type Res<T> = Result<T, Box<dyn Error>>;

/// The photos of `dir` whose name holds `only` (all of them for `None`), as PNG paths, sorted. A
/// JPEG is turned into a PNG in `out/.in` with `sips` (macOS), since the core decodes PNG only.
pub fn photos(dir: &Path, out: &Path, only: Option<&str>) -> Res<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if only.is_some_and(|n| !stem(&path).contains(n)) {
            continue;
        }
        let ext = path
            .extension()
            .map(|x| x.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        match ext.as_str() {
            "png" => paths.push(path),
            "jpg" | "jpeg" => {
                let cache = out.join(".in");
                std::fs::create_dir_all(&cache)?;
                let png = cache.join(format!("{}.png", stem(&path)));
                if !png.exists() {
                    let status = Command::new("sips")
                        .args(["-s", "format", "png"])
                        .arg(&path)
                        .arg("--out")
                        .arg(&png)
                        .stdout(Stdio::null())
                        .status()?;
                    if !status.success() {
                        return Err(format!("sips failed on {}", path.display()).into());
                    }
                }
                paths.push(png);
            }
            _ => {}
        }
    }
    paths.sort();
    Ok(paths)
}

/// The file name without its extension.
pub fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Any 8 bit PNG as RGB.
pub fn decode(bytes: &[u8]) -> Res<Rgb> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info()?;
    let mut buf = vec![0; reader.output_buffer_size().ok_or("PNG too large")?];
    let info = reader.next_frame(&mut buf)?;
    let ch = info.color_type.samples();
    let (w, h) = (info.width as usize, info.height as usize);
    let rgb = buf[..w * h * ch]
        .chunks(ch)
        .flat_map(|px| {
            if ch < 3 {
                [px[0]; 3]
            } else {
                [px[0], px[1], px[2]]
            }
        })
        .collect();
    Ok(Image::from_vec(w, h, 3, rgb))
}

/// An RGB picture as PNG bytes (8 bit, adaptive filter, fast deflate).
pub fn png_bytes(img: &Rgb) -> Res<Vec<u8>> {
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, img.width as u32, img.height as u32);
    enc.set_color(png::ColorType::Rgb);
    enc.set_depth(png::BitDepth::Eight);
    enc.set_compression(png::Compression::Fast);
    enc.set_filter(png::Filter::Adaptive);
    let mut writer = enc.write_header()?;
    writer.write_image_data(&img.data)?;
    writer.finish()?;
    Ok(out)
}

/// `layer` laid over `base` with straight alpha, the way the app stacks it.
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
