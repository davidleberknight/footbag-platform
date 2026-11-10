#!/usr/bin/env bash
# bringup-status.sh
#
# Read-only status view of the environment bring-up sequence: host env file,
# terraform sync, payments activation, backup pipeline, SES feedback loop,
# first admin, cutover login alarm, and the deployed runtime (all four
# containers healthy), then one row per host bootstrap step: the pinned host
# key, the shared account and sshd ports, the host tools, the layout, the
# environment record, the database directory, the host credential chain, the
# CloudWatch agent, log shipping and start at boot, the sshd posture, swap, the
# administrators' keys and a recent host snapshot. Each step is
# reported as DONE / PENDING / FAILED / UNKNOWN / N-A / INFO with the exact next
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
#   bootstrap  a second ssh session reading the bootstrap status half, the pin
#              check, the source-profile and agent-publisher users' keys, the
#              agent's metrics, the automatic snapshot and the feeds flag in the
#              values file (scripts/internal/bootstrap-host-steps.sh)
#   aws        with --profile: Stripe key parameter mode (placeholder, test
#              or live; the value itself is never printed), first-admin
#              bootstrap-token presence, BackupAgeMinutes datapoint recency,
#              and the state of the environment's two encryption keys
#
# Usage (the remote probe reads the sudo password from stdin, line 1).
#
# Which file holds that password follows the account the alias connects as, and
# each account has its own file per environment, because staging and production
# are separate hosts with separate passwords:
#
#   shared footbag account:  ~/AWS/AWS_OPERATOR.txt   ~/AWS/AWS_OPERATOR_PRODUCTION.txt
#   your own named account:  ~/AWS/DEV_TESTER_HOST.txt  (staging only; none on production)
#
# A run started without the redirect names the one it needs.
#
#   < ~/AWS/DEV_TESTER_HOST.txt bash scripts/bringup-status.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/bringup-status.sh --target production --profile <prod-profile>
#   scripts/bringup-status.sh --target production --skip-terraform --skip-remote
#
# Synthetic mode (CI tests only; operators never use this):
#   --probe-file <path> supplies every probe result as KEY=VALUE lines and
#   skips ssh, terraform, and aws entirely.
#   BRINGUP_STATUS_TF_ROOT replaces the terraform/ directory the terraform
#   probe reads, and BRINGUP_STATUS_RECONFIRM_CMD the subscription status
#   script the aws probe runs; each is announced on stderr.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/host-env-expectations.sh
source "${SCRIPT_DIR}/lib/host-env-expectations.sh"
# shellcheck source=lib/email-template-digest.sh
source "${SCRIPT_DIR}/lib/email-template-digest.sh"
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# The host bootstrap's steps and what proves each, shared with
# scripts/bootstrap-host.sh so the two never disagree about "done".
# shellcheck source=lib/tool-versions.sh
source "${SCRIPT_DIR}/lib/tool-versions.sh"
# shellcheck source=internal/bootstrap-host-steps.sh
source "${SCRIPT_DIR}/internal/bootstrap-host-steps.sh"

TARGET=""
AWS_PROFILE_ARG=""
PROBE_FILE=""
SKIP_REMOTE=0
SKIP_AWS=0
SKIP_TF=0
HOST_ENV_PATH="/srv/footbag/env"

# A suggested command naming a placeholder would not be pasteable, so it names
# the real file, and which file that is comes from the one shared rule rather
# than from a second copy of it here: the account the alias connects as picks the
# pair, the target picks the file within it. Falls back to a placeholder only
# when the rule itself could not run, which is the one case where naming a file
# would be a guess.
operator_cred_file() {
  if operator_credential_select "footbag-${TARGET}" "$TARGET" 2>/dev/null; then
    echo "$OPERATOR_CREDENTIAL_DISPLAY"
  else
    echo "~/AWS/<your credential file>"
  fi
}

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

require_target "$TARGET" staging production || exit 2

# One closing report from here on, on stderr, so the status rows on stdout stay
# as the callers and tests that read them expect. Sourced after the usage
# checks, so a usage error keeps its plain exit 2.
# shellcheck source=lib/closing-report.sh
source "${SCRIPT_DIR}/lib/closing-report.sh"

