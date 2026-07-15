#!/usr/bin/env bash
# Shared post-cutover refusal for destructive seeders and loaders (shell entry).
#
# Thin wrapper over scripts/lib/db_cutover_guard.py, the single implementation
# of the contract: a database carrying the in-database post_cutover marker
# (system_config key 'post_cutover' = 1) is, or was copied from, the live
# source of truth, and every destructive rebuild or reseed refuses it before
# any mutation, with no bypass flag. Missing file, missing system_config table,
# or no marker row all mean pre-cutover and are allowed. Implemented over
# python3 (a prerequisite everywhere this guard runs) rather than the sqlite3
# CLI, which not every runtime context installs.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${1:?usage: assert-db-pre-cutover.sh <db-path>}"

exec "${PYTHON:-python3}" "${REPO_ROOT}/scripts/lib/db_cutover_guard.py" "${DB}"
