#!/usr/bin/env bash
# install-known-hosts.sh
#
# Builds the pinned host-key file every operator script verifies a deployed host
# against, from the Lightsail API rather than from whoever answers the SSH port.
#
# WHY THIS EXISTS.
#
# Building the file by hand means reading two keys out of one API call, fetching
# the address from a Terraform output, then hand-writing four lines covering two
# algorithms across two ports, with the bracketed form on the non-default one,
# and checking it parsed by eye.
#
# Every one of those goes wrong quietly. A wrapped paste yields a line
# `ssh-keygen` simply does not find, a missing bracketed form covers port 22 and
# not 2222, and a stale address survives an instance replacement. None of them
# error here. They surface much later as a refused connection that reads like a
# firewall fault, which is the diagnosis an operator then spends an hour on.
#
# So this run does the parts a person should not have to: it reads the keys and
# the address from their authoritative sources, writes all four lines, and then
# proves the result with `ssh-keygen -F` under both spellings of the address
# rather than trusting that it wrote what it meant to.
#
# WHO RUNS IT.
#
# The `footbag-operator` IAM user. The keys come from the Lightsail call that
# also mints a host-access certificate, and the FootbagDevTester role is denied
# that call on every instance, because the certificate opens a root shell. A
# dev-and-tester therefore receives the pin lines sealed in their delivery from
# scripts/onboard-dev-tester.sh, which copies them out of the operator's current
# pin, and installs them with scripts/accept-dev-tester-onboarding.sh.
#
# WHEN IT MINTS.
#
# Every mint fires the production break-glass alarm, so a routine run must not
# make one. The pin is judged current without minting, against the instance
# record written beside it when the keys were last read (the instance's name,
# ARN and creation time, compared with Lightsail's GetInstance, which returns no
# credential). --check never mints. An install whose pin is already current
# mints nothing and says so. Only a missing, stale or unproven pin is rebuilt,
# with one mint, attributed to footbag-install-known-hosts.
#
# WHAT IT REFUSES TO DO.
#
#   - Learn a host key from the network. The whole point of the pin is that it
#     comes from an authenticated AWS call; a key read from the SSH port is the
#     assumption the pin exists to replace.
#   - Take the address from a document or a flag. A written-down address goes
#     stale silently when an instance is replaced, and the symptom is a refused
#     connection rather than anything naming the address.
#   - Overwrite a pin for a DIFFERENT environment. The file holds every host an
#     operator reaches, so a run for staging keeps production's lines and vice
#     versa. Replacing the file wholesale is how one environment's pin quietly
#     disappears.
#   - Report success on a file it could not verify.
#   - Leave this environment's old lines behind after a rebuild moves the host
#     to another address. Lines for the address the alias named before, and
#     any line tagged for this environment, are replaced along with the current
#     address's; a line tagged for the other environment is never touched.
#     --check reports such a leftover as stale.
#
# Usage:
#   bash scripts/install-known-hosts.sh --target staging
#   bash scripts/install-known-hosts.sh --target production
#   bash scripts/install-known-hosts.sh --target staging --check
#
# Flags:
#   --target <staging|production>  which environment's host to pin. No default:
#                                  which host a pin describes is never inherited
#                                  from ambient state.
#   --check                        report whether the pin is proven current,
#                                  change nothing, mint nothing, and exit
#                                  non-zero if an install would change it.
#
# Re-run it whenever an instance is rebuilt: new instance, new host keys, and the
# deploy then fails closed with SSH's host-key warning. Re-running is the fix;
# deleting the offending line and reconnecting on trust is not.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# require_target: the shared environment guard, so the refusal reads the same
# here as everywhere else.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/terraform-output.sh
source "${SCRIPT_DIR}/lib/terraform-output.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

AWS_BIN="${INSTALL_KNOWN_HOSTS_AWS_BIN:-aws}"
TARGET=""
CHECK=0

