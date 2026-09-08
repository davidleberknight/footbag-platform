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
# this run rather than by the operator: see scripts/lib/cwagent-key.sh for why
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
# Usage. Reads the sudo password from stdin, line 1, and shows the new key on
# the terminal, so it needs a real terminal as well as the redirect:
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/install-cwagent-staging.sh
#
# Flags:
#   --rotate         Mint a second key alongside the existing one and install
#                    it. The old key stays active so metrics never stop;
#                    deactivate and delete it once the verification script
#                    passes.
#   --profile <p>    AWS profile for the IAM calls; else ambient AWS_PROFILE.
#
# Override the SSH alias:
#   DEPLOY_TARGET=footbag-staging ...

set -euo pipefail

PUBLISHER_USER="footbag-staging-cwagent-publisher"
VAULT_ENTRY="aws-footbag-staging-cwagent-publisher"

ROTATE=0
AWS_PROFILE_ARG=""

usage() {
  cat <<'EOF'
Usage: < ~/AWS/AWS_OPERATOR.txt bash scripts/install-cwagent-staging.sh [--rotate] [--profile <p>]

Reads the sudo password from stdin (line 1) and shows the new access key on the
terminal, so it needs both the redirect and an interactive shell.

  --rotate       mint a second key alongside the existing one and install it
  --profile <p>  AWS profile for the IAM calls; else ambient AWS_PROFILE

Override the SSH target:
  DEPLOY_TARGET=footbag-staging ...
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rotate) ROTATE=1; shift ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --help|-h) usage; exit 2 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -t 0 ]]; then
  echo "ERROR: must receive sudo password on stdin." >&2
  echo "       Run via: < ~/AWS/AWS_OPERATOR.txt bash scripts/install-cwagent-staging.sh" >&2
  echo "" >&2
  usage >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${DEPLOY_TARGET:-footbag-staging}"
REMOTE_HALF="${SCRIPT_DIR}/internal/install-cwagent-remote.sh"

# shellcheck source=lib/ssh-known-hosts.sh
source "${SCRIPT_DIR}/lib/ssh-known-hosts.sh"
# shellcheck source=lib/cwagent-key.sh
source "${SCRIPT_DIR}/lib/cwagent-key.sh"

[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote-half: $REMOTE_HALF" >&2; exit 1; }

[[ -n "$AWS_PROFILE_ARG" ]] && CWAGENT_KEY_AWS_ARGS=(--profile "$AWS_PROFILE_ARG")

# SSH options: parallel to scripts/deploy-code.sh.
require_pinned_known_hosts || exit 1
SSH_OPTS=("${FOOTBAG_SSH_PIN_OPTS[@]}" -o "ConnectTimeout=10" -o "ServerAliveInterval=30")

# Reachability is proved before a credential exists, so an unreachable host
# costs nothing more than a wasted trip.
echo "==> Deploy target: $REMOTE"
ssh "${SSH_OPTS[@]}" "$REMOTE" "echo '    SSH OK'" </dev/null

trap cwagent_key_cleanup EXIT INT TERM
cwagent_key_provision "$PUBLISHER_USER" "$VAULT_ENTRY" "$ROTATE" || exit 1

echo "==> Running remote-as-root cwagent install via cat-pipe..."
# cat reads our stdin (password line, supplied by the wrapper or operator).
# printf lines emit shell-quoted variable assignments so the remote bash binds
# CWAGENT_AKID and CWAGENT_SAK before running the body. cat <body> appends
# the remote-half. Combined stream -> ssh stdin -> remote sudo -S consumes the
# password line -> bash inherits the rest, runs the assignments, then the body.
# Argv stays clean of secrets on every hop. This host keeps the remote-half's
# default namespace, which production deliberately overrides.
{
  cat
  printf 'CWAGENT_AKID=%q\n' "$CWAGENT_AKID"
  printf 'CWAGENT_SAK=%q\n' "$CWAGENT_SAK"
  cat "$REMOTE_HALF"
} | ssh "${SSH_OPTS[@]}" "$REMOTE" 'sudo -k -S -p "" bash'

cwagent_key_commit

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
