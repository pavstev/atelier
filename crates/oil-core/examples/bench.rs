//! Tool bench: renders the four layers (Edges, Shapes, Values, Grid) for every photo in a folder,
//! the way the web app does (a 1024 px work picture, the start values of `DEFAULTS` in
//! `app/web/src/settings.ts`), and puts each photo's layers in one row. Two tags stack into a
//! before and after sheet. The photos and the pictures stay out of git: keep both under `.agents/`.
//!
//! ```text
//! cargo run -q --release -p oil-core --example bench -- render IN OUT TAG [NAME]
//! cargo run -q --release -p oil-core --example bench -- compare OUT BEFORE AFTER
//! ```
//!
//! `IN` holds PNG or JPEG photos (a JPEG is turned into a PNG with `sips`, in `OUT/.in`).
//! `render` writes `OUT/TAG-<layer>-<photo>.png` and `OUT/row-TAG-<photo>.png`. A see-through layer is shown the way the app
//! stacks it: Edges as ink on white paper, Grid over the work picture, Shapes and Values opaque.
//! `NAME` keeps only the photos whose file name holds it. `compare` writes
//! `OUT/cmp-BEFORE-AFTER-<photo>.png`.
//!
//! Env vars override the start values of one run: `BENCH_EDGES_MODE` (0 to 2), `BENCH_EDGES_AMOUNT`
//! (0 to 100), `BENCH_EDGES_WIDTH` (1 to 10), `BENCH_EDGES_EVEN` (0 to 100), `BENCH_SHAPES_STEP` (0 to 3), `BENCH_SHAPES_DETAIL` (0 to 100),
//! `BENCH_VALUES_PRESET` (0 to 5), `BENCH_VALUES_DETAIL` (0 to 100), `BENCH_VALUES_TINT` (0 or 1),
//! `BENCH_GRID_MODE` (0 to 2), `BENCH_GRID_CELLS` (3 to 50, one of the Grid steps),
//! `BENCH_GRID_WIDTH` (1 to 16), `BENCH_GRID_GROUP` (2 or 4) and `BENCH_GRID_COLOR` (`0xRRGGBB` as a
//! plain number, or 16777216 for Contrast). Unset means the constant. A bad
//! value prints one error line and exits with a non-zero code.

#![allow(clippy::print_stdout, reason = "a bench prints one line per photo")]

use oil_core::img::{Image, Rgb};
use oil_core::render::{
    GRID_CONTRAST, Layer, edges_layer, grid_layer, prepare_work, shapes_layer, values_layer,
};
use std::error::Error;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// The long side of the work picture (`WORK_LONG_SIDE` in
/// `app/web/src/coreClient.ts`).
const WORK_PX: u32 = 1024;
/// The start values of the layers (`DEFAULTS` in `app/web/src/settings.ts`).
const EDGES_MODE: u32 = 0;
const EDGES_AMOUNT: f64 = 67.0;
const EDGES_WIDTH: u32 = 5;
const EDGES_EVEN: f64 = 50.0;
const SHAPES_STEP: u32 = 3;
const SHAPES_DETAIL: f64 = 50.0;
const VALUES_PRESET: u32 = 1;
const VALUES_DETAIL: f64 = 50.0;
const VALUES_TINT: u32 = 0;
const GRID_MODE: u32 = 2;
const GRID_CELLS: u32 = 6;
const GRID_WIDTH: u32 = 2;
const GRID_GROUP: u32 = 2;
const GRID_COLOR: u32 = GRID_CONTRAST;
/// The height of one picture in a row, in px.
const ROW_PX: usize = 300;
/// The gap between pictures in a row or a sheet, in px.
const GAP: usize = 6;
/// The layers, in the order of a row.
const LAYERS: [&str; 4] = ["edges", "shapes", "values", "grid"];

type Res<T> = Result<T, Box<dyn Error>>;

/// The values of one run: the constants above, or what the `BENCH_*` env vars say.
struct Knobs {
    edges_mode: u32,
    edges_amount: f64,
    edges_width: u32,
    edges_even: f64,
    shapes_step: u32,
    shapes_detail: f64,
    values_preset: u32,
    values_detail: f64,
    values_tint: u32,
    grid_mode: u32,
    grid_cells: u32,
    grid_width: u32,
    grid_group: u32,
    grid_color: u32,
}

/// The env var `name` as a number in `lo..=hi`, or `default` when it is unset.
fn knob_env<T>(name: &str, default: T, lo: T, hi: T) -> Res<T>
where
    T: std::str::FromStr + PartialOrd + std::fmt::Display + Copy,
{
    let Some(raw) = std::env::var_os(name) else {
        return Ok(default);
    };
    let raw = raw.to_string_lossy();
    match raw.trim().parse::<T>() {
        Ok(v) if v >= lo && v <= hi => Ok(v),
        _ => Err(format!("{name}={raw} is not a number from {lo} to {hi}").into()),
    }
}

