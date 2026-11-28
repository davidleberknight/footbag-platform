#!/usr/bin/env bash
# scripts/take-pre-cutover-snapshot.sh -- captures the pre-cutover DB snapshot.
#
# Copies the SQLite file to a timestamped path under database/snapshots/,
# computes SHA-256, runs PRAGMA integrity_check, gzips the result, and emits a
# manifest JSON capturing the snapshot id, byte size, hash, and row counts for
# the cutover-critical tables enumerated below. The manifest goes to stdout
# AND a sibling .manifest.json file.
#
# The artifact is gzipped so it matches the routine backup stream's format,
# which is what scripts/restore-db.sh reads. An uncompressed artifact here was
# one the rollback tooling could not read, discovered only at the moment the
# member database had already been replaced.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
# Output dir overridable via FOOTBAG_SNAPSHOT_DIR (default: ./database/snapshots).
#
# The snapshot is the load-bearing rollback artifact, so it must leave the
# host: FOOTBAG_DR_BUCKET names the cross-region DR bucket and the snapshot
# plus manifest upload to pre-flip/<snapshot-id>/ there (a path distinct from
# the routine backup stream, so retention never ages it out; Object Lock on
# the bucket makes it undeletable for the retention window). A run without
# FOOTBAG_DR_BUCKET is refused unless FOOTBAG_SNAPSHOT_LOCAL_ONLY=1 is set
# explicitly (local rehearsals), so a cutover run can never silently produce
# a local-only snapshot.
#
# An upload is refused unless FOOTBAG_DR_BUCKET is footbag-<staging|production>-
# db-snapshots-dr and this host records that same environment as its FOOTBAG_ENV
# (read from /srv/footbag/env; FOOTBAG_ENV_FILE replaces it in tests), so one
# environment's database never lands in the other's locked pre-flip slot.

set -euo pipefail
cd "$(dirname "$0")/.."

# The closing report goes to stderr, so stdout stays the manifest alone, which
# the host half and the cutover checklist read.
# shellcheck source=lib/closing-report.sh
source scripts/lib/closing-report.sh

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
OUT_DIR="${FOOTBAG_SNAPSHOT_DIR:-./database/snapshots}"
LOCAL_ONLY="${FOOTBAG_SNAPSHOT_LOCAL_ONLY:-0}"

if [[ "${LOCAL_ONLY}" != "1" && -z "${FOOTBAG_DR_BUCKET:-}" ]]; then
  cr_die "FOOTBAG_DR_BUCKET is not set. The pre-cutover snapshot must land in the cross-region DR bucket. Set FOOTBAG_DR_BUCKET, or set FOOTBAG_SNAPSHOT_LOCAL_ONLY=1 for an explicitly local rehearsal run."
fi
if [[ "${LOCAL_ONLY}" != "1" ]]; then
  command -v aws >/dev/null || cr_die "aws CLI not installed (required for the DR upload)"
  if [[ ! "${FOOTBAG_DR_BUCKET}" =~ ^footbag-(staging|production)-db-snapshots-dr$ ]]; then
    cr_die "REFUSING: FOOTBAG_DR_BUCKET='${FOOTBAG_DR_BUCKET}' is not footbag-<staging|production>-db-snapshots-dr. Nothing was changed."
  fi
  BUCKET_ENV="${BASH_REMATCH[1]}"
  HOST_ENV_FILE="${FOOTBAG_ENV_FILE:-/srv/footbag/env}"
  if [[ -n "${FOOTBAG_ENV_FILE:-}" ]]; then
    echo "NOTE: using a stand-in host environment file (FOOTBAG_ENV_FILE); this run proves nothing about any host." >&2
  fi
  # A file that is missing or unreadable records nothing; grep keeping no line
  # exits 1, which is a file recording no value.
  RECORDED_ENV=""
  if [[ -r "${HOST_ENV_FILE}" ]]; then
    RECORDED_ENV="$( { grep -E '^FOOTBAG_ENV=' "${HOST_ENV_FILE}" || [[ $? == 1 ]]; } | tail -1 | cut -d= -f2-)"
  fi
  if [[ -z "${RECORDED_ENV}" ]]; then
    cr_die "REFUSING: ${HOST_ENV_FILE} records no FOOTBAG_ENV (missing or unreadable), so this host cannot confirm its environment. Nothing was changed."
  fi
  if [[ "${RECORDED_ENV}" != "${BUCKET_ENV}" ]]; then
    cr_die "REFUSING: this host records FOOTBAG_ENV='${RECORDED_ENV}', but ${FOOTBAG_DR_BUCKET} is ${BUCKET_ENV}'s DR bucket. Nothing was changed."
  fi
