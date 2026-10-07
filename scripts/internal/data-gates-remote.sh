#!/usr/bin/env bash
# Root-side body of the pre-cutover checklist's data checks.
#
# Invocation: cat'd onto the same ssh stdin stream that carries the sudo
# password on line one, per the wire pattern in scripts/lib/host-env-remote.sh:
#
#   { printf '%s\n' "$SUDO_PASS"
#     printf 'DG_SUBJECT=%q\n' snapshot          # or live
#     printf 'DG_SNAPSHOT_PATH=%q\n' "$path"     # snapshot only
#     printf 'DG_SNAPSHOT_SHA256=%q\n' "$sha"    # snapshot only
#     printf 'DG_<LABEL>_B64=%q\n' "$(base64 -w0 scripts/<check>.sh)"   # one per check
#     cat scripts/internal/data-gates-remote.sh
#   } | ssh "${HOST_SSH_OPTS[@]}" footbag-<target> 'sudo -k -S -p "" bash'
#
# Production member data never leaves AWS, so the checks go to the data: each
# check script arrives on the stream from the operator's checkout and runs here,
# and what comes back is its verdict and nothing else.
#
# Two subjects:
#
#   snapshot  the pre-cutover snapshot the same run just took on this host. It is
#             decompressed into a root-only scratch directory, its uncompressed
#             SHA-256 must match the manifest's, the checks read that copy, and
#             the copy is shredded on every exit. The checks therefore attest to
#             exactly the object a rollback would restore.
#   live      the running database, read-only. Refused when its write-ahead-log
#             sidecars are absent, since a read would then create them as root.
#
# What may leave this host: each check's GATE: lines, a GATE: line built from the
# exit status for a check that prints none, and one DG_<LABEL>_RC=<n> line per
# check. Nothing else reaches stdout; the checks' own stderr is discarded rather
# than relayed; every refusal is fixed text. The caller filters again, keeping
# only lines of those shapes whose text carries no '@' and no control character.
# Neither filter can recognise a name, so a GATE: line is relayed as the check
# wrote it, and a check must never put a member's name or any other row value in
# one.
#
# Optional, overridable for the companion tests:
#   REMOTE_ENV_PATH     the host env file (default /srv/footbag/env)
#   DG_SNAPSHOT_ROOT    the only directory a snapshot is read from
#                       (default /srv/footbag/snapshots)
set -euo pipefail

REMOTE_ENV_PATH="${REMOTE_ENV_PATH:-/srv/footbag/env}"
DG_SNAPSHOT_ROOT="${DG_SNAPSHOT_ROOT:-/srv/footbag/snapshots}"

# Label, then the GATE: name used when the check prints no GATE: line of its own.
CHECKS=(
  "G1_6:G1-G6"
  "CLUBS:G7"
  "LEADERS:G8"
  "VARIANTS:G11"
  "AUDIT:DEV-ADMIN-AUDIT"
  "SHOWCASE:SHOWCASE-PRESENCE"
)

command -v sqlite3 >/dev/null 2>&1 \
  || { echo "ERROR: sqlite3 is not installed on this host; the data checks cannot read the database." >&2; exit 1; }

scratch=""
cleanup() {
  if [[ -n "$scratch" && -d "$scratch" ]]; then
    find "$scratch" -type f -exec shred -u {} + 2>/dev/null || true
    rm -rf "$scratch"
  fi
}
trap cleanup EXIT

case "${DG_SUBJECT:-}" in
  snapshot)
    snap="${DG_SNAPSHOT_PATH:-}"
    want="${DG_SNAPSHOT_SHA256:-}"
    # Only a snapshot this host's own snapshot step wrote is read: a path from the
    # stream is a path the caller chose, and nothing else on the host is a subject.
    if [[ -z "$snap" || "$snap" != "${DG_SNAPSHOT_ROOT}/"*.db.gz || "$snap" == *..* || ! -f "$snap" ]]; then
      echo "ERROR: the snapshot to check is not a snapshot file under the host's snapshot directory." >&2
      exit 1
    fi
    [[ "$want" =~ ^[0-9a-f]{64}$ ]] \
      || { echo "ERROR: no snapshot checksum was passed, so the copy could not be matched to the manifest." >&2; exit 1; }
    umask 077
    scratch="$(mktemp -d)"
    DB_PATH="${scratch}/snapshot.db"
    gunzip -c "$snap" > "$DB_PATH" </dev/null \
      || { echo "ERROR: the snapshot did not decompress." >&2; exit 1; }
    got="$(sha256sum "$DB_PATH" | cut -d' ' -f1)"
    [[ "$got" == "$want" ]] \
      || { echo "ERROR: the decompressed snapshot does not match the manifest's checksum; nothing was checked." >&2; exit 1; }
    ;;
  live)
    db_dir="$({ grep -E '^FOOTBAG_DB_DIR=' "$REMOTE_ENV_PATH" 2>/dev/null || true; } | tail -1 | cut -d= -f2-)"
    DB_PATH="${db_dir:-/srv/footbag/db}/footbag.db"
    [[ -f "$DB_PATH" ]] \
      || { echo "ERROR: no database file at the path the host env file names; nothing to check." >&2; exit 1; }
    if [[ ! -e "${DB_PATH}-shm" || ! -e "${DB_PATH}-wal" ]]; then
      echo "ERROR: the database's write-ahead-log sidecars are absent (is the site stopped?)." >&2
      echo "       Reading now would create them as root, so nothing was read. Start the site and re-run." >&2
      exit 3
    fi
    ;;
  *)
    echo "ERROR: DG_SUBJECT must be snapshot or live." >&2
    exit 2
    ;;
esac

for entry in "${CHECKS[@]}"; do
  label="${entry%%:*}"
  fallback="${entry#*:}"
  var="DG_${label}_B64"
  body="${!var:-}"
  if [[ -z "$body" ]]; then
    echo "ERROR: the ${label} check was not on the stream." >&2
    exit 1
  fi
  rc=0
  out="$(FOOTBAG_DB_PATH="$DB_PATH" bash <(base64 -d <<<"$body") </dev/null 2>/dev/null)" || rc=$?
  gates="$(grep -E '^GATE: ' <<<"$out" || true)"
  if [[ -n "$gates" ]]; then
    printf '%s\n' "$gates"
  elif (( rc == 0 )); then
    printf 'GATE: %s PASS: exit 0\n' "$fallback"
  else
    printf 'GATE: %s FAIL: exit %d\n' "$fallback" "$rc"
  fi
  printf 'DG_%s_RC=%d\n' "$label" "$rc"
done
