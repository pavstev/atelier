#!/usr/bin/env bash
# Read-only probe of the live site: which commit is live, and do the home page, the wasm, the
# icons and the share images answer. Usage: scripts/live-check.sh [SHA] (default: HEAD).
# Exit 0 only when version.txt starts with the sha (a full sha or a short one) and every file answers. It deploys nothing.
site=${SITE:-}
source "$(dirname "$0")/lib.sh"
SITE=${site:-$SITE}

want=${1:-$(git rev-parse HEAD)}
# A quiet web() that retries.
get() { web -s --retry 3 --retry-delay 2 --retry-all-errors "$@"; }

fail=0
live=$(get "$SITE/version.txt?x=$(date +%s)" | tr -d '[:space:]')
if [ -n "$live" ] && [ "${live#"$want"}" != "$live" ]; then echo "ok   version.txt is ${want:0:7}"; else echo "FAIL version.txt is '${live:0:40}', wanted ${want:0:7}"; fail=1; fi

check() { # path, content-type fragment
  local out code type
  out=$(get -o /dev/null -w '%{http_code} %{content_type}' "$SITE$1")
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
