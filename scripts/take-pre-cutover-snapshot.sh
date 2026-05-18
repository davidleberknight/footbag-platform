#!/usr/bin/env bash
# scripts/take-pre-cutover-snapshot.sh -- captures the pre-cutover DB snapshot.
#
# Copies the SQLite file to a timestamped path under database/snapshots/,
# computes SHA-256, runs PRAGMA integrity_check, and emits a manifest JSON
# capturing the snapshot id, byte size, hash, and row counts for the
# tables flagged in IMPLEMENTATION_PLAN.md as cutover-critical. The
# manifest goes to stdout AND a sibling .manifest.json file.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).
# Output dir overridable via FOOTBAG_SNAPSHOT_DIR (default: ./database/snapshots).

set -euo pipefail
cd "$(dirname "$0")/.."

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"
OUT_DIR="${FOOTBAG_SNAPSHOT_DIR:-./database/snapshots}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "DB file not found: ${DB_FILE}" >&2
  exit 1
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
  echo "snapshot integrity check FAILED: ${integrity}" >&2
  rm -f "${SNAPSHOT_PATH}"
  exit 1
fi

byte_size=$(stat -c%s "${SNAPSHOT_PATH}" 2>/dev/null || stat -f%z "${SNAPSHOT_PATH}")
sha256=$(sha256sum "${SNAPSHOT_PATH}" | awk '{print $1}')

q() { sqlite3 "${SNAPSHOT_PATH}" "$1"; }

count_members=$(q "SELECT COUNT(*) FROM members;")
count_legacy=$(q  "SELECT COUNT(*) FROM legacy_members;")
count_hp=$(q      "SELECT COUNT(*) FROM historical_persons;")
count_nv=$(q      "SELECT COUNT(*) FROM name_variants;")
count_cbl=$(q     "SELECT COUNT(*) FROM club_bootstrap_leaders;")

cat > "${MANIFEST_PATH}" <<EOF
{
  "snapshot_id": "${SNAPSHOT_ID}",
  "snapshot_path": "${SNAPSHOT_PATH}",
  "byte_size": ${byte_size},
  "sha256": "${sha256}",
  "integrity_check": "ok",
  "row_counts": {
    "members": ${count_members},
    "legacy_members": ${count_legacy},
    "historical_persons": ${count_hp},
    "name_variants": ${count_nv},
    "club_bootstrap_leaders": ${count_cbl}
  },
  "created_at": "${TS}"
}
EOF

cat "${MANIFEST_PATH}"
exit 0