SSH_ALIAS="footbag-$TARGET"
BH_TARGET="$TARGET"
bh_announce_seams

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
  [TF_PLAN_SHARED]=unknown
  [TF_PLAN_IDENTITY]=unknown
  [TF_BACKUP_ALARM]=unknown
  [TF_CUTOVER_ALARM]=unknown
  [TF_SES_SUBSCRIPTION]=unknown
  [SSM_STRIPE_KEY]=unknown
  [SSM_BOOTSTRAP_TOKEN]=unknown
  [DB_ADMINS]=unknown
  [CW_BACKUP_METRIC]=unknown
  [CW_MONITOR_HEARTBEAT]=unknown
  [ORIGIN_HOP]=unknown
  [GATES_OFF]=unknown
  [SUBS_STATE]=unknown
  [SUBS_DETAIL]=""
  [GUARDDUTY]=unknown
  [KMS_MAIN]=unknown
  [KMS_JWT]=unknown
)

if [[ -n "$PROBE_FILE" ]]; then
  if [[ ! -f "$PROBE_FILE" ]]; then
    cr_error "--probe-file path '$PROBE_FILE' does not exist"
    cr_finish_with 2 FAILED
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
    echo "  Re-run as: < $(operator_cred_file) bash scripts/bringup-status.sh --target $TARGET"
    echo "  Or pass --skip-remote to stop this notice."
    echo ""
    cr_unproved "the host rows: the remote probe was skipped for want of the sudo password on stdin"
    SKIP_REMOTE=1
  fi

  if (( ! SKIP_REMOTE )); then
    PROBES_RUN+="remote "
    umask 077
    TMP_ENV="$(mktemp /tmp/footbag-bringup-env.XXXXXX)"
    TMP_REPORT="$(mktemp /tmp/footbag-bringup-report.XXXXXX)"
    # shred, not rm: the fetched copy is the host's entire secret set.
    cleanup_local() { shred -u "${TMP_ENV:-}" "${TMP_REPORT:-}" 2>/dev/null || rm -f "${TMP_ENV:-}" "${TMP_REPORT:-}"; }
    cr_cleanup cleanup_local

    echo "Probing $SSH_ALIAS..."
    echo ""
    ENV_RAW=""
    REPORT_RAW=""
    # A host that does not confirm it is the target reports nothing: its rows
    # would describe the other environment under this one's name.
    if require_operator_stdin "scripts/bringup-status.sh --target $TARGET" \
         "$SSH_ALIAS" "$TARGET" \
       && require_host_is "$SSH_ALIAS" "$TARGET" "$HOST_ENV_PATH" \
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
    PROVENANCE_RAW=""
    if [[ -n "$ENV_RAW" ]]; then
      PROVENANCE_RAW="$(ssh -o BatchMode=yes "$SSH_ALIAS" "cat /srv/footbag/deployed-from" 2>/dev/null </dev/null || true)"
    fi
    if [[ -n "$PROVENANCE_RAW" ]]; then
      P[DEPLOYED_EMAIL_TEMPLATES]="$(grep -oE 'email_templates=[a-f0-9]+' <<< "$PROVENANCE_RAW" | tail -1 | cut -d= -f2 || true)"
    fi
    if [[ -n "$REPORT_RAW" ]]; then
      P[TIMER_ACTIVE]="$(awk 'NR==1' <<< "$REPORT_RAW")"
      P[CONTAINERS]="$(awk 'f{printf "%s%s", sep, $0; sep=", "} /^---$/{f=1}' <<< "$REPORT_RAW")"
      [[ -z "${P[CONTAINERS]}" ]] && P[CONTAINERS]="none running"
    fi
    # The bootstrap steps' own facts, from the host that just confirmed it is
    # the target. A host that did not confirm is not asked.
    if [[ -n "$ENV_RAW" ]]; then
      bh_probe_host "$SSH_ALIAS"
      # The environment record's row is judged on the verifier, which holds every
      # value on the host against what the estate declares.
      bh_probe_host_env "$TARGET"
    fi
  fi

  # --- terraform probe ------------------------------------------------------
  if (( ! SKIP_TF )); then
    PROBES_RUN+="terraform "
    # terraform takes no profile of its own, so without an identity settled here
    # every probe below reports the estate as unreadable and the report reads as
    # a bring-up that has not happened.
    # shellcheck source=lib/aws-profile.sh
    source "${SCRIPT_DIR}/lib/aws-profile.sh"
    aws_profile_ensure || cr_die "the AWS identity for the status read could not be settled; no AWS probe ran"
    # Anchored on this script, so a run started outside the repository root
    # still reads the trees rather than reporting every one as unknown.
    TF_ROOT="$SCRIPT_DIR/../terraform"
    if [[ -n "${BRINGUP_STATUS_TF_ROOT:-}" ]]; then
      TF_ROOT="$BRINGUP_STATUS_TF_ROOT"
      echo "SYNTHETIC: terraform root '${TF_ROOT}' -- this run proves nothing about the estate." >&2
    fi
    TF_DIR="$TF_ROOT/$TARGET"
    # The environment stands on the two account trees as well as its own: the
    # shared tree holds every tree's state, and staging's runtime trust names the
    # role the identity tree declares. A change committed to either and never
    # applied is pending work for this environment like any of its own.
    for tf_tree in "$TARGET" shared identity; do
      key=TF_PLAN
      [[ "$tf_tree" == shared ]] && key=TF_PLAN_SHARED
      [[ "$tf_tree" == identity ]] && key=TF_PLAN_IDENTITY
      [[ -d "$TF_ROOT/$tf_tree" ]] || continue
      set +e
      terraform -chdir="$TF_ROOT/$tf_tree" plan -detailed-exitcode -input=false -lock=false >/dev/null 2>&1
      rc=$?
      set -e
      case "$rc" in
        0) P[$key]=insync ;;
        2) P[$key]=drift ;;
        *) P[$key]=unknown ;;
      esac
    done
    if [[ -d "$TF_DIR" ]]; then
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
    # The alarm gates the environment's tree declares, each read from the values
    # file terraform applies. A gate that is on there is carried by every apply,
    # so the values file is the steady state; one still off is pending work. The
    # cutover login alarm is window-scoped and has its own row.
    if [[ -e "$TF_DIR/terraform.tfvars" ]]; then
      gates_off=""
      gates_seen=0
      for gate in $(cat "$TF_DIR"/*.tf | grep -oE '^variable "enable_[a-z_]*alarms?"' | cut -d'"' -f2 | sort -u); do
        [[ "$gate" == enable_cutover_login_alarm ]] && continue
        gates_seen=$((gates_seen + 1))
        value="$(grep -E "^[[:space:]]*${gate}[[:space:]]*=" "$TF_DIR/terraform.tfvars" | tail -n 1 \
          | sed -E 's/^[^=]*=[[:space:]]*"?([a-z]+)"?.*/\1/' || [[ $? == 1 ]])"
        [[ "$value" == "true" ]] || gates_off+="${gate} "
      done
      P[GATES_OFF]="${gates_off% }"
      [[ -n "${P[GATES_OFF]}" ]] || P[GATES_OFF]=none
      # Finding no gate at all is a failed read of the tree, never "all on".
      (( gates_seen > 0 )) || P[GATES_OFF]=no-gates
    fi
  fi

  # --- aws probe --------------------------------------------------------------
  if (( ! SKIP_AWS )); then
    if [[ -z "$AWS_PROFILE_ARG" ]]; then
      : # no profile supplied; the aws-backed rows stay unknown
    else
      PROBES_RUN+="aws "
      # The bootstrap rows' AWS-side facts: the pin, the identities a rebuilt
      # host takes over, the agent's metrics, the automatic snapshot and the
      # feeds flag. Each reads unknown or failed rather than aborting, so the
      # dashboard still renders.
      AWS_PROFILE="$AWS_PROFILE_ARG" bh_probe_pin "$TARGET"
      AWS_PROFILE="$AWS_PROFILE_ARG" bh_probe_aws "$TARGET"
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
      else
        # A test-mode key is not a live one: the Payments row reads DONE only
        # on "live", so a test key leaves it pending and says so. Activation
        # refuses any other shape, a restricted rk_ key included, so anything
        # else reads unknown here.
        case "$STRIPE_VAL" in
          TODO-*)    P[SSM_STRIPE_KEY]=placeholder ;;
          sk_live_*) P[SSM_STRIPE_KEY]=live ;;
          sk_test_*) P[SSM_STRIPE_KEY]=test ;;
          *)         P[SSM_STRIPE_KEY]=unknown ;;
        esac
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

      # The container monitor's heartbeat, which the agent publishes in the
      # host's own namespace with no dimensions, once a minute.
      CW_NAMESPACE="CWAgent"
      [[ "$TARGET" == "production" ]] && CW_NAMESPACE="CWAgent/production"
      HEARTBEATS="$(aws cloudwatch get-metric-statistics \
        --namespace "$CW_NAMESPACE" --metric-name container_monitor_heartbeat \
        --start-time "$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 600 --statistics SampleCount \
        --query 'length(Datapoints)' --output text \
        --profile "$AWS_PROFILE_ARG" 2>/dev/null || echo "")"
      if [[ "$HEARTBEATS" =~ ^[0-9]+$ ]]; then
        (( HEARTBEATS > 0 )) && P[CW_MONITOR_HEARTBEAT]=flowing || P[CW_MONITOR_HEARTBEAT]=missing
      fi

      # Alarm email subscriptions, judged by the script that recreates them, in
      # its read-only mode. Its findings decide this row and are not this run's
      # problems, so its report goes to a private file. A subscription confirmed
      # by a click carries an unsubscribe link that removes it, and one still
      # pending receives nothing.
      SUBS_REPORT="$(mktemp "$(_cr_tmp)/subs.XXXXXX")"
      SUBS_CMD="${SCRIPT_DIR}/reconfirm-alarm-subscriptions.sh"
      if [[ -n "${BRINGUP_STATUS_RECONFIRM_CMD:-}" ]]; then
        SUBS_CMD="$BRINGUP_STATUS_RECONFIRM_CMD"
        echo "SYNTHETIC: subscriptions read by '${SUBS_CMD}' -- this run proves nothing about the estate." >&2
      fi
      SUBS_RC=0
      SUBS_OUT="$(AWS_PROFILE="$AWS_PROFILE_ARG" FOOTBAG_CR_REPORT_TO="$SUBS_REPORT" \
        bash "$SUBS_CMD" --target "$TARGET" --status </dev/null 2>&1)" || SUBS_RC=$?
      if (( SUBS_RC == 0 )) && grep -q 'read every email subscription' <<< "$SUBS_OUT"; then
        if grep -q 'was confirmed by a click' <<< "$SUBS_OUT"; then
          P[SUBS_STATE]=click
        elif grep -q 'is pending confirmation' <<< "$SUBS_OUT"; then
          P[SUBS_STATE]=pending
        else
          P[SUBS_STATE]=confirmed
        fi
        P[SUBS_DETAIL]="$(grep -oE '^WARNING: [^:]+: [^ ]+ (was confirmed by a click|is pending confirmation)' <<< "$SUBS_OUT" \
          | sed -E 's/^WARNING: //; s/ was confirmed by a click/ (clicked)/; s/ is pending confirmation/ (pending)/' \
          | paste -sd ';' - | sed 's/;/; /g' || [[ $? == 1 ]])"
      fi

      # GuardDuty, the account's threat detection, read in the region its
      # detector lives in. One account serves both environments, so the row is
      # production's.
      if [[ "$TARGET" == "production" ]]; then
        # A detector that exists can still be suspended, so its own status is
        # what is read.
        GD_RC=0
        GD_ID="$(aws guardduty list-detectors --region us-east-1 --profile "$AWS_PROFILE_ARG" \
          --query 'DetectorIds[0]' --output text 2>/dev/null)" || GD_RC=$?
        if (( GD_RC == 0 )); then
          if [[ "$GD_ID" == "None" || -z "$GD_ID" ]]; then
            P[GUARDDUTY]=off
          elif GD_STATUS="$(aws guardduty get-detector --region us-east-1 --profile "$AWS_PROFILE_ARG" \
                 --detector-id "$GD_ID" --query Status --output text 2>/dev/null)"; then
            [[ "$GD_STATUS" == "ENABLED" ]] && P[GUARDDUTY]=on || P[GUARDDUTY]=off
          fi
        fi
      fi

      # The environment's two keys, through the aliases the platform reaches
      # them by. A key scheduled for deletion is disabled at once, and every
      # secret or every sign-in stops with it.
      for kms_key in MAIN JWT; do
        kms_alias="alias/footbag-${TARGET}"
        [[ "$kms_key" == JWT ]] && kms_alias+="-jwt"
        if KMS_STATE="$(aws kms describe-key --key-id "$kms_alias" --profile "$AWS_PROFILE_ARG" \
             --query KeyMetadata.KeyState --output text 2>/dev/null)" && [[ -n "$KMS_STATE" ]]; then
          P[KMS_$kms_key]="$KMS_STATE"
        fi
      done

      # Origin hop: read from the live distribution by the same check that
      # refuses going live and a live Stripe key while the hop is plaintext.
      if [[ "$TARGET" == "production" ]]; then
        # shellcheck source=lib/origin-tls.sh
        source "$SCRIPT_DIR/lib/origin-tls.sh"
        if AWS_PROFILE="$AWS_PROFILE_ARG" origin_hop_encrypted "$SCRIPT_DIR/../terraform/$TARGET" "${AWS_REGION:-us-east-1}" 2>/dev/null; then
          P[ORIGIN_HOP]=encrypted
        elif [[ -n "$ORIGIN_TLS_POLICY" && "$ORIGIN_TLS_POLICY" != "None" ]]; then
          P[ORIGIN_HOP]="plaintext ($ORIGIN_TLS_POLICY)"
        fi
      fi
    fi
  fi
  PROBES_RUN="${PROBES_RUN:-none}"