usage() {
  cat <<'EOF'
Usage: bash scripts/install-known-hosts.sh --target <staging|production> [--check]

Builds ~/AWS/footbag_known_hosts from the Lightsail API and the environment's
Terraform outputs, covering both algorithms on both SSH ports, then proves it
with ssh-keygen. Lines for other environments are preserved.

  --target <env>   staging or production. Required; never defaulted.
  --check          report only, change nothing, mint nothing, non-zero if a
                   change is needed.

A pin proven current is left alone and nothing is minted. Override the file
location with FOOTBAG_KNOWN_HOSTS; the instance record sits beside it, with
.instances appended to its name.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --check) CHECK=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# The shared refusal rather than another copy of it. Which host a pin describes
# is never inherited from ambient state, and that sentence belongs in one place:
# nineteen scripts said it in their own words before this helper existed, and a
# wording that drifts per script is what teaches an operator to skim it.
require_target "$TARGET" staging production || exit 2

# The closing report: every refusal and problem below is listed once at the end,
# and the library holds the exit and interrupt traps.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

PIN="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"

# The AWS profile, supplied rather than exported. Both reads below reach
# AWS, so a run with no identity should say so here rather than failing twice
# with two different messages.
aws_profile_ensure || cr_die "could not settle the AWS identity this run acts as. Nothing was minted or written."

[[ "$AWS_BIN" != "aws" ]] && echo "SYNTHETIC: aws='${AWS_BIN}' -- this run proves nothing about the account." >&2

# The staged pin and any mint response are removed however the run ends; the
# response holds a private key.
PIN_TMP=""
remove_staged_pin() {
  [[ -z "${PIN_TMP:-}" ]] || rm -f -- "$PIN_TMP"
}
cr_cleanup known_hosts_mint_cleanup
cr_cleanup remove_staged_pin

echo "==> Checking the ${TARGET} pin in ${PIN}, minting nothing"

# ── Is the pin already current? ──────────────────────────────────────────────
#
# Judged against the instance record, with no mint: the address and instance
# from Terraform, the instance's ARN and creation time from GetInstance.
CURRENT_RC=0
known_hosts_pin_current "$TARGET" "$AWS_BIN" || CURRENT_RC=$?
(( CURRENT_RC == 2 )) && cr_die "could not judge whether the ${TARGET} pin is current; the reason is above. Nothing was minted or written."
IP="$KNOWN_HOSTS_PIN_IP"
INSTANCE="$KNOWN_HOSTS_PIN_INSTANCE"
RECORD_LINE="$KNOWN_HOSTS_INSTANCE_RECORD"
STALE_REASON="$KNOWN_HOSTS_STALE_REASON"
# Each line carries the environment's name as its trailing comment field, which
# OpenSSH ignores when matching. It is what lets a later run find this
# environment's lines again after the address they name has moved on, and keep
# its hands off the other environment's.
TAG="footbag-${TARGET}"
OTHER_TAG="footbag-$([[ "$TARGET" == staging ]] && echo production || echo staging)"
NEW_LINES="$KNOWN_HOSTS_PIN_LINES"
EXPECTED_COUNT="$KNOWN_HOSTS_PIN_COUNT"

