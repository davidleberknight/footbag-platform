#!/usr/bin/env bash
# Boot the dev stack (web + image worker) for the Playwright E2E suite.
#
# Differs from scripts/dev.sh in three ways:
#   1. Uses plain `tsx` (no --watch); the E2E run never edits source
#      files; watch mode just adds 2-3s of cold-start latency.
#   2. Owns its own trap so Playwright's SIGTERM cleanly tears both
#      children down even when bash job-control quirks would otherwise
#      orphan them.
#   3. Provisions an ephemeral DB and exports INTERNAL_EVENT_SECRET into
#      both child envs; the regression that prompted this whole layer
#      was the image worker not seeing that var, so the launcher MUST
#      make both children see it.

set -euo pipefail
cd "$(dirname "$0")/../.."

TEST_DB="$(mktemp -t footbag-e2e-XXXXXX.db)"
echo "→ E2E ephemeral DB: ${TEST_DB}"
sqlite3 "${TEST_DB}" < database/schema.sql
# The email service renders every outbound message from email_templates rows,
# and the E2E flows follow emailed links, so the ephemeral DB needs the
# committed template seed.
python3 scripts/seed_email_templates.py --db "${TEST_DB}"
E2E_DB_PATH_FILE="${TMPDIR:-/tmp}/footbag-e2e-db-path"
echo "${TEST_DB}" > "${E2E_DB_PATH_FILE}"

CURATED_ROOT="$(mktemp -d -t footbag-e2e-curated-XXXXXX)"
echo "→ E2E ephemeral curated root: ${CURATED_ROOT}"

export FOOTBAG_DB_PATH="${TEST_DB}"
export FOOTBAG_ENV="development"
export NODE_ENV="development"
export PORT="3000"
export IMAGE_PORT="4001"
export LOG_LEVEL="warn"   # quiet info-level boot chatter so Playwright's
                          # stdout pipe does not back up under low buffer
export SESSION_SECRET="${SESSION_SECRET:-e2e-test-session-secret-do-not-use-in-prod}"
export INTERNAL_EVENT_SECRET="${INTERNAL_EVENT_SECRET:-e2e-test-internal-event-secret}"
export PUBLIC_BASE_URL="http://127.0.0.1:3000"
export JWT_SIGNER="${JWT_SIGNER:-local}"
export JWT_LOCAL_KEYPAIR_PATH="${JWT_LOCAL_KEYPAIR_PATH:-${TMPDIR:-/tmp}/footbag-e2e-jwt.pem}"
export SES_ADAPTER="${SES_ADAPTER:-stub}"
export AWS_REGION="${AWS_REGION:-us-east-1}"
export SECRETS_ADAPTER="${SECRETS_ADAPTER:-stub}"
export IMAGE_PROCESSOR_URL="http://127.0.0.1:4001"
export ALLOW_CURATED_SIDECAR_WRITES="1"
# Redirect curated reads/writes off the committed /curated/ tree (read by
# getCuratedRootDir via config.curatedRootDirOverride) so an e2e curator
# write lands in a throwaway dir, removed by the cleanup trap.
export CURATED_ROOT_DIR="${CURATED_ROOT}"

WEB_PID=""
IMAGE_PID=""

cleanup() {
  trap '' INT TERM EXIT
  [[ -n "${WEB_PID}"   ]] && kill -TERM "${WEB_PID}"   2>/dev/null || true
  [[ -n "${IMAGE_PID}" ]] && kill -TERM "${IMAGE_PID}" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    if ! kill -0 "${WEB_PID:-0}" 2>/dev/null && ! kill -0 "${IMAGE_PID:-0}" 2>/dev/null; then
      break
    fi
    sleep 0.4
  done
  [[ -n "${WEB_PID}"   ]] && kill -KILL "${WEB_PID}"   2>/dev/null || true
  [[ -n "${IMAGE_PID}" ]] && kill -KILL "${IMAGE_PID}" 2>/dev/null || true
  [[ -n "${CURATED_ROOT:-}" ]] && rm -rf "${CURATED_ROOT}" || true
}
trap cleanup INT TERM EXIT

echo "→ Starting image worker on :${IMAGE_PORT}"
node ./node_modules/.bin/tsx src/imageWorker.ts &
IMAGE_PID=$!

echo "→ Starting web server on :${PORT}"
node ./node_modules/.bin/tsx src/server.ts &
WEB_PID=$!

# Hand control to whichever child exits first; the trap handles cleanup.
wait -n "${WEB_PID}" "${IMAGE_PID}"
