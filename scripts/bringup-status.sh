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
#   remote     one ssh session: /srv/footbag/env contents (staged via the
#              user-tmp + interactive-sudo install pattern; the sudo password
#              is typed directly into sudo's noecho prompt, never captured),
#              backup-timer state, container summary
#   terraform  local: plan -detailed-exitcode for drift, state list for the
#              gated resources (backup-stale alarm, cutover login alarm,
#              SES feedback subscription)
#   aws        with --profile: Stripe key parameter shape (placeholder vs
#              real; the value itself is never printed), first-admin
#              bootstrap-token presence, BackupAgeMinutes datapoint recency
#
# Usage:
#   scripts/bringup-status.sh --target staging
#   scripts/bringup-status.sh --target production --profile <prod-profile>
#   scripts/bringup-status.sh --target production --skip-terraform --skip-remote
#
# Synthetic mode (CI tests only; operators never use this):
#   --probe-file <path> supplies every probe result as KEY=VALUE lines and
#   skips ssh, terraform, and aws entirely.
set -euo pipefail

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
      sed -n '2,33p' "$0"
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
  [ENV_TRUST_PROXY]=""
  [ENV_BACKUP_S3_BUCKET]=unset
  [ENV_PAYMENT_ADAPTER]=""
  [ENV_WEBHOOK_SECRET]=unset
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
  if (( ! SKIP_REMOTE )); then
    PROBES_RUN+="remote "
    LOCAL_PID=$$
    TMP_ENV="/tmp/footbag-bringup-env-${LOCAL_PID}"
    TMP_REPORT="/tmp/footbag-bringup-report-${LOCAL_PID}"
    cleanup_remote() {
      ssh -o BatchMode=yes "$SSH_ALIAS" "rm -f $TMP_ENV $TMP_REPORT" 2>/dev/null || true
    }
    trap cleanup_remote EXIT INT TERM

    echo "Probing $SSH_ALIAS (one sudo prompt; the password is typed directly into sudo,"
    echo "never captured or logged)..."
    echo ""
    REMOTE_CMD="OP=\$(whoami); GROUP=\$(id -gn); sudo bash -c \"install -m 0600 -o \$OP -g \$GROUP $HOST_ENV_PATH $TMP_ENV; { systemctl is-active footbag-backup.timer || true; echo '---'; docker ps --format '{{.Names}} {{.Status}}' || true; } > $TMP_REPORT; chown \$OP:\$GROUP $TMP_REPORT; chmod 600 $TMP_REPORT\""
    if ssh -t "$SSH_ALIAS" "$REMOTE_CMD" 2>/dev/null; then
      ENV_RAW="$(ssh -o BatchMode=yes "$SSH_ALIAS" "cat $TMP_ENV" 2>/dev/null || true)"
      REPORT_RAW="$(ssh -o BatchMode=yes "$SSH_ALIAS" "cat $TMP_REPORT" 2>/dev/null || true)"
      if [[ -n "$ENV_RAW" ]]; then
        P[ENV_FETCHED]=yes
        get_env() { grep -E "^$1=" <<< "$ENV_RAW" | tail -1 | cut -d= -f2- || true; }
        P[ENV_TRUST_PROXY]="$(get_env TRUST_PROXY)"
        [[ -n "$(get_env BACKUP_S3_BUCKET)" ]] && P[ENV_BACKUP_S3_BUCKET]=set
        P[ENV_PAYMENT_ADAPTER]="$(get_env PAYMENT_ADAPTER)"
        [[ -n "$(get_env STRIPE_WEBHOOK_SECRET)" ]] && P[ENV_WEBHOOK_SECRET]=set
      fi
      if [[ -n "$REPORT_RAW" ]]; then
        P[TIMER_ACTIVE]="$(awk 'NR==1' <<< "$REPORT_RAW")"
        P[CONTAINERS]="$(awk 'f{printf "%s%s", sep, $0; sep=", "} /^---$/{f=1}' <<< "$REPORT_RAW")"
        [[ -z "${P[CONTAINERS]}" ]] && P[CONTAINERS]="none running"
      fi
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
        grep -q 'aws_sns_topic_subscription\.ses_feedback_webhook' <<< "$STATE_LIST" \
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
  next_cmd "scripts/verify-staging-env.sh --target $TARGET"
else
  EXPECTED_HOPS=$([[ "$TARGET" == "production" ]] && echo "3 (2 after DNS handover)" || echo "2")
  MISSING=""
  [[ "${P[ENV_TRUST_PROXY]}" =~ ^[0-9]+$ ]] || MISSING+="TRUST_PROXY (integer hop count, $TARGET: $EXPECTED_HOPS) "
  [[ "${P[ENV_BACKUP_S3_BUCKET]}" == "set" ]] || MISSING+="BACKUP_S3_BUCKET "
  if [[ -z "$MISSING" ]]; then
    row 1 "Host env file" DONE "TRUST_PROXY=${P[ENV_TRUST_PROXY]}, BACKUP_S3_BUCKET set"
  else
    row 1 "Host env file" PENDING "missing/invalid: $MISSING"
    next_cmd "edit $HOST_ENV_PATH on $SSH_ALIAS, then scripts/verify-staging-env.sh --target $TARGET"
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
if [[ "$TARGET" == "staging" && "${P[ENV_PAYMENT_ADAPTER]}" != "live" ]]; then
  row 3 "Payments" N-A "staging runs the stub adapter by default; activate only to exercise real Stripe"
elif [[ "${P[SSM_STRIPE_KEY]}" == "live" && "${P[ENV_PAYMENT_ADAPTER]}" == "live" && "${P[ENV_WEBHOOK_SECRET]}" == "set" ]]; then
  row 3 "Payments" DONE "SSM key live, PAYMENT_ADAPTER=live, webhook secret set"
else
  DETAIL="SSM key: ${P[SSM_STRIPE_KEY]}, PAYMENT_ADAPTER: ${P[ENV_PAYMENT_ADAPTER]:-unset}, webhook secret: ${P[ENV_WEBHOOK_SECRET]}"
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
    row 5 "SES feedback" DONE "SNS webhook subscription in terraform state (verify: SubscribeURL confirmed + bounce probe)"
    ;;
  absent)
    row 5 "SES feedback" PENDING "no SNS webhook subscription in terraform state"
    next_cmd "run scripts/activate-ses-feedback.sh to generate SES_FEEDBACK_WEBHOOK_KEY (must differ from INTERNAL_EVENT_SECRET; it travels in the SNS subscription URL and lands in access logs), set tfvar ses_feedback_webhook_url (includes ?key=<SES_FEEDBACK_WEBHOOK_KEY>), apply, confirm the SubscribeURL from the audit row, then scripts/verify-prod-email.sh --profile <profile> --confirm-production --bounce-probe"
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

echo ""
exit 0