impl Knobs {
    fn from_env() -> Res<Self> {
        Ok(Self {
            edges_mode: knob_env("BENCH_EDGES_MODE", EDGES_MODE, 0, 2)?,
            edges_amount: knob_env("BENCH_EDGES_AMOUNT", EDGES_AMOUNT, 0.0, 100.0)?,
            edges_width: knob_env("BENCH_EDGES_WIDTH", EDGES_WIDTH, 1, 10)?,
            edges_even: knob_env("BENCH_EDGES_EVEN", EDGES_EVEN, 0.0, 100.0)?,
            shapes_step: knob_env("BENCH_SHAPES_STEP", SHAPES_STEP, 0, 3)?,
            shapes_detail: knob_env("BENCH_SHAPES_DETAIL", SHAPES_DETAIL, 0.0, 100.0)?,
            values_preset: knob_env("BENCH_VALUES_PRESET", VALUES_PRESET, 0, 5)?,
            values_detail: knob_env("BENCH_VALUES_DETAIL", VALUES_DETAIL, 0.0, 100.0)?,
            values_tint: knob_env("BENCH_VALUES_TINT", VALUES_TINT, 0, 1)?,
            grid_mode: knob_env("BENCH_GRID_MODE", GRID_MODE, 0, 2)?,
            grid_cells: knob_env("BENCH_GRID_CELLS", GRID_CELLS, 3, 50)?,
            grid_width: knob_env("BENCH_GRID_WIDTH", GRID_WIDTH, 1, 16)?,
            grid_group: knob_env("BENCH_GRID_GROUP", GRID_GROUP, 2, 4)?,
            grid_color: knob_env("BENCH_GRID_COLOR", GRID_COLOR, 0, GRID_CONTRAST)?,
        })
    }
}

fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("bench: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}

fn run() -> Res<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["render", dir, out, tag, rest @ ..] => {
            render(Path::new(dir), Path::new(out), tag, rest.first().copied())
        }
        ["compare", out, before, after] => compare(Path::new(out), before, after),
        _ => Err("usage: bench render IN OUT TAG [NAME] | bench compare OUT BEFORE AFTER".into()),
    }
}

fn render(dir: &Path, out: &Path, tag: &str, only: Option<&str>) -> Res<()> {
    let knobs = Knobs::from_env()?;
    std::fs::create_dir_all(out)?;
    let photos = photos(dir, out, only)?;
    if photos.is_empty() {
        return Err(format!("no photos in {}", dir.display()).into());
    }
    for path in photos {
        let name = stem(&path);
        let photo = decode(&std::fs::read(&path)?)?;
        let work = prepare_work(&photo, WORK_PX)?;
        let pics = draw(&work, &knobs)?;
        for (layer, pic) in LAYERS.iter().zip(&pics) {
            std::fs::write(
                out.join(format!("{tag}-{layer}-{name}.png")),
                png_bytes(pic)?,
            )?;
        }
        std::fs::write(
            out.join(format!("row-{tag}-{name}.png")),
            png_bytes(&row_of(&pics))?,
        )?;
        println!("{name} {}x{}", work.width, work.height);
    }
    Ok(())
}

/// The four layers of `work` as pictures, in the order of `LAYERS`, with the start values of the
/// web app.
fn draw(work: &Rgb, k: &Knobs) -> Res<Vec<Rgb>> {
    let paper = Rgb::filled(work.width, work.height, &[255, 255, 255]);
    let edges = edges_layer(
        work,
        k.edges_mode,
        k.edges_amount,
        k.edges_width,
        k.edges_even,
    )?;
    let (shapes, piles) = shapes_layer(work, k.shapes_step, k.shapes_detail)?;
    let (values, tones) = values_layer(work, k.values_preset, k.values_detail, k.values_tint)?;
    let hex = |c: &[[u8; 3]]| {
        c.iter()
            .map(|p| format!("#{:02x}{:02x}{:02x}", p[0], p[1], p[2]))
            .collect::<Vec<_>>()
            .join(" ")
    };
    eprintln!("  piles {}  tones {}", hex(&piles), hex(&tones));
    let grid = grid_layer(
        work,
        k.grid_mode,
        k.grid_cells,
        k.grid_width,
        k.grid_group,
        k.grid_color,
        0,
    )?;
    Ok(vec![
        over(&paper, &edges),
        over(work, &shapes),
        over(work, &values),
        over(work, &grid),
    ])
}

