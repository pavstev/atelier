#!/usr/bin/env bash
# Read-only probe of the live site: which commit is live, and do the home page, the wasm, the
# icons and the share images answer. Usage: scripts/live-check.sh [SHA] (default: HEAD).
# Exit 0 only when version.txt starts with the sha (a full sha or a short one) and every file answers. It deploys nothing.
set -euo pipefail
cd "$(dirname "$0")/.."

SITE=${SITE:-https://atelier.stevanpavlovic.com}
want=${1:-$(git rev-parse HEAD)}
# DNS over HTTPS: this Mac may hold a stale "no such host" from before the first deploy.
web() { curl --doh-url https://1.1.1.1/dns-query -s --retry 3 --retry-delay 2 --retry-all-errors "$@"; }

fail=0
live=$(web "$SITE/version.txt?x=$(date +%s)" | tr -d '[:space:]')
if [ -n "$live" ] && [ "${live#"$want"}" != "$live" ]; then echo "ok   version.txt is ${want:0:7}"; else echo "FAIL version.txt is '${live:0:40}', wanted ${want:0:7}"; fail=1; fi

check() { # path, content-type fragment
  local out code type
  out=$(web -o /dev/null -w '%{http_code} %{content_type}' "$SITE$1")
  code=${out%% *}
  type=${out#* }
  case "$code:$type" in
    200:*"$2"*) echo "ok   $1 ($type)" ;;
    *) echo "FAIL $1 (got $code $type, wanted 200 $2)"; fail=1 ;;
  esac
}
check / text/html
check /favicon.ico image/
check /favicon.svg image/svg
check /og.png image/png
check /og-square.png image/png

exit "$fail"
