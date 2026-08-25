#!/usr/bin/env bash
# bringup-status.sh
#
# Read-only status view of the environment bring-up sequence: host env file,
# terraform sync, payments activation, backup pipeline, SES feedback loop,
# first admin, cutover login alarm, and the deployed runtime. Each step is
# reported as DONE / PENDING / UNKNOWN / N-A / INFO with the exact next
# command when something is pending, so the operator never has to remember
# the sequence. The script mutates nothing and always exits 0 (usage errors
# excepted); it is a dashboard, not a gate.
#
# Probes, each skippable and each tolerant (unreachable = UNKNOWN, never a
# crash):
#   remote     one ssh session: /srv/footbag/env contents, backup-timer state
#              and container summary, read through the shared wire in
#              lib/host-env-remote.sh. That wire needs the sudo password as
#              line one of stdin, so without a credential file this probe
#              reports as not-run rather than prompting or hanging: a dashboard
#              that blocks on a password is not a dashboard.
#   terraform  local: plan -detailed-exitcode for drift, state list for the
#              gated resources (backup-stale alarm, cutover login alarm,
#              SES feedback subscription)
#   aws        with --profile: Stripe key parameter shape (placeholder vs
#              real; the value itself is never printed), first-admin
#              bootstrap-token presence, BackupAgeMinutes datapoint recency
#
# Usage (the remote probe reads the sudo password from stdin, line 1):
#   < <operator credential file> bash scripts/bringup-status.sh --target staging
#   < <operator credential file> bash scripts/bringup-status.sh --target production --profile <prod-profile>
#   scripts/bringup-status.sh --target production --skip-terraform --skip-remote
#
# Synthetic mode (CI tests only; operators never use this):
#   --probe-file <path> supplies every probe result as KEY=VALUE lines and
#   skips ssh, terraform, and aws entirely.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-expectations.sh
source "${SCRIPT_DIR}/lib/host-env-expectations.sh"
# shellcheck source=lib/email-template-digest.sh
source "${SCRIPT_DIR}/lib/email-template-digest.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

TARGET="staging"
SSH_ALIAS=""
AWS_PROFILE_ARG=""
PROBE_FILE=""
SKIP_REMOTE=0
SKIP_AWS=0
SKIP_TF=0
HOST_ENV_PATH="/srv/footbag/env"

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
    --probe-file)
      PROBE_FILE="${2:-}"
      shift 2 || { echo "ERROR: --probe-file requires an argument" >&2; exit 2; }
      ;;
    --skip-remote) SKIP_REMOTE=1; shift ;;
    --skip-aws) SKIP_AWS=1; shift ;;
    --skip-terraform) SKIP_TF=1; shift ;;
    --help|-h)
      # Bounded by the first `set -eu` rather than a line number, so editing
      # the header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
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

if [[ -z "$SSH_ALIAS" ]]; then
  SSH_ALIAS="footbag-$TARGET"
fi

# -----------------------------------------------------------------------------
# Probe results. Everything defaults to unknown; live probes (or the probe
# file) overwrite what they can determine.
# -----------------------------------------------------------------------------
declare -A P=(
  [ENV_FETCHED]=no
  [DEPLOYED_EMAIL_TEMPLATES]=""
  [ENV_TRUST_PROXY]=""
  [ENV_BACKUP_S3_BUCKET]=unset
  [ENV_PAYMENT_ADAPTER]=""
  [ENV_PAYMENTS_ARMED]=""
  [ENV_EMAIL_SEND_ARMED]=""
  [ENV_WEBHOOK_SECRET]=unset
  [ENV_WEBHOOK_SECRET_PREVIOUS]=unset
  [SSM_PRODUCTION_LIVE]=unknown
  [TIMER_ACTIVE]=unknown
  [CONTAINERS]=unknown
  [TF_PLAN]=unknown
  [TF_BACKUP_ALARM]=unknown
  [TF_CUTOVER_ALARM]=unknown
  [TF_SES_SUBSCRIPTION]=unknown
  [SSM_STRIPE_KEY]=unknown
  [SSM_BOOTSTRAP_TOKEN]=unknown
  [CW_BACKUP_METRIC]=unknown
)

