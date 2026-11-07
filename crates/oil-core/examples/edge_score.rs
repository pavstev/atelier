//! Edge score input: draws the Edges layer for every photo of a folder at the photo's own long
//! side and saves its alpha (the ink) as a gray PNG, one per photo. `scripts/edge_score.py` scores
//! those pictures against the BSDS500 boundaries. The pictures go only to the folder you give, so
//! keep it under `.agents/`.
//!
//! ```text
//! cargo run -q --release -p oil-core --example edge_score -- IN OUT [MODE] [AMOUNT]
//! ```
//!
//! `IN` holds PNG or JPEG photos (a JPEG is turned into a PNG with `sips`, in `OUT/.in`). `MODE`
//! is 0 lines, 1 transfer, 2 masses (default 0); `AMOUNT` is 0 to 100 (default 67).

#![allow(clippy::print_stdout, reason = "the tool prints one line per photo")]

use oil_core::img::{Image, Rgb};
use oil_core::render::{edges_layer, prepare_work};
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// The Edges width of the app at start (`DEFAULTS` in `app/web/src/settings.ts`).
const EDGES_WIDTH: u32 = 5;
/// The start Even of the app (`DEFAULTS.edges.even` in `app/web/src/settings.ts`).
const EDGES_EVEN: f64 = 50.0;

type Res<T> = Result<T, Box<dyn Error>>;

fn main() -> Res<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [input, output, rest @ ..] = args.as_slice() else {
        return Err("usage: edge_score IN OUT [MODE] [AMOUNT]".into());
    };
    let mode: u32 = rest.first().map_or(Ok(0), |m| m.parse())?;
    let amount: f64 = rest.get(1).map_or(Ok(67.0), |a| a.parse())?;
    let out = Path::new(output);
    std::fs::create_dir_all(out)?;
    for path in photos(Path::new(input), out)? {
        let photo = decode(&std::fs::read(&path)?)?;
        let long = photo.width.max(photo.height);
        let work = prepare_work(&photo, u32::try_from(long)?)?;
        let layer = edges_layer(&work, mode, amount, EDGES_WIDTH, EDGES_EVEN)?;
        let alpha: Vec<u8> = layer.rgba.chunks_exact(4).map(|p| p[3]).collect();
        let name = format!("{}.png", stem(&path));
        let mut bytes = Vec::new();
        let mut enc = png::Encoder::new(&mut bytes, layer.width as u32, layer.height as u32);
        enc.set_color(png::ColorType::Grayscale);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header()?;
        writer.write_image_data(&alpha)?;
        writer.finish()?;
        std::fs::write(out.join(&name), bytes)?;
        println!("{name} {}x{}", layer.width, layer.height);
    }
    Ok(())
}

/// The photos of `dir` as PNG paths, sorted. A JPEG is turned into a PNG in `out/.in` with `sips`
/// (macOS), since the core decodes PNG only.
fn photos(dir: &Path, out: &Path) -> Res<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
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

fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Any 8 bit PNG as RGB.
fn decode(bytes: &[u8]) -> Res<Rgb> {
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
