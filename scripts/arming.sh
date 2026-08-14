#!/usr/bin/env bash
# arming.sh
#
# Arms or disarms one of the environment's two arming switches, payments or
# email, end to end and in the one order that is safe.
#
# Arming is three separate actions that must all happen and must happen in
# order: the tfvars flag, `terraform apply` to publish it as the SSM arming
# parameter, and a deploy, which is what derives the adapter on the host
# (armed -> live, dark -> stub). Typed from memory under pressure the sequence
# loses a step, and a half-applied arming state is invisible: the tfvars says
# one thing and the running host does another.
#
# Each switch carries its own precondition that has nothing to do with this
# repository, and each must be settled FIRST.
#
#   payments, going dark: disable the Stripe webhook endpoint. Once the host is
#     dark it verifies signatures against the stub secret, so every live
#     delivery fails with 400. Stripe retries for days and eventually disables
#     the endpoint itself, and the deliveries that matter — the payout events —
#     arrive a week or two later into an endpoint Stripe has given up on.
#
#   email, going armed: the process REFUSES TO BOOT with the live SES adapter
#     unless SES_FEEDBACK_WEBHOOK_KEY is on the host, so arming email without
#     it takes production down rather than turning mail on. The sender identity
#     must also be verified and the account out of the SES sandbox, or mail is
#     accepted and delivered nowhere. This script cannot check any of that from
#     here, so it states each one and requires the operator to confirm it.
#
# This script is the kill switch in practice. The platform has a payments_paused
# runtime config key, but it has no write path, so pulling it means writing to
# the production database during an incident. Disarming is the usable stop, and
# it takes a few minutes: know that before you need it.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  the provider-side precondition for this switch and direction
#   2  rewrite the arming flag in the environment tfvars
#   3  terraform apply
#   4  re-check this workstation's egress address, then deploy (code-only)
#   5  verify the running host and print what to expect afterwards
#
# Usage:
#   scripts/arming.sh --target production --status
#   scripts/arming.sh --target production --state dark
#   scripts/arming.sh --target production --state armed
#   scripts/arming.sh --target production --switch email --state armed
#   scripts/arming.sh --target production --state dark --dry-run
#   scripts/arming.sh --target production --state armed --from-step 3
#
# Synthetic mode (CI tests only; operators never use this):
#   --tfvars <path> points the rewrite at a local file and stops after step 2,
#   printing the remaining steps instead of running terraform or a deploy.
set -euo pipefail

TARGET="production"
STATE=""
MODE=""
SWITCH="payments"
DRY_RUN=0
FROM_STEP=1
TFVARS_OVERRIDE=""
AWS_PROFILE_ARG=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The deploy command and its flags live in one place so the preview printed in
# synthetic mode and the command actually run in step 4 cannot drift apart. The
# flags are a safety property, not a convenience: see the note at the invocation.
# ARMING_DEPLOY_CMD exists only so a test can execute step 4 against a recorder
# and assert the real argument list; it is never set in operator use, and while
# it is set the script refuses to run terraform at all, so it can only ever
# invoke the injected command.
DEPLOY_CMD="${ARMING_DEPLOY_CMD:-$REPO_ROOT/deploy_to_aws.sh}"
DEPLOY_ARGS=(-k)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --state)
      MODE="set"
      STATE="${2:-}"
      shift 2 || { echo "ERROR: --state requires 'armed' or 'dark'" >&2; exit 2; }
      ;;
    --status)
      MODE="status"
      shift
      ;;
    --switch)
      SWITCH="${2:-}"
      shift 2 || { echo "ERROR: --switch requires 'payments' or 'email'" >&2; exit 2; }
      ;;
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires a step number" >&2; exit 2; }
      ;;
    --tfvars)
      TFVARS_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --tfvars requires a path" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      sed -n '2,44p' "$0"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'" >&2
      exit 2
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