if [[ -n "$PROBE_FILE" ]]; then
  if [[ ! -f "$PROBE_FILE" ]]; then
    echo "ERROR: --probe-file path '$PROBE_FILE' does not exist" >&2
    exit 2
  fi
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
      P["${BASH_REMATCH[1]}"]="${BASH_REMATCH[2]}"
    fi
  done < "$PROBE_FILE"
  PROBES_RUN="probe-file"
else
  PROBES_RUN=""

  # --- remote probe ---------------------------------------------------------
  # Skipped rather than fatal when there is no credential file on stdin. This
  # view is a dashboard, so a missing password costs the remote probe and
  # nothing else; the terraform and aws probes still report, and the remote
  # rows read UNKNOWN, which is what they already mean for an unreachable host.
  if (( ! SKIP_REMOTE )) && [[ -t 0 ]]; then
    echo "Skipping the remote probe: it needs the host sudo password on stdin."
    echo "  Re-run as: < <operator credential file> bash scripts/bringup-status.sh --target $TARGET"
    echo "  Or pass --skip-remote to stop this notice."
    echo ""
    SKIP_REMOTE=1
  fi

  if (( ! SKIP_REMOTE )); then
    PROBES_RUN+="remote "
    umask 077
    TMP_ENV="$(mktemp /tmp/footbag-bringup-env.XXXXXX)"
    TMP_REPORT="$(mktemp /tmp/footbag-bringup-report.XXXXXX)"
    # shred, not rm: the fetched copy is the host's entire secret set.
    cleanup_local() { shred -u "${TMP_ENV:-}" "${TMP_REPORT:-}" 2>/dev/null || rm -f "${TMP_ENV:-}" "${TMP_REPORT:-}"; }
    trap cleanup_local EXIT INT TERM

    echo "Probing $SSH_ALIAS..."
    echo ""
    ENV_RAW=""
    REPORT_RAW=""
    if require_operator_stdin "scripts/bringup-status.sh --target $TARGET" \
       && host_env_fetch "$SSH_ALIAS" "$TMP_ENV" "$TMP_REPORT" "$HOST_ENV_PATH"; then
      ENV_RAW="$(cat "$TMP_ENV")"
      REPORT_RAW="$(cat "$TMP_REPORT")"
    fi
    # Each block guards on its own payload, so a probe that came back empty
    # leaves its rows UNKNOWN and the rest of the view still renders.
    if [[ -n "$ENV_RAW" ]]; then
      P[ENV_FETCHED]=yes
      get_env() { grep -E "^$1=" <<< "$ENV_RAW" | tail -1 | cut -d= -f2- || true; }
      P[ENV_TRUST_PROXY]="$(get_env TRUST_PROXY)"
      [[ -n "$(get_env BACKUP_S3_BUCKET)" ]] && P[ENV_BACKUP_S3_BUCKET]=set
      P[ENV_PAYMENT_ADAPTER]="$(get_env PAYMENT_ADAPTER)"
      P[ENV_PAYMENTS_ARMED]="$(get_env PAYMENTS_ARMED)"
      P[ENV_EMAIL_SEND_ARMED]="$(get_env EMAIL_SEND_ARMED)"
      [[ -n "$(get_env STRIPE_WEBHOOK_SECRET)" ]] && P[ENV_WEBHOOK_SECRET]=set
      [[ -n "$(get_env STRIPE_WEBHOOK_SECRET_PREVIOUS)" ]] && P[ENV_WEBHOOK_SECRET_PREVIOUS]=set
    fi
    # Mode 0644 by design, so this needs no root and no password. It is what
    # the last rebuild deploy recorded, and the rebuild is the only deploy that
    # reseeds email wording.
    PROVENANCE_RAW="$(ssh -o BatchMode=yes "$SSH_ALIAS" "cat /srv/footbag/deployed-from" 2>/dev/null </dev/null || true)"
    if [[ -n "$PROVENANCE_RAW" ]]; then
      P[DEPLOYED_EMAIL_TEMPLATES]="$(grep -oE 'email_templates=[a-f0-9]+' <<< "$PROVENANCE_RAW" | tail -1 | cut -d= -f2 || true)"
    fi
    if [[ -n "$REPORT_RAW" ]]; then
      P[TIMER_ACTIVE]="$(awk 'NR==1' <<< "$REPORT_RAW")"
      P[CONTAINERS]="$(awk 'f{printf "%s%s", sep, $0; sep=", "} /^---$/{f=1}' <<< "$REPORT_RAW")"
      [[ -z "${P[CONTAINERS]}" ]] && P[CONTAINERS]="none running"
    fi
  fi

  # --- terraform probe ------------------------------------------------------
  if (( ! SKIP_TF )); then
    PROBES_RUN+="terraform "
    TF_DIR="terraform/$TARGET"
    if [[ -d "$TF_DIR" ]]; then
      set +e
      terraform -chdir="$TF_DIR" plan -detailed-exitcode -input=false -lock=false >/dev/null 2>&1
      rc=$?
      set -e
      case "$rc" in
        0) P[TF_PLAN]=insync ;;
        2) P[TF_PLAN]=drift ;;
        *) P[TF_PLAN]=unknown ;;
      esac
      STATE_LIST="$(terraform -chdir="$TF_DIR" state list 2>/dev/null || true)"
      if [[ -n "$STATE_LIST" ]]; then
        grep -q 'aws_cloudwatch_metric_alarm\.db_backup_age' <<< "$STATE_LIST" \
          && P[TF_BACKUP_ALARM]=present || P[TF_BACKUP_ALARM]=absent
        grep -q 'aws_cloudwatch_metric_alarm\.cutover_zero_logins' <<< "$STATE_LIST" \
          && P[TF_CUTOVER_ALARM]=present || P[TF_CUTOVER_ALARM]=absent
        grep -q 'aws_sns_topic_subscription\.ses_feedback_feed' <<< "$STATE_LIST" \
          && P[TF_SES_SUBSCRIPTION]=present || P[TF_SES_SUBSCRIPTION]=absent
      fi
    fi
  fi

  # --- aws probe --------------------------------------------------------------
  if (( ! SKIP_AWS )); then
    if [[ -z "$AWS_PROFILE_ARG" ]]; then
      : # no profile supplied; the aws-backed rows stay unknown
    else
      PROBES_RUN+="aws "
      probe_param() {
        # Prints present|absent|unknown for an SSM parameter, never its value.
        local name="$1" err
        if err=$(aws ssm get-parameter --name "$name" --profile "$AWS_PROFILE_ARG" \
                   --query Parameter.Name --output text 2>&1 >/dev/null); then
          echo present
        elif grep -q ParameterNotFound <<< "$err"; then
          echo absent
        else
          echo unknown
        fi
      }
      # Production-live marker: a plain String parameter whose value is the
      # whole signal ("false" = pre-live, "true" = live).
      if [[ "$TARGET" == "production" ]]; then
        MARKER_VAL="$(aws ssm get-parameter --name "/footbag/production/app/production_live" \
          --query Parameter.Value --output text \
          --profile "$AWS_PROFILE_ARG" 2>/dev/null || true)"
        [[ -n "$MARKER_VAL" ]] && P[SSM_PRODUCTION_LIVE]="$MARKER_VAL"
      fi
      # The Stripe key needs decryption to distinguish the terraform TODO-
      # placeholder from a real key; only the prefix is inspected, the value
      # is never printed.
      STRIPE_VAL="$(aws ssm get-parameter --name "/footbag/$TARGET/secrets/stripe_secret_key" \
        --with-decryption --query Parameter.Value --output text \
        --profile "$AWS_PROFILE_ARG" 2>/dev/null || true)"
      if [[ -z "$STRIPE_VAL" ]]; then
        P[SSM_STRIPE_KEY]="$(probe_param "/footbag/$TARGET/secrets/stripe_secret_key")"
        [[ "${P[SSM_STRIPE_KEY]}" == "present" ]] && P[SSM_STRIPE_KEY]=unknown
      elif [[ "$STRIPE_VAL" == TODO-* ]]; then
        P[SSM_STRIPE_KEY]=placeholder
      elif [[ "$STRIPE_VAL" == sk_* ]]; then
        P[SSM_STRIPE_KEY]=live
      else
        P[SSM_STRIPE_KEY]=unknown
      fi
      unset STRIPE_VAL

      P[SSM_BOOTSTRAP_TOKEN]="$(probe_param "/footbag/$TARGET/app/bootstrap/admin_token")"

      DATAPOINTS="$(aws cloudwatch get-metric-statistics \
        --namespace "Footbag/$TARGET" --metric-name BackupAgeMinutes \
        --start-time "$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 1800 --statistics SampleCount \
        --query 'length(Datapoints)' --output text \
        --profile "$AWS_PROFILE_ARG" 2>/dev/null || echo "")"
      if [[ "$DATAPOINTS" =~ ^[0-9]+$ ]]; then
        (( DATAPOINTS > 0 )) && P[CW_BACKUP_METRIC]=flowing || P[CW_BACKUP_METRIC]=missing
      fi
    fi
  fi
  PROBES_RUN="${PROBES_RUN:-none}"
