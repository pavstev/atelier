---
name: ship
description: Push Atelier to main and prove the Cloudflare Workers Build deployed it. Use to release, to deploy, or to time a build. Runs the check, pushes, waits for the live commit, probes the site, and reports the push-to-live time.
---

# Ship

A push to main starts a Workers Build (`scripts/ci-build.sh`, then `wrangler deploy`). The build
runs no checks, so the pre-push hook runs them first. The settings and the cache trick are in
`.claude/rules/web.md`.

## Steps

1. The pre-push hook runs `mise run check`. For a core or web change also run
   `mise run web:e2e` once. A change to `scripts/ci-build.sh` or the Rust toolchain needs both,
   since a cold build installs Rust again.
2. Commit with a small Conventional Commit. Fetch first. Stage only your own paths.
3. Run `wrangler whoami` through `pnpm --dir app/web exec wrangler whoami`. It may list
   other accounts too. The deploy is pinned to one account in `wrangler.jsonc`, so only check
   that the pinned account id is there. Never touch another account.
4. Note the time (`date +%s`), then `git push origin main`.
5. Wait with Monitor, never a manual poll: loop `curl -s https://atelier.stevanpavlovic.com/version.txt`
   every 20 s until it equals the pushed sha, and print the seconds since the push. End the loop
   after 25 minutes with a TIMEOUT line.
6. Run `bash scripts/live-check.sh` (it checks the sha, the home page, the icons and the share
   images). Say which commit is live. Do not say "live" before this passes.
7. A failed build: the dashboard has the log (Worker `atelier`, Deployments, Builds). Read the
   last 40 lines only. A common cause is a missing tool on the build image: fix `ci-build.sh`.

## Timing notes

Keep the numbers in this table, one row per push, so the cache effect stays measured.

| Push | Kind | Push to live |
|---|---|---|
| 1 | cold: Rust installed, wasm built, first build (deploy failed on the config path) | build 339 s |
| 2 | code change, deploy fixed | 246 s |
| 3 | docs only | 233 s |
| 4 | code change, big binary files (one-tool rework) | 522 s |
| 5 | code change without big binary files (the harness update) | 360 s |
| 6 | hooks config and docs (Lefthook) | 400 s |
| 7 | release 1, wasm glue committed, Rust build skipped on Cloudflare | 59 s |
| 8 | eval fixes (core change), wasm glue committed, Rust build skipped | 68 s |
| 9 | release 2 web (two workers, wasm edge change), wasm glue committed, Rust build skipped | 124 s |
| 10 | release 2 core (a core change and one new 4.9 MB file), wasm glue committed, Rust build skipped | 529 s |
| 11 | Paper base and Even knob (core and web change), wasm glue committed, Rust build skipped | 71 s |
| 12 | a core change, wasm glue committed, Rust build skipped | 101 s |
| 13 | Families preset and Shapes piles (core and web change), wasm glue committed, Rust build skipped | 119 s |
| 14 | dead code and stale docs cleanup (core, wasm edge, web and docs), wasm glue committed, Rust build skipped | 151 s |

The build cache did not restore Rust or cargo in builds 2 and 3, so a doc-only push costs as much
as a code push. A local `mise run release` is about 154 s warm but also runs the check and e2e.
