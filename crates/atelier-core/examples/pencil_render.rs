//! Pencil render for `bench/pencil-eval`: draws the Pencil looks Tone, Drawing and Hatch at their
//! Auto start values, then Drawing and Hatch again with Smudge 60, Lifted lights 60 and Cross-hatch
//! 60 (one effect at a time), for each photo of the folders you give. It writes the 1024 px work
//! picture as `OUT/photos/<photo>.png` and each picture as `OUT/<tag>-<photo>.png`. Keep `OUT`
//! under `.agents/bench/` (git-ignored).
//!
//! ```text
//! cargo run -q --release -p atelier-core --example pencil_render -- [OUT [IN...]]
//! ```
//!
//! `OUT` defaults to `.agents/bench/pencil-effects-2026-11-18/`. `IN` defaults to
//! `.agents/web-photos` and `.agents/bench/unsplash` (PNG or JPEG; a JPEG is turned into a PNG with
//! `sips`, in `OUT/.in`). Auto sets key, contrast and highlights from `pencil_auto`; every other
//! knob is at its start and all eight pencils are in the set. Tags: `tone`, `drawing`, `hatch`,
//! then `drawingsmudge`, `drawinglift`, `drawingcross`, `hatchsmudge`, `hatchlift`, `hatchcross`.

#![allow(clippy::print_stdout, reason = "the tool prints one line per photo")]

mod support;

use atelier_core::img::Image;
use atelier_core::render::{pencil_auto, pencil_layer, prepare_work};
use std::path::Path;
use support::{PENCIL_START, Res, decode, photos, png_bytes, stem};

/// The long side of the work picture (the web app's `WORK_LONG_SIDE`).
const WORK_PX: u32 = 1024;
/// Indices in the numbers of `pencil_layer` that Auto and the effects set.
const KEY: usize = 1;
const CONTRAST: usize = 2;
const HIGHLIGHTS: usize = 3;
const SMUDGE: usize = 11;
const LIFT: usize = 12;
const CROSS: usize = 13;
/// The strength of each effect in the run.
const EFFECT: f64 = 60.0;
/// The look numbers of the core.
const TONE: u32 = 0;
const DRAWING: u32 = 1;
const HATCH: u32 = 3;

fn main() -> Res<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let out = Path::new(
        args.first()
            .map_or(".agents/bench/pencil-effects-2026-11-18", String::as_str),
    );
    let inputs: Vec<&str> = if args.len() > 1 {
        args[1..].iter().map(String::as_str).collect()
    } else {
        vec![".agents/web-photos", ".agents/bench/unsplash"]
    };
    std::fs::create_dir_all(out.join("photos"))?;
    for dir in inputs {
        let dir = Path::new(dir);
        if !dir.is_dir() {
            continue;
        }
        for path in photos(dir, out, None)? {
            let name = stem(&path);
            let photo = decode(&std::fs::read(&path)?)?;
            let work = prepare_work(&photo, WORK_PX)?;
            std::fs::write(
                out.join("photos").join(format!("{name}.png")),
                png_bytes(&work)?,
            )?;
            let auto = pencil_auto(&work)?;
            let mut base = PENCIL_START;
            base[KEY] = auto[0];
            base[CONTRAST] = auto[1];
            base[HIGHLIGHTS] = auto[2];
            let mut jobs: Vec<(String, u32, [f64; 14])> = vec![
                ("tone".into(), TONE, base),
                ("drawing".into(), DRAWING, base),
                ("hatch".into(), HATCH, base),
            ];
            for (look_tag, look) in [("drawing", DRAWING), ("hatch", HATCH)] {
                for (effect, slot) in [("smudge", SMUDGE), ("lift", LIFT), ("cross", CROSS)] {
                    let mut numbers = base;
                    numbers[slot] = EFFECT;
                    jobs.push((format!("{look_tag}{effect}"), look, numbers));
                }
            }
            for (tag, look, numbers) in jobs {
                let layer = pencil_layer(&work, look, 255, &numbers)?.layer;
                let rgb = Image::from_vec(
                    layer.width,
                    layer.height,
                    3,
                    layer
                        .rgba
                        .chunks_exact(4)
                        .flat_map(|p| [p[0], p[1], p[2]])
                        .collect(),
                );
                std::fs::write(out.join(format!("{tag}-{name}.png")), png_bytes(&rgb)?)?;
            }
            println!("{name} {}x{}", work.width, work.height);
        }
    }
    Ok(())
}