fi

# -----------------------------------------------------------------------------
# Render the eight steps.
# -----------------------------------------------------------------------------
row() {
  printf " %s. %-24s %-8s %s\n" "$1" "$2" "$3" "$4"
}
next_cmd() {
  printf "      next: %s\n" "$1"
}

echo "== bring-up status: $TARGET (probes: ${PROBES_RUN% }) =="
echo ""

# 1. Host env file
if [[ "${P[ENV_FETCHED]}" != "yes" ]]; then
  row 1 "Host env file" UNKNOWN "could not read $HOST_ENV_PATH"
  next_cmd "< <operator credential file> bash scripts/verify-host-env.sh --target $TARGET"
else
  EXPECTED_HOPS="$(expected_trust_proxy_note "$TARGET")"
  MISSING=""
  [[ "${P[ENV_TRUST_PROXY]}" =~ ^[0-9]+$ ]] || MISSING+="TRUST_PROXY (integer hop count, $TARGET: $EXPECTED_HOPS) "
  [[ "${P[ENV_BACKUP_S3_BUCKET]}" == "set" ]] || MISSING+="BACKUP_S3_BUCKET "
  if [[ -z "$MISSING" ]]; then
    row 1 "Host env file" DONE "TRUST_PROXY=${P[ENV_TRUST_PROXY]}, BACKUP_S3_BUCKET set"
  else
    row 1 "Host env file" PENDING "missing/invalid: $MISSING"
    next_cmd "scripts/set-host-env.sh --target $TARGET${AWS_PROFILE_ARG:+ --profile <profile>}"
  fi
