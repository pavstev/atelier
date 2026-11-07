#!/usr/bin/env bash
# Builds the web app and deploys it to Cloudflare (Worker `atelier`, atelier.stevanpavlovic.com),
# then probes the live site. It is the manual deploy from this Mac. A push to main deploys through
# Cloudflare Workers Builds (scripts/ci-build.sh) without it.
# The account is pinned. Any other account id stops the script.
set -euo pipefail
cd "$(dirname "$0")/.."

PINNED=69c9873da4df01aef631792032a43539 # the owner's Cloudflare account
SITE=https://atelier.stevanpavlovic.com

in_config=$(grep -o '"account_id": *"[0-9a-f]*"' wrangler.jsonc | grep -o '[0-9a-f]\{32\}')
if [ "$in_config" != "$PINNED" ]; then
  echo "deploy stopped: wrangler.jsonc names account $in_config, not the pinned $PINNED" >&2
  exit 1
fi
export CLOUDFLARE_ACCOUNT_ID=$PINNED
wrangler() { pnpm --dir app/web exec wrangler "$@"; }

echo "== account"
wrangler whoami 2>&1 | grep -q "$PINNED" || { echo "deploy stopped: this login cannot reach $PINNED" >&2; exit 1; }

echo "== build"
mise run web:build

echo "== deploy"
wrangler deploy --config "$PWD/wrangler.jsonc"

echo "== probe $SITE"
# DNS over HTTPS: this Mac may hold a stale "no such host" from before the first deploy.
web() { curl --doh-url https://1.1.1.1/dns-query "$@"; }
fail=0
check() { # name, url, expected status, header (optional)
  local code
  code=$(web -s -o /dev/null -w '%{http_code}' --retry 5 --retry-delay 3 --retry-all-errors "$2")
  if [ "$code" = "$3" ]; then echo "ok   $1 ($code)"; else echo "FAIL $1 (got $code, wanted $3)"; fail=1; fi
}
check "home" "$SITE/" 200
wasm=$(ls app/web/dist/assets/*.wasm | head -1)
check "wasm" "$SITE/assets/$(basename "$wasm")" 200
ctype=$(web -s -I "$SITE/assets/$(basename "$wasm")" | tr -d '\r' | grep -i '^content-type:' || true)
case "$ctype" in *application/wasm*) echo "ok   wasm type";; *) echo "FAIL wasm type: $ctype"; fail=1;; esac
web -s -I "$SITE/" | tr -d '\r' | grep -qi '^content-security-policy:' && echo "ok   csp header" || { echo "FAIL csp header"; fail=1; }
[ "$fail" = 0 ] || exit 1
echo "deployed: $SITE"
