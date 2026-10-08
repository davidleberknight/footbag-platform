#!/usr/bin/env bash
# ses-sender-cutover.sh
#
# Moves production's outbound mail off the interim sender identity and onto the
# footbag.org domain identity, end to end and in the one order that is safe.
#
# WHY THIS IS ONE COMMAND.
#
# Production sends as an interim address on another domain, verified as an SES
# email identity of its own, because the canonical noreply@footbag.org cannot be
# verified until footbag.org is delegated to the Route 53 zone and its DKIM
# records verify. Once they have, the sender moves, and four things have to move
# together or not at all: the values file (the sender, the permitted From
# addresses and the flag that retires the interim identity), the Terraform apply
# that retires it, the sender the host holds in its environment file, and a deploy
# so the running containers hold that sender. Any one of them alone breaks
# sending: the application stamps the sender onto every outbox row when it is
# queued, so a host still holding the interim address after the apply has
# destroyed that identity sends every message into a refusal at the drain.
#
# The retirement is one-way. The interim identity is destroyed, and recreating it
# needs a click-link sent to an address nobody reads. So the step that makes it
# safe is a fact about AWS rather than about the configuration: SES has to report
# footbag.org verified for sending, in an earlier apply, before this one starts.
# Terraform cannot carry that check without also refusing the plan that would
# repair a deleted identity, so this script carries it.
#
# WHAT IT REFUSES.
#
#   - Any environment but production. The domain identity exists only there.
#   - A run while SES does not report footbag.org verified for sending with its
#     DKIM records verified, or while the domain's bounce and complaint topics are
#     not attached or its feedback forwarding is still on.
#   - A values file without the domain identity and domain-auth flags on, or
#     whose sender is already at the domain without the retire flag.
#   - A plan carrying anything beyond the retirement: the interim identity and
#     its two notification settings destroyed, and the runtime role's send policy
#     updated. Anything else pending in the tree is refused as drift, so it is not
#     applied under cover of this change.
#   - A confirmation from anywhere but a terminal. There is no flag that answers
#     in advance, because the step is one-way.
#
# THE OUTBOX.
#
# Paused for the whole move, so nothing is sent as an address that is changing
# underneath it. If the run stops before the apply starts, nothing has changed on
# AWS and the outbox is resumed. From the apply on, the outbox stays paused and
# the run says where it stopped: resuming would send as an identity that may
# already be gone. Finish with --from-step, which re-checks the pause first.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  show the values-file change, confirm, pause the outbox, write it
#   2  terraform plan, check it is only the retirement, confirm, apply that plan
#   3  set-host-env.sh (writes the sender from the Terraform output onto the host)
#   4  deploy (code-only), so the containers hold the new sender
#   5  verify the host and a send through SES as the new sender
#   6  resume the outbox
#
# Usage (the production host sudo password is read from stdin, line 1):
#
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/ses-sender-cutover.sh --target production
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/ses-sender-cutover.sh --target production --from-step 3
#   scripts/ses-sender-cutover.sh --target production --dry-run
#
# --dry-run opens no ssh session, needs no credential file and changes nothing.
#
# Test seams (CI only; operators never set these). Each says so on stderr when set:
#   SENDER_CUTOVER_AWS_BIN, SENDER_CUTOVER_TF_BIN, SENDER_CUTOVER_PAUSE_CMD,
#   SENDER_CUTOVER_SET_HOST_ENV_CMD, SENDER_CUTOVER_DEPLOY_CMD,
#   SENDER_CUTOVER_VERIFY_HOST_ENV_CMD, SENDER_CUTOVER_VERIFY_EMAIL_CMD,
#   SENDER_CUTOVER_EGRESS_CHECK (skips the firewall read, with the verdict given)
#   and SENDER_CUTOVER_TFVARS (a values file in place of the environment's).
set -euo pipefail

TARGET=""
DRY_RUN=0
FROM_STEP=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/egress-allowlist.sh
source "${REPO_ROOT}/scripts/lib/egress-allowlist.sh"
# shellcheck source=lib/terraform-output.sh
source "${REPO_ROOT}/scripts/lib/terraform-output.sh"

CANONICAL_SENDER="noreply@footbag.org"
DOMAIN="footbag.org"
REGION="us-east-1"
# The workstation profile that assumes the production runtime role, which is the
# principal production sends as.
RUNTIME_PROFILE="footbag-production-runtime"

