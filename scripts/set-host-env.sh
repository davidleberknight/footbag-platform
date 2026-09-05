#!/usr/bin/env bash
# set-host-env.sh
#
# Writes the operator-owned, non-secret values in /srv/footbag/env: the proxy
# hop count, the database-snapshot bucket name, and the two SNS topic ARNs the
# webhook feeds authenticate against. Every other value in that file already
# arrives through a script -- the payments activation writes the Stripe signing
# secret, the SES activation writes the feedback key, and the deploy's remote
# halves seed the one-shot values and sync the ones Terraform declares. These
# had no owner, so they were hand-typed or forgotten.
#
# What each value does, and what its absence costs:
#
#   TRUST_PROXY       the exact integer X-Forwarded-For hop count. Absent or
#                     non-integer, env.ts falls back to named ranges and per-IP
#                     rate limiting coarsens to per-edge buckets. The expected
#                     value, and why it is the same in both environments and at
#                     every milestone, lives in lib/host-env-expectations.sh.
#   BACKUP_S3_BUCKET  read by the footbag-backup systemd timer rather than at
#                     application boot, so its absence does not show up as a
#                     failure anywhere: backup-db.sh refuses to run, the
#                     snapshots bucket stays empty, no backup-age metric is
#                     emitted, and the timer still reports healthy. Installing
#                     the timer before this value is set produces a backup
#                     pipeline that runs and uploads nothing.
#   ALARM_TOPIC_ARN   the publishing topic the platform-alarm feed accepts.
#   SES_FEEDBACK_TOPIC_ARN
#                     the same for the mail bounce and complaint feed. Each feed
#                     authenticates on its shared key AND its publishing topic,
#                     because a valid signature proves only that some topic in
#                     some AWS account signed the payload. Absent, that feed
#                     refuses every delivery, which reads as a quiet feed rather
#                     than a broken one -- which is exactly why it is set here
#                     rather than remembered.
#   SES_FROM_IDENTITY the address every outbound message is sent as. It has to
#                     be the identity SES has actually verified, which is not
#                     always the canonical one: the canonical address cannot be
#                     verified until mail for the domain is reachable, so an
#                     interim identity carries sending until then. Set to the
#                     canonical address early and nothing warns you, because the
#                     application stamps it onto every outbox row at enqueue and
#                     the refusal arrives later, at the drain, as an
#                     authorization error naming a resource rather than a sender.
#                     verify-host-env.sh has always compared this against the
#                     Terraform sender identity, but nothing wrote it from there,
#                     so the two could disagree for as long as the mail adapter
#                     stayed stubbed and that comparison stayed dormant.
#
# The bucket name, both ARNs and the sender identity are read from Terraform
# outputs rather than typed, so they cannot drift from what actually exists.
#
# Usage (the sudo password is read from stdin, line 1):
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/set-host-env.sh --target production --profile <prod-profile>
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/set-host-env.sh --target staging --yes
#   scripts/set-host-env.sh --target staging --dry-run
#
# --dry-run resolves every value and prints the command plan without touching
# the host, and needs no credential file because it opens no ssh session.
#
# --yes accepts the install confirmation instead of asking for it, the same way
# the deploy wrapper's -y does, so this can run where there is no terminal to
# type into. The diff is still printed.
#
# Synthetic mode (CI tests only; operators never use this):
#   --env-file <path> treats the local file as the host env, skips ssh and
#   terraform entirely, and takes the values from BACKUP_S3_BUCKET_VALUE,
#   ALARM_TOPIC_ARN_VALUE and SES_FEEDBACK_TOPIC_ARN_VALUE.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-expectations.sh
source "${REPO_ROOT}/scripts/lib/host-env-expectations.sh"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TARGET="staging"
AWS_PROFILE_ARG=""
ENV_FILE_OVERRIDE=""
DRY_RUN=0
HOST_ENV_PATH="/srv/footbag/env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --env-file)
      ENV_FILE_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --env-file requires an argument" >&2; exit 2; }
      ;;
    --yes)
      ASSUME_YES="yes"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      # Bounded by the first `set -eu` rather than a line number, so editing
      # the header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      exit 2
      ;;
  esac
done

if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "ERROR: --target must be 'staging' or 'production'" >&2
  exit 2
fi

SSH_ALIAS="footbag-${TARGET}"

# ---- Resolve the values -----------------------------------------------------

