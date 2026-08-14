#!/usr/bin/env bash
# activate-payments.sh
#
# First-time live-payments activation for a deployed host, end to end:
#
#   1. Store the Stripe secret API key in SSM Parameter Store
#      (/footbag/<target>/secrets/stripe_secret_key, SecureString under the
#      environment's KMS alias). The key is prompted silently and written via
#      a 0600 temp file so it never appears in shell history or process args.
#   2. Pause for the one step that cannot be scripted: creating the webhook
#      endpoint in the Stripe Dashboard and copying its whsec_... signing
#      secret, which is then prompted silently.
#   3. Store the signing secret in Parameter Store too
#      (/footbag/<target>/secrets/stripe_webhook_secret). Parameter Store is the
#      one canonical source for every secret in an environment, and the deploy
#      syncs this value into the host env file on every run; writing only the
#      host would leave the canonical parameter on its placeholder and the
#      running value with no declared source.
#   4. Rewrite /srv/footbag/env on the host: STRIPE_WEBHOOK_SECRET=<value>,
#      replace-or-append with duplicate assignments collapsed. A secret-masked
#      diff is shown for confirmation before the push, and no backup copy is
#      left on the host: the deploy rebuilds that file from the parameter
#      store, so undoing an activation means restoring the previous parameter
#      value and deploying. PAYMENT_ADAPTER is never
#      written here: the deploy derives it from the SSM payments arming flag
#      (armed -> live, dark -> stub), so activation provisions credentials and
#      arming is the separate Terraform step (tfvars flip + apply + deploy).
#   5. Run the PAYMENTS-BOOT gate (validate-payments-boot.sh) against the
#      updated file, then print the arming and verification steps.
#
# Activation targets production only: the config loader refuses the live
# payment SDK below production, so staging never activates and never holds a
# Stripe key. The key mode follows the production-live marker: a test-mode
# key (sk_test_) is valid only while the marker reads pre-live (the
# pre-cutover test-mode exercise); the live key (sk_live_) takes over from
# the live canary onward, and the runtime refuses a mismatched key at first
# use. The webhook secret must be a real whsec_ value; the stub adapter's
# whsec_stub prefix is rejected.
#
# Sudo pattern for the host env file: user-tmp + `ssh -t` interactive sudo
# install. The operator types the sudo password directly into sudo's noecho
# prompt; it is never piped, captured, or logged.
#
# Webhook signing-secret rotation (after first-time activation) is a two-step
# roll, so no delivery is dropped while both the old and new secrets are briefly
# valid:
#   --rotate-webhook-secret shifts the current STRIPE_WEBHOOK_SECRET to
#     STRIPE_WEBHOOK_SECRET_PREVIOUS and installs a new one, in the host env
#     file and in the two Parameter Store entries alike, so a deploy during the
#     roll window reinstalls the pair rather than reverting it. It touches no
#     Stripe API key. Plain activation refuses to overwrite an existing
#     differing secret and points here instead.
#   --complete-webhook-rotation clears STRIPE_WEBHOOK_SECRET_PREVIOUS once every
#     delivery signs with the new secret, returning its parameter to the
#     placeholder. Idempotent.
#
# --deactivate is the reverse of activation, and exists so a test-mode exercise
# on pre-cutover production leaves nothing behind. Without it the exercise closes
# a door: the signing secret it installs survives disarming, because the deploy
# re-syncs it from Parameter Store on every run whatever the arming state, and a
# later plain activation then refuses to replace a secret already in service and
# sends the operator to the rotation, which in turn refuses because it requires
# the live payment adapter that disarming has just removed. Deactivation returns
# both Stripe parameters and the rotation twin to the placeholder and removes the
# signing-secret lines from the host env file, so the next activation is a first
# activation again. It requires the host to be dark already: removing the secret
# from a live-adapter host would fail signature verification immediately and
# refuse to boot on the next restart. It reads no secret and prompts for none.
#
# Usage:
#   scripts/activate-payments.sh --target production --profile <prod-profile>
#   scripts/activate-payments.sh --target production --dry-run
#   scripts/activate-payments.sh --target production --profile <p> --rotate-webhook-secret
#   scripts/activate-payments.sh --target production --profile <p> --complete-webhook-rotation
#   scripts/activate-payments.sh --target production --profile <p> --deactivate
#
#   --replace-key allows activation to overwrite a Stripe API key parameter that
#   already holds a different real key. Without it, activation refuses: the
#   current value cannot be recovered from here, and hosts keep using the old key
#   until their next deploy, so a silent replacement is invisible and one-way.
#
# Synthetic mode (CI tests only; operators never use these):
#   --env-file <path> treats the local file as the host env, skips ssh and
#   aws entirely, and reads the secrets from STRIPE_SECRET_KEY_VALUE and
#   STRIPE_WEBHOOK_SECRET_VALUE instead of prompting. Rotation reads only
#   STRIPE_WEBHOOK_SECRET_VALUE (the new secret); completion reads neither.
set -euo pipefail

