#!/usr/bin/env bash
# Production-safety guard for the freestyle rebuild.
#
# The rebuild DELETE+INSERTs every freestyle table into its target database, so
# it must never run against a live database. At go-live the live database
# becomes the single source of truth for freestyle content and this CSV pipeline
# retires from the production path; until then the guard refuses any target that
# is not one of this checkout's own disposable databases. There is no bypass
# flag: an operator who must rebuild does so on a development checkout.
#
# Refuses unless BOTH hold:
#   1. FOOTBAG_ENV is unset or exactly "development" (never staging or production;
#      those are the only other values the app itself accepts).
#   2. The resolved target path is one of this checkout's own DISPOSABLE databases
#      under database/, never a live or operator-pointed one. Two such databases
#      exist and both are allowed on purpose: footbag.db (the dev default) and
#      footbag-ci.db (the CI loader-smoke gate rebuilds into it via
#      FOOTBAG_DB_PATH, so allowing only footbag.db would break that gate).
#      Allowing both is the intended rule, not a widening to be trimmed back to a
#      single name: the rule is "any disposable in-checkout database, never a live
#      one", and these are the two disposable databases that exist. Paths are
#      canonicalized, so a symlink or a relative path cannot slip a live database
#      past the check.
set -euo pipefail

PY="${PYTHON:-python3}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${1:?usage: _assert_dev_db.sh <target-db-path>}"

if [ -n "${FOOTBAG_ENV:-}" ] && [ "${FOOTBAG_ENV}" != "development" ]; then
  echo "REFUSED: the freestyle rebuild runs only in development (FOOTBAG_ENV=${FOOTBAG_ENV}); it never rebuilds a staging or production database." >&2
  exit 1
fi

canon() { "${PY}" -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"; }
TARGET="$(canon "${DB}")"
ALLOWED_DEV="$(canon "${REPO_ROOT}/database/footbag.db")"
ALLOWED_CI="$(canon "${REPO_ROOT}/database/footbag-ci.db")"

if [ "${TARGET}" != "${ALLOWED_DEV}" ] && [ "${TARGET}" != "${ALLOWED_CI}" ]; then
  echo "REFUSED: the freestyle rebuild targets only this checkout's own database (database/footbag.db, or database/footbag-ci.db under CI); refusing an unrecognized database path." >&2
  echo "  requested: ${TARGET}" >&2
  exit 1
fi

# A database can be disposable by path and still be a copy of the live one (a
# restored snapshot placed at the dev path). The in-database post-cutover
# marker travels with such copies, and the shared guard refuses them.
"${REPO_ROOT}/scripts/internal/assert-db-pre-cutover.sh" "${TARGET}"
