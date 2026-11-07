#!/usr/bin/env bash
# Tells whether the committed wasm glue in app/web/wasm is fresh.
# `hash` prints a sha256 over the crates (not their tests/ and examples/ folders: the wasm never
# holds them), Cargo.lock, rust-toolchain.toml, the wasm-bindgen version
# in mise.toml and build-wasm.sh. `check` exits 0 when it equals app/web/wasm/.crates-hash, else 1.
source "$(dirname "$0")/lib.sh"

hash() {
  {
    # Tracked files only: untracked and ignored files (.DS_Store, scratch) do not exist in CI.
    git ls-files crates | grep -Ev '/(tests|examples)/' | LC_ALL=C sort | while read -r f; do
      printf '%s  ' "$f"
      shasum -a 256 "$f" | cut -d' ' -f1
    done
    shasum -a 256 Cargo.toml Cargo.lock rust-toolchain.toml app/web/scripts/build-wasm.sh
    # The cargo config changes the build too, but the file is optional.
    if [ -f .cargo/config.toml ]; then shasum -a 256 .cargo/config.toml; fi
    grep '"cargo:wasm-bindgen-cli"' mise.toml
  } | shasum -a 256 | cut -d' ' -f1
}

case "${1:-}" in
  hash) hash ;;
  check)
    [ -f app/web/wasm/.crates-hash ] && [ "$(cat app/web/wasm/.crates-hash)" = "$(hash)" ] || exit 1
    ;;
  *) echo "usage: wasm-fresh.sh hash|check" >&2; exit 2 ;;
esac
