# shellcheck shell=bash
#
# The pinned host-key file every operator script verifies a deployed host
# against, and the SSH options that make that verification fail closed.
#
# Trust-on-first-connect is not usable for these scripts. Each one puts the
# operator's sudo password on line one of the SSH stream, so a first connection
# to a substituted host would hand over that credential before anything about
# the host had been checked. Accepting a key on first contact protects only the
# connections after the one that matters.
#
# The pinned file is built from the Lightsail API's host-key record, which
# reports what AWS captured when the instance was created. That is an
# out-of-band source: it is read over an authenticated AWS API call rather than
# learned from whoever answers the SSH port, which is what makes it evidence
# rather than an assumption.
#
# The file is operator-local and never committed. It names the hosts' addresses,
# and the production origin address is deliberately not public: the host's web
# port is scoped to the CloudFront origin ranges rather than open, so publishing
# the address in the repository would give away what that scoping withholds.
#
# An instance rebuild regenerates host keys, so a pin outlives its host. When
# that happens the deploy fails closed with SSH's host-key warning; the fix is
# to re-read the keys from the API and rewrite the pin, never to delete the
# offending line and reconnect on trust.

FOOTBAG_KNOWN_HOSTS_DEFAULT="${HOME}/AWS/footbag_known_hosts"

# Set by require_pinned_known_hosts, read by every caller that opens a
# connection. Empty until that function has run and succeeded, so a script that
# forgets the call gets an SSH invocation with no host verification options
# rather than a silently permissive one.
FOOTBAG_SSH_PIN_OPTS=()

# require_pinned_known_hosts
# Resolves the pinned file, refuses to continue without it, and populates
# FOOTBAG_SSH_PIN_OPTS. A missing pin is a stop: falling back to accepting
# whatever answers would restore exactly the exposure the pin exists to close.
require_pinned_known_hosts() {
  local pin="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"

  if [[ ! -r "$pin" ]]; then
    echo "ERROR: pinned host-key file not found or unreadable: $pin" >&2
    echo "       Deploys refuse to run without it; they will not accept a host key on trust." >&2
    echo "" >&2
    echo "       Rebuild it from the authoritative source, once per instance:" >&2
    echo "         aws lightsail get-instance-access-details --region us-east-1 \\" >&2
    echo "           --instance-name <instance> --query 'accessDetails.hostKeys[].publicKey' \\" >&2
    echo "           --output text" >&2
    echo "       Write one line per key as: [<static ip>]:<port> <algorithm> <public key>" >&2
    echo "       covering both SSH ports the hosts listen on." >&2
    echo "" >&2
    echo "       Override the location with FOOTBAG_KNOWN_HOSTS." >&2
    return 1
  fi

  # A pin any other account can rewrite is not a pin: an attacker who can edit
  # it can install the key of the host they want the deploy to reach.
  local mode
  mode="$(stat -c '%a' "$pin" 2>/dev/null || echo "")"
  if [[ -n "$mode" && "$mode" != "600" && "$mode" != "644" && "$mode" != "400" && "$mode" != "444" ]]; then
    echo "ERROR: pinned host-key file $pin has mode $mode; expected it to be non-writable by others." >&2
    echo "       Fix with: chmod 600 $pin" >&2
    return 1
  fi

  # StrictHostKeyChecking=yes refuses an unknown host outright instead of
  # learning it. UserKnownHostsFile points at the pin alone, so the operator's
  # personal known_hosts, which is populated by ordinary trust-on-first-use,
  # cannot vouch for a host the pin does not carry.
  FOOTBAG_SSH_PIN_OPTS=(
    -o "StrictHostKeyChecking=yes"
    -o "UserKnownHostsFile=${pin}"
  )
  return 0
}
