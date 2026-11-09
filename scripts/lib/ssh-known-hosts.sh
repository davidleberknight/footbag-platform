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
# One connection precedes the pin by design, and none of this applies to it: a
# dev-and-tester's acceptance fetching their sealed onboarding from their own
# host account, before their machine holds any pin. It sends no secret and
# writes nothing, and the host key it meets is held to the pins inside the
# delivery once the delivery is proved issued in this project's AWS account,
# so a substituted host learns nothing and is refused before anything is
# written.
#
# The pinned file is built from the Lightsail API's host-key record, which
# reports what AWS captured when the instance was created. That is an
# out-of-band source: it is read over an authenticated AWS API call rather than
# learned from whoever answers the SSH port, which is what makes it evidence
# rather than an assumption.
#
# That call is also the host break-glass: it mints a root-capable certificate,
# and the production alarm fires on every one. So it is made only when the pin
# has to be rebuilt, never to check one. Beside the pin sits an instance record,
# one line per environment naming the instance, its ARN and when it was
# created, written when the keys were read. A pin is current when its lines
# name the address Terraform holds and the instance the record names is still
# the one Lightsail reports under that name: a rebuild or replacement gives a
# new ARN and creation time, and so new keys, and reads as stale. A host-key
# change with no instance change is not caught by the record; the next pinned
# connection still refuses it, as SSH always does.
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

# shellcheck source=host-access-mint.sh
source "$(dirname "${BASH_SOURCE[0]}")/host-access-mint.sh"

# known_hosts_record_path: the instance record beside whichever pin is in use.
known_hosts_record_path() {
  printf '%s.instances\n' "${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"
}

# known_hosts_record_line_valid <target> <line>
# True when <line> is one instance-record line for <target>: the tag, the
# instance name, a Lightsail ARN and a creation time, single-spaced, nothing
# else. A record that arrives from outside this machine (a sealed delivery) is
# held to this before it is written beside a pin.
known_hosts_record_line_valid() {
  local target="$1" line="$2"
  [[ "$line" =~ ^footbag-${target}\ footbag-${target}-[A-Za-z0-9-]+\ arn:aws:lightsail:[a-z0-9-]+:[0-9]{12}:Instance/[A-Za-z0-9-]+\ [0-9T:.+Z-]+$ ]]
}

# known_hosts_record_write <target> <line>
# Writes <line> as <target>'s entry in the instance record, keeping every other
# environment's entry, through a mode-600 temporary file renamed into place so
# a half-written record never exists. Returns 1 having said why on stderr.
known_hosts_record_write() {
  local target="$1" line="$2" record dir tmp
  record="$(known_hosts_record_path)"
  known_hosts_record_line_valid "$target" "$line" || {
    echo "ERROR: refusing to record '${line}': it is not an instance record for ${target}." >&2
    return 1
  }
  dir="$(dirname -- "$record")"
  [[ -d "$dir" ]] || mkdir -p -m 700 -- "$dir" || return 1
  tmp="$(umask 077 && mktemp "${dir}/.footbag_known_hosts_instances.XXXXXX")" || return 1
  if [[ -f "$record" ]]; then
    # grep exits 1 when every line was this environment's, which leaves nothing
    # to keep and is not an error.
    grep -v -- "^footbag-${target} " "$record" > "$tmp" || [[ $? == 1 ]] || { rm -f -- "$tmp"; return 1; }
  fi
  printf '%s\n' "$line" >> "$tmp"
  chmod 600 "$tmp" && mv -f -- "$tmp" "$record" || { rm -f -- "$tmp"; return 1; }
}

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

  # The pin file must be owned by the invoking user and not writable by anyone
  # else; a stat that fails is a refusal, not a skip.
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

# known_hosts_read_address <target>
# Sets KNOWN_HOSTS_PIN_IP and KNOWN_HOSTS_PIN_INSTANCE from Terraform, or
# returns 1 having said why on stderr.
known_hosts_read_address() {
  local target="$1"
  KNOWN_HOSTS_PIN_IP=""
  KNOWN_HOSTS_PIN_INSTANCE=""

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
  # The instance, from the same tree, because a restore renames it: keys read by
  # the original name after a restore are the stopped old host's.
  tf_instance_name "$target" || return 1
  KNOWN_HOSTS_PIN_INSTANCE="$TF_INSTANCE_NAME"
  return 0
}

