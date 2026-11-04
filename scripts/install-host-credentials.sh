#!/usr/bin/env bash
# install-host-credentials.sh
#
# Installs the AWS credential chain on a deployed host: the source-profile
# access key plus the runtime profile that assumes the application's runtime
# role. Safe to re-run against a host whose key is already in service: it
# reinstalls the files and proves the chain. It refuses to mint a second key for
# a user that already holds one, so a bare re-run is not a rotation. Rotating is
# --rotate, then --retire <id> once the host is seen working, then --delete <id>.
#
# Without this the host cannot reach Parameter Store, and a deploy transfers
# images and then refuses at the go-live-marker guard, because that guard reads
# the marker to confirm the environment is pre-live and fails closed when it
# cannot read it at all. The message names the marker, so the failure reads like
# an infrastructure problem when the cause is a missing credential file.
#
# Wire pattern, matching install-cwagent-*.sh: the sudo password arrives on
# stdin, the access key is read from a file, and both are emitted into the same
# pipe as shell-quoted assignments ahead of the remote body. Nothing secret ever
# reaches a process's argument list, where `ps -ef` would expose it to any
# account on either machine.
#
# The access key is minted, shown once for vaulting and disposed of by this run
# rather than by the operator: see scripts/lib/iam-access-key.sh for why the whole
# lifecycle sits on a trap. There is nothing to create beforehand and nothing to
# shred afterwards.
#
# Both ends of a rotation are the script's: minting the new key, and retiring
# the predecessor, which is the half a rotation done by memory never reaches.
# The keys-file form below exists because a key issued in the console has to
# reach a host somehow, but it is not the ordinary path.
#
# Prerequisites:
#   - terraform applied for the target environment (creates the source-profile
#     user, the runtime role, and the logs-publisher role)
#   - jq available locally
#
# Usage. The install reads the sudo password from stdin, line 1, and shows the
# new key on the terminal, so it needs a real terminal as well as the redirect.
#
# Which file holds that password follows the account the alias connects as, and
# each account has its own file per environment, because staging and production
# are separate hosts with separate passwords:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
# A run started without the redirect names the one it needs.
#
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#     bash scripts/install-host-credentials.sh --target production
#
# Rotating, as three separate runs with an observation window between them:
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#     bash scripts/install-host-credentials.sh --target production --rotate
#   bash scripts/install-host-credentials.sh --target production --retire <id>
#   bash scripts/install-host-credentials.sh --target production --delete <id>
#
# The retirement asks the HOST to resolve its own credential chain before it
# deactivates anything, so it connects and takes the sudo password on stdin like
# the install. Only the delete run reaches no host: by then the key is inactive
# and the host has been observed working without it.
#
# That proof has to come from the host and cannot come from here. Asking this
# workstation to resolve footbag-<env>-runtime proves the OPERATOR can assume
# the role, since a workstation profile chains from the operator's own key, and
# says nothing about /root/.aws/credentials on the host. An install that never
# ran or landed on the other environment would pass such a check, and cutting
# the predecessor then takes that host off SSM, S3 and SES at its next call.
#
# The logs-publisher profile is not installed here. The deploy owns that stanza
# and appends it itself, so this script never competes with it.

set -euo pipefail

# One closing report for the whole run, the host's half included: the remote
# halves mark each of their problems on the stream and the sends below fold them
# into this report. The library owns the exit and signal traps, so the key's
# cleanup is registered with it rather than set as a trap here.
# shellcheck source=lib/closing-report.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/closing-report.sh"

# No default. Which environment a runtime credential is installed onto is the
# whole decision this script carries out, and the two targets are not
# interchangeable: the credential on stdin belongs to one host, the keys file
# belongs to one environment's source-profile user, and a defaulted target
# sends both at the other one. A forgotten flag would do that silently, because
# every step after it succeeds against the wrong host just as readily.
TARGET=""
KEYS_FILE=""
KEEP_KEYS="no"
ACTION="install"
OLD_KEY=""
ROTATE=0
AWS_PROFILE_ARG=""

