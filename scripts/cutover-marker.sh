#!/usr/bin/env bash
# cutover-marker.sh
#
# Reads and moves the cutover marker, which lives in two places at once.
#
# At cutover the live database becomes the source of truth for content, and the
# destructive database-replacing deploy is refused from then on. That fact is
# recorded twice, because neither record covers both failure cases:
#
#   - FOOTBAG_CUTOVER_COMPLETE=1 in the host env file. Readable when the
#     database is not, which is what keeps a disaster rebuild possible at all.
#   - a system_config row with config_key 'post_cutover' in the database.
#     Travels with any copy of that database, so a restored snapshot stays
#     protected on whatever machine it lands.
#
# scripts/internal/deploy-rebuild-cutover-guard.sh reads both and refuses when
# they disagree, because one set without the other says the cutover was recorded
# half way and which half decides whether the host is protected. This script is
# how they stop disagreeing: it moves both together, in one act, so an operator
# cannot set one and forget the other.
#
# Why a script and not two typed commands: the reversal is the part that gets
# done wrong under pressure. The config table is append-only, so reversing the
# database marker means appending a superseding row rather than deleting or
# editing the one that is there, and an operator reaching for DELETE at 2am
# leaves a database that reads pre-cutover while its history says otherwise.
#
# Runs ON the host, as root (it writes the host env file and the live database).
#
# Usage:
#   scripts/cutover-marker.sh --status
#   scripts/cutover-marker.sh --set complete
#   scripts/cutover-marker.sh --set reversed
#   scripts/cutover-marker.sh --set complete --dry-run
#
# Overrides, for the tests and for a non-standard host layout:
#   ENV_PATH   path to the host env file   (default /srv/footbag/env)
#   DB_PATH    path to the live database   (default: FOOTBAG_DB_PATH from the
#                                           env file, else /srv/footbag/db/footbag.db)
set -euo pipefail

MARKER_ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
ACTION=""
DRY_RUN="no"
# One phrase per direction, deliberately different from each other and from the
# production-live marker's pair, so no phrase an operator has typed before
# carries them through a direction they did not mean.
CONFIRM_COMPLETE="RECORD CUTOVER COMPLETE"
CONFIRM_REVERSED="REVERSE CUTOVER MARKER"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status)   ACTION="status" ;;
    --set)      shift; ACTION="set-${1:-}" ;;
    --dry-run)  DRY_RUN="yes" ;;
    -h|--help)  sed -n '2,42p' "$0"; exit 0 ;;
    *)          echo "ERROR: unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$ACTION" in
  status|set-complete|set-reversed) ;;
  "")  echo "ERROR: one of --status or --set complete|reversed is required." >&2; exit 2 ;;
  *)   echo "ERROR: --set takes 'complete' or 'reversed'." >&2; exit 2 ;;
esac

marker_env() {
  grep -E "^$1=" "$MARKER_ENV_PATH" 2>/dev/null | tail -1 | cut -d= -f2-
}

if [[ -n "${DB_PATH:-}" ]]; then
  MARKER_DB_PATH="$DB_PATH"
else
  MARKER_DB_PATH="$(marker_env FOOTBAG_DB_PATH)"
  MARKER_DB_PATH="${MARKER_DB_PATH:-/srv/footbag/db/footbag.db}"
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 is unavailable, so the in-database marker cannot be read or" >&2
  echo "       written. Install sqlite3 on the host and retry." >&2
  exit 1
fi

read_env_marker() {
  if [[ -f "$MARKER_ENV_PATH" ]] && grep -qxF 'FOOTBAG_CUTOVER_COMPLETE=1' "$MARKER_ENV_PATH"; then
    echo "complete"
  else
    echo "reversed"
  fi
}

read_db_marker() {
  if [[ ! -f "$MARKER_DB_PATH" ]]; then
    echo "no-database"
    return
  fi
  if ! sqlite3 "file:${MARKER_DB_PATH}?mode=ro" 'SELECT count(*) FROM sqlite_master;' >/dev/null 2>&1; then
    echo "unreadable"
    return
  fi
  local value
  value=$(
    sqlite3 "file:${MARKER_DB_PATH}?mode=ro" \
      "SELECT value_json FROM system_config_current WHERE config_key = 'post_cutover';" 2>/dev/null
  ) || value=""
  value="${value//\"/}"
  if [[ "$value" == "1" ]]; then echo "complete"; else echo "reversed"; fi
}

ENV_STATE="$(read_env_marker)"
DB_STATE="$(read_db_marker)"

echo "Cutover marker status"
echo "  env file  $MARKER_ENV_PATH"
echo "    FOOTBAG_CUTOVER_COMPLETE: $ENV_STATE"
echo "  database  $MARKER_DB_PATH"
echo "    post_cutover:             $DB_STATE"
if [[ "$ENV_STATE" != "$DB_STATE" && "$DB_STATE" != "no-database" && "$DB_STATE" != "unreadable" ]]; then
  echo "  WARNING: the two disagree. The destructive rebuild deploy refuses in this"
  echo "           state. Run --set complete or --set reversed to bring them together."
fi

if [[ "$ACTION" == "status" ]]; then
  exit 0
fi

TARGET="${ACTION#set-}"

