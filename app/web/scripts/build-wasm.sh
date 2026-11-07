#!/usr/bin/env bash
# Builds crates/atelier-wasm to wasm and writes the JS glue into app/web/wasm.
# Needs the wasm32-unknown-unknown target and wasm-bindgen-cli (mise install).
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$root"
# simd128 lets the browser run the pixel loops with vector instructions.
RUSTFLAGS="${RUSTFLAGS:-} -C target-feature=+simd128" \
  cargo build -q --release --target wasm32-unknown-unknown -p atelier-wasm
wasm-bindgen --target web --out-dir app/web/wasm \
  "${CARGO_TARGET_DIR:-target}/wasm32-unknown-unknown/release/atelier_wasm.wasm"
# Mark the glue as built from this source; scripts/wasm-fresh.sh check reads it.
bash scripts/wasm-fresh.sh hash > app/web/wasm/.crates-hash
