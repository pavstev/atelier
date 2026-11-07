# Release

The live site is static files in a Cloudflare Worker with static assets (`wrangler.jsonc`).
This page is for maintainers. A fork can deploy the same files to any static host.

## Build

```bash
mise run web:build
```

It builds the wasm (`scripts/build-wasm.sh`), then type checks and builds the web app into
`app/web/dist`.

## The wasm glue

`app/web/wasm/` holds the JS glue that wasm-bindgen writes. It is committed at release, with a hash
of the Rust inputs (`app/web/wasm/.crates-hash`). `bash scripts/wasm-fresh.sh check` tells whether
the glue is fresh. The pre-push hook fails when it is not. Rebuild it with `mise run web:wasm`.

## Deploy on push

A push to `main` starts a Cloudflare Workers Build:

- Build command: `bash scripts/ci-build.sh`.
- Deploy command: `pnpm --dir app/web exec wrangler deploy --config ../../wrangler.jsonc`.
- The build image has no Rust. `ci-build.sh` asks `wasm-fresh.sh check` first. When no Rust input
  changed since the glue was made, it skips Rust and builds only the web app. Otherwise it installs
  Rust and builds the wasm cold, which takes about 4 minutes.
- The build runs no checks. Run `mise run check` before you push. The pre-push hook does.
- The build writes `dist/version.txt` with the commit sha, so `/version.txt` on the site tells
  which commit is live.

`bash scripts/live-check.sh <sha>` probes the live site for a commit: the home page, the wasm, the
icons and the share images.

## Manual release

`mise run release` runs the check, every browser test, the smoke test on the built app under the
real headers, the deploy and a smoke test of the live site. It stops at the first failure.
`mise run deploy` is the deploy alone. It stops when the account is not the pinned one.

## Headers

`app/web/public/_headers` holds the Content-Security-Policy and the cache rules. Change it with
the wasm in mind: the page needs `'wasm-unsafe-eval'` to compile the Rust core.

## Icons and share images

`mise run web:brand` makes every file in `app/web/public/` (favicons, `og.png`, `og-square.png`)
from the logo sources in `app/web/brand/`. Change the logo there, run it, and commit the files.