fi

# The versions the tool-version list pins, which the tools and agent rows are
# judged against. Read after a probe file, which may not override them: the pin
# is the repository's, not a probe result.
bh_manifest_pins
BH_CRED="$(operator_cred_file)"

# -----------------------------------------------------------------------------
# Render the steps.
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
  next_cmd "< $(operator_cred_file) bash scripts/verify-host-env.sh --target $TARGET"
else
  EXPECTED_HOPS="$(expected_trust_proxy_note "$TARGET")"
  MISSING=""
  # The hop count comes from the committed host config and the bucket from the
  # parameter Terraform publishes; every deploy writes both, so a gap in either
  # is closed by the same step.
  [[ "${P[ENV_TRUST_PROXY]}" == "$(expected_trust_proxy "$TARGET")" ]] || MISSING+="TRUST_PROXY (integer hop count, $TARGET: $EXPECTED_HOPS) "
  [[ "${P[ENV_BACKUP_S3_BUCKET]}" == "set" ]] || MISSING+="BACKUP_S3_BUCKET "
  if [[ -z "$MISSING" ]]; then
    row 1 "Host env file" DONE "TRUST_PROXY=${P[ENV_TRUST_PROXY]}, BACKUP_S3_BUCKET set"
  else
    row 1 "Host env file" PENDING "missing/invalid: $MISSING"
    next_cmd "./deploy_to_aws.sh --target $TARGET (every deploy writes the committed host config and the Terraform-published values)"
  fi
