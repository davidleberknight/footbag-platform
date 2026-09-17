#!/usr/bin/env bash
# install-cwagent-staging.sh
#
# MODEL PATTERN: DO NOT FOLD INTO deploy_to_aws.sh.
# This script is the canonical reference for any future production-environment
# CloudWatch Agent installer (e.g. install-cwagent-production.sh). Future
# operators should copy this layout and substitute production-specific values:
# the IAM publisher username, the SSH alias, the SSM parameter scope, and the
# remote-half body. The wire-level pattern (stdin-piped sudo password +
# cat-piped remote-half + variable assignments emitted via printf) is
# argv-leak-safe: password and secrets travel only in unnamed kernel pipes
# (stdin), never in process argv where `ps -ef` readers could capture them.
# Preserve this pattern verbatim.
#
# `sudo -k` invalidates any cached sudo timestamp before the password is read.
# Without it, a host where the operator had recently used sudo would have sudo
# consume no stdin line at all, and the password would fall through to whatever
# reads stdin next: into bash as a command here, or into the target file where
# the consumer writes one. That fall-through is the leak the credential rules
# name; -k closes it rather than depending on the timestamp having expired.
#
# Installs and configures the Amazon CloudWatch Agent on the staging
# Lightsail host. Idempotent: safe to re-run on an already-configured host.
#
# Reads sudo password from stdin (line 1) and pipes it through ssh stdin to
# remote sudo -S. The remote body lives in scripts/internal/install-cwagent-remote.sh
# and is cat'd into the same pipe (no scp; no host-side temp files; no copy
# of this script lives on the host).
#
# The agent's IAM access key is minted, shown for vaulting and disposed of by
# this run rather than by the operator: see scripts/lib/iam-access-key.sh for why
# the whole lifecycle sits on a trap. There is nothing to create beforehand and
# nothing to shred afterwards.
#
# Prerequisites:
#   - ~/.ssh/config alias "footbag-staging" configured with User footbag
#   - terraform/staging applied. The publisher IAM user is declared there, and
#     so is the namespace condition on its write grant, so an install ahead of
#     that apply publishes into a namespace the grant does not allow and every
#     put is refused.
#
# A rotation is three runs, not one, because the operator has a metrics window
# to observe between them and because the retirement is the half that a rotation
# done by hand never reaches. Minting has visible progress; cutting the
# predecessor has none, so a rotation left to memory ends with two live keys.
#
# Usage. The install reads the sudo password from stdin, line 1, and shows the
# new key on the terminal, so it needs a real terminal as well as the redirect:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/install-cwagent-staging.sh
#
# The retire and delete runs touch no host and take no password, so they are run
# plainly:
#   bash scripts/install-cwagent-staging.sh --retire <old-key-id>
#   bash scripts/install-cwagent-staging.sh --delete <old-key-id>
#
# Flags:
#   --rotate         Mint a second key alongside the existing one and install
#                    it. The old key stays active so metrics never stop.
#   --retire <id>    Deactivate the predecessor, but only after proving the
#                    three host metrics are still bound and live. Reversible.
#   --delete <id>    Remove a predecessor that is already inactive. The shared
#                    library refuses this while the key is still active.
#   --profile <p>    AWS profile for the IAM calls; else the identity this run
#                    settles and proves.
#
# Override the SSH alias:
#   DEPLOY_TARGET=footbag-staging ...

set -euo pipefail

PUBLISHER_USER="footbag-staging-cwagent-publisher"
VAULT_ENTRY="aws-footbag-staging-cwagent-publisher"
ENVIRONMENT="staging"

ROTATE=0
AWS_PROFILE_ARG=""
ACTION="install"
OLD_KEY=""

