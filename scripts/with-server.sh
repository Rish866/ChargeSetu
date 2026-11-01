#!/usr/bin/env bash
# Dev helper: starts the production server, runs the given command, then stops
# the server. Usage: scripts/with-server.sh <command...>
# Requires a prior `npm run build`.
set -u
PORT="${PORT:-3000}"
npx next start -p "$PORT" > "${SERVER_LOG:-/tmp/ev-server.log}" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.5
done
"$@"
