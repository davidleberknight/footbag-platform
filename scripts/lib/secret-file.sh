#!/usr/bin/env bash
# shellcheck shell=bash
# secret-file.sh — destroying a file that held a credential.
#
# Several scripts need a file to exist for a moment: a probe credentials file to
# authenticate against before installing, a keys file handed in by an operator,
# a temp file being built beside the one it will replace. Each had its own
# spelling of the cleanup, and they had already diverged -- one shredded, one
# shredded with a fallback, and one simply unlinked, which leaves the secret
# readable on the device until the blocks are reused.
#
# `shred` is best effort and this file does not pretend otherwise: on a
# journalling or copy-on-write filesystem, or on flash with wear levelling, the
# old blocks may survive it. It is still strictly better than an unlink, and the
# fallback matters more than the guarantee -- a system without shred must still
# end up with the file gone rather than with the script dying under `set -e`
# holding a live credential on disk.
#
# Safe to call on a path that no longer exists, which is the normal case after a
# successful rename, so a cleanup trap does not have to know how far the run got.

# secret_file_destroy <path> [<path> ...]
secret_file_destroy() {
  local path
  for path in "$@"; do
    [[ -n "$path" && -e "$path" ]] || continue
    shred -u -- "$path" 2>/dev/null || rm -f -- "$path" 2>/dev/null || true
  done
  return 0
}

# The registry, and why a library function cannot just set its own trap.
#
# A function here that created a secret-bearing temp file used to clean it on a
# RETURN trap, which fires when the function returns and not when the operator
# interrupts it. Ctrl-C mid-write therefore left a live credential on disk, which
# the operator-script rule forbids: cleanup covers EXIT, INT and TERM.
#
# A function cannot install those itself without silently replacing whatever its
# caller had set, and the caller's trap is usually the one undoing the larger
# operation. So the split is: the function registers the path it created, and the
# caller sweeps the registry from the trap it already owns -- the same shape the
# remote halves use with their own temp arrays. Registered paths that the normal
# path has already destroyed cost nothing to sweep, because destroying a path
# that no longer exists is a no-op.
FOOTBAG_SECRET_FILES=()

# secret_file_register <path>
secret_file_register() {
  FOOTBAG_SECRET_FILES+=("$1")
  return 0
}

# secret_file_sweep -- destroy everything registered, then forget it.
#
# Settles on an explicit zero. Under `set -e` the exit status of an EXIT trap's
# last command replaces the script's own, so a sweep ending on a false test would
# report a successful run as a failure.
secret_file_sweep() {
  secret_file_destroy ${FOOTBAG_SECRET_FILES[@]+"${FOOTBAG_SECRET_FILES[@]}"}
  FOOTBAG_SECRET_FILES=()
  return 0
}
