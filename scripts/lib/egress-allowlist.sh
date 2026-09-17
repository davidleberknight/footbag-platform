# shellcheck shell=bash
#
# egress-allowlist.sh — can this workstation still reach the host's SSH port?
#
# WHY THIS EXISTS.
#
# Two operator scripts ask this question immediately before they hand off to a
# deploy, because SSH to a deployed host is restricted to the operator source
# ranges the firewall carries. A travelling workstation's address changes, and an
# address that rotated between the Terraform apply and the deploy strands the run
# part-way through its remote half, which is the worst possible moment to find
# out.
#
# Both asked it by grepping the local Terraform values file for the address as a
# literal /32 entry, and the two copies had drifted apart in opposite directions:
# one matched as a fixed string but carried on to the deploy when the address
# lookup itself failed, the other stopped on a failed lookup but matched as an
# unanchored regex, so 1.2.3.4 "passed" against an entry for 51.2.3.4/32 by
# substring alone. Each was a false positive on the one control that decides
# whether the deploy can connect at all.
#
# Underneath those two, three faults they shared:
#
#   - A values file says what was last declared, not what the firewall holds.
#     The two diverge for as long as an apply is pending, which is exactly the
#     window this check exists to cover.
#   - A literal match cannot see that an address falls INSIDE a configured range,
#     so an operator on a /22 was asked to attest by hand on every single run,
#     which is how a prompt stops being read.
#   - Neither could see a source-IP alias at all.
#
# WHAT IT REFUSES TO DO.
#
#   - Answer "covered" from anything other than live port state. Every failure to
#     read — no address, no alias, no answer from AWS, an answer it cannot parse —
#     is "unknown", which the caller turns into a question. Unknown is never fine.
#   - Count a source-IP alias as coverage. The alias admits browser SSH, which the
#     design keeps as a permanent operator path, and in both Terraform trees it
#     sits on port 22 while the deploy alias connects on 2222. Counting it would
#     replace one false positive with another. It is reported as context instead.
#   - Assume a port. Which port the deploy uses is a property of the operator's
#     own SSH configuration, so it comes from there; an alias that does not
#     resolve makes the answer unknown rather than 22.
#   - Ask. The two callers read their confirmations differently, one from stdin
#     and one from the terminal device, and a library that prompted would have to
#     pick one and be wrong in the other script.
#
# Results are set into variables rather than printed, for the reason
# terraform-output.sh gives at length: `value="$(f)"` runs f in a subshell, so
# everything f recorded about WHY it could not answer dies with that subshell.
# There is no printing form to reach for.
#
# Test seams (CI only; operators never set these): EGRESS_AWS_BIN replaces the
# aws CLI and EGRESS_CHECKIP_CMD replaces the address lookup. A run using either
# says so, because this check exists to be evidence and stubbed evidence is worth
# nothing.

# The last check's answer. EGRESS_VERDICT is one of:
#
#   covered    the address falls inside a range open on the port the deploy uses
#   uncovered  the port state was read and no range covers the address
#   unknown    something could not be read, so the question is open
#
# EGRESS_DETAIL is the human-readable body a caller prints, possibly several
# lines, already wrapped but not indented.
EGRESS_VERDICT="unknown"
EGRESS_ADDRESS=""
EGRESS_PORT=""
EGRESS_DETAIL=""

