#!/usr/bin/env bash
# activate-ses-feedback.sh
#
# One-shot provisioning of the SES feedback-webhook key for a deployed host,
# so activating the bounce/complaint feedback loop never depends on the
# operator remembering raw commands:
#
#   1. Stage /srv/footbag/env down from the host (ssh -t + interactive sudo
#      install; the password is typed directly into sudo's noecho prompt,
#      never piped, captured, or logged).
#   2. Refuse if SES_FEEDBACK_WEBHOOK_KEY is already set (a live key means an
#      SNS subscription may depend on it); pass --rotate to replace it, which
#      requires re-running the terraform apply so SNS re-subscribes.
#   3. Generate a fresh key (openssl rand -hex 32), distinct by construction
#      and by check from INTERNAL_EVENT_SECRET: the key travels in the SNS
#      subscription URL's query string, where access logs capture it, so a
#      leak there must never extend to the worker IPC endpoints.
#   4. Rewrite the env file (replace-or-append, duplicates collapsed), show a
#      key-masked diff, confirm, push back with a .bak kept on the host.
#   5. Print the exact ses_feedback_webhook_url terraform value ONCE, plus
#      the remaining human steps: terraform plan/apply (human-reviewed by
#      project rule), the one-time SNS SubscribeURL confirmation (the app
#      records it in an audit row and never auto-fetches it), and the env
#      verifier.
#
# The runtime requires this key only when SES_ADAPTER=live, so this script
# is part of live-email activation; running it against a stub-SES host is
# harmless but pointless.
#
# Usage:
#   scripts/activate-ses-feedback.sh --target production
#   scripts/activate-ses-feedback.sh --target staging --ssh-alias my-host
#   scripts/activate-ses-feedback.sh --target staging --rotate
#
# Synthetic mode (CI tests only; operators never use this):
#   --env-file <path> treats the local file as the host env and skips ssh.
set -euo pipefail

TARGET="staging"
SSH_ALIAS=""
ENV_FILE_OVERRIDE=""
ROTATE=0
HOST_ENV_PATH="/srv/footbag/env"

usage() {
  sed -n '2,37p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
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
    --env-file)
      ENV_FILE_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --env-file requires an argument" >&2; exit 2; }
      ;;
    --rotate)
      ROTATE=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
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

if [[ -z "$SSH_ALIAS" ]]; then
  SSH_ALIAS="footbag-$TARGET"
fi

# -----------------------------------------------------------------------------
# Step 1: fetch the host env file (or use the local override).
# -----------------------------------------------------------------------------
if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  if [[ ! -f "$ENV_FILE_OVERRIDE" ]]; then
    echo "ERROR: --env-file path '$ENV_FILE_OVERRIDE' does not exist" >&2
    exit 2
  fi
  OLD_LOCAL="$ENV_FILE_OVERRIDE"
else
  LOCAL_PID=$$
  TMP_REMOTE="/tmp/footbag-env-sesfb-${LOCAL_PID}.env"
  cleanup_remote() {
    ssh -o BatchMode=yes "$SSH_ALIAS" "rm -f $TMP_REMOTE" 2>/dev/null || true
    rm -f "${OLD_LOCAL:-}" "${NEW_LOCAL:-}" 2>/dev/null || true
  }
  trap cleanup_remote EXIT INT TERM

  echo ""
  echo "Staging $HOST_ENV_PATH from $SSH_ALIAS via sudo install."
  echo "You will be prompted for your sudo password on this terminal."
  echo "The password is typed directly into sudo; it is NOT captured, NOT echoed, and NOT logged."
  echo ""
  if ! ssh -t "$SSH_ALIAS" "OP=\$(whoami); GROUP=\$(id -gn); sudo install -m 0600 -o \"\$OP\" -g \"\$GROUP\" $HOST_ENV_PATH $TMP_REMOTE"; then
    echo "ERROR: failed to stage $HOST_ENV_PATH on $SSH_ALIAS." >&2
    exit 1
  fi
  umask 077
  OLD_LOCAL="$(mktemp /tmp/footbag-env-sesfb-old.XXXXXX)"
  ssh -o BatchMode=yes "$SSH_ALIAS" "cat $TMP_REMOTE" > "$OLD_LOCAL" || {
    echo "ERROR: staged temp file $TMP_REMOTE was unreadable on $SSH_ALIAS." >&2
    exit 1
  }
fi

