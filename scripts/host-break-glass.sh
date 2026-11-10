#!/usr/bin/env bash
# host-break-glass.sh
#
# The host break-glass playbook, and its drill. Mints a short-lived Lightsail
# certificate for a host's default account, ec2-user, which has passwordless
# sudo, and uses it: to open a root-capable shell when the routine route (the
# shared account through the footbag-<target> alias) cannot reach the host, or,
# in a drill, to prove the whole path works and is watched.
#
# WHY THIS EXISTS.
#
# The mint is the emergency route onto a host, so it is used rarely, under
# pressure, and must be simple. Done by hand it means typing CLI that prints a
# root-capable private key to the terminal. Here the key, its certificate and a
# host-key pin built from the same authenticated response go only to mode-0600
# files in a private temporary directory, are used for one connection, and are
# shredded on every exit, error and interrupt. Every mint fires the production
# break-glass alarm, which emails every subscriber; the mint carries this
# script's application id, so scripts/list-host-access-mints.sh attributes it.
#
# WHAT IT DOES (use mode).
#   1  reads the host's address and instance name from Terraform
#   2  asks for a typed APPLY, naming the instance and the alarm
#   3  tries the routine route with a pinned, non-interactive connection to the
#      footbag-<target> alias; if that connects, asks for a second APPLY
#      attesting that the routine route is not enough
#   4  mints, writes the key, the certificate and a run-private pin holding
#      exactly the response's host keys, and shreds the response
#   5  connects as ec2-user, on port 2222 and then 22, verifying the host
#      against that pin alone; proves sudo -n; fingerprints every account's
#      authorized_keys
#   6  opens the interactive session
#   7  fingerprints authorized_keys again and warns on any difference
#   8  closes with a record block to post on the incident card, and the
#      listing command to attribute the mint
#
# Drill mode (--drill) does steps 1, 2, 4, 5 and 7, then waits for the alarm's
# own history, since this run began, to show ALARM and then OK; waits for the
# listing to show this run's mint under its application id; and asks whether
# the alarm email arrived and whether production's admin dashboard raised and
# then cleared the platform alarm: the alarm feeds production's alarm topic
# whichever host the drill targets, so staging's dashboard never shows it.
#
# The alarm is footbag-production-break-glass-host-access in us-east-1. It is a
# production alarm even when the target is staging, because the trail it reads
# is account-wide.
#
# WHAT IT REFUSES TO DO.
#
#   - Run without --target, or with any target but staging or production.
#   - Run outside a drill without a --reason.
#   - Run as anything but the directly authenticated footbag-operator.
#   - Mint while the AWS CLI's own history is on: it stores each response, so
#     it would keep the private key in a database on disk. Checked before any
#     AWS call.
#   - Run in use mode without a terminal, or accept --yes outside a drill.
#   - Mint without a typed APPLY, or, when the routine route connects, without
#     the second one.
#   - Use a response that carries no host keys, or whose address differs from
#     Terraform's lightsail_static_ip.
#   - Print the private key or the certificate, anywhere.
#
# Usage:
#   bash scripts/host-break-glass.sh --target production --reason "<text>"
#   bash scripts/host-break-glass.sh --target staging --drill
#   bash scripts/host-break-glass.sh --target staging --drill --dry-run
#
# Flags:
#   --target <staging|production>  The host. No default.
#   --reason "<text>"  Why the routine route is not enough; recorded in the
#                      closing record block. Required unless --drill.
#   --drill            Prove the path and its alarm without an interactive
#                      session.
#   --dry-run          State what a real run would do; call nothing.
#   --yes              Drill only: accept the confirmation where no terminal is
#                      attached; the yes-or-no questions are then recorded as
#                      unproved.
#
# Test seams (CI only; operators never set these), announced on stderr as
# SYNTHETIC when set: HOST_BREAK_GLASS_AWS_BIN replaces the aws CLI,
# HOST_BREAK_GLASS_SSH_BIN replaces ssh, and HOST_BREAK_GLASS_POLL_SECONDS and
# HOST_BREAK_GLASS_WAIT_MINUTES replace the drill's polling interval and its
# bound (default 30 minutes). TF_OUTPUT_BIN, the Terraform reader's own seam, is
# announced the same way.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TARGET=""
REASON=""
DRILL=0
DRY_RUN=0
ASSUME_YES=""
FOOTBAG_OPERATOR_USER="footbag-operator"
APP_ID="footbag-host-break-glass"
ALARM_NAME="footbag-production-break-glass-host-access"
HOST_USER="ec2-user"

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)  TARGET="${2:-}"; shift 2 || { echo "ERROR: --target needs a value" >&2; exit 2; } ;;
    --reason)  REASON="${2:-}"; shift 2 || { echo "ERROR: --reason needs a value" >&2; exit 2; } ;;
    --drill)   DRILL=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --yes)     ASSUME_YES="yes"; shift ;;
    -h|--help) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; usage 2 ;;
  esac
