//! Edge score input: draws the Edges layer for every photo of a folder at the photo's own long
//! side and saves its alpha (the ink) as a gray PNG, one per photo. `scripts/edge_score.py` scores
//! those pictures against the BSDS500 boundaries. The pictures go only to the folder you give, so
//! keep it under `.agents/`.
//!
//! ```text
//! cargo run -q --release -p atelier-core --example edge_score -- IN OUT [MODE] [AMOUNT]
//! ```
//!
//! `IN` holds PNG or JPEG photos (a JPEG is turned into a PNG with `sips`, in `OUT/.in`). `MODE`
//! is 0 lines, 1 transfer, 2 masses (default 0); `AMOUNT` is 0 to 100 (default 67).

#![allow(clippy::print_stdout, reason = "the tool prints one line per photo")]

mod support;

use atelier_core::render::{edges_layer, prepare_work};
use std::path::Path;
use support::{EDGES_EVEN, EDGES_WIDTH, Res, decode, photos, stem};

fn main() -> Res<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [input, output, rest @ ..] = args.as_slice() else {
        return Err("usage: edge_score IN OUT [MODE] [AMOUNT]".into());
    };
    let mode: u32 = rest.first().map_or(Ok(0), |m| m.parse())?;
    let amount: f64 = rest.get(1).map_or(Ok(67.0), |a| a.parse())?;
    let out = Path::new(output);
    std::fs::create_dir_all(out)?;
    for path in photos(Path::new(input), out, None)? {
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