TARGET="staging"
SSH_ALIAS=""
AWS_PROFILE_ARG=""
ENV_FILE_OVERRIDE=""
DRY_RUN=0
REPLACE_KEY=0
MODE="activate"
HOST_ENV_PATH="/srv/footbag/env"

# Kept equal to the dispatcher's required-event constant and the pinned Stripe
# API version in the application source; a unit test asserts the three match, so
# editing one side without the others fails the suite. An endpoint subscribed to
# a narrower list silently drops the rest: money moves and nothing records it.
REQUIRED_WEBHOOK_EVENTS="payment_intent.succeeded payment_intent.payment_failed charge.refunded charge.dispute.created charge.dispute.closed charge.dispute.funds_withdrawn payout.failed checkout.session.expired customer.subscription.created customer.subscription.updated customer.subscription.deleted invoice.payment_succeeded invoice.payment_failed"
STRIPE_API_VERSION="2026-05-27.dahlia"

# Prints the Stripe Dashboard webhook-endpoint setup an operator must complete
# by hand: the endpoint path, the exact API version to pin, and every event the
# dispatcher handles. Reused by the dry-run summary and the activation pause so
# the operator sees one authoritative list.
print_endpoint_requirements() {
  echo "  - endpoint URL: the environment's PUBLIC_BASE_URL + /payments/webhook"
  echo "  - endpoint API version: exactly $STRIPE_API_VERSION"
  echo "  - subscribed events:"
  local evt
  for evt in $REQUIRED_WEBHOOK_EVENTS; do
    echo "      $evt"
  done
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
    --profile)
      AWS_PROFILE_ARG="${2:-}"
      shift 2 || { echo "ERROR: --profile requires an argument" >&2; exit 2; }
      ;;
    --env-file)
      ENV_FILE_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --env-file requires an argument" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --replace-key)
      REPLACE_KEY=1
      shift
      ;;
    --deactivate)
      MODE="deactivate"
      shift
      ;;
    --rotate-webhook-secret)
      MODE="rotate"
      shift
      ;;
    --complete-webhook-rotation)
      MODE="complete"
      shift
      ;;
    --help|-h)
      sed -n '2,49p' "$0"
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

# Staging never reaches Stripe: the config loader refuses the live payment SDK
# below production, so there is nothing to activate there. The stub adapter and
# its deploy-seeded signing secret are staging's permanent shape. Rotation
# modes are not refused by target: their own precondition (an env file already
# on the live adapter) refuses a stub host naturally.
if [[ "$MODE" == "activate" && "$TARGET" == "staging" && -z "$ENV_FILE_OVERRIDE" ]]; then
  echo "ERROR: staging never activates live payments; the live payment SDK boots only on" >&2
  echo "       production, and every real-Stripe exercise (test mode included) runs on" >&2
  echo "       pre-cutover production. There is no staging Stripe key to provision." >&2
  exit 1
fi

if [[ -z "$SSH_ALIAS" ]]; then
  SSH_ALIAS="footbag-$TARGET"
fi

SSM_PARAM="/footbag/$TARGET/secrets/stripe_secret_key"
SSM_WEBHOOK_PARAM="/footbag/$TARGET/secrets/stripe_webhook_secret"
SSM_WEBHOOK_PREV_PARAM="/footbag/$TARGET/secrets/stripe_webhook_secret_previous"
KMS_ALIAS="alias/footbag-$TARGET"
# The value Terraform seeds into a secret parameter it does not own. The deploy
# treats it as "no value yet", and clearing a rotation window means putting it
# back rather than deleting a parameter Terraform declares.
SSM_PLACEHOLDER="TODO-set-via-cli-after-apply"

# Writes one secret to Parameter Store. The value travels through a 0600 temp
# file passed as file://, never as an argument, so it cannot be read out of the
# process table by any account on this host; the file is shredded on every exit
# path including a failed put.
put_ssm_secret() {
  local param_name="$1" param_value="$2"
  umask 077
  # KEY_TMP is deliberately global. A trap cannot see a function-local, and the
  # window that matters is between creating this file and shredding it: an
  # interrupt there used to leave the plaintext secret in /tmp, because the only
  # trap in this script named a variable nothing ever assigned. The trap that
  # covers it is installed immediately below this definition, and the later
  # cleanup_remote trap that replaces it shreds the same variable, so the window
  # stays covered across both.
  KEY_TMP="$(mktemp /tmp/footbag-ssm-val.XXXXXX)"
  printf '%s' "$param_value" > "$KEY_TMP"
  if ! aws ssm put-parameter \
    --name "$param_name" \
    --value "file://$KEY_TMP" \
    --type SecureString \
    --key-id "$KMS_ALIAS" \
    --overwrite \
    --profile "$AWS_PROFILE_ARG" >/dev/null; then
    shred -u "$KEY_TMP" 2>/dev/null || true
    KEY_TMP=""
    echo "ERROR: failed to write $param_name to Parameter Store." >&2
    return 1
  fi
  shred -u "$KEY_TMP" 2>/dev/null || true
  KEY_TMP=""
  echo "  stored $param_name"
}
KEY_TMP=""
trap 'shred -u "${KEY_TMP:-}" 2>/dev/null || true' EXIT INT TERM