usage() {
  cat <<'EOF'
Usage: < ~/AWS/AWS_OPERATOR.txt bash scripts/install-cwagent-staging.sh [--rotate] [--profile <p>]
   or: bash scripts/install-cwagent-staging.sh --retire <old-key-id> [--profile <p>]
   or: bash scripts/install-cwagent-staging.sh --delete <old-key-id> [--profile <p>]

The install reads the sudo password from stdin (line 1) and shows the new access
key on the terminal, so it needs both the redirect and an interactive shell. The
retire and delete runs reach no host and take no password.

  --rotate       mint a second key alongside the existing one and install it
  --retire <id>  deactivate the predecessor, once the metrics check passes
  --delete <id>  delete a predecessor that is already inactive
  --profile <p>  AWS profile for the IAM calls; else the identity this run proves

Override the SSH target:
  DEPLOY_TARGET=footbag-staging ...
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rotate) ROTATE=1; shift ;;
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
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$ACTION" != "install" && -z "$OLD_KEY" ]]; then
  echo "ERROR: --${ACTION} needs the id of the key to ${ACTION}." >&2
  exit 2
fi
if [[ "$ACTION" != "install" && "$ROTATE" == "1" ]]; then
  echo "ERROR: --rotate mints a key and --${ACTION} cuts one; they are separate" >&2
  echo "       runs with a metrics window between them, not one command." >&2
  exit 2
fi

# Only the install carries a credential to a host. Demanding the redirect on the
# retire runs would make the operator point a password file at a command that
# has no use for one, which is how a password ends up answering a prompt.
if [[ "$ACTION" == "install" && -t 0 ]]; then
  echo "ERROR: must receive sudo password on stdin." >&2
  echo "       Run via: < ~/AWS/AWS_OPERATOR.txt bash scripts/install-cwagent-staging.sh" >&2
  echo "" >&2
  usage >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${DEPLOY_TARGET:-footbag-staging}"
REMOTE_HALF="${SCRIPT_DIR}/internal/install-cwagent-remote.sh"
VERIFY_METRICS="${SCRIPT_DIR}/verify-cwagent-metrics.sh"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/iam-access-key.sh
source "${SCRIPT_DIR}/lib/iam-access-key.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote-half: $REMOTE_HALF" >&2; exit 1; }

if [[ -n "$AWS_PROFILE_ARG" ]]; then
  IAM_KEY_AWS_ARGS=(--profile "$AWS_PROFILE_ARG")
else
  # No profile named on the command line, so the identity is the one the shared
  # library settles and proves: whatever this shell already carries, or the
  # operator profile. This is the workstation half, which mints the key; the
  # host's own chain is a separate identity and is proved separately.
  # shellcheck source=lib/aws-profile.sh
  source "${SCRIPT_DIR}/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi

# What the vault entry says this credential is, printed under Notes. The
# library holds no knowledge of any particular identity, so the description
# travels with the caller that knows it.
IAM_KEY_VAULT_NOTES="Long-lived IAM access key for the CloudWatch agent, which runs in
on-premises mode because a Lightsail host has no instance role and
the agent does not follow the source-profile chain. Installed at
/etc/amazon-cloudwatch-agent.aws/credentials, root-owned, mode 0600.
Sensitivity: narrow-service.
Rotation: re-run the installer with --rotate, then --retire <old-id>,
then --delete <old-id>, which is the order that keeps metrics flowing
throughout. The installer proves the metrics itself before it retires
anything, so no step of that depends on anyone remembering it."

