#!/usr/bin/env bash
# Launch the dev web server + image worker + outbox/jobs worker together with
# clean shutdown.
#
# All three processes are required for full local functionality. Avatar upload
# routes the bytes to the image worker over HTTP per DD §1.7's four-container
# topology. The outbox/jobs worker (src/worker.ts) drains the email outbox and
# runs the daily jobs loop; without it a stub-captured email sits pending and
# the /dev/outbox viewer (which only reads, never drains) stays empty, and the
# scheduled emails (such as Active Player expiry) never fire. In dev each runs
# as a sibling tsx-watch process.
#
# Ctrl+C (SIGINT) or SIGTERM kills every child before exiting. The trap also
# catches an unexpected exit from any child so a crash does not leave the
# others running orphaned.

set -uo pipefail
# Job control: each `&` child runs in its own process group, so signaling
# the group leader's negative PID reaches every descendant (tsx watch, node,
# esbuild). Without this, npm absorbs SIGTERM and orphans its grandchildren,
# leaving the dev server holding a lock on database/footbag.db.
set -m

cd "$(dirname "$0")/.."

WEB_PID=""
IMAGE_PID=""
WORKER_PID=""

# Signal a child's entire process group. $pid is the group leader (PGID)
# because it was started under `set -m`. The liveness probe targets the whole
# group (`kill -0 -- -$pid`), not the leader PID: npm exits first on a forwarded
# signal and leaves its tsx/node children orphaned in the same group, so a
# leader-only check would report the group dead and skip the kill, leaking those
# children until tsx's own multi-second force-kill fires.
kill_group() {
  local pid=$1 sig=$2
  [[ -n "$pid" ]] || return 0
  kill -0 -- "-$pid" 2>/dev/null || return 0
  kill -"$sig" -- "-$pid" 2>/dev/null || true
}

# True while any process survives in the group led by $1. Guards the empty-PID
# case because `kill -0 -- -` with no PID would target the caller's own group.
group_alive() {
  [[ -n "$1" ]] && kill -0 -- "-$1" 2>/dev/null
}

cleanup() {
  trap '' INT TERM EXIT  # disarm the trap so a slow shutdown doesn't re-fire

  kill_group "$IMAGE_PID"  TERM
  kill_group "$WORKER_PID" TERM
  kill_group "$WEB_PID"    TERM

  for i in 1 2 3 4 5; do
    if ! group_alive "$IMAGE_PID" \
       && ! group_alive "$WORKER_PID" \
       && ! group_alive "$WEB_PID"; then
      break
    fi
    sleep 0.5
  done

  kill_group "$IMAGE_PID"  KILL
  kill_group "$WORKER_PID" KILL
  kill_group "$WEB_PID"    KILL
}

trap cleanup INT TERM EXIT

echo "→ Starting image worker (port 4001)..."
npm run dev:image &
IMAGE_PID=$!

echo "→ Starting outbox/jobs worker (port 3100)..."
npm run dev:worker &
WORKER_PID=$!

echo "→ Starting web server (port 3000)..."
npm run dev &
WEB_PID=$!

# Human-scannable summary of the dev stack. The per-process startup lines follow;
# in development the logger prints them in a compact human-readable form.
echo ""
echo "  footbag dev stack"
echo "    web          http://localhost:3000"
echo "    workers      image :4001   outbox/jobs :3100"
echo "    logs         development, human-readable, LOG_LEVEL=${LOG_LEVEL:-debug}"
echo "    stop         Ctrl+C (stops all three)"
echo ""

wait -n "${WEB_PID}" "${IMAGE_PID}" "${WORKER_PID}"
