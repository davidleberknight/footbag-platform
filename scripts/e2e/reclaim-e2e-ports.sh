#!/usr/bin/env bash
# Free the local e2e stack's ports (web 3000, image worker 4001) before
# Playwright boots its own throwaway stack.
#
# Playwright's webServer runs with reuseExistingServer:false, so if a dev server
# (./run_dev.sh) is already holding a port, Playwright refuses to start and the
# run fails with a confusing "port already used" error — and a server that was
# reused instead would run the browser tests against the wrong database (the dev
# app's loaded data, not the seeded ephemeral e2e DB), which looks like broken
# tests. Reclaiming the ports here, ahead of Playwright, makes `npm run test:e2e`
# work regardless of a running dev server, matching what run_all_tests.sh already
# does before its e2e gate. The e2e stack uses its own throwaway database, so
# stopping the dev server touches no real data; restart ./run_dev.sh afterward.
set -euo pipefail

for port in 3000 4001; do
  pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti:"${port}" 2>/dev/null || true)
  elif command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${port}/tcp" 2>/dev/null | tr -d ' ' || true)
  fi
  if [[ -n "${pids}" ]]; then
    echo "  → freeing port ${port} for the e2e stack (pids: ${pids})"
    kill -TERM ${pids} 2>/dev/null || true
    sleep 1
    kill -KILL ${pids} 2>/dev/null || true
  fi
done
