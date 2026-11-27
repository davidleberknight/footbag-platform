#!/usr/bin/env bash
# scripts/lib/backup-key.sh -- the time a database backup was taken, read from
# its key.
#
# The backup writes each snapshot under footbag-<UTC timestamp>.db.gz, so the
# key names when it was taken. The restore scripts show that before they
# replace anything, so an operator about to restore sees how much would be lost.
# Defines functions only; runs nothing.

# backup_key_epoch <key>: the epoch the backup was taken; fails on a key that
# carries no timestamp in that form.
backup_key_epoch() {
  local base="${1##*/}"
  [[ "$base" =~ ^footbag-([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z ]] || return 1
  date -u -d "${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]} ${BASH_REMATCH[4]}:${BASH_REMATCH[5]}:${BASH_REMATCH[6]}" +%s
}

# backup_key_age_line <key> <now-epoch>: "<UTC time>, <h>h <mm>m ago", or a
# statement that the key carries no time.
backup_key_age_line() {
  local taken age
  if ! taken="$(backup_key_epoch "$1")"; then
    printf 'unknown (the key carries no timestamp)'
    return 0
  fi
  age=$(( $2 - taken ))
  (( age < 0 )) && age=0
  printf '%s, %dh %02dm ago' "$(date -u -d "@${taken}" +%Y-%m-%dT%H:%M:%SZ)" $(( age / 3600 )) $(( age % 3600 / 60 ))
}
