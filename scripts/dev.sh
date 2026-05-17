#!/usr/bin/env bash
# Launch the dev web server + image worker together with clean shutdown.
#
# Both processes are required for full local functionality (avatar upload
# routes the bytes to the image worker over HTTP per DD §1.7's four-container
# topology; in dev the worker runs as a sibling tsx-watch process).
#
# Ctrl+C (SIGINT) or SIGTERM kills both children before exiting. The trap
# also catches an unexpected exit from either child so a crashed worker
# does not leave the web server running orphaned.

set -uo pipefail
# Job control: each `&` child runs in its own process group, so signaling
# the group leader's negative PID reaches every descendant (tsx watch, node,
# esbuild). Without this, npm absorbs SIGTERM and orphans its grandchildren,
# leaving the dev server holding a lock on database/footbag.db.
set -m

cd "$(dirname "$0")/.."

WEB_PID=""
IMAGE_PID=""

# Signal a child's entire process group. $pid is the group leader (PGID)
# because it was started under `set -m`.
kill_group() {
  local pid=$1 sig=$2
  [[ -n "$pid" ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  kill -"$sig" -- "-$pid" 2>/dev/null || true
}

cleanup() {
  trap '' INT TERM EXIT  # disarm the trap so a slow shutdown doesn't re-fire

  kill_group "$IMAGE_PID" TERM
  kill_group "$WEB_PID"   TERM

  for i in 1 2 3 4 5; do
    if ! kill -0 "${IMAGE_PID:-0}" 2>/dev/null \
       && ! kill -0 "${WEB_PID:-0}" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  kill_group "$IMAGE_PID" KILL
  kill_group "$WEB_PID"   KILL
}

trap cleanup INT TERM EXIT

echo "→ Starting image worker (port 4001)..."
npm run dev:image &
IMAGE_PID=$!

echo "→ Starting web server (port 3000)..."
npm run dev &
WEB_PID=$!

wait -n "${WEB_PID}" "${IMAGE_PID}"
