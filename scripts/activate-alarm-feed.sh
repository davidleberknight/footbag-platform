#!/usr/bin/env bash
# activate-alarm-feed.sh
#
# One-shot provisioning of the platform-alarm webhook key for a deployed host,
# so pointing the monitoring service's alarm topic at the application never
# depends on the operator remembering raw commands. It is the alarm feed's
# counterpart to activate-ses-feedback.sh and follows the same wire pattern:
#
#   1. Read /srv/footbag/env down from the host through the shared wire in
#      lib/host-env-remote.sh: the sudo password is line one of the ssh stdin
#      stream and the root-side body follows it, so nothing secret reaches an
#      argument list and the host is left holding no copy to clean up.
#   2. Refuse if ALARM_TOPIC_ARN is unset. The feed authenticates on the key
#      AND the publishing topic, so a key with no expected topic produces an
#      endpoint that refuses every delivery while looking merely quiet. That
#      ARN is non-secret and belongs to scripts/set-host-env.sh, which reads it
#      from the Terraform output rather than accepting a typed value.
#   3. Refuse if ALARM_WEBHOOK_KEY is already set (a live key may back an SNS
#      subscription); pass --rotate to replace it, which requires re-running
#      the terraform apply so SNS re-subscribes with the new URL.
#   4. Generate a fresh key (openssl rand -hex 32), distinct by construction
#      and by check from INTERNAL_EVENT_SECRET and from the SES feedback key:
#      this key travels in the SNS subscription URL's query string, where
#      access logs capture it, so a leak there must reach nothing else.
#   5. Rewrite the env file (replace-or-append, duplicates collapsed), show a
#      key-masked diff, confirm, push back.
#   6. Print the exact alarm_webhook_url terraform value ONCE, plus the
#      remaining human steps.
#
# Until this runs, the endpoint refuses every delivery quietly and alarms still
# reach the operator mailbox through the topic's email subscription, so an
# un-activated feed loses the admin surface, not the alerting.
#
# Usage (the sudo password is read from stdin, line 1):
#   < <operator credential file> bash scripts/activate-alarm-feed.sh --target production
#   < <operator credential file> bash scripts/activate-alarm-feed.sh --target staging --ssh-alias my-host
#   < <operator credential file> bash scripts/activate-alarm-feed.sh --target staging --rotate
#
# --yes accepts the push confirmation instead of asking for it, the same way the
# deploy wrapper's -y does, so this can run where there is no terminal to type
# into. The key-masked diff is still printed.
#
# The generated URL is written straight into the environment's terraform values
# file rather than printed for the operator to copy: it is a live secret, and a
# value shown on screen so a human can paste it has already passed through a
# terminal, a scrollback buffer and a clipboard to reach a file the script could
# have written. The only requirement on that file is that git cannot pick it up:
# a path outside the tree, or one gitignored inside it (`*.tfvars` is). Nothing
# here needs the maintainers' private checkout; a machine holding only a local
# credential file can run this.
#   --tfvars <path>  write to this values file instead of the default
#   --no-tfvars      do not write it; print the value as before
#
# --show-confirmation reads the pending subscription's one-time confirmation URL
# back out of the host's application log and prints it for you to open. It
# generates and installs nothing. The URL is a bearer token the application
# deliberately keeps out of the audit trail, so retrieving it is a scripted step
# rather than an operator typing `docker logs | grep` at a deployed host. It
# prints the URL and does not open it: the application refuses to fetch that URL
# itself because a forged confirmation makes it attacker-chosen, and a script
# that fetched it would reintroduce exactly that.
#
# Synthetic mode (CI tests only; operators never use this):
#   --env-file <path> treats the local file as the host env and skips ssh.
set -euo pipefail

# shellcheck source=lib/host-env-remote.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/host-env-remote.sh"

