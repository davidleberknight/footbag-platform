# shellcheck shell=bash
# Deletes the database copies a deploy or a restore set aside, once they are
# more than seven days old. Defines one function and runs nothing, so it can
# travel ahead of a remote half on the same ssh stream, the way the deploy's
# guards do:
#
#   cat scripts/internal/prune-db-copies.sh scripts/internal/<name>-remote.sh
#
# A migrating deploy copies the live database aside before it migrates, and an
# in-place restore copies it aside before the snapshot replaces it. Each copy is
# a full copy of the member database, and without this a host that deploys and
# restores routinely fills its disk with member data nobody will reach for again. Seven days is long enough to notice that a
# migration or a restore went wrong and to walk back to the copy; after that the
# snapshot stream is the way back, and it keeps a month of hourly points.
#
# What it deletes, and nothing else:
#   footbag.db.pre-migration.<YYYYMMDDTHHMMSSZ>
#   footbag.db.pre-restore.<YYYYMMDDTHHMMSSZ>
# strictly older than seven days by the UTC timestamp in the name. The name is
# the clock, not the file's modification time: both copies are taken with
# `cp -a`, which keeps the original's modification time, so a copy taken today
# of a database last written a month ago would look a month old and be deleted
# the day it was made.
#
# What it refuses to touch: the live database and its sidecars, any other file
# in the directory, and any copy whose name does not carry a timestamp it can
# read. A malformed name is reported and kept, because a guess at its age is a
# guess about whether it is the only way back.
#
# Every copy it looks at is printed as deleted or kept. It returns non-zero when
# it could not do its job (no such directory, a copy it could not delete); the
# caller decides what that costs, and both callers treat it as a warning,
# because a copy left in place is disk, not data loss.
#
# Each copy kept for a reason, and each failure, is a warning the operator's
# closing report lists. It goes through crr_warn from
# scripts/lib/closing-report-remote.sh, which the caller sends ahead of this file
# on the same stream; on a stream that does not carry it the same line is printed
# in the plain WARNING form, so a missing report library never turns a kept copy
# into silence.
#
# Test seam: PRUNE_NOW_EPOCH fixes "now" to the given epoch second, and the run
# says so on stderr, because a run on a fixed clock proves nothing about the
# host's own.

_prune_warn() {
  if declare -F crr_warn >/dev/null; then
    crr_warn "prune-db-copies: $*"
  else
    echo "prune-db-copies: WARNING: $*" >&2
  fi
}

prune_db_copies() {
  local db_dir="${1:-}"
  local now max_age=$(( 7 * 24 * 60 * 60 ))
  local path name stamp epoch rm_err rc=0
  local saved_nullglob

  if [[ -z "$db_dir" || ! -d "$db_dir" ]]; then
    _prune_warn "no database directory at '${db_dir}'; nothing pruned."
    return 1
  fi

  if [[ -n "${PRUNE_NOW_EPOCH:-}" ]]; then
    if [[ ! "$PRUNE_NOW_EPOCH" =~ ^[0-9]+$ ]]; then
      _prune_warn "PRUNE_NOW_EPOCH='${PRUNE_NOW_EPOCH}' is not an epoch second; nothing pruned."
      return 1
    fi
    echo "prune-db-copies: TEST SEAM: the clock is fixed at epoch ${PRUNE_NOW_EPOCH} by PRUNE_NOW_EPOCH" >&2
    now="$PRUNE_NOW_EPOCH"
  else
    now="$(date -u +%s)"
  fi

  saved_nullglob="$(shopt -p nullglob)"
  shopt -s nullglob
  for path in "${db_dir}"/footbag.db.pre-migration.* "${db_dir}"/footbag.db.pre-restore.*; do
    name="${path##*/}"
    stamp="${name##*.}"
    if [[ ! "$stamp" =~ ^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z$ ]]; then
      _prune_warn "kept ${name}: its name carries no readable timestamp."
      continue
    fi
    epoch="$(date -u -d "${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]} ${BASH_REMATCH[4]}:${BASH_REMATCH[5]}:${BASH_REMATCH[6]}" +%s 2>/dev/null)" || epoch=""
    if [[ ! "$epoch" =~ ^[0-9]+$ ]]; then
      _prune_warn "kept ${name}: its timestamp is not a real date."
      continue
    fi
    if [[ ! -f "$path" || -L "$path" ]]; then
      _prune_warn "kept ${name}: not a regular file."
      continue
    fi
    if (( now - epoch > max_age )); then
      if rm_err="$(rm -f -- "$path" 2>&1)"; then
        echo "prune-db-copies: deleted ${name}"
      else
        _prune_warn "could not delete ${name}: ${rm_err}"
        rc=1
      fi
    else
      echo "prune-db-copies: kept ${name} (seven days old or less)"
    fi
  done
  eval "$saved_nullglob"
  return "$rc"
}
