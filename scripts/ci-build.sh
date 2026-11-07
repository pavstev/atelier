#!/usr/bin/env bash
# The build command of Cloudflare Workers Builds: Rust and wasm-bindgen, the wasm, then the web app.
# Workers Builds has no Rust, so this script installs it. It keeps rustup, cargo and the build
# folder inside the pnpm store folder, hoping the build cache restores it between builds (it did
# not on 2026-11-01). The deploy command is `pnpm --dir app/web exec wrangler deploy --config ../../wrangler.jsonc`.
# Locally it only builds (same as `mise run web:build`). See .claude/rules/web.md.
source "$(dirname "$0")/lib.sh"

if [ -n "${WORKERS_CI:-}" ]; then
  keep="$HOME/.local/share/pnpm/store/atelier-cache"
  export RUSTUP_HOME="$keep/rustup" CARGO_HOME="$keep/cargo" CARGO_TARGET_DIR="$keep/target"
  export PATH="$CARGO_HOME/bin:$PATH"
  mkdir -p "$keep"
  echo "cache: $(du -sh "$keep" 2>/dev/null | cut -f1) restored"
fi

if bash scripts/wasm-fresh.sh check; then
  stage "wasm glue is fresh: skip Rust and the wasm build"
  fresh=1
else
  fresh=0
fi

if [ "$fresh" = 0 ]; then
rust=$(grep -o 'channel = "[0-9.]*"' rust-toolchain.toml | grep -o '[0-9][0-9.]*')
bindgen=$(grep -o '"cargo:wasm-bindgen-cli" = "[0-9.]*"' mise.toml | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')

if ! command -v cargo >/dev/null || ! rustc --version | grep -q "rustc $rust"; then
  stage "install Rust $rust"
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain "$rust" -t wasm32-unknown-unknown
  export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
fi
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true

if ! command -v wasm-bindgen >/dev/null || ! wasm-bindgen --version | grep -q "$bindgen"; then
  stage "install wasm-bindgen $bindgen"
  mkdir -p "${CARGO_HOME:-$HOME/.cargo}/bin"
  curl -fsSL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$bindgen/wasm-bindgen-$bindgen-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz --strip-components=1 -C "${CARGO_HOME:-$HOME/.cargo}/bin" --wildcards '*/wasm-bindgen'
fi

stage "wasm"
bash app/web/scripts/build-wasm.sh
fi

stage "web install and build"
pnpm --dir app/web install --frozen-lockfile
pnpm --dir app/web build

# Which commit is live: the benchmark and the live check read this file.
echo "${WORKERS_CI_COMMIT_SHA:-local}" > app/web/dist/version.txt
stage "build done"
