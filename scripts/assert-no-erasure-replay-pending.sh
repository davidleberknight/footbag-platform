#!/usr/bin/env bash
# scripts/assert-no-erasure-replay-pending.sh -- refuses to let the site start
# while a restored database has not had its erasures re-applied.
#
# An in-place restore (scripts/restore-db.sh) puts a snapshot in place and then
# re-applies the erasures that snapshot records as due. Until that replay has
# reported success, the database may hold personal data a member asked to have
# erased, so the site must not serve it. The restore marks that window with a
# file beside the database, written before the snapshot replaces anything and
# removed when the replay succeeds or the previous database is put back.
#
# The restore stops the service itself, but a stopped service does not stay
# stopped: a deploy restarts it, and a reboot starts it. This check runs as the
# main unit's ExecStartPre, so every one of those starts is refused while the
# marker stands, whoever or whatever asked for it.
#
# It refuses; it never clears the marker. The one way past it is the command it
# prints, which re-runs the replay and clears the marker only on success.
#
# Env (from /srv/footbag/env via the systemd unit):
#   FOOTBAG_DB_DIR   host dir holding footbag.db (default /srv/footbag/db)
#   FOOTBAG_ENV      the environment name, used only in the printed command
set -euo pipefail

DB_DIR="${FOOTBAG_DB_DIR:-/srv/footbag/db}"
MARKER="${DB_DIR}/.erasure-replay-pending"

if [[ -e "$MARKER" ]]; then
  echo "footbag: REFUSING TO START. A restored database at ${DB_DIR}/footbag.db has not" >&2
  echo "         had its erasures re-applied, so it may hold personal data a member" >&2
  echo "         asked to have erased. Marker: ${MARKER}" >&2
  if [[ -r "$MARKER" ]]; then
    sed 's/^/           /' "$MARKER" >&2 || true
  fi
  echo "         From a workstation, finish the replay and start the site with:" >&2
  echo "           bash scripts/restore-db.sh --target ${FOOTBAG_ENV:-<environment>} --resume-erasure-replay" >&2
  exit 1
fi
exit 0
