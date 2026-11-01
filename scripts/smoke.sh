#!/usr/bin/env bash
# HTTP smoke test of the main routes. Run via: scripts/with-server.sh scripts/smoke.sh
set -u
BASE="${BASE:-http://localhost:3000}"
fail=0
check() {
  local path="$1" expected="$2"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$path")
  if [ "$code" = "$expected" ]; then
    printf "ok   %s %s\n" "$code" "$path"
  else
    printf "FAIL %s (expected %s) %s\n" "$code" "$expected" "$path"
    fail=1
  fi
}
check / 200
check /stations 200
check "/stations?city=Mumbai&connector=ccs2" 200
check "/stations?view=map" 200
check "/stations?minPower=abc&connector=bogus" 200
check /stations/greenplug-linking-road-hub-demo 200
check /about 200
check /report 200
check /login 200
check /operator 200
check /admin 200
check /admin/leads 200
check /operator/stations/new 200
check /manifest.webmanifest 200
check /contact 200
check /privacy 200
check /terms 200
check /login/forgot 200
check /account/password 200
check /robots.txt 200
check /sitemap.xml 200
check /icon.svg 200
check /icon-192.png 200
check "/stations?verified=1" 200
check /bogus-page 404

# Streamed (partially prerendered) routes send 200 before notFound() runs;
# Next.js then renders the not-found UI and adds <meta name="robots" content="noindex">.
contains() {
  local path="$1" text="$2"
  if curl -s "$BASE$path" | grep -q "$text"; then
    printf "ok   contains '%s' %s\n" "$text" "$path"
  else
    printf "FAIL missing '%s' %s\n" "$text" "$path"
    fail=1
  fi
}
not_contains() {
  local path="$1" text="$2"
  if curl -s "$BASE$path" | grep -q "$text"; then
    printf "FAIL leaked '%s' %s\n" "$text" "$path"
    fail=1
  else
    printf "ok   hides '%s' %s\n" "$text" "$path"
  fi
}
contains /stations/does-not-exist "Station not found"
# Pending/rejected stations must never be visible publicly.
not_contains /stations/greenplug-powai-lakeside-demo "Lake Boulevard"
not_contains /stations "Powai Lakeside"
not_contains /stations "Test Listing"
contains /stations "Availability not connected"
contains /admin "Sign in as an admin"
exit $fail
