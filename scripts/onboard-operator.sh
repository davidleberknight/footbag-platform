#!/usr/bin/env bash
# onboard-operator.sh
#
# Everything a named operator needs, in one command: the SSH key pair of their
# named account, made on this workstation; their Linux account on the deployed
# host, holding that key alone; their AWS identity; and one Match block in this
# workstation's ~/.ssh/config that lets a command run through
# `scripts/as-dev-tester.sh --account <name>` act as them on the host too.
#
# The default is untouched, and that is the point: footbag-operator on AWS and
# the shared account on the host, for every run that is not deliberately put
# elsewhere. Nothing here changes the alias's own stanza, the footbag-operator
# credentials, or the shared account's password file.
#
# WHY THIS EXISTS.
#
# The halves are owned by different things and each was correct on its own, so
# nobody noticed that the operation as a whole belonged to nobody. A person
# onboarded by running some of them is not onboarded: they have an AWS identity
# and no shell, or a shell and an SSH alias still connecting as somebody else, or
# a named account that carries the shared account's key, which the day they are
# fired sweeps that key off the shared account too. Hiring is one command
# because the failure mode of splitting it is a person who is half-hired.
#
# RUN IT AGAIN, WHEREVER IT STOPPED.
#
# Every step reads the state it is responsible for before acting, so the same
# command starts a hire, finishes one that stopped part way, finishes a named
# account made before it had a key of its own, and reports a finished hire as
# finished without changing anything. Done is decided by proof, never by a file
# existing:
#
#   key    the named pair exists, is not the main key, and is held by the agent
#   host   the named account takes the named key and refuses the main key, the
#          shared account refuses the named key, and the password filed on this
#          machine after the key was made is accepted by sudo
#   AWS    the AWS half's own read-back reports the identity present and clean
#   block  ssh resolves the alias as the shared account by default and as the
#          named account under the job role's profile
#
# WHAT IT DOES NOT OWN.
#
# It sequences; it reimplements nothing. The host account belongs to
# scripts/provision-operator-account.sh, the AWS identity to
# scripts/manage-human-operator.sh, and each is run as a child with its own
# confirmations. In particular this never sees the sudo password: standard
# input reaches the host child untouched, the operator types the account's new
# password into it, and it is also what files that password, because the run
# holding a secret is the run that should put it away. The key half lives in
# scripts/lib/operator-ssh-key.sh.
#
# ONE NAME, NOT TWO.
#
# The Linux account and the IAM user are the same string, and this takes one
# argument for both rather than letting them drift apart. That is not tidiness:
# a run reaching both a host and AWS refuses when the two names disagree, so two
# names here would produce an operator whose every deploy is refused.
#
# WHO RUNS IT, AND WHERE.
#
# A person holding the `footbag-operator` IAM user's key, onboarding themselves, at their
# own workstation. Every step writes to the machine it runs on: the key pair is
# made here and its private half never leaves, the host step files their own
# sudo password here, the AWS step mints the AWS key into this machine's
# credentials file and no copy of it exists anywhere else, and the last step
# writes this machine's Match block. Run for anybody else, it delivers them
# nothing and leaves their credentials here.
#
# A dev-and-tester, who holds neither `footbag-operator` nor the shared
# account's password, is not onboarded by this command. Their onboarding seals
# what it mints to their own public key for them to unseal on their own
# machine; that is designed and not built, and must not be improvised with
# this command.
#
# WHAT IT REFUSES TO DO.
#
#   - Run as anything but the directly authenticated `footbag-operator`. Creating a
#     human operator is denied to every role by the role's own policy, so a run
#     started under one would fail partway rather than at the door.
#   - Give the named account the key the shared account holds, or overwrite a
#     key file. An existing pair at the named key's path is used as it stands.
#   - Rotate an existing account that neither key on this machine logs in to
#     without the operator's typed attestation. A key that logs in shows the
#     account is this person's; for one that neither reaches, the host step
#     shows the keys it accepts and rotates it only on APPLY confirming they
#     are the operator's own lost keys, since it may be somebody else's.
#   - Change the default. The alias's stanza, the footbag-operator credentials
#     and the shared account's password file are never edited, and a run that
#     finds the alias already connecting as anything but the shared account
#     refuses before it starts.
#   - Write the Match block before the Linux account and the IAM user are
#     proven, so a wrapped command never reaches an account that does not work.
#   - Touch a stanza it did not find. An alias this workstation does not carry
#     is reported, never invented: guessing a host name and a port would produce
#     a stanza that resolves and connects to nothing.
#
# Usage:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/onboard-operator.sh \
#       --target staging --account david_leberknight \
#       --operator "David Leberknight"
#
# The redirect carries the sudo password of the shared account, which the alias
# always connects as (~/AWS/AWS_OPERATOR_PRODUCTION.txt on production). Only the
# host step reads it, and only when the host step has work to do.
#
# It asks, at the terminal, for: APPLY before it starts and before the change
# to ~/.ssh/config; the named account's password, twice; and VAULTED once the
# host step's vault entry is recorded.
#
# Flags:
#   --target <staging|production>  deployed environment; no default
#   --account <name>               the operator's name, for the Linux account and the IAM user
#   --operator "<Full Name>"       who it belongs to, for the vault entry
#   --yes                          accept this command's own APPLY confirmations
#                                  in advance; the children still ask for theirs
#   -h, --help                     this text
#
# Exit: 0 onboarded and proven, 1 refused or a step failed, 2 usage error.
#
# Test seams (CI only; operators never set these):
#   ONBOARD_HOST_CMD      replaces the host-account child
#   ONBOARD_AWS_CMD       replaces the AWS-identity child
#   ONBOARD_SSH_CONFIG    the SSH config file to read and rewrite
#   ONBOARD_SSH_ADD       replaces ssh-add
#   ONBOARD_SSH_AGENT     replaces ssh-agent
#   ONBOARD_AWS_BIN       replaces the aws CLI used for the caller check
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

