#!/usr/bin/env bash
# scripts/lib/staging-deployed-from.sh -- which commit staging is running.
#
# Sourced, never run. Every deploy writes /srv/footbag/deployed-from on the host,
# one line of the form `commit=<sha> dirty=<n> paths=<...>`, and two readers need
# the same answer from it: the production release gate, which ships only what
# staging already runs, and ./run_all_tests.sh --staging, whose pass receipt is
# keyed to that commit so the gate can tell which deploy the staging checks
# proved. One reader, so the two cannot come to disagree about the format.
#
# The file is readable without root, so no password is involved. The connection
# goes through the staging alias with the pinned host keys only; without the pin
# nothing is read. A read that cannot be completed leaves both values empty,
# which every caller treats as "unknown", never as agreement.

_sdf_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/ssh-known-hosts.sh
source "${_sdf_lib_dir}/ssh-known-hosts.sh"

STAGING_DEPLOYED_FROM_ALIAS="footbag-staging"

# staging_deployed_from_read <ssh-binary> [timeout-seconds]
# Sets STAGING_DEPLOYED_COMMIT and STAGING_DEPLOYED_DIRTY from the host's record,
# or leaves both empty when it cannot be read or does not parse. The count is
# read from its own field, so a path in the record that happens to mention
# "dirty=0" cannot make a dirty deploy read as clean.
staging_deployed_from_read() {
  local ssh_bin="${1:-ssh}" limit="${2:-60}" record=""
  STAGING_DEPLOYED_COMMIT=""
  STAGING_DEPLOYED_DIRTY=""
  if require_pinned_known_hosts >/dev/null 2>&1; then
    record="$(timeout "$limit" "$ssh_bin" "${FOOTBAG_SSH_PIN_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=10 \
      "$STAGING_DEPLOYED_FROM_ALIAS" 'cat /srv/footbag/deployed-from' </dev/null 2>/dev/null || true)"
  fi
  STAGING_DEPLOYED_COMMIT="$(printf '%s\n' "$record" | sed -n 's/^commit=\([0-9a-f]\{7,40\}\) dirty=\([0-9][0-9]*\)\( .*\)\{0,1\}$/\1/p' | head -n 1)"
  STAGING_DEPLOYED_DIRTY="$(printf '%s\n' "$record" | sed -n 's/^commit=\([0-9a-f]\{7,40\}\) dirty=\([0-9][0-9]*\)\( .*\)\{0,1\}$/\2/p' | head -n 1)"
  return 0
}