AWS_BIN="${SENDER_CUTOVER_AWS_BIN:-aws}"
TF_BIN="${SENDER_CUTOVER_TF_BIN:-terraform}"
TF_OUTPUT_BIN="$TF_BIN"
PAUSE_CMD="${SENDER_CUTOVER_PAUSE_CMD:-$REPO_ROOT/scripts/outbound-mail-pause.sh}"
SET_HOST_ENV_CMD="${SENDER_CUTOVER_SET_HOST_ENV_CMD:-$REPO_ROOT/scripts/set-host-env.sh}"
# -k is load-bearing: a bare wrapper invocation treats schema drift as an
# invitation to rebuild and offers to replace the deployed database. Moving the
# sender must never be able to become a database replace.
DEPLOY_CMD="${SENDER_CUTOVER_DEPLOY_CMD:-$REPO_ROOT/deploy_to_aws.sh}"
DEPLOY_ARGS=(-k)
VERIFY_HOST_ENV_CMD="${SENDER_CUTOVER_VERIFY_HOST_ENV_CMD:-$REPO_ROOT/scripts/verify-host-env.sh}"
VERIFY_EMAIL_CMD="${SENDER_CUTOVER_VERIFY_EMAIL_CMD:-$REPO_ROOT/scripts/verify-prod-email.sh}"

for seam in SENDER_CUTOVER_AWS_BIN SENDER_CUTOVER_TF_BIN SENDER_CUTOVER_PAUSE_CMD \
    SENDER_CUTOVER_SET_HOST_ENV_CMD SENDER_CUTOVER_DEPLOY_CMD \
    SENDER_CUTOVER_VERIFY_HOST_ENV_CMD SENDER_CUTOVER_VERIFY_EMAIL_CMD \
    SENDER_CUTOVER_EGRESS_CHECK SENDER_CUTOVER_TFVARS; do
  if [[ -n "${!seam:-}" ]]; then
    echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
  fi
done

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires a step number" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# Production only, and still named: the domain identity this moves onto exists in
# one environment, and saying which one is the operator's act, not a default.
require_target "$TARGET" production || exit 2

