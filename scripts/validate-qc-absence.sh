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
#   FOOTBAG_PROD_IMAGE   Image tag to inspect (default: docker-web:latest, the
#                        web image the deploy builds, checks and sends to the
#                        host; a default naming any other image inspects
#                        something that never ships)
# Flags:
#   --mock               Skip docker entirely, so the aggregator can be exercised
#                        without an image. Reports SKIPPED, never PASS: the run
#                        inspects nothing, and a checklist that reads green while
#                        a gate never looked is worse than no checklist.
set -euo pipefail

IMAGE="${FOOTBAG_PROD_IMAGE:-docker-web:latest}"

# Tables the retirement dropped. A compiled bundle naming one of these means QC
# code came back, whatever directory it landed in.
RETIRED_TABLES='net_review_queue|net_candidate_match|net_curated_match|net_raw_fragment|net_recovery_alias_candidate|net_team_correction_candidate'

if [[ "${1:-}" == "--mock" ]]; then
  echo "GATE: QC-ABSENCE SKIPPED: mock mode (no docker inspection; proves nothing about the image)"
  exit 0
fi

if ! docker image inspect "${IMAGE}" > /dev/null 2>&1; then
  echo "GATE: QC-ABSENCE FAIL: image '${IMAGE}' not found locally (set FOOTBAG_PROD_IMAGE or build first)" >&2
  exit 1
fi

ERR_FILE=$(mktemp)
trap 'rm -f "${ERR_FILE}"' EXIT
trap "trap '' HUP INT TERM; exit 129" HUP
trap "trap '' HUP INT TERM; exit 130" INT
trap "trap '' HUP INT TERM; exit 143" TERM

# A check that could not run looked at nothing, so it fails the gate with the
# tool's own message rather than reading as "absent".
inspection_failed() {
  echo "GATE: QC-ABSENCE FAIL: could not inspect ${IMAGE} for $1 (exit $2): $(cat "${ERR_FILE}")" >&2
  exit 1
}

# Whether a path exists in the image. `test` answers 0 or 1; any other status is
# docker failing to start the container (125 to 127) or the shell failing, and
# says nothing about the path.
image_has() {
  local rc=0
  docker run --rm --entrypoint sh "${IMAGE}" -c "test $1 $2" 2>"${ERR_FILE}" || rc=$?
  case "${rc}" in
    0) return 0 ;;
    1) return 1 ;;
    *) inspection_failed "$2" "${rc}" ;;
  esac
}

if image_has -d dist/internal-qc; then
  echo "GATE: QC-ABSENCE FAIL: dist/internal-qc present in ${IMAGE}; the QC subsystem is retired and must not be rebuilt" >&2
  exit 1
fi

# The router module is gone, not stubbed. A file here means the mount returned.
if image_has -f dist/routes/internalRoutes.js; then
  echo "GATE: QC-ABSENCE FAIL: dist/routes/internalRoutes.js present in ${IMAGE}; the /internal router is retired" >&2
  exit 1
fi

# Catches QC code that reappeared somewhere other than the retired paths. Only
# grep's documented no-match (exit 1) means "no hits"; its error (exit 2) means
# the scan did not read everything, and fails the gate. The image's shell is
# POSIX sh, hence `[ ]` rather than `[[ ]]`.
TABLE_RC=0
TABLE_HITS=$(docker run --rm --entrypoint sh "${IMAGE}" -c \
  "grep -rlE '${RETIRED_TABLES}' dist/ || [ \$? -eq 1 ]" 2>"${ERR_FILE}") || TABLE_RC=$?
(( TABLE_RC == 0 )) || inspection_failed "retired QC tables" "${TABLE_RC}"
if [[ -n "${TABLE_HITS}" ]]; then
  echo "GATE: QC-ABSENCE FAIL: compiled modules in ${IMAGE} still name a retired QC table:" >&2
  echo "${TABLE_HITS}" >&2
  exit 1
fi

echo "GATE: QC-ABSENCE PASS: no QC subtree, no /internal router, and no retired QC table named in ${IMAGE}"