case "$SWITCH" in
  payments)
    TFVAR_NAME="payments_armed"
    SSM_SUFFIX="payments_armed"
    ADAPTER_LABEL="PAYMENT_ADAPTER"
    ;;
  email)
    TFVAR_NAME="email_send_armed"
    SSM_SUFFIX="email_send_armed"
    ADAPTER_LABEL="SES_ADAPTER"
    ;;
  *)
    echo "ERROR: --switch must be 'payments' or 'email' (got '$SWITCH')" >&2
    exit 2
    ;;
esac

if [[ -z "$MODE" ]]; then
  echo "ERROR: one of --status or --state armed|dark is required." >&2
  exit 2
fi

if [[ "$MODE" == "set" && "$STATE" != "armed" && "$STATE" != "dark" ]]; then
  echo "ERROR: --state takes 'armed' or 'dark' (got '$STATE')." >&2
  exit 2
fi

if [[ ! "$FROM_STEP" =~ ^[1-5]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 5 (got '$FROM_STEP')." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"
SSH_ALIAS="footbag-$TARGET"

# The values file is a gitignored symlink into the maintainers' private
# operations checkout, because it carries operator CIDR ranges. Writing a real
# tfvars into this tree would commit those, so the resolved target must land
# outside the repository or the rewrite is refused rather than redirected.
resolve_tfvars() {
  local link resolved
  link="${TFVARS_OVERRIDE:-$TF_DIR/terraform.tfvars}"
  if [[ ! -e "$link" ]]; then
    echo "ERROR: $link does not exist. The environment's values file is a symlink into the" >&2
    echo "       private operations checkout; restore it before arming anything." >&2
    exit 1
  fi
  # Resolved, not the link, and checked on both paths including the synthetic
  # one: a guard that a test cannot reach is a guard nobody has seen work.
  resolved="$(readlink -f "$link")"
  if [[ -z "$resolved" || ! -f "$resolved" ]]; then
    echo "ERROR: $link does not resolve to a file (dangling symlink)." >&2
    exit 1
  fi
  case "$resolved" in
    "$REPO_ROOT"/*)
      echo "ERROR: $link resolves to $resolved, which is inside this repository." >&2
      echo "       The values file carries operator CIDR ranges and must live in the" >&2
      echo "       private operations checkout. Refusing to write it here." >&2
      exit 1
      ;;
  esac
  printf '%s' "$resolved"
}

read_tfvars_armed() {
  grep -E "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$1" | tail -1 \
    | sed -E 's/.*=[[:space:]]*"?([a-z]+)"?.*/\1/' || true
}

read_ssm_armed() {
  [[ -z "$AWS_PROFILE_ARG" ]] && { echo "(no --profile; not read)"; return 0; }
  aws ssm get-parameter \
    --name "/footbag/$TARGET/app/$SSM_SUFFIX" \
    --query 'Parameter.Value' --output text \
    --profile "$AWS_PROFILE_ARG" 2>/dev/null || echo "<unreadable>"
}

TFVARS_PATH="$(resolve_tfvars)"
CURRENT_TFVARS="$(read_tfvars_armed "$TFVARS_PATH")"

if [[ "$MODE" == "status" ]]; then
  echo "== $SWITCH arming: $TARGET =="
  echo ""
  echo "tfvars ($TFVARS_PATH): $TFVAR_NAME = ${CURRENT_TFVARS:-<absent>}"
  echo "SSM  (/footbag/$TARGET/app/$SSM_SUFFIX): $(read_ssm_armed)"
  echo ""
  echo "The host's $ADAPTER_LABEL is derived from the SSM value at deploy time."
  echo "For the running host, and everything else in the bring-up sequence:"
  echo "  scripts/bringup-status.sh --target $TARGET${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
  exit 0
fi

WEBHOOK_PATH="/payments/webhook"

# Which direction of which switch has a provider-side precondition, and what it
# is. Payments needs one on the way down, email on the way up, and each is
# something this script cannot verify from the workstation.
PRECONDITION=""
if [[ "$SWITCH" == "payments" && "$STATE" == "dark" ]]; then
  PRECONDITION="stripe-endpoint"
elif [[ "$SWITCH" == "payments" && "$STATE" == "armed" ]]; then
  PRECONDITION="payments-readiness"
elif [[ "$SWITCH" == "email" && "$STATE" == "armed" ]]; then
  PRECONDITION="ses-readiness"
fi

# Reads a secret parameter's value only to classify it: present and real, still
# the bootstrap placeholder, or unreadable. The value itself is never printed.
classify_secret_param() {
  local param="/footbag/$TARGET/secrets/$1" value
  if ! value=$(
    aws ssm get-parameter --name "$param" --with-decryption \
      --query 'Parameter.Value' --output text \
      --profile "$AWS_PROFILE_ARG" 2>/dev/null
  ); then
    echo "unreadable"
    return 0
  fi
  case "$value" in
    ''|TODO-*) echo "placeholder" ;;
    *)         echo "set" ;;
  esac
}

