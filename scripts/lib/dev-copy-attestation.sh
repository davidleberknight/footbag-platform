# shellcheck shell=bash
# dev-copy-attestation.sh -- the once-per-machine encrypted-disk attestation a
# developer gives before any copy of real data reaches their workstation.
#
# An invited developer may fetch a copy of the Legacy Archive, and later of the
# database, under one set of controls. One of them cannot be checked from a
# script: whether the disk the copy lands on is encrypted. So the developer
# attests to it, once per machine, by typing yes at a terminal, and the answer is
# recorded where every later fetch on that machine reads it. A fetch with no
# recorded attestation, and no terminal to take one on, is refused.
#
# Where it is recorded. ~/.config/footbag/dev-copy-attestation, mode 600 in a
# 700 directory. The path is fixed rather than taken from XDG_CONFIG_HOME or any
# other variable, so ambient state in a shell cannot point a fetch at a file
# somebody else wrote. The record names the machine it was given on (the
# machine id where the system has one, else the host name), so a home directory
# carried to another machine carries no attestation for that machine's disk.
#
# Never answered by a flag. A caller that accepts --yes for its own
# confirmation still cannot answer this one with it: the question is about a
# disk only the person at the keyboard can vouch for.
#
# Functions:
#   dev_copy_attestation_file       prints the record's path
#   dev_copy_attestation_present    true when this machine's attestation is recorded
#   dev_copy_attestation_require    true when recorded, or once recorded now from
#                                   a typed yes; otherwise says why and returns 1

_DEV_COPY_ATTESTATION_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# confirm_from_tty: the shared prompt, read from the terminal, refused without one.
# shellcheck source=host-env-remote.sh
source "${_DEV_COPY_ATTESTATION_LIB_DIR}/host-env-remote.sh"

dev_copy_attestation_file() {
  printf '%s\n' "${HOME}/.config/footbag/dev-copy-attestation"
}

# The machine the attestation is about. /etc/machine-id is fixed at install and
# survives a rename; a system without one is named by its host name.
_dev_copy_attestation_machine() {
  local id=""
  if [[ -r /etc/machine-id ]]; then
    id="$(tr -d '[:space:]' < /etc/machine-id)"
  fi
  if [[ -z "$id" ]]; then
    id="$(hostname)"
  fi
  printf '%s\n' "$id"
}

dev_copy_attestation_present() {
  local file machine
  file="$(dev_copy_attestation_file)"
  # A regular file this user owns. A link or another account's file is not a
  # statement this user made.
  [[ -f "$file" && ! -L "$file" && -O "$file" ]] || return 1
  machine="$(_dev_copy_attestation_machine)"
  grep -Fxq 'disk_encrypted=yes' "$file" || return 1
  grep -Fxq "machine=${machine}" "$file" || return 1
  return 0
}

# dev_copy_attestation_require <what-is-being-fetched>
dev_copy_attestation_require() {
  local what="$1" file dir
  file="$(dev_copy_attestation_file)"
  dir="${file%/*}"

  if dev_copy_attestation_present; then
    echo "==> Encrypted-disk attestation for this machine: recorded in ${file}" >&2
    return 0
  fi

  echo "" >&2
  echo "A copy of ${what} is about to land on this machine. It holds real" >&2
  echo "people's details, so it may only be kept on an encrypted disk (for" >&2
  echo "example LUKS, FileVault or BitLocker covering your home directory)." >&2
  echo "This is asked once per machine and recorded in ${file}." >&2
  # Answered at the terminal only, whatever the caller's own --yes says.
  if ! ASSUME_YES="no" confirm_from_tty "Is this machine's disk encrypted? Type yes or no: " "yes"; then
    echo "ERROR: no encrypted-disk attestation for this machine, so nothing" >&2
    echo "       is fetched. Run this again at a terminal on a machine whose" >&2
    echo "       disk is encrypted, and answer yes." >&2
    return 1
  fi

  mkdir -p -m 700 "$dir"
  chmod 700 "$dir"
  ( umask 077
    {
      printf 'disk_encrypted=yes\n'
      printf 'machine=%s\n' "$(_dev_copy_attestation_machine)"
      printf 'user=%s\n' "$(id -un)"
      printf 'recorded_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$file" )
  # Proved by reading it back, not by the write having returned.
  if ! dev_copy_attestation_present; then
    echo "ERROR: the attestation could not be recorded in ${file}." >&2
    return 1
  fi
  echo "==> Encrypted-disk attestation recorded in ${file}" >&2
  return 0
}