# egress_ip_to_int <dotted-quad>
# Prints the address as a 32-bit integer. Returns 1 on anything that is not one.
# Each octet is forced to base 10: an entry written 010.0.0.1 is octal to bash's
# arithmetic and would silently compare as a different address.
egress_ip_to_int() {
  local ip="$1" o
  [[ "$ip" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  local -a oct=("${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" "${BASH_REMATCH[4]}")
  for o in "${oct[@]}"; do
    (( 10#$o <= 255 )) || return 1
  done
  printf '%s' "$(( (10#${oct[0]} << 24) | (10#${oct[1]} << 16) | (10#${oct[2]} << 8) | 10#${oct[3]} ))"
}

# egress_cidr_contains <cidr> <address>
# True when the address falls inside the range. A bare address is treated as a
# /32, which is how a firewall entry without a prefix length behaves.
#
# Returns 2, not 1, on a range it cannot parse. A malformed entry means the
# question was not answered, and answering "no" would send the caller's operator
# to add an address that is very possibly already there; answering "yes" would be
# worse. The caller distinguishes the two.
egress_cidr_contains() {
  local cidr="$1" addr="$2" base bits base_int addr_int mask
  base="${cidr%%/*}"
  if [[ "$cidr" == */* ]]; then
    bits="${cidr#*/}"
  else
    bits=32
  fi
  [[ "$bits" =~ ^[0-9]{1,2}$ ]] || return 2
  (( bits <= 32 )) || return 2
  base_int="$(egress_ip_to_int "$base")" || return 2
  addr_int="$(egress_ip_to_int "$addr")" || return 2
  if (( bits == 0 )); then
    mask=0
  else
    mask=$(( (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF ))
  fi
  (( (base_int & mask) == (addr_int & mask) ))
}

# egress_ssh_port <alias>
# Prints the port the operator's own SSH configuration will use for the alias.
# Returns 1 when the alias is not configured on this workstation, which is the
# same condition require_ssh_alias reports: ssh answers a name it has no stanza
# for by echoing the name back as the hostname rather than by failing, so an
# unconfigured alias would otherwise yield ssh's built-in default of 22 and the
# check would go on to report confidently about a port nothing will use.
egress_ssh_port() {
  local alias="$1" cfg host port
  cfg="$(ssh -G "$alias" 2>/dev/null)" || return 1
  host="$(printf '%s\n' "$cfg" | awk '/^hostname /{print $2}' | tail -1)"
  [[ -n "$host" && "$host" != "$alias" ]] || return 1
  port="$(printf '%s\n' "$cfg" | awk '/^port /{print $2}' | tail -1)"
  [[ "$port" =~ ^[0-9]{1,5}$ ]] || return 1
  printf '%s' "$port"
}

# egress_allowlist_check <staging|production> <ssh-alias>
# Sets EGRESS_VERDICT, EGRESS_ADDRESS, EGRESS_PORT and EGRESS_DETAIL. Always
# returns 0: the verdict is the answer, and a caller that read it from an exit
# status would have to conflate "not covered" with "could not tell".
egress_allowlist_check() {
  local target="$1" alias="$2"
  local aws_bin="${EGRESS_AWS_BIN:-aws}"
  local checkip="${EGRESS_CHECKIP_CMD:-}"

  EGRESS_VERDICT="unknown"
  EGRESS_ADDRESS=""
  EGRESS_PORT=""
  EGRESS_DETAIL=""

  if [[ -n "${EGRESS_AWS_BIN:-}" || -n "$checkip" ]]; then
    echo "SYNTHETIC: the allowlist check is stubbed -- this run proves nothing about the firewall." >&2
  fi

  # ── The address ────────────────────────────────────────────────────────────
  #
  # A lookup that fails answers "unknown", never "fine". Carrying on here is the
  # defect this replaces: the address a run cannot resolve is precisely the one
  # the check exists to doubt, and the deploy then stranded part-way through its
  # remote half with nothing having asked.
  local addr=""
  if [[ -n "$checkip" ]]; then
    addr="$("$checkip" 2>/dev/null | tr -d '[:space:]')" || addr=""
  else
    addr="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]')" || addr=""
  fi
  if [[ -z "$addr" ]] || ! egress_ip_to_int "$addr" >/dev/null; then
    EGRESS_DETAIL="This workstation's egress address could not be resolved, so whether the
firewall admits it is unknown rather than fine."
    return 0
  fi
  EGRESS_ADDRESS="$addr"

  # ── The port the deploy will actually use ──────────────────────────────────
  local port=""
  port="$(egress_ssh_port "$alias")" || port=""
  if [[ -z "$port" ]]; then
    EGRESS_DETAIL="Egress address ${addr}, but the SSH alias '${alias}' is not configured on this
workstation, so which port the deploy would use is unknown and the firewall
cannot be read against it."
    return 0
  fi
  EGRESS_PORT="$port"

  # ── Live port state, from the instance rather than from a values file ──────
  local instance="footbag-${target}-web"
  local states="" aws_err="" errfile rc=0
  errfile="$(mktemp)" || {
    EGRESS_DETAIL="Egress address ${addr}, port ${port}, but a temp file for the AWS error could
not be created, so the firewall was not read."
    return 0
  }
  # RETURN rather than EXIT: every caller installs its own EXIT trap for cleanup
  # and a second one here would replace theirs. It clears itself as it fires, so
  # it cannot fire again on a path that has since freed the name.
  # shellcheck disable=SC2064
  trap "rm -f -- '${errfile}'; trap - RETURN" RETURN

  states="$("$aws_bin" lightsail get-instance-port-states \
    --region us-east-1 --instance-name "$instance" --output json 2>"$errfile")" || rc=$?
  if (( rc != 0 )) || [[ -z "$states" ]]; then
    aws_err="$(tr '\n' ' ' < "$errfile" | cut -c1-300)"
    EGRESS_DETAIL="Egress address ${addr}, port ${port}, but the firewall for ${instance} could not
be read, so whether it admits this address is unknown rather than fine.
AWS said: ${aws_err:-(nothing)}"
    return 0
  fi

  # Only the ranges that cover this port, and only the protocols an SSH
  # connection travels over. A rule on another port says nothing about this one,
  # and reading them together is how a check reports that 2222 is open because 22
  # is.
  local jq_select
  jq_select='.portStates[]? | select(((.protocol // "tcp") | ascii_downcase) as $pr
             | $pr == "tcp" or $pr == "all")
             | select(.fromPort <= $p and .toPort >= $p)'
  local matched=""
  matched="$(printf '%s' "$states" | jq -r --argjson p "$port" "[${jq_select}] | length" 2>/dev/null)" || matched=""
  if [[ ! "$matched" =~ ^[0-9]+$ ]]; then
    EGRESS_DETAIL="Egress address ${addr}, port ${port}, but the firewall for ${instance} came back
in a shape this check could not read, so it is unknown rather than fine."
    return 0
  fi
  if (( matched == 0 )); then
    EGRESS_VERDICT="uncovered"
    EGRESS_DETAIL="Egress address ${addr}. The firewall for ${instance} has no rule open on port
${port} at all, so nothing can reach it there, from this address or any other."
    return 0
  fi

  local cidrs="" aliases=""
  cidrs="$(printf '%s' "$states" | jq -r --argjson p "$port" "${jq_select} | (.cidrs // [])[]" 2>/dev/null)" || cidrs=""
  aliases="$(printf '%s' "$states" | jq -r --argjson p "$port" "${jq_select} | (.cidrListAliases // [])[]" 2>/dev/null)" || aliases=""

  local hit="" unreadable="" entry rcc
  while IFS= read -r entry; do
    [[ -n "$entry" ]] || continue
    rcc=0
    egress_cidr_contains "$entry" "$addr" || rcc=$?
    case "$rcc" in
      0) hit="$entry"; break ;;
      2) unreadable="${unreadable}${unreadable:+, }${entry}" ;;
    esac
  done <<< "$cidrs"

  # Reported, never counted. The alias admits Lightsail's browser SSH, which is a
  # permanent operator path rather than a fallback, but it is a separate path
  # from this one: it carries no key from this workstation and, where it sits on
  # a different port from the deploy alias, it says nothing whatever about
  # whether the deploy can connect.
  local alias_note=""
  if [[ -n "$aliases" ]]; then
    alias_note="Port ${port} also admits the source-IP alias(es): $(printf '%s' "$aliases" | tr '\n' ' ' | sed 's/ $//').
That is the browser-SSH path and a separate way onto the host; it does not
admit this deploy."
  fi

  local open_note
  open_note="Open on port ${port}: $(printf '%s' "$cidrs" | tr '\n' ' ' | sed 's/ $//')"
  [[ -n "$cidrs" ]] || open_note="Port ${port} carries no source ranges at all."

  if [[ -n "$hit" ]]; then
    EGRESS_VERDICT="covered"
    EGRESS_DETAIL="Egress address ${addr} is admitted on port ${port} by ${hit}, read from the live
firewall for ${instance}.${alias_note:+
${alias_note}}"
    return 0
  fi

  if [[ -n "$unreadable" ]]; then
    EGRESS_DETAIL="Egress address ${addr} is not admitted on port ${port} by any range this check
could read, and these entries could not be parsed at all: ${unreadable}.
${open_note}${alias_note:+
${alias_note}}"
    return 0
  fi

  EGRESS_VERDICT="uncovered"
  EGRESS_DETAIL="Egress address ${addr} falls inside no range open on port ${port} of ${instance}.
${open_note}${alias_note:+
${alias_note}}"
  return 0
}