# Reads a Parameter Store value without decrypting it into a variable any longer
# than the comparison needs. Returns empty when the parameter is absent or
# unreadable; callers that must distinguish those cases check the exit status.
read_ssm_secret() {
  aws ssm get-parameter \
    --name "$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text \
    --profile "$AWS_PROFILE_ARG" 2>/dev/null
}

if (( DRY_RUN )); then
  case "$MODE" in
    activate)
      echo "== dry run: activate live payments on $TARGET (ssh alias: $SSH_ALIAS) =="
      echo ""
      echo "Would run, in order:"
      echo "  1. Prompt (silent) for the Stripe secret API key"
      echo "     (sk_test_ while the production-live marker reads pre-live; sk_live_ from the canary on)"
      echo "  2. Pause: create the webhook endpoint in the Stripe Dashboard"
      echo "     (PUBLIC_BASE_URL + /payments/webhook), then prompt (silent) for its whsec_ secret"
      echo "  3. Stage $HOST_ENV_PATH down from $SSH_ALIAS (ssh -t + sudo install)"
      echo "  4. Check every refusal BEFORE anything is written: key shape, whsec_ shape,"
      echo "     SECRETS_ADAPTER=live on the host, no signing secret already in service, and"
      echo "     no different Stripe key already in $SSM_PARAM (override: --replace-key)"
      echo "  5. aws ssm put-parameter --name $SSM_PARAM --type SecureString \\"
      echo "       --key-id $KMS_ALIAS --overwrite --profile <profile> --value file://<0600 temp>"
      echo "  6. aws ssm put-parameter --name $SSM_WEBHOOK_PARAM --type SecureString \\"
      echo "       --key-id $KMS_ALIAS --overwrite --profile <profile> --value file://<0600 temp>"
      echo "  7. Rewrite STRIPE_WEBHOOK_SECRET=... (the deploy"
      echo "     derives PAYMENT_ADAPTER from the arming flag, so it is not written here)"
      echo "  8. Show a secret-masked diff, confirm, push back (no .bak left on host)"
      echo "  9. Run the PAYMENTS-BOOT gate against the updated file"
      echo " 10. Print the deploy (./deploy_to_aws.sh) and checkout+refund verification steps"
      echo ""
      echo "The webhook endpoint (step 2) must be created in the Stripe Dashboard with:"
      print_endpoint_requirements
      ;;
    rotate)
      echo "== dry run: rotate the webhook signing secret on $TARGET (ssh alias: $SSH_ALIAS) =="
      echo ""
      echo "Would run, in order:"
      echo "  1. Prompt (silent) for the NEW whsec_ signing secret (no API key is read)"
      echo "  2. Stage $HOST_ENV_PATH down from $SSH_ALIAS"
      echo "  3. Refuse unless STRIPE_WEBHOOK_SECRET is already set, PAYMENT_ADAPTER=live,"
      echo "     no rotation window is already open, and the new secret differs"
      echo "  4. Write the new secret to $SSM_WEBHOOK_PARAM and the outgoing one to"
      echo "     $SSM_WEBHOOK_PREV_PARAM, so a deploy mid-roll reinstalls the pair"
      echo "  5. Shift the current secret to STRIPE_WEBHOOK_SECRET_PREVIOUS and install"
      echo "     the new STRIPE_WEBHOOK_SECRET (secrets masked in the diff)"
      echo "  6. Confirm, push back, run the PAYMENTS-BOOT gate, print the completion step"
      ;;
    complete)
      echo "== dry run: complete a webhook-secret rotation on $TARGET (ssh alias: $SSH_ALIAS) =="
      echo ""
      echo "Would stage $HOST_ENV_PATH from $SSH_ALIAS, return"
      echo "$SSM_WEBHOOK_PREV_PARAM to its placeholder, and remove the"
      echo "STRIPE_WEBHOOK_SECRET_PREVIOUS line (idempotent: a no-op when no"
      echo "rotation window is open), then push back and run the PAYMENTS-BOOT gate."
      ;;
    deactivate)
      echo "== dry run: remove payment credentials from $TARGET (ssh alias: $SSH_ALIAS) =="
      echo ""
      echo "Would run, in order:"
      echo "  1. Require the typed phrase REMOVE PAYMENT CREDENTIALS"
      echo "  2. Stage $HOST_ENV_PATH down from $SSH_ALIAS and REFUSE if"
      echo "     PAYMENT_ADAPTER=live: disarm payments first, or the host fails every"
      echo "     delivery at once and refuses to boot on its next restart"
      echo "  3. Return all three parameters to the placeholder:"
      echo "       $SSM_PARAM"
      echo "       $SSM_WEBHOOK_PARAM"
      echo "       $SSM_WEBHOOK_PREV_PARAM"
      echo "  4. Remove the STRIPE_WEBHOOK_SECRET and STRIPE_WEBHOOK_SECRET_PREVIOUS"
      echo "     lines from the host env file (the stub twin is left alone; a dark"
      echo "     host verifies against it)"
      echo "  5. Show a secret-masked diff, confirm, push back, run the PAYMENTS-BOOT gate"
      echo ""
      echo "Point of the mode: a test-mode exercise leaves nothing behind, so the next"
      echo "activation is a first activation rather than a rotation."
      ;;
  esac
  exit 0
