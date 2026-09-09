#!/usr/bin/env bash
# Root-side body of scripts/rehearse-curation-cutover.sh.
#
# Invocation: cat'd onto the same ssh stdin stream that carries the sudo
# password on line one, per the wire pattern in scripts/lib/host-env-remote.sh:
#
#   { printf '%s\n' "$SUDO_PASS"
#     printf 'REHEARSAL_ACTION=%q\n' probe
#     cat scripts/internal/rehearse-curation-cutover-remote.sh
#   } | ssh "${HOST_SSH_OPTS[@]}" "$alias" 'sudo -k -S -p "" bash'
#
# Three actions, one file, because all three need the same env-file and
# database resolution and splitting them would mean three copies of it.
#
#   probe           report the host state the rehearsal asserts against
#   marker-set      record the cutover marker, both halves together
#   marker-reverse  reverse it, both halves together
#
# The two marker actions delegate to /srv/footbag/scripts/cutover-marker.sh
# rather than writing either marker here. That script is the single writer: the
# config table is append-only, so the reversal is a superseding row rather than
# an edit, and a second implementation of that is how the two halves end up
# disagreeing. It ships to the host with the deploy rsync.
#
# It also requires a terminal for its typed confirmation, deliberately, because
# a caller redirecting a credential file into a script whose prompt reads stdin
# has the password consumed as the answer. That is a real hazard and this does
# not weaken it: `script` allocates a fresh pty, the phrase is fed on that pty,
# and the credential stream never reaches it. The repository's own test for the
# marker script drives its write path exactly this way.
#
# Diagnostics go to stderr and only REHEARSAL_* lines to stdout, so the caller
# can parse the probe without a progress line ever being mistaken for a value.
set -euo pipefail

REMOTE_ENV_PATH="${ENV_PATH:-/srv/footbag/env}"
MARKER_SCRIPT="${MARKER_SCRIPT:-/srv/footbag/scripts/cutover-marker.sh}"

# The phrases the marker script asks for, one per direction. Passed in by the
# caller rather than duplicated here. If they ever change, the marker script
# aborts on the mismatch and says so, which is a loud failure rather than a
# silent one.
MARKER_PHRASE="${MARKER_PHRASE:-}"

# Only the probe reads it; defaulted so the marker actions do not have to be
# invoked with a slug they make no use of.
REHEARSAL_TRICK_SLUG="${REHEARSAL_TRICK_SLUG:-}"

# An absent key is a normal answer, not a failure: the cutover marker is absent
# on every pre-cutover host. Under `pipefail` grep's exit status would otherwise
# end the run at the first key that is not there.
remote_env_value() {
  { grep -E "^$1=" "$REMOTE_ENV_PATH" 2>/dev/null || true; } | tail -1 | cut -d= -f2-
}

# The host env file's FOOTBAG_DB_PATH is authoritative, exactly as the deploy's
# own guard resolves it; the literal default is the last resort for a host with
# no env record yet.
REMOTE_DB_PATH="$(remote_env_value FOOTBAG_DB_PATH)"
REMOTE_DB_PATH="${REMOTE_DB_PATH:-/srv/footbag/db/footbag.db}"

have() { command -v "$1" >/dev/null 2>&1; }

# One statement, so the seven editorial fields are read in a fixed order and
# hashed as one value. Unit separators between them, so moving text from the end
# of one field to the start of the next changes the hash.
prose_sql() {
  cat <<SQL
SELECT coalesce(description,'')||char(31)
    || coalesce(short_description,'')||char(31)
    || coalesce(execution_summary,'')||char(31)
    || coalesce(learning_notes,'')||char(31)
    || coalesce(prerequisite_notes,'')||char(31)
    || coalesce(pronunciation,'')||char(31)
    || coalesce(operational_notation_source,'')
FROM freestyle_tricks WHERE slug='${REHEARSAL_TRICK_SLUG}';
SQL
}