# ── Retirement ───────────────────────────────────────────────────────────────
#
# Neither of these reaches the host, so they run before the SSH options and the
# reachability probe: a key retirement has nothing to do with whether the host
# is answering, and failing it on an unreachable host would leave a rotation
# stuck halfway with two live keys.
#
# The evidence is the point. "The agent is running" does not prove the new
# credential is the one publishing, and the alarms bind to an exact namespace,
# metric name and dimension set that a running agent can miss entirely. The
# verification script is the only thing in the tree that asserts the binding and
# the liveness together, so the retirement is conditioned on it rather than on
# the operator having run it earlier and remembered the result.
if [[ "$ACTION" != "install" ]]; then
  VERIFY_ARGS=(--target "$ENVIRONMENT")
  [[ -n "$AWS_PROFILE_ARG" ]] && VERIFY_ARGS+=(--profile "$AWS_PROFILE_ARG")

  case "$ACTION" in
    retire)
      echo "==> Proving the metrics still bind and are live before retiring ${OLD_KEY}"
      [[ -x "$VERIFY_METRICS" || -r "$VERIFY_METRICS" ]] || {
        echo "ERROR: missing ${VERIFY_METRICS}, which is the evidence this run" >&2
        echo "       requires. Nothing retired." >&2
        exit 1
      }
      if ! bash "$VERIFY_METRICS" "${VERIFY_ARGS[@]}"; then
        echo "" >&2
        echo "ERROR: the host metrics are not bound and live, so the replacement" >&2
        echo "       key has not been shown to be the one publishing. Retiring" >&2
        echo "       the predecessor now is how monitoring goes quiet without" >&2
        echo "       anyone noticing. Nothing retired." >&2
        exit 1
      fi
      echo ""
      echo "Deactivating ${OLD_KEY} on ${PUBLISHER_USER}. Reversible: a deactivated"
      echo "key can be switched back on if something turns out to have depended on it."
      if ! confirm_from_tty "Type 'APPLY' to deactivate it: " "APPLY"; then
        echo "Not confirmed; the key is untouched." >&2
        exit 1
      fi
      iam_key_retire "$PUBLISHER_USER" "$OLD_KEY" deactivate || exit 1
      echo ""
      echo "Observe before deleting. Anything still holding the old key now fails"
      echo "visibly rather than silently, which is the point of the window."
      echo "Then:  bash scripts/install-cwagent-${ENVIRONMENT}.sh --delete ${OLD_KEY}"
      exit 0
      ;;
    delete)
      echo "==> Deleting ${OLD_KEY} on ${PUBLISHER_USER}"
      echo "Not reversible, and the key id is never reissued. The library refuses"
      echo "this unless the key is already inactive."
      if ! confirm_from_tty "Type 'APPLY' to delete it: " "APPLY"; then
        echo "Not confirmed; the key is untouched." >&2
        exit 1
      fi
      iam_key_retire "$PUBLISHER_USER" "$OLD_KEY" delete || exit 1
      echo ""
      echo "Record the rotation date on the vault entry: the evidence-driven"
      echo "rotation rule reads that date rather than a calendar."
      exit 0
      ;;
  esac
fi

# SSH options: parallel to scripts/deploy-code.sh.
require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

# Reachability is proved before a credential exists, so an unreachable host
# costs nothing more than a wasted trip.
echo "==> Deploy target: $REMOTE"
ssh "${SSH_OPTS[@]}" "$REMOTE" "echo '    SSH OK'" </dev/null

trap iam_key_cleanup EXIT INT TERM
iam_key_provision "$PUBLISHER_USER" "$VAULT_ENTRY" "$ROTATE" || exit 1

echo "==> Running remote-as-root cwagent install via cat-pipe..."
# Exactly ONE line is read from stdin, not the whole file. `cat` here forwarded
# every line the operator credential file held, and sudo consumes only the first:
# any second line was inherited by the remote bash and executed as a root shell
# command. The shared helper reads one line for the same reason; this script is
# named by the rule as the model wire pattern, so it has to match it.
#
# printf lines emit shell-quoted variable assignments so the remote bash binds
# CWAGENT_AKID and CWAGENT_SAK before running the body. cat <body> appends
# the remote-half. Combined stream -> ssh stdin -> remote sudo -S consumes the
# password line -> bash inherits the rest, runs the assignments, then the body.
# Argv stays clean of secrets on every hop. This host keeps the remote-half's
# default namespace, which production deliberately overrides.
IFS= read -r SUDO_PASS
{
  printf '%s\n' "$SUDO_PASS"
  printf 'CWAGENT_AKID=%q\n' "$IAM_KEY_AKID"
  printf 'CWAGENT_SAK=%q\n' "$IAM_KEY_SAK"
  cat "$REMOTE_HALF"
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

iam_key_commit

echo
echo "CloudWatch Agent install complete on $REMOTE."
echo
echo "Next, and before arming anything, prove the metrics bind to the alarms:"
echo "  scripts/verify-cwagent-metrics.sh --target staging"
if (( ROTATE == 1 )); then
  echo
  echo "This was a rotation. The previous key is still active, deliberately, so"
  echo "metrics never stopped. Deactivate and delete it once that check passes."
fi
