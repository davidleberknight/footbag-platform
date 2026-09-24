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
# dev-and-tester therefore receives the pin lines with their onboarding rather
# than building them here; that delivery is designed and not yet built, and
# nothing here should be improvised around it.
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
#   --check                        report what is pinned and whether it verifies,
#                                  change nothing, and exit non-zero if it would.
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
REGION="us-east-1"
TARGET=""
CHECK=0

usage() {
  cat <<'EOF'
Usage: bash scripts/install-known-hosts.sh --target <staging|production> [--check]

Builds ~/AWS/footbag_known_hosts from the Lightsail API and the environment's
Terraform outputs, covering both algorithms on both SSH ports, then proves it
with ssh-keygen. Lines for other environments are preserved.

  --target <env>   staging or production. Required; never defaulted.
  --check          report only, change nothing, non-zero if a change is needed.

Override the file location with FOOTBAG_KNOWN_HOSTS.
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

INSTANCE="footbag-${TARGET}-web"
PIN="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}"

# The AWS profile, supplied rather than exported. Both reads below reach
# AWS, so a run with no identity should say so here rather than failing twice
# with two different messages.
aws_profile_ensure || exit 1

echo "==> Pinning ${INSTANCE} into ${PIN}"

# ── The address, from Terraform rather than from anything written down ───────
#
# An address in a document goes stale the moment an instance is replaced, and
# nothing announces it: the pin still parses, the connection is simply refused.
# Called directly, never through a command substitution. That would run it in a
# subshell and TF_OUTPUT_ERROR would die with it, leaving the refusal below with
# nothing to say — which is the loss the library exists to prevent. The value
# arrives in TF_OUTPUT_VALUE, and the directory is a path rather than an
# environment name.
if ! tf_output_read "terraform/${TARGET}" lightsail_static_ip; then
  echo "ERROR: could not read the ${TARGET} host address from Terraform." >&2
  echo "       ${TF_OUTPUT_ERROR}" >&2
  echo "       The address is deliberately written down nowhere else, so there is" >&2
  echo "       nothing to fall back to. Initialise the tree and re-run:" >&2
  echo "         terraform -chdir=terraform/${TARGET} init" >&2
  exit 1
fi
IP="$TF_OUTPUT_VALUE"
if [[ -z "$IP" || "$IP" != *.*.*.* ]]; then
  echo "ERROR: the ${TARGET} host address read back as '${IP}', which is not an address." >&2
  exit 1
fi

# ── The keys, from the authenticated API rather than from the SSH port ───────
#
# Algorithm and key together, one pair per line. Asking for the key alone loses
# which algorithm it belongs to, and a line assembled with the wrong algorithm
# is one ssh-keygen does not match and does not complain about.
if ! KEY_ROWS="$("$AWS_BIN" lightsail get-instance-access-details \
    --region "$REGION" --instance-name "$INSTANCE" \
    --query 'accessDetails.hostKeys[].{alg:algorithm,pub:publicKey}' \
    --output text 2>/dev/null)"; then
  echo "ERROR: could not read host keys for ${INSTANCE} from Lightsail." >&2
  echo "       The pin is built from that API call and from nothing else, because" >&2
  echo "       a key learned from the SSH port is the assumption the pin replaces." >&2
  exit 1
fi

if [[ -z "$KEY_ROWS" ]]; then
  echo "ERROR: Lightsail returned no host keys for ${INSTANCE}." >&2
  exit 1
fi

# ── Build the four lines ─────────────────────────────────────────────────────
#
# Both ports, because sshd listens on 22 and 2222 and OpenSSH matches a
# non-default port only in the bracketed form. A pin written for one port
# verifies nothing on the other, and the deploy alias uses the higher one.
NEW_LINES="$(
  printf '%s\n' "$KEY_ROWS" | while IFS=$'\t' read -r alg pub; do
    [[ -n "$alg" && -n "$pub" ]] || continue
    printf '%s %s %s\n' "$IP" "$alg" "$pub"
    printf '[%s]:2222 %s %s\n' "$IP" "$alg" "$pub"
  done
)"

EXPECTED_COUNT="$(printf '%s\n' "$NEW_LINES" | grep -c . || true)"
if (( EXPECTED_COUNT < 2 )); then
  echo "ERROR: built only ${EXPECTED_COUNT} pin lines, which is fewer than one" >&2
  echo "       algorithm across two ports. Refusing to install a partial pin." >&2
  exit 1
