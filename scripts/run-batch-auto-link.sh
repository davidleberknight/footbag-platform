#!/usr/bin/env bash
# scripts/run-batch-auto-link.sh -- run the batch auto-link candidate-staging
# job against a seeded environment, once its legacy data is loaded.
#
# The staging test load is where this belongs: its personas wait at the wizard's
# claim step, so a run puts staged cards in front of them and rehearses the
# stage-and-confirm path whole. On the launched platform every account is
# created after launch and the wizard's claim task matches each member live as
# the task renders, so that side needs no pass of its own.
#
# It stages candidates for members to confirm later: no live-table mutation, no
# email, and safe to re-run (re-running stages nothing new). The run is recorded
# in system_job_runs. Requires the app runtime environment (FOOTBAG_DB_PATH plus
# the standard app env) to be present on the host.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx tsx src/runBatchAutoLink.ts "$@"