echo "== $SWITCH arming: $TARGET -> $STATE =="
echo ""
echo "tfvars: $TFVARS_PATH"
echo "  $TFVAR_NAME currently reads: ${CURRENT_TFVARS:-<absent>}"
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  case "$PRECONDITION" in
    stripe-endpoint)
      echo "  1. Confirm the Stripe webhook endpoint has been DISABLED in the dashboard"
      echo "     (endpoint path $WEBHOOK_PATH). Disarming first leaves Stripe retrying"
      echo "     against a host that can no longer validate signatures."
      ;;
    payments-readiness)
      echo "  1. Confirm the Stripe credentials are actually in Parameter Store. An"
      echo "     armed production REFUSES TO BOOT unless the payment adapter is live"
      echo "     with a webhook secret present, so arming before activation has"
      echo "     finished takes production down instead of turning payments on."
      ;;
    ses-readiness)
      echo "  1. Confirm every SES precondition, one at a time. The live SES adapter"
      echo "     REFUSES TO BOOT without SES_FEEDBACK_WEBHOOK_KEY on the host, so"
      echo "     arming without it takes production down instead of turning mail on."
      ;;
    *)
      echo "  1. (no provider-side precondition for $SWITCH going $STATE)"
      ;;
  esac
  echo "  2. Rewrite $TFVAR_NAME = \"$STATE\" in $TFVARS_PATH (diff shown, confirmed)"
  echo "  3. terraform -chdir=$TF_DIR apply (publishes SSM app/$SSM_SUFFIX)"
  echo "  4. Re-check this workstation's egress address, then:"
  echo "     DEPLOY_TARGET=$SSH_ALIAS ./deploy_to_aws.sh   (code-only; never --all-data)"
  echo "  5. Verify with scripts/bringup-status.sh and report what to expect"
  if [[ "$SWITCH" == "payments" && "$STATE" == "dark" ]]; then
    echo ""
    echo "After disarming, expect one false reconciliation issue within a day: the"
    echo "nightly pass runs whatever the adapter is, and the stub's ledger is empty."
  fi
  if [[ "$SWITCH" == "email" && "$STATE" == "armed" ]]; then
    echo ""
    echo "Arming email also stops the check-email page rendering the verification"
    echo "link on screen. That on-screen link is keyed on the mail adapter being"
    echo "stubbed, so anyone mid-registration relies on real mail from that moment."
  fi
  exit 0
fi

