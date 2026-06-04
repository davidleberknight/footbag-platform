#!/usr/bin/env bash
# scripts/validate-qc-absence.sh -- the internal QC subsystem must be absent
# from the production runtime image.
#
# Inspects the built production image: dist/internal-qc must not exist and
# the stubbed router module must export null. Until the QC retirement
# deletes the source subtree, the Dockerfile strip is the only thing keeping
# QC code out of production; this gate catches a build that lost the strip.
#
# Env:
#   FOOTBAG_PROD_IMAGE   Image tag to inspect (default: footbag-web:latest)
# Flags:
#   --mock               Skip docker entirely; emit PASS for tests
set -euo pipefail

IMAGE="${FOOTBAG_PROD_IMAGE:-footbag-web:latest}"

if [[ "${1:-}" == "--mock" ]]; then
  echo "GATE: QC-ABSENCE PASS: mock mode (no docker inspection)"
  exit 0
fi

if ! docker image inspect "${IMAGE}" > /dev/null 2>&1; then
  echo "GATE: QC-ABSENCE FAIL: image '${IMAGE}' not found locally (set FOOTBAG_PROD_IMAGE or build first)" >&2
  exit 1
fi

if docker run --rm --entrypoint sh "${IMAGE}" -c 'test -d dist/internal-qc'; then
  echo "GATE: QC-ABSENCE FAIL: dist/internal-qc present in ${IMAGE}; the production image strip is missing" >&2
  exit 1
fi

STUB_CHECK=$(docker run --rm --entrypoint sh "${IMAGE}" -c "node -e \"process.stdout.write(String(require('/app/dist/routes/internalRoutes.js').internalRouter))\"")
if [[ "${STUB_CHECK}" != "null" ]]; then
  echo "GATE: QC-ABSENCE FAIL: dist/routes/internalRoutes.js is not the null stub (got: ${STUB_CHECK})" >&2
  exit 1
fi

echo "GATE: QC-ABSENCE PASS: dist/internal-qc absent and router stubbed in ${IMAGE}"