TRUST_PROXY_VALUE="$(expected_trust_proxy "$TARGET")"

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  if [[ ! -f "$ENV_FILE_OVERRIDE" ]]; then
    echo "ERROR: --env-file path '$ENV_FILE_OVERRIDE' does not exist" >&2
    exit 2
  fi
  if [[ -z "${BACKUP_S3_BUCKET_VALUE:-}" ]]; then
    echo "ERROR: --env-file mode requires BACKUP_S3_BUCKET_VALUE in the environment." >&2
    exit 2
  fi
  BUCKET_VALUE="$BACKUP_S3_BUCKET_VALUE"
  ALARM_TOPIC_VALUE="${ALARM_TOPIC_ARN_VALUE:-}"
  SES_TOPIC_VALUE="${SES_FEEDBACK_TOPIC_ARN_VALUE:-}"
  if [[ -z "$ALARM_TOPIC_VALUE" || -z "$SES_TOPIC_VALUE" ]]; then
    echo "ERROR: --env-file mode requires ALARM_TOPIC_ARN_VALUE and SES_FEEDBACK_TOPIC_ARN_VALUE." >&2
    exit 2
  fi
  # The queue URLs may legitimately be empty: an environment whose feed queues
  # have not been created yet reads no feed, which is inert rather than wrong.
  ALARM_QUEUE_VALUE="${ALARM_QUEUE_URL_VALUE:-}"
  SES_QUEUE_VALUE="${SES_FEEDBACK_QUEUE_URL_VALUE:-}"
  # Optional in this mode alone, so a fixture that predates this value still
  # exercises the rewrite. The real path below requires it.
  SES_SENDER_VALUE="${SES_FROM_IDENTITY_VALUE:-}"
else
  # The bucket name is whatever Terraform actually built. Reading it rather than
  # accepting one typed in is the difference between a timer that uploads and
  # one that reports healthy into a bucket that does not exist.
  TF_ENV=()
  [[ -n "$AWS_PROFILE_ARG" ]] && TF_ENV=(env "AWS_PROFILE=$AWS_PROFILE_ARG")
  if ! BUCKET_VALUE="$("${TF_ENV[@]}" terraform -chdir="${REPO_ROOT}/terraform/${TARGET}" output -raw snapshots_bucket_name 2>/dev/null)"; then
    echo "ERROR: could not read the snapshots bucket name from terraform/${TARGET}." >&2
    echo "       Run 'terraform -chdir=terraform/${TARGET} init' first, and pass --profile if the state needs credentials." >&2
    exit 1
  fi
  if [[ -z "$BUCKET_VALUE" ]]; then
    echo "ERROR: the snapshots_bucket_name output resolved empty for ${TARGET}." >&2
    exit 1
  fi

  # The two SNS feeds authenticate on their publishing topic as well as their
  # shared key, so the host needs the exact ARNs Terraform built. Read them for
  # the same reason the bucket is read rather than typed: an ARN that does not
  # match what published the message makes the feed refuse every delivery, and
  # a refused feed looks quiet rather than broken.
  if ! ALARM_TOPIC_VALUE="$("${TF_ENV[@]}" terraform -chdir="${REPO_ROOT}/terraform/${TARGET}" output -raw alarm_topic_arn 2>/dev/null)"; then
    echo "ERROR: could not read alarm_topic_arn from terraform/${TARGET}." >&2
    exit 1
  fi
  if ! SES_TOPIC_VALUE="$("${TF_ENV[@]}" terraform -chdir="${REPO_ROOT}/terraform/${TARGET}" output -raw ses_feedback_topic_arn 2>/dev/null)"; then
    echo "ERROR: could not read ses_feedback_topic_arn from terraform/${TARGET}." >&2
    exit 1
  fi
  if [[ -z "$ALARM_TOPIC_VALUE" || -z "$SES_TOPIC_VALUE" ]]; then
    echo "ERROR: an SNS topic ARN output resolved empty for ${TARGET}." >&2
    exit 1
  fi
  # The queues the worker polls. Unlike the topic ARNs these are allowed to
  # resolve empty: the outputs answer empty until the feed queues are enabled,
  # and a host that holds no queue URL simply reads no feed. Writing the empty
  # value is deliberate, so a host that once held a queue URL for a queue since
  # removed stops polling one that no longer exists.
  ALARM_QUEUE_VALUE="$("${TF_ENV[@]}" terraform -chdir="${REPO_ROOT}/terraform/${TARGET}" output -raw alarm_queue_url 2>/dev/null || true)"
  SES_QUEUE_VALUE="$("${TF_ENV[@]}" terraform -chdir="${REPO_ROOT}/terraform/${TARGET}" output -raw ses_feedback_queue_url 2>/dev/null || true)"
  # Required, like the ARNs and unlike the queue URLs: a host with no sender
  # cannot boot the live adapter at all, and a host with the wrong one accepts
  # every message and fails every send.
  if ! SES_SENDER_VALUE="$("${TF_ENV[@]}" terraform -chdir="${REPO_ROOT}/terraform/${TARGET}" output -raw ses_sender_identity 2>/dev/null)"; then
    echo "ERROR: could not read ses_sender_identity from terraform/${TARGET}." >&2
    exit 1
  fi
  if [[ -z "$SES_SENDER_VALUE" ]]; then
    echo "ERROR: the ses_sender_identity output resolved empty for ${TARGET}." >&2
    exit 1
  fi
