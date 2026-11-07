#!/usr/bin/env bash
# The one check. It runs here, on this machine. The Cloudflare build only builds and deploys.
# Rust: fmt, clippy, tests, cargo-deny, cargo-shear, typos. Then the web app: types and Biome.
# The browser tests are `mise run web:e2e`.
# Setup once: AGENTS.md, "Commands".
set -euo pipefail
cd "$(dirname "$0")/.."

need() {
  command -v "$1" >/dev/null || { echo "missing tool: $1 (install: $2)" >&2; exit 1; }
}
need cargo-deny "brew install cargo-deny"
need typos "brew install typos-cli"
need cargo-shear "brew install cargo-shear"

cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -q --workspace
cargo deny check
cargo shear --deny-warnings
typos

pnpm --dir app/web install --frozen-lockfile --silent
pnpm --dir app/web exec tsc --noEmit
pnpm --dir app/web exec biome check src e2e playwright.config.ts