usage() {
  cat <<'EOF'
Usage: < ~/AWS/DEV_TESTER_HOST.txt bash scripts/install-host-credentials.sh --target staging <keys-file>
   or: < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/install-host-credentials.sh --target production <keys-file>

  --target <staging|production>   deployed environment to install onto.
                                  Required; there is deliberately no default.
  --rotate                        mint a second key alongside the existing one
                                  and install it; the old one stays active
  --retire <key-id>               deactivate the predecessor, but only after
                                  asking THE HOST to resolve its own chain.
                                  Reaches the host; takes the sudo password.
  --delete <key-id>               delete a predecessor that is already inactive.
                                  Reaches no host and takes no password.
  --profile <p>                   AWS profile for the IAM calls
  --keep-keys                     do not destroy the keys file after installing
                                  (for installing one key onto several hosts)
  <keys-file>                     optional. JSON from `aws iam create-access-key`
                                  for the footbag-<target>-source-profile user.
                                  Omit it and this script mints the key itself,
                                  which writes no secret to disk at all.

The install reads the host sudo password from stdin (line 1) and shows the new
key on the terminal, so it needs both the redirect and an interactive shell.
The retirement also reaches the host, to make it prove its own chain, so it
takes the password too. Only the delete run needs neither.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --keep-keys)
      KEEP_KEYS="yes"; shift
      ;;
    --rotate)
      ROTATE=1; shift
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --retire)
      ACTION="retire"
      OLD_KEY="${2:-}"
      shift 2 || { echo "ERROR: --retire requires the key id to retire" >&2; exit 2; }
      ;;
    --delete)
      ACTION="delete"
      OLD_KEY="${2:-}"
      shift 2 || { echo "ERROR: --delete requires the key id to delete" >&2; exit 2; }
      ;;
    -h|--help)
      usage; exit 0
      ;;
    -*)
      echo "ERROR: unknown flag '$1'" >&2; usage >&2; exit 2
      ;;
    *)
      KEYS_FILE="$1"; shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Sourced before the target check below, which lives in it. A validation that
# runs after the script has already used the target is not a validation.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

if ! require_target "$TARGET" staging production; then
  # The shared refusal says why a target is never defaulted in general. This is
  # what it costs HERE specifically, which is worth saying because every step
  # after a wrong target succeeds: the sudo password on stdin belongs to one
  # host and the credential to one environment's user, and a defaulted target
  # sends both to the other one.
  echo "       On this script that means the password and the key both reach" >&2
  echo "       the wrong environment, with nothing failing to say so." >&2
  exit 2
fi

SSH_ALIAS="footbag-$TARGET"

if [[ "$ACTION" != "install" && -z "$OLD_KEY" ]]; then
  echo "ERROR: --${ACTION} needs the id of the key to ${ACTION}." >&2
  exit 2
fi
if [[ "$ACTION" != "install" && ( "$ROTATE" == "1" || -n "$KEYS_FILE" ) ]]; then
  echo "ERROR: --rotate and a keys file install a credential; --${ACTION} cuts one." >&2
  echo "       They are separate runs with an observation window between them." >&2
  exit 2
fi

# Only an install carries a credential to a host. Demanding the redirect on a
# retirement would point a password file at a command with no use for one, which
# is how a password ends up answering a confirmation prompt.
# The install and the retirement both reach the host and both therefore need the
# sudo password. Only --delete does not: by then the key is already inactive and
# the host has been observed working without it, so there is nothing left to
# prove there.
if [[ "$ACTION" != "delete" && -t 0 ]]; then
  echo "ERROR: must receive the host sudo password on stdin." >&2
  # Named by the shared rule rather than guessed, so the line is pasteable by
  # whoever is running it: a dev-and-tester on their named account and a
  # footbag-operator holder on the shared account need different files, and
  # naming either outright is wrong for the other.
  _cred="~/AWS/<your credential file>"
  operator_credential_select "$SSH_ALIAS" "$TARGET" 2>/dev/null \
    && _cred="$OPERATOR_CREDENTIAL_DISPLAY"
  echo "       Run via: < ${_cred} bash scripts/install-host-credentials.sh --target $TARGET <keys-file>" >&2
  echo "" >&2
  usage >&2
  exit 1
fi

command -v jq >/dev/null || cr_die "jq is required locally"