TARGET="staging"
SSH_ALIAS=""
ENV_FILE_OVERRIDE=""
ROTATE=0
HOST_ENV_PATH="/srv/footbag/env"
TFVARS_OVERRIDE=""
WRITE_TFVARS=1
SHOW_CONFIRMATION=0
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
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
    --yes)
      ASSUME_YES="yes"
      shift
      ;;
    --show-confirmation)
      SHOW_CONFIRMATION=1
      shift
      ;;
    --tfvars)
      TFVARS_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --tfvars requires a path" >&2; exit 2; }
      ;;
    --no-tfvars)
      WRITE_TFVARS=0
      shift
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
# --show-confirmation: read the pending subscription's one-time URL back.
#
# Separate mode, and it returns before any key is generated or installed: this
# reads, it does not activate. The URL is a bearer token that the application
# deliberately keeps out of the audit trail and surfaces on its log line, so
# retrieving it is a scripted step here rather than an operator typing
# `docker logs | grep` at a deployed host.
#
# It prints the URL for a human to open and does not open it. The application
# refuses to fetch that URL itself because a forged confirmation makes it
# attacker-chosen; a script that fetched it automatically would reintroduce
# exactly that, one layer out.
# -----------------------------------------------------------------------------
if (( SHOW_CONFIRMATION )); then
  require_operator_stdin "scripts/activate-alarm-feed.sh --target $TARGET --show-confirmation" || exit 1
  require_ssh_alias "$SSH_ALIAS" || exit 1

  LINE="$(host_log_tail "$SSH_ALIAS" 'alarm_feed.subscription_confirmation_pending')" || {
    echo "" >&2
    echo "No pending confirmation found in the application log on ${SSH_ALIAS}." >&2
    echo "Either none is outstanding, or the containers were replaced since it arrived." >&2
    echo "The same line is in CloudWatch under /footbag/${TARGET}/app; failing that," >&2
    echo "recreate the subscription to have a fresh confirmation sent:" >&2
    echo "  terraform -chdir=terraform/${TARGET} apply -replace='aws_sns_topic_subscription.alarm_webhook[0]'" >&2
    exit 1
  }

  URL="$(printf '%s' "$LINE" | grep -oE '"subscribeUrl":"[^"]*"' | head -1 | cut -d'"' -f4)"
  if [[ -z "$URL" ]]; then
    echo "ERROR: found the log line but could not read a subscribeUrl from it." >&2
    exit 1
  fi
  if [[ "$URL" == "(rejected)" ]]; then
    echo "ERROR: the application refused to log that URL." >&2
    echo "       It logs one only when it is genuinely an HTTPS SNS endpoint and" >&2
    echo "       within a length bound. This is a real refusal, not a formatting" >&2
    echo "       quirk: either the confirmation was forged, or the length bound in" >&2
    echo "       src/lib/snsSignature.ts is below what this region actually sends." >&2
    exit 1
  fi

  echo ""
  echo "== Pending subscription confirmation on $TARGET =="
  echo ""
  echo "Open this once, in a browser or with curl. It is a single-use token and"
  echo "it expires; nothing else can confirm the subscription."
  echo ""
  echo "  $URL"
  echo ""
  echo "Then check it took:"
  echo "  aws sns list-subscriptions-by-topic --topic-arn <alarm topic arn> \\"
  echo "    --query \"Subscriptions[?Protocol=='https'].SubscriptionArn\" --output text"
  echo "It should read an ARN rather than PendingConfirmation."
  exit 0
fi

# -----------------------------------------------------------------------------
# Step 1: fetch the host env file (or use the local override).
# -----------------------------------------------------------------------------
OLD_LOCAL=""
NEW_LOCAL=""
OLD_LOCAL_OWNED=0

# Only local copies need destroying: the wire leaves nothing on the host. The
# new copy is always this script's own, so it always goes; the old copy is this
# script's only when it fetched one, because under --env-file it is the caller's
# own file and shredding that would destroy their input. Registered before
# either copy exists, so no exit path can outrun it.
cleanup_local() {
  shred -u "${NEW_LOCAL:-}" 2>/dev/null || true
  if [[ "$OLD_LOCAL_OWNED" == "1" ]]; then
    shred -u "${OLD_LOCAL:-}" 2>/dev/null || true
  fi
  return 0
}
trap cleanup_local EXIT INT TERM

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  if [[ ! -f "$ENV_FILE_OVERRIDE" ]]; then
    echo "ERROR: --env-file path '$ENV_FILE_OVERRIDE' does not exist" >&2
    exit 2
  fi
  OLD_LOCAL="$ENV_FILE_OVERRIDE"
else
  require_operator_stdin "scripts/activate-alarm-feed.sh --target $TARGET" || exit 1
  require_ssh_alias "$SSH_ALIAS" || exit 1

  OLD_LOCAL_OWNED=1
  umask 077
  OLD_LOCAL="$(mktemp /tmp/footbag-env-alarm-old.XXXXXX)"
  echo ""
  echo "Reading $HOST_ENV_PATH from $SSH_ALIAS."
  host_env_fetch "$SSH_ALIAS" "$OLD_LOCAL" "" "$HOST_ENV_PATH" || exit 1
fi

# -----------------------------------------------------------------------------
# Step 2: guards. The topic must already be set, and a live key is not clobbered.
# -----------------------------------------------------------------------------
EXISTING_TOPIC_ARN="$(grep -E '^ALARM_TOPIC_ARN=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
if [[ -z "$EXISTING_TOPIC_ARN" ]]; then
  echo "ERROR: ALARM_TOPIC_ARN is not set on $TARGET, so the feed would refuse every delivery." >&2
  echo "       Run: scripts/set-host-env.sh --target $TARGET   (then re-run this script)" >&2
  exit 1
fi

EXISTING_KEY="$(grep -E '^ALARM_WEBHOOK_KEY=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
if [[ -n "$EXISTING_KEY" && "$ROTATE" -ne 1 ]]; then
  echo "REFUSING: ALARM_WEBHOOK_KEY is already set on $TARGET." >&2
  echo "A live key may back the current SNS subscription. To replace it, run" >&2
  echo "again with --rotate, then re-apply terraform so SNS re-subscribes" >&2
  echo "with the new URL." >&2
  exit 1
fi

INTERNAL_SECRET="$(grep -E '^INTERNAL_EVENT_SECRET=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
SES_FEEDBACK_KEY="$(grep -E '^SES_FEEDBACK_WEBHOOK_KEY=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
NEW_KEY="$(openssl rand -hex 32)"
if [[ -n "$INTERNAL_SECRET" && "$NEW_KEY" == "$INTERNAL_SECRET" ]]; then
  echo "ERROR: generated key collided with INTERNAL_EVENT_SECRET; run again." >&2
  exit 1
fi
if [[ -n "$SES_FEEDBACK_KEY" && "$NEW_KEY" == "$SES_FEEDBACK_KEY" ]]; then
  echo "ERROR: generated key collided with SES_FEEDBACK_WEBHOOK_KEY; run again." >&2
  exit 1
fi

PUBLIC_BASE_URL="$(grep -E '^PUBLIC_BASE_URL=' "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true)"
if [[ -z "$PUBLIC_BASE_URL" ]]; then
  echo "ERROR: PUBLIC_BASE_URL is not set in the host env file; cannot compose the webhook URL." >&2
  exit 1
