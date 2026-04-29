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

cd "$(dirname "$0")/.."

# Track child PIDs so we can kill them cleanly on signal.
WEB_PID=""
IMAGE_PID=""

cleanup() {
  trap '' INT TERM EXIT  # disarm the trap so a slow shutdown doesn't re-fire

  if [[ -n "${IMAGE_PID}" ]] && kill -0 "${IMAGE_PID}" 2>/dev/null; then
    kill -TERM "${IMAGE_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" 2>/dev/null; then
    kill -TERM "${WEB_PID}" 2>/dev/null || true
  fi

  # Give children a moment to exit cleanly, then SIGKILL stragglers.
  for i in 1 2 3 4 5; do
    if ! kill -0 "${IMAGE_PID}" 2>/dev/null && ! kill -0 "${WEB_PID}" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  [[ -n "${IMAGE_PID}" ]] && kill -KILL "${IMAGE_PID}" 2>/dev/null || true
  [[ -n "${WEB_PID}" ]]   && kill -KILL "${WEB_PID}"   2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "→ Starting image worker (port 4001)..."
npm run dev:image &
IMAGE_PID=$!

echo "→ Starting web server (port 3000)..."
npm run dev &
WEB_PID=$!

# Wait for either child to exit; if one dies, take the other down with it.
# `wait -n` returns the exit status of whichever child finished first.
wait -n "${WEB_PID}" "${IMAGE_PID}"