fi

# -----------------------------------------------------------------------------
# Collect and validate the secrets each mode needs.
# activate needs the Stripe API key and a webhook secret; rotate needs only the
# new webhook secret; complete needs neither (it clears one env line).
# -----------------------------------------------------------------------------
STRIPE_KEY=""
WEBHOOK_SECRET=""
if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  if [[ ! -f "$ENV_FILE_OVERRIDE" ]]; then
    echo "ERROR: --env-file path '$ENV_FILE_OVERRIDE' does not exist" >&2
    exit 2
  fi
  case "$MODE" in
    activate)
      STRIPE_KEY="${STRIPE_SECRET_KEY_VALUE:-}"
      WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET_VALUE:-}"
      if [[ -z "$STRIPE_KEY" || -z "$WEBHOOK_SECRET" ]]; then
        echo "ERROR: --env-file activation requires STRIPE_SECRET_KEY_VALUE and STRIPE_WEBHOOK_SECRET_VALUE in the environment." >&2
        exit 2
      fi
      ;;
    rotate)
      WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET_VALUE:-}"
      if [[ -z "$WEBHOOK_SECRET" ]]; then
        echo "ERROR: --env-file rotation requires STRIPE_WEBHOOK_SECRET_VALUE (the new signing secret) in the environment." >&2
        exit 2
      fi
      ;;
    complete)
      : # completing a rotation only clears an env line; no secret is read
      ;;
    deactivate)
      : # deactivation only removes env lines and resets parameters
      ;;
  esac
else
  # Every real-host mode now writes Parameter Store, so every one needs a
  # profile: rotation and completion move the signing-secret parameters just as
  # activation does, and a roll that updated only the host would be undone by
  # the next deploy's sync.
  if [[ -z "$AWS_PROFILE_ARG" ]]; then
    echo "ERROR: --profile is required (the AWS profile that may write the" >&2
    echo "       /footbag/$TARGET/secrets/stripe_* parameters)" >&2
    exit 2
  fi
  if [[ "$MODE" == "activate" ]]; then
    if [[ "$TARGET" == "production" ]]; then
      echo "This activates LIVE Stripe payments on production."
      printf "Type 'ACTIVATE LIVE PAYMENTS' to continue: "
      read -r CONFIRM
      if [[ "$CONFIRM" != "ACTIVATE LIVE PAYMENTS" ]]; then
        echo "Aborted: confirmation phrase not entered." >&2
        exit 1
      fi
    fi
    printf "Stripe secret API key (input hidden): "
    read -rs STRIPE_KEY
    echo ""
  fi
  if [[ "$MODE" == "deactivate" ]]; then
    echo "This removes the Stripe payment credentials from $TARGET: both parameters"
    echo "and the rotation twin go back to the placeholder, and the signing-secret"
    echo "lines are removed from the host env file. The next activation will be a"
    echo "first activation again. Nothing else is touched, and no money is involved."
    printf "Type 'REMOVE PAYMENT CREDENTIALS' to continue: "
    read -r CONFIRM
    if [[ "$CONFIRM" != "REMOVE PAYMENT CREDENTIALS" ]]; then
      echo "Aborted: confirmation phrase not entered." >&2
      exit 1
    fi
  fi
fi

if [[ "$MODE" == "activate" ]]; then
  if [[ "$STRIPE_KEY" != sk_live_* && "$STRIPE_KEY" != sk_test_* ]]; then
    echo "ERROR: Stripe secret keys start with sk_live_ or sk_test_." >&2
    exit 1
  fi
  if [[ "$TARGET" == "production" && "$STRIPE_KEY" == sk_test_* ]]; then
    echo "NOTICE: test-mode key supplied. Production accepts it only while the production-live"
    echo "        marker (/footbag/production/app/production_live) reads pre-live; the runtime"
    echo "        refuses a test key at first payment use once the marker flips at go-live."
  fi
