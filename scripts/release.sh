#!/usr/bin/env bash
# The whole release in one run: the check, every browser test, the built app under the Cloudflare
# headers, the deploy and a smoke test of the live site. It stops at the first failure.
# Needs PHOTOS_DIR (default .agents/web-photos in the repo) to hold mona-lisa-2400.jpg, the photo
# the browser tests open. docs/development/testing.md says where to get it.
source "$(dirname "$0")/lib.sh"

stage "1/5 the check"
mise run check

stage "2/5 browser tests on the dev server"
mise run web:e2e

stage "3/5 built app with the Cloudflare headers"
mise run web:build
PREVIEW=1 pnpm --dir app/web exec playwright test smoke.spec.ts

stage "4/5 deploy"
bash scripts/deploy.sh

stage "5/5 live smoke test"
URL="$SITE/" pnpm --dir app/web exec playwright test smoke.spec.ts
echo "release done in $(( $(date +%s) - start )) s"
