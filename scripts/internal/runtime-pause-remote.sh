#!/usr/bin/env bash
# Root-side body for reading or setting one of the platform's runtime kill
# switches on a deployed host. Never run directly: it expects the variable
# assignments its caller emits ahead of this body on the same stdin stream, and
# it runs as root because the caller pipes it into sudo.
#
# One body serves every switch, because how a switch is written is the part that
# must not vary: the append-only insert, the millisecond timestamp, the reason
# quoting and the read-back are the same whether payments or outbound mail is
# being stopped. The caller names the key and owns the wording around it.
#
# Invoked via scripts/payments-pause.sh or scripts/outbound-mail-pause.sh:
#   { printf '%s\n' "$SUDO_PASS";
#     printf 'DB_FILE=%q\n' "$path";
#     printf 'CONFIG_KEY=%q\n' "payments_paused|email_outbox_paused";
#     printf 'ACTION=%q\n' "status|pause|resume";
#     printf 'REASON=%q\n' "$reason";
#     cat scripts/internal/runtime-pause-remote.sh;
#   } | ssh REMOTE 'sudo -k -S -p "" bash'
#
# The database file is root-owned, so something has to run as root to touch it.
# This body does that and nothing else: it writes no file anywhere on the host
# and leaves nothing staged for a crash or an interrupt to skip cleaning up.
#
# system_config is append-only, enforced by triggers. Setting the switch is
# therefore an INSERT of a newer effective row, never an UPDATE, and the history
# of every pause and resume stays on the table as its own audit trail. The
# reading is taken from system_config_current, the same view the application
# reads, so what this prints is what the running platform will act on.
#
# Required shell variables (emitted by the caller ahead of this body):
#   DB_FILE     absolute path of the SQLite database
#   CONFIG_KEY  which switch to read or write
#   ACTION      status | pause | resume
#   REASON   free text recorded on the row (ignored by status)
#   ACTOR    member id of the operator, recorded on the row (optional)

set -euo pipefail

: "${DB_FILE:?remote half requires DB_FILE}"
: "${CONFIG_KEY:?remote half requires CONFIG_KEY}"
: "${ACTION:?remote half requires ACTION}"
: "${REASON:=set by a runtime-pause script}"
: "${ACTOR:=}"

# The key names a row this body will write, so it is checked against the switches
# that exist rather than passed through. A typo would otherwise insert a
# configuration row nothing reads and report success: the switch would appear to
# have moved while the platform carried on unchanged.
case "$CONFIG_KEY" in
  payments_paused|email_outbox_paused) ;;
  *) echo "ERROR: unknown CONFIG_KEY '$CONFIG_KEY'." >&2; exit 1 ;;
esac

command -v sqlite3 >/dev/null 2>&1 || {
  echo "ERROR: sqlite3 CLI is not installed on this host (apt-get install -y sqlite3)." >&2
  exit 1
}

if [[ ! -r "$DB_FILE" ]]; then
  echo "ERROR: $DB_FILE does not exist or is unreadable even as root." >&2
  exit 1
fi

read_state() {
  sqlite3 "$DB_FILE" \
    "SELECT COALESCE((SELECT value_json FROM system_config_current
                      WHERE config_key = '${CONFIG_KEY}'), '0');"
}

before="$(read_state)"

if [[ "$ACTION" == "status" ]]; then
  printf 'SWITCH_PAUSED=%s\n' "$before"
  exit 0
fi

case "$ACTION" in
  pause)  want=1 ;;
  resume) want=0 ;;
  *) echo "ERROR: unknown ACTION '$ACTION'." >&2; exit 1 ;;
esac

if [[ "$before" == "$want" ]]; then
  echo "    already in the requested state; no row written" >&2
  printf 'SWITCH_PAUSED=%s\n' "$before"
  exit 0
fi

# A second-resolution timestamp could collide with an existing row on the
# UNIQUE (config_key, effective_start_at) constraint if the switch were flipped
# twice inside one second. Millisecond resolution matches what the application
# writes and makes that practically impossible; a collision would abort the
# INSERT rather than silently overwriting, which is the safe direction anyway.
now="$(sqlite3 "$DB_FILE" "SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now');")"
row_id="pause_$(date -u +%Y%m%dT%H%M%S)_$$"

# SQL string literals cannot span a newline unquoted, and a per-line sed wraps
# quotes around EACH line rather than around the whole value: a reason pasted
# out of an incident thread therefore produced two adjacent literals and a
# syntax error, so the switch silently did not move at the one moment speed
# matters. Newlines and carriage returns collapse to spaces before quoting, and
# the doubling of single quotes is what makes the value injection-safe.
reason_sql="'$(printf '%s' "$REASON" | tr '\n\r' '  ' | sed "s/'/''/g")'"

# The operator's own member id, when they gave one. Recorded so the platform's
# own configuration history can answer who paused payments, rather than that
# question falling back to host access logs outside the application entirely.
if [[ -n "$ACTOR" ]]; then
  actor_sql="'$(printf '%s' "$ACTOR" | tr '\n\r' '  ' | sed "s/'/''/g")'"
else
  actor_sql="NULL"
fi

sqlite3 "$DB_FILE" <<SQL
PRAGMA busy_timeout=15000;
INSERT INTO system_config
  (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
VALUES
  ('${row_id}', '${now}', '${CONFIG_KEY}', '${want}', '${now}',
   ${reason_sql}, ${actor_sql});
SQL

after="$(read_state)"
if [[ "$after" != "$want" ]]; then
  echo "ERROR: the switch did not take: wanted ${want}, reads ${after}." >&2
  exit 1
fi

echo "    wrote ${CONFIG_KEY}=${want} effective ${now}" >&2
printf 'SWITCH_PAUSED=%s\n' "$after"