fi

if [[ ! -f "${DB_FILE}" ]]; then
  cr_die "DB file not found: ${DB_FILE}"
fi

mkdir -p "${OUT_DIR}"

TS=$(date -u +%Y%m%dT%H%M%SZ)
SNAPSHOT_ID="pre-cutover-${TS}"
SNAPSHOT_PATH="${OUT_DIR}/${SNAPSHOT_ID}.db"
MANIFEST_PATH="${OUT_DIR}/${SNAPSHOT_ID}.manifest.json"

# Use sqlite3 .backup so a write in progress does not corrupt the copy.
# .backup also flushes WAL into the snapshot file (no separate .wal sidecar).
sqlite3 "${DB_FILE}" ".backup '${SNAPSHOT_PATH}'"

# Integrity check on the snapshot, not the live file, so the snapshot
# itself is the audit subject.
integrity=$(sqlite3 "${SNAPSHOT_PATH}" "PRAGMA integrity_check;")
if [[ "${integrity}" != "ok" ]]; then
  rm -f "${SNAPSHOT_PATH}"
  cr_die "snapshot integrity check FAILED: ${integrity}"
fi

byte_size=$(stat -c%s "${SNAPSHOT_PATH}" 2>/dev/null || stat -f%z "${SNAPSHOT_PATH}")
sha256=$(sha256sum "${SNAPSHOT_PATH}" | awk '{print $1}')

q() { sqlite3 "${SNAPSHOT_PATH}" "$1"; }

# Ten counts, which is the set the cutover preflight checklist requires of this
# manifest. The first five are also the set scripts/restore-db.sh prints back
# after a restore, and they match deliberately: a manifest recording counts a
# restore never reports cannot be reconciled against it, and that reconciliation
# is the whole reason the manifest travels with the artifact. The remaining five
# cover the seeded and freestyle tables, carried because they are cheap and this
# snapshot is the only way back after the member load.
count_members=$(q "SELECT COUNT(*) FROM members;")
count_legacy=$(q  "SELECT COUNT(*) FROM legacy_members;")
count_hp=$(q      "SELECT COUNT(*) FROM historical_persons;")
count_clubs=$(q   "SELECT COUNT(*) FROM clubs;")
count_audit=$(q   "SELECT COUNT(*) FROM audit_entries;")
count_nv=$(q      "SELECT COUNT(*) FROM name_variants;")
count_cbl=$(q     "SELECT COUNT(*) FROM club_bootstrap_leaders;")
count_ft=$(q      "SELECT COUNT(*) FROM freestyle_tricks;")
count_fr=$(q      "SELECT COUNT(*) FROM freestyle_records;")
count_ckr=$(q     "SELECT COUNT(*) FROM consecutive_kicks_records;")

# No legacy account may be claimed yet. This snapshot is taken after the final
# member load and before any member can sign in, so no member account exists to
# have claimed one; a claim here means something reached the platform during
# the freeze, and restoring this snapshot later would silently discard it. The
# sequence stops until that is explained, and it stops before the archive is
# made or uploaded, because the DR bucket's lock would keep a refused artifact.
claimed_legacy=$(q "SELECT COUNT(*) FROM legacy_members WHERE claimed_by_member_id IS NOT NULL;")
if [[ "${claimed_legacy}" != "0" ]]; then
  rm -f "${SNAPSHOT_PATH}"
  cr_die "REFUSING: ${claimed_legacy} legacy_members row(s) carry claimed_by_member_id, but no member account should exist at this snapshot. Find out how the claim reached the platform during the freeze before taking the rollback artifact. Nothing was uploaded."
fi

# Provenance. Without it the restore side can identify the artifact but not what
# it was taken from, and the pre-flip prefix holds exactly one object, so a
# search cannot pick a different one to compare against. Recording the host and
# the source path is what lets a restore say whether this snapshot came from
# production at all, rather than from whatever database the operator's own
# machine happened to be holding.
source_host=$(hostname -f 2>/dev/null || hostname)
source_db=$(readlink -f "${DB_FILE}" 2>/dev/null || printf '%s' "${DB_FILE}")

