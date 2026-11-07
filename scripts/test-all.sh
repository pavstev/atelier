#!/usr/bin/env bash
# The one check. It runs on your machine. The Cloudflare build only builds and deploys.
# Rust: fmt, clippy, tests, cargo-deny, cargo-shear, typos. Then the web app: types and Biome
# (the same `lint` as app/web/package.json).
# `--fast` (mise run check:fast) skips cargo-deny, cargo-shear and typos.
# The browser tests are `mise run web:e2e`.
# Setup once: AGENTS.md, "Commands".
source "$(dirname "$0")/lib.sh"

fast=0
[ "${1:-}" = "--fast" ] && fast=1

need() {
  command -v "$1" >/dev/null || { echo "missing tool: $1 (install: $2)" >&2; exit 1; }
}
if [ "$fast" = 0 ]; then
  need cargo-deny "brew install cargo-deny"
  need typos "brew install typos-cli"
  need cargo-shear "brew install cargo-shear"
fi

cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -q --workspace
if [ "$fast" = 0 ]; then
  cargo deny check
  cargo shear --deny-warnings
  typos
fi

pnpm --dir app/web install --frozen-lockfile --silent
pnpm --dir app/web exec tsc --noEmit
pnpm --dir app/web lint