# ── Where this alias pointed before ──────────────────────────────────────────
#
# A rebuild can move the host to another address. Lines for the address the
# alias named before are then this environment's stale pins: they verify a host
# that no longer exists, and if that address is ever reassigned they verify
# whoever holds it next. The alias's configured HostName is that previous
# address when it differs from Terraform's. It is never taken when it is the
# other environment's address, read from that tree where it can be, and never
# when the lines there carry the other environment's tag.
PREV_IP=""
alias_host="$(ssh -G "$TAG" 2>/dev/null | grep '^hostname ' | tail -1 | cut -d' ' -f2 || true)"
if [[ "$alias_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && "$alias_host" != "$IP" ]]; then
  PREV_IP="$alias_host"
  other_tree="terraform/${OTHER_TAG#footbag-}"
  if [[ -d "$other_tree" ]] && tf_output_read "$other_tree" lightsail_static_ip 2>/dev/null \
     && [[ "$TF_OUTPUT_VALUE" == "$PREV_IP" ]]; then
    PREV_IP=""
  fi
fi

# ── What is already there, for this host and for every other ────────────────
#
# Other environments' lines are kept. The file holds every host an operator
# reaches, so rewriting it wholesale is how production's pin disappears during a
# staging run. Dropped: every line for the current address, which is rewritten
# below; every line tagged for this environment, wherever it points; and every
# untagged line for the alias's previous address. A line tagged for the other
# environment is kept whatever address it names.
pin_line_is_ours() {
  local line="$1" host comment
  host="${line%% *}"
  comment="$(cut -d' ' -f4- <<< "$line")"
  [[ "$comment" == "$OTHER_TAG" ]] && return 1
  [[ "$comment" == "$TAG" ]] && return 0
  [[ "$host" == "$IP" || "$host" == "[${IP}]:2222" ]] && return 0
  if [[ -n "$PREV_IP" ]]; then
    [[ "$host" == "$PREV_IP" || "$host" == "[${PREV_IP}]:2222" ]] && return 0
  fi
  return 1
}
PRESERVED=""
STALE=0
# Splits the file into the lines this run keeps and its own, counting as stale
# each of its own lines that NEW_LINES does not carry.
sort_pin_lines() {
  local line
  PRESERVED=""
  STALE=0
  [[ -f "$PIN" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -n "$line" ]] && pin_line_is_ours "$line"; then
      # A line that is neither the current address nor rewritten identically is
      # one a check reports as stale.
      grep -qxF -- "$line" <<< "$NEW_LINES" || grep -qxF -- "$line ${TAG}" <<< "$NEW_LINES" || STALE=$(( STALE + 1 ))
      continue
    fi
    PRESERVED+="${line}"$'\n'
  done < "$PIN"
  PRESERVED="${PRESERVED%$'\n'}"
}

# A current pin can still carry this environment's leftovers at the address the
# alias named before a rebuild; they verify a host that no longer exists.
if (( CURRENT_RC == 0 )); then
  sort_pin_lines
  if (( STALE > 0 )); then
    CURRENT_RC=1
    STALE_REASON="${STALE} line(s) still pin ${INSTANCE} under a key or address it no longer has"
  fi
fi

if (( CURRENT_RC == 0 )); then
  if [[ "$CHECK" == "1" ]]; then
    echo "    Pinned and current: ${EXPECTED_COUNT} lines for ${INSTANCE} at ${IP}; nothing minted."
  else
    echo "    Already current, nothing minted: ${EXPECTED_COUNT} lines for ${INSTANCE} at ${IP}."
  fi
  cr_proved "the ${TARGET} pin is current for ${INSTANCE} at ${IP}, judged against its instance record with no mint"
  cr_finish
fi

if [[ "$CHECK" == "1" ]]; then
  echo "    Not proven current: ${STALE_REASON}." >&2
  echo "    Re-run without --check to rebuild it. That reads the host keys from" >&2
  echo "    Lightsail, which mints a host-access certificate and fires the" >&2
  echo "    break-glass alarm, attributed to footbag-install-known-hosts." >&2
  cr_die "the ${TARGET} pin is not proven current: ${STALE_REASON}. Nothing was minted or written."
fi

# ── The lines, from the address in Terraform and the keys in Lightsail ───────
#
# One mint, through the shared library. The instance is the one Terraform names,
# which a restore from snapshot changes.
echo "    Not current: ${STALE_REASON}."
echo "==> Reading ${INSTANCE}'s host keys from Lightsail. This mints a host-access"
echo "    certificate, so the break-glass alarm fires; the mint is attributed to"
echo "    footbag-install-known-hosts. The response is shredded once read."
known_hosts_pin_lines "$TARGET" "$AWS_BIN" \
  || cr_die "could not read ${INSTANCE}'s host keys from Lightsail; the reason is above. Nothing was written."
if [[ "$KNOWN_HOSTS_PIN_IP" != "$IP" || "$KNOWN_HOSTS_PIN_INSTANCE" != "$INSTANCE" ]]; then
  cr_die "Terraform named ${INSTANCE} at ${IP} and then ${KNOWN_HOSTS_PIN_INSTANCE} at ${KNOWN_HOSTS_PIN_IP} within one run. Nothing was written; run it again."
fi
cr_proved "read ${INSTANCE}'s host keys from Lightsail with one mint, attributed to footbag-install-known-hosts"
NEW_LINES="$(printf '%s\n' "$KNOWN_HOSTS_PIN_LINES" | sed "/./s/\$/ ${TAG}/")"
EXPECTED_COUNT="$KNOWN_HOSTS_PIN_COUNT"
sort_pin_lines

# Staged beside the target so the install is a rename within one filesystem,
# never a half-written pin that parses as far as the damage.
PIN_DIR="$(dirname -- "$PIN")"
[[ -d "$PIN_DIR" ]] || mkdir -p -m 700 -- "$PIN_DIR"
PIN_TMP="$(umask 077 && mktemp "${PIN_DIR}/.footbag_known_hosts.XXXXXX")"

[[ -n "$PRESERVED" ]] && printf '%s\n' "$PRESERVED" >> "$PIN_TMP"
printf '%s\n' "$NEW_LINES" >> "$PIN_TMP"
chmod 600 "$PIN_TMP"
mv -f -- "$PIN_TMP" "$PIN"
PIN_TMP=""

# The record names the instance the keys were read from, so a later check can
# tell this host from a rebuilt one without minting. Written after the pin: a
# run stopped between the two leaves a pin with an older record, which reads as
# not current and is rebuilt, never the reverse.
known_hosts_record_write "$TARGET" "$RECORD_LINE" \
  || cr_die "the pin was written but its instance record was not; re-run this script."

# ── Prove it, rather than trusting that it wrote what it meant to ────────────
#
# A malformed line does not error: ssh-keygen simply does not find it, and the
# failure surfaces much later as a refused connection. Both spellings of the
# address are checked, because one verifying proves nothing about the other.
FOUND_PLAIN="$(ssh-keygen -F "$IP" -f "$PIN" 2>/dev/null | grep -c '^[^#]' || true)"
FOUND_PORT="$(ssh-keygen -F "[${IP}]:2222" -f "$PIN" 2>/dev/null | grep -c '^[^#]' || true)"
PER_PORT=$(( EXPECTED_COUNT / 2 ))

if (( FOUND_PLAIN < PER_PORT || FOUND_PORT < PER_PORT )); then
  cr_die "the pin was written but does not verify: ${IP} matched ${FOUND_PLAIN} of ${PER_PORT}; [${IP}]:2222 matched ${FOUND_PORT} of ${PER_PORT}. Do not hand-edit it: re-run this script, which rebuilds from the API."
fi
# And the judgement every later run makes, so a pin written here is one the
# next --check reads as current rather than one that sends it back to mint.
if ! known_hosts_pin_current "$TARGET" "$AWS_BIN"; then
  cr_die "the pin was written but does not read as current: ${KNOWN_HOSTS_STALE_REASON:-a source could not be read}."
fi
cr_proved "wrote ${EXPECTED_COUNT} lines for ${INSTANCE} at ${IP} on ports 22 and 2222, verified with ssh-keygen under both spellings and read back as current"

echo "    Wrote and verified ${EXPECTED_COUNT} lines for ${INSTANCE} at ${IP}"
echo "    ${PER_PORT} algorithm(s), on port 22 and port 2222."
echo ""
echo "    Fingerprints now pinned for this host:"
# Printed because an operator is asked to compare one against the project's
# record, and an instruction to check a value nothing displays cannot be
# followed. Read back out of the file that was just written, so what is shown is
# what is installed rather than what was intended. ssh-keygen lists a line by
# its trailing comment when it has one, so this environment's lines are found
# by their tag, not by the address.
ssh-keygen -lf "$PIN" 2>/dev/null \
  | grep -F -- " ${TAG} " \
  | awk '{print "      " $2 "  " $4}' \
  | sort -u || cr_warn "the pinned fingerprints could not be read back for display; check with: ssh-keygen -lf ${PIN}"
[[ -z "$PRESERVED" ]] || echo "    Other environments' pins preserved."
echo ""
echo "Pinned. Re-run this after any instance rebuild: new instance, new host keys."
cr_finish