fi

# 2. Terraform
case "${P[TF_PLAN]}" in
  insync)
    row 2 "Terraform" DONE "plan reports no changes"
    ;;
  drift)
    row 2 "Terraform" PENDING "plan reports pending changes"
    next_cmd "terraform -chdir=terraform/$TARGET plan   (review; terraform import any Console-created resource; then apply)"
    ;;
  *)
    row 2 "Terraform" UNKNOWN "plan not run or failed (credentials? init?)"
    next_cmd "terraform -chdir=terraform/$TARGET plan"
    ;;
esac

# 3. Payments activation
ROTATION_NOTE=""
if [[ "${P[ENV_WEBHOOK_SECRET_PREVIOUS]}" == "set" ]]; then
  ROTATION_NOTE="; rotation window open (STRIPE_WEBHOOK_SECRET_PREVIOUS set), close it with activate-payments.sh --complete-webhook-rotation"
fi

# A deactivation resets the parameters before it removes the host's copy, so a
# run that stopped between the two leaves exactly this pair: parameters back to
# the placeholder, host still holding a live signing secret. Nothing converges
# it, because a placeholder means "no outgoing secret" and the deploy therefore
# leaves the host's value alone. A decline says so at the time; a crash or a
# dropped connection says nothing at all, which is why it is reported here.
ABANDONED_DEACTIVATION=""
if [[ "${P[SSM_STRIPE_KEY]}" == "placeholder" && "${P[ENV_WEBHOOK_SECRET]}" == "set" ]]; then
  ABANDONED_DEACTIVATION="; the host still holds STRIPE_WEBHOOK_SECRET while the key parameter reads placeholder, which is a deactivation that did not finish -- re-run activate-payments.sh --deactivate"