if [[ ! "$FROM_STEP" =~ ^[1-6]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 6 (got '$FROM_STEP')." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"
SSH_ALIAS="footbag-$TARGET"

# The values file carries operator CIDR ranges, so what matters is that git
# cannot pick it up. It is written through its symlink, never replaced, so the
# link into the private operations checkout survives.
resolve_tfvars() {
  local link resolved
  link="${SENDER_CUTOVER_TFVARS:-$TF_DIR/terraform.tfvars}"
  if [[ ! -e "$link" ]]; then
    echo "ERROR: $link does not exist; there is no production values file to change." >&2
    exit 1
  fi
  resolved="$(readlink -f "$link")"
  if [[ -z "$resolved" || ! -f "$resolved" ]]; then
    echo "ERROR: $link does not resolve to a file (dangling symlink)." >&2
    exit 1
  fi
  case "$resolved" in
    "$REPO_ROOT"/*)
      if ! git -C "$REPO_ROOT" check-ignore -q "$resolved" 2>/dev/null; then
        echo "ERROR: $resolved is inside this repository and git does not ignore it." >&2
        echo "       The values file carries operator CIDR ranges; writing it where git" >&2
        echo "       can pick it up is how those get committed." >&2
        exit 1
      fi
      ;;
  esac
  printf '%s' "$resolved"
}

# The last assignment wins in a values file, so the last line is the one read.
read_scalar() {
  grep -E "^[[:space:]]*$2[[:space:]]*=" "$1" | tail -1 \
    | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*(#.*)?$//; s/^"(.*)"$/\1/' || true
}

TFVARS_PATH="$(resolve_tfvars)"
CURRENT_SENDER="$(read_scalar "$TFVARS_PATH" ses_sender_identity)"
IDENTITY_FLAG="$(read_scalar "$TFVARS_PATH" ses_enable_domain_identity)"
AUTH_FLAG="$(read_scalar "$TFVARS_PATH" ses_enable_domain_auth)"
RETIRE_FLAG="$(read_scalar "$TFVARS_PATH" ses_sender_on_domain_identity)"

echo "== SES sender cutover: $TARGET =="
echo ""
echo "values file: $TFVARS_PATH"
echo "  ses_sender_identity           = ${CURRENT_SENDER:-<absent>}"
echo "  ses_enable_domain_identity    = ${IDENTITY_FLAG:-<absent>}"
echo "  ses_enable_domain_auth        = ${AUTH_FLAG:-<absent>}"
echo "  ses_sender_on_domain_identity = ${RETIRE_FLAG:-<absent>}"
echo ""

if (( DRY_RUN )); then
  echo "A dry run checks nothing. A real run first refuses unless SES reports $DOMAIN"
  echo "verified for sending with its bounce and complaint topics attached, then runs:"
  echo "  1. Rewrite the sender, the permitted From list and ses_sender_on_domain_identity"
  echo "     in $TFVARS_PATH (diff shown, APPLY), pause the outbox, write the file"
  echo "  2. terraform -chdir=$TF_DIR plan, refuse anything beyond retiring the interim"
  echo "     identity and updating the send policy, APPLY, apply that plan"
  echo "  3. scripts/set-host-env.sh --target $TARGET (the sender from the Terraform output)"
  echo "  4. ./deploy_to_aws.sh --target $TARGET ${DEPLOY_ARGS[*]}   (code-only)"
  echo "  5. scripts/verify-host-env.sh and scripts/verify-prod-email.sh --sender $CANONICAL_SENDER"
  echo "  6. Resume the outbox"
  exit 0
fi

# Every confirmation below is read from /dev/tty, never from stdin, which is the
# credential pipe. There is no --yes: the retirement is one-way.
require_ssh_alias "$SSH_ALIAS" || exit 1
require_operator_stdin "scripts/ses-sender-cutover.sh --target ${TARGET}" "$SSH_ALIAS" "$TARGET" || exit 1
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
aws_profile_ensure || exit 1

PAUSED_BY_RUN=0
APPLY_STARTED=0
TF_PLAN=""
TFVARS_TMP=""
TFVARS_BACKUP=""

outbox() {
  # $1 is --pause, --resume or --status. The credential this run read is handed
  # on, because a single stdin cannot serve two readers.
  local action="$1" out
  if [[ "$action" == "--status" ]]; then
    out="$(printf '%s\n' "$SUDO_PASS" | bash "$PAUSE_CMD" --target "$TARGET" --status)" || return 1
  else
    out="$(printf '%s\n' "$SUDO_PASS" | bash "$PAUSE_CMD" --target "$TARGET" "$action" \
      --reason "SES sender cutover to ${CANONICAL_SENDER}" --yes)" || return 1
  fi
  printf '%s\n' "$out" | sed 's/^/  /'
  if grep -q ': PAUSED' <<< "$out"; then
    OUTBOX_STATE="PAUSED"
  elif grep -q ': DRAINING' <<< "$out"; then
    OUTBOX_STATE="DRAINING"
  else
    OUTBOX_STATE="unknown"
  fi
}

# Where a stop leaves things depends on how far the run got, so the ordinary exits
# decide for themselves and only an interrupt comes through the trap.
stop() {
  local code="$1" resume_step="$2"
  # A values file left holding the cutover after a stop before the apply would
  # retire the interim identity on the next routine apply, while the host still
  # sends as it. So this run's own write is undone, and only this run's.
  if (( ! APPLY_STARTED )) && [[ -n "$TFVARS_BACKUP" && -f "$TFVARS_BACKUP" ]]; then
    cat "$TFVARS_BACKUP" > "$TFVARS_PATH"
    echo "" >&2
    echo "The values file is restored to what it held before this run." >&2
    resume_step=1
  fi
  if (( PAUSED_BY_RUN && ! APPLY_STARTED )); then
    echo "" >&2
    echo "Nothing was applied on AWS, so the outbox is resumed." >&2
    outbox --resume >&2 || echo "WARNING: the outbox could not be resumed; run scripts/outbound-mail-pause.sh --target $TARGET --resume." >&2
  elif (( APPLY_STARTED )); then
    echo "" >&2
    echo "The outbox is LEFT PAUSED: the apply had started, and resuming could send as" >&2
    echo "an identity that is already destroyed. Finish with:" >&2
  fi
  echo "  < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/ses-sender-cutover.sh --target $TARGET --from-step $resume_step" >&2
  exit "$code"
}

CURRENT_STEP="$FROM_STEP"
on_interrupt() {
  echo "" >&2
  echo "Interrupted during step ${CURRENT_STEP}." >&2
  stop 130 "$CURRENT_STEP"
}
cleanup_files() {
  if [[ -n "$TF_PLAN" && -e "$TF_PLAN" ]]; then shred -u "$TF_PLAN" 2>/dev/null || rm -f "$TF_PLAN"; fi
  rm -f "${TFVARS_TMP:-}" "${TFVARS_BACKUP:-}"
}
trap cleanup_files EXIT
trap on_interrupt INT TERM

# ── Preconditions: facts about AWS, read before anything changes ─────────────
echo "-- preconditions --"
# Every check below reads JSON. Without a parser they would read as empty, and an
# empty answer must never pass for a clean one.
if ! command -v jq >/dev/null 2>&1; then
  echo "REFUSING: jq is not installed, so SES's answers and the plan cannot be checked." >&2
  exit 1
fi
domain_json=""
if ! domain_json="$("$AWS_BIN" sesv2 get-email-identity --email-identity "$DOMAIN" \
    --region "$REGION" --output json 2>&1)"; then
  echo "REFUSING: could not read the SES identity for $DOMAIN:" >&2
  printf '%s\n' "$domain_json" | sed 's/^/  /' >&2
  echo "  The domain identity has to exist and verify, through ses_enable_domain_identity" >&2
  echo "  and ses_enable_domain_auth, in an earlier apply. Nothing was changed." >&2
  exit 1
fi
verified="$(printf '%s' "$domain_json" | jq -r '.VerifiedForSendingStatus // false')"
dkim="$(printf '%s' "$domain_json" | jq -r '.DkimAttributes.Status // "NONE"')"
# Not `// true`: jq's alternative operator also replaces false, which would read
# forwarding switched off as switched on.
forwarding="$(printf '%s' "$domain_json" | jq -r 'if has("FeedbackForwardingStatus") then .FeedbackForwardingStatus else true end')"
if [[ "$verified" != "true" || "$dkim" != "SUCCESS" ]]; then
  echo "REFUSING: SES reports $DOMAIN verified-for-sending=$verified, DKIM=$dkim." >&2
  echo "  Retiring the interim sender now would leave nothing that can send. Let the" >&2
  echo "  domain-auth apply finish verifying first. Nothing was changed." >&2
  exit 1
fi
if [[ "$forwarding" != "false" ]]; then
  echo "REFUSING: feedback forwarding is still on for $DOMAIN, so once mail moves under" >&2
  echo "  it, bounces would also be mailed to an address nobody reads. The domain-auth" >&2
  echo "  apply turns it off; apply it and re-run. Nothing was changed." >&2
  exit 1
fi
topics=""
if ! topics="$("$AWS_BIN" ses get-identity-notification-attributes --identities "$DOMAIN" \
    --region "$REGION" --output json 2>&1)"; then
  echo "REFUSING: could not read the notification topics for $DOMAIN:" >&2
  printf '%s\n' "$topics" | sed 's/^/  /' >&2
  exit 1
fi
bounce_topic="$(printf '%s' "$topics" | jq -r --arg d "$DOMAIN" '.NotificationAttributes[$d].BounceTopic // ""')"
complaint_topic="$(printf '%s' "$topics" | jq -r --arg d "$DOMAIN" '.NotificationAttributes[$d].ComplaintTopic // ""')"
if [[ -z "$bounce_topic" || -z "$complaint_topic" ]]; then
  echo "REFUSING: $DOMAIN has no bounce or complaint topic attached, so bounces for mail" >&2
  echo "  sent under it would be recorded nowhere. The domain-auth apply attaches them." >&2
  exit 1
fi
if [[ "$IDENTITY_FLAG" != "true" || "$AUTH_FLAG" != "true" ]]; then
  echo "REFUSING: the values file must have ses_enable_domain_identity and" >&2
  echo "  ses_enable_domain_auth set to true; the retirement plan depends on both." >&2
  exit 1
fi
echo "  $DOMAIN: verified for sending, DKIM verified, forwarding off, topics attached."

# "Already done" is proved from what Terraform applied and what the host holds,
# never from the values file alone.
if (( FROM_STEP == 1 )) && [[ "$RETIRE_FLAG" == "true" && "$CURRENT_SENDER" == "$CANONICAL_SENDER" ]] \
   && tf_output_read "$TF_DIR" ses_sender_identity && [[ "$TF_OUTPUT_VALUE" == "$CANONICAL_SENDER" ]]; then
  if printf '%s\n' "$SUDO_PASS" | bash "$VERIFY_HOST_ENV_CMD" --target "$TARGET" >/dev/null 2>&1; then
    outbox --status >/dev/null || true
    if [[ "${OUTBOX_STATE:-}" == "DRAINING" ]]; then
      echo ""
      echo "Already done: Terraform holds $CANONICAL_SENDER, the host agrees and the outbox"
      echo "is draining. Nothing was changed."
      exit 0
    fi
  fi
  echo ""
  echo "The values file and Terraform already hold $CANONICAL_SENDER, but the host or the"
  echo "outbox does not show a finished cutover. Finish with --from-step 3."
  exit 1
fi
echo ""

if [[ "$CURRENT_SENDER" == *"@${DOMAIN}" && "$RETIRE_FLAG" != "true" ]]; then
  echo "REFUSING: ses_sender_identity is already at $DOMAIN without the retire flag, which" >&2
  echo "  the plan refuses. Restore the interim address and re-run." >&2
  exit 1
fi
INTERIM_SENDER="$CURRENT_SENDER"

# ── Step 1: the values file, and the pause ───────────────────────────────────
if (( FROM_STEP <= 1 )); then
  CURRENT_STEP=1
  echo "-- step 1: values file --"
  if ! grep -qE '^[[:space:]]*ses_permitted_from_addresses[[:space:]]*=' "$TFVARS_PATH"; then
    echo "REFUSING: the values file declares no ses_permitted_from_addresses. Production" >&2
    echo "  must name every From address it sends as; add it rather than have it invented." >&2
    exit 1
  fi
  TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-sender-cutover-tfvars.XXXXXX")"
  # Literal matching throughout: an address is not a pattern, and its dots must
  # not match any character. The list may be written one entry per line or on
  # one line, so the interim entry is replaced, or removed with its separator
  # when the canonical address is already listed, without touching its neighbours.
  INTERIM="$INTERIM_SENDER" CANONICAL="$CANONICAL_SENDER" awk '
    function repl(s, a, b,    i) {
      i = index(s, a)
      if (!i) return s
      return substr(s, 1, i - 1) b substr(s, i + length(a))
    }
    function drop(s,    t) {
      t = repl(s, interim ", ", ""); if (t != s) return t
      t = repl(s, interim ",", "");  if (t != s) return t
      t = repl(s, ", " interim, ""); if (t != s) return t
      return repl(s, interim, "")
    }
    BEGIN { q = "\""; interim = q ENVIRON["INTERIM"] q; canonical = q ENVIRON["CANONICAL"] q }
    /^[ \t]*ses_sender_identity[ \t]*=/ { sub(/=.*/, "= " canonical); print; next }
    /^[ \t]*ses_sender_on_domain_identity[ \t]*=/ { sub(/=.*/, "= true"); print; retire = 1; next }
    /^[ \t]*ses_permitted_from_addresses[ \t]*=/ { inlist = 1 }
    inlist {
      if (index($0, canonical)) has_canonical = 1
      lines[++n] = $0
      if ($0 ~ /\]/) {
        for (i = 1; i <= n; i++) {
          line = lines[i]
          if (index(line, interim)) {
            line = has_canonical ? drop(line) : repl(line, interim, canonical)
            if (line ~ /^[ \t]*$/) continue
          }
          print line
        }
        inlist = 0; n = 0
      }
      next
    }
    { print }
    END { if (!retire) print "ses_sender_on_domain_identity = true" }
  ' "$TFVARS_PATH" > "$TFVARS_TMP"

  if cmp -s "$TFVARS_PATH" "$TFVARS_TMP"; then
    echo "  The values file already holds the cutover; leaving it alone."
  else
    echo ""
    diff -u "$TFVARS_PATH" "$TFVARS_TMP" || true
    echo ""
    echo "This moves sending from $INTERIM_SENDER to $CANONICAL_SENDER. The apply that"
    echo "follows destroys the interim identity, one-way. The outbox is paused first."
    echo ""
    if ! confirm_from_tty "Type 'APPLY' to pause the outbox and write this change: " "APPLY"; then
      echo "Aborted: nothing changed." >&2
      exit 1
    fi
  fi

  outbox --pause || { echo "ERROR: the outbox could not be paused; nothing else was changed." >&2; exit 1; }
  if [[ "$OUTBOX_STATE" != "PAUSED" ]]; then
    echo "ERROR: the outbox did not read back PAUSED; nothing else was changed." >&2
    exit 1
  fi
  PAUSED_BY_RUN=1
  if ! cmp -s "$TFVARS_PATH" "$TFVARS_TMP"; then
    # Mode 600, like the file it copies: the values file carries operator CIDRs.
    TFVARS_BACKUP="$(mktemp "${TMPDIR:-/tmp}/footbag-sender-cutover-backup.XXXXXX")"
    chmod 600 "$TFVARS_BACKUP"
    cat "$TFVARS_PATH" > "$TFVARS_BACKUP"
    cat "$TFVARS_TMP" > "$TFVARS_PATH"
    echo "  Values file written."
  fi
  echo ""