fi
WEBHOOK_URL="${PUBLIC_BASE_URL%/}/webhooks/platform-alarm?key=${NEW_KEY}"

# -----------------------------------------------------------------------------
# Step 3: rewrite (replace-or-append, duplicates collapsed), masked diff,
# confirm, push back. The key travels via the environment, not argv, so it
# never appears in the process table.
# -----------------------------------------------------------------------------
umask 077
NEW_LOCAL="$(mktemp /tmp/footbag-env-alarm-new.XXXXXX)"
AK_VALUE="$NEW_KEY" awk '
  BEGIN { seen = 0 }
  /^ALARM_WEBHOOK_KEY=/ {
    if (!seen) { print "ALARM_WEBHOOK_KEY=" ENVIRON["AK_VALUE"]; seen = 1 }
    next
  }
  { print }
  END {
    if (!seen) print "ALARM_WEBHOOK_KEY=" ENVIRON["AK_VALUE"]
  }
' "$OLD_LOCAL" > "$NEW_LOCAL"

# Masks every secret-bearing key, not just this script's own: diff prints
# unchanged neighbour lines around each hunk, so masking only the changed line
# still shows whatever secrets sit beside it.
mask() {
  host_env_mask "$1"
}

echo ""
echo "Env file change (key masked):"
diff -u <(mask "$OLD_LOCAL") <(mask "$NEW_LOCAL") || true
echo ""

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$NEW_LOCAL" "$ENV_FILE_OVERRIDE"
  shred -u "$NEW_LOCAL"
