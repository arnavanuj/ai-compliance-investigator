#!/usr/bin/env sh
set -eu

cleanup() {
  echo "Stopping services..."
  kill "$API_PID" "$WORKER_PID" "$UI_PID" 2>/dev/null || true
}

trap cleanup INT TERM

node dist/server.js &
API_PID=$!

node dist/workers/investigationWorker.js &
WORKER_PID=$!

cd /app/ui
HOSTNAME=0.0.0.0 PORT=3001 node node_modules/next/dist/bin/next start -p 3001 &
UI_PID=$!

wait "$API_PID" "$WORKER_PID" "$UI_PID"