/// `layer` laid over `base` with straight alpha.
fn over(base: &Rgb, layer: &Layer) -> Rgb {
    let mut out = base.clone();
    for (px, l) in out.data.chunks_exact_mut(3).zip(layer.rgba.chunks_exact(4)) {
        let alpha = u32::from(l[3]);
        for (p, &s) in px.iter_mut().zip(&l[..3]) {
            *p = ((u32::from(s) * alpha + u32::from(*p) * (255 - alpha) + 127) / 255) as u8;
        }
    }
    out
}

/// The pictures of one draw side by side, `ROW_PX` high.
fn row_of(pics: &[Rgb]) -> Rgb {
    side_by_side(
        &pics
            .iter()
            .map(|p| fit_height(p, ROW_PX))
            .collect::<Vec<_>>(),
    )
}

fn compare(out: &Path, before: &str, after: &str) -> Res<()> {
    let prefix = format!("row-{before}-");
    for path in pngs(out)? {
        let Some(name) = stem(&path).strip_prefix(&prefix).map(str::to_owned) else {
            continue;
        };
        let other = out.join(format!("row-{after}-{name}.png"));
        if !other.exists() {
            continue;
        }
        let rows = [
            decode(&std::fs::read(&path)?)?,
            decode(&std::fs::read(&other)?)?,
        ];
        let sheet = stacked(&rows);
        std::fs::write(
            out.join(format!("cmp-{before}-{after}-{name}.png")),
            png_bytes(&sheet)?,
        )?;
        println!("{name}");
    }
    Ok(())
}

/// The photos of `dir` whose name holds `only`, as PNG paths. A JPEG is turned into a PNG in
/// `out/.in` with `sips` (macOS), since the core decodes PNG only.
fn photos(dir: &Path, out: &Path, only: Option<&str>) -> Res<Vec<PathBuf>> {
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

fn pngs(dir: &Path) -> Res<Vec<PathBuf>> {
    let mut paths: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("png")))
        .collect();
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

fn fit_height(img: &Rgb, height: usize) -> Rgb {
    resize(img, img.width.max(img.height) * height / img.height)
}

/// The picture with its long side `long` px: `prepare_work` (Lanczos) down, a box average or the
/// nearest pixel otherwise. Only the bench sheets use it, so it is plain.
fn resize(img: &Rgb, long: usize) -> Rgb {
    let longest = img.width.max(img.height);
    if long < longest
        && let Ok(shrunk) = prepare_work(img, long as u32)
    {
        return shrunk;
    }
    let fit = |side: usize| (side * long / longest).max(1);
    let (w, h) = (fit(img.width), fit(img.height));
    let mut data = Vec::with_capacity(w * h * 3);
    for y in 0..h {
        let (y0, y1) = (
            y * img.height / h,
            ((y + 1) * img.height / h).max(y * img.height / h + 1),
        );
        for x in 0..w {
            let (x0, x1) = (
                x * img.width / w,
                ((x + 1) * img.width / w).max(x * img.width / w + 1),
            );
            let n = ((y1 - y0) * (x1 - x0)) as u32;
            for c in 0..3 {
                let sum: u32 = (y0..y1)
                    .flat_map(|sy| (x0..x1).map(move |sx| (sx, sy)))
                    .map(|(sx, sy)| u32::from(img.pixel(sx, sy)[c]))
                    .sum();
                data.push(((sum + n / 2) / n) as u8);
            }
        }
    }
    Image::from_vec(w, h, 3, data)
}

/// An RGB picture as PNG bytes (8 bit, adaptive filter, fast deflate).
fn png_bytes(img: &Rgb) -> Res<Vec<u8>> {
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

fn side_by_side(pics: &[Rgb]) -> Rgb {
    let h = pics.iter().map(|p| p.height).max().unwrap_or(1);
    let w = pics.iter().map(|p| p.width + GAP).sum::<usize>();
    let mut out = Image::from_vec(w, h, 3, vec![40; w * h * 3]);
    let mut x = 0;
    for p in pics {
        paste(&mut out, p, x, 0);
        x += p.width + GAP;
    }
    out
}

fn stacked(pics: &[Rgb]) -> Rgb {
    let w = pics.iter().map(|p| p.width).max().unwrap_or(1);
    let h = pics.iter().map(|p| p.height + GAP).sum::<usize>();
    let mut out = Image::from_vec(w, h, 3, vec![40; w * h * 3]);
    let mut y = 0;
    for p in pics {
        paste(&mut out, p, 0, y);
        y += p.height + GAP;
    }
    out
}

fn paste(out: &mut Rgb, pic: &Rgb, x0: usize, y0: usize) {
    for y in 0..pic.height {
        let from = y * pic.width * 3;
        let to = ((y0 + y) * out.width + x0) * 3;
        out.data[to..to + pic.width * 3].copy_from_slice(&pic.data[from..from + pic.width * 3]);
    }
}