fi
if [[ "$TARGET" == "staging" ]]; then
  row 3 "Payments" N-A "staging runs the stub adapter permanently; the live payment SDK boots only on production"
elif [[ "${P[ENV_PAYMENTS_ARMED]}" == "dark" && "${P[ENV_PAYMENT_ADAPTER]}" != "live" ]]; then
  DARK_DETAIL="payments dark (stub adapter; fake checkout, no real money). SSM key: ${P[SSM_STRIPE_KEY]}, production-live marker: ${P[SSM_PRODUCTION_LIVE]}${ABANDONED_DEACTIVATION}"
  row 3 "Payments" N-A "$DARK_DETAIL"
  if [[ -n "$ABANDONED_DEACTIVATION" ]]; then
    next_cmd "< <operator credential file> bash scripts/activate-payments.sh --target $TARGET --profile <profile> --deactivate   (finish the deactivation the host is stuck part-way through)"
  else
    next_cmd "arm payments when ready: payments_armed = \"armed\" in tfvars + terraform apply + deploy"
  fi
elif [[ "${P[SSM_STRIPE_KEY]}" == "live" && "${P[ENV_PAYMENT_ADAPTER]}" == "live" && "${P[ENV_WEBHOOK_SECRET]}" == "set" ]]; then
  row 3 "Payments" DONE "armed: SSM key live, PAYMENT_ADAPTER=live, webhook secret set; production-live marker: ${P[SSM_PRODUCTION_LIVE]}${ROTATION_NOTE}"
  [[ -n "$ROTATION_NOTE" ]] && next_cmd "scripts/activate-payments.sh --target $TARGET --complete-webhook-rotation   (close the open rotation window)"
else
  DETAIL="PAYMENTS_ARMED: ${P[ENV_PAYMENTS_ARMED]:-unset}, SSM key: ${P[SSM_STRIPE_KEY]}, PAYMENT_ADAPTER: ${P[ENV_PAYMENT_ADAPTER]:-unset}, webhook secret: ${P[ENV_WEBHOOK_SECRET]}, production-live marker: ${P[SSM_PRODUCTION_LIVE]}${ROTATION_NOTE}${ABANDONED_DEACTIVATION}"
  row 3 "Payments" PENDING "$DETAIL"
  next_cmd "scripts/activate-payments.sh --target $TARGET --profile <profile>   (at the payments-activation milestone, not before)"
fi

# 4. Backup pipeline
if [[ "${P[TIMER_ACTIVE]}" == "active" && "${P[CW_BACKUP_METRIC]}" == "flowing" && "${P[TF_BACKUP_ALARM]}" == "present" ]]; then
  row 4 "Backup pipeline" DONE "timer active, BackupAgeMinutes flowing, staleness alarm armed"
else
  DETAIL="timer: ${P[TIMER_ACTIVE]}, metric: ${P[CW_BACKUP_METRIC]}, alarm: ${P[TF_BACKUP_ALARM]}"
  if [[ "${P[TIMER_ACTIVE]}" == "unknown" && "${P[CW_BACKUP_METRIC]}" == "unknown" && "${P[TF_BACKUP_ALARM]}" == "unknown" ]]; then
    row 4 "Backup pipeline" UNKNOWN "$DETAIL"
  else
    row 4 "Backup pipeline" PENDING "$DETAIL"
  fi
  if [[ "${P[TIMER_ACTIVE]}" != "active" ]]; then
    next_cmd "scripts/install-backup-timer.sh --target $TARGET"
  elif [[ "${P[CW_BACKUP_METRIC]}" != "flowing" ]]; then
    next_cmd "wait for two timer runs; inspect: ssh $SSH_ALIAS journalctl -u footbag-backup.service -n 20"
  else
    next_cmd "set enable_backup_alarm = true in terraform/$TARGET/terraform.tfvars and apply"
  fi
fi