fi

# 2. Terraform
# One row for the three trees the environment stands on, in apply order, so a
# pending change in an account tree reads as pending work rather than as done.
TF_PENDING=()
TF_UNREAD=()
for tf_tree in shared identity "$TARGET"; do
  key=TF_PLAN
  [[ "$tf_tree" == shared ]] && key=TF_PLAN_SHARED
  [[ "$tf_tree" == identity ]] && key=TF_PLAN_IDENTITY
  case "${P[$key]}" in
    insync) ;;
    drift) TF_PENDING+=("$tf_tree") ;;
    *) TF_UNREAD+=("$tf_tree") ;;
  esac
done
if (( ${#TF_PENDING[@]} > 0 )); then
  TF_DETAIL="pending changes in: ${TF_PENDING[*]}"
  (( ${#TF_UNREAD[@]} > 0 )) && TF_DETAIL+="; not read: ${TF_UNREAD[*]}"
  row 2 "Terraform" PENDING "$TF_DETAIL"
  next_cmd "bash scripts/terraform-apply-all.sh --target $TARGET   (review each plan; take any Console-created resource in with an import block, never delete it)"
elif (( ${#TF_UNREAD[@]} > 0 )); then
  row 2 "Terraform" UNKNOWN "plan not run or failed for: ${TF_UNREAD[*]} (credentials? init?)"
  next_cmd "terraform -chdir=terraform/${TF_UNREAD[0]} init, then re-run this report"
else
  row 2 "Terraform" DONE "plan reports no changes in shared, identity or $TARGET"
fi

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
    next_cmd "< $(operator_cred_file) bash scripts/activate-payments.sh --target $TARGET --profile <profile> --deactivate   (finish the deactivation the host is stuck part-way through)"
  else
    next_cmd "scripts/arming.sh --target $TARGET --switch payments --state armed   (arm payments when ready; the script owns the tfvars, apply and deploy in order)"
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
    next_cmd "bash scripts/set-terraform-gate.sh --target $TARGET --gate enable_backup_alarm --state on"
  fi
fi

# 5. SES feedback loop
case "${P[TF_SES_SUBSCRIPTION]}" in
  present)
    row 5 "SES feedback" DONE "queue subscribed to the feedback topic in terraform state (verify: bounce probe)"
    ;;
  absent)
    row 5 "SES feedback" PENDING "no queue subscribed to the feedback topic in terraform state"
    next_cmd "< $(operator_cred_file) bash scripts/activate-notification-feeds.sh --target $TARGET --state on   (creates and subscribes the queues and puts their addresses on the host), then prove it with scripts/verify-prod-email.sh --profile <profile> --bounce-probe"
    ;;
  *)
    row 5 "SES feedback" UNKNOWN "terraform state unavailable"
    ;;
esac

# 6. First admin (production only; staging admins come from the dev bootstrap)
if [[ "$TARGET" != "production" ]]; then
  row 6 "First admin" N-A "staging admins come from the dev-bootstrap allowlist"
else
  # The host's own count of administrators who can sign in and act decides the
  # row; the token parameter only says whether a claim is waiting, because the
  # token deletes itself when claimed and so reads the same before provisioning
  # and after a claim.
  PROVISION_CMD="bash scripts/admin-bootstrap-token.sh --target production --profile <profile> provision   (then claim it at /admin/bootstrap-claim)"
  if [[ "${P[DB_ADMINS]}" =~ ^[1-9][0-9]*$ ]]; then
    row 6 "First admin" DONE "${P[DB_ADMINS]} administrator(s) on the host database can sign in and act"
  elif [[ "${P[SSM_BOOTSTRAP_TOKEN]}" == "present" ]]; then
    row 6 "First admin" PENDING "bootstrap token provisioned, awaiting claim at /admin/bootstrap-claim"
  elif [[ "${P[DB_ADMINS]}" == "0" || "${P[DB_ADMINS]}" == "none" ]]; then
    row 6 "First admin" PENDING "no administrator on the host database can sign in, and no claim is waiting"
    next_cmd "$PROVISION_CMD"
  elif [[ "${P[SSM_BOOTSTRAP_TOKEN]}" == "absent" ]]; then
    row 6 "First admin" UNKNOWN "no bootstrap token waiting, and the host database's administrators were not counted"
    next_cmd "< $(operator_cred_file) bash scripts/bringup-status.sh --target production --profile <profile>   (the remote probe counts them)"
  else
    row 6 "First admin" UNKNOWN "neither the host database nor the token parameter was read (pass the credential and --profile)"
  fi
fi

# 7. Cutover login alarm (window-scoped: on for the cutover window, off after)
if [[ "$TARGET" != "production" ]]; then
  row 7 "Cutover login alarm" N-A "production-only alarm"
else
  case "${P[TF_CUTOVER_ALARM]}" in
    present)
      row 7 "Cutover login alarm" INFO "ON; disable after the cutover window"
      next_cmd "bash scripts/set-terraform-gate.sh --target production --gate enable_cutover_login_alarm --state off"
      ;;
    absent)
      row 7 "Cutover login alarm" INFO "OFF; correct outside the cutover window, which turns it on itself"
      ;;
    *)
      row 7 "Cutover login alarm" UNKNOWN "terraform state unavailable"
      ;;
  esac
fi

# 8. Deployed runtime. Every one of the four containers has to report healthy:
# a missing worker sends no mail and runs no scheduled job, a missing image
# service serves no media, and either leaves the front page looking fine. A
# container that is up but still starting or unhealthy is not yet serving.
if [[ "${P[CONTAINERS]}" == "unknown" ]]; then
  row 8 "Deployed runtime" UNKNOWN "container state not probed"
  next_cmd "./deploy_to_aws.sh   (ships the local working tree)"
else
  RUNTIME_MISSING=""
  for svc in "${BH_CONTAINERS[@]}"; do
    svc_health="$(bh_container_health "$svc")"
    [[ "$svc_health" == Up*"(healthy)"* ]] || RUNTIME_MISSING+="${svc} (${svc_health}); "
  done
  if [[ -z "$RUNTIME_MISSING" && "${P[CW_MONITOR_HEARTBEAT]}" == "missing" ]]; then
    # Healthy containers nobody is watching: the deploy installs the monitor,
    # so a missing heartbeat means its readings are not reaching CloudWatch.
    row 8 "Deployed runtime" PENDING "containers healthy, but container_monitor_heartbeat is not arriving"
    next_cmd "ssh $SSH_ALIAS journalctl -u footbag-container-monitor.service -n 20   (then the next deploy re-applies the agent)"
  elif [[ -z "$RUNTIME_MISSING" ]]; then
    row 8 "Deployed runtime" DONE "${P[CONTAINERS]}; container monitor heartbeat: ${P[CW_MONITOR_HEARTBEAT]}"
  else
    row 8 "Deployed runtime" PENDING "not healthy: ${RUNTIME_MISSING%; }"
    next_cmd "./deploy_to_aws.sh   (ships the local working tree)"
  fi
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

# 10. Origin TLS. Until the CloudFront-to-origin hop is https-only, going live
# and installing a live Stripe key are both refused by their scripts.
if [[ "$TARGET" != "production" ]]; then
  row 10 "Origin TLS" N-A "staging has no custom domain, so its hop stays plaintext by design"
else
  case "${P[ORIGIN_HOP]}" in
    encrypted)
      row 10 "Origin TLS" DONE "the distribution reaches its origin https-only"
      ;;
    plaintext*)
      row 10 "Origin TLS" PENDING "${P[ORIGIN_HOP]}; going live and a live Stripe key are refused until it is https-only"
      next_cmd "put origin TLS in place after the zone move (origin.footbag.org, its scoped CAA, the certificate, the 443 listener, then https-only)"
      ;;
    *)
      row 10 "Origin TLS" UNKNOWN "the distribution's origin protocol was not read (pass --profile)"
      ;;
  esac
