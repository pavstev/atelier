//! Project tasks: `cargo xtask refs [--bless]` runs the tool reference tests of oil-core: every
//! `tests/tools_*.rs`.

#![allow(
    clippy::print_stdout,
    reason = "a command line tool prints its progress"
)]

use std::path::Path;
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let bless = match args.as_slice() {
        [cmd] if cmd == "refs" => false,
        [cmd, flag] if cmd == "refs" && flag == "--bless" => true,
        _ => {
            eprintln!("usage: cargo xtask refs [--bless]");
            return ExitCode::FAILURE;
        }
    };
    let tests = match reference_tests() {
        Ok(tests) if !tests.is_empty() => tests,
        Ok(_) => {
            eprintln!("no tests/tools_*.rs in oil-core");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("cannot list the oil-core tests: {e}");
            return ExitCode::FAILURE;
        }
    };
    let mut cmd = Command::new("cargo");
    cmd.args(["test", "-q", "-p", "oil-core"]);
    for name in &tests {
        cmd.args(["--test", name]);
    }
    if bless {
        cmd.env("ATELIER_BLESS", "1");
    }
    match cmd.status() {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(_) => ExitCode::FAILURE,
        Err(e) => {
            eprintln!("cannot run cargo: {e}");
            ExitCode::FAILURE
        }
    }
}

/// The tool reference tests of oil-core: the name of every `tests/tools_*.rs`, sorted.
fn reference_tests() -> std::io::Result<Vec<String>> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../crates/oil-core/tests");
    let mut names = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let file = entry?.file_name();
        let Some(file) = file.to_str() else { continue };
        let Some(name) = file.strip_suffix(".rs") else {
            continue;
        };
        if name.starts_with("tools_") {
            names.push(name.to_owned());
        }
    }
    names.sort();
    Ok(names)
}