fi

# The Stripe key is NOT written here. It used to be, and that put the one
# irreversible write in this script ahead of three refusals that can still abort
# it: the webhook-secret shape check below, the SECRETS_ADAPTER check, and the
# refusal to replace a signing secret already in service. An abort at any of
# them left the key parameter already replaced with no way back to the previous
# value. Both secrets are now written together, after every check has passed.

# Step 2: the Stripe Dashboard part cannot be scripted; pause for it. Activation
# creates the endpoint; rotation rolls its signing secret. Completion supplies
# no secret and skips this pause.
if [[ ( "$MODE" == "activate" || "$MODE" == "rotate" ) && -z "$ENV_FILE_OVERRIDE" ]]; then
  echo ""
  if [[ "$MODE" == "activate" ]]; then
    echo "Now create the webhook endpoint in the Stripe Dashboard:"
    print_endpoint_requirements
  else
    echo "Now roll the endpoint's signing secret in the Stripe Dashboard"
    echo "(Developers > Webhooks > the endpoint > Roll secret), keeping it"
    echo "subscribed to:"
    print_endpoint_requirements
  fi
  echo "Then copy the endpoint's signing secret (whsec_...)."
  echo ""
  printf "Webhook signing secret (input hidden): "
  read -rs WEBHOOK_SECRET
  echo ""
fi

# Only the modes that install a secret validate its shape. Completion and
# deactivation supply none: they remove lines and reset parameters.
if [[ "$MODE" != "complete" && "$MODE" != "deactivate" ]]; then
  if [[ "$WEBHOOK_SECRET" != whsec_* ]]; then
    echo "ERROR: webhook signing secrets start with whsec_." >&2
    exit 1
  fi
  if [[ "$WEBHOOK_SECRET" == whsec_stub* ]]; then
    echo "ERROR: whsec_stub is the stub adapter's placeholder; supply the real Dashboard signing secret." >&2
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# Step 3: fetch the host env file (or use the local override), rewrite it.
# -----------------------------------------------------------------------------
if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  OLD_LOCAL="$ENV_FILE_OVERRIDE"
else
  LOCAL_PID=$$
  TMP_REMOTE="/tmp/footbag-env-activate-${LOCAL_PID}.env"
  cleanup_remote() {
    ssh -o BatchMode=yes "$SSH_ALIAS" "shred -u $TMP_REMOTE" 2>/dev/null || true
    shred -u "${KEY_TMP:-}" "${OLD_LOCAL:-}" "${NEW_LOCAL:-}" 2>/dev/null || true
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
  OLD_LOCAL="$(mktemp /tmp/footbag-env-old.XXXXXX)"
  ssh -o BatchMode=yes "$SSH_ALIAS" "cat $TMP_REMOTE" > "$OLD_LOCAL" || {
    echo "ERROR: staged temp file $TMP_REMOTE was unreadable on $SSH_ALIAS." >&2
    exit 1
  }
fi

if ! grep -qE '^SECRETS_ADAPTER=["'"'"']?live["'"'"']?$' "$OLD_LOCAL"; then
  echo "ERROR: SECRETS_ADAPTER=live is not set in the host env file." >&2
  echo "The live payment adapter resolves the Stripe key through the live SecretsAdapter;" >&2
  echo "set SECRETS_ADAPTER=live (and its FOOTBAG_ENV companion) first." >&2
  exit 1
fi

# Reads the last assignment of an env var from the staged file, matching how the
# application parses it (last-wins). Always returns 0 so an absent key does not
# trip `set -e` inside the command substitution.
env_value() {
  grep -E "^$1=" "$OLD_LOCAL" | tail -1 | cut -d= -f2- || true
}
CURRENT_WS="$(env_value STRIPE_WEBHOOK_SECRET)"
PREVIOUS_WS="$(env_value STRIPE_WEBHOOK_SECRET_PREVIOUS)"

case "$MODE" in
  activate)
    # First-time activation must not silently replace a signing secret already
    # in service; changing it is a rotation, not an activation.
    if [[ -n "$CURRENT_WS" && "$CURRENT_WS" != "$WEBHOOK_SECRET" ]]; then
      echo "ERROR: STRIPE_WEBHOOK_SECRET is already set to a different value; plain activation will not overwrite it." >&2
      echo "To change the signing secret, run a two-step roll: --rotate-webhook-secret now," >&2
      echo "then --complete-webhook-rotation once every delivery signs with the new secret." >&2
      exit 1
    fi
    ;;
  rotate)
    if [[ -z "$CURRENT_WS" ]]; then
      echo "ERROR: no STRIPE_WEBHOOK_SECRET is set, so there is nothing to rotate." >&2
      echo "Use plain activation to set the signing secret for the first time." >&2
      exit 1
    fi
    if [[ "$CURRENT_WS" == "$WEBHOOK_SECRET" ]]; then
      echo "ERROR: the new webhook secret is identical to the current one." >&2
      exit 1
    fi
    if [[ -n "$PREVIOUS_WS" ]]; then
      echo "ERROR: STRIPE_WEBHOOK_SECRET_PREVIOUS is already set; a rotation window is open." >&2
      echo "Finish it with --complete-webhook-rotation before starting another roll." >&2
      exit 1
    fi
    if ! grep -qE '^PAYMENT_ADAPTER=["'"'"']?live["'"'"']?$' "$OLD_LOCAL"; then
      echo "ERROR: PAYMENT_ADAPTER=live is not set; rotate the signing secret only on a live host." >&2
      exit 1
    fi
    ;;
  complete)
    if [[ -z "$PREVIOUS_WS" ]]; then
      echo "No STRIPE_WEBHOOK_SECRET_PREVIOUS is set; no rotation window to close."
      exit 0
    fi
    ;;
  deactivate)
    # A live host verifies every incoming delivery against this secret, and the
    # boot gate refuses the live adapter without one, so removing it here would
    # fail deliveries at once and stop the host coming back on its next restart.
    # Disarming is what makes removal safe, and it is a separate deliberate step.
    if grep -qE '^PAYMENT_ADAPTER=["'"'"']?live["'"'"']?$' "$OLD_LOCAL"; then
      echo "ERROR: PAYMENT_ADAPTER=live on this host; disarm payments before removing" >&2
      echo "       the credentials. Disable the Stripe webhook endpoint in the Dashboard," >&2
      echo "       then: scripts/arming.sh --target $TARGET --switch payments --state dark" >&2
      exit 1
    fi
    if [[ -z "$CURRENT_WS" && -z "$PREVIOUS_WS" ]]; then
      echo "No STRIPE_WEBHOOK_SECRET on the host; resetting the parameters only."
    fi
    ;;
