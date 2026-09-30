#!/usr/bin/env bash
# Root-side body of scripts/realdata-staging.sh.
#
# Invocation: cat'd onto the same ssh stdin stream that carries the sudo
# password on line one, per the wire pattern in scripts/lib/host-env-remote.sh:
#
#   { printf '%s\n' "$SUDO_PASS"
#     printf 'RDI_MODE=%q\n'  invariants
#     printf 'GATES_B64=%q\n' "$(base64 -w0 scripts/validate-legacy-import-gates.sh)"
#     printf 'RI_B64=%q\n'    "$(base64 -w0 scripts/validate-realdata-ri.sh)"
#     cat scripts/internal/realdata-invariants-remote.sh
#   } | ssh "${HOST_SSH_OPTS[@]}" footbag-staging 'sudo -k -S -p "" bash'
#
# Two modes, one file, because both need the same database resolution:
#
#   probe       four lines: RDI_MEMBERS, RDI_AUTHORITATIVE, RDI_CLAIMABLE (counts)
#               and RDI_TARGET_ID, one opaque legacy id: the lowest legacy id
#               among Hall-of-Fame honorees carrying a legacy link, the record
#               the local real-claim crawl defaults to. The crawl itself never
#               runs against staging.
#   invariants  runs the two check scripts the workstation streamed in, each as
#               its own process against the live database, and prints their
#               GATE: lines followed by RDI_GATES_RC and RDI_RI_RC.
#
# What may leave this host is the whole governance point of the file: counts,
# PASS/FAIL gate lines, and that one opaque id. Nothing else is printed to
# stdout, the check scripts' own stderr is discarded rather than relayed, and
# every refusal below is fixed text. No real member data is copied off the host.
#
# Nothing is written. The database is opened read-only, the check scripts arrive
# as base64 and run from a process substitution rather than a staged file, and
# there is nothing to clean up after an interrupt.
#
# Refuses (exit 1, before any query) when sqlite3 is not installed or the
# database file is absent; refuses (exit 3, before any query) when the
# database's write-ahead-log sidecars are absent; refuses (exit 2) an unknown
# mode.
set -euo pipefail

# The host env file names the database directory the running site mounts, so
# it is authoritative here as it is for the deploy. REMOTE_ENV_PATH exists for
# the companion test, which points it at a fixture env file.
REMOTE_ENV_PATH="${REMOTE_ENV_PATH:-/srv/footbag/env}"

# An absent key is a normal answer, not a failure: a host with no env record yet
# falls back to the literal default below. Under pipefail grep's status would
# otherwise end the run.
remote_env_value() {
  { grep -E "^$1=" "$REMOTE_ENV_PATH" 2>/dev/null || true; } | tail -1 | cut -d= -f2-
}

DB_DIR="$(remote_env_value FOOTBAG_DB_DIR)"
DB_DIR="${DB_DIR:-/srv/footbag/db}"
DB_PATH="${DB_DIR}/footbag.db"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 is not installed on this host; the real-data checks cannot read the database." >&2
  exit 1
fi
if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: no database file at the path the host env file names; nothing to check." >&2
  exit 1
fi

# A read-only open is not write-free on a WAL database. When the -shm and -wal
# sidecars are absent, which is the state a stopped site leaves, SQLite creates
# them even for a read-only connection, and as root they would be root-owned:
# the site's own account could then fail to open its database on the next
# start. They exist whenever the site is running, so their absence means this
# is not the moment to read, and the run refuses before any query rather than
# create them.
if [[ ! -e "${DB_PATH}-shm" || ! -e "${DB_PATH}-wal" ]]; then
  echo "ERROR: the database's write-ahead-log sidecars are absent (is the site stopped?)." >&2
  echo "       Reading now would create them as root, so nothing was read. Start the site and re-run." >&2
  exit 3
fi

# Every read is read-only and has stdin closed. This shell is reading its own
# body from the ssh stream, so a child left holding that stdin would swallow the
# rest of the script.
q() {
  sqlite3 "file:${DB_PATH}?mode=ro" "$1" </dev/null 2>/dev/null
}

count_or_refuse() {
  local value
  if ! value="$(q "$1")" || [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "ERROR: a count query against the host database did not answer." >&2
    exit 1
  fi
  printf '%s' "$value"
}

do_probe() {
  local members authoritative claimable target
  members="$(count_or_refuse "SELECT COUNT(*) FROM legacy_members;")"
  authoritative="$(count_or_refuse "SELECT COUNT(*) FROM legacy_members WHERE import_source = 'legacy_site_data';")"
  claimable="$(count_or_refuse "SELECT COUNT(*) FROM historical_persons WHERE hof_member = 1 AND legacy_member_id IS NOT NULL;")"
  target="$(q "SELECT legacy_member_id FROM historical_persons
                WHERE hof_member = 1 AND legacy_member_id IS NOT NULL
                ORDER BY legacy_member_id LIMIT 1;" || true)"
  echo "RDI_MEMBERS=${members}"
  echo "RDI_AUTHORITATIVE=${authoritative}"
  echo "RDI_CLAIMABLE=${claimable}"
  echo "RDI_TARGET_ID=${target}"
}

# run_streamed <base64-body>
# Runs one streamed check script against the live database and prints only its
# GATE: lines. Its exit status is kept in STREAMED_RC.
STREAMED_RC=0
run_streamed() {
  local body="$1" out
  STREAMED_RC=0
  out="$(FOOTBAG_DB_PATH="$DB_PATH" bash <(base64 -d <<<"$body") </dev/null 2>/dev/null)" \
    || STREAMED_RC=$?
  printf '%s\n' "$out" | { grep -E '^GATE: ' || true; }
}

do_invariants() {
  if [[ -z "${GATES_B64:-}" || -z "${RI_B64:-}" ]]; then
    echo "ERROR: invariants mode needs both check scripts on the stream (GATES_B64, RI_B64)." >&2
    exit 1
  fi
  local gates_rc ri_rc
  run_streamed "$GATES_B64"; gates_rc=$STREAMED_RC
  run_streamed "$RI_B64";    ri_rc=$STREAMED_RC
  echo "RDI_GATES_RC=${gates_rc}"
  echo "RDI_RI_RC=${ri_rc}"
}

case "${RDI_MODE:-}" in
  probe)      do_probe ;;
  invariants) do_invariants ;;
  *)
    echo "ERROR: RDI_MODE must be probe or invariants" >&2
    exit 2
    ;;
esac