done

require_target "$TARGET" staging production || exit $?
if (( ! DRILL )) && [[ -z "${REASON//[[:space:]]/}" ]]; then
  echo "ERROR: --reason \"<text>\" is required outside a drill: say why the routine route is not enough." >&2
  exit 2
fi
if (( ! DRILL )) && [[ "$ASSUME_YES" == "yes" ]]; then
  echo "ERROR: --yes is accepted only with --drill. A real break-glass use is confirmed at a terminal." >&2
  exit 2
fi
(( DRILL )) && [[ -z "$REASON" ]] && REASON="drill"
MODE="use"
(( DRILL )) && MODE="drill"

if (( DRY_RUN )); then
  cat <<PLAN
Dry run (${MODE} mode, target ${TARGET}). A real run would, as the directly
authenticated ${FOOTBAG_OPERATOR_USER}:

  1  refuse if the AWS CLI history is on
  2  read the ${TARGET} host's address and instance name from Terraform
  3  ask for a typed APPLY before minting a certificate for ${HOST_USER}
PLAN
  if (( DRILL )); then
    cat <<PLAN
  4  mint, connect as ${HOST_USER} (port 2222, then 22), prove sudo -n and
     fingerprint every authorized_keys before and after
  5  wait for ${ALARM_NAME} to show ALARM then OK in its
     history, and for the listing to attribute this run's mint
  6  ask whether the alarm email arrived and the dashboard alarm cleared
PLAN
  else
    cat <<PLAN
  4  try the routine route (footbag-${TARGET}); if it connects, ask for a
     second APPLY attesting that it is not enough
  5  mint, connect as ${HOST_USER} (port 2222, then 22), prove sudo -n,
     fingerprint every authorized_keys, open the session, fingerprint again
PLAN
  fi
  echo ""
  echo "Nothing was read, minted or connected."
  exit 0
fi

AWS_BIN="${HOST_BREAK_GLASS_AWS_BIN:-aws}"
SSH_BIN="${HOST_BREAK_GLASS_SSH_BIN:-ssh}"
POLL_SECONDS="${HOST_BREAK_GLASS_POLL_SECONDS:-60}"
WAIT_MINUTES="${HOST_BREAK_GLASS_WAIT_MINUTES:-30}"
for seam in HOST_BREAK_GLASS_AWS_BIN HOST_BREAK_GLASS_SSH_BIN HOST_BREAK_GLASS_POLL_SECONDS \
    HOST_BREAK_GLASS_WAIT_MINUTES TF_OUTPUT_BIN; do
  [[ -n "${!seam:-}" ]] && echo "SYNTHETIC: ${seam} is set; this run proves nothing about the account or the host." >&2
done
# The application id goes on the one minting call and nowhere else, so an id
# exported in the operator's shell cannot label this run's other calls.
unset AWS_SDK_UA_APP_ID

# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
# shellcheck source=lib/aws-identity.sh
source "${REPO_ROOT}/scripts/lib/aws-identity.sh"
# shellcheck source=lib/terraform-output.sh
source "${REPO_ROOT}/scripts/lib/terraform-output.sh"
# shellcheck source=lib/host-access-mint.sh
source "${REPO_ROOT}/scripts/lib/host-access-mint.sh"

STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_EPOCH="$(date -u -d "$STARTED" +%s)"

# ── Refusals before any AWS call ─────────────────────────────────────────────
if [[ "$MODE" == use ]] && ! terminal_present; then
  cr_die "no terminal: a break-glass use opens an interactive session and is confirmed at a terminal. Nothing was minted."
fi

