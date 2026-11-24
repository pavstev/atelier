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

/// Pencil knobs in the order `render::pencil_layer` takes its numbers.
const PENCIL_ORDER: [&str; 14] = [
    "detail",
    "key",
    "contrast",
    "highlights",
    "darks",
    "local",
    "grain",
    "paper",
    "angle",
    "density",
    "step",
    "smudge",
    "lift",
    "cross",
];

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

fn knobs_ts() -> String {
    web_file("features/pencil/knobs.ts")
}

fn look_ts() -> String {
    web_file("features/tools/look.ts")
}

/// The whole number right after `marker` in `text`.
fn number_after(text: &str, marker: &str) -> i64 {
    let at = text
        .find(marker)
        .unwrap_or_else(|| panic!("could not find `{marker}` in the web source"));
    let digits: String = text[at + marker.len()..]
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '-')
        .collect();
    digits
        .parse()
        .unwrap_or_else(|_| panic!("no number after `{marker}`"))
}

/// A number, a constant (`EDGES_WIDTH_MAX`) or a key of a constant object (`EDGES_MODE.masses`).
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

/// The range of one knob in the `KNOBS` table: `key: { start: 50, range: [0, 100] },`.
fn pencil_range(src: &str, key: &str) -> (i64, i64) {
    let table = src
        .find("const KNOBS =")
        .expect("could not find KNOBS in knobs.ts");
    let block = &src[table..];
    let marker = format!("\n\t{key}: {{ start: ");
    let at = block
        .find(&marker)
        .unwrap_or_else(|| panic!("could not find {key} in KNOBS"));
    let rest = &block[at..];
    let open = rest.find("range: [").expect("a knob has a range") + "range: [".len();
    let close = open + rest[open..].find(']').expect("a range ends with ]");
    let nums: Vec<i64> = rest[open..close]
        .split(',')
        .map(|n| {
            n.trim()
                .parse()
                .unwrap_or_else(|_| panic!("bad range for {key}"))
        })
        .collect();
    assert_eq!(nums.len(), 2, "{key} in KNOBS is not [lo, hi]");
    (nums[0], nums[1])
}

/// The numbers of `export const NAME: readonly number[] = [ ... ];`.
fn list_of(src: &str, name: &str) -> Vec<i64> {
    let at = src
        .find(&format!("const {name}"))
        .unwrap_or_else(|| panic!("could not find {name} in look.ts"));
    let rest = &src[at..];
    let rest = &rest[rest.find('=').expect("a list has =")..];
    let open = rest.find('[').expect("a list has [");
    let close = rest.find(']').expect("a list has ]");
    let list: Vec<i64> = rest[open + 1..close]
        .split(',')
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(|n| n.parse().unwrap_or_else(|_| panic!("bad number in {name}")))
        .collect();
    assert!(!list.is_empty(), "{name} is empty");
    list
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

/// The values of `0..=top` the core accepts, to compare with a list on the web side.
fn accepted<T>(top: i64, call: impl Fn(i64) -> Result<T, Error>) -> Vec<i64> {
    (0..=top).filter(|&v| call(v).is_ok()).collect()
}

#[test]
fn test_values_ranges_match_the_core() {
    let (src, work) = (look_ts(), tiny());
    let range = |key| fit_range(&src, "values", key);
    check("values.preset", range("preset"), |v| {
        render::values_layer(&work, u(v), 50.0, 0)
    });
    check("values.detail", range("detail"), |v| {
        render::values_layer(&work, 1, v as f64, 0)
    });
    check("values.tint", range("tint"), |v| {
        render::values_layer(&work, 1, 50.0, u(v))
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
fn test_pencil_ranges_match_the_core() {
    let (src, work) = (knobs_ts(), tiny());
    let range = |key| pencil_range(&src, key);
    // Every other knob sits at its least while one is probed.
    let least: Vec<f64> = PENCIL_ORDER.iter().map(|k| range(k).0 as f64).collect();
    let (look, mask) = (range("look"), range("mask"));
    check("pencil.look", look, |v| {
        render::pencil_layer(&work, u(v), mask.1 as u32, &least)
    });
    check("pencil.mask", mask, |v| {
        render::pencil_layer(&work, 0, u(v), &least)
    });
    for (i, key) in PENCIL_ORDER.iter().enumerate() {
        check(&format!("pencil.{key}"), range(key), |v| {
            let mut numbers = least.clone();
            numbers[i] = v as f64;
            render::pencil_layer(&work, 0, mask.1 as u32, &numbers)
        });
    }
}

#[test]
fn test_edges_ranges_match_the_core() {
    let (src, work) = (look_ts(), tiny());
    let range = |key| fit_range(&src, "edges", key);
    check("edges.mode", range("mode"), |v| {
        render::edges_layer(&work, u(v), 67.0, 5, 50.0)
    });
    check("edges.amount", range("amount"), |v| {
        render::edges_layer(&work, 0, v as f64, 5, 50.0)
    });
    check("edges.width", range("width"), |v| {
        render::edges_layer(&work, 0, 67.0, u(v), 50.0)
    });
    check("edges.even", range("even"), |v| {
        render::edges_layer(&work, 0, 67.0, 5, v as f64)
    });
    // the named maximum is the same number as the one in `render`
    assert_eq!(
        resolve(&src, "EDGES_WIDTH_MAX"),
        i64::from(render::EDGES_WIDTH_MAX)
    );
}

#[test]
fn test_grid_ranges_match_the_core() {
    let (src, work) = (look_ts(), tiny());
    let grid = |mode, cells, width, group| {
        render::grid_layer(&work, mode, cells, width, group, 0xff_ffff, 0)
    };
    check("grid.mode", fit_range(&src, "grid", "mode"), |v| {
        grid(u(v), 6, 2, 2)
    });
    check("grid.width", fit_range(&src, "grid", "width"), |v| {
        grid(1, 6, u(v), 2)
    });
    // the two lists must be the very values the core takes, no more and no fewer
    assert_eq!(
        list_of(&src, "GRID_CELLS"),
        accepted(60, |v| grid(1, u(v), 2, 2)),
        "GRID_CELLS and the cell steps of the core differ"
    );
    assert_eq!(
        list_of(&src, "GRID_GROUPS"),
        accepted(8, |v| grid(1, 6, 2, u(v))),
        "GRID_GROUPS and the groups of the core differ"
    );
}
