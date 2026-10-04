#!/usr/bin/env bash
# authorize-operator-address.sh
#
# Puts an operator's address on the SSH allow-list for one environment, or takes
# it off, and proves against the live firewall that it worked.
#
# WHY THIS EXISTS.
#
# An address reaches a host only when two things agree: the values file that
# Terraform builds the firewall from, and the firewall itself. An edit without
# an apply changes nothing, and a change made in the console without an edit is
# undone by the next apply, run by anybody for any reason. So this owns both
# halves: it brings the file to the intended state, applies, and then reads the
# firewall back, because an apply exiting zero says Terraform was satisfied
# with its plan, which is a different claim from the address now reaching, or no
# longer reaching, the host.
#
# WHAT IT PROVES.
#
# Both SSH ports take the one list, 22 and 2222, and the deploy connects on
# 2222, so both are read. An add is done when the file carries the entry and
# every one of those ports admits the whole address. A removal is done when the
# file no longer carries it and neither port carries it. A read that fails,
# answers nothing, cannot be parsed, or finds no rule for a port is unknown,
# and unknown is never reported as done in either direction.
#
# WHO RUNS IT.
#
# The `footbag-operator` IAM user, on both environments. A FootbagDevTester
# session is refused: the values file holds the administrators' entries, and
# the job role is denied writing the dev-and-tester parameters.
#
# TWO KINDS OF ENTRY.
#
# The administrators' addresses live in the values file and are edited here as
# described above. Each dev-and-tester's staging address lives in a parameter of
# its own, /footbag-ops/staging/dev-testers/<account>, which the staging
# Terraform joins to the administrators' list. --dev-tester writes or deletes
# that one parameter, applies staging's firewall alone (terraform-apply.sh
# --firewall-only), and proves the result; it never opens the values file, so
# nothing a dev-and-tester's onboarding or offboarding does can touch an
# administrator's entry. A failed apply puts the parameter back as it was. A
# removal whose address is still admitted by another holder says which, and is
# not a failure: that person's own entry is gone. Onboarding and offboarding are
# the only callers.
#
# WHAT IT REFUSES TO DO.
#
#   - Replace the list. It edits exactly the one entry and leaves every other
#     line of the list and of the file as it was, because a rewrite that drops
#     somebody else's address locks out an operator who had nothing to do with
#     this run and reports success while doing it.
#   - Add an entry nobody can attribute. Every address in that file names whose
#     it is, and the file's own policy is that an unattributable entry is
#     removed rather than kept, so `--for` is required on an add.
#   - Edit a list it cannot read with certainty: a `//` or `/*` comment, list
#     syntax inside a comment, a carriage return, an escape, or a layout other
#     than one entry per line or the whole list on the assignment line. Each is
#     refused with the reason, and the file is left for a person to tidy.
#   - Take one entry off a line whose trailing comment names more than one
#     entry, which would leave that comment attributing an address that is no
#     longer there, or re-attach it to a neighbour.
#   - Accept an address that is not a canonical IPv4 range, or 0.0.0.0/0,
#     which opens SSH to the internet.
#   - Remove the last address. An allow-list emptied of everybody admits nobody,
#     and the way back in is then the Lightsail access path rather than this.
#   - Accept --yes on production. The apply asks at the terminal there anyway,
#     so a run with no terminal would write the file and then stop, leaving an
#     unconfirmed change in the production values file for the next apply.
#
# Usage:
#   bash scripts/authorize-operator-address.sh --target staging \
#     --address 203.0.113.7/32 --for '<account>; <where>'
#   bash scripts/authorize-operator-address.sh --target staging \
#     --address 203.0.113.7/32 --remove
#   bash scripts/authorize-operator-address.sh --target staging \
#     --list-for <account>
#   bash scripts/authorize-operator-address.sh --target staging \
#     --dev-tester <account> --address 203.0.113.7/32 [--for '<account>; <where>']
#   bash scripts/authorize-operator-address.sh --target staging \
#     --dev-tester <account> --remove
#
# Flags:
#   --target <staging|production>  deployed environment; no default
#   --address <cidr>               the address, with or without a /32
#   --for <who>                    whose address it is; required to add one
#   --remove                       take it off instead of putting it on
#   --list-for <account>           print, one per line, each address whose
#                                  attribution names that account first, as an
#                                  add writes it ('<account>; <where>'). Reads
#                                  the values file only and changes nothing; it
#                                  is how an administrator's entries are found
#   --dev-tester <account>         act on that dev-and-tester's own address
#                                  parameter instead of the values file
#                                  (staging only; --for, when given, becomes the
#                                  parameter's description)
#   --yes                          accept the typed confirmation in advance
#                                  (staging only)
#   -h, --help                     this text
#
# Exit: 0 applied and proven, or already true on both sides; 1 refused or
# unproven; 2 usage error.
#
# Test seams (CI only; operators never set these):
#   AUTHORIZE_ADDRESS_AWS_BIN        replaces the aws CLI used for the live read
#   AUTHORIZE_ADDRESS_APPLY_CMD      replaces the apply this hands off to
#   AUTHORIZE_ADDRESS_TERRAFORM_BIN  replaces the terraform used to syntax-check
#                                    the rewritten file
#   TFVARS_OVERRIDE                  the values file to read and write
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# The containment test, from the library that already owns it: an address is
# covered by a range rather than equal to a string.
# shellcheck source=lib/egress-allowlist.sh
source "${REPO_ROOT}/scripts/lib/egress-allowlist.sh"

AWS_BIN="${AUTHORIZE_ADDRESS_AWS_BIN:-aws}"
AWS_IDENTITY_BIN="$AWS_BIN"
APPLY_CMD="${AUTHORIZE_ADDRESS_APPLY_CMD:-${SCRIPT_DIR}/terraform-apply.sh}"
TERRAFORM_BIN="${AUTHORIZE_ADDRESS_TERRAFORM_BIN:-terraform}"

# Named as literals rather than read from the profile the shared library owns:
# a check taking the name from the same place the credential came from is not a
# check.
FOOTBAG_OPERATOR_USER="footbag-operator"
TFVAR_NAME="operator_cidrs"
# The ports whose rule takes the operator list. A test holds this to the
# Terraform, so a port added there without being added here fails the build.
SSH_PORTS=(22 2222)

TARGET=""
ADDRESS_RAW=""
ATTRIBUTION=""
REMOVE=0
LIST_FOR=""
# Set by --dev-tester: the account whose own address parameter this run writes
# or deletes, instead of editing the values file.
DEV_TESTER=""
# Where each dev-and-tester's staging address lives, one parameter per person.
# The staging Terraform reads this path and joins what it finds to the
# administrators' list; nothing else writes it.
DEV_TESTER_PATH="/footbag-ops/staging/dev-testers"