# -----------------------------------------------------------------------------
# Step 2: guards against clobbering a live key or colliding secrets.
# -----------------------------------------------------------------------------
EXISTING_KEY="$(grep -E '^SES_FEEDBACK_WEBHOOK_KEY=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
if [[ -n "$EXISTING_KEY" && "$ROTATE" -ne 1 ]]; then
  echo "REFUSING: SES_FEEDBACK_WEBHOOK_KEY is already set on $TARGET." >&2
  echo "A live key may back the current SNS subscription. To replace it, run" >&2
  echo "again with --rotate, then re-apply terraform so SNS re-subscribes" >&2
  echo "with the new URL." >&2
  exit 1
fi

INTERNAL_SECRET="$(grep -E '^INTERNAL_EVENT_SECRET=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
NEW_KEY="$(openssl rand -hex 32)"
if [[ -n "$INTERNAL_SECRET" && "$NEW_KEY" == "$INTERNAL_SECRET" ]]; then
  echo "ERROR: generated key collided with INTERNAL_EVENT_SECRET; run again." >&2
  exit 1
fi

PUBLIC_BASE_URL="$(grep -E '^PUBLIC_BASE_URL=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
if [[ -z "$PUBLIC_BASE_URL" ]]; then
  echo "ERROR: PUBLIC_BASE_URL is not set in the host env file; cannot compose the webhook URL." >&2
  exit 1
fi
WEBHOOK_URL="${PUBLIC_BASE_URL%/}/webhooks/ses-feedback?key=${NEW_KEY}"

# -----------------------------------------------------------------------------
# Step 3: rewrite (replace-or-append, duplicates collapsed), masked diff,
# confirm, push back. The key travels via the environment, not argv, so it
# never appears in the process table.
# -----------------------------------------------------------------------------
umask 077
NEW_LOCAL="$(mktemp /tmp/footbag-env-sesfb-new.XXXXXX)"
FK_VALUE="$NEW_KEY" awk '
  BEGIN { seen = 0 }
  /^SES_FEEDBACK_WEBHOOK_KEY=/ {
    if (!seen) { print "SES_FEEDBACK_WEBHOOK_KEY=" ENVIRON["FK_VALUE"]; seen = 1 }
    next
  }
  { print }
  END {
    if (!seen) print "SES_FEEDBACK_WEBHOOK_KEY=" ENVIRON["FK_VALUE"]
  }
' "$OLD_LOCAL" > "$NEW_LOCAL"

mask() {
  sed 's/^SES_FEEDBACK_WEBHOOK_KEY=.*/SES_FEEDBACK_WEBHOOK_KEY=********/' "$1"
}

echo ""
echo "Env file change (key masked):"
diff -u <(mask "$OLD_LOCAL") <(mask "$NEW_LOCAL") || true
echo ""

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$NEW_LOCAL" "$ENV_FILE_OVERRIDE"
  rm -f "$NEW_LOCAL"
else
  printf "Push this change to %s on %s? (yes/no): " "$HOST_ENV_PATH" "$SSH_ALIAS"
  read -r PUSH_CONFIRM
  if [[ "$PUSH_CONFIRM" != "yes" ]]; then
    echo "Aborted: env file not pushed; nothing changed on the host." >&2
    exit 1
  fi
  if ! scp -q "$NEW_LOCAL" "$SSH_ALIAS:$TMP_REMOTE"; then
    echo "ERROR: failed to copy the rewritten env file to $SSH_ALIAS." >&2
    exit 1
  fi
  echo "Installing the rewritten env file via sudo (a .bak of the previous file is kept)..."
  if ! ssh -t "$SSH_ALIAS" "sudo bash -c 'cp -p $HOST_ENV_PATH $HOST_ENV_PATH.bak && install -m 0600 -o root -g root $TMP_REMOTE $HOST_ENV_PATH'"; then
    echo "ERROR: failed to install the rewritten env file on $SSH_ALIAS." >&2
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# Step 4: print the terraform value once, then the remaining human steps.
# -----------------------------------------------------------------------------
echo ""
echo "== SES feedback-webhook key installed on $TARGET =="
echo ""
echo "Set this terraform variable (sensitive; operator-local tfvars only,"
echo "never committed). Shown only this once:"
echo ""
echo "  ses_feedback_webhook_url = \"${WEBHOOK_URL}\""
echo ""
echo "Remaining steps (human by design):"
echo "  1. terraform -chdir=terraform/${TARGET} plan    (review the subscription change)"
echo "  2. terraform -chdir=terraform/${TARGET} apply"
echo "  3. Confirm the SNS subscription once. The app records the SubscribeURL"
echo "     in an audit row and never fetches it itself:"
echo "       sqlite3 <db path> \"SELECT metadata_json FROM audit_entries"
echo "         WHERE action_type = 'email.sns_subscription_pending'"
echo "         ORDER BY created_at DESC LIMIT 1;\""
echo "  4. scripts/verify-staging-env.sh --target ${TARGET}"
echo "  5. Restart or redeploy so the running containers pick up the new env."