fi

# 11. Alarm gates. Each is turned on once by the script that owns it, after
# which every apply carries it, so the bootstrap names the command and never
# runs it: a gate armed before its metric arrives pages at once.
gate_cmd() {
  case "$1" in
    enable_cwagent_alarms) echo "bash scripts/arm-cwagent-alarms.sh --target $TARGET --profile <profile>" ;;
    enable_replication_alarm) echo "no script sets enable_replication_alarm yet; it is set with the snapshot replication change" ;;
    *) echo "bash scripts/set-terraform-gate.sh --target $TARGET --gate $1 --state on   (refuses until what the alarm reads is arriving)" ;;
  esac
}
case "${P[GATES_OFF]}" in
  none) row 11 "Alarm gates" DONE "every alarm gate the $TARGET tree declares is on in its values file" ;;
  unknown) row 11 "Alarm gates" UNKNOWN "the $TARGET values file was not read" ;;
  no-gates) row 11 "Alarm gates" UNKNOWN "no enable_*alarm or enable_*alarms variable was found in terraform/$TARGET, so no gate could be checked" ;;
  *)
    row 11 "Alarm gates" PENDING "off in the values file: ${P[GATES_OFF]}"
    for gate in ${P[GATES_OFF]}; do
      next_cmd "$(gate_cmd "$gate")"
    done
    ;;
