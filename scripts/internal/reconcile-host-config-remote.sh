#!/usr/bin/env bash
# Root-side body for restoring named runtime configuration values on a deployed
# host to the defaults the schema seeds. Never run directly: it expects the
# variable assignments its caller emits ahead of this body on the same stdin
# stream, and it runs as root because the caller pipes it into sudo.
#
# Why this exists. A rebuild-and-replace deploy ships a database built on a
# workstation, and configuration rows live in that file. A value meant only for
# a developer's own machine therefore travels to whatever host the deploy lands
# on, where it is invisible: the host behaves differently from every document
# describing it, and nothing fails. The build no longer writes such rows, but a
# host already carrying one cannot be corrected by a code deploy.
#
# The configuration table is append-only, enforced by triggers, so a correction
# is a newer effective row rather than an edit. Both rows stay on the record,
# which is the point: the history says what the host was doing and when that
# stopped.
#
# Restoring to the SEEDED value rather than to a number written here is what
# keeps this honest. The schema's own epoch row is the default of record; a
# constant repeated in this script would be a second source of truth that drifts
# from it silently.
#
# Required shell variables (emitted by the caller ahead of this body):
#   DB_FILE  absolute path of the SQLite database
#   KEYS     space-separated configuration keys to reconcile
#   ACTION   status | apply
#   REASON   free text recorded on any row written (ignored by status)
#   ACTOR    member id of the operator, recorded on the row (optional)

set -euo pipefail

: "${DB_FILE:?remote half requires DB_FILE}"
: "${KEYS:?remote half requires KEYS}"
: "${ACTION:?remote half requires ACTION}"
: "${REASON:=restored to the seeded default}"
: "${ACTOR:=}"

command -v sqlite3 >/dev/null 2>&1 || {
  echo "ERROR: sqlite3 CLI is not installed on this host (apt-get install -y sqlite3)." >&2
  exit 1
}

if [[ ! -r "$DB_FILE" ]]; then
  echo "ERROR: $DB_FILE does not exist or is unreadable even as root." >&2
  exit 1
fi

case "$ACTION" in
  status|apply) ;;
  *) echo "ERROR: unknown ACTION '$ACTION'." >&2; exit 1 ;;
esac

# The value the application is acting on now.
current_value() {
  sqlite3 "$DB_FILE" \
    "SELECT COALESCE((SELECT value_json FROM system_config_current
                      WHERE config_key = '$1'), '');"
}

# The default of record: the earliest effective row for this key, which the
# schema seeds at the epoch. A key with no seed row is refused rather than
# guessed at, because inventing a default here is how a host quietly acquires a
# value nobody chose.
seeded_value() {
  sqlite3 "$DB_FILE" \
    "SELECT COALESCE((SELECT value_json FROM system_config
                      WHERE config_key = '$1'
                      ORDER BY effective_start_at ASC, created_at ASC
                      LIMIT 1), '');"
}

quote_sql() {
  printf "'%s'" "$(printf '%s' "$1" | tr '\n\r' '  ' | sed "s/'/''/g")"
}

if [[ -n "$ACTOR" ]]; then
  actor_sql="$(quote_sql "$ACTOR")"
else
  actor_sql="NULL"
fi

drift_found=0
written=0

for key in $KEYS; do
  seeded="$(seeded_value "$key")"
  if [[ -z "$seeded" ]]; then
    echo "ERROR: '$key' has no seeded row in this database; refusing to invent a default." >&2
    exit 1
  fi
  current="$(current_value "$key")"

  if [[ "$current" == "$seeded" ]]; then
    printf 'CONFIG_OK=%s current=%s\n' "$key" "$current"
    continue
  fi

  drift_found=1
  printf 'CONFIG_DRIFT=%s current=%s seeded=%s\n' "$key" "$current" "$seeded"
  [[ "$ACTION" == "status" ]] && continue

  # Millisecond resolution matches what the application writes and keeps two
  # corrections inside one second from colliding on the table's uniqueness
  # constraint, which would abort rather than overwrite.
  now="$(sqlite3 "$DB_FILE" "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now');")"
  row_id="cfgfix_$(date -u +%Y%m%dT%H%M%S)_$$_${written}"

  sqlite3 "$DB_FILE" <<SQL
PRAGMA busy_timeout=15000;
INSERT INTO system_config
  (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
VALUES
  ('${row_id}', '${now}', '${key}', '${seeded}', '${now}',
   $(quote_sql "$REASON"), ${actor_sql});
SQL

  after="$(current_value "$key")"
  if [[ "$after" != "$seeded" ]]; then
    echo "ERROR: '$key' did not take: wanted ${seeded}, reads ${after}." >&2
    exit 1
  fi
  written=$((written + 1))
  printf 'CONFIG_RESTORED=%s value=%s\n' "$key" "$seeded"
done

printf 'CONFIG_DRIFT_FOUND=%s\n' "$drift_found"
printf 'CONFIG_ROWS_WRITTEN=%s\n' "$written"