# ── Step 1: the provider side, which this script cannot do for you ───────────
if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "ses-readiness" ]]; then
  echo "-- step 1: SES readiness --"
  echo ""
  echo "Arming email with any of these unmet does harm rather than nothing:"
  echo ""
  echo "  a. SES_FEEDBACK_WEBHOOK_KEY is installed on the host."
  echo "     Without it the process REFUSES TO BOOT under the live SES adapter, so"
  echo "     this takes production down rather than turning mail on. Install it"
  echo "     with: scripts/activate-ses-feedback.sh --target $TARGET"
  echo "  b. The SNS feedback subscription exists, which means the URL that script"
  echo "     printed is set as the ses_feedback_webhook_url Terraform variable and"
  echo "     applied. Without it bounces and complaints reach nobody."
  echo "  c. The sender identity is VERIFIED with AWS, not Pending."
  echo "  d. The account is OUT of the SES sandbox. Inside it, mail is accepted and"
  echo "     delivered only to individually verified addresses, so 'live' silently"
  echo "     reaches nobody."
  echo "  e. Domain authentication is on and DMARC is DKIM-aligned. Without it the"
  echo "     password-reset, claim and verify emails land in spam at the major"
  echo "     providers, which is worse than dark: dark at least renders the"
  echo "     verification link on screen where the member can use it."
  echo ""
  printf "Type 'SES READY' only if every one of a-e is true: "
  read -r TYPED
  if [[ "$TYPED" != "SES READY" ]]; then
    echo "Aborted: nothing has been changed. Email stays dark, which is the safe" >&2
    echo "state: the check-email page keeps rendering the verification link on" >&2
    echo "screen, so registration still works end to end." >&2
    exit 1
  fi
  echo ""
fi

if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "payments-readiness" ]]; then
  echo "-- step 1: Stripe credentials --"
  echo ""
  echo "Arming payments makes the deploy derive PAYMENT_ADAPTER=live. A production"
  echo "host refuses to boot with the live adapter unless the Stripe webhook secret"
  echo "is present, so arming before activation has finished does not turn payments"
  echo "on: it takes the site down, and getting back up means editing the values"
  echo "file, applying, and deploying again while it stays down."
  echo ""
  if [[ -z "$AWS_PROFILE_ARG" ]]; then
    echo "No --profile was given, so this cannot be checked from here. Re-run with"
    echo "--profile to have it checked, or attest to it."
    echo ""
    printf "Type 'CREDENTIALS IN PLACE' only if activation has already run: "
    read -r TYPED
    if [[ "$TYPED" != "CREDENTIALS IN PLACE" ]]; then
      echo "Aborted: nothing has been changed. Run scripts/activate-payments.sh first." >&2
      exit 1
    fi
  else
    KEY_STATE="$(classify_secret_param stripe_secret_key)"
    WS_STATE="$(classify_secret_param stripe_webhook_secret)"
    echo "  Stripe API key parameter:      $KEY_STATE"
    echo "  Stripe webhook secret parameter: $WS_STATE"
    echo ""
    if [[ "$KEY_STATE" != "set" || "$WS_STATE" != "set" ]]; then
      echo "Aborted: nothing has been changed. Arming now would stop the host booting." >&2
      echo "Run scripts/activate-payments.sh --target $TARGET --profile <profile> first," >&2
      echo "then re-run this. If a parameter reads unreadable, fix the credentials rather" >&2
      echo "than arming past it: this check is the only thing standing between a missing" >&2
      echo "secret and a production outage." >&2
      exit 1
    fi
    echo "  Both parameters hold real values."
  fi
  echo ""
fi

if (( FROM_STEP <= 1 )) && [[ "$PRECONDITION" == "stripe-endpoint" ]]; then
  echo "-- step 1: Stripe webhook endpoint --"
  echo ""
  echo "Disable the live webhook endpoint in the Stripe Dashboard NOW, before this"
  echo "host goes dark (Developers > Webhooks > the endpoint > Disable). Its path is"
  echo "$WEBHOOK_PATH on this environment's public base URL."
  echo ""
  echo "A dark host verifies signatures against the stub secret, so every live"
  echo "delivery fails with 400. Stripe retries for days and then disables the"
  echo "endpoint itself — typically right when the payout events arrive."
  echo ""
  printf "Type 'ENDPOINT DISABLED' once you have done it: "
  read -r TYPED
  if [[ "$TYPED" != "ENDPOINT DISABLED" ]]; then
    echo "Aborted: the endpoint must be disabled before the host goes dark." >&2
    echo "Nothing has been changed. Re-run when it is done." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 2: the declared value ───────────────────────────────────────────────
