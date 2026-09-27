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
    echo "       Build it, once per instance:" >&2
    echo "         bash scripts/install-known-hosts.sh --target <staging|production>" >&2
    echo "       It reads the keys from the Lightsail API and the address from" >&2
    echo "       Terraform, writes both algorithms on both SSH ports, keeps any" >&2
    echo "       other environment's lines, and proves the result with ssh-keygen." >&2
    echo "" >&2
    echo "       Override the location with FOOTBAG_KNOWN_HOSTS." >&2
    return 1
  fi

  # A pin any other account can rewrite is not a pin: an attacker who can edit
  # it can install the key of the host they want the deploy to reach.
  #
  # Ownership is checked as well as mode, and a stat that fails is a refusal
  # rather than a skip. Mode alone was not enough: a pin owned by another local
  # account at 644 passed, while being writable by that account -- which is
  # exactly the substitution described above, just performed by its owner
  # instead of by the world.
  local mode owner
  mode="$(stat -c '%a' "$pin" 2>/dev/null || echo "")"
  owner="$(stat -c '%u' "$pin" 2>/dev/null || echo "")"
  if [[ -z "$mode" || -z "$owner" ]]; then
    echo "ERROR: could not stat the pinned host-key file $pin, so its permissions" >&2
    echo "       cannot be checked. Refusing rather than trusting it unverified." >&2
    return 1
  fi
  if [[ "$mode" != "600" && "$mode" != "644" && "$mode" != "400" && "$mode" != "444" ]]; then
    echo "ERROR: pinned host-key file $pin has mode $mode; expected it to be non-writable by others." >&2
    echo "       Fix with: chmod 600 $pin" >&2
    return 1
  fi
  if [[ "$owner" != "$(id -u)" && "$owner" != "0" ]]; then
    echo "ERROR: pinned host-key file $pin is owned by uid $owner, not by you or root." >&2
    echo "       Its owner can rewrite it, which would redirect the deploy to a host" >&2
    echo "       of their choosing. Take ownership before relying on it." >&2
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

# known_hosts_pin_lines <target> <aws-bin>
# Builds the pin lines for one environment's host from their authoritative
# sources: the address from Terraform, the keys from the authenticated Lightsail
# call. Sets KNOWN_HOSTS_PIN_IP, KNOWN_HOSTS_PIN_LINES and
# KNOWN_HOSTS_PIN_COUNT, and returns 1 having said why on stderr. Two readers:
# install-known-hosts.sh writes them into the operator's own pin, and
# hire-dev-tester.sh seals them to a newcomer, whose job role is denied the
# Lightsail call. The caller has sourced terraform-output.sh and runs from the
# repository root, which is where the Terraform directory is resolved from.
known_hosts_pin_lines() {
  local target="$1" aws_bin="$2" instance="footbag-${1}-web" key_rows
  KNOWN_HOSTS_PIN_IP=""
  KNOWN_HOSTS_PIN_LINES=""
  KNOWN_HOSTS_PIN_COUNT=0

  # ── The address, from Terraform rather than from anything written down ─────
  #
  # An address in a document goes stale the moment an instance is replaced, and
  # nothing announces it: the pin still parses, the connection is simply
  # refused. Called directly, never through a command substitution, so
  # TF_OUTPUT_ERROR survives to be reported.
  if ! tf_output_read "terraform/${target}" lightsail_static_ip; then
    echo "ERROR: could not read the ${target} host address from Terraform." >&2
    echo "       ${TF_OUTPUT_ERROR}" >&2
    echo "       The address is deliberately written down nowhere else, so there is" >&2
    echo "       nothing to fall back to. Initialise the tree and re-run:" >&2
    echo "         terraform -chdir=terraform/${target} init" >&2
    return 1
  fi
  KNOWN_HOSTS_PIN_IP="$TF_OUTPUT_VALUE"
  if [[ -z "$KNOWN_HOSTS_PIN_IP" || "$KNOWN_HOSTS_PIN_IP" != *.*.*.* ]]; then
    echo "ERROR: the ${target} host address read back as '${KNOWN_HOSTS_PIN_IP}', which is not an address." >&2
    return 1
  fi

  # ── The keys, from the authenticated API rather than from the SSH port ─────
  #
  # Algorithm and key together, one pair per line. Asking for the key alone
  # loses which algorithm it belongs to, and a line assembled with the wrong
  # algorithm is one ssh-keygen does not match and does not complain about.
  if ! key_rows="$("$aws_bin" lightsail get-instance-access-details \
      --region us-east-1 --instance-name "$instance" \
      --query 'accessDetails.hostKeys[].{alg:algorithm,pub:publicKey}' \
      --output text 2>/dev/null)"; then
    echo "ERROR: could not read host keys for ${instance} from Lightsail." >&2
    echo "       The pin is built from that API call and from nothing else, because" >&2
    echo "       a key learned from the SSH port is the assumption the pin replaces." >&2
    return 1
  fi
  if [[ -z "$key_rows" ]]; then
    echo "ERROR: Lightsail returned no host keys for ${instance}." >&2
    return 1
  fi

  # ── Both ports ─────────────────────────────────────────────────────────────
  #
  # sshd listens on 22 and 2222 and OpenSSH matches a non-default port only in
  # the bracketed form. A pin written for one port verifies nothing on the
  # other, and the deploy alias uses the higher one.
  KNOWN_HOSTS_PIN_LINES="$(
    printf '%s\n' "$key_rows" | while IFS=$'\t' read -r alg pub; do
      [[ -n "$alg" && -n "$pub" ]] || continue
      printf '%s %s %s\n' "$KNOWN_HOSTS_PIN_IP" "$alg" "$pub"
      printf '[%s]:2222 %s %s\n' "$KNOWN_HOSTS_PIN_IP" "$alg" "$pub"
    done
  )"
  KNOWN_HOSTS_PIN_COUNT="$(printf '%s\n' "$KNOWN_HOSTS_PIN_LINES" | grep -c . || true)"
  if (( KNOWN_HOSTS_PIN_COUNT < 2 )); then
    echo "ERROR: built only ${KNOWN_HOSTS_PIN_COUNT} pin lines, which is fewer than one" >&2
    echo "       algorithm across two ports. Refusing to install a partial pin." >&2
    return 1
  fi
  return 0
}