fi

# ── What is already there, for this host and for every other ────────────────
#
# Other environments' lines are kept. The file holds every host an operator
# reaches, so rewriting it wholesale is how production's pin disappears during a
# staging run.
PRESERVED=""
if [[ -f "$PIN" ]]; then
  PRESERVED="$(grep -v -F -e "${IP} " -e "[${IP}]:2222 " -- "$PIN" || true)"
fi

if [[ "$CHECK" == "1" ]]; then
  # Counted in this shell rather than judged by a subshell's exit status: a
  # `while` on the right of a pipe runs in a subshell, and reasoning about which
  # status escapes it is exactly the kind of cleverness a check should not carry.
  MISSING=0
  if [[ -f "$PIN" ]]; then
    while IFS= read -r l; do
      [[ -n "$l" ]] || continue
      grep -qxF -- "$l" "$PIN" || MISSING=$(( MISSING + 1 ))
    done <<< "$NEW_LINES"
  else
    MISSING="$EXPECTED_COUNT"
  fi
  if (( MISSING == 0 )); then
    echo "    Pinned and current: ${EXPECTED_COUNT} lines for ${INSTANCE} at ${IP}"
    exit 0
  fi
  echo "    ${MISSING} of ${EXPECTED_COUNT} pin lines for ${INSTANCE} at ${IP} are missing or stale." >&2
  echo "    Re-run without --check to install them." >&2
  exit 1
fi

# Staged beside the target so the install is a rename within one filesystem,
# never a half-written pin that parses as far as the damage.
PIN_DIR="$(dirname -- "$PIN")"
[[ -d "$PIN_DIR" ]] || mkdir -p -m 700 -- "$PIN_DIR"
PIN_TMP="$(umask 077 && mktemp "${PIN_DIR}/.footbag_known_hosts.XXXXXX")"
trap 'rm -f -- "${PIN_TMP:-}"' EXIT INT TERM

[[ -n "$PRESERVED" ]] && printf '%s\n' "$PRESERVED" >> "$PIN_TMP"
printf '%s\n' "$NEW_LINES" >> "$PIN_TMP"
chmod 600 "$PIN_TMP"
mv -f -- "$PIN_TMP" "$PIN"
PIN_TMP=""

# ── Prove it, rather than trusting that it wrote what it meant to ────────────
#
# A malformed line does not error: ssh-keygen simply does not find it, and the
# failure surfaces much later as a refused connection. Both spellings of the
# address are checked, because one verifying proves nothing about the other.
FOUND_PLAIN="$(ssh-keygen -F "$IP" -f "$PIN" 2>/dev/null | grep -c '^[^#]' || true)"
FOUND_PORT="$(ssh-keygen -F "[${IP}]:2222" -f "$PIN" 2>/dev/null | grep -c '^[^#]' || true)"
PER_PORT=$(( EXPECTED_COUNT / 2 ))

if (( FOUND_PLAIN < PER_PORT || FOUND_PORT < PER_PORT )); then
  echo "ERROR: the pin was written but does not verify." >&2
  echo "       ${IP} matched ${FOUND_PLAIN} of ${PER_PORT}; [${IP}]:2222 matched ${FOUND_PORT} of ${PER_PORT}." >&2
  echo "       Do not hand-edit it: re-run this script, which rebuilds from the API." >&2
  exit 1
fi

echo "    Wrote and verified ${EXPECTED_COUNT} lines for ${INSTANCE} at ${IP}"
echo "    ${PER_PORT} algorithm(s), on port 22 and port 2222."
echo ""
echo "    Fingerprints now pinned for this host:"
# Printed because an operator is asked to compare one against the project's
# record, and an instruction to check a value nothing displays cannot be
# followed. Read back out of the file that was just written, so what is shown is
# what is installed rather than what was intended.
ssh-keygen -lf "$PIN" 2>/dev/null \
  | grep -F "$IP" \
  | awk '{print "      " $2 "  " $4}' \
  | sort -u || echo "      (could not read them back; check with: ssh-keygen -lf ${PIN})"
[[ -n "$PRESERVED" ]] && echo "    Other environments' pins preserved."
echo ""
echo "Pinned. Re-run this after any instance rebuild: new instance, new host keys."