SOURCE_PROFILE_USER="footbag-${TARGET}-source-profile"
VAULT_ENTRY="aws-footbag-${TARGET}-source-profile"

REMOTE_HALF="${SCRIPT_DIR}/internal/install-host-credentials-remote.sh"
REMOTE_REPORT_LIB="${SCRIPT_DIR}/lib/closing-report-remote.sh"
[[ -r "$REMOTE_HALF" ]] || cr_die "missing remote half: $REMOTE_HALF"
[[ -r "$REMOTE_REPORT_LIB" ]] || cr_die "missing remote-half report library: $REMOTE_REPORT_LIB"

AWS_REGION_VAL="${AWS_REGION:-us-east-1}"

# shellcheck source=lib/ssh-known-hosts.sh
# (SCRIPT_DIR is already set above, before the target check that needs the
# shared library.)
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/secret-file.sh
source "${SCRIPT_DIR}/lib/secret-file.sh"
# shellcheck source=lib/iam-access-key.sh
source "${SCRIPT_DIR}/lib/iam-access-key.sh"

[[ -n "$AWS_PROFILE_ARG" ]] && {
  IAM_KEY_AWS_ARGS=(--profile "$AWS_PROFILE_ARG")
  AWS_IDENTITY_BIN="${IAM_KEY_AWS_BIN}"
}

# The host confirms it is the target before anything is minted or retired. A key
# minted for one environment's user and installed on the other's host succeeds
# at every step, and a retirement proven against the wrong host takes the right
# one off its credential. Called after the checks that need nothing but this
# workstation, so a bad keys file is still refused without reaching any host.
# Exactly one line is read from stdin, the sudo password, and it serves every
# connection below.
confirm_host() {
  IFS= read -r SUDO_PASS
  require_ssh_alias "$SSH_ALIAS" || exit 1
  require_host_is "$SSH_ALIAS" "$TARGET" || exit 1
}

