//! No typed view call may panic. Every call in `render` gets tiny and odd pictures and every
//! number at its edges and one step beyond. A call may answer `Ok` or `Err(BadInput)`. A panic or another error is a failure, and the failure lists
//! every (call, case) that went wrong.

use oil_core::error::Error;
use oil_core::img::Rgb;
use oil_core::render;
use std::panic::{AssertUnwindSafe, catch_unwind};

/// The odd sizes: 1 x 1, thin, small, square and a little bigger.
const SIZES: [(usize, usize); 10] = [
    (1, 1),
    (1, 9),
    (9, 1),
    (2, 3),
    (17, 5),
    (3, 3),
    (4, 4),
    (1, 40),
    (40, 1),
    (31, 33),
];
/// The whole numbers: the small range, a few steps past it and the largest.
const WHOLE: [u32; 12] = [0, 1, 2, 3, 4, 5, 6, 8, 9, 12, 13, u32::MAX];
/// The knob numbers: both ends, one step past, and the ones that are not numbers.
const KNOBS: [f64; 7] = [-1.0, 0.0, 50.0, 100.0, 100.1, f64::NAN, f64::INFINITY];

/// A made-up picture with a pattern, so the filters have edges to find.
fn pic(w: usize, h: usize, channels: usize) -> Rgb {
    let data = (0..w * h * channels)
        .map(|i| ((i * 37) ^ (i / 3 * 11)) as u8)
        .collect();
    Rgb::from_vec(w, h, channels, data)
}

/// What went wrong in one call, or `None` when it answered `Ok` or `BadInput`.
fn judge<T>(answer: std::thread::Result<Result<T, Error>>) -> Option<String> {
    match answer {
        Err(_) => Some("panic".into()),
        Ok(Err(Error::BadInput(_)) | Ok(_)) => None,
        Ok(Err(other)) => Some(format!("wrong error: {other}")),
    }
}

/// Runs every call once with the work picture and the numbers `u` and `k`.
/// `f` gets the call index and returns its name and answer, or `None` past the last call.
fn every_call(work: &Rgb, u: u32, k: f64, index: usize) -> Option<(&'static str, Option<String>)> {
    macro_rules! calls {
        ($($name:literal => $call:expr),+ $(,)?) => {{
            let mut at = 0;
            $(
                if at == index {
                    let got = catch_unwind(AssertUnwindSafe(|| $call.map(|_| ())));
                    return Some(($name, judge(got)));
                }
                at += 1;
            )+
            let _ = at;
            None
        }};
    }
    calls! {
        "prepare_work" => render::prepare_work(work, u),
        "values_view" => render::values_view(work, u, k, u),
        "shapes_view" => render::shapes_view(work, u, k),
        "edges_view" => render::edges_view(work, u, k, u, k),
        "grid_layer" => render::grid_layer(work, u, u, u, u, u, u),
    }
}

/// Runs all the calls for one work picture and adds the failures to `bad`.
fn sweep(label: &str, work: &Rgb, nums: &[(u32, f64)], bad: &mut Vec<String>) {
    for &(u, k) in nums {
        let mut index = 0;
        while let Some((name, failure)) = every_call(work, u, k, index) {
            if let Some(why) = failure {
                bad.push(format!("{name}: {label}, u {u}, k {k}: {why}"));
            }
            index += 1;
        }
    }
}

#[test]
fn test_odd_sizes_and_number_edges_never_panic() {
    // The panic message of a failed case is noise; the list below says it all.
    std::panic::set_hook(Box::new(|_| {}));
    let nums: Vec<(u32, f64)> = WHOLE
        .iter()
        .enumerate()
        .map(|(i, &u)| (u, KNOBS[i % KNOBS.len()]))
        .chain(KNOBS.iter().map(|&k| (4, k)))
        .collect();
    let mut bad = Vec::new();
    for (w, h) in SIZES {
        sweep(&format!("{w} x {h}"), &pic(w, h, 3), &nums, &mut bad);
    }
    let _ = std::panic::take_hook();
    bad.sort();
    bad.dedup();
    assert!(
        bad.is_empty(),
        "{} failures:\n{}",
        bad.len(),
        bad[..bad.len().min(40)].join("\n")
    );
}

#[test]
fn test_bad_work_pictures_are_refused() {
    let wrong = [
        pic(8, 8, 4),
        pic(8, 8, 1),
        Rgb {
            width: 0,
            height: 0,
            channels: 3,
            data: Vec::new(),
        },
        Rgb {
            width: 8,
            height: 8,
            channels: 3,
            data: vec![0; 5],
        },
    ];
    for work in &wrong {
        for u in [1, 3, 64] {
            let mut index = 0;
            while let Some((name, failure)) = every_call(work, u, 50.0, index) {
                assert!(
                    failure.is_none(),
                    "{name} on a bad work picture: {failure:?}"
                );
                index += 1;
            }
        }
    }
}