else
  # A resumed run re-checks the pause rather than trusting an earlier run's.
  outbox --status || stop 1 "$FROM_STEP"
  if [[ "$OUTBOX_STATE" != "PAUSED" ]]; then
    outbox --pause || stop 1 "$FROM_STEP"
    [[ "$OUTBOX_STATE" == "PAUSED" ]] || { echo "ERROR: the outbox did not read back PAUSED." >&2; exit 1; }
    (( FROM_STEP <= 2 )) && PAUSED_BY_RUN=1
  fi
  echo ""
fi

# ── Step 2: the retirement, and nothing else ─────────────────────────────────
if (( FROM_STEP <= 2 )); then
  CURRENT_STEP=2
  echo "-- step 2: terraform apply --"
  # A saved plan, so what is applied is what was checked and shown. Mode 600,
  # shredded on every exit path, in a literal directory the caller's environment
  # cannot redirect into a checkout: a saved plan is an archive that can carry
  # live values.
  TF_PLAN="$(mktemp /tmp/footbag-sender-cutover-plan.XXXXXX)"
  chmod 600 "$TF_PLAN"
  if ! "$TF_BIN" -chdir="$TF_DIR" plan -input=false -out="$TF_PLAN"; then
    echo "ERROR: terraform plan failed. Nothing was applied." >&2
    stop 1 2
  fi
  plan_json=""
  if ! plan_json="$("$TF_BIN" -chdir="$TF_DIR" show -json "$TF_PLAN" 2>&1)"; then
    echo "REFUSING: could not read the plan as JSON, so it cannot be checked:" >&2
    printf '%s\n' "$plan_json" | sed 's/^/  /' >&2
    stop 1 2
  fi
  # Each change as "<address> <actions>", from a plan that a failed parse refuses
  # rather than reading as empty.
  if ! changes="$(printf '%s' "$plan_json" | jq -r '
      .resource_changes[]
      | select(.change.actions != ["no-op"] and .change.actions != ["read"])
      | "\(.address) \(.change.actions | join(","))"')"; then
    echo "REFUSING: the plan JSON did not parse, so it cannot be checked." >&2
    stop 1 2
  fi
  expected=$'aws_ses_email_identity.sender[0] delete\naws_ses_identity_notification_topic.sender_bounce[0] delete\naws_ses_identity_notification_topic.sender_complaint[0] delete'
  unexpected="$(printf '%s\n' "$changes" | grep -v '^$' \
    | grep -vxF -e 'aws_ses_email_identity.sender[0] delete' \
      -e 'aws_ses_identity_notification_topic.sender_bounce[0] delete' \
      -e 'aws_ses_identity_notification_topic.sender_complaint[0] delete' \
      -e 'aws_iam_role_policy.app_jwt_ses update' || true)"
  missing="$(printf '%s\n' "$expected" | grep -vxF -f <(printf '%s\n' "$changes") || true)"
  if [[ -n "$unexpected" ]]; then
    echo "REFUSING: the plan carries changes beyond the retirement:" >&2
    printf '%s\n' "$unexpected" | sed 's/^/  /' >&2
    echo "  Apply those on their own first, through scripts/terraform-apply.sh. Nothing was applied." >&2
    stop 1 2
  fi
  if [[ -n "$missing" ]]; then
    echo "REFUSING: the plan does not retire the interim identity; missing:" >&2
    printf '%s\n' "$missing" | sed 's/^/  /' >&2
    echo "  Check the values file. Nothing was applied." >&2
    stop 1 2
  fi
  echo ""
  echo "The plan retires the interim identity and its two notification settings, and"
  echo "updates the send policy. Nothing else."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply this plan: " "APPLY"; then
    echo "Aborted before the apply." >&2
    stop 1 2
  fi
  APPLY_STARTED=1
  if ! "$TF_BIN" -chdir="$TF_DIR" apply -input=false "$TF_PLAN"; then
    echo "ERROR: terraform apply failed." >&2
    stop 1 2
  fi
  echo ""