fi

echo "== set-host-env: ${TARGET} =="
echo ""
echo "Resolved values:"
echo "  TRUST_PROXY=${TRUST_PROXY_VALUE}    expected for ${TARGET}: $(expected_trust_proxy_note "$TARGET")"
echo "  BACKUP_S3_BUCKET=${BUCKET_VALUE}"
echo "  ALARM_TOPIC_ARN=${ALARM_TOPIC_VALUE}"
echo "  SES_FEEDBACK_TOPIC_ARN=${SES_TOPIC_VALUE}"
echo "  ALARM_QUEUE_URL=${ALARM_QUEUE_VALUE:-<none: this feed is not read here>}"
echo "  SES_FEEDBACK_QUEUE_URL=${SES_QUEUE_VALUE:-<none: this feed is not read here>}"
echo "  SES_FROM_IDENTITY=${SES_SENDER_VALUE:-<none: not supplied in this mode>}"
echo ""

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run. Nothing was written. The real run would:"
  if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
    echo "  1. Rewrite ${ENV_FILE_OVERRIDE} in place"
  else
    echo "  1. Read ${HOST_ENV_PATH} down from ${SSH_ALIAS} over the shared wire"
    echo "  2. Rewrite every assignment locally, collapsing any duplicates"
    echo "  3. Show the diff and ask for confirmation"
    echo "  4. Install the result back as root:root mode 0600, leaving no backup"
    echo "  5. Remind you that the containers pick the values up on the next deploy"
  fi
  exit 0
fi

# ---- Stage the current file down -------------------------------------------

umask 077
OLD_LOCAL=""
NEW_LOCAL=""

