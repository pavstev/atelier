#!/usr/bin/env bash
# Runs the tests that cover the given files.
source "$(dirname "$0")/lib.sh"
for f in "$@"; do
  case "$f" in
    crates/atelier-core/src/*.rs)
      m=$(basename "$f" .rs)
      cargo test -q -p atelier-core --lib "${m}::" ;;
    crates/atelier-core/tests/*.rs)
      cargo test -q -p atelier-core --test "$(basename "$f" .rs)" ;;
    crates/atelier-wasm/*) cargo test -q -p atelier-wasm ;;
    xtask/*) cargo test -q -p xtask ;;
  esac
done