esac

# 12. Alarm email subscriptions. Recreating one pauses alarm mail until its
# link is confirmed, so a recovery never does it unasked; the row names it.
case "${P[SUBS_STATE]}" in
  confirmed) row 12 "Alarm subscriptions" DONE "every email subscription on the $TARGET alarm topics is confirmed by its link" ;;
  click)
    row 12 "Alarm subscriptions" PENDING "confirmed by a click, so an unsubscribe link can remove it: ${P[SUBS_DETAIL]}"
    next_cmd "bash scripts/reconfirm-alarm-subscriptions.sh --target $TARGET   (pauses alarm mail to the address until confirmed), then bash scripts/confirm-alarm-subscription.sh --target $TARGET once per email"
    ;;
  pending)
    row 12 "Alarm subscriptions" PENDING "awaiting confirmation: ${P[SUBS_DETAIL]}"
    next_cmd "bash scripts/confirm-alarm-subscription.sh --target $TARGET   (paste the link from the email; never click it)"
    ;;
  *) row 12 "Alarm subscriptions" UNKNOWN "not read (pass --profile)" ;;
esac

# 13. Account threat detection, one per account, so production's row.
if [[ "$TARGET" != "production" ]]; then
  row 13 "GuardDuty" N-A "one account serves both environments; production's row reports it"