# Only local temp files need cleaning up: the wire leaves nothing on the host.
cleanup() {
  # shred, not rm: both copies are the host's entire secret set, not just the
  # four non-secret values this script rewrites.
  shred -u "${OLD_LOCAL:-}" "${NEW_LOCAL:-}" 2>/dev/null \
    || rm -f "${OLD_LOCAL:-}" "${NEW_LOCAL:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

OLD_LOCAL="$(mktemp /tmp/footbag-hostenv-old.XXXXXX)"
NEW_LOCAL="$(mktemp /tmp/footbag-hostenv-new.XXXXXX)"

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$ENV_FILE_OVERRIDE" "$OLD_LOCAL"
else
  require_operator_stdin "scripts/set-host-env.sh --target $TARGET" || exit 1
  require_ssh_alias "$SSH_ALIAS" || exit 1
  echo "Reading ${HOST_ENV_PATH} from ${SSH_ALIAS}."
  echo ""
  host_env_fetch "$SSH_ALIAS" "$OLD_LOCAL" "" "$HOST_ENV_PATH" || exit 1
fi

# ---- Rewrite ----------------------------------------------------------------

# Replace-or-append, collapsing duplicate assignments so the file's last-wins
# parsing cannot diverge from the diff shown below. Values travel through the
# environment rather than argv, so nothing lands in the process table.
TP_VALUE="$TRUST_PROXY_VALUE" BK_VALUE="$BUCKET_VALUE" \
AT_VALUE="$ALARM_TOPIC_VALUE" ST_VALUE="$SES_TOPIC_VALUE" \
AQ_VALUE="${ALARM_QUEUE_VALUE:-}" SQ_VALUE="${SES_QUEUE_VALUE:-}" \
SI_VALUE="${SES_SENDER_VALUE:-}" awk '
  BEGIN { seen_tp = 0; seen_bk = 0; seen_at = 0; seen_st = 0; seen_aq = 0; seen_sq = 0; seen_si = 0 }
  /^TRUST_PROXY=/ {
    if (!seen_tp) { print "TRUST_PROXY=" ENVIRON["TP_VALUE"]; seen_tp = 1 }
    next
  }
  /^BACKUP_S3_BUCKET=/ {
    if (!seen_bk) { print "BACKUP_S3_BUCKET=" ENVIRON["BK_VALUE"]; seen_bk = 1 }
    next
  }
  /^ALARM_TOPIC_ARN=/ {
    if (!seen_at) { print "ALARM_TOPIC_ARN=" ENVIRON["AT_VALUE"]; seen_at = 1 }
    next
  }
  /^SES_FEEDBACK_TOPIC_ARN=/ {
    if (!seen_st) { print "SES_FEEDBACK_TOPIC_ARN=" ENVIRON["ST_VALUE"]; seen_st = 1 }
    next
  }
  /^ALARM_QUEUE_URL=/ {
    if (!seen_aq) { print "ALARM_QUEUE_URL=" ENVIRON["AQ_VALUE"]; seen_aq = 1 }
    next
  }
  /^SES_FEEDBACK_QUEUE_URL=/ {
    if (!seen_sq) { print "SES_FEEDBACK_QUEUE_URL=" ENVIRON["SQ_VALUE"]; seen_sq = 1 }
    next
  }
  /^SES_FROM_IDENTITY=/ {
    if (!seen_si) {
      # Left alone when this mode supplied no value, so a fixture that predates
      # the sender identity keeps whatever it already carried rather than having
      # it blanked. The real path always supplies one.
      if (ENVIRON["SI_VALUE"] != "") { print "SES_FROM_IDENTITY=" ENVIRON["SI_VALUE"] }
      else { print }
      seen_si = 1
    }
    next
  }
  { print }
  END {
    if (!seen_tp) print "TRUST_PROXY=" ENVIRON["TP_VALUE"]
    if (!seen_bk) print "BACKUP_S3_BUCKET=" ENVIRON["BK_VALUE"]
    if (!seen_at) print "ALARM_TOPIC_ARN=" ENVIRON["AT_VALUE"]
    if (!seen_st) print "SES_FEEDBACK_TOPIC_ARN=" ENVIRON["ST_VALUE"]
    # Appended only when there is a queue to name. An environment whose feed
    # queues do not exist yet reads no feed either way, so writing an empty
    # assignment would add a line that changes nothing and would make a re-run
    # against an already-correct file report a change. A line already present is
    # rewritten above whatever its new value, including back to empty, which is
    # what stops a host polling a queue that has since been removed.
    if (!seen_aq && ENVIRON["AQ_VALUE"] != "") print "ALARM_QUEUE_URL=" ENVIRON["AQ_VALUE"]
    if (!seen_sq && ENVIRON["SQ_VALUE"] != "") print "SES_FEEDBACK_QUEUE_URL=" ENVIRON["SQ_VALUE"]
    if (!seen_si && ENVIRON["SI_VALUE"] != "") print "SES_FROM_IDENTITY=" ENVIRON["SI_VALUE"]
  }
' "$OLD_LOCAL" > "$NEW_LOCAL"

if diff -q "$OLD_LOCAL" "$NEW_LOCAL" >/dev/null 2>&1; then
  echo "Every value already reads as intended. Nothing to write."
  exit 0
fi

# The values this script writes are not secrets and are shown in full.
# The file around them is not: diff prints unchanged neighbour lines, and an
# append at the end prints the file's tail, so a session or webhook secret
# sitting next to a rewritten line would be printed in the clear.
echo "Diff (the rewritten values are non-secret and shown in full;"
echo "other secrets in the surrounding context are masked):"
echo ""
diff -u <(host_env_mask "$OLD_LOCAL") <(host_env_mask "$NEW_LOCAL") || true
echo ""

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$NEW_LOCAL" "$ENV_FILE_OVERRIDE"
  echo "Wrote ${ENV_FILE_OVERRIDE}."
  exit 0
fi

# The confirmation reads from the terminal, not stdin: stdin is the credential
# pipe, and a prompt reading from it would swallow whatever follows the password.
if ! confirm_from_tty "Install this on ${SSH_ALIAS}? Type 'yes' to proceed: " "yes"; then
  echo ""
  echo "Aborted. The host is unchanged."
  exit 1
fi

echo ""
echo "Installing the rewritten env file..."
host_env_install "$SSH_ALIAS" "$NEW_LOCAL" "$HOST_ENV_PATH" || exit 1

echo ""
echo "Done. ${HOST_ENV_PATH} now carries every operator-owned value."
echo "The running containers keep their current environment until the next deploy."
if [[ "$TARGET" == "production" ]]; then
  echo "Confirm with: < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/bringup-status.sh --target ${TARGET}${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
else
  echo "Confirm with: < ~/AWS/AWS_OPERATOR.txt bash scripts/bringup-status.sh --target ${TARGET}${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
fi