do_probe() {
  echo "REHEARSAL_ENV_PATH=${REMOTE_ENV_PATH}"
  echo "REHEARSAL_DB_PATH=${REMOTE_DB_PATH}"

  # Reported rather than assumed, because the deploy's cutover guard degrades
  # deliberately without sqlite3: it warns and lets the env line decide alone,
  # since failing closed there would block the disaster rebuild the refusal
  # exists to permit. On a host with no sqlite3 the two-marker protection is
  # one-marker protection, and no test suite can see that.
  have sqlite3 && echo "REHEARSAL_SQLITE3=present" || echo "REHEARSAL_SQLITE3=absent"
  have script  && echo "REHEARSAL_PTY_TOOL=present" || echo "REHEARSAL_PTY_TOOL=absent"
  [[ -r "$MARKER_SCRIPT" ]] \
    && echo "REHEARSAL_MARKER_SCRIPT=present" \
    || echo "REHEARSAL_MARKER_SCRIPT=absent"

  local env_marker
  env_marker="$(remote_env_value FOOTBAG_CUTOVER_COMPLETE)"
  echo "REHEARSAL_ENV_MARKER=${env_marker:-absent}"

  if [[ ! -e "$REMOTE_DB_PATH" ]]; then
    echo "REHEARSAL_DB_STATE=no-database"
    return 0
  fi

  # The inode, not a byte hash. A live database's bytes change under ordinary
  # traffic, so a hash would fail a run that proved nothing wrong; a
  # database-replacing deploy swaps the file, which the inode shows and nothing
  # else does as cheaply.
  echo "REHEARSAL_DB_INODE=$(stat -c '%i' "$REMOTE_DB_PATH")"

  if ! have sqlite3 || ! sqlite3 "$REMOTE_DB_PATH" 'SELECT 1;' >/dev/null 2>&1; then
    echo "REHEARSAL_DB_STATE=unreadable"
    return 0
  fi
  echo "REHEARSAL_DB_STATE=readable"

  local db_marker
  db_marker="$(sqlite3 "$REMOTE_DB_PATH" \
    "SELECT value_json FROM system_config_current WHERE config_key='post_cutover';" 2>/dev/null || true)"
  echo "REHEARSAL_DB_MARKER=${db_marker:-absent}"

  local found
  found="$(sqlite3 "$REMOTE_DB_PATH" \
    "SELECT count(*) FROM freestyle_tricks WHERE slug='${REHEARSAL_TRICK_SLUG}';")"
  echo "REHEARSAL_TRICK_FOUND=${found}"

  if [[ "$found" != "0" ]]; then
    echo "REHEARSAL_PROSE_SHA=$(prose_sql | sqlite3 "$REMOTE_DB_PATH" | sha256sum | cut -d' ' -f1)"
  fi

  # Two counts, because they fail differently. The per-trick count is what
  # proves the operator's own in-app edit is still recorded; the total is what
  # notices a replacement that happened to preserve this one trick.
  echo "REHEARSAL_TRICK_AUDIT_COUNT=$(sqlite3 "$REMOTE_DB_PATH" \
    "SELECT count(*) FROM audit_entries WHERE entity_type='freestyle_trick' AND entity_id='${REHEARSAL_TRICK_SLUG}';")"
  echo "REHEARSAL_AUDIT_TOTAL=$(sqlite3 "$REMOTE_DB_PATH" 'SELECT count(*) FROM audit_entries;')"
}

do_marker() {
  local direction="$1"

  if [[ ! -r "$MARKER_SCRIPT" ]]; then
    echo "ERROR: ${MARKER_SCRIPT} is absent on this host, so the marker cannot be moved" >&2
    echo "       by its own writer. Deploy from a tree carrying it first." >&2
    return 1
  fi
  if ! have script; then
    echo "ERROR: util-linux 'script' is absent on this host, so the marker writer's" >&2
    echo "       typed confirmation cannot be answered without a terminal." >&2
    return 1
  fi
  if [[ -z "$MARKER_PHRASE" ]]; then
    echo "ERROR: no confirmation phrase was supplied for direction '${direction}'." >&2
    return 1
  fi

  echo "==> moving the cutover marker to '${direction}' via ${MARKER_SCRIPT}" >&2
  printf '%s\n' "$MARKER_PHRASE" \
    | script -qec "bash ${MARKER_SCRIPT} --set ${direction}" /dev/null
}

case "${REHEARSAL_ACTION:-}" in
  probe)          do_probe ;;
  marker-set)     do_marker complete ;;
  marker-reverse) do_marker reversed ;;
  *)
    echo "ERROR: REHEARSAL_ACTION must be probe, marker-set or marker-reverse" >&2
    exit 2
    ;;
esac