else
  case "${P[GUARDDUTY]}" in
    on) row 13 "GuardDuty" DONE "the account's detector is enabled" ;;
    off)
      row 13 "GuardDuty" PENDING "no enabled detector in us-east-1"
      next_cmd "bash scripts/apply-account-baseline.sh --enable-guardduty   (refuses until both environments' finding rules exist)"
      ;;
    *) row 13 "GuardDuty" UNKNOWN "not read (pass --profile)" ;;
  esac
fi

# 14. The environment's encryption keys: the application key and the session
# signing key. Either one disabled or scheduled for deletion stops the site, and
# the script named below cancels the deletion and re-enables it.
KMS_FIXABLE=""
KMS_OTHER=""
KMS_UNREAD=""
for kms_key in MAIN JWT; do
  kms_label="application key"
  [[ "$kms_key" == JWT ]] && kms_label="session signing key"
  case "${P[KMS_$kms_key]}" in
    Enabled) ;;
    PendingDeletion|Disabled) KMS_FIXABLE+="${kms_label} ${P[KMS_$kms_key]}; " ;;
    unknown|"") KMS_UNREAD+="${kms_label}; " ;;
    *) KMS_OTHER+="${kms_label} ${P[KMS_$kms_key]}; " ;;
  esac
done
if [[ -n "$KMS_FIXABLE" ]]; then
  row 14 "Encryption keys" PENDING "${KMS_FIXABLE%; }${KMS_OTHER:+; ${KMS_OTHER%; }}"
  next_cmd "bash scripts/kms-key-status.sh --target $TARGET --cancel-deletion   (cancels the deletion and re-enables, after APPLY)"