# ── Retirement, which reaches no host ────────────────────────────────────────
#
# Before this existed, the runbook ended with three hand-typed steps and a
# rotation therefore finished with two live keys: minting the replacement is the
# half with visible progress, and cutting the predecessor is the half with none.
#
# The evidence has to come from the HOST, and getting that wrong is subtle
# enough to be worth spelling out. This check first asked the workstation to
# resolve `footbag-<env>-runtime`, which on a workstation chains from the
# OPERATOR's own key: it proves the operator can assume the role and says
# nothing whatever about /root/.aws/credentials on the host. An install that
# never ran, failed part-way, or landed on the other environment's host would
# pass it, and deactivating the predecessor then takes that host's containers
# off SSM, S3 and SES at their next call, hours later, as an opaque denial.
#
# So the proof goes over the wire and asks the host to resolve its own chain.
if [[ "$ACTION" != "install" ]]; then
  # The retirement connects, so it needs the pinned host key exactly as the
  # install does: a first connection to a substituted host would be handed the
  # sudo password as line one of the stream.
  require_pinned_known_hosts || exit 1
  SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

  case "$ACTION" in
    retire)
      confirm_host
      # The key the host itself holds, read from its credentials file. Retiring
      # that one takes this host off SSM, S3 and SES at its next call, whatever
      # the chain proof below says, so it is refused by id before anything else.
      # shellcheck source=internal/bootstrap-host-rebuild-keys.sh
      source "${SCRIPT_DIR}/internal/bootstrap-host-rebuild-keys.sh"
      host_key_id_read "$SSH_ALIAS" /root/.aws/credentials "$SOURCE_PROFILE_USER" || exit 1
      if [[ "$OLD_KEY" == "$HOST_KEY_ID" ]]; then
        cr_die "REFUSING: ${OLD_KEY} is the key ${TARGET}'s host holds in /root/.aws/credentials. Retiring it would take the host off its credential chain. Nothing done."
      fi
      skip_proof=0
      rebuild_key_slots_blocked "$SOURCE_PROFILE_USER" "$HOST_KEY_ID" && skip_proof=1
      if (( skip_proof )); then
        # Two keys on the user, neither on this host: nothing here uses either,
        # and no rotation can mint this host its own until one is gone. The chain
        # proof could only fail, since the host has no working key to prove with.
        echo "==> ${SOURCE_PROFILE_USER} holds two keys and ${TARGET}'s host holds neither;"
        echo "    retiring ${OLD_KEY} frees the slot a rotation needs. No chain proof is"
        echo "    possible or needed: neither key is in service on this host."
      else
      echo "==> Proving ${TARGET}'s HOST resolves its chain, before retiring ${OLD_KEY}"
      # The proof body marks its own failures, with the client's reason, on the
      # stream, so they are listed in this run's closing report. The report
      # helper goes ahead of it on the same stream, since the body cannot source.
      send_chain_proof() {
        {
          printf '%s\n' "$SUDO_PASS"
          printf 'RUNTIME_PROFILE=%q\n' "footbag-${TARGET}-runtime"
          printf 'SOURCE_PROFILE=%q\n' "footbag-${TARGET}-source-profile"
          cat "$REMOTE_REPORT_LIB"
          cat <<'PROOF'
set -euo pipefail
export AWS_CONFIG_FILE=/root/.aws/config
export AWS_SHARED_CREDENTIALS_FILE=/root/.aws/credentials
resolve() {
  local out
  if ! out="$(aws sts get-caller-identity --profile "$1" --query Arn --output text 2>&1)"; then
    crr_error "the host's profile $1 does not resolve: $(tail -n 1 <<<"$out")"
    crr_finish
  fi
  printf '%s' "$out"
}
src="$(resolve "$SOURCE_PROFILE")"
run="$(resolve "$RUNTIME_PROFILE")"
echo "    host source profile:  ${src}"
echo "    host runtime profile: ${run}"
case "$run" in
  *:assumed-role/*) ;;
  *)
    crr_error "the host's runtime profile resolved '${run}', not an assumed role."
    ;;
esac
crr_finish
PROOF
        } | "$HOST_SSH_BIN" "${SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'
      }
      if ! cr_run_marked "host chain proof on ${SSH_ALIAS}" -- send_chain_proof \
           || (( ${#CR_ERRORS[@]} )); then
        echo "" >&2
        cr_error "${TARGET}'s host does not resolve its credential chain, so the replacement has not been shown to be in service there. Nothing has been retired."
        echo "       Retiring the predecessor now would take that host off SSM," >&2
        echo "       S3 and SES at its next call." >&2
        echo "" >&2
        echo "       Install the credential first, or fix the chain, then re-run." >&2
        exit 1
      fi
      fi
      echo ""
      echo "Deactivating ${OLD_KEY} on ${SOURCE_PROFILE_USER}. Reversible."
      if ! confirm_from_tty "Type 'APPLY' to deactivate it: " "APPLY"; then
        cr_die "Not confirmed; the key is untouched."
      fi
      iam_key_retire "$SOURCE_PROFILE_USER" "$OLD_KEY" deactivate || exit 1
      cr_proved "IAM accepted the deactivation of ${OLD_KEY} on ${SOURCE_PROFILE_USER}"
      echo ""
      echo "Observe before deleting: anything still holding the old key now fails"
      echo "visibly. The host reads its credential at every call, so a container"
      echo "still holding it surfaces within minutes rather than at the next deploy."
      cr_finish
      ;;
    delete)
      echo "==> Deleting ${OLD_KEY} on ${SOURCE_PROFILE_USER}"
      echo "Not reversible, and the key id is never reissued."
      if ! confirm_from_tty "Type 'APPLY' to delete it: " "APPLY"; then
        cr_die "Not confirmed; the key is untouched."
      fi
      iam_key_retire "$SOURCE_PROFILE_USER" "$OLD_KEY" delete || exit 1
      cr_proved "IAM accepted the deletion of ${OLD_KEY} from ${SOURCE_PROFILE_USER}"
      echo ""
      echo "Record the rotation date on the vault entry ${VAULT_ENTRY}."
      cr_finish
      ;;
  esac
fi

# ── The credential to install ────────────────────────────────────────────────
#
# Two ways in. Minting it here is the ordinary path and the one that carries the
# vault's record-before-install rule as a typed confirmation rather than as a
# line in a runbook. A keys file is still accepted, because a live runbook names
# that path and because a key issued in the console has to reach a host somehow.
AKID=""
SAK=""

if [[ -n "$KEYS_FILE" ]]; then
  [[ -r "$KEYS_FILE" ]] || cr_die "cannot read keys file: $KEYS_FILE"

  # Reject a world-readable keys file. The window between issuing the key and
  # destroying the file is when a co-tenant on a shared workstation could read it.
  KEYS_PERMS=$(stat -c '%a' "$KEYS_FILE")
  if [[ "$KEYS_PERMS" != "600" && "$KEYS_PERMS" != "400" ]]; then
    cr_error "$KEYS_FILE has mode $KEYS_PERMS; expected 600 (or 400). Treat the key it holds as exposed and replace it."
    echo "       Better: run this script with no keys file at all. It mints the" >&2
    echo "       key itself and writes no secret to disk, so there is no temp" >&2
    echo "       file to get the mode wrong on." >&2
    exit 1
  fi

  AKID=$(jq -r '.AccessKey.AccessKeyId // empty' "$KEYS_FILE")
  SAK=$(jq -r '.AccessKey.SecretAccessKey // empty' "$KEYS_FILE")
  if [[ -z "$AKID" || -z "$SAK" ]]; then
    cr_die "$KEYS_FILE does not contain .AccessKey.AccessKeyId / .SecretAccessKey"
  fi
  confirm_host
else
  confirm_host
  # A bare install onto a host holding none of the user's keys, while the user
  # already holds one, is a host rebuilt from nothing. The shared library would
  # refuse with only the count, which reads as "already in service"; this names
  # the rotation that gives the new host its own key and retires the dead one's.
  if (( ROTATE == 0 )); then
    # shellcheck source=internal/bootstrap-host-rebuild-keys.sh
    source "${SCRIPT_DIR}/internal/bootstrap-host-rebuild-keys.sh"
    host_key_id_read "$SSH_ALIAS" /root/.aws/credentials "$SOURCE_PROFILE_USER" || exit 1
    rebuild_key_check "$SOURCE_PROFILE_USER" "$HOST_KEY_ID" \
      "scripts/install-host-credentials.sh --target ${TARGET}" "$TARGET" yes || exit 1
  fi
  IAM_KEY_VAULT_NOTES="Long-lived IAM access key for the ${TARGET} source-profile user, the
identity a Lightsail host authenticates as before assuming its runtime
role. Installed at /root/.aws/credentials on that host, root-owned,
alongside the chained profile footbag-${TARGET}-runtime.
Sensitivity: environment-wide, ${TARGET}.
NEVER delete and recreate this user to rotate it: the runtime role's
trust policy resolves to its internal unique id, so a recreated user of
the same name refuses every AssumeRole with no terraform diff.
Rotation: scripts/install-host-credentials.sh --target ${TARGET}, then
--retire <old-id>, then --delete <old-id>."

  # The key library's cleanup decides from how far the key travelled whether an
  # unfinished run may withdraw it, and what it prints is an instruction the
  # operator must see, so a key an unfinished run leaves minted or vaulted is
  # listed in the closing report as well as printed.
  host_key_cleanup() {
    local state="$IAM_KEY_STATE" akid="${IAM_KEY_AKID:-}"
    iam_key_cleanup
    case "$state" in
      minted|vaulted)
        cr_warn "the run stopped with the access key ${akid} ${state}; the lines above say whether it was deleted or kept"
        ;;
    esac
  }
  cr_cleanup host_key_cleanup
  iam_key_provision "$SOURCE_PROFILE_USER" "$VAULT_ENTRY" "$ROTATE" || exit 1
  AKID="$IAM_KEY_AKID"
  SAK="$IAM_KEY_SAK"
fi

# SSH options: parallel to scripts/deploy-code.sh. This script carries AWS
# access keys as well as the sudo password, so an unverified host is the one
# thing it must never connect to.
require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

echo "== installing AWS credential chain on $TARGET (ssh alias: $SSH_ALIAS) =="
# Every session below goes through the client the host check above used, so the
# one carrying the key goes where the confirmed one went, and a stand-in client
# under test is announced by the shared library.
ssh_reachable() {
  "$HOST_SSH_BIN" "${SSH_OPTS[@]}" "$SSH_ALIAS" "echo '    SSH OK'" </dev/null
}
cr_run_marked "ssh to ${SSH_ALIAS}" -- ssh_reachable || exit 1

# The account id is read through the operator's own credentials rather than
# hardcoded, so the script works against any account without editing. Which
# identity those are is settled and proved first: the host chain this installs
# is a different identity and is proved separately, further down.
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"
aws_profile_ensure || exit 1
ACCOUNT_ID=$(aws sts get-caller-identity "${IAM_KEY_AWS_ARGS[@]+"${IAM_KEY_AWS_ARGS[@]}"}" --query Account --output text) \
  || cr_die "could not resolve the AWS account id locally; the aws client's reason is above"
[[ -n "$ACCOUNT_ID" ]] || cr_die "could not resolve the AWS account id locally"

echo "== writing credential files via cat-pipe =="
# The password is the one line read from stdin before the host was confirmed,
# not the whole file. sudo consumes the password line and leaves the rest for
# bash, so forwarding every line the operator credential file holds runs each of
# them as a root shell command on the host. printf emits shell-quoted
# assignments so the remote bash binds them before running the body. The remote
# report helper goes ahead of the body, so the half's problems, the go-live
# marker read among them, are marked on the stream and listed in this report.
send_install() {
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'AKID=%q\n' "$AKID"
    printf 'SAK=%q\n' "$SAK"
    printf 'ACCOUNT_ID=%q\n' "$ACCOUNT_ID"
    printf 'TARGET_ENV=%q\n' "$TARGET"
    printf 'AWS_REGION_VAL=%q\n' "$AWS_REGION_VAL"
    cat "$REMOTE_REPORT_LIB" "$REMOTE_HALF"
  } | "$HOST_SSH_BIN" "${SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'
}
# Judged by both the half's exit and the errors it marked, so a half that marked
# an error and then exited zero still fails here, and no success line follows.
# The credential is not committed on a failed run, so the cleanup reports what
# became of it.
if ! cr_run_marked "credential install on ${SSH_ALIAS}" -- send_install \
     || (( ${#CR_ERRORS[@]} )); then
  echo "" >&2
  echo "FAILED: the credential chain on $SSH_ALIAS is not proven; the closing report below names every error." >&2
  cr_unproved "the host's credential chain on ${TARGET} resolving through the new key, with its go-live marker readable"
  cr_finish
fi
cr_proved "${TARGET}'s host resolves its source and runtime profiles through the installed key, and its go-live marker reads (production) or is absent as designed (staging) (the host half's checks)"

SAK=""
# Delivered and working, so the credential stops being this run's to withdraw.
# Only meaningful on the minted path; harmless on the keys-file one.
iam_key_commit

# Destroy the local copy here rather than telling the operator to. A cleanup
# step a human has to remember is a cleanup step that eventually does not
# happen, and what gets left behind is a live credential in a world-readable
# directory. The secret is already installed and vaulted by this point, so the
# file has no remaining purpose. --keep-keys exists only for the rotation case
# where the same file installs onto more than one host in sequence.
echo
if [[ -z "$KEYS_FILE" ]]; then
  echo "Credential chain installed on $TARGET. Nothing was written to disk on this"
  echo "workstation, so there is nothing to shred."
elif [[ "$KEEP_KEYS" == "yes" ]]; then
  echo "Credential chain installed on $TARGET."
  echo "Keys file retained at operator request; destroy it when done:  shred -u $KEYS_FILE"
else
  secret_file_destroy "$KEYS_FILE"
  echo "Credential chain installed on $TARGET; the local keys file has been destroyed."
fi

echo
echo "Prove the chain from the host, then retire the predecessor if this was a rotation:"
echo "  bash scripts/install-host-credentials.sh --target ${TARGET} \\"
echo "    --retire <old-key-id>"
echo "  bash scripts/install-host-credentials.sh --target ${TARGET} \\"
echo "    --delete <old-key-id>"
if (( ROTATE == 1 )); then
  echo
  echo "This was a rotation. The previous key is still active, deliberately, so"
  echo "nothing on the host stopped. Retire it once you have seen the host working."
fi
cr_finish