# confirm_from_tty, the terminal test, the pinned host-key options, the
# credential-file rule, and the unconditional assignment of the accept-without-
# asking flag that stops an exported value standing in for a typed answer.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# The one place that knows how to edit ~/.ssh/config.
# shellcheck source=lib/ssh-alias.sh
source "${REPO_ROOT}/scripts/lib/ssh-alias.sh"
OSK_SSH_ADD_BIN="${ONBOARD_SSH_ADD:-ssh-add}"
OSK_SSH_AGENT_BIN="${ONBOARD_SSH_AGENT:-ssh-agent}"
# shellcheck source=lib/operator-ssh-key.sh
source "${REPO_ROOT}/scripts/lib/operator-ssh-key.sh"

HOST_CMD="${ONBOARD_HOST_CMD:-${SCRIPT_DIR}/provision-operator-account.sh}"
AWS_CMD="${ONBOARD_AWS_CMD:-${SCRIPT_DIR}/manage-human-operator.sh}"
SSH_CONFIG="${ONBOARD_SSH_CONFIG:-${HOME}/.ssh/config}"
AWS_BIN="${ONBOARD_AWS_BIN:-aws}"
AWS_IDENTITY_BIN="$AWS_BIN"

for seam in ONBOARD_HOST_CMD ONBOARD_AWS_CMD ONBOARD_SSH_CONFIG ONBOARD_SSH_ADD ONBOARD_SSH_AGENT ONBOARD_AWS_BIN; do
  if [[ -n "${!seam:-}" ]]; then
    echo "==> NOTE: ${seam} is set; this run is stubbed and proves nothing about the estate." >&2
  fi
done

FOOTBAG_OPERATOR_USER="footbag-operator"

TARGET=""
ACCOUNT=""
OPERATOR_NAME=""

while (( $# )); do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || usage 2 ;;
    --account) ACCOUNT="${2:-}"; shift 2 || usage 2 ;;
    --operator) OPERATOR_NAME="${2:-}"; shift 2 || usage 2 ;;
    --yes) ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2

if [[ -z "$ACCOUNT" ]]; then
  echo "ERROR: --account names the operator, and the Linux account and the IAM user both take it." >&2
  exit 2