elif [[ -n "$KMS_OTHER" ]]; then
  row 14 "Encryption keys" PENDING "${KMS_OTHER%; }"
  next_cmd "bash scripts/kms-key-status.sh --target $TARGET"
elif [[ -n "$KMS_UNREAD" ]]; then
  row 14 "Encryption keys" UNKNOWN "not read: ${KMS_UNREAD%; } (pass --profile)"
else
  row 14 "Encryption keys" DONE "the application key and the session signing key are Enabled"
fi

# 15 onward. The host bootstrap's steps, one row each, judged by the same
# verdicts scripts/bootstrap-host.sh skips on. Terraform, the backup timer and
# the feeds have their rows above; the rest are here, so a host missing any
# bootstrap step shows it pending with the command that finishes it.
echo ""
echo "-- host bootstrap (bash scripts/bootstrap-host.sh --target $TARGET runs these in order) --"
BOOT_ROW=15
for step in pin account packages layout envrecord dbdir credentials cwagent deploy sshd swap operatorkeys snapshot; do
  bh_verdict "$step"
  row "$BOOT_ROW" "$BH_TITLE" "$BH_STATE" "$BH_DETAIL"
  if [[ -n "$BH_NEXT" && "$BH_STATE" != "DONE" && "$BH_STATE" != "N-A" ]]; then
    next_cmd "$BH_NEXT"
  fi
  BOOT_ROW=$(( BOOT_ROW + 1 ))
done

echo ""
# A status view: the rows above are its findings, each with the command that
# finishes it, so a pending row is not a failed run.
cr_proved "the rows above, from: ${PROBES_RUN:-no probe}"
cr_finish
