#!/usr/bin/env bash
# scripts/validate-qc-absence.sh -- the internal QC subsystem must be absent
# from the production runtime image.
#
# The subsystem is retired: there is no QC source, no /internal router, and no
# Dockerfile strip standing between QC code and production. Absence is therefore
# the whole contract, and this gate proves it against the built image rather
# than against the source tree, because the image is what ships.
#
# Env:
#   FOOTBAG_PROD_IMAGE   Image tag to inspect (default: footbag-web:latest)
# Flags:
#   --mock               Skip docker entirely; emit PASS for tests
set -euo pipefail

IMAGE="${FOOTBAG_PROD_IMAGE:-footbag-web:latest}"

# Tables the retirement dropped. A compiled bundle naming one of these means QC
# code came back, whatever directory it landed in.
RETIRED_TABLES='net_review_queue|net_candidate_match|net_curated_match|net_raw_fragment|net_recovery_alias_candidate|net_team_correction_candidate'

if [[ "${1:-}" == "--mock" ]]; then
  echo "GATE: QC-ABSENCE PASS: mock mode (no docker inspection)"
  exit 0
fi

if ! docker image inspect "${IMAGE}" > /dev/null 2>&1; then
  echo "GATE: QC-ABSENCE FAIL: image '${IMAGE}' not found locally (set FOOTBAG_PROD_IMAGE or build first)" >&2
  exit 1
fi

if docker run --rm --entrypoint sh "${IMAGE}" -c 'test -d dist/internal-qc'; then
  echo "GATE: QC-ABSENCE FAIL: dist/internal-qc present in ${IMAGE}; the QC subsystem is retired and must not be rebuilt" >&2
  exit 1
fi

# The router module is gone, not stubbed. A file here means the mount returned.
if docker run --rm --entrypoint sh "${IMAGE}" -c 'test -f dist/routes/internalRoutes.js'; then
  echo "GATE: QC-ABSENCE FAIL: dist/routes/internalRoutes.js present in ${IMAGE}; the /internal router is retired" >&2
  exit 1
fi

# Catches QC code that reappeared somewhere other than the retired paths.
TABLE_HITS=$(docker run --rm --entrypoint sh "${IMAGE}" -c \
  "grep -rlE '${RETIRED_TABLES}' dist/ 2>/dev/null || true")
if [[ -n "${TABLE_HITS}" ]]; then
  echo "GATE: QC-ABSENCE FAIL: compiled modules in ${IMAGE} still name a retired QC table:" >&2
  echo "${TABLE_HITS}" >&2
  exit 1
fi

echo "GATE: QC-ABSENCE PASS: no QC subtree, no /internal router, and no retired QC table named in ${IMAGE}"