esac

# Parameter Store is the declared source for the signing secrets and the deploy
# syncs both into the host env file on every run, so they are written here
# before the host is touched: an abort after this point converges on the next
# deploy, whereas writing only the host would be reverted by it. Skipped
# entirely in the synthetic --env-file mode, which reaches no AWS.
if [[ -z "$ENV_FILE_OVERRIDE" ]]; then
  echo ""
  echo "Storing the webhook signing secret(s) in Parameter Store..."
  case "$MODE" in
    activate)
      # The API key parameter is written with --overwrite, so a re-run replaces
      # whatever is there. That is right for a first activation and wrong for a
      # second one: the previous key is not recoverable from here, and a running
      # host keeps working against the old key until the next deploy, so a silent
      # replacement is a change nobody can see and nobody can undo. Refuse unless
      # the operator says explicitly that replacement is the intent. Matches the
      # protection the signing secret already has.
      CURRENT_KEY="$(read_ssm_secret "$SSM_PARAM" || true)"
      if [[ -n "$CURRENT_KEY" && "$CURRENT_KEY" != TODO-* && "$CURRENT_KEY" != "$STRIPE_KEY" ]]; then
        if (( REPLACE_KEY )); then
          echo "  --replace-key given: replacing the existing Stripe API key."
        else
          echo "ERROR: $SSM_PARAM already holds a different Stripe API key." >&2
          echo "Activation will not replace it silently: the current value cannot be recovered" >&2
          echo "from here, and hosts keep using the old key until their next deploy." >&2
          echo "Re-run with --replace-key if replacing it is what you mean to do." >&2
          exit 1
        fi
      fi
      put_ssm_secret "$SSM_PARAM" "$STRIPE_KEY"
      put_ssm_secret "$SSM_WEBHOOK_PARAM" "$WEBHOOK_SECRET"
      ;;
    rotate)
      # Both halves of the roll window are declared, so a deploy landing between
      # the roll and its completion reinstalls the pair that is actually in
      # service rather than dropping the outgoing secret and failing deliveries
      # Stripe is still signing with it.
      put_ssm_secret "$SSM_WEBHOOK_PARAM" "$WEBHOOK_SECRET"
      put_ssm_secret "$SSM_WEBHOOK_PREV_PARAM" "$CURRENT_WS"
      ;;
    complete)
      # Back to the placeholder rather than deleted: Terraform declares the
      # parameter, so removing it would be reverted on the next apply, and the
      # deploy reads the placeholder as "no outgoing secret".
      put_ssm_secret "$SSM_WEBHOOK_PREV_PARAM" "$SSM_PLACEHOLDER"
      ;;
    deactivate)
      # All three back to the placeholder, for the same reason completion resets
      # its twin: Terraform declares them, so a delete would be reverted on the
      # next apply. The parameters go first and the host env second, matching
      # activation's order, because a deploy landing between the two steps reads
      # a placeholder and leaves the host alone, whereas the reverse order would
      # let that deploy reinstall the secret this run is removing.
      put_ssm_secret "$SSM_PARAM" "$SSM_PLACEHOLDER"
      put_ssm_secret "$SSM_WEBHOOK_PARAM" "$SSM_PLACEHOLDER"
      put_ssm_secret "$SSM_WEBHOOK_PREV_PARAM" "$SSM_PLACEHOLDER"
      ;;
  esac