fi
APPLY_STARTED=1

# ── Step 3: the sender onto the host ─────────────────────────────────────────
if (( FROM_STEP <= 3 )); then
  CURRENT_STEP=3
  echo "-- step 3: host env --"
  if ! printf '%s\n' "$SUDO_PASS" | bash "$SET_HOST_ENV_CMD" --target "$TARGET" --yes; then
    echo "ERROR: writing the host env failed." >&2
    stop 1 3
  fi
  echo ""
fi

# ── Step 4: the deploy, so the containers hold the new sender ────────────────
if (( FROM_STEP <= 4 )); then
  CURRENT_STEP=4
  echo "-- step 4: deploy --"
  if [[ -n "${SENDER_CUTOVER_EGRESS_CHECK:-}" ]]; then
    EGRESS_VERDICT="$SENDER_CUTOVER_EGRESS_CHECK"
    EGRESS_DETAIL="(firewall read skipped by the test seam)"
  else
    egress_allowlist_check "$TARGET" "$SSH_ALIAS"
  fi
  printf '%s\n' "$EGRESS_DETAIL" | sed 's/^/  /'
  if [[ "$EGRESS_VERDICT" != "covered" ]]; then
    if ! confirm_from_tty "  Type 'APPLY' if this address is covered: " "APPLY"; then
      echo "Aborted before the deploy. Put today's address on the allow-list with" >&2
      echo "  bash scripts/authorize-operator-address.sh --target ${TARGET} \\" >&2
      echo "    --address <your-cidr> --for '<your_account>; <where>'" >&2
      stop 1 4
    fi
  fi
  if ! "$DEPLOY_CMD" --target "$TARGET" "${DEPLOY_ARGS[@]}"; then
    echo "ERROR: the deploy failed." >&2
    stop 1 4
  fi
  echo ""