# Compress before upload, matching the routine stream's format, so this artifact
# has the same shape as every other snapshot scripts/restore-db.sh reads. gzip
# replaces the file in place, so this runs after every sqlite read above.
#
# byte_size and sha256 stay the UNCOMPRESSED values: they describe the database
# a restore reconstructs, and are what you verify against after restoring.
# archive_* describe the uploaded object, so it can be checked without
# decompressing it.
gzip -9 "${SNAPSHOT_PATH}"
SNAPSHOT_ARCHIVE="${SNAPSHOT_PATH}.gz"
archive_byte_size=$(stat -c%s "${SNAPSHOT_ARCHIVE}" 2>/dev/null || stat -f%z "${SNAPSHOT_ARCHIVE}")
archive_sha256=$(sha256sum "${SNAPSHOT_ARCHIVE}" | awk '{print $1}')

# An upload counts only once the stored object reads back at the local file's
# size: the CLI exiting 0 is not the rollback artifact being in the bucket.
dr_object_landed() { # <key> <local file> <what>
  local want got
  want=$(stat -c%s "$2" 2>/dev/null || stat -f%z "$2")
  got="$(aws s3api head-object --bucket "${FOOTBAG_DR_BUCKET}" --key "$1" \
    --query ContentLength --output text 2>&1)" || got=""
  [[ "${got}" == "${want}" ]] \
    || cr_die "the ${3} upload reported success, but s3://${FOOTBAG_DR_BUCKET}/${1} reads back as ${got:-absent}, not ${want} bytes; nothing is assumed uploaded"
}

dr_uri_json="null"
if [[ "${LOCAL_ONLY}" != "1" ]]; then
  DR_KEY="pre-flip/${SNAPSHOT_ID}/${SNAPSHOT_ID}.db.gz"
  DR_URI="s3://${FOOTBAG_DR_BUCKET}/${DR_KEY}"
  aws s3 cp --only-show-errors "${SNAPSHOT_ARCHIVE}" "${DR_URI}"
  dr_object_landed "${DR_KEY}" "${SNAPSHOT_ARCHIVE}" "archive"
  dr_uri_json="\"${DR_URI}\""
fi

cat > "${MANIFEST_PATH}" <<EOF
{
  "snapshot_id": "${SNAPSHOT_ID}",
  "snapshot_path": "${SNAPSHOT_ARCHIVE}",
  "byte_size": ${byte_size},
  "sha256": "${sha256}",
  "archive_byte_size": ${archive_byte_size},
  "archive_sha256": "${archive_sha256}",
  "integrity_check": "ok",
  "dr_s3_uri": ${dr_uri_json},
  "source_host": "${source_host}",
  "source_db_path": "${source_db}",
  "row_counts": {
    "members": ${count_members},
    "legacy_members": ${count_legacy},
    "historical_persons": ${count_hp},
    "clubs": ${count_clubs},
    "audit_entries": ${count_audit},
    "name_variants": ${count_nv},
    "club_bootstrap_leaders": ${count_cbl},
    "freestyle_tricks": ${count_ft},
    "freestyle_records": ${count_fr},
    "consecutive_kicks_records": ${count_ckr}
  },
  "created_at": "${TS}"
}
EOF

if [[ "${LOCAL_ONLY}" != "1" ]]; then
  aws s3 cp --only-show-errors "${MANIFEST_PATH}" \
    "s3://${FOOTBAG_DR_BUCKET}/pre-flip/${SNAPSHOT_ID}/${SNAPSHOT_ID}.manifest.json"
  dr_object_landed "pre-flip/${SNAPSHOT_ID}/${SNAPSHOT_ID}.manifest.json" "${MANIFEST_PATH}" "manifest"
fi

cat "${MANIFEST_PATH}"
cr_proved "${SNAPSHOT_ID} passed its integrity check, no legacy account in it is claimed, and its manifest records ten row counts"
if [[ "${LOCAL_ONLY}" != "1" ]]; then
  cr_proved "the archive and its manifest were uploaded under pre-flip/${SNAPSHOT_ID}/ in ${FOOTBAG_DR_BUCKET}"
else
  cr_unproved "the DR upload: this was a local-only run, so nothing left this machine"
fi
cr_finish