fi

umask 077
NEW_LOCAL="$(mktemp /tmp/footbag-env-new.XXXXXX)"
# Replace-or-append, collapsing duplicate assignments so last-wins parsing
# cannot diverge from what the diff shows. Secrets travel via the environment,
# not argv, so they never appear in the process table.
case "$MODE" in
  activate)
    # PAYMENT_ADAPTER is deliberately untouched: the deploy derives it from
    # the SSM payments arming flag, so activation writes credentials only.
    WS_VALUE="$WEBHOOK_SECRET" awk '
      BEGIN { seen_ws = 0 }
      /^STRIPE_WEBHOOK_SECRET=/ {
        if (!seen_ws) { print "STRIPE_WEBHOOK_SECRET=" ENVIRON["WS_VALUE"]; seen_ws = 1 }
        next
      }
      { print }
      END {
        if (!seen_ws) print "STRIPE_WEBHOOK_SECRET=" ENVIRON["WS_VALUE"]
      }
    ' "$OLD_LOCAL" > "$NEW_LOCAL"
    ;;
  rotate)
    # Move the in-service secret to STRIPE_WEBHOOK_SECRET_PREVIOUS and install
    # the new one. PAYMENT_ADAPTER is left untouched; the host is already live.
    WS_VALUE="$WEBHOOK_SECRET" WS_PREV_VALUE="$CURRENT_WS" awk '
      BEGIN { seen_ws = 0; seen_prev = 0 }
      /^STRIPE_WEBHOOK_SECRET_PREVIOUS=/ {
        if (!seen_prev) { print "STRIPE_WEBHOOK_SECRET_PREVIOUS=" ENVIRON["WS_PREV_VALUE"]; seen_prev = 1 }
        next
      }
      /^STRIPE_WEBHOOK_SECRET=/ {
        if (!seen_ws) { print "STRIPE_WEBHOOK_SECRET=" ENVIRON["WS_VALUE"]; seen_ws = 1 }
        next
      }
      { print }
      END {
        if (!seen_ws) print "STRIPE_WEBHOOK_SECRET=" ENVIRON["WS_VALUE"]
        if (!seen_prev) print "STRIPE_WEBHOOK_SECRET_PREVIOUS=" ENVIRON["WS_PREV_VALUE"]
      }
    ' "$OLD_LOCAL" > "$NEW_LOCAL"
    ;;
  complete)
    # Drop every STRIPE_WEBHOOK_SECRET_PREVIOUS line; keep the rest verbatim.
    awk '
      /^STRIPE_WEBHOOK_SECRET_PREVIOUS=/ { next }
      { print }
    ' "$OLD_LOCAL" > "$NEW_LOCAL"
    ;;
  deactivate)
    # Drop both signing-secret lines and keep the rest verbatim. The stub twin
    # STRIPE_WEBHOOK_SECRET_STUB stays: it is what a dark host verifies against,
    # the deploy seeds it when absent, and it is not a Stripe value. The Stripe
    # API key is never written to the host env file by this script, so there is
    # no key line to remove; its parameter reset above is the whole of it.
    awk '
      /^STRIPE_WEBHOOK_SECRET_PREVIOUS=/ { next }
      /^STRIPE_WEBHOOK_SECRET=/ { next }
      { print }
    ' "$OLD_LOCAL" > "$NEW_LOCAL"
    ;;
esac

# Mask every value whose key names a secret or key, so a secret sitting in the
# diff's unchanged context window is not printed in the clear alongside the line
# that actually changed.
mask() {
  sed -E 's/^([A-Za-z_][A-Za-z0-9_]*(SECRET|KEY)[A-Za-z0-9_]*)=.*/\1=********/' "$1"
}

echo ""
echo "Env file change (secrets masked):"
diff -u <(mask "$OLD_LOCAL") <(mask "$NEW_LOCAL") || true
echo ""

# -----------------------------------------------------------------------------
# Step 4: push the rewritten file back (or finish in place in override mode),
# then run the PAYMENTS-BOOT gate against the result.
# -----------------------------------------------------------------------------
if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$NEW_LOCAL" "$ENV_FILE_OVERRIDE"
  shred -u "$NEW_LOCAL"
  GATE_FILE="$ENV_FILE_OVERRIDE"
