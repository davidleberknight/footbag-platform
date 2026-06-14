#!/usr/bin/env bash
# scripts/run-batch-auto-link.sh -- run the one-time batch auto-link candidate-
# staging job at cutover, once the legacy data import is loaded and before the
# platform opens to members.
#
# It stages candidates for members to confirm later: no live-table mutation, no
# email, and safe to re-run (re-running stages nothing new). The run is recorded
# in system_job_runs. Requires the app runtime environment (FOOTBAG_DB_PATH plus
# the standard app env) to be present on the cutover host.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx tsx src/runBatchAutoLink.ts "$@"