# The minting function refuses this too; it is checked here as well because
# every AWS call this run makes before the mint would also be kept in that
# history. `aws configure get` exits 1 with no output when the setting is
# absent, which is the safe state; "disabled" is the other safe value, and
# anything else, including a failed read, is refused.
history_rc=0
history="$("$AWS_BIN" configure get cli_history 2>/dev/null)" || history_rc=$?
if ! { (( history_rc == 1 )) && [[ -z "$history" ]]; } \
   && ! { (( history_rc == 0 )) && [[ "$history" == "disabled" ]]; }; then
  cr_die "the AWS CLI history setting reads '${history}' (exit ${history_rc}); its database stores each response, so it would keep the minted private key on disk. Turn it off first: aws configure set cli_history disabled. Nothing was minted."
fi

aws_profile_ensure || cr_die "could not settle the AWS identity this run acts as. Nothing was minted."
aws_identity_require_direct_user "$FOOTBAG_OPERATOR_USER" \
  || cr_die "this run mints only as the directly authenticated ${FOOTBAG_OPERATOR_USER}. Nothing was minted."
OPERATOR_ARN="$AWS_IDENTITY_ARN"

# ── The host, from Terraform ─────────────────────────────────────────────────
if ! tf_output_read "terraform/${TARGET}" lightsail_static_ip; then
  tf_output_explain "terraform/${TARGET}" lightsail_static_ip
  cr_die "could not read the ${TARGET} host address from Terraform. Nothing was minted."