else
  # Confirmation reads from the terminal, not stdin: stdin is the credential
  # pipe, and a prompt reading from it would swallow what follows the password.
  if ! confirm_from_tty "Push this change to ${HOST_ENV_PATH} on ${SSH_ALIAS}? (yes/no): " "yes"; then
    echo ""
    echo "Aborted: env file not pushed; nothing changed on the host." >&2
    exit 1
  fi
  host_env_install "$SSH_ALIAS" "$NEW_LOCAL" "$HOST_ENV_PATH" || exit 1
fi

# -----------------------------------------------------------------------------
# Step 4: print the terraform value once, then the remaining human steps.
# -----------------------------------------------------------------------------
echo ""
echo "== Platform-alarm webhook key installed on $TARGET =="

# The value goes into the values file directly rather than onto the operator's
# screen. It is a live secret, and a value printed for a human to copy passes
# through a terminal, a scrollback buffer and a clipboard on its way to a file
# it could have been written to. --no-tfvars restores the printing behaviour for
# the case where the values file is not reachable from this machine.
TFVARS_WRITTEN=0
if (( WRITE_TFVARS )) && [[ -z "$ENV_FILE_OVERRIDE" || -n "$TFVARS_OVERRIDE" ]]; then
  TFVARS_LINK="${TFVARS_OVERRIDE:-${REPO_ROOT}/terraform/${TARGET}/secrets.auto.tfvars}"
  if TFVARS_PATH="$(resolve_tfvars_target "$TFVARS_LINK" "$REPO_ROOT")"; then
    if write_tfvars_url "$TFVARS_PATH" "alarm_webhook_url" "$WEBHOOK_URL"; then
      TFVARS_WRITTEN=1
    else
      exit 1
    fi
  else
    exit 1
  fi
fi

if (( ! TFVARS_WRITTEN )); then
  echo ""
  echo "Set this terraform variable (sensitive; operator-local tfvars only,"
  echo "never committed). Shown only this once:"
  echo ""
  echo "  alarm_webhook_url = \"${WEBHOOK_URL}\""
fi
echo ""
echo "Remaining steps (human by design):"
echo "  1. terraform -chdir=terraform/${TARGET} plan    (review the subscription"
echo "     and its dead-letter queue)"
echo "  2. terraform -chdir=terraform/${TARGET} apply"
echo "  3. Redeploy FIRST, so the running containers hold the key above. A"
echo "     confirmation arriving at a container without it is refused and SNS"
echo "     drops it after a few retries, leaving a subscription that can never"
echo "     be confirmed. If the apply already ran, recreate the subscription:"
echo "       terraform -chdir=terraform/${TARGET} apply -replace='aws_sns_topic_subscription.alarm_webhook[0]'"
echo "  4. Confirm the SNS subscription once, from the application log. The"
echo "     one-time URL is a bearer token, so it is deliberately kept OUT of the"
echo "     audit trail; the audit row records only that a confirmation is due."
echo "     The app never fetches the URL itself, since a forged confirmation"
echo "     would make that an attacker-chosen fetch:"
echo "       ssh <host> 'docker logs \$(docker ps --filter name=web -q) 2>&1 \\"
echo "         | grep alarm_feed.subscription_confirmation_pending | tail -1'"
echo "     (also in CloudWatch under /footbag/${TARGET}/app). Open the"
echo "     subscribeUrl value once."
echo "  5. < <operator credential file> bash scripts/verify-host-env.sh --target ${TARGET}"