if [[ "$DB_STATE" == "unreadable" ]]; then
  echo "ERROR: $MARKER_DB_PATH is present but unreadable, so its marker cannot be" >&2
  echo "       moved. Repair or replace the database first; moving only the env" >&2
  echo "       file would leave the two disagreeing." >&2
  exit 1
fi
if [[ "$DB_STATE" == "no-database" ]]; then
  echo "ERROR: no database at $MARKER_DB_PATH, so only half the marker could be" >&2
  echo "       moved. A host with no database is pre-cutover by definition; there" >&2
  echo "       is nothing here to protect yet." >&2
  exit 1
fi

if [[ "$TARGET" == "complete" ]]; then DB_VALUE="1"; else DB_VALUE="0"; fi

echo ""
echo "==> Moving both markers to: $TARGET"
if [[ "$DRY_RUN" == "yes" ]]; then
  echo "    (dry run: nothing is written)"
  echo "    env file:  $([[ "$TARGET" == "complete" ]] && echo "append FOOTBAG_CUTOVER_COMPLETE=1" || echo "remove the FOOTBAG_CUTOVER_COMPLETE line")"
  echo "    database:  append a post_cutover row with value '$DB_VALUE'"
  echo "    a real run asks for the typed phrase: $([[ "$TARGET" == "complete" ]] && echo "$CONFIRM_COMPLETE" || echo "$CONFIRM_REVERSED")"
  exit 0
fi

# A typed phrase per direction. This script ships to the host with the deploy,
# both directions change what the destructive rebuild is allowed to do, and the
# reversal in particular removes that protection outright, so neither direction
# should be one keystroke away. A different phrase each way, so muscle memory
# from one cannot carry an operator through the other. --status and --dry-run
# never reach here.
#
# The prompt refuses a non-TTY stdin, matching the production-live marker it is
# paired with. The reasoning is not about how this script is invoked today but
# about the class of hazard: any caller that redirects a file into a script whose
# prompt reads stdin has the file's first line silently consumed as the answer,
# and an operator credential file is exactly the kind of thing that gets
# redirected into scripts around here. Refusing costs nothing, because moving a
# marker is a deliberate interactive act and is not scriptable in any case.
if ! { [[ -t 0 ]] && [[ -t 1 ]] && [[ -t 2 ]]; }; then
  echo "" >&2
  echo "ERROR: moving the cutover marker requires an interactive terminal for its" >&2
  echo "       typed confirmation, but stdin/stdout/stderr are not all TTYs." >&2
  echo "       Re-run from an interactive shell. Do NOT redirect a credential file" >&2
  echo "       into this script: its prompt reads stdin. Neither marker was moved." >&2
  exit 1
fi

echo ""
if [[ "$TARGET" == "complete" ]]; then
  CONFIRM_PHRASE="$CONFIRM_COMPLETE"
  echo "This records the cutover as complete, on this host and inside the database."
  echo ""
  echo "From this point the database-replacing rebuild deploy refuses this host and any"
  echo "copy of this database, with no bypass flag, and every destructive seeder and"
  echo "loader refuses alongside it. The reversal exists and is this same script."
else
  CONFIRM_PHRASE="$CONFIRM_REVERSED"
  echo "This REVERSES the cutover marker, re-arming the destructive rebuild deploy."
  echo ""
  echo "It removes the protection that stops a full-refresh deploy destroying the live"
  echo "database. Do this only for a deliberate disaster rebuild, and only while you"
  echo "accept that the loaded member data is no longer protected by this marker."
fi

echo ""
printf "Type '%s' to continue: " "$CONFIRM_PHRASE"
read -r TYPED
if [[ "$TYPED" != "$CONFIRM_PHRASE" ]]; then
  echo "Aborted: confirmation phrase not entered. Neither marker was moved." >&2
  exit 1
fi

# The database first. If it fails the env file is untouched and the two still
# agree; the reverse order would leave the env file ahead of the database on any
# write error, which is the disagreement state the guard refuses.
sqlite3 "$MARKER_DB_PATH" "
  INSERT INTO system_config (id, created_at, config_key, value_json, effective_start_at, reason_text)
  VALUES (
    'cfg_post_cutover_' || strftime('%Y%m%d%H%M%f','now'),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    'post_cutover',
    '$DB_VALUE',
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    'Cutover marker moved to $TARGET by cutover-marker.sh'
  );
"
echo "    database:  appended post_cutover = '$DB_VALUE'"

if [[ "$TARGET" == "complete" ]]; then
  if ! grep -qxF 'FOOTBAG_CUTOVER_COMPLETE=1' "$MARKER_ENV_PATH" 2>/dev/null; then
    printf 'FOOTBAG_CUTOVER_COMPLETE=1\n' >> "$MARKER_ENV_PATH"
  fi
  echo "    env file:  FOOTBAG_CUTOVER_COMPLETE=1 present"
else
  if [[ -f "$MARKER_ENV_PATH" ]]; then
    MARKER_TMP="$(mktemp)"
    grep -vxF 'FOOTBAG_CUTOVER_COMPLETE=1' "$MARKER_ENV_PATH" > "$MARKER_TMP" || true
    cat "$MARKER_TMP" > "$MARKER_ENV_PATH"
    rm -f "$MARKER_TMP"
  fi
  echo "    env file:  FOOTBAG_CUTOVER_COMPLETE line removed"
fi

echo ""
echo "Both markers now read: $TARGET"
echo "Record the timestamps in the cutover log."
