//! The web app keeps its own copy of every knob range. This test reads those ranges as text from
//! the TypeScript files and asks the real core about each one: the least and the most must be
//! accepted, one step outside must be `Error::BadInput`. If the two sides drift, a test fails with
//! the range and the call. If a range is not found in the text, the test fails too (no silent pass).

use atelier_core::error::Error;
use atelier_core::img::Rgb;
use atelier_core::render;
use std::path::PathBuf;

mod common;
use common::pattern;

/// A tiny made-up picture with a pattern, so the filters have edges to find.
fn tiny() -> Rgb {
    pattern(24, 24, 3)
}

/// A web source file as text.
fn web_file(path: &str) -> String {
    let full = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../app/web/src")
        .join(path);
    std::fs::read_to_string(&full).unwrap_or_else(|e| panic!("cannot read {}: {e}", full.display()))
}

fn look_ts() -> String {
    web_file("features/tools/look.ts")
}

fn paper_ts() -> String {
    web_file("features/size/paper.ts")
}

/// The whole number right after `marker` in `text` (digit separators `_` are allowed).
fn number_after(text: &str, marker: &str) -> i64 {
    let at = text
        .find(marker)
        .unwrap_or_else(|| panic!("could not find `{marker}` in the web source"));
    let digits: String = text[at + marker.len()..]
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '-' || *c == '_')
        .filter(|c| *c != '_')
        .collect();
    digits
        .parse()
        .unwrap_or_else(|_| panic!("no number after `{marker}`"))
}

/// A number, a constant or a key of a constant object.
fn resolve(src: &str, token: &str) -> i64 {
    if let Ok(n) = token.parse() {
        return n;
    }
    match token.split_once('.') {
        Some((object, key)) => {
            let at = src
                .find(&format!("const {object} ="))
                .unwrap_or_else(|| panic!("could not find `{object}` in look.ts"));
            number_after(&src[at..], &format!("{key}: "))
        }
        None => number_after(src, &format!("const {token} = ")),
    }
}

/// The range of `object.key` from its `key: int(start, lo, hi)` entry in the `object: group({ ... })`
/// block of the look schema.
fn fit_range(src: &str, object: &str, key: &str) -> (i64, i64) {
    let at = src
        .find(&format!("\n\t{object}: group({{"))
        .unwrap_or_else(|| panic!("could not find the {object} group in look.ts"));
    let block = &src[at..];
    let block = &block[..block.find("}),").expect("a group ends with }),")];
    let marker = format!("{key}: int(");
    let start = block
        .find(&marker)
        .unwrap_or_else(|| panic!("could not find int() for {object}.{key} in look.ts"))
        + marker.len();
    let len = block[start..].find(')').expect("int( has a )");
    let args: Vec<&str> = block[start..start + len]
        .split(',')
        .map(str::trim)
        .collect();
    assert_eq!(args.len(), 3, "{object}.{key} is not int(start, lo, hi)");
    (resolve(src, args[1]), resolve(src, args[2]))
}

/// A whole number for a `u32` argument. A negative number becomes the largest, which is out of range.
fn u(v: i64) -> u32 {
    u32::try_from(v).unwrap_or(u32::MAX)
}

fn is_bad_input<T>(answer: &Result<T, Error>) -> bool {
    matches!(answer, Err(Error::BadInput(_)))
}

/// The least and the most of `name` are accepted, one step outside is `BadInput`.
fn check<T>(name: &str, (lo, hi): (i64, i64), call: impl Fn(i64) -> Result<T, Error>) {
    for v in [lo, hi] {
        if let Err(e) = call(v) {
            panic!("{name}: the web range is {lo} to {hi}, but the core refuses {v}: {e}");
        }
    }
    for v in [lo - 1, hi + 1] {
        let answer = call(v);
        assert!(
            is_bad_input(&answer),
            "{name}: the web range is {lo} to {hi}, but the core takes {v}"
        );
    }
}

#[test]
fn test_values_ranges_match_the_core() {
    let (src, work) = (look_ts(), tiny());
    let range = |key| fit_range(&src, "values", key);
    check("values.preset", range("preset"), |v| {
        render::values_layer(&work, u(v), 50.0)
    });
    check("values.detail", range("detail"), |v| {
        render::values_layer(&work, 1, v as f64)
    });
}

#[test]
fn test_shapes_ranges_match_the_core() {
    let (src, work) = (look_ts(), tiny());
    let range = |key| fit_range(&src, "shapes", key);
    check("shapes.step", range("step"), |v| {
        render::shapes_layer(&work, u(v), 50.0)
    });
    check("shapes.detail", range("detail"), |v| {
        render::shapes_layer(&work, 3, v as f64)
    });
}

#[test]
fn test_grid_range_matches_the_core() {
    // the squares across the width, in thousandths: `GRID_MILLI_MIN` to `GRID_MILLI_MAX`
    let (src, work) = (paper_ts(), tiny());
    let range = (
        resolve(&src, "GRID_MILLI_MIN"),
        resolve(&src, "GRID_MILLI_MAX"),
    );
    check("grid.milli", range, |v| render::grid_layer(&work, u(v)));
}