# The directory holding a mint's response while it is read. Set while one
# exists, so a caller's interrupt cleanup can shred it through
# known_hosts_mint_cleanup.
KNOWN_HOSTS_MINT_DIR=""

# known_hosts_mint_cleanup
# Shreds the mint response, if one is on disk. Safe to call at any time and
# more than once; a caller registers it with its own cleanup so an interrupt
# during the mint leaves no private key behind.
known_hosts_mint_cleanup() {
  local dir="$KNOWN_HOSTS_MINT_DIR" rc=0
  [[ -n "$dir" && -d "$dir" ]] || return 0
  if [[ -e "${dir}/response.json" ]]; then
    shred -u -- "${dir}/response.json" || rc=$?
  fi
  rm -rf -- "$dir" || rc=$?
  KNOWN_HOSTS_MINT_DIR=""
  return "$rc"
}

# known_hosts_pin_lines <target> <aws-bin>
# Builds the pin lines for one environment's host from their authoritative
# sources: the address and the instance's name from Terraform, the keys from the
# authenticated Lightsail call, which mints. Sets KNOWN_HOSTS_PIN_IP,
# KNOWN_HOSTS_PIN_INSTANCE, KNOWN_HOSTS_PIN_LINES and KNOWN_HOSTS_PIN_COUNT, and
# returns 1 having said why on stderr. The response, which carries a private
# key, is shredded before this returns on every path; the caller registers
# known_hosts_mint_cleanup for an interrupt. Its one reader is
# install-known-hosts.sh, and only when the pin is not already current. The
# caller has sourced terraform-output.sh and runs from the repository root,
# which is where the Terraform directory is resolved from.
known_hosts_pin_lines() {
  local target="$1" aws_bin="$2" instance key_rows response
  KNOWN_HOSTS_PIN_LINES=""
  KNOWN_HOSTS_PIN_COUNT=0
  known_hosts_read_address "$target" || return 1
  instance="$KNOWN_HOSTS_PIN_INSTANCE"

  # ── The keys, from the authenticated API rather than from the SSH port ─────
  #
  # Algorithm and key together, one pair per line. Asking for the key alone
  # loses which algorithm it belongs to, and a line assembled with the wrong
  # algorithm is one ssh-keygen does not match and does not complain about.
  # The whole response lands in a private file, never on stdout: it holds the
  # minted private key. Only the public host keys are read out of it.
  if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required to read the host keys out of the Lightsail response." >&2
    return 1
  fi
  KNOWN_HOSTS_MINT_DIR="$(umask 077 && mktemp -d "${TMPDIR:-/tmp}/footbag-host-keys.XXXXXX")" || {
    KNOWN_HOSTS_MINT_DIR=""
    echo "ERROR: could not create a private directory for the Lightsail response." >&2
    return 1
  }
  response="${KNOWN_HOSTS_MINT_DIR}/response.json"
  if ! host_access_mint "$aws_bin" footbag-install-known-hosts "$instance" "$response" </dev/null; then
    known_hosts_mint_cleanup
    echo "ERROR: could not read host keys for ${instance} from Lightsail." >&2
    echo "       The pin is built from that API call and from nothing else, because" >&2
    echo "       a key learned from the SSH port is the assumption the pin replaces." >&2
    return 1
  fi
  if ! key_rows="$(jq -r '.accessDetails.hostKeys[]? | [.algorithm, .publicKey] | @tsv' "$response")"; then
    known_hosts_mint_cleanup
    echo "ERROR: the Lightsail response for ${instance} could not be read as JSON." >&2
    return 1
  fi
  known_hosts_mint_cleanup || {
    echo "ERROR: the Lightsail response for ${instance} could not be shredded; check ${TMPDIR:-/tmp} for footbag-host-keys.*." >&2
    return 1
  }
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

# known_hosts_pin_current <target> <aws-bin>
# Judges whether the pin is current for <target> without minting. Reads the
# address and the instance's name from Terraform and the instance's ARN and
# creation time from Lightsail's GetInstance, which returns no credential and
# fires no alarm. Current means all of:
#   - the instance record holds exactly one line for this environment, and it
#     names this instance with the ARN and creation time Lightsail reports now;
#   - the pin holds lines tagged for this environment, each naming the address
#     Terraform holds, and every key among them on both ports;
#   - no untagged line names that address, since nothing records which host
#     such a line was read from.
# Sets KNOWN_HOSTS_PIN_IP, KNOWN_HOSTS_PIN_INSTANCE, KNOWN_HOSTS_INSTANCE_RECORD
# (the line the record should hold, built from what was just read),
# KNOWN_HOSTS_PIN_LINES and KNOWN_HOSTS_PIN_COUNT (the tagged lines found), and
# KNOWN_HOSTS_STALE_REASON. Returns 0 current, 1 not current with the reason
# set, 2 when a source could not be read, having said why on stderr.
known_hosts_pin_current() {
  local target="$1" aws_bin="$2" pin record tag row arn created rec_lines
  local line host rest alg pub comment ip_plain ip_port
  KNOWN_HOSTS_INSTANCE_RECORD=""
  KNOWN_HOSTS_STALE_REASON=""
  KNOWN_HOSTS_PIN_LINES=""
  KNOWN_HOSTS_PIN_COUNT=0
  pin="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"
  record="$(known_hosts_record_path)"
  tag="footbag-${target}"

  known_hosts_read_address "$target" || return 2
  # stdout alone is the answer; the CLI's stderr (a library warning on a
  # successful call, or the error) is kept apart and reported only on failure.
  local errf get_rc=0
  errf="$(mktemp)" || { echo "ERROR: could not create a temporary file for the Lightsail read." >&2; return 2; }
  row="$("$aws_bin" lightsail get-instance --region us-east-1 \
      --instance-name "$KNOWN_HOSTS_PIN_INSTANCE" \
      --query 'instance.[arn,createdAt]' --output text 2>"$errf" </dev/null)" || get_rc=$?
  if (( get_rc != 0 )); then
    echo "ERROR: could not read ${KNOWN_HOSTS_PIN_INSTANCE} from Lightsail: $(cat -- "$errf")" >&2
    rm -f -- "$errf"
    return 2
  fi
  rm -f -- "$errf"
  IFS=$'\t' read -r arn created <<< "$row"
  KNOWN_HOSTS_INSTANCE_RECORD="${tag} ${KNOWN_HOSTS_PIN_INSTANCE} ${arn} ${created}"
  if ! known_hosts_record_line_valid "$target" "$KNOWN_HOSTS_INSTANCE_RECORD"; then
    echo "ERROR: Lightsail described ${KNOWN_HOSTS_PIN_INSTANCE} as '${row}', which is not an ARN and a creation time." >&2
    KNOWN_HOSTS_INSTANCE_RECORD=""
    return 2
  fi

  # ── The instance, against the record ───────────────────────────────────────
  if [[ ! -f "$pin" ]]; then
    KNOWN_HOSTS_STALE_REASON="there is no pin file at ${pin}"
    return 1
  fi
  # A pin every connection would refuse is not current, whatever its lines say:
  # judged by the same guard the connections use, so the two cannot disagree.
  local guard_err
  if ! guard_err="$(require_pinned_known_hosts 2>&1 >/dev/null)"; then
    guard_err="${guard_err%%$'\n'*}"
    KNOWN_HOSTS_STALE_REASON="every connection refuses the pin file: ${guard_err#ERROR: }"
    return 1
  fi
  if [[ ! -f "$record" ]]; then
    KNOWN_HOSTS_STALE_REASON="the pin has no instance record at ${record}, so it is not proven current"
    return 1
  fi
  # The record must not be rewritable by another account, for the reason the pin
  # must not: whoever can rewrite it can make a rebuilt host read as current.
  local mode owner
  mode="$(stat -c '%a' "$record" 2>/dev/null)" || mode=""
  owner="$(stat -c '%u' "$record" 2>/dev/null)" || owner=""
  if [[ "$mode" != "600" && "$mode" != "400" ]] || [[ "$owner" != "$(id -u)" ]]; then
    KNOWN_HOSTS_STALE_REASON="the instance record ${record} has mode '${mode}' and owner '${owner}', not 600 and yours, so it is not trusted"
    return 1
  fi
  rec_lines="$(grep -- "^${tag} " "$record")" || [[ $? == 1 ]] || {
    echo "ERROR: could not read the instance record ${record}." >&2
    return 2
  }
  if [[ -z "$rec_lines" ]]; then
    KNOWN_HOSTS_STALE_REASON="the instance record holds no line for ${tag}, so the pin is not proven current"
    return 1
  fi
  if [[ "$rec_lines" == *$'\n'* ]]; then
    KNOWN_HOSTS_STALE_REASON="the instance record holds more than one line for ${tag}"
    return 1
  fi
  if [[ "$rec_lines" != "$KNOWN_HOSTS_INSTANCE_RECORD" ]]; then
    KNOWN_HOSTS_STALE_REASON="the pin was taken from '${rec_lines#"${tag} "}', but Lightsail now reports '${KNOWN_HOSTS_INSTANCE_RECORD#"${tag} "}': the host was rebuilt or replaced"
    return 1
  fi

  # ── The pin's lines, against the address ───────────────────────────────────
  ip_plain="$KNOWN_HOSTS_PIN_IP"
  ip_port="[${KNOWN_HOSTS_PIN_IP}]:2222"
  local tagged=() keys=() k
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" && "$line" != \#* ]] || continue
    read -r host alg pub comment <<< "$line"
    if [[ "$comment" == "$tag" ]]; then
      if [[ "$host" != "$ip_plain" && "$host" != "$ip_port" ]]; then
        KNOWN_HOSTS_STALE_REASON="a line tagged ${tag} names ${host}, not ${ip_plain} where Terraform says the host is"
        return 1
      fi
      tagged+=("$line")
      keys+=("${alg} ${pub}")
    elif [[ ",${host}," == *",${ip_plain},"* || ",${host}," == *",${ip_port},"* ]]; then
      KNOWN_HOSTS_STALE_REASON="a line not tagged ${tag} pins ${host}, and nothing records which host it was read from"
      return 1
    fi
  done < "$pin"
  if (( ${#tagged[@]} == 0 )); then
    KNOWN_HOSTS_STALE_REASON="the pin holds no line tagged ${tag}"
    return 1
  fi
  for k in "${keys[@]}"; do
    rest="$(printf '%s\n' "${tagged[@]}")"
    if ! grep -qxF -- "${ip_plain} ${k} ${tag}" <<< "$rest" \
       || ! grep -qxF -- "${ip_port} ${k} ${tag}" <<< "$rest"; then
      KNOWN_HOSTS_STALE_REASON="the ${k%% *} key for ${ip_plain} is not pinned on both port 22 and port 2222"
      return 1
    fi
  done
  KNOWN_HOSTS_PIN_LINES="$(printf '%s\n' "${tagged[@]}")"
  KNOWN_HOSTS_PIN_COUNT="${#tagged[@]}"
  return 0
}

# known_hosts_pin_lines_from_pin <target>
# Sets KNOWN_HOSTS_PIN_LINES and KNOWN_HOSTS_PIN_COUNT to the pin's lines tagged
# for <target>, exactly as written, and returns 1 when there are fewer than two
# (one key on both ports). It proves nothing about currency: a caller that
# hands the lines on runs known_hosts_pin_current first.
known_hosts_pin_lines_from_pin() {
  local target="$1" pin line comment
  pin="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"
  KNOWN_HOSTS_PIN_LINES=""
  KNOWN_HOSTS_PIN_COUNT=0
  [[ -r "$pin" ]] || { echo "ERROR: no readable pin file at ${pin}." >&2; return 1; }
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" && "$line" != \#* ]] || continue
    read -r _ _ _ comment <<< "$line"
    [[ "$comment" == "footbag-${target}" ]] || continue
    KNOWN_HOSTS_PIN_LINES+="${line}"$'\n'
    KNOWN_HOSTS_PIN_COUNT=$(( KNOWN_HOSTS_PIN_COUNT + 1 ))
  done < "$pin"
  KNOWN_HOSTS_PIN_LINES="${KNOWN_HOSTS_PIN_LINES%$'\n'}"
  if (( KNOWN_HOSTS_PIN_COUNT < 2 )); then
    echo "ERROR: ${pin} holds ${KNOWN_HOSTS_PIN_COUNT} line(s) tagged footbag-${target}; one key on both ports is two." >&2
    return 1
  fi
  return 0
}