else
  printf "Push this change to %s on %s? (yes/no): " "$HOST_ENV_PATH" "$SSH_ALIAS"
  read -r PUSH_CONFIRM
  if [[ "$PUSH_CONFIRM" != "yes" ]]; then
    echo "Aborted: env file not pushed." >&2
    if [[ "$MODE" == "activate" ]]; then
      echo "The Stripe key in SSM is already updated." >&2
    fi
    exit 1
  fi
  if ! scp -q "$NEW_LOCAL" "$SSH_ALIAS:$TMP_REMOTE"; then
    echo "ERROR: failed to copy the rewritten env file to $SSH_ALIAS." >&2
    exit 1
  fi
  # No backup copy is left behind. The only value this script writes is the
  # Stripe webhook signing secret, and the deploy rebuilds the host env file
  # from the parameter store on every run, so a backup here would be a second,
  # staler copy of a file that is already fully re-derivable, holding the whole
  # secret set at rest for as long as nobody remembered to delete it. To undo a
  # bad activation, put the previous value back in the parameter store and
  # deploy.
  echo "Installing the rewritten env file via sudo..."
  if ! ssh -t "$SSH_ALIAS" "sudo bash -c 'install -m 0600 -o root -g root $TMP_REMOTE $HOST_ENV_PATH'"; then
    echo "ERROR: failed to install the rewritten env file on $SSH_ALIAS." >&2
    exit 1
  fi
  GATE_FILE="$NEW_LOCAL"
fi

echo ""
# The boot gate asks whether the live adapter is configured and bootable, which
# is the right question after every mode that installs credentials and the wrong
# one after deactivation, whose intended end state is a dark host holding no
# Stripe secret. Running it here would fail on success. Deactivation asserts its
# own end state instead.
if [[ "$MODE" == "deactivate" ]]; then
  if grep -qE '^STRIPE_WEBHOOK_SECRET(_PREVIOUS)?=' "$GATE_FILE"; then
    echo "ERROR: a Stripe signing secret is still present after deactivation." >&2
    exit 1
  fi
  echo "GATE: no Stripe signing secret remains in the env file."
else
  FOOTBAG_ENV_FILE="$GATE_FILE" bash scripts/validate-payments-boot.sh
fi

echo ""
case "$MODE" in
  activate)
    echo "== payment credentials provisioned for $TARGET =="
    echo ""
    echo "Activation provisions; arming is the separate Terraform step. Next steps:"
    echo "  1. Arm payments when ready: set payments_armed = \"armed\" in the $TARGET"
    echo "     tfvars, terraform apply (SSM app/payments_armed), then deploy"
    echo "     (./deploy_to_aws.sh) - the deploy derives PAYMENT_ADAPTER=live from"
    echo "     the flag. Until then the host stays dark on the stub adapter."
    echo "  2. Verify per the two-stage doctrine: test-mode end-to-end while the"
    echo "     production-live marker reads pre-live; then, with the live key, one"
    echo "     real checkout (smallest tier), payment row 'succeeded' plus the tier"
    echo "     grant, then refund from the Stripe Dashboard and confirm the row"
    echo "     moves to 'refunded' with the tier grant preserved. Verify from the"
    echo "     admin payment screens and the Dashboard's own delivery status, NOT"
    echo "     from the logs: production runs at warn level and a successful"
    echo "     webhook logs nothing, so silence reads exactly like failure."
    echo "  3. After a test-mode exercise, --deactivate returns the parameters and"
    echo "     the host env to their pre-activation state, so installing the live"
    echo "     credentials later is a first activation rather than a rotation."
    ;;
  rotate)
    echo "== webhook signing secret rotated for $TARGET =="
    echo ""
    echo "Both the new and previous secrets now verify deliveries."
    echo "Next steps:"
    echo "  1. Deploy / restart: ./deploy_to_aws.sh"
    echo "  2. Confirm webhook deliveries succeed under the new secret."
    echo "  3. Once every delivery signs with the new secret, close the window:"
    echo "     scripts/activate-payments.sh --target $TARGET --complete-webhook-rotation"
    ;;
  complete)
    echo "== webhook-secret rotation completed for $TARGET =="
    echo ""
    echo "STRIPE_WEBHOOK_SECRET_PREVIOUS is cleared; only the current secret verifies."
    echo "Next step: deploy / restart: ./deploy_to_aws.sh"
    ;;
  deactivate)
    echo "== payment credentials removed from $TARGET =="
    echo ""
    echo "Both Stripe parameters and the rotation twin read the placeholder again,"
    echo "and the host env file carries no Stripe signing secret. The next"
    echo "activation is a first activation: it will not meet the refusal that"
    echo "protects a secret already in service, so no rotation is needed to install"
    echo "live credentials later."
    echo "Next steps:"
    echo "  1. Confirm with: scripts/bringup-status.sh --target $TARGET --profile <profile>"
    echo "     Expect the Stripe key to read placeholder and payments to read dark."
    echo "  2. Disable the Stripe webhook endpoint in the Dashboard if it is still"
    echo "     enabled; nothing here reaches the provider."
    ;;
esac
exit 0
