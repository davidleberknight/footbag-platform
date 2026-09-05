#!/usr/bin/env bash
# install-host-credentials.sh
#
# Installs the AWS credential chain on a deployed host: the source-profile
# access key plus the runtime profile that assumes the application's runtime
# role. Idempotent; safe to re-run, and re-running is how a key is rotated.
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
# Prerequisites:
#   - terraform applied for the target environment (creates the source-profile
#     user, the runtime role, and the logs-publisher role)
#   - an access key issued for footbag-<target>-source-profile, saved to a file.
#     The umask is scoped to the subshell so the restriction covers this one
#     redirect and cannot outlive it. A umask left set in the operator's shell
#     makes every later write in that shell owner-only, including writes into a
#     repository, where git records only the executable bit and so cannot show
#     the divergence to anyone downstream:
#       (umask 077 && aws iam create-access-key \
#         --user-name footbag-production-source-profile > /tmp/prod-sp-keys.json)
#   - that key recorded in the vault before it is installed anywhere
#   - jq available locally
#
# Usage:
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt \
#     bash scripts/install-host-credentials.sh --target production /tmp/prod-sp-keys.json
#
#   Then shred the keys file:  shred -u /tmp/prod-sp-keys.json
#
# The logs-publisher profile is not installed here. The deploy owns that stanza
# and appends it itself, so this script never competes with it.

set -euo pipefail

TARGET="staging"
SSH_ALIAS=""
KEYS_FILE=""
KEEP_KEYS="no"

usage() {
  cat <<'EOF'
Usage: < ~/AWS/AWS_OPERATOR.txt bash scripts/install-host-credentials.sh --target staging <keys-file>
   or: < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/install-host-credentials.sh --target production <keys-file>

  --target <staging|production>   deployed environment to install onto
  --ssh-alias <name>              override the default footbag-<target> alias
  --keep-keys                     do not shred the keys file after installing
                                  (for installing one key onto several hosts)
  <keys-file>                     JSON from `aws iam create-access-key` for
                                  the footbag-<target>-source-profile user

Reads the host sudo password from stdin (line 1).
Shreds the keys file on success unless --keep-keys is given.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --ssh-alias)
      SSH_ALIAS="${2:-}"
      shift 2 || { echo "ERROR: --ssh-alias requires an argument" >&2; exit 2; }
      ;;
    --keep-keys)
      KEEP_KEYS="yes"; shift
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

case "$TARGET" in
  staging|production) ;;
  *)
    echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2
    exit 2
    ;;
esac

[[ -n "$SSH_ALIAS" ]] || SSH_ALIAS="footbag-$TARGET"

if [[ -t 0 ]]; then
  echo "ERROR: must receive the host sudo password on stdin." >&2
  if [[ "$TARGET" == "production" ]]; then
    echo "       Run via: < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/install-host-credentials.sh --target $TARGET <keys-file>" >&2
  else
    echo "       Run via: < ~/AWS/AWS_OPERATOR.txt bash scripts/install-host-credentials.sh --target $TARGET <keys-file>" >&2
  fi
  echo "" >&2
  usage >&2
  exit 1
fi

[[ -n "$KEYS_FILE" ]] || { echo "ERROR: a keys file is required" >&2; usage >&2; exit 2; }
[[ -r "$KEYS_FILE" ]] || { echo "ERROR: cannot read keys file: $KEYS_FILE" >&2; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq is required locally" >&2; exit 1; }

# Reject a world-readable keys file. The instructions above scope `umask 077` to
# the create-access-key subshell; this catches the case where it was missed and
# the file was written with the default mode. The window between issuing the key
# and shredding the file is when a co-tenant on a shared workstation could read it.
KEYS_PERMS=$(stat -c '%a' "$KEYS_FILE")
if [[ "$KEYS_PERMS" != "600" && "$KEYS_PERMS" != "400" ]]; then
  echo "ERROR: $KEYS_FILE has mode $KEYS_PERMS; expected 600 (or 400)." >&2
  echo "       Re-create it with:  (umask 077 && aws iam create-access-key ... > $KEYS_FILE)" >&2
  echo "       Then shred the current file, and treat the key it holds as exposed." >&2
  exit 1
fi

AKID=$(jq -r '.AccessKey.AccessKeyId // empty' "$KEYS_FILE")
SAK=$(jq -r '.AccessKey.SecretAccessKey // empty' "$KEYS_FILE")
if [[ -z "$AKID" || -z "$SAK" ]]; then
  echo "ERROR: $KEYS_FILE does not contain .AccessKey.AccessKeyId / .SecretAccessKey" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HALF="${SCRIPT_DIR}/internal/install-host-credentials-remote.sh"
[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote half: $REMOTE_HALF" >&2; exit 1; }

AWS_REGION_VAL="${AWS_REGION:-us-east-1}"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"

# SSH options: parallel to scripts/deploy-code.sh. This script carries AWS
# access keys as well as the sudo password, so an unverified host is the one
# thing it must never connect to.
require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

echo "== installing AWS credential chain on $TARGET (ssh alias: $SSH_ALIAS) =="
ssh "${SSH_OPTS[@]}" "$SSH_ALIAS" "echo '    SSH OK'" </dev/null

# The account id is read through the operator's own credentials rather than
# hardcoded, so the script works against any account without editing.
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
[[ -n "$ACCOUNT_ID" ]] || { echo "ERROR: could not resolve the AWS account id locally" >&2; exit 1; }

echo "== writing credential files via cat-pipe =="
# cat reads our stdin (the sudo password line). printf emits shell-quoted
# assignments so the remote bash binds them before running the body. The
# combined stream reaches remote sudo -S, which consumes the password line and
# leaves the rest for bash.
{
  cat
  printf 'AKID=%q\n' "$AKID"
  printf 'SAK=%q\n' "$SAK"
  printf 'ACCOUNT_ID=%q\n' "$ACCOUNT_ID"
  printf 'TARGET_ENV=%q\n' "$TARGET"
  printf 'AWS_REGION_VAL=%q\n' "$AWS_REGION_VAL"
  cat "$REMOTE_HALF"
} | ssh "${SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'

# Destroy the local copy here rather than telling the operator to. A cleanup
# step a human has to remember is a cleanup step that eventually does not
# happen, and what gets left behind is a live credential in a world-readable
# directory. The secret is already installed and vaulted by this point, so the
# file has no remaining purpose. --keep-keys exists only for the rotation case
# where the same file installs onto more than one host in sequence.
if [[ "$KEEP_KEYS" == "yes" ]]; then
  echo
  echo "Credential chain installed on $TARGET."
  echo "Keys file retained at operator request; destroy it when done:  shred -u $KEYS_FILE"
else
  shred -u "$KEYS_FILE" 2>/dev/null || rm -f "$KEYS_FILE"
  echo
  echo "Credential chain installed on $TARGET; the local keys file has been shredded."
fi