# 5. SES feedback loop
case "${P[TF_SES_SUBSCRIPTION]}" in
  present)
    row 5 "SES feedback" DONE "queue subscribed to the feedback topic in terraform state (verify: bounce probe)"
    ;;
  absent)
    row 5 "SES feedback" PENDING "no queue subscribed to the feedback topic in terraform state"
    next_cmd "set enable_feed_queues = true in this environment's tfvars and apply, which creates the queue and subscribes it; then scripts/set-host-env.sh --target <env> to put SES_FEEDBACK_QUEUE_URL on the host, redeploy so the worker polls it, and prove it with scripts/verify-prod-email.sh --profile <profile> --confirm-production --bounce-probe"
    ;;
  *)
    row 5 "SES feedback" UNKNOWN "terraform state unavailable"
    ;;
esac

# 6. First admin (production only; staging admins come from the dev bootstrap)
if [[ "$TARGET" != "production" ]]; then
  row 6 "First admin" N-A "staging admins come from the dev-bootstrap allowlist"
else
  case "${P[SSM_BOOTSTRAP_TOKEN]}" in
    present)
      row 6 "First admin" PENDING "bootstrap token provisioned, awaiting claim at /admin/bootstrap-claim"
      ;;
    absent)
      row 6 "First admin" UNKNOWN "no bootstrap token parameter: either already claimed (token self-deletes) or not yet provisioned"
      next_cmd "if no admin exists yet: aws ssm put-parameter --name /footbag/production/app/bootstrap/admin_token --type SecureString --value <token> --profile <profile>"
      ;;
    *)
      row 6 "First admin" UNKNOWN "SSM not probed (pass --profile)"
      ;;
  esac
fi

# 7. Cutover login alarm (window-scoped: on for the cutover window, off after)
if [[ "$TARGET" != "production" ]]; then
  row 7 "Cutover login alarm" N-A "production-only alarm"
else
  case "${P[TF_CUTOVER_ALARM]}" in
    present)
      row 7 "Cutover login alarm" INFO "ON; disable after the cutover window (enable_cutover_login_alarm = false, apply)"
      ;;
    absent)
      row 7 "Cutover login alarm" INFO "OFF; correct outside the cutover window (enable for the window: enable_cutover_login_alarm = true, apply)"
      ;;
    *)
      row 7 "Cutover login alarm" UNKNOWN "terraform state unavailable"
      ;;
  esac
fi

# 8. Deployed runtime
if [[ "${P[CONTAINERS]}" == "unknown" ]]; then
  row 8 "Deployed runtime" UNKNOWN "container state not probed"
  next_cmd "./deploy_to_aws.sh   (ships the local working tree)"
elif grep -q "web" <<< "${P[CONTAINERS]}" && grep -q "nginx" <<< "${P[CONTAINERS]}"; then
  row 8 "Deployed runtime" DONE "${P[CONTAINERS]}"
else
  row 8 "Deployed runtime" PENDING "containers: ${P[CONTAINERS]}"
  next_cmd "./deploy_to_aws.sh   (ships the local working tree)"
fi

# 9. Email wording. The rows a running environment renders from are seeded by
# the full-rebuild deploy only, so a sidecar edit reaches nothing that is
# deployed until one runs. This compares what that deploy recorded against the
# sidecars as they read now; it never reads the deployed database, so wording an
# administrator changed through the template editor is invisible here and stays
# the operator's business rather than being reported as drift.
LOCAL_EMAIL_TEMPLATES="$(email_template_digest "${SCRIPT_DIR}/../curated/email_templates" 2>/dev/null || echo "")"
if [[ -z "${P[DEPLOYED_EMAIL_TEMPLATES]}" ]]; then
  row 9 "Email wording" UNKNOWN "no seeded-template record on the host (predates the record, or the host was not probed)"
elif [[ -z "$LOCAL_EMAIL_TEMPLATES" ]]; then
  row 9 "Email wording" UNKNOWN "no sidecars found under curated/email_templates"
elif [[ "${P[DEPLOYED_EMAIL_TEMPLATES]}" == "$LOCAL_EMAIL_TEMPLATES" ]]; then
  row 9 "Email wording" DONE "seeded from the sidecars as they read now"
else
  row 9 "Email wording" PENDING "the host was seeded from different sidecar text; a code-only deploy will not change it"
  next_cmd "change the wording in the admin email-template editor, or reseed with a full-rebuild deploy"
fi

echo ""
exit 0