# A flag's value never starts with a double dash. Taking one as the value
# swallows the next flag: `--for --yes` would attribute an address to "--yes"
# and silently drop the confirmation the operator meant to give.
flag_value() {
  if [[ -z "${2:-}" || "${2:-}" == --* ]]; then
    echo "ERROR: $1 needs a value." >&2
    exit 2
  fi
}

while (( $# )); do
  case "$1" in
    --target) flag_value "$1" "${2:-}"; TARGET="$2"; shift 2 ;;
    --address) flag_value "$1" "${2:-}"; ADDRESS_RAW="$2"; shift 2 ;;
    --for) flag_value "$1" "${2:-}"; ATTRIBUTION="$2"; shift 2 ;;
    --remove) REMOVE=1; shift ;;
    --list-for) flag_value "$1" "${2:-}"; LIST_FOR="$2"; shift 2 ;;
    --dev-tester) flag_value "$1" "${2:-}"; DEV_TESTER="$2"; shift 2 ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

if [[ -n "$LIST_FOR" ]]; then
  if [[ -n "$ADDRESS_RAW" || -n "$ATTRIBUTION" ]] || (( REMOVE )); then
    echo "ERROR: --list-for only reads, and takes no --address, --for or --remove." >&2
    exit 2
  fi
  if [[ ! "$LIST_FOR" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ ]]; then
    echo "ERROR: '${LIST_FOR}' is not an account name (firstname_lastname)." >&2
    exit 2
  fi
fi

if [[ -n "$DEV_TESTER" ]]; then
  if [[ "$TARGET" != "staging" ]]; then
    echo "ERROR: --dev-tester is staging only. A dev-and-tester has no production access." >&2
    exit 2
  fi
  if [[ -n "$LIST_FOR" ]]; then
    echo "ERROR: --dev-tester and --list-for do not combine." >&2
    exit 2
  fi
  if [[ ! "$DEV_TESTER" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ ]]; then
    echo "ERROR: '${DEV_TESTER}' is not an account name (firstname_lastname)." >&2
    exit 2
  fi
  if (( REMOVE )) && [[ -n "$ADDRESS_RAW" ]]; then
    echo "ERROR: --dev-tester --remove takes no --address: it removes whatever that" >&2
    echo "       account's own parameter holds, so nothing has to be remembered." >&2
    exit 2
  fi
fi

if [[ "$TARGET" == "production" && "$ASSUME_YES" == "yes" ]]; then
  echo "ERROR: --yes does not carry a production change. The apply asks at the" >&2
  echo "       terminal on production whatever this is told, so a run with no" >&2
  echo "       terminal would write the values file and then stop, leaving an" >&2
  echo "       unconfirmed change there for the next apply to pick up." >&2
  exit 2
fi

# ── The address ──────────────────────────────────────────────────────────────

