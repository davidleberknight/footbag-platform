#!/usr/bin/env bash
# Post-cutover refusal for the destructive database-replacing deploy.
#
# At cutover the live database becomes the single source of truth for content
# (freestyle content is edited in the running application from then on), and a
# database-replacing deploy would silently destroy those edits. The operator
# records the cutover in two places, and this guard reads both:
#
#   - FOOTBAG_CUTOVER_COMPLETE=1 appended to /srv/footbag/env on the host. It is
#     readable when the database is not, which is what keeps a disaster rebuild
#     possible at all.
#   - a system_config row with config_key 'post_cutover' and value '1' inside the
#     live database. It travels with any copy of that database, so a restored
#     snapshot stays protected on whatever machine it lands, which the env line
#     on one host can never do.
#
# Neither alone covers both cases, so both are kept. Keeping both means they can
# disagree, and a disagreement is never a state to deploy through: it says one
# was set without the other, or one was reversed without the other, and which of
# those it is decides whether this host is protected. The guard refuses and names
# which source says what rather than picking a winner.
#
# Invocation: prepended by scripts/deploy-rebuild.sh into the root ssh stream,
# ahead of the remote half, so it runs on the host as root BEFORE any live
# mutation (database replace, env edits, media wipe, service stop); its non-zero
# exit aborts the whole remote body. It also runs standalone for its tests, which
# point ENV_PATH and DB_PATH at fixture files.
#
# Rules:
#   - both markers absent          -> allowed (pre-cutover host)
#   - both markers present         -> refused, no bypass flag
#   - one present, one absent      -> refused; reconcile the two first
#   - env file missing             -> that marker reads absent (first bootstrap)
#   - database file missing        -> the env line decides alone. A fresh host has
#                                     no database yet, and a disaster rebuild
#                                     starts by moving the broken one aside.
#   - database unreadable, or no   -> the env line decides alone, with a warning.
#     sqlite3 on the host             Failing closed here would block the rebuild
#                                     in precisely the case it exists for.
#
# There is deliberately no in-band override. An operator who must rebuild a
# post-cutover host clears both markers as root on the host first: removing the
# env line, and appending a superseding post_cutover row of '0' (the config table
# is append-only, so the reversal is a new row, never an edit). Two deliberate
# out-of-band acts, in the operations guide's cutover section.

CUTOVER_GUARD_ENV_PATH="${ENV_PATH:-/srv/footbag/env}"

cutover_guard_env() {
  grep -E "^$1=" "$CUTOVER_GUARD_ENV_PATH" 2>/dev/null | tail -1 | cut -d= -f2-
}

# The host env file's FOOTBAG_DB_PATH is authoritative (the remote half deploys
# against it); the literal default is the last resort for a host with no env
# record yet. An explicit DB_PATH (the standalone fixture runs) wins over both.
if [[ -n "${DB_PATH:-}" ]]; then
  CUTOVER_GUARD_DB_PATH="$DB_PATH"
else
  CUTOVER_GUARD_DB_PATH="$(cutover_guard_env FOOTBAG_DB_PATH)"
  CUTOVER_GUARD_DB_PATH="${CUTOVER_GUARD_DB_PATH:-/srv/footbag/db/footbag.db}"
fi

CUTOVER_GUARD_ENV_MARKER="absent"
if [[ -f "$CUTOVER_GUARD_ENV_PATH" ]] \
  && grep -qxF 'FOOTBAG_CUTOVER_COMPLETE=1' "$CUTOVER_GUARD_ENV_PATH"; then
  CUTOVER_GUARD_ENV_MARKER="present"
fi

# 'unknown' is distinct from 'absent': it means the database could not answer,
# so it gets no vote rather than a silent "no".
CUTOVER_GUARD_DB_MARKER="absent"
if [[ ! -f "$CUTOVER_GUARD_DB_PATH" ]]; then
  CUTOVER_GUARD_DB_MARKER="unknown"
elif ! command -v sqlite3 >/dev/null 2>&1; then
  CUTOVER_GUARD_DB_MARKER="unknown"
  echo "WARNING: cutover guard: sqlite3 is unavailable on this host, so the" >&2
  echo "         in-database cutover marker could not be read. Falling back to the" >&2
  echo "         env-file marker alone." >&2
# The probe reads the schema rather than selecting a constant: SQLite opens a
# file lazily, so `SELECT 1` succeeds against a text file without ever touching
# the header, and a corrupt database would read as an empty one.
elif ! sqlite3 "file:${CUTOVER_GUARD_DB_PATH}?mode=ro" 'SELECT count(*) FROM sqlite_master;' >/dev/null 2>&1; then
  CUTOVER_GUARD_DB_MARKER="unknown"
  echo "WARNING: cutover guard: $CUTOVER_GUARD_DB_PATH is present but unreadable, so" >&2
  echo "         the in-database cutover marker could not be read. Falling back to the" >&2
  echo "         env-file marker alone." >&2
else
  CUTOVER_GUARD_DB_VALUE=$(
    sqlite3 "file:${CUTOVER_GUARD_DB_PATH}?mode=ro" \
      "SELECT value_json FROM system_config_current WHERE config_key = 'post_cutover';" 2>/dev/null
  ) || CUTOVER_GUARD_DB_VALUE=""
  # The value is stored as JSON, so it may arrive quoted.
  CUTOVER_GUARD_DB_VALUE="${CUTOVER_GUARD_DB_VALUE//\"/}"
  if [[ "$CUTOVER_GUARD_DB_VALUE" == "1" ]]; then
    CUTOVER_GUARD_DB_MARKER="present"
  fi
fi

if [[ "$CUTOVER_GUARD_ENV_MARKER" == "present" && "$CUTOVER_GUARD_DB_MARKER" == "absent" ]] \
  || [[ "$CUTOVER_GUARD_ENV_MARKER" == "absent" && "$CUTOVER_GUARD_DB_MARKER" == "present" ]]; then
  echo "ERROR: refusing the database-replacing deploy: the two cutover markers disagree." >&2
  echo "       $CUTOVER_GUARD_ENV_PATH marker FOOTBAG_CUTOVER_COMPLETE: $CUTOVER_GUARD_ENV_MARKER" >&2
  echo "       $CUTOVER_GUARD_DB_PATH marker post_cutover: $CUTOVER_GUARD_DB_MARKER" >&2
  echo "       One was set, or reversed, without the other. Which of those it is decides" >&2
  echo "       whether this host is protected, so the guard will not choose for you." >&2
  echo "       Reconcile both markers as root on the host, then retry. Setting the" >&2
  echo "       cutover means the env line plus a post_cutover row of '1'; reversing it" >&2
  echo "       means removing the env line plus appending a superseding row of '0'." >&2
  exit 1
fi

if [[ "$CUTOVER_GUARD_ENV_MARKER" == "present" || "$CUTOVER_GUARD_DB_MARKER" == "present" ]]; then
  echo "ERROR: refusing the database-replacing deploy: this host is post-cutover." >&2
  echo "       The live database became the source of truth at cutover and a rebuild" >&2
  echo "       deploy would destroy live content edits. Use scripts/deploy-code.sh for" >&2
  echo "       code deploys. There is no bypass flag; a disaster rebuild requires" >&2
  echo "       deliberately clearing both markers as root on the host first." >&2
  exit 1
fi
