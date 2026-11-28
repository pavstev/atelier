# Release

The live site is static files in a Cloudflare Worker with static assets only (`wrangler.jsonc`).
There is no Worker script: the config holds the asset folder and the not found rule.
This page is for maintainers. A fork can deploy the same files to any static host.

## Build

```bash
mise run web:build
```

It builds the wasm (`app/web/scripts/build-wasm.sh`), then type checks and builds the web app into
`app/web/dist`.

## The wasm glue

`app/web/wasm/` holds the JS glue that wasm-bindgen writes. It is committed at release, with a hash
of the Rust inputs (`app/web/wasm/.crates-hash`). `bash scripts/wasm-fresh.sh check` tells whether
the glue is fresh. The pre-push hook fails when it is not. Rebuild it with `mise run web:wasm`.
A deploy skips Rust when the glue is fresh (see "Deploy on push").

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
icons and the social images.

## Manual release

`mise run release` runs the check, every browser test, the smoke test on the built app under the
real headers, the deploy and a smoke test of the live site. It stops at the first failure.
`mise run deploy` is the deploy alone. It stops when the account is not the pinned one.

## Headers

`app/web/public/_headers` holds the Content-Security-Policy and the cache rules. Change it with
the wasm in mind: the page needs `'wasm-unsafe-eval'` to compile the Rust core.

## The service worker

`vite build` also builds `/sw.js` (the plugin `app/web/scripts/swPlugin.ts`), after the app, from
the list of built files. The cache is named `atelier-shell-<version>`, where the version is the
first 12 hex digits of a SHA-256 over the file list and bytes. So every release makes a new cache,
and the old one is deleted when the new worker activates. `_headers` serves `/sw.js`, `/index.html` and the manifest with `no-cache`, so a
release reaches users. The smoke test `PREVIEW=1 pnpm --dir app/web exec playwright test pwa-offline.spec.ts pwa-manifest.spec.ts pwa-update.spec.ts`
checks offline start and the automatic update on the built app.

## Icons and social images

`mise run web:brand` makes every file in `app/web/public/` (favicons, the app icons, `og.png`, `og-square.png`)
from the logo sources in `app/web/brand/`. Change the logo there, run it, and commit the files.