fi

# ── Step 5: prove the outcome ────────────────────────────────────────────────
if (( FROM_STEP <= 5 )); then
  CURRENT_STEP=5
  echo "-- step 5: verify --"
  if ! tf_output_read "$TF_DIR" ses_sender_identity || [[ "$TF_OUTPUT_VALUE" != "$CANONICAL_SENDER" ]]; then
    echo "ERROR: Terraform's sender output reads '${TF_OUTPUT_VALUE}', not $CANONICAL_SENDER." >&2
    stop 1 2
  fi
  if ! printf '%s\n' "$SUDO_PASS" | bash "$VERIFY_HOST_ENV_CMD" --target "$TARGET"; then
    echo "ERROR: the host env does not match Terraform." >&2
    stop 1 3
  fi
  # As the runtime role, not the operator identity this run applies with: the
  # check refuses any other principal, and a send through the role is what proves
  # the From-address condition the apply just rewrote.
  if ! bash "$VERIFY_EMAIL_CMD" --sender "$CANONICAL_SENDER" --profile "$RUNTIME_PROFILE"; then
    echo "ERROR: a send as $CANONICAL_SENDER did not verify." >&2
    stop 1 5
  fi
  echo ""
fi

# ── Step 6: resume ───────────────────────────────────────────────────────────
CURRENT_STEP=6
echo "-- step 6: resume the outbox --"
outbox --resume || stop 1 6
if [[ "$OUTBOX_STATE" != "DRAINING" ]]; then
  echo "ERROR: the outbox did not read back DRAINING." >&2
  stop 1 6
fi
echo ""
echo "Production now sends as $CANONICAL_SENDER under the $DOMAIN domain identity."