fi
HOST_IP="$TF_OUTPUT_VALUE"
[[ "$HOST_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || cr_die "the ${TARGET} host address read back as '${HOST_IP}', which is not an address. Nothing was minted."
tf_instance_name "$TARGET" || cr_die "could not read the ${TARGET} instance name from Terraform. Nothing was minted."
INSTANCE="$TF_INSTANCE_NAME"

# ── Consent ──────────────────────────────────────────────────────────────────
echo ""
echo "This mints a short-lived certificate and private key for ${HOST_USER} on ${INSTANCE}"
echo "(${HOST_IP}). ${HOST_USER} has passwordless sudo. The mint fires the ${ALARM_NAME}"
echo "alarm, which emails every subscriber."
if ! confirm_from_tty "Type 'APPLY' to mint the certificate for ${HOST_USER} on ${INSTANCE}: " "APPLY"; then
  cr_die "not confirmed. Nothing was minted."
fi

ROUTINE_ROUTE="not tried (drill)"
if [[ "$MODE" == use ]]; then
  # The routine route, tried non-interactively against the operator's own pin.
  # Break-glass is for when it cannot be used; a run that mints while it works
  # says so, and needs a second answer.
  probe_rc=0
  if require_pinned_known_hosts; then
    "$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 "${FOOTBAG_SSH_PIN_OPTS[@]}" \
      "footbag-${TARGET}" true </dev/null >/dev/null 2>&1 || probe_rc=$?
  else
    probe_rc=255
  fi
  if (( probe_rc == 0 )); then
    ROUTINE_ROUTE="connected; the operator attested it is not enough"
    echo ""
    echo "The routine route (footbag-${TARGET}) connected just now."
    if ! confirm_from_tty "Type 'APPLY' to attest that the routine route is not enough for this emergency, and mint anyway: " "APPLY"; then
      cr_die "not attested; use the routine route: ssh footbag-${TARGET}. Nothing was minted."
    fi
    cr_warn "the routine route footbag-${TARGET} connected, and the operator attested it was not enough: record why on the incident card"
  else
    ROUTINE_ROUTE="did not connect (exit ${probe_rc})"
    cr_proved "the routine route footbag-${TARGET} was tried first and did not connect (exit ${probe_rc})"
  fi
fi

# ── Private working files, shredded on every exit ────────────────────────────
WORK="$(mktemp -d)"
chmod 700 "$WORK"
shred_work() {
  [[ -n "$WORK" && -d "$WORK" ]] || return 0
  find "$WORK" -type f -exec shred -u -- {} +
  rm -rf -- "$WORK"
}
cr_cleanup shred_work
RESPONSE="${WORK}/response.json"
KEY_FILE="${WORK}/key"
CERT_FILE="${WORK}/key-cert.pub"
PIN_FILE="${WORK}/known_hosts"
SSH_ERR="${WORK}/ssh.err"

# What the record block reports, filled in as the run gets that far.
MINTED_AT=""
PORT=""
SUDO_PROVEN="no"
KEYS_CHANGED="not compared"
ALARM_RESULT="not checked"
LISTED_RESULT="not checked"

print_record() {
  [[ -n "$MINTED_AT" ]] || return 0
  {
    echo ""
    echo "---- Record for the incident card ----"
    echo "Host break-glass ${MODE} on ${TARGET}: ${INSTANCE} (${HOST_IP}) as ${HOST_USER}"
    echo "Reason: ${REASON}"
    echo "Operator identity: ${OPERATOR_ARN}"
    echo "Run started: ${STARTED}; minted: ${MINTED_AT}; ended: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Application id on the mint: ${APP_ID}"
    echo "Routine route: ${ROUTINE_ROUTE}"
    echo "Connected on port: ${PORT:-none}; sudo -n as ${HOST_USER}: ${SUDO_PROVEN}"
    echo "authorized_keys fingerprints before and after: ${KEYS_CHANGED}"
    if [[ "$MODE" == drill ]]; then
      echo "Alarm ${ALARM_NAME}: ${ALARM_RESULT}"
      echo "Mint in the listing: ${LISTED_RESULT}"
    fi
    echo "Key material: shredded at exit"
    echo "Next: bash scripts/list-host-access-mints.sh --since ${STARTED}"
    echo "--------------------------------------"
  } >&2
}
cr_cleanup print_record

# ── The mint ─────────────────────────────────────────────────────────────────
# Set before the call: a refused mint still reaches the trail and the alarm, so
# it still gets a record block.
MINTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
if ! host_access_mint "$AWS_BIN" "$APP_ID" "$INSTANCE" "$RESPONSE"; then
  MINTED_AT="${MINTED_AT} (attempted; refused)"
  cr_die "the mint failed; its reason is above."
fi
cr_proved "minted access details for ${INSTANCE} under the application id ${APP_ID}"

# The address and the host keys come from the same authenticated response as
# the key, and the address must be the one Terraform holds: a response for some
# other host is refused before anything connects.
resp_ip="$(jq -r '.accessDetails.ipAddress // ""' "$RESPONSE")" || resp_ip=""
if [[ "$resp_ip" != "$HOST_IP" ]]; then
  cr_die "the minted response names the address '${resp_ip}', not Terraform's ${HOST_IP}; refusing to connect to a host the pin cannot vouch for."
fi
host_key_rows="$(jq -r '.accessDetails.hostKeys // [] | .[] | select(.algorithm and .publicKey) | "\(.algorithm) \(.publicKey)"' "$RESPONSE")" \
  || host_key_rows=""
if [[ -z "$host_key_rows" ]]; then
  cr_die "the minted response carries no host keys, so the host could only be trusted on first use; refusing to connect."
fi

# Written under umask 077 and then set to 0600 explicitly, so ssh accepts the
# key and nothing else can read any of the three.
(
  umask 077
  jq -r '.accessDetails.privateKey // ""' "$RESPONSE" > "$KEY_FILE"
  jq -r '.accessDetails.certKey // ""' "$RESPONSE" > "$CERT_FILE"
  while IFS= read -r row; do
    printf '%s %s\n' "$HOST_IP" "$row"
    printf '[%s]:2222 %s\n' "$HOST_IP" "$row"
  done <<<"$host_key_rows" > "$PIN_FILE"
)
chmod 600 "$KEY_FILE" "$CERT_FILE" "$PIN_FILE"
shred -u -- "$RESPONSE"
[[ -s "$KEY_FILE" && -s "$CERT_FILE" ]] \
  || cr_die "the minted response carries no private key or no certificate; nothing to connect with."

# The pin is this run's alone: no other known_hosts file, the operator's own or
# the system's, can vouch for the host, and ssh learns nothing new.
BG_SSH_OPTS=(
  -i "$KEY_FILE"
  -o "CertificateFile=${CERT_FILE}"
  -o IdentitiesOnly=yes
  -o IdentityAgent=none
  -o ControlMaster=no
  -o ControlPath=none
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=${PIN_FILE}"
  -o GlobalKnownHostsFile=/dev/null
)

# bg_ssh <port> <remote command>: one non-interactive connection. Run in this
# shell, never in a command substitution, so an interrupt reaches the run's own
# handler and the cleanup.
bg_ssh() {
  local port="$1"; shift
  "$SSH_BIN" "${BG_SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=15 -p "$port" \
    "${HOST_USER}@${HOST_IP}" "$@" </dev/null
}

# Every account's authorized_keys, fingerprinted as root.
FINGERPRINT_CMD='sudo -n sh -c '\''for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do [ -f "$f" ] || continue; ssh-keygen -lf "$f" 2>/dev/null | sed "s|^|$f |" || echo "$f (no readable key)"; done'\'''

# ── Connect: port 2222, then 22 ──────────────────────────────────────────────
# ssh exits 255 for a connection or authentication failure and with the remote
# command's status otherwise, which is how a port that does not answer is told
# apart from a host that answers and refuses sudo.
for try_port in 2222 22; do
  rc=0
  bg_ssh "$try_port" 'sudo -n true' 2>"$SSH_ERR" || rc=$?
  if (( rc == 0 )); then
    PORT="$try_port"
    break
  fi
  if (( rc != 255 )); then
    PORT="$try_port"
    cr_die "connected as ${HOST_USER} on port ${try_port}, but sudo -n true was refused (exit ${rc}): $(tail -n 1 "$SSH_ERR")"
  fi
  cr_warn "could not connect as ${HOST_USER} on port ${try_port}: $(tail -n 1 "$SSH_ERR")"
done
[[ -n "$PORT" ]] || cr_die "could not connect as ${HOST_USER} on port 2222 or 22."
SUDO_PROVEN="yes"
cr_proved "connected as ${HOST_USER} on port ${PORT}, verified against a pin holding exactly the minted host keys, and sudo -n true succeeded"

fingerprint() {
  local out="$1" rc=0
  bg_ssh "$PORT" "$FINGERPRINT_CMD" >"$out" 2>"$SSH_ERR" || rc=$?
  if (( rc != 0 )); then
    cr_error "could not fingerprint authorized_keys (exit ${rc}): $(tail -n 1 "$SSH_ERR")"
    return 1
  fi
}
FP_BEFORE="${WORK}/fingerprints.before"
FP_AFTER="${WORK}/fingerprints.after"
fp_before_ok=0
fingerprint "$FP_BEFORE" && fp_before_ok=1

# ── The interactive session (use mode) ───────────────────────────────────────
# Run directly on the terminal, never through the closing report's wrappers: it
# needs the terminal, and what it prints is the operator's session.
if [[ "$MODE" == use ]]; then
  echo ""
  echo "Opening the session as ${HOST_USER} on ${INSTANCE}, port ${PORT}. Exit it to finish the run."
  session_rc=0
  "$SSH_BIN" "${BG_SSH_OPTS[@]}" -p "$PORT" "${HOST_USER}@${HOST_IP}" || session_rc=$?
  if (( session_rc == 255 )); then
    cr_warn "the interactive session ended with ssh's connection-failure status (255)"
  fi
fi

if (( fp_before_ok )) && fingerprint "$FP_AFTER"; then
  if diff -q -- "$FP_BEFORE" "$FP_AFTER" >/dev/null; then
    KEYS_CHANGED="unchanged"
    cr_proved "every account's authorized_keys fingerprints are the same after the session as before it"
  else
    KEYS_CHANGED="CHANGED (see the warnings)"
    while IFS= read -r line; do
      cr_warn "authorized_keys changed during the run: ${line}"
    done < <(diff -- "$FP_BEFORE" "$FP_AFTER" | grep -E '^[<>]' || [[ $? == 1 ]])
  fi
fi

# ── Drill: the alarm and the listing ─────────────────────────────────────────
if [[ "$MODE" == drill ]]; then
  echo ""
  echo "-- waiting up to ${WAIT_MINUTES} minutes for ${ALARM_NAME} to fire and clear, and for the listing --"
  deadline=$(( $(date +%s) + WAIT_MINUTES * 60 ))
  alarm_state="none"   # none, alarm (fired), cleared (fired then OK)
  listed=0
  hist_file="${WORK}/alarm-history.json"
  list_out="${WORK}/listing.out"
  list_err="${WORK}/listing.err"
  list_report="${WORK}/listing.report"
  list_env=()
  [[ -n "${HOST_BREAK_GLASS_AWS_BIN:-}" ]] && list_env=("LIST_HOST_ACCESS_MINTS_AWS_BIN=${AWS_BIN}")

  # The alarm's state transitions since this run began, oldest first. The
  # start date is given to AWS and applied again here, so a transition from
  # before the run can never count as this run's proof.
  judge_history() {
    jq -r --argjson start "$STARTED_EPOCH" '
      def ep: sub("\\.[0-9]+"; "") | sub("(\\+00:00|Z)$"; "") | . + "Z" | fromdateiso8601;
      (.AlarmHistoryItems // [])
      | map({t: (.Timestamp | ep), s: (.HistorySummary // "")})
      | map(select(.t >= $start)) | sort_by(.t)
      | (map(.s | test("to ALARM$")) | index(true)) as $a
      | if $a == null then "none"
        elif (.[($a + 1):] | map(.s | test("to OK$")) | any) then "cleared"
        else "alarm" end' "$hist_file"
  }

  while :; do
    if [[ "$alarm_state" != cleared ]]; then
      if "$AWS_BIN" cloudwatch describe-alarm-history --region us-east-1 --alarm-name "$ALARM_NAME" \
          --history-item-type StateUpdate --start-date "$STARTED" --output json >"$hist_file" 2>"$SSH_ERR"; then
        if ! alarm_state="$(judge_history 2>"$SSH_ERR")"; then
          alarm_state="none"
          cr_warn "the alarm history did not parse: $(tail -n 1 "$SSH_ERR")"
        fi
      else
        cr_warn "could not read the alarm history: $(tail -n 1 "$SSH_ERR")"
      fi
    fi
    if (( ! listed )); then
      # The listing is a child run on the closing-report library; its report
      # goes to a private file, so an unrelated call it cannot attribute is its
      # finding, not this drill's error. Its rows are read for this run's mint.
      : > "$list_report"
      env ${list_env[@]+"${list_env[@]}"} FOOTBAG_CR_REPORT_TO="$list_report" \
        bash "${REPO_ROOT}/scripts/list-host-access-mints.sh" --since "$STARTED" \
        >"$list_out" 2>"$list_err" || [[ $? == 1 ]] || cr_warn "the listing did not run: $(tail -n 1 "$list_err")"
      while IFS=$'\t' read -r l_time l_class _ _ l_instance _ l_app; do
        if [[ "$l_class" == claimed && "$l_app" == "$APP_ID" && "$l_instance" == "$INSTANCE" \
              && ! "$l_time" < "$STARTED" ]]; then
          listed=1
        fi
      done <"$list_out"
    fi
    [[ "$alarm_state" == cleared ]] && (( listed )) && break
    (( $(date +%s) >= deadline )) && break
    sleep "$POLL_SECONDS"
  done

  case "$alarm_state" in
    cleared)
      ALARM_RESULT="ALARM then OK in its history since ${STARTED}"
      cr_proved "${ALARM_NAME} fired on this run's mint and returned to OK, by its own history since the run began"
      ;;
    alarm)
      ALARM_RESULT="ALARM, with no OK, within ${WAIT_MINUTES} minutes"
      cr_error "${ALARM_NAME} fired but did not return to OK within ${WAIT_MINUTES} minutes, so nothing has cleared the platform alarm on the admin dashboard"
      ;;
    *)
      ALARM_RESULT="no ALARM within ${WAIT_MINUTES} minutes"
      cr_error "${ALARM_NAME} did not fire within ${WAIT_MINUTES} minutes of this run's mint"
      ;;
  esac
  if (( listed )); then
    LISTED_RESULT="claimed under ${APP_ID}"
    cr_proved "the listing shows this run's mint on ${INSTANCE} under the application id ${APP_ID}"
  else
    LISTED_RESULT="not found within ${WAIT_MINUTES} minutes"
    cr_error "the listing did not show this run's mint on ${INSTANCE} under ${APP_ID} within ${WAIT_MINUTES} minutes"
  fi

  # Delivery to a mailbox and what the admin dashboard showed are outside AWS's
  # reach from here, so the operator attests to them.
  for question in \
      "the alarm email for ${ALARM_NAME} arrive" \
      "production's admin dashboard (/admin/alarms) raise and then clear the platform alarm"; do
    if [[ "$ASSUME_YES" == "yes" ]] || ! terminal_present; then
      cr_unproved "did ${question} (not asked: no terminal)"
      continue
    fi
    printf 'Did %s? (yes/no): ' "$question" > /dev/tty
    answer=""; read -r answer < /dev/tty || answer=""
    if [[ "$answer" == "yes" ]]; then
      cr_proved "did ${question}: yes (operator attested)"
    else
      cr_error "the operator did not confirm: did ${question}?"
    fi
  done
fi

echo ""
echo "Next: attribute this run's mint and any other since it began:"
echo "  bash scripts/list-host-access-mints.sh --since ${STARTED}"
cr_finish
