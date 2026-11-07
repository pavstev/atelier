# Shared setup for the scripts in this folder. Each script runs `source "$(dirname "$0")/lib.sh"`.
# It stops on the first error, moves to the repo root, and gives the scripts `SITE`, `stage` and
# `web`. Plain bash and no other state, so it is safe to source in the Cloudflare build too.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The live site. Fixed here, so deploy.sh and release.sh never probe another site. Only
# live-check.sh takes SITE from the environment (SITE=... scripts/live-check.sh).
SITE=https://atelier.stevanpavlovic.com

start=$(date +%s)
# Prints a step heading with the seconds since the script began.
stage() { echo "== $1 (at $(( $(date +%s) - start )) s)"; }

# curl with DNS over HTTPS: a Mac may hold a stale "no such host" from before the first deploy.
web() { curl --doh-url https://1.1.1.1/dns-query "$@"; }