if (( FROM_STEP <= 2 )); then
  echo "-- step 2: tfvars --"
  if [[ "$CURRENT_TFVARS" == "$STATE" ]]; then
    echo "  $TFVAR_NAME is already \"$STATE\"; leaving the file alone."
  else
    if ! grep -qE "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$TFVARS_PATH"; then
      echo "ERROR: no $TFVAR_NAME assignment found in $TFVARS_PATH." >&2
      echo "       Add one rather than letting this script invent the line." >&2
      exit 1
    fi
    TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-tfvars.XXXXXX")"
    trap 'rm -f "${TFVARS_TMP:-}"' EXIT INT TERM
    STATE_VALUE="$STATE" VAR_NAME="$TFVAR_NAME" awk '
      BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*=" }
      $0 ~ pattern && !done {
        match($0, pattern "[ \t]*")
        printf "%s\"%s\"\n", substr($0, 1, RLENGTH), ENVIRON["STATE_VALUE"]
        done = 1
        next
      }
      { print }
    ' "$TFVARS_PATH" > "$TFVARS_TMP"

    echo ""
    diff -u "$TFVARS_PATH" "$TFVARS_TMP" || true
    echo ""
    printf "Apply this change to %s? (yes/no): " "$TFVARS_PATH"
    read -r CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
      echo "Aborted: tfvars not changed." >&2
      exit 1
    fi
    cat "$TFVARS_TMP" > "$TFVARS_PATH"
    echo "  $TFVAR_NAME = \"$STATE\" written."
  fi
  echo ""
fi

SYNTHETIC=0
[[ -n "$TFVARS_OVERRIDE" ]] && SYNTHETIC=1

if (( SYNTHETIC )); then
  echo "-- synthetic mode: stopping before terraform and deploy --"
  echo "Would next run:"
  echo "  terraform -chdir=$TF_DIR apply"
  echo "  DEPLOY_TARGET=$SSH_ALIAS $DEPLOY_CMD ${DEPLOY_ARGS[*]}"
  # Test seam. With an injected deploy command, run that one command so its
  # argument list is observable, then stop. Nothing else in the real sequence
  # runs: no terraform, no SSH, no host probe, and not the egress lookup either.
  # The flags carried here are a safety property, so a test that cannot execute
  # this line can only ever assert the sentence above it.
  if [[ -n "${ARMING_DEPLOY_CMD:-}" ]]; then
    DEPLOY_TARGET="$SSH_ALIAS" "$DEPLOY_CMD" "${DEPLOY_ARGS[@]}"
  fi
  exit 0
fi

# ── Step 3: publish it ───────────────────────────────────────────────────────
if (( FROM_STEP <= 3 )); then
  echo "-- step 3: terraform apply --"
  echo ""
  echo "This publishes $TFVAR_NAME = \"$STATE\" as SSM /footbag/$TARGET/app/$SSM_SUFFIX."
  echo "Blast radius is small: the arming parameter, plus the CloudFront origin CIDR"
  echo "refresh that every apply performs. Nothing recreates the host."
  echo ""
  printf "Type 'APPLY' to run terraform apply: "
  read -r TYPED
  if [[ "$TYPED" != "APPLY" ]]; then
    echo "Aborted before terraform apply. The tfvars change is already written;" >&2
    echo "resume with --from-step 3 when ready." >&2
    exit 1
  fi
  if ! terraform -chdir="$TF_DIR" apply; then
    echo "ERROR: terraform apply failed. Resume with --from-step 3 once fixed." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 4: the deploy, which has an SSH half ────────────────────────────────
