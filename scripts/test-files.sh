#!/usr/bin/env bash
# Runs the tests that cover the given files.
set -euo pipefail
cd "$(dirname "$0")/.."
for f in "$@"; do
  case "$f" in
    crates/oil-core/src/*.rs)
      m=$(basename "$f" .rs)
      cargo test -q -p oil-core --lib "${m}::" ;;
    crates/oil-core/tests/*.rs)
      cargo test -q -p oil-core --test "$(basename "$f" .rs)" ;;
    crates/oil-wasm/*) cargo test -q -p oil-wasm ;;
    xtask/*) cargo test -q -p xtask ;;
  esac
done