fi
# The house form, held to here rather than discovered later. A name that does
# not match is not refused for being unusual: it is refused because the role's
# trust policy requires the STS session name to equal the IAM user name, and
# both this and the Linux account are created from this one string.
# Spelled exactly as the AWS half spells it, and checked here so the refusal
# lands before anything is created. A laxer test here is worse than none: a name
# this accepted and that refused would create the Linux account and then fail at
# the AWS step, leaving a person holding a shell and no AWS identity, which is
# the half-finished hire this command exists to prevent.
# At most 32 characters, which is the Linux account's limit and the shorter of
# the two: a name only the IAM half could take would pass here and fail at the
# host step.
if [[ ! "$ACCOUNT" =~ ^[a-z][a-z0-9]*(_[a-z0-9]+)+$ || ${#ACCOUNT} -gt 32 ]]; then
  echo "ERROR: '${ACCOUNT}' is not the shape an operator name takes here." >&2
  echo "       Lower case letters and digits in two or more parts joined by" >&2
  echo "       underscores, starting with a letter, at most 32 characters: the" >&2
  echo "       convention is a first name, an underscore and a last name." >&2
  echo "       Both the Linux account and the IAM user are created from this" >&2
  echo "       one string, and the AWS half holds it to the same shape." >&2
  exit 2
fi
if [[ "$ACCOUNT" == "$OSK_SHARED_ACCOUNT" ]]; then
  echo "ERROR: '${OSK_SHARED_ACCOUNT}' is the shared account, not a named one." >&2
  exit 2
fi
if [[ -z "$OPERATOR_NAME" ]]; then
  echo "ERROR: --operator names the person the account belongs to, which is" >&2
  echo "       what the vault entry records. Nothing else holds that." >&2
  exit 2
fi

# ── The identity this run acts on the strength of ────────────────────────────

# Settled and proved before anything is created. The AWS child asserts this for
# itself, and by then the host account would already exist.
aws_profile_use "$FOOTBAG_OPERATOR_PROFILE" \
  "Creating a human operator is refused to every role, including the job role, by the role's own policy." \
  || exit 1
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" || exit 1

ALIAS="footbag-${TARGET}"

# Read before anything is asked or changed: which account the alias connects
# as, and which of its keys is the main one.
require_pinned_known_hosts || exit 1
osk_resolve_alias "$ALIAS" "$ACCOUNT" || exit 1

echo ""
echo "Onboarding ${OPERATOR_NAME} as '${ACCOUNT}' on ${TARGET}:"
echo "  1. a key pair of the account's own on this workstation, never the main key"
echo "  2. a Linux account on the host holding that key alone, with a password"
echo "     they type themselves"
echo "  3. an AWS identity whose only grant is assuming ${FOOTBAG_DEV_TESTER_ROLE}"
echo "  4. a Match block on THIS workstation, so a command run through"
echo "     scripts/as-dev-tester.sh --account ${ACCOUNT} acts as ${ACCOUNT} on the host"
echo "Each step that is already done is proved and left alone. The default is not"
echo "changed: footbag-operator on AWS and ${OSK_SHARED_ACCOUNT} on the host, for every other run."
echo ""
echo "Every credential lands on this machine, so ${OPERATOR_NAME} has to be the"
echo "person at this keyboard, onboarding their own workstation. There is no"
echo "remote hand-off and no second copy, and a dev-and-tester is not onboarded"
echo "this way."
echo ""
if ! confirm_from_tty "Type 'APPLY' to onboard ${ACCOUNT}: " "APPLY"; then
  echo "Not confirmed; nothing was changed." >&2
  exit 1
fi

# ── Step 1: the key pair ─────────────────────────────────────────────────────

# First, because the host step proves its logins in batch mode: the new key
# must already be held by the agent.
#
# Cleanup is set once, here, for the whole run: an agent this run starts, which
# is this run's to stop.
cleanup() {
  osk_stop_agent
}
trap cleanup EXIT INT TERM
echo ""
echo "== Step 1: the key pair for ${ACCOUNT}"
osk_ensure_pair "$ACCOUNT" || exit 1
osk_ensure_agent || exit 1

# ── Step 2: the host account ─────────────────────────────────────────────────

NAMED_ON_ACCOUNT=""
MAIN_ON_ACCOUNT=""
NAMED_ON_SHARED=""
FILED=""
read_host() {
  NAMED_ON_ACCOUNT="$(osk_probe "$ACCOUNT" "$OSK_NAMED_KEY")"
  MAIN_ON_ACCOUNT="$(osk_probe "$ACCOUNT" "$OSK_MAIN_KEY")"
  NAMED_ON_SHARED="$(osk_probe "$OSK_SHARED_ACCOUNT" "$OSK_NAMED_KEY")"
  FILED="no"
  if [[ "$NAMED_ON_ACCOUNT" == accepted ]]; then
    FILED="$(osk_sudo_filed "$ACCOUNT" "$TARGET")"
  fi
}
host_done() {
  [[ "$NAMED_ON_ACCOUNT" == accepted && "$MAIN_ON_ACCOUNT" == refused \
     && "$NAMED_ON_SHARED" == refused && "$FILED" == yes ]]
}

echo ""
echo "== Step 2: the Linux account on ${TARGET}"
read_host
if host_done; then
  echo "  already done: ${ACCOUNT} takes only its own key, ${OSK_SHARED_ACCOUNT} does not"
  echo "  take it, and the filed password is accepted by sudo"
else
  HOST_ARGS=(--target "$TARGET" --account "$ACCOUNT" --operator "$OPERATOR_NAME"
             --key-file "${OSK_NAMED_KEY}.pub" --own-password)
  # An account a key on this machine logs in to is this person's: made by an
  # earlier run that stopped after VAULTED, or made before it had a key of its
  # own and still carrying the main key. The rotation finishes either: it gives
  # the account the named key alone, sets the password again and files it.
  # An account neither key reaches is created if absent. If it exists, the host
  # child shows the keys it accepts and rotates it only on the operator's typed
  # attestation that they are their own lost keys.
  if [[ "$NAMED_ON_ACCOUNT" == accepted || "$MAIN_ON_ACCOUNT" == accepted ]]; then
    echo "  ${ACCOUNT} exists and a key on this machine logs in to it, so it is"
    echo "  finished rather than created: it gets the named key alone and its"
    echo "  password is set again and proved."
    HOST_ARGS+=(--rotate)
  else
    HOST_ARGS+=(--attest-own)
  fi
  # Standard input reaches this child untouched: it carries the shared
  # account's sudo password, and this script has read none of it.
  if ! bash "$HOST_CMD" "${HOST_ARGS[@]}"; then
    echo "" >&2
    echo "ERROR: the host step did not finish, so nothing after it ran. Its output" >&2
    echo "       above names the part that failed." >&2
    echo "" >&2
    echo "       Fix what that run named and re-run this command; it resumes where" >&2
    echo "       it stopped. If you declined because a key it showed is not yours," >&2
    echo "       find out whose account ${ACCOUNT} is before going further." >&2
    exit 1
  fi
  echo ""
  echo "  read back:"
  read_host
fi
echo "  ${ACCOUNT} with the named key:        ${NAMED_ON_ACCOUNT}"
echo "  ${ACCOUNT} with the main key:         ${MAIN_ON_ACCOUNT}"
echo "  ${OSK_SHARED_ACCOUNT} with the named key:          ${NAMED_ON_SHARED}"
echo "  sudo with the filed password:        ${FILED}"
if ! host_done; then
  echo "" >&2
  echo "ERROR: the host account is not proven. Expected accepted, refused, refused" >&2
  echo "       and yes. An 'unproven' line is a connection that failed for another" >&2
  echo "       reason (network, host key, timeout), not a refusal. Re-run this" >&2
  echo "       command once the cause is fixed; the host's own key list is" >&2
  echo "         bash scripts/host-diagnostics.sh --target ${TARGET} host-access" >&2
  exit 1
fi

# ── Step 3: the AWS identity ─────────────────────────────────────────────────

# Read back before acting: the onboarding retires and re-mints the access key,
# so running it on an identity that is already right would replace a working
# key for nothing.
echo ""
echo "== Step 3: the AWS identity"
# The read-back fails on a wrong path, a missing tag or a local profile that
# resolves wrongly, but only prints an absent user, a missing grant, no active
# key or no profile on this workstation. Each of those is work the onboarding
# does, and a lost key is reissued exactly this way, so done is read from the
# lines that say each is present rather than from the exit status alone.
aws_done() {
  local out rc=0
  out="$(bash "$AWS_CMD" --verify "$ACCOUNT" </dev/null 2>&1)" || rc=$?
  (( rc == 0 )) || return 1
  grep -qE 'user:[[:space:]]+present' <<<"$out" || return 1
  grep -qE 'active:[[:space:]]+[1-9]' <<<"$out" || return 1
  grep -qE 'policy:.* present$' <<<"$out" || return 1
  ! grep -qE '(section|profile):[[:space:]]+no ' <<<"$out"
}
if aws_done; then
  echo "  already done: the AWS half's read-back reports ${ACCOUNT} present, granted,"
  echo "  with an active key and this workstation's profiles resolving"
else
  AWS_ARGS=(--onboard "$ACCOUNT")
  [[ "$ASSUME_YES" == "yes" ]] && AWS_ARGS+=(--yes)
  # No standard input: it may carry the credential pipe, and this child reads
  # its confirmation from the terminal rather than from stdin.
  if ! bash "$AWS_CMD" "${AWS_ARGS[@]}" </dev/null; then
    echo "" >&2
    echo "ERROR: the AWS identity was not created." >&2
    echo "       The host account stands and is not withdrawn: it is recorded in" >&2
    echo "       the vault, and taking it back would make that record describe a" >&2
    echo "       login that does not exist. Re-run this command; the steps before" >&2
    echo "       this one are proved and left alone." >&2
    exit 1
  fi
fi

# ── Step 4: the Match block ──────────────────────────────────────────────────

# Last, and only once the Linux account and the IAM user are proven, so a
# wrapped command never reaches an account that does not work yet. The alias's
# own stanza is left exactly as it is.
echo ""
echo "== Step 4: acting as ${ACCOUNT} on the host, only when asked"
osk_ensure_match_block "$SSH_CONFIG" "$ALIAS" "$ACCOUNT" "$FOOTBAG_DEV_TESTER_PROFILE" || exit 1

echo ""
echo "Done. ${ACCOUNT} holds a key of its own, a host account and an AWS"
echo "identity. Every run is still footbag-operator on AWS and ${OSK_SHARED_ACCOUNT} on"
echo "the host. To act as ${ACCOUNT} for one command, on both:"
echo "  bash scripts/as-dev-tester.sh --account ${ACCOUNT} <command>"
echo "  main key (${OSK_SHARED_ACCOUNT}):  ${OSK_MAIN_FP}"
echo "  named key (${ACCOUNT}):  ${OSK_NAMED_FP}"
echo "Record both fingerprints in the cutover log."
echo ""
echo "Prove the whole thing from their side:"
echo "  bash scripts/setup-operator-workstation.sh --target ${TARGET} --check"
echo ""
echo "Two things this does not do, and neither is optional."
echo ""
echo "  1. ${OPERATOR_NAME}'s address on the SSH allow-list, if it is not there"
echo "     already; without it they cannot reach the host at all. One command"
echo "     puts it there and proves it against the live firewall rather than"
echo "     against the values file, and says so if it is there already:"
echo ""
echo "       bash scripts/authorize-operator-address.sh --target ${TARGET} \\"
echo "         --address <their-cidr> --for '${ACCOUNT}; <where>'"
echo ""
echo "     Their address comes from their own shell, not yours:"
echo "     curl -s https://checkip.amazonaws.com"
echo ""
echo "  2. The vault entry recording that they hold access. Neither credential"
echo "     goes in it: the sudo password is theirs alone and the AWS key has no"
echo "     second copy anywhere. The entry records the access, not the secrets."
exit 0