if (( FROM_STEP <= 4 )); then
  echo "-- step 4: deploy --"
  echo ""
  # SSH to the host is restricted to the operator CIDRs in this environment's
  # tfvars. A travelling workstation's address changes, and a rotation between
  # the apply and the deploy strands the deploy part-way through its remote
  # half, which is the worst moment to discover it.
  EGRESS_IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]')" || EGRESS_IP=""
  if [[ -z "$EGRESS_IP" ]]; then
    echo "  Could not determine this workstation's egress address (no network answer)."
    echo "  The deploy needs SSH to $SSH_ALIAS from an allowlisted address."
  else
    echo "  This workstation's egress address: $EGRESS_IP"
    if grep -q "$EGRESS_IP/32" "$TFVARS_PATH"; then
      echo "  Found $EGRESS_IP/32 in the operator allowlist."
    else
      echo "  $EGRESS_IP/32 is not listed verbatim in operator_cidrs; it may still fall"
      echo "  inside a configured range. Current operator_cidrs:"
      sed -n '/operator_cidrs/,/]/p' "$TFVARS_PATH" | sed 's/^/    /'
      echo ""
      printf "  Is this address covered? (yes/no): "
      read -r COVERED
      if [[ "$COVERED" != "yes" ]]; then
        echo "Aborted before the deploy. Add today's address to operator_cidrs (add, never" >&2
        echo "replace, or the standing ranges are lost), terraform apply, then resume with" >&2
        echo "--from-step 4." >&2
        exit 1
      fi
    fi
  fi
  echo ""
  echo "  Running a CODE-ONLY deploy. Expect 15-25 seconds of degraded service."
  echo ""
  # The -k in DEPLOY_ARGS is load-bearing, not decoration. A bare wrapper
  # invocation is the one form that treats schema drift as an invitation to
  # rebuild: it offers to replace the deployed database and that prompt defaults
  # to yes, so an operator pressing enter to get past it re-runs the whole deploy
  # as a data-replacing one. With -k the same drift routes to a prompt that
  # defaults to no and aborts. Arming must never be able to become a database
  # replace, whatever is answered here.
  if ! DEPLOY_TARGET="$SSH_ALIAS" "$DEPLOY_CMD" "${DEPLOY_ARGS[@]}"; then
    echo "ERROR: the deploy failed. SSM already declares \"$STATE\" but the host does not" >&2
    echo "       yet run it. Resume with --from-step 4." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 5: prove it, and say what happens next ──────────────────────────────
echo "-- step 5: verify --"
echo ""
bash "$REPO_ROOT/scripts/bringup-status.sh" --target "$TARGET" ${AWS_PROFILE_ARG:+--profile "$AWS_PROFILE_ARG"} || true
echo ""
echo "Confirm above that the host reads $SWITCH $STATE and that $ADAPTER_LABEL is"
echo "$([[ "$STATE" == "armed" ]] && echo live || echo stub). The go-live marker is not touched by arming;"
echo "move it deliberately with scripts/production-live-marker.sh if that is what you meant."

if [[ "$SWITCH" == "email" && "$STATE" == "armed" ]]; then
  echo ""
  echo "The check-email page no longer renders the verification link on screen: that"
  echo "behaviour is keyed on the mail adapter being stubbed. Anyone registering from"
  echo "now on depends on real mail arriving, so send yourself one before trusting it."
fi

if [[ "$SWITCH" == "payments" && "$STATE" == "dark" ]]; then
  echo ""
  echo "Expect one false reconciliation issue within a day. The nightly pass runs"
  echo "whatever the adapter is, and the stub's ledger is empty, so it will raise a"
  echo "\"payment missing at provider\" issue against every real payment and put a"
  echo "work-queue card in front of the administrator. Resolve it with a note saying"
  echo "what it was; it is an artefact of disarming, not a discrepancy."
fi
