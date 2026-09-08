#!/usr/bin/env bash
# Root-side body of the pre-cutover checklist's snapshot step.
#
# Invoked as:
#   { printf 'DR_BUCKET=%q\n' "$b"; cat - scripts/internal/take-pre-cutover-snapshot-remote.sh; } \
#     | ssh REMOTE 'sudo -k -S -p "" bash'
#
# Why this exists. The checklist's gate scripts default to the operator's own
# ./database/footbag.db, so a checklist run on a workstation certifies the
# workstation's build while the runbook says it certifies production. The
# snapshot is the step that fixes that for all of them: taken here, on the host,
# against the live database, it becomes both the rollback artifact and the
# subject every later gate reads. One object, attested once.
#
# The snapshot script itself ships with the deploy and is invoked in place
# rather than reimplemented here, so there is one implementation of the manifest
# and the gzip contract. This wrapper only supplies the host's paths and the DR
# bucket, and re-prints the manifest on a marked line the caller can find in a
# stream that also carries sudo and ssh noise.
set -euo pipefail

RELEASE_DIR=/home/footbag/footbag-release
SNAPSHOT="${RELEASE_DIR}/scripts/take-pre-cutover-snapshot.sh"

if [[ ! -r "${SNAPSHOT}" ]]; then
  echo "ERROR: ${SNAPSHOT} is not on this host. It ships with the deploy, so a host" >&2
  echo "       that has never taken a deploy from this tree does not have it yet." >&2
  exit 1
fi

DB_PATH="${FOOTBAG_DB_DIR:-/srv/footbag/db}/footbag.db"
if [[ ! -f "${DB_PATH}" ]]; then
  echo "ERROR: no live database at ${DB_PATH}." >&2
  exit 1
fi

if [[ -z "${DR_BUCKET:-}" ]]; then
  echo "ERROR: DR_BUCKET was not passed across the wire. Without it the snapshot" >&2
  echo "       would be written to this host and nowhere else, which is not a" >&2
  echo "       rollback artifact." >&2
  exit 1
fi

# The snapshot lands beside the database rather than in the release tree: the
# release tree is deleted and rebuilt by the next deploy, and this artifact must
# outlive that.
export FOOTBAG_DB_PATH="${DB_PATH}"
export FOOTBAG_SNAPSHOT_DIR="${FOOTBAG_SNAPSHOT_DIR:-/srv/footbag/snapshots}"
export FOOTBAG_DR_BUCKET="${DR_BUCKET}"

MANIFEST="$(bash "${SNAPSHOT}")"
printf '%s\n' "${MANIFEST}"

# One flat line the caller can grep out of the combined stream. The manifest
# itself is pretty-printed JSON, and the caller needs exactly one field from it.
DR_URI="$(printf '%s' "${MANIFEST}" | tr -d ' \n' | sed -n 's/.*"dr_s3_uri":"\([^"]*\)".*/\1/p')"
if [[ -z "${DR_URI}" ]]; then
  echo "ERROR: the snapshot reported no DR URI, so nothing left this host." >&2
  exit 1
fi
printf 'PRECUTOVER_SNAPSHOT_URI=%s\n' "${DR_URI}"