# canonical_cidr <text>
# Sets CANON to the range in its one written form, or prints why not and
# returns 1. Octets 0-255 with no leading zeros, a prefix 1-32, and no bits set
# beyond the prefix: 203.0.113.7/24 names a host inside a range rather than the
# range, and the firewall stores the range, so the file and the firewall would
# disagree about the same entry. A bare address is that one host.
canonical_cidr() {
  local text="$1" addr bits octet
  CANON=""
  [[ "$text" == */* ]] || text="${text}/32"
  addr="${text%%/*}"
  bits="${text#*/}"
  if [[ ! "$addr" =~ ^(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$ ]]; then
    echo "'${text}' is not an IPv4 address: four numbers 0-255, no leading zeros."
    return 1
  fi
  for octet in "${BASH_REMATCH[@]:1:4}"; do
    if (( octet > 255 )); then
      echo "'${text}' has an octet above 255."
      return 1
    fi
  done
  if [[ ! "$bits" =~ ^(0|[1-9][0-9]?)$ ]] || (( bits > 32 )); then
    echo "'${text}' has a prefix length that is not 0-32."
    return 1
  fi
  if (( bits == 0 )); then
    echo "'${text}' is every address there is. SSH is never open to the world."
    return 1
  fi
  local ip_int mask
  ip_int="$(egress_ip_to_int "$addr")" || { echo "'${text}' could not be read."; return 1; }
  mask=$(( (0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF ))
  if (( (ip_int & mask) != ip_int )); then
    local net=$(( ip_int & mask ))
    echo "'${text}' has bits set past its /${bits} prefix. The range is" \
      "$(( (net >> 24) & 255 )).$(( (net >> 16) & 255 )).$(( (net >> 8) & 255 )).$(( net & 255 ))/${bits}."
    return 1
  fi
  CANON="${addr}/${bits}"
  return 0
}

ADDRESS=""
if [[ -z "$LIST_FOR" ]] && ! { [[ -n "$DEV_TESTER" ]] && (( REMOVE )); }; then
  if [[ -z "$ADDRESS_RAW" ]]; then
    echo "ERROR: --address names the address to authorize or remove." >&2
    exit 2
  fi
  if ! WHY="$(canonical_cidr "$ADDRESS_RAW")"; then
    echo "ERROR: ${WHY}" >&2
    echo "       A range that is wider than you meant admits more than you meant." >&2
    exit 2
  fi
  canonical_cidr "$ADDRESS_RAW" >/dev/null
  ADDRESS="$CANON"
  # A dev-and-tester's entry is one host. The staging Terraform admits nothing
  # wider from a parameter, so a range written here would be silently dropped.
  if [[ -n "$DEV_TESTER" && "$ADDRESS" != */32 ]]; then
    echo "ERROR: a dev-and-tester's address is a single host (a.b.c.d/32), not ${ADDRESS}." >&2
    exit 2
  fi
fi

if [[ -z "$LIST_FOR" && -z "$DEV_TESTER" ]] && (( ! REMOVE )); then
  ATTRIBUTION="${ATTRIBUTION#\#}"
  ATTRIBUTION="${ATTRIBUTION#"${ATTRIBUTION%%[![:space:]]*}"}"
  if [[ -z "$ATTRIBUTION" ]]; then
    echo "ERROR: --for names whose address this is, and is required to add one." >&2
    echo "       The values file's policy is that every entry says whose it is," >&2
    echo "       and that an entry nobody can attribute is removed rather than" >&2
    echo "       kept because it is already there." >&2
    echo "       For example: --for '<account>; home'" >&2
    exit 2
  fi
  # The attribution becomes a comment inside the list. A line break would put
  # the rest of it on a line of its own, where it could read as an entry, and
  # list syntax inside a comment is what a list parser mistakes for the list.
  if [[ "$ATTRIBUTION" =~ [[:cntrl:]] || "$ATTRIBUTION" == *[\[\]\"]* ]]; then
    echo "ERROR: --for may not carry a line break, a control character, a bracket" >&2
    echo "       or a double quote. It becomes a comment inside the list." >&2
    exit 2
  fi
fi

# ── Seams, said out loud ─────────────────────────────────────────────────────

[[ "$AWS_BIN" != "aws" ]] && \
  echo "==> NOTE: the AWS binary is stubbed for this run; it proves nothing about the firewall." >&2
[[ -n "${AUTHORIZE_ADDRESS_APPLY_CMD:-}" ]] && \
  echo "==> NOTE: the apply is replaced for this run (${APPLY_CMD})." >&2
[[ -n "${AUTHORIZE_ADDRESS_TERRAFORM_BIN:-}" ]] && \
  echo "==> NOTE: the terraform syntax check is replaced for this run (${TERRAFORM_BIN})." >&2
[[ -n "${TFVARS_OVERRIDE:-}" ]] && \
  echo "==> NOTE: the values file is replaced for this run (${TFVARS_OVERRIDE})." >&2

# ── The live firewall ────────────────────────────────────────────────────────
#
# Defined here, ahead of both paths that use them: the dev-and-tester path below
# never opens the values file, so these cannot sit after it.

# live_read
# Reads the instance's port states into LIVE_<port>, one range per line, for
# every SSH port. Returns 1 with LIVE_WHY set when anything cannot be read:
# the call failing, an empty or unparseable answer, or a port with no rule at
# all. Run in this shell, never in a pipeline or a substitution, so what it
# learned and why it failed both survive.
live_read() {
  local states port ranges
  # Read from stdout alone, so a warning the CLI prints on stderr beside a
  # successful answer is never handed to jq; the error text is fetched by
  # reading again only when the read failed.
  local -a call=(lightsail get-instance-port-states
    --region us-east-1 --instance-name "$INSTANCE" --output json)
  LIVE_WHY=""
  if ! states="$("$AWS_BIN" "${call[@]}" 2>/dev/null)"; then
    states="$("$AWS_BIN" "${call[@]}" 2>&1 >/dev/null)" || true
    LIVE_WHY="the port-state read failed: ${states}"
    return 1
  fi
  if [[ -z "$states" ]] || ! jq -e '.portStates | type == "array"' >/dev/null 2>&1 <<<"$states"; then
    LIVE_WHY="the port-state read returned nothing that could be parsed"
    return 1
  fi
  for port in "${SSH_PORTS[@]}"; do
    if ! ranges="$(jq -r --argjson p "$port" '
        [ .portStates[]
          | select(((.protocol // "tcp") | ascii_downcase) as $pr | $pr == "tcp" or $pr == "all")
          | select(.fromPort <= $p and .toPort >= $p) ]
        | if length == 0 then "NORULE" else (map(.cidrs // []) | add | .[]) end
      ' <<<"$states" 2>/dev/null)"; then
      LIVE_WHY="the rule for port ${port} could not be parsed"
      return 1
    fi
    if [[ "$ranges" == "NORULE" ]]; then
      LIVE_WHY="no rule on port ${port} at all"
      return 1
    fi
    printf -v "LIVE_${port}" '%s' "$ranges"
  done
  return 0
}

# covering <ranges> -- prints the first range at least as wide as the address
# that contains it, or nothing. Returns 2 when a range cannot be read.
covering() {
  local ranges="$1" want_bits="${ADDRESS#*/}" base="${ADDRESS%%/*}" cidr bits rc
  while IFS= read -r cidr; do
    [[ -z "$cidr" ]] && continue
    bits="${cidr#*/}"; [[ "$cidr" == */* ]] || bits=32
    [[ "$bits" =~ ^[0-9]+$ ]] || return 2
    (( bits <= want_bits )) || continue
    rc=0; egress_cidr_contains "$cidr" "$base" || rc=$?
    (( rc == 2 )) && return 2
    if (( rc == 0 )); then printf '%s' "$cidr"; return 0; fi
  done <<<"$ranges"
  return 0
}

# exact <ranges> -- true when the address itself is one of the ranges.
exact() {
  local cidr
  while IFS= read -r cidr; do
    [[ -z "$cidr" ]] && continue
    [[ "$cidr" == */* ]] || cidr="${cidr}/32"
    [[ "$cidr" == "$ADDRESS" ]] && return 0
  done <<<"$1"
  return 1
}

live_or_die() {
  if ! live_read; then
    echo "ERROR: the live firewall on ${INSTANCE} could not be read: ${LIVE_WHY}." >&2
    echo "       Unknown is not the same as absent or admitted, so nothing is" >&2
    echo "       reported as done. ${1}" >&2
    exit 1
  fi
}

# admitted_everywhere / present_anywhere, over every SSH port.
admitted_everywhere() {
  local port var cover
  for port in "${SSH_PORTS[@]}"; do
    var="LIVE_${port}"
    cover="$(covering "${!var}")" || { echo "ERROR: a live range on port ${port} cannot be read." >&2; exit 1; }
    [[ -n "$cover" ]] || return 1
  done
  return 0
}
present_anywhere() {
  local port var
  for port in "${SSH_PORTS[@]}"; do
    var="LIVE_${port}"
    exact "${!var}" && return 0
  done
  return 1
}
# still_covered prints a live range, other than the address itself, that still
# admits it on some port.
still_covered() {
  local port var cover others bare
  # The address as the firewall may also write it, with no prefix length.
  bare="${ADDRESS%/32}"
  for port in "${SSH_PORTS[@]}"; do
    var="LIVE_${port}"
    others="$(grep -vxF -e "$ADDRESS" -e "$bare" <<<"${!var}" || true)"
    cover="$(covering "$others")" || { echo "ERROR: a live range on port ${port} cannot be read." >&2; exit 1; }
    if [[ -n "$cover" ]]; then printf '%s on port %s' "$cover" "$port"; return 0; fi
  done
  return 1
}
# whose <cidr> -- who holds a range: the comment the values file carries for it,
# and any dev-and-tester whose own parameter holds it, since the staging
# firewall admits both and a removal report that named only the first would
# leave the second looking like nobody's.
whose() {
  local i note="not declared in the values file" owners
  for i in "${!E_CANON[@]}"; do
    [[ "${E_CANON[$i]}" == "$1" ]] && { note="${E_NOTE[$i]:-(no attribution)}"; break; }
  done
  owners=""
  [[ "$TARGET" == "staging" ]] && owners="$(dev_tester_owners "$1")"
  if [[ -n "$owners" ]]; then
    printf '%s; and the dev-and-tester address of %s' "$note" "$owners"
  else
    printf '%s' "$note"
  fi
}

# ── Dev-and-tester addresses ─────────────────────────────────────────────────

# dev_tester_owners <cidr> -- prints, comma-separated, every dev-and-tester whose
# own parameter holds exactly that address. Empty when none does or the path
# cannot be read; a report built on this says which.
dev_tester_owners() {
  local listing
  listing="$("$AWS_BIN" ssm get-parameters-by-path --region us-east-1 \
    --path "$DEV_TESTER_PATH" --output json 2>/dev/null)" || return 0
  jq -r --arg a "$1" --arg p "${DEV_TESTER_PATH}/" '
      [ .Parameters[]? | select(.Value == $a or .Value + "/32" == $a)
        | .Name | ltrimstr($p) ] | join(", ")
    ' <<<"$listing" 2>/dev/null || true
}

if [[ -n "$DEV_TESTER" ]]; then
  if [[ "$ATTRIBUTION" =~ [[:cntrl:]] ]]; then
    echo "ERROR: --for may not carry a line break or a control character." >&2
    exit 2
  fi
  # Written by onboarding and offboarding, which are the directly authenticated
  # identity's work. The job role is denied writing these parameters, so a run
  # under it is refused here rather than by AWS halfway through.
  aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
    "A dev-and-tester's address is written by onboarding and offboarding, as the directly authenticated identity." \
    || exit 1
  aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

  INSTANCE="footbag-${TARGET}-web"
  PARAM="${DEV_TESTER_PATH}/${DEV_TESTER}"

  # What the parameter holds now. Absent is a fact; a read that fails for any
  # other reason is unknown, and unknown is never treated as absent.
  CURRENT=""
  READ_ERR=""
  if ! CURRENT="$("$AWS_BIN" ssm get-parameter --region us-east-1 --name "$PARAM" \
        --query Parameter.Value --output text 2>/dev/null)"; then
    READ_ERR="$("$AWS_BIN" ssm get-parameter --region us-east-1 --name "$PARAM" \
        --query Parameter.Value --output text 2>&1 >/dev/null || true)"
    if [[ "$READ_ERR" == *ParameterNotFound* ]]; then
      CURRENT=""
    else
      echo "ERROR: could not read ${PARAM}: ${READ_ERR}" >&2
      echo "       Nothing has been changed." >&2
      exit 1
    fi
  fi

  # Its description too, so a restore after a failed apply puts back the
  # attribution as well as the address. A description that cannot be read is
  # only a missing note, never a reason to stop.
  CURRENT_DESC=""
  if [[ -n "$CURRENT" ]]; then
    CURRENT_DESC="$("$AWS_BIN" ssm describe-parameters --region us-east-1 \
      --parameter-filters "Key=Name,Values=${PARAM}" \
      --query 'Parameters[0].Description' --output text 2>/dev/null || true)"
    [[ "$CURRENT_DESC" == "None" ]] && CURRENT_DESC=""
  fi

  if (( REMOVE )); then
    if [[ -z "$CURRENT" ]]; then
      echo "Already absent: ${DEV_TESTER} has no staging address parameter. Nothing to do."
      exit 0
    fi
    ADDRESS="$CURRENT"
    [[ "$ADDRESS" == */* ]] || ADDRESS="${ADDRESS}/32"
  fi

  echo "-- ${DEV_TESTER}'s staging SSH address --"
  echo "    parameter: ${PARAM}"
  echo "    now:       ${CURRENT:-(none)}"
  if (( REMOVE )); then
    echo "    after:     (none)"
  else
    echo "    after:     ${ADDRESS}"
  fi
  echo "    ports:     ${SSH_PORTS[*]}"

  live_or_die "Nothing has been changed."

  if (( ! REMOVE )) && [[ "$CURRENT" == "$ADDRESS" ]] && admitted_everywhere; then
    echo ""
    echo "Already authorized: ${PARAM} holds ${ADDRESS} and the firewall admits it"
    echo "on every SSH port. Nothing to do."
    exit 0
  fi

  echo ""
  if (( REMOVE )); then
    echo "This deletes ${PARAM}, applies staging's firewall alone, and then reads it"
  else
    echo "This writes ${ADDRESS} to ${PARAM}, applies staging's firewall alone, and"
    echo "then reads it"
  fi
  echo "back. The values file and every administrator's entry are not touched. The"
  echo "apply replaces staging's firewall rule set, so every staging port closes for"
  echo "a few seconds and reopens."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to change ${DEV_TESTER}'s staging address: " "APPLY"; then
    echo "Not confirmed; nothing was changed." >&2
    exit 1
  fi

  # From the write until the apply has succeeded, a failure puts the parameter
  # back as it was. The parameter is this run's own change and nothing outside
  # has recorded it yet, so undoing it is safe, and it leaves no half-made change
  # pending for whoever applies staging next.
  RESTORE_PENDING=0
  restore_parameter() {
    (( RESTORE_PENDING )) || return 0
    RESTORE_PENDING=0
    if [[ -n "$CURRENT" ]]; then
      local -a restore_desc=()
      [[ -n "$CURRENT_DESC" ]] && restore_desc=(--description "$CURRENT_DESC")
      "$AWS_BIN" ssm put-parameter --region us-east-1 --name "$PARAM" --type String \
        --value "$CURRENT" --overwrite ${restore_desc[@]+"${restore_desc[@]}"} >/dev/null 2>&1 \
        && echo "==> ${PARAM} restored to ${CURRENT}." >&2 \
        || echo "ERROR: could not restore ${PARAM} to ${CURRENT}; set it back before the next staging apply." >&2
    else
      "$AWS_BIN" ssm delete-parameter --region us-east-1 --name "$PARAM" >/dev/null 2>&1 \
        && echo "==> ${PARAM} removed again." >&2 \
        || echo "ERROR: could not remove ${PARAM}; delete it before the next staging apply." >&2
    fi
    return 0
  }
  trap restore_parameter EXIT INT TERM

  RESTORE_PENDING=1
  if (( REMOVE )); then
    if ! "$AWS_BIN" ssm delete-parameter --region us-east-1 --name "$PARAM" >/dev/null; then
      RESTORE_PENDING=0
      echo "ERROR: could not delete ${PARAM}. Nothing was applied." >&2
      exit 1
    fi
  else
    declare -a DESC=()
    [[ -n "$ATTRIBUTION" ]] && DESC=(--description "$ATTRIBUTION")
    if ! "$AWS_BIN" ssm put-parameter --region us-east-1 --name "$PARAM" --type String \
          --value "$ADDRESS" --overwrite ${DESC[@]+"${DESC[@]}"} >/dev/null; then
      RESTORE_PENDING=0
      echo "ERROR: could not write ${PARAM}. Nothing was applied." >&2
      exit 1
    fi
  fi

  # The apply is held to exactly this one address: the old one out and the new
  # one in, so a values file on this machine that disagrees with the live
  # firewall cannot drop an administrator's address on the way through.
  declare -a FIREWALL_NAMES=()
  if (( REMOVE )); then
    FIREWALL_NAMES=(--firewall-remove "$ADDRESS")
  else
    FIREWALL_NAMES=(--firewall-add "$ADDRESS")
    if [[ -n "$CURRENT" ]]; then
      PREVIOUS="$CURRENT"
      [[ "$PREVIOUS" == */* ]] || PREVIOUS="${PREVIOUS}/32"
      [[ "$PREVIOUS" != "$ADDRESS" ]] && FIREWALL_NAMES+=(--firewall-remove "$PREVIOUS")
    fi
  fi
  echo "==> Applying staging's firewall"
  if ! bash "$APPLY_CMD" --target "$TARGET" --firewall-only "${FIREWALL_NAMES[@]}"; then
    echo "ERROR: the firewall apply did not complete; ${PARAM} is being put back." >&2
    exit 1
  fi
  RESTORE_PENDING=0

  echo "==> Reading the firewall back"
  live_or_die "The apply ran, so the firewall may or may not carry the change."
  if (( REMOVE )); then
    if present_anywhere || COVER="$(still_covered)"; then
      # The person's own entry is gone; whether the address still reaches the
      # host is decided by whoever else holds it. Named, so it is never mistaken
      # for this account still having access of its own.
      OTHERS="$(dev_tester_owners "$ADDRESS")"
      echo "    ${PARAM} is gone. ${ADDRESS} is still admitted, because another entry"
      if [[ -n "$OTHERS" ]]; then
        echo "    holds it: the dev-and-tester address of ${OTHERS}."
      else
        echo "    holds it: the administrators' list in the values file, which this run"
        echo "    does not change."
      fi
    else
      echo "    ${ADDRESS} is no longer admitted on ports ${SSH_PORTS[*]}"
    fi
  else
    if ! admitted_everywhere; then
      echo "ERROR: ${INSTANCE} does not admit ${ADDRESS} on every SSH port." >&2
      echo "       The parameter holds it and the apply reported success, so the" >&2
      echo "       staging Terraform did not carry it. Check the plan's warnings." >&2
      exit 1
    fi
    echo "    ${ADDRESS} is admitted on ports ${SSH_PORTS[*]}"
  fi
  echo ""
  echo "Done, and proved against the firewall rather than the parameter."
  exit 0
fi

# ── The identity ─────────────────────────────────────────────────────────────

# A listing reads the values file and nothing else, so it asks no identity.
if [[ -n "$LIST_FOR" ]]; then
  :
elif [[ "$TARGET" == "production" ]]; then
  aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
    "The job role is denied production's firewall, so only the directly authenticated identity can change it." \
    || exit 1
  aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1
else
  aws_profile_ensure || exit 1
  [[ -n "${AWS_IDENTITY_ARN:-}" ]] || aws_identity_resolve "${AWS_PROFILE:-}" || exit 1
  case "$AWS_IDENTITY_ARN" in
    *":user/${FOOTBAG_OPERATOR_USER}") ;;
    *":assumed-role/${FOOTBAG_DEV_TESTER_ROLE}/"?*)
      # The values file holds the administrators' entries. A dev-and-tester's
      # own address is a parameter that onboarding writes, so a session of the
      # job role has no business in this file and is refused before it is read.
      echo "ERROR: this run is a ${FOOTBAG_DEV_TESTER_ROLE} session (${AWS_IDENTITY_ARN##*/})." >&2
      echo "       The values file holds the administrators' entries and is changed only" >&2
      echo "       by the ${FOOTBAG_OPERATOR_USER} IAM user. A dev-and-tester's address is" >&2
      echo "       set by onboarding; a footbag-operator holder re-runs it for a new one." >&2
      exit 1
      ;;
    *)
      echo "ERROR: this run is acting as ${AWS_IDENTITY_ARN}." >&2
      echo "       Staging's allow-list is changed by the ${FOOTBAG_OPERATOR_USER} IAM user," >&2
      echo "       and this is not it." >&2
      exit 1
      ;;
  esac
fi

INSTANCE="footbag-${TARGET}-web"

# ── The values file ──────────────────────────────────────────────────────────

TFVARS_LINK="${TFVARS_OVERRIDE:-${REPO_ROOT}/terraform/${TARGET}/terraform.tfvars}"
if [[ ! -e "$TFVARS_LINK" ]]; then
  echo "ERROR: ${TFVARS_LINK} does not exist." >&2
  echo "       Each environment's values file is a symlink into the private" >&2
  echo "       operations checkout, which is a prerequisite for operations work." >&2
  exit 1
fi
TFVARS_PATH="$(readlink -f "$TFVARS_LINK")"
if [[ -z "$TFVARS_PATH" || ! -f "$TFVARS_PATH" ]]; then
  echo "ERROR: ${TFVARS_LINK} does not resolve to a file (dangling symlink)." >&2
  exit 1
fi
case "$TFVARS_PATH" in
  "$REPO_ROOT"/*)
    if ! git -C "$REPO_ROOT" check-ignore -q "$TFVARS_PATH" 2>/dev/null; then
      echo "ERROR: ${TFVARS_PATH} is inside this repository and git does not ignore it." >&2
      echo "       This file carries operator addresses; writing it where git can" >&2
      echo "       pick it up is how those get committed." >&2
      exit 1
    fi
    ;;
esac

# parse_list <file>
# Reads the list and prints what it holds, one record per line, tab-separated:
#   META <first line> <last line>
#   ENTRY <line> <value> <entries on that line> <trailing comment>
# or a single ERROR record naming why it could not be read with certainty.
# Quote-aware, so a comment character inside an entry is not a comment, and a
# bracket inside a comment is refused rather than taken for the end of the list.
parse_list() {
  VAR_NAME="$TFVAR_NAME" awk '
    function fail(msg) { print "ERROR\t" msg; err = 1; exit }
    function scan(s, ln,    i, n, c, inq, val, note, here, j, rest) {
      n = length(s); inq = 0; val = ""; note = ""; here = 0
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (inq) {
          if (c == "\"") { inq = 0; E++; ev[E] = val; el[E] = ln; here++; val = "" }
          else if (c == "\\") fail("an escape inside an entry on line " ln)
          else val = val c
          continue
        }
        if (c == "\"") { inq = 1; continue }
        if (c == "#") { note = substr(s, i); break }
        if (c == "/" && (substr(s, i + 1, 1) == "/" || substr(s, i + 1, 1) == "*"))
          fail("a // or /* comment on line " ln ", which this does not read")
        if (c == "]") {
          state = "done"
          rest = substr(s, i + 1)
          if (rest !~ /^[ \t]*(#.*)?$/) fail("text after the closing bracket on line " ln)
          if (rest ~ /#/) note = substr(rest, index(rest, "#"))
          break
        }
        if (c == "[") fail("a nested list on line " ln)
        if (c == "," || c == " " || c == "\t") continue
        fail("text in the list that is not an entry, on line " ln)
      }
      if (inq) fail("an entry that does not close on line " ln)
      sub(/[ \t]+$/, "", note)
      if (note ~ /[\[\]"]/) fail("list syntax inside the comment on line " ln)
      if (here > 0) for (j = E - here + 1; j <= E; j++) { ec[j] = here; en[j] = note }
    }
    BEGIN { state = "seek"; E = 0 }
    {
      line = $0
      if (state == "seek") {
        if (line ~ ("^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*=")) {
          if (found) fail("more than one " ENVIRON["VAR_NAME"] " assignment")
          found = 1; start = NR
          if (index(line, "\r")) fail("a carriage return on line " NR)
          rest = substr(line, index(line, "=") + 1)
          if (rest !~ /^[ \t]*\[/) fail("the assignment does not open a list on line " NR)
          state = "list"
          scan(substr(rest, index(rest, "[") + 1), NR)
          if (state == "done") end = NR
        }
        next
      }
      if (state == "list") {
        if (index(line, "\r")) fail("a carriage return on line " NR)
        scan(line, NR)
        if (state == "done") end = NR
      }
    }
    END {
      if (err) exit 1
      if (!found) { print "ERROR\tno " ENVIRON["VAR_NAME"] " assignment"; exit 1 }
      if (state != "done") { print "ERROR\tthe list is never closed"; exit 1 }
      print "META\t" start "\t" end
      for (j = 1; j <= E; j++) print "ENTRY\t" el[j] "\t" ev[j] "\t" ec[j] "\t" en[j]
    }
  ' "$1"
}

if ! grep -qE "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$TFVARS_PATH"; then
  echo "ERROR: no ${TFVAR_NAME} assignment in ${TFVARS_LINK}." >&2
  echo "       Add one rather than letting this script invent it: a firewall" >&2
  echo "       rule written into a file whose shape was guessed is a rule" >&2
  echo "       nobody declared. Nothing done." >&2
  exit 1
fi

PARSED="$(parse_list "$TFVARS_PATH" || true)"
if [[ "$PARSED" == ERROR* || -z "$PARSED" ]]; then
  echo "ERROR: the ${TFVAR_NAME} list in ${TFVARS_LINK} cannot be read with certainty:" >&2
  echo "       ${PARSED#ERROR$'\t'}" >&2
  echo "       Nothing done. Tidy that by hand, then re-run." >&2
  exit 1
fi

LIST_START="$(awk -F'\t' '$1=="META"{print $2}' <<<"$PARSED")"
LIST_END="$(awk -F'\t' '$1=="META"{print $3}' <<<"$PARSED")"

# Every entry, in canonical form, with its line and the comment it carries.
declare -a E_LINE=() E_CANON=() E_COUNT=() E_NOTE=()
while IFS=$'\t' read -r kind line value count note; do
  [[ "$kind" == "ENTRY" ]] || continue
  if ! WHY="$(canonical_cidr "$value")"; then
    echo "ERROR: the values file carries an entry this cannot read: ${WHY}" >&2
    echo "       Nothing done. Correct it by hand, then re-run." >&2
    exit 1
  fi
  canonical_cidr "$value" >/dev/null
  E_LINE+=("$line"); E_CANON+=("$CANON"); E_COUNT+=("$count"); E_NOTE+=("$note")
done <<<"$PARSED"

# Entries nobody can attribute are reported, never removed by this: whose they
# are is a question for a person, and a removal on a guess can lock somebody out.
for i in "${!E_CANON[@]}"; do
  if [[ -z "${E_NOTE[$i]}" ]]; then
    echo "==> NOTE: ${E_CANON[$i]} on line ${E_LINE[$i]} names nobody. The file's policy" >&2
    echo "    is that every entry says whose it is; attribute or remove it by hand." >&2
  fi
done

# The listing: every entry whose attribution names the account first, exactly
# as an add writes it. Matched on the account name followed by the separator,
# so jane_doe does not match jane_doe_smith, and a first name alone ("Jane;")
# matches nobody's account.
if [[ -n "$LIST_FOR" ]]; then
  for i in "${!E_CANON[@]}"; do
    [[ "${E_NOTE[$i]}" =~ ^#[[:space:]]*"${LIST_FOR}"[[:space:]]*\; ]] && printf '%s\n' "${E_CANON[$i]}"
  done
  exit 0
fi

FILE_MATCHES=()
for i in "${!E_CANON[@]}"; do
  [[ "${E_CANON[$i]}" == "$ADDRESS" ]] && FILE_MATCHES+=("$i")
done
if (( ${#FILE_MATCHES[@]} > 1 )); then
  echo "ERROR: ${ADDRESS} appears ${#FILE_MATCHES[@]} times in ${TFVARS_LINK}." >&2
  echo "       Which of them is meant is not something to guess. Nothing done." >&2
  exit 1
fi

echo "-- the SSH allow-list for ${TARGET} --"
echo "    instance:  ${INSTANCE}"
echo "    address:   ${ADDRESS}"
echo "    ports:     ${SSH_PORTS[*]}"

live_or_die "Nothing has been changed."

# ── What has to happen ───────────────────────────────────────────────────────
#
# The file and the firewall are asked separately, because they disagree in
# exactly the cases that matter. EDIT says the file must change; APPLY says the
# firewall must be brought to the file.

EDIT=0
APPLY=0
FILE_HAS=0; (( ${#FILE_MATCHES[@]} )) && FILE_HAS=1

if (( ! REMOVE )); then
  if (( FILE_HAS )) && admitted_everywhere; then
    echo ""
    echo "Already authorized: the values file carries ${ADDRESS} and the firewall"
    echo "admits it on every SSH port. Nothing to do."
    exit 0
  fi
  # Added whenever the file does not carry it, including when the firewall
  # already admits it: a console change or somebody else's wider range is
  # not a declared entry of this person's, and the next apply undoes the first
  # while the second ends when its owner leaves.
  (( FILE_HAS )) || EDIT=1
  APPLY=1
else
  if (( ! FILE_HAS )) && ! present_anywhere; then
    if COVER="$(still_covered)"; then
      echo "ERROR: ${ADDRESS} is not an entry of its own, but the firewall still" >&2
      echo "       admits it through ${COVER}, whose entry reads: $(whose "${COVER%% on port*}")." >&2
      echo "       Removing an entry cannot end that. Their access has NOT ended." >&2
      exit 1
    fi
    echo ""
    echo "Already absent: neither the values file nor the firewall carries ${ADDRESS}"
    echo "on any SSH port. Nothing to do."
    exit 0
  fi
  (( FILE_HAS )) && EDIT=1
  APPLY=1
fi

# ── The edit ─────────────────────────────────────────────────────────────────

TFVARS_TMP=""
cleanup() { [[ -n "$TFVARS_TMP" && -e "$TFVARS_TMP" ]] && rm -f -- "$TFVARS_TMP"; return 0; }
trap cleanup EXIT INT TERM

if (( EDIT )); then
  # A literal /tmp rather than TMPDIR, so a caller cannot redirect the staging
  # copy of a values file into a checkout.
  TFVARS_TMP="$(mktemp /tmp/footbag-operator-cidrs.XXXXXX)"
  chmod 600 "$TFVARS_TMP"

  START_HAS_ENTRIES=0; END_HAS_ENTRIES=0
  for i in "${!E_LINE[@]}"; do
    [[ "${E_LINE[$i]}" == "$LIST_START" ]] && START_HAS_ENTRIES=1
    [[ "${E_LINE[$i]}" == "$LIST_END" ]] && END_HAS_ENTRIES=1
  done
  SINGLE_LINE=0; (( LIST_START == LIST_END )) && SINGLE_LINE=1
  if (( ! SINGLE_LINE )) && (( START_HAS_ENTRIES || END_HAS_ENTRIES )); then
    echo "ERROR: the ${TFVAR_NAME} list puts entries on its opening or closing line and" >&2
    echo "       across other lines too. This edits one entry per line, or the whole" >&2
    echo "       list on the assignment line, and nothing in between. Nothing done." >&2
    exit 1
  fi

  if (( REMOVE )); then
    k="${FILE_MATCHES[0]}"
    if (( ${#E_CANON[@]} <= 1 )); then
      echo "ERROR: removing ${ADDRESS} would empty ${TFVAR_NAME}, leaving a firewall" >&2
      echo "       that admits nobody on the SSH ports. Add another operator's address" >&2
      echo "       first, or accept that the Lightsail access path is the only way in" >&2
      echo "       and do it deliberately rather than as a side effect of a departure." >&2
      exit 1
    fi
    if (( E_COUNT[k] > 1 )) && [[ -n "${E_NOTE[$k]}" ]]; then
      echo "ERROR: ${ADDRESS} shares line ${E_LINE[$k]} with another entry, under one" >&2
      echo "       comment: ${E_NOTE[$k]}" >&2
      echo "       Taking it off would leave that comment attributing an address that is" >&2
      echo "       gone, or move it onto the entry beside it. Put each entry on a line of" >&2
      echo "       its own with its own comment, then re-run. Nothing done." >&2
      exit 1
    fi
    # The lines rebuilt: the one entry's line, and nothing else.
    TARGET_LINE="${E_LINE[$k]}"
    KEEP_ON_LINE=()
    for i in "${!E_LINE[@]}"; do
      [[ "${E_LINE[$i]}" == "$TARGET_LINE" && "$i" != "$k" ]] && KEEP_ON_LINE+=("\"${E_CANON[$i]}\"")
    done
    JOINED=""
    for v in ${KEEP_ON_LINE[@]+"${KEEP_ON_LINE[@]}"}; do JOINED+="${JOINED:+, }${v}"; done
    TARGET_LINE="$TARGET_LINE" SINGLE="$SINGLE_LINE" JOINED="$JOINED" VAR_NAME="$TFVAR_NAME" \
    NOTE="${E_NOTE[$k]}" awk '
      NR == ENVIRON["TARGET_LINE"] + 0 {
        if (ENVIRON["SINGLE"] == "1") {
          printf "%s = [%s]%s\n", ENVIRON["VAR_NAME"], ENVIRON["JOINED"], (ENVIRON["NOTE"] == "" ? "" : " " ENVIRON["NOTE"])
          next
        }
        if (ENVIRON["JOINED"] == "") next
        indent = $0; sub(/[^ \t].*$/, "", indent)
        printf "%s%s,\n", indent, ENVIRON["JOINED"]
        next
      }
      { print }
    ' "$TFVARS_PATH" > "$TFVARS_TMP"
  else
    NEW_LINE_TEXT="\"${ADDRESS}\", # ${ATTRIBUTION}"
    if (( SINGLE_LINE )); then
      # The whole list on the assignment line is opened out, one entry per
      # line, which is the only shape a second attributed entry fits. An
      # existing entry keeps its comment only where it is the line's sole
      # entry; a comment shared by several could belong to any of them.
      SINGLE_NOTE=""
      for i in "${!E_LINE[@]}"; do SINGLE_NOTE="${E_NOTE[$i]}"; done
      if (( ${#E_CANON[@]} > 1 )) && [[ -n "$SINGLE_NOTE" ]]; then
        echo "ERROR: the ${TFVAR_NAME} list is on one line under one comment for several" >&2
        echo "       entries: ${SINGLE_NOTE}" >&2
        echo "       Opening it out would have to guess which entry the comment belongs" >&2
        echo "       to. Put each entry on a line of its own first. Nothing done." >&2
        exit 1
      fi
      BODY=""
      for i in "${!E_CANON[@]}"; do
        BODY+="  \"${E_CANON[$i]}\","
        [[ -n "${E_NOTE[$i]}" ]] && BODY+=" ${E_NOTE[$i]}"
        BODY+=$'\n'
      done
      BODY+="  ${NEW_LINE_TEXT}"$'\n'
      TARGET_LINE="$LIST_START" BODY="$BODY" VAR_NAME="$TFVAR_NAME" awk '
        NR == ENVIRON["TARGET_LINE"] + 0 { printf "%s = [\n%s]\n", ENVIRON["VAR_NAME"], ENVIRON["BODY"]; next }
        { print }
      ' "$TFVARS_PATH" > "$TFVARS_TMP"
    else
      INDENT="  "
      if (( ${#E_LINE[@]} )); then
        INDENT="$(sed -n "${E_LINE[-1]}p" "$TFVARS_PATH" | sed 's/[^ \t].*$//')"
      fi
      TARGET_LINE="$LIST_END" ADD="${INDENT}${NEW_LINE_TEXT}" awk '
        NR == ENVIRON["TARGET_LINE"] + 0 { print ENVIRON["ADD"] }
        { print }
      ' "$TFVARS_PATH" > "$TFVARS_TMP"
    fi
  fi

  # Proved before it is shown, rather than trusted: the rewritten list is read
  # back with the same parser and must hold exactly the old entries plus or
  # minus this one, every line outside the list must be byte for byte what it
  # was, and the whole file must still be valid HCL.
  NEW_PARSED="$(parse_list "$TFVARS_TMP" || true)"
  if [[ "$NEW_PARSED" == ERROR* || -z "$NEW_PARSED" ]]; then
    echo "ERROR: the rewritten list could not be read back (${NEW_PARSED#ERROR$'\t'}). Nothing done." >&2
    exit 1
  fi
  EXPECTED="$(printf '%s\n' "${E_CANON[@]}" | { if (( REMOVE )); then grep -vxF "$ADDRESS"; else cat; printf '%s\n' "$ADDRESS"; fi; } | sort)"
  GOT=""
  while IFS=$'\t' read -r kind _ value _ _; do
    [[ "$kind" == "ENTRY" ]] || continue
    canonical_cidr "$value" >/dev/null || { echo "ERROR: the rewrite produced an unreadable entry. Nothing done." >&2; exit 1; }
    GOT+="${CANON}"$'\n'
  done <<<"$NEW_PARSED"
  GOT="$(printf '%s' "$GOT" | sort)"
  if [[ "$GOT" != "$EXPECTED" ]]; then
    echo "ERROR: the rewritten list does not hold exactly the old entries with" >&2
    echo "       ${ADDRESS} $( (( REMOVE )) && echo removed || echo added ). Nothing done." >&2
    exit 1
  fi
  NEW_START="$(awk -F'\t' '$1=="META"{print $2}' <<<"$NEW_PARSED")"
  NEW_END="$(awk -F'\t' '$1=="META"{print $3}' <<<"$NEW_PARSED")"
  if [[ "$(head -n $(( LIST_START - 1 )) "$TFVARS_PATH")" != "$(head -n $(( NEW_START - 1 )) "$TFVARS_TMP")" ]] \
     || [[ "$(tail -n +$(( LIST_END + 1 )) "$TFVARS_PATH")" != "$(tail -n +$(( NEW_END + 1 )) "$TFVARS_TMP")" ]]; then
    echo "ERROR: the rewrite changed a line outside the ${TFVAR_NAME} list. Nothing done." >&2
    exit 1
  fi
  if ! "$TERRAFORM_BIN" fmt - <"$TFVARS_TMP" >/dev/null 2>&1; then
    echo "ERROR: the rewritten values file is not valid HCL. Nothing done." >&2
    exit 1
  fi

  echo ""
  echo "The change to ${TFVARS_LINK}:"
  echo ""
  diff -u "$TFVARS_PATH" "$TFVARS_TMP" || true
  echo ""
fi

if (( REMOVE )); then
  echo "This takes ${ADDRESS} off ${TARGET}'s SSH allow-list, applies, and then reads"
else
  echo "This puts ${ADDRESS} on ${TARGET}'s SSH allow-list, applies, and then reads"
fi
echo "the live firewall back and refuses to report success unless it agrees."
(( EDIT )) || echo "The values file already says so; the firewall is what is behind it."
echo ""

# Production's apply asks at the terminal, so a production run with no terminal
# is refused before the file is written rather than after.
if [[ "$TARGET" == "production" ]] && ! { true >/dev/tty; } 2>/dev/null; then
  echo "ERROR: no terminal, and production's apply asks at one. Nothing written." >&2
  exit 1
fi
if ! confirm_from_tty "Type 'APPLY' to change ${TARGET}'s allow-list: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  exit 1
fi

if (( EDIT )); then
  cat "$TFVARS_TMP" > "$TFVARS_PATH"
  if ! cmp -s "$TFVARS_TMP" "$TFVARS_PATH"; then
    trap - EXIT INT TERM
    echo "ERROR: ${TFVARS_PATH} does not hold what was written. The intended content" >&2
    echo "       is kept at ${TFVARS_TMP} so nothing is lost; compare the two." >&2
    exit 1
  fi
  echo "==> ${TFVAR_NAME} written"
fi

echo "==> Applying the ${TARGET} tree"
if ! bash "$APPLY_CMD" --target "$TARGET"; then
  echo "ERROR: the apply did not complete, so the firewall is whatever it left." >&2
  echo "       The values file carries the intended state: re-run this to pick up" >&2
  echo "       where it stopped." >&2
  exit 1
fi

# ── Prove it ─────────────────────────────────────────────────────────────────

echo "==> Reading the firewall back"
live_or_die "The apply ran, so the firewall may or may not carry the change."
if (( REMOVE )); then
  if present_anywhere; then
    echo "ERROR: ${INSTANCE} still carries ${ADDRESS} on an SSH port." >&2
    HELD_BY="$( [[ "$TARGET" == "staging" ]] && dev_tester_owners "$ADDRESS" || true)"
    if [[ -n "$HELD_BY" ]]; then
      echo "       It is also the dev-and-tester address of ${HELD_BY}, which the staging" >&2
      echo "       firewall admits from that parameter; offboarding that person removes it." >&2
    else
      echo "       The apply reported success, so what it applied did not remove" >&2
      echo "       this address." >&2
    fi
    echo "       Their access has NOT ended." >&2
    exit 1
  fi
  if COVER="$(still_covered)"; then
    echo "ERROR: ${ADDRESS} is off the list, but the firewall still admits it" >&2
    echo "       through ${COVER}, whose entry reads: $(whose "${COVER%% on port*}")." >&2
    echo "       Their access has NOT ended." >&2
    exit 1
  fi
  echo "    ${ADDRESS} is no longer admitted on ports ${SSH_PORTS[*]}"
else
  if ! admitted_everywhere; then
    echo "ERROR: ${INSTANCE} does not admit ${ADDRESS} on every SSH port." >&2
    echo "       The apply reported success, so what it applied did not carry" >&2
    echo "       this address. They still cannot reach the host." >&2
    exit 1
  fi
  echo "    ${ADDRESS} is admitted on ports ${SSH_PORTS[*]}"
fi

echo ""
echo "Done, and proved against the firewall rather than the file."
exit 0
