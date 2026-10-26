#!/usr/bin/env bash
# restore-host.sh
#
# Restores an environment's host, in its own region, from the host's automatic
# snapshot, puts the real database back onto it, and proves the restored host
# answers as that environment. It is what the four-hour recovery objective for
# losing a host rests on.
#
# WHY THIS EXISTS.
#
# Everything on the host that is not the database is hand-bootstrapped and
# declared nowhere, so the automatic snapshot is the only copy of it. Restoring
# one by hand is a dozen console steps under pressure, and the dangerous ones
# are the quiet ones: the new instance boots with the provider's default
# firewall, which admits every address to SSH and to the site's origin port; it
# boots on the snapshot's day-old database and would serve, mail and take
# payments from it the moment CloudFront reaches it; the static IP left on the
# old instance keeps CloudFront pointed at a dead host; and the instance's name
# is part of its identity in Terraform, so the next plan proposes to destroy the
# restored host and build an empty one in its place. This run takes every step,
# in an order that keeps the old host available to go back to and the restored
# one off the public path until its database is the real one, and checks each
# outcome rather than each command.
#
# WHAT IT DOES, in order. Each step is decided from what AWS and Terraform
# report, so a run stopped anywhere is finished by running it again, from any
# operator workstation:
#
#   1. Preconditions: the caller is the footbag-operator IAM user; the
#      environment's instance and static IP exist and agree with Terraform; an
#      automatic snapshot exists, and which one will be used and its age is
#      shown. Then the whole operation is stated and APPLY is asked for.
#   2. A manual snapshot of the current instance, waited on until available.
#      It is the record of this restore: its tags name the new instance, the
#      automatic snapshot used and when the restore started, which is how a
#      later run, --status and --delete-old find it.
#   3. The current instance stopped, never deleted, so it cannot keep writing
#      database backups or sending mail beside the restored one. A stop stuck in
#      "stopping" is forced only after its own typed APPLY. The newest database
#      backup it wrote is recorded on the manual snapshot, with its age against
#      the stop judged by the backup-staleness alarm's threshold as Terraform
#      records it: the restored host uploads its own day-old database within
#      minutes, and those uploads are newer than the real one.
#   4. A new instance from the automatic snapshot, under a new name, because a
#      Lightsail instance's name cannot be reused while the old one exists and
#      cannot be changed. Same zone, bundle, key pair, address type and
#      snapshot time as the old one, and the tags the tree gives what it manages.
#   5. The old instance's firewall, less the origin port (80), written onto the
#      new one as soon as Lightsail accepts the write, and read back, because a
#      snapshot carries no firewall rules and CloudFront must not reach the host
#      yet. Then the instance is waited on until running.
#   6. The static IP moved to the new instance and read back, so the CloudFront
#      origin and every allowlist keep working unchanged.
#   7. The real database put back: the host, reached over a pin built from the
#      new instance's keys in the Lightsail API, confirms it is this environment,
#      has its service and backup timer stopped, gets the recorded last backup
#      through scripts/restore-db.sh (which asks for its own APPLY), and then has
#      its backup timer started again.
#   8. The new instance adopted into Terraform so a plan shows no replacement:
#      the instance's name written into the environment's values file; a plan
#      read and found to change nothing but the instance, its firewall and the
#      static IP's attachment, and the new instance read and found to match the
#      old one and the tree; only then the old instance and its firewall removed
#      from state (they are not destroyed), and the tree's import block taking
#      the new instance in through scripts/terraform-apply.sh, after a plan of
#      its own has been read and found to destroy nothing and change nothing
#      else. That apply restores the declared firewall, opening the origin port,
#      which is then read back.
#   9. The host-key pin re-taken through scripts/install-known-hosts.sh and
#      proved against the new instance's keys from the Lightsail API.
#  10. The restored host asked which environment it is (require_host_is), and
#      the site asked for readiness through the public base address it records.
#  11. The elapsed time printed against the four-hour objective.
#
# A restore whose new instance is itself lost before --delete-old is not stuck:
# when the open restore is complete and its host no longer proves itself, the
# record is marked superseded and a fresh restore starts with that instance as
# the old one. The instance the earlier restore replaced stays stopped.
#
# --delete-old is a separate run with its own APPLY naming the old instance. It
# deletes it only after the restored host passes the same identity and
# readiness checks again, and only when the static IP and Terraform both name
# the new one.
#
# WHAT IT REFUSES.
#
#   - A target it was not given. There is no default.
#   - Any caller but the footbag-operator IAM user, as AWS reports it. The job
#     role is denied the Lightsail call that reads host keys, and a run that
#     cannot re-pin the host would leave every later script refusing it.
#   - A run with no terminal for the typed confirmation, and --yes. Nothing
#     supplies APPLY in advance.
#   - A static IP or Terraform state that disagrees with itself about which
#     instance is the environment's host, before anything is changed.
#   - An instance with no successful automatic snapshot.
#   - Opening the origin port before the real database is in place: with no
#     last backup recorded, a host that does not confirm it is this
#     environment, a service that will not stop, or a database restore that does
#     not complete, the run stops with port 80 closed.
#   - Removing anything from Terraform state while a plan changes anything but
#     the instance, its firewall and the static IP's attachment, or while the new
#     instance's blueprint, bundle, key pair or zone differs from the old one's
#     or the tree's.
#   - A Terraform plan that destroys anything, replaces anything, or changes
#     anything beyond the adoption. That plan is shown and the run stops.
#   - Deleting the old instance in the same run that restored it, or before
#     the restored host has proved itself.
#
# An interrupt (Ctrl-C) before the static IP has moved deletes the new
# instance, if this run created it: until then nothing outside this run points
# at it, and it is a host running a day-old database. Once the static IP is on
# it, an interrupt leaves everything where it stands and says so; run again to
# finish. Nothing this run did not create is ever deleted, and the old
# instance is only ever stopped. Every temporary file (saved plans, plan
# output, the values-file copy, the pin built from the API) lives in one private
# directory that is shredded and removed however the run ends.
#
# Usage. The host sudo password arrives on stdin, line 1, for the checks and
# the database restore on the restored host:
#
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/restore-host.sh --target staging
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/restore-host.sh --target production
#   < ~/AWS/AWS_OPERATOR.txt bash scripts/restore-host.sh --target staging --delete-old
#   bash scripts/restore-host.sh --target staging --status
#   bash scripts/restore-host.sh --target staging --dry-run
#
# Flags:
#   --target <staging|production>  required; never defaulted.
#   --restore-date YYYY-MM-DD      restore an older automatic snapshot than the
#                                  newest. Only when starting a restore.
#   --db-snapshot <key>            the database backup to restore when the run
#                                  recorded none (no backup of the old host was
#                                  found). Refused when one is recorded.
#   --delete-old                   delete the instance a finished restore
#                                  replaced, after proving the restored host.
#   --status                       report each step of the open restore, read
#                                  only; needs no credential.
#   --dry-run                      state what a run would do; reaches nothing.
#
# Test seams (CI only; operators never set these), each announced on stderr:
# RESTORE_HOST_AWS_BIN, RESTORE_HOST_TERRAFORM_BIN and RESTORE_HOST_CURL_BIN
# replace the three tools; RESTORE_HOST_TF_APPLY, RESTORE_HOST_PIN_INSTALLER and
# RESTORE_HOST_RESTORE_DB replace scripts/terraform-apply.sh,
# scripts/install-known-hosts.sh and scripts/restore-db.sh;
# RESTORE_HOST_VALUES_FILE names the values file written in step 8;
# RESTORE_HOST_NOW fixes the clock (epoch seconds); RESTORE_HOST_POLL_TRIES and
# RESTORE_HOST_POLL_SECS bound every wait. The identity check uses
# AWS_IDENTITY_BIN and the host checks FOOTBAG_HOST_SSH_BIN, both announced by
# their libraries.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# confirm_from_tty, require_target, require_operator_stdin, require_host_is.
# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"
# shellcheck source=lib/aws-profile.sh
source "${SCRIPT_DIR}/lib/aws-profile.sh"

REGION="us-east-1"
# The recovery objective for losing a host in its own region.
OBJECTIVE_SECS=$(( 4 * 3600 ))
# A day between automatic snapshots plus the grace a daily job is allowed; an
# older newest snapshot is used if the operator confirms, but said plainly.
STALE_SNAPSHOT_SECS=$(( 26 * 3600 ))
TAG_STATE="footbag-restore-state"
TAG_TO="footbag-restore-to"
TAG_SOURCE="footbag-restore-source"
TAG_STARTED="footbag-restore-started"
TAG_BACKUP="footbag-restore-last-backup"
TAG_DB="footbag-restore-db"
# The three Terraform addresses the adoption touches.
TF_INSTANCE="aws_lightsail_instance.web"
TF_PORTS="aws_lightsail_instance_public_ports.web"
TF_ATTACH="aws_lightsail_static_ip_attachment.web"
# The port CloudFront reaches the origin on. Kept closed on the restored host
# until its database is the real one.
ORIGIN_PORT=80

TARGET=""
MODE="restore"
RESTORE_DATE=""
DB_SNAPSHOT=""

die() { echo "restore-host: $*" >&2; exit 1; }

usage() {
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)       TARGET="${2:-}"; shift 2 || { echo "restore-host: --target requires an argument" >&2; exit 2; } ;;
    --restore-date) RESTORE_DATE="${2:-}"; shift 2 || { echo "restore-host: --restore-date requires an argument" >&2; exit 2; } ;;
    --db-snapshot)  DB_SNAPSHOT="${2:-}"; shift 2 || { echo "restore-host: --db-snapshot requires an argument" >&2; exit 2; } ;;
    --delete-old)   MODE="delete-old"; shift ;;
    --status)       MODE="status"; shift ;;
    --dry-run)      MODE="dry-run"; shift ;;
    --yes)
      echo "restore-host: --yes is refused. Replacing a host is confirmed at a terminal, every time." >&2
      exit 2 ;;
    -h|--help) usage 0 ;;
    *) echo "restore-host: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

require_target "$TARGET" staging production || exit 2
if [[ -n "$RESTORE_DATE" ]]; then
  [[ "$MODE" == "restore" ]] || die "--restore-date applies only when starting a restore"
  [[ "$RESTORE_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "--restore-date must be YYYY-MM-DD (got '${RESTORE_DATE}')"
fi
if [[ -n "$DB_SNAPSHOT" ]]; then
  [[ "$MODE" == "restore" ]] || die "--db-snapshot applies only to a restore run"
  [[ "$DB_SNAPSHOT" =~ ^(routine|hourly|daily)/[0-9]{4}/[0-9]{2}/[0-9]{2}/footbag-[0-9]{8}T[0-9]{6}Z\.db\.gz$ ]] \
    || die "--db-snapshot must be a backup key such as routine/YYYY/MM/DD/footbag-YYYYMMDDTHHMMSSZ.db.gz (got '${DB_SNAPSHOT}')"
fi

ALIAS="footbag-${TARGET}"
CANON="footbag-${TARGET}-web"
STATIC_IP_NAME="${CANON}-ip"
TF_DIR="terraform/${TARGET}"
# The instance names this environment's host can carry: the original, and a
# restore's, which is the original plus the minute it was made.
NAME_PATTERN="^${CANON}(-r[0-9]{12})?$"

if [[ "$MODE" == "dry-run" ]]; then
  cat <<EOF
restore-host --target ${TARGET}: dry run, nothing reached.

A restore run would, deciding each step from what AWS and Terraform report:
  1. prove the caller is footbag-operator; read the instance Terraform names,
     the static IP ${STATIC_IP_NAME} and the instance's automatic snapshots;
     show the snapshot it will use and its age; ask for APPLY
  2. take a manual snapshot of the current instance (the restore's record)
  3. stop the current instance (forcing a stuck stop only after its own APPLY)
     and record its newest database backup and that backup's age
  4. create ${CANON}-r<YYYYMMDDHHMM> from the automatic snapshot
  5. copy the old instance's firewall onto it, without port ${ORIGIN_PORT}
  6. move ${STATIC_IP_NAME} onto it
  7. stop its service and backup timer, restore the recorded backup onto it with
     scripts/restore-db.sh (its own APPLY), and start the backup timer again
  8. write lightsail_instance_name into ${TF_DIR}/terraform.tfvars, check the
     plan changes only the adoption and the new instance matches, remove the
     old instance and its firewall from Terraform state, and apply the import
     through scripts/terraform-apply.sh, which opens port ${ORIGIN_PORT}
  9. re-take the host-key pin with scripts/install-known-hosts.sh
 10. check the host records FOOTBAG_ENV=${TARGET} and the site reports ready
 11. print the elapsed time against the four-hour objective

--delete-old would then delete the stopped old instance, after its own APPLY.
EOF
  exit 0
fi

AWS_BIN="${RESTORE_HOST_AWS_BIN:-aws}"
TF_BIN="${RESTORE_HOST_TERRAFORM_BIN:-terraform}"
CURL_BIN="${RESTORE_HOST_CURL_BIN:-curl}"
TF_APPLY="${RESTORE_HOST_TF_APPLY:-${SCRIPT_DIR}/terraform-apply.sh}"
PIN_INSTALLER="${RESTORE_HOST_PIN_INSTALLER:-${SCRIPT_DIR}/install-known-hosts.sh}"
RESTORE_DB="${RESTORE_HOST_RESTORE_DB:-${SCRIPT_DIR}/restore-db.sh}"
VALUES_FILE="${RESTORE_HOST_VALUES_FILE:-${TF_DIR}/terraform.tfvars}"
POLL_TRIES="${RESTORE_HOST_POLL_TRIES:-120}"
POLL_SECS="${RESTORE_HOST_POLL_SECS:-10}"
for seam in RESTORE_HOST_AWS_BIN RESTORE_HOST_TERRAFORM_BIN RESTORE_HOST_CURL_BIN \
            RESTORE_HOST_TF_APPLY RESTORE_HOST_PIN_INSTALLER RESTORE_HOST_RESTORE_DB \
            RESTORE_HOST_VALUES_FILE RESTORE_HOST_NOW RESTORE_HOST_POLL_TRIES RESTORE_HOST_POLL_SECS; do
  [[ -n "${!seam:-}" ]] && echo "restore-host: TEST SEAM ${seam} is set; this run proves nothing about the estate." >&2
done

command -v jq >/dev/null 2>&1 || die "jq is required: the Terraform plan and the firewall are judged from JSON"

now_epoch() { printf '%s' "${RESTORE_HOST_NOW:-$(date -u +%s)}"; }

# One private directory for every temporary file this run makes: saved plans
# (zips carrying resolved values from state, secrets among them), plan output,
# the values-file copy and the pin built from the Lightsail API. It is made here,
# in the run itself, because a file made inside a command substitution is made
# in a subshell whose bookkeeping the exit trap never sees. Whatever lands in it,
# from whichever subshell, goes when the run ends, however it ends.
umask 077
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/footbag-restore-host.XXXXXX")" || die "could not create a private temporary directory"
cleanup_tmp() {
  [[ -n "${TMP_DIR:-}" && -d "$TMP_DIR" ]] || return 0
  find "$TMP_DIR" -type f -exec shred -u {} + 2>/dev/null || true
  rm -rf -- "$TMP_DIR"
  return 0
}
trap cleanup_tmp EXIT
trap 'cleanup_tmp; exit 130' INT TERM
tmp_file() { mktemp "${TMP_DIR}/$1.XXXXXX"; }

# Set once this run has itself created the new instance, and once the static
# IP is confirmed on it. Together they decide what an interrupt may undo.
CREATED_NEW=0
IP_MOVED=0
NEW=""

aws_ls() { "$AWS_BIN" lightsail "$@" --region "$REGION" </dev/null; }
tf() { "$TF_BIN" -chdir="$TF_DIR" "$@" </dev/null; }

on_interrupt() {
  trap - INT TERM
  echo "" >&2
  echo "restore-host: interrupted." >&2
  if (( CREATED_NEW )) && (( ! IP_MOVED )) && [[ -n "$NEW" ]]; then
    # Read live rather than trusted from the flag: an attach in flight when the
    # interrupt landed may have completed, and then the instance is in use.
    local row="" to=""
    row="$(aws_ls get-static-ip --static-ip-name "$STATIC_IP_NAME" \
          --query 'staticIp.[isAttached,attachedTo,ipAddress]' --output text 2>/dev/null)" || row=""
    IFS=$'\t' read -r _ to _ <<< "$row"
    if [[ -z "$row" ]]; then
      echo "  The static IP could not be read, so ${NEW} is left in place. Check it before running again." >&2
    elif [[ "$to" == "$NEW" ]]; then
      echo "  The static IP is on ${NEW}, so it is in use and is left in place. Run again to finish." >&2
    else
      echo "  Deleting ${NEW}, which this run created and nothing points at yet." >&2
      if aws_ls delete-instance --instance-name "$NEW" >/dev/null 2>&1; then
        echo "  Deleted. The old instance is as this run left it; run again to start over." >&2
      else
        echo "  The delete was refused; remove ${NEW} in Lightsail once you have checked it." >&2
      fi
    fi
  else
    echo "  Nothing this run created is unreferenced, so everything is left as it stands." >&2
    echo "  Run again to finish, or --status to see where it stopped." >&2
  fi
  cleanup_tmp
  exit 130
}
trap on_interrupt INT TERM

# ── Facts, read from AWS ─────────────────────────────────────────────────────

# instance_row <name>: sets I_STATE I_AZ I_BUNDLE I_KEY I_IPTYPE I_SNAPTIME.
# Returns 1 when no such instance exists. Read from the listing rather than a
# single-instance call, so absence is an answer and not an error to interpret.
instance_row() {
  local want="$1" rows n s az b k ip t
  rows="$(aws_ls get-instances --query \
    'instances[].[name,state.name,location.availabilityZone,bundleId,sshKeyName,ipAddressType,addOns[?name==`AutoSnapshot`].snapshotTimeOfDay|[0]]' \
    --output text)" || die "could not list the Lightsail instances"
  I_STATE="" I_AZ="" I_BUNDLE="" I_KEY="" I_IPTYPE="" I_SNAPTIME=""
  while IFS=$'\t' read -r n s az b k ip t; do
    [[ "$n" == "$want" ]] || continue
    I_STATE="$s" I_AZ="$az" I_BUNDLE="$b" I_KEY="$k" I_IPTYPE="$ip" I_SNAPTIME="$t"
    return 0
  done <<< "$rows"
  return 1
}

# instance_identity <name>: prints "blueprint<TAB>bundle<TAB>key pair<TAB>zone"
# as Lightsail reports the instance itself.
instance_identity() {
  aws_ls get-instance --instance-name "$1" \
    --query 'instance.[blueprintId,bundleId,sshKeyName,location.availabilityZone]' --output text \
    || die "could not read the instance $1"
}

# static_ip_row: sets SIP_ATTACHED (True/False), SIP_TO and SIP_ADDR.
static_ip_row() {
  local row
  row="$(aws_ls get-static-ip --static-ip-name "$STATIC_IP_NAME" \
    --query 'staticIp.[isAttached,attachedTo,ipAddress]' --output text)" \
    || die "could not read the static IP ${STATIC_IP_NAME}"
  IFS=$'\t' read -r SIP_ATTACHED SIP_TO SIP_ADDR <<< "$row"
  [[ "$SIP_TO" == "None" ]] && SIP_TO=""
  return 0
}

# find_record: the open restore for this environment, if any. Sets REC_NAME,
# REC_FROM (the old instance), REC_SNAP_STATE, REC_TO (the new instance),
# REC_SOURCE (the automatic snapshot date), REC_STARTED, REC_BACKUP (the last
# backup the old instance wrote) and REC_DB (the backup restored onto the new
# instance, once it has been).
find_record() {
  local rows name from state rstate to source started backup db found=0
  rows="$(aws_ls get-instance-snapshots --query \
    "instanceSnapshots[].[name,fromInstanceName,state,tags[?key=='${TAG_STATE}'].value|[0],tags[?key=='${TAG_TO}'].value|[0],tags[?key=='${TAG_SOURCE}'].value|[0],tags[?key=='${TAG_STARTED}'].value|[0],tags[?key=='${TAG_BACKUP}'].value|[0],tags[?key=='${TAG_DB}'].value|[0]]" \
    --output text)" || die "could not list the instance snapshots"
  REC_NAME="" REC_FROM="" REC_SNAP_STATE="" REC_TO="" REC_SOURCE="" REC_STARTED="" REC_BACKUP="" REC_DB=""
  while IFS=$'\t' read -r name from state rstate to source started backup db; do
    [[ "$rstate" == "open" && "$from" =~ $NAME_PATTERN ]] || continue
    found=$(( found + 1 ))
    REC_NAME="$name" REC_FROM="$from" REC_SNAP_STATE="$state" REC_TO="$to"
    REC_SOURCE="$source" REC_STARTED="$started" REC_BACKUP="$backup" REC_DB="$db"
  done <<< "$rows"
  [[ "$REC_BACKUP" == "None" ]] && REC_BACKUP=""
  [[ "$REC_DB" == "None" ]] && REC_DB=""
  (( found <= 1 )) || die "${found} open restores are recorded for ${TARGET}; resolve them in Lightsail before running this"
  (( found == 1 ))
}

tf_output() {
  local name="$1" v
  v="$(tf output -raw "$name" 2>/dev/null)" || die "could not read ${TF_DIR} output ${name}"
  printf '%s' "$v"
}

# poll_until <command...>: true once the command succeeds within the bound.
poll_until() {
  local i
  for (( i = 1; i <= POLL_TRIES; i++ )); do
    "$@" && return 0
    (( i < POLL_TRIES )) && sleep "$POLL_SECS"
  done
  return 1
}

poll() {
  local what="$1"
  shift
  poll_until "$@" || die "gave up waiting for ${what}"
}

instance_is() { instance_row "$1" && [[ "$I_STATE" == "$2" ]]; }
snapshot_available() { find_record && [[ "$REC_SNAP_STATE" == "available" ]]; }

elapsed_line() {
  local started="$1" now secs
  now="$(now_epoch)"
  secs=$(( now - started ))
  if (( secs <= OBJECTIVE_SECS )); then
    printf 'elapsed %dh %02dm, within the 4-hour in-region recovery objective' $(( secs / 3600 )) $(( secs % 3600 / 60 ))
  else
    printf 'elapsed %dh %02dm, OVER the 4-hour in-region recovery objective' $(( secs / 3600 )) $(( secs % 3600 / 60 ))
  fi
}

port_states() {
  aws_ls get-instance-port-states --instance-name "$1" --output json \
    | jq -c '[.portStates[]? | {fromPort, toPort, protocol,
               cidrs: ((.cidrs // []) | sort), ipv6Cidrs: ((.ipv6Cidrs // []) | sort),
               cidrListAliases: ((.cidrListAliases // []) | sort)}] | sort_by(.fromPort, .protocol)'
}

# A firewall less every rule that covers the origin port.
without_origin() {
  jq -c --argjson p "$ORIGIN_PORT" '[.[] | select((.fromPort <= $p and .toPort >= $p) | not)]'
}

# ── The last real backup, judged against the backup alarm ────────────────────

# The staleness threshold, in minutes, of the backup alarm Terraform manages,
# read from state; empty when the alarm is not deployed.
backup_alarm_minutes() {
  tf show -json 2>/dev/null \
    | jq -r '[.values.root_module.resources[]?
              | select(.type == "aws_cloudwatch_metric_alarm" and .name == "db_backup_age")
              | .values.threshold][0] // empty' 2>/dev/null || true
}

# The time a backup was taken, from its key's footbag-<UTC timestamp> name.
backup_key_epoch() {
  local base="${1##*/}"
  [[ "$base" =~ ^footbag-([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z ]] || return 1
  date -u -d "${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]} ${BASH_REMATCH[4]}:${BASH_REMATCH[5]}:${BASH_REMATCH[6]}" +%s
}

report_backup_age() {
  local key="$1" stopped="$2" taken age minutes
  if ! taken="$(backup_key_epoch "$key")"; then
    echo "    WARNING: the age of ${key} cannot be read from its name; anything newer is only in the manual snapshot ${REC_NAME}."
    return 0
  fi
  age=$(( stopped - taken ))
  (( age < 0 )) && age=0
  printf '    last database backup %s, written %dh %02dm before the stop\n' "$key" $(( age / 3600 )) $(( age % 3600 / 60 ))
  minutes="$(backup_alarm_minutes)"
  minutes="${minutes%%.*}"
  if [[ ! "$minutes" =~ ^[0-9]+$ ]]; then
    echo "    (no backup-staleness alarm is in ${TF_DIR} state to judge that age against;"
    echo "    anything ${OLD} wrote after it is only in the manual snapshot ${REC_NAME})"
  elif (( age > minutes * 60 )); then
    echo "    WARNING: that is older than the ${minutes}-minute backup alarm threshold. Anything ${OLD}"
    echo "    wrote after it is only in the manual snapshot ${REC_NAME}, not in the restored database."
  fi
  return 0
}

# ── The Terraform plan, read before anything is applied ─────────────────────

# plan_json: plans the tree into a private file and prints its JSON.
plan_json() {
  local plan out
  plan="$(tmp_file plan)"
  out="$(tmp_file plan-log)"
  if ! tf plan -input=false -no-color -out="$plan" >"$out" 2>&1; then
    sed 's/^/    /' "$out" >&2
    die "terraform plan failed on ${TF_DIR}"
  fi
  tf show -json "$plan" 2>/dev/null || die "could not read the plan back as JSON"
}

# Before the old instance leaves state: the plan may replace the instance, its
# firewall and the static IP's attachment, and must change nothing else.
# Anything else refused only after the removal would strand the restored host
# outside Terraform while it is resolved.
check_pre_plan() {
  local json="$1" problems
  problems="$(printf '%s' "$json" | jq -r --arg inst "$TF_INSTANCE" --arg ports "$TF_PORTS" --arg attach "$TF_ATTACH" '
    [ .resource_changes[]? | select(.address != $inst and .address != $ports and .address != $attach) ] as $other
    | [ ( $other[] | select(.change.actions | index("delete")) | "\(.address) would be destroyed or replaced" ),
        ( $other[] | select((.change.actions | index("delete")) | not)
                   | select(.change.actions != ["no-op"] and .change.actions != ["read"])
                   | "\(.address) plans \(.change.actions | join("+")), which is not part of the adoption" )
      ] | unique | .[]')"
  if [[ -n "$problems" ]]; then
    echo "restore-host: the plan changes more than the adoption, so nothing is removed from state:" >&2
    printf '%s\n' "$problems" | sed 's/^/    - /' >&2
    return 1
  fi
  return 0
}

# Before the old instance leaves state: the new instance, as Lightsail reports
# it, has the old instance's blueprint, bundle, key pair and zone, and the tree
# plans the same ones. A difference would make the import a replacement.
check_new_matches() {
  local json="$1" tree old new problems="" i
  local labels=("blueprint" "bundle" "key pair" "availability zone")
  tree="$(printf '%s' "$json" | jq -r --arg inst "$TF_INSTANCE" '
    [ .resource_changes[]? | select(.address == $inst) ][0].change.after // {}
    | [ (.blueprint_id // "unknown"), (.bundle_id // "unknown"), (.key_pair_name // "unknown"), (.availability_zone // "unknown") ]
    | @tsv')"
  old="$(instance_identity "$OLD")"
  new="$(instance_identity "$NEW")"
  local -a t o n
  IFS=$'\t' read -r -a t <<< "$tree"
  IFS=$'\t' read -r -a o <<< "$old"
  IFS=$'\t' read -r -a n <<< "$new"
  for (( i = 0; i < 4; i++ )); do
    if [[ "${n[$i]:-}" != "${o[$i]:-}" || "${n[$i]:-}" != "${t[$i]:-}" ]]; then
      problems+="    - ${labels[$i]}: ${NEW} has '${n[$i]:-}', ${OLD} has '${o[$i]:-}', the tree plans '${t[$i]:-}'"$'\n'
    fi
  done
  if [[ -n "$problems" ]]; then
    echo "restore-host: ${NEW} does not match ${OLD} and the tree, so nothing is removed from state:" >&2
    printf '%s' "$problems" >&2
    return 1
  fi
  return 0
}

# The plan, once the old instance has left state, must import exactly the new
# instance, create its firewall on it, leave the static IP's attachment alone,
# destroy nothing, and change nothing else in the tree.
check_adoption_plan() {
  local json="$1" problems
  problems="$(printf '%s' "$json" | jq -r --arg inst "$TF_INSTANCE" --arg ports "$TF_PORTS" \
      --arg attach "$TF_ATTACH" --arg new "$NEW" '
    [ .resource_changes[]? ] as $rc
    | ( [ $rc[] | select(.address == $inst) ][0] ) as $i
    | ( [ $rc[] | select(.address == $ports) ][0] ) as $p
    | [
        ( if $i == null then "the plan does not mention \($inst)"
          elif ($i.change.importing.id // "") != $new then "\($inst) is not imported as \($new)"
          elif ($i.change.actions | (. == ["no-op"] or . == ["update"]) | not) then "\($inst) plans \($i.change.actions | join("+")), not an import"
          else empty end ),
        ( if $p == null or $p.change.actions != ["create"] or ($p.change.after.instance_name // "") != $new
          then "\($ports) is not a create on \($new)" else empty end ),
        ( $rc[] | select(.change.actions | index("delete")) | "\(.address) would be destroyed or replaced" ),
        ( $rc[] | select(.address != $inst and .address != $ports)
                | select(.change.actions != ["no-op"] and .change.actions != ["read"])
                | "\(.address) plans \(.change.actions | join("+")), which is not part of the adoption" )
      ] | unique | .[]')"
  if [[ -n "$problems" ]]; then
    echo "restore-host: the adoption plan is not the expected one, so nothing is applied:" >&2
    printf '%s\n' "$problems" | sed 's/^/    - /' >&2
    return 1
  fi
  return 0
}

# ── Preconditions ────────────────────────────────────────────────────────────

aws_profile_ensure || exit 1

if [[ "$MODE" == "status" ]]; then
  echo "== restore-host status: ${TARGET} =="
  tf_name="$(tf_output lightsail_instance_name)"
  static_ip_row
  echo "  Terraform names:   ${tf_name}"
  echo "  static IP on:      ${SIP_TO:-nothing}"
  if ! find_record; then
    echo "  no restore is open for ${TARGET}."
    exit 0
  fi
  echo "  open restore:      ${REC_FROM} -> ${REC_TO}, from the automatic snapshot of ${REC_SOURCE}"
  echo "  $(elapsed_line "$REC_STARTED")"
  step() { printf '  %-44s %s\n' "$1" "$2"; }
  step "manual snapshot ${REC_NAME}" "$REC_SNAP_STATE"
  if instance_row "$REC_FROM"; then step "old instance ${REC_FROM}" "$I_STATE"; else step "old instance ${REC_FROM}" "deleted"; fi
  step "last real database backup" "${REC_BACKUP:-not recorded}"
  if instance_row "$REC_TO"; then step "new instance ${REC_TO}" "$I_STATE"; else step "new instance ${REC_TO}" "pending"; fi
  if [[ "$SIP_TO" == "$REC_TO" ]]; then step "static IP moved" "done"; else step "static IP moved" "pending"; fi
  if [[ -n "$REC_DB" ]]; then step "database restored" "done (${REC_DB})"; else step "database restored" "pending"; fi
  if [[ "$tf_name" == "$REC_TO" ]]; then step "adopted into Terraform" "done"; else step "adopted into Terraform" "pending"; fi
  echo "  (the host identity, readiness and pin are checked by a restore run, which needs the credential)"
  exit 0
fi

# Writing instances, the static IP and Terraform state, and reading host keys,
# are the directly authenticated operator's. A role reaching here would be
# refused the host-key read after the host had already been replaced.
aws_identity_require_direct_user footbag-operator || exit 1

require_ssh_alias "$ALIAS" || exit 1
require_operator_stdin "scripts/restore-host.sh --target ${TARGET}$([[ "$MODE" == "delete-old" ]] && printf ' --delete-old')" \
  "$ALIAS" "$TARGET" || exit 1

# ── Reaching the restored host ───────────────────────────────────────────────

# A pin built from the keys the Lightsail API reports for NEW, at the static IP,
# in this run's private directory. It reaches the restored host before
# Terraform names it, which is what the operator's own pin, re-taken through
# scripts/install-known-hosts.sh, waits on. Each read of the host keys fires the
# break-glass alarm.
API_PIN=""
build_api_pin() {
  local rows alg pub n=0
  API_PIN="$(tmp_file pin)"
  rows="$(aws_ls get-instance-access-details --instance-name "$NEW" \
    --query 'accessDetails.hostKeys[].[algorithm,publicKey]' --output text)" || return 1
  while IFS=$'\t' read -r alg pub; do
    [[ -n "$alg" && -n "$pub" && "$alg" != "None" ]] || continue
    printf '%s %s %s\n[%s]:2222 %s %s\n' "$SIP_ADDR" "$alg" "$pub" "$SIP_ADDR" "$alg" "$pub" >> "$API_PIN"
    n=$(( n + 1 ))
  done <<< "$rows"
  (( n > 0 ))
}

# on_api_pin <command...>: runs it with the host connections pinned to API_PIN.
on_api_pin() {
  local had="${FOOTBAG_KNOWN_HOSTS+set}" saved="${FOOTBAG_KNOWN_HOSTS:-}" rc=0
  export FOOTBAG_KNOWN_HOSTS="$API_PIN"
  HOST_SSH_OPTS=()
  "$@" || rc=$?
  HOST_SSH_OPTS=()
  if [[ -n "$had" ]]; then export FOOTBAG_KNOWN_HOSTS="$saved"; else unset FOOTBAG_KNOWN_HOSTS; fi
  return "$rc"
}

host_answers_quietly() { require_host_is "$ALIAS" "$TARGET" >/dev/null 2>&1; }

# Stops the site and the backups on the restored host, and reports it only when
# neither is running: until the real database is in place, the service would
# serve and mail from the snapshot's, and a backup would upload it.
HOLD_BODY='systemctl stop footbag-backup.timer footbag-backup.service footbag.service || true
if systemctl is-active --quiet footbag-backup.timer || systemctl is-active --quiet footbag-backup.service \
   || systemctl is-active --quiet footbag.service; then
  echo "---FOOTBAG-NOT-HELD---"
  exit 1
fi
echo "---FOOTBAG-HELD---"'
host_hold() {
  local out
  require_host_ssh_opts || return 1
  out="$({ printf '%s\n' "$SUDO_PASS"; printf '%s\n' "$HOLD_BODY"; } \
    | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash -s footbag-restore-hold')" || true
  grep -qx -- '---FOOTBAG-HELD---' <<< "$out"
}

# Starts the backup timer again once the real database is in place, and
# reports it only when the timer is active.
RELEASE_BODY='systemctl start footbag-backup.timer || true
systemctl is-active --quiet footbag-backup.timer && echo "---FOOTBAG-RELEASED---"'
host_release() {
  local out
  require_host_ssh_opts || return 1
  out="$({ printf '%s\n' "$SUDO_PASS"; printf '%s\n' "$RELEASE_BODY"; } \
    | "$HOST_SSH_BIN" "${HOST_SSH_OPTS[@]}" "$ALIAS" 'sudo -k -S -p "" bash -s footbag-restore-release')" || true
  grep -qx -- '---FOOTBAG-RELEASED---' <<< "$out"
}

# ── The restored host proves itself ──────────────────────────────────────────

# host_proves: true when the host behind the alias confirms it is TARGET and
# the site reports ready. Sets PROOF_FAILURE to what failed.
PROOF_FAILURE=""
host_proves() {
  PROOF_FAILURE=""
  require_host_is "$ALIAS" "$TARGET" || { PROOF_FAILURE="identity"; return 1; }
  [[ -n "$HOST_PUBLIC_BASE_URL" ]] || { PROOF_FAILURE="address"; return 1; }
  local url="${HOST_PUBLIC_BASE_URL%/}/health/ready" code="" i
  echo "==> Readiness through ${url}"
  for (( i = 1; i <= POLL_TRIES; i++ )); do
    code="$("$CURL_BIN" -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" </dev/null 2>/dev/null)" || code=""
    [[ "$code" == "200" ]] && break
    (( i < POLL_TRIES )) && sleep "$POLL_SECS"
  done
  if [[ "$code" != "200" ]]; then
    PROOF_FAILURE="the site did not report ready through ${url} (last answer: ${code:-none})"
    return 1
  fi
  echo "    ready: ${url} answered 200"
}

verify_restored_host() {
  echo "==> Asking the host behind ${ALIAS} which environment it is"
  host_proves && return 0
  case "$PROOF_FAILURE" in
    identity) die "the restored host did not confirm it is ${TARGET}" ;;
    address) die "the restored host records no PUBLIC_BASE_URL, so its readiness cannot be checked" ;;
    *) die "$PROOF_FAILURE" ;;
  esac
}

# ── --delete-old ─────────────────────────────────────────────────────────────

if [[ "$MODE" == "delete-old" ]]; then
  find_record || die "no restore is open for ${TARGET}, so there is no old instance to delete"
  OLD="$REC_FROM"
  NEW="$REC_TO"
  tf_name="$(tf_output lightsail_instance_name)"
  static_ip_row
  [[ "$tf_name" == "$NEW" ]] || die "Terraform still names ${tf_name}, not ${NEW}; finish the restore first (run without --delete-old)"
  [[ "$SIP_TO" == "$NEW" ]] || die "the static IP is on ${SIP_TO:-nothing}, not ${NEW}; finish the restore first"
  [[ "$OLD" != "$NEW" ]] || die "the record names the same instance twice; refusing"
  if instance_row "$OLD"; then
    [[ "$I_STATE" == "stopped" ]] || die "${OLD} is ${I_STATE}, not stopped; a restore leaves it stopped, so something else started it. Refusing to delete it."
    verify_restored_host
    echo ""
    echo "About to DELETE the instance ${OLD} (${TARGET}), which the restore replaced."
    echo "  The restored host ${NEW} holds the static IP and is the one Terraform manages,"
    echo "  and it has just confirmed it is ${TARGET} and reported ready."
    echo "  Lightsail deletes the old instance's automatic snapshots with it. The manual"
    echo "  snapshot ${REC_NAME} taken before the restore is kept."
    echo "  This cannot be undone."
    echo ""
    confirm_from_tty "Type 'APPLY' to delete ${OLD}: " "APPLY" || die "not confirmed; nothing was deleted"
    aws_ls delete-instance --instance-name "$OLD" >/dev/null || die "the delete of ${OLD} was refused"
    gone() { ! instance_row "$OLD"; }
    poll "${OLD} to be deleted" gone
    echo "    ${OLD} is gone"
  else
    echo "    ${OLD} is already deleted"
  fi
  aws_ls tag-resource --resource-name "$REC_NAME" --tags "key=${TAG_STATE},value=closed" >/dev/null \
    || die "${OLD} is deleted but the record ${REC_NAME} could not be closed; re-run --delete-old to close it"
  echo ""
  echo "== restore of ${TARGET} closed: ${NEW} is the host; ${OLD} deleted =="
  exit 0
fi

# ── A restore: start one, pick up the open one, or replace a lost one ───────

RESUMING=0
SUPERSEDED_REC=""
SUPERSEDED_FROM=""
if find_record; then
  RESUMING=1
  rec_tf="$(tf_output lightsail_instance_name)"
  static_ip_row
  if [[ "$rec_tf" == "$REC_TO" && "$SIP_TO" == "$REC_TO" ]]; then
    # A finished restore whose host no longer proves itself is a second loss,
    # not a restore to resume: its old instance cannot come back into use and
    # its new one is the host now lost. The proof uses a pin built from the
    # API, so a stale operator pin is not mistaken for a lost host.
    NEW="$REC_TO"
    echo "==> The open restore ${REC_FROM} -> ${REC_TO} is complete; asking ${REC_TO} to prove itself"
    if ! { build_api_pin && on_api_pin host_proves; }; then
      echo "    ${REC_TO} does not prove itself, so it is treated as lost and restored in its turn."
      SUPERSEDED_REC="$REC_NAME"
      SUPERSEDED_FROM="$REC_FROM"
      RESUMING=0
    fi
  fi
fi

if (( RESUMING )); then
  [[ -z "$RESTORE_DATE" || "$RESTORE_DATE" == "$REC_SOURCE" ]] \
    || die "a restore from ${REC_SOURCE} is already open; --restore-date ${RESTORE_DATE} cannot change it"
  [[ -z "$DB_SNAPSHOT" || -z "$REC_BACKUP" || "$DB_SNAPSHOT" == "$REC_BACKUP" ]] \
    || die "the open restore records the last backup ${REC_BACKUP}; --db-snapshot ${DB_SNAPSHOT} cannot change it"
  OLD="$REC_FROM"
  NEW="$REC_TO"
  SOURCE_DATE="$REC_SOURCE"
  STARTED="$REC_STARTED"
  echo "==> Resuming the open restore of ${TARGET}: ${OLD} -> ${NEW}, from the automatic snapshot of ${SOURCE_DATE}"
  echo "    $(elapsed_line "$STARTED")"
  echo ""
  echo "About to continue the restore of ${TARGET}. Whatever is not yet done of:"
  echo "  stop ${OLD}; create ${NEW} from its automatic snapshot of ${SOURCE_DATE};"
  echo "  copy the firewall without port ${ORIGIN_PORT}; move ${STATIC_IP_NAME} to ${NEW};"
  echo "  hold its service and backups and restore the last real backup onto it;"
  echo "  adopt ${NEW} into Terraform (values file, state, import through"
  echo "  scripts/terraform-apply.sh, which opens port ${ORIGIN_PORT}); re-take the pin."
  echo "  ${OLD} is stopped, never deleted."
  echo ""
  confirm_from_tty "Type 'APPLY' to continue the restore of ${TARGET}: " "APPLY" || die "not confirmed; nothing was changed"
else
  OLD="$(tf_output lightsail_instance_name)"
  [[ "$OLD" =~ $NAME_PATTERN ]] || die "Terraform names '${OLD}' as the ${TARGET} instance, which is not a name this environment's host carries"
  instance_row "$OLD" || die "${OLD}, the instance Terraform names, does not exist; there is nothing whose automatic snapshot can be restored"
  static_ip_row
  [[ "$SIP_ATTACHED" == "True" && "$SIP_TO" == "$OLD" ]] \
    || die "the static IP ${STATIC_IP_NAME} is on '${SIP_TO:-nothing}', not ${OLD} as Terraform says; reconcile that before restoring"

  listing="$(aws_ls get-auto-snapshots --resource-name "$OLD" \
    --query 'autoSnapshots[].[date,createdAt,status]' --output text)" \
    || die "could not read the automatic snapshots of ${OLD}; is the snapshot add-on enabled?"
  SOURCE_DATE="" source_epoch=""
  while IFS=$'\t' read -r d created status; do
    [[ -n "${d:-}" && "$d" != "None" && "$status" == "Success" ]] || continue
    [[ -z "$RESTORE_DATE" || "$d" == "$RESTORE_DATE" ]] || continue
    if [[ "$created" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then e="${created%%.*}"
    else e="$(date -u -d "$created" +%s 2>/dev/null)" || die "could not read snapshot time '${created}'"; fi
    if [[ -z "$source_epoch" ]] || (( e > source_epoch )); then SOURCE_DATE="$d"; source_epoch="$e"; fi
  done <<< "$listing"
  if [[ -z "$SOURCE_DATE" ]]; then
    [[ -n "$RESTORE_DATE" ]] && die "${OLD} has no successful automatic snapshot dated ${RESTORE_DATE}"
    die "${OLD} has no successful automatic snapshot, so there is nothing to restore from"
  fi
  STARTED="$(now_epoch)"
  age=$(( STARTED - source_epoch ))
  STAMP="$(date -u -d "@${STARTED}" +%Y%m%d%H%M)"
  NEW="${CANON}-r${STAMP}"
  [[ "$NEW" != "$OLD" ]] || die "${OLD} was itself made this minute; wait a minute and run again"
  REC_NAME="${OLD}-pre-restore-${STAMP}"

  echo ""
  echo "About to RESTORE the ${TARGET} host from its automatic snapshot."
  if [[ -n "$SUPERSEDED_REC" ]]; then
    echo "  ${OLD} is the host an earlier restore made, and it no longer proves itself."
    echo "  That restore's record ${SUPERSEDED_REC} is marked superseded; ${SUPERSEDED_FROM},"
    echo "  the instance it replaced, stays stopped and is not deleted by this restore's"
    echo "  --delete-old."
  fi
  echo "  current instance:   ${OLD} (${I_STATE}, ${I_BUNDLE}, ${I_AZ})"
  echo "  restore from:       the automatic snapshot of ${SOURCE_DATE}, $(( age / 3600 ))h $(( age % 3600 / 60 ))m old"
  (( age > STALE_SNAPSHOT_SECS )) && echo "                      OLDER THAN A DAY: the host state it carries is that old."
  echo "  new instance:       ${NEW}"
  echo "  first, a manual snapshot of ${OLD}: ${REC_NAME}"
  echo "  then ${OLD} is STOPPED (the site is down until ${NEW} answers), never deleted;"
  echo "  the firewall is copied to ${NEW} without port ${ORIGIN_PORT}; ${STATIC_IP_NAME} moves to ${NEW};"
  echo "  its service and backups are held and the last real database backup is restored"
  echo "  onto it with scripts/restore-db.sh, which asks for its own APPLY;"
  echo "  ${VALUES_FILE} gets lightsail_instance_name = \"${NEW}\"; ${TF_INSTANCE} and"
  echo "  ${TF_PORTS} leave Terraform state (nothing is destroyed) and ${NEW} is imported"
  echo "  through scripts/terraform-apply.sh, which opens port ${ORIGIN_PORT}; the host-key"
  echo "  pin is re-taken. Each read of the host keys fires the break-glass alarm (log it)."
  echo ""
  confirm_from_tty "Type 'APPLY' to restore ${TARGET}: " "APPLY" || die "not confirmed; nothing was changed"

  if [[ -n "$SUPERSEDED_REC" ]]; then
    aws_ls tag-resource --resource-name "$SUPERSEDED_REC" --tags "key=${TAG_STATE},value=superseded" >/dev/null \
      || die "the record ${SUPERSEDED_REC} could not be marked superseded; nothing else was changed"
    echo "    ${SUPERSEDED_REC} marked superseded"
  fi
  echo "==> Step 2: manual snapshot ${REC_NAME} of ${OLD}"
  aws_ls create-instance-snapshot --instance-name "$OLD" --instance-snapshot-name "$REC_NAME" \
    --tags "key=${TAG_STATE},value=open" "key=${TAG_TO},value=${NEW}" \
           "key=${TAG_SOURCE},value=${SOURCE_DATE}" "key=${TAG_STARTED},value=${STARTED}" >/dev/null \
    || die "the manual snapshot of ${OLD} was refused; nothing else was changed"
fi

# ── Step 2: the manual snapshot is available ─────────────────────────────────

find_record || die "the restore record ${REC_NAME} cannot be read back"
case "$REC_SNAP_STATE" in
  available) echo "    manual snapshot ${REC_NAME}: available" ;;
  error) die "the manual snapshot ${REC_NAME} failed. Nothing after it was done; delete it in Lightsail and run again" ;;
  *) poll "the manual snapshot ${REC_NAME}" snapshot_available; echo "    manual snapshot ${REC_NAME}: available" ;;
esac

# ── Step 3: the old instance stopped, its last backup recorded ──────────────

echo "==> Step 3: stop ${OLD}"
new_exists=0
instance_row "$NEW" && new_exists=1
if ! instance_row "$OLD"; then
  die "${OLD} no longer exists, and its automatic snapshots went with it; this restore cannot continue"
fi
STOPPED_AT="$STARTED"
if [[ "$I_STATE" == "stopped" ]]; then
  echo "    ${OLD} is already stopped"
else
  if [[ "$I_STATE" != "stopping" ]]; then
    aws_ls stop-instance --instance-name "$OLD" >/dev/null || die "the stop of ${OLD} was refused"
  fi
  if ! poll_until instance_is "$OLD" stopped; then
    instance_row "$OLD" || die "${OLD} vanished while stopping"
    [[ "$I_STATE" == "stopping" ]] || die "gave up waiting for ${OLD} to stop; it is ${I_STATE}"
    echo ""
    echo "${OLD} has been stopping for longer than this run waits. Lightsail's"
    echo "  stop-instance --force stops an instance stuck in that state. Nothing after the"
    echo "  stop has been done: no instance has been created and the static IP has not moved."
    echo ""
    confirm_from_tty "Type 'APPLY' to force the stop of ${OLD}: " "APPLY" \
      || die "not confirmed; ${OLD} is still stopping and nothing after the stop was done. Run again to keep waiting or to force it"
    aws_ls stop-instance --instance-name "$OLD" --force >/dev/null || die "the forced stop of ${OLD} was refused"
    poll "${OLD} to stop after the forced stop" instance_is "$OLD" stopped
  fi
  STOPPED_AT="$(now_epoch)"
  echo "    ${OLD} stopped"
fi
if [[ -z "$REC_BACKUP" ]]; then
  key=""
  if [[ -n "$DB_SNAPSHOT" ]]; then
    key="$DB_SNAPSHOT"
  elif (( new_exists )); then
    echo "    WARNING: ${NEW} already exists and no last backup of ${OLD} was recorded, so the"
    echo "    newest backup in the bucket may be the restored host's own stale database."
  else
    bucket="$(tf_output snapshots_bucket_name)"
    day="$(date -u -d "@$(now_epoch)" +%Y/%m/%d)"
    prev="$(date -u -d "@$(( $(now_epoch) - 86400 ))" +%Y/%m/%d)"
    for prefix in "routine/${day}/" "routine/${prev}/"; do
      key="$("$AWS_BIN" s3api list-objects-v2 --bucket "$bucket" --prefix "$prefix" --region "$REGION" \
        --query 'sort_by(Contents || `[]`, &LastModified)[-1].Key' --output text </dev/null)" \
        || die "could not list ${prefix} in ${bucket}"
      [[ -n "$key" && "$key" != "None" ]] && break
      key=""
    done
    [[ -n "$key" ]] || echo "    WARNING: no database backup from the last two days is in ${bucket}."
  fi
  if [[ -n "$key" ]]; then
    aws_ls tag-resource --resource-name "$REC_NAME" --tags "key=${TAG_BACKUP},value=${key}" >/dev/null \
      || die "could not record the last backup ${key} on ${REC_NAME}"
    REC_BACKUP="$key"
  fi
fi
[[ -n "$REC_BACKUP" ]] && report_backup_age "$REC_BACKUP" "$STOPPED_AT"

# Whether Terraform already manages the new instance. Once it does, the
# firewall and the database are past the steps that keep the host off the
# public path, and are not taken again.
tf_now="$(tf_output lightsail_instance_name)"
ADOPTED=0
[[ "$tf_now" == "$NEW" ]] && ADOPTED=1

# ── Step 4: the new instance, from the automatic snapshot ───────────────────

echo "==> Step 4: create ${NEW} from the automatic snapshot of ${SOURCE_DATE}"
if instance_row "$NEW"; then
  echo "    ${NEW} already exists (${I_STATE})"
else
  instance_row "$OLD" || die "${OLD} vanished during the run"
  addons=()
  [[ -n "$I_SNAPTIME" && "$I_SNAPTIME" != "None" ]] \
    && addons=(--add-ons "addOnType=AutoSnapshot,autoSnapshotAddOnRequest={snapshotTimeOfDay=${I_SNAPTIME}}")
  CREATED_NEW=1
  # The tags the tree gives everything it manages (its providers' default tags,
  # with environment = the target the tree is pinned to) and the instance's own,
  # so the dev-and-tester role's tag conditions apply to it from creation rather
  # than from the adoption apply.
  aws_ls create-instances-from-snapshot --instance-names "$NEW" --availability-zone "$I_AZ" \
    --source-instance-name "$OLD" --restore-date "$SOURCE_DATE" --bundle-id "$I_BUNDLE" \
    --key-pair-name "$I_KEY" --ip-address-type "$I_IPTYPE" ${addons[@]+"${addons[@]}"} \
    --tags "key=Project,value=footbag-platform" "key=Environment,value=${TARGET}" \
           "key=ManagedBy,value=terraform" "key=Role,value=web" >/dev/null \
    || { CREATED_NEW=0; die "the create of ${NEW} was refused; ${OLD} is stopped: start it with aws lightsail start-instance --instance-name ${OLD} to serve again"; }
fi

# ── Step 5: the firewall, without the origin port ────────────────────────────

echo "==> Step 5: firewall of ${OLD} onto ${NEW}, without port ${ORIGIN_PORT}"
if (( ADOPTED )); then
  echo "    Terraform manages the firewall of ${NEW}"
else
  full_ports="$(port_states "$OLD")" || die "could not read the firewall of ${OLD}"
  [[ "$full_ports" != "[]" ]] || die "${OLD} reads back no firewall rules, so there is nothing safe to copy"
  closed_ports="$(without_origin <<< "$full_ports")"
  [[ "$closed_ports" != "[]" ]] || die "${OLD} has no firewall rule but the origin port, so there is no SSH rule to copy"
  have_ports="$(port_states "$NEW")" || die "could not read the firewall of ${NEW}"
  if [[ "$have_ports" == "$closed_ports" ]]; then
    echo "    ${NEW} already carries the firewall of ${OLD} without port ${ORIGIN_PORT}"
  elif [[ -n "$REC_DB" && "$have_ports" == "$full_ports" ]]; then
    echo "    ${NEW} carries the whole firewall of ${OLD}; its database is already restored"
  else
    # A snapshot-built instance boots on the provider's default firewall, and
    # the write is retried until Lightsail accepts it on the new instance,
    # which may refuse it while the instance is still being created.
    write_closed_ports() {
      aws_ls put-instance-public-ports --instance-name "$NEW" --port-infos "$closed_ports" >/dev/null 2>&1
    }
    poll "Lightsail to accept a firewall write on ${NEW}" write_closed_ports
    have_ports="$(port_states "$NEW")" || die "could not read the firewall of ${NEW} back"
    [[ "$have_ports" == "$closed_ports" ]] || die "the firewall of ${NEW} does not read back as the one copied from ${OLD}"
    echo "    copied without port ${ORIGIN_PORT} and read back"
  fi
fi
poll "${NEW} to be running" instance_is "$NEW" running
echo "    ${NEW} running"

# ── Step 6: the static IP ────────────────────────────────────────────────────

echo "==> Step 6: move ${STATIC_IP_NAME} to ${NEW}"
static_ip_row
if [[ "$SIP_TO" == "$NEW" ]]; then
  echo "    already on ${NEW}"
else
  if [[ "$SIP_ATTACHED" == "True" ]]; then
    [[ "$SIP_TO" == "$OLD" ]] || die "the static IP is on ${SIP_TO}, neither ${OLD} nor ${NEW}; refusing to move it"
    aws_ls detach-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null || die "the detach of ${STATIC_IP_NAME} was refused"
  fi
  aws_ls attach-static-ip --static-ip-name "$STATIC_IP_NAME" --instance-name "$NEW" >/dev/null \
    || die "the attach of ${STATIC_IP_NAME} to ${NEW} was refused; it is detached. Run again to attach it"
  static_ip_row
  [[ "$SIP_TO" == "$NEW" ]] || die "the static IP reads back on '${SIP_TO:-nothing}', not ${NEW}"
fi
IP_MOVED=1
echo "    ${STATIC_IP_NAME} (${SIP_ADDR}) is on ${NEW}"

# ── Step 7: the real database, before the origin port opens ─────────────────

echo "==> Step 7: the real database onto ${NEW}, before port ${ORIGIN_PORT} opens"
if (( ADOPTED )); then
  if [[ -n "$REC_DB" ]]; then
    echo "    restored earlier: ${REC_DB}"
  else
    echo "    WARNING: Terraform already manages ${NEW} and this restore records no database"
    echo "    restore onto it. It is not repeated over a site that may be serving; check the"
    echo "    database on ${NEW} by hand."
  fi
else
  poll "Lightsail to report the host keys of ${NEW}" build_api_pin
  if ! poll_until on_api_pin host_answers_quietly; then
    on_api_pin require_host_is "$ALIAS" "$TARGET" || true
    die "the restored host behind ${ALIAS} did not confirm it is ${TARGET}. Port ${ORIGIN_PORT} stays closed; run again once it answers"
  fi
  echo "    host confirmed: ${ALIAS} is ${TARGET}, reached on the keys Lightsail reports for ${NEW}"
  if [[ -z "$REC_DB" ]]; then
    [[ -n "$REC_BACKUP" ]] || die "no last backup of ${OLD} is recorded, so the real database cannot be put back and ${NEW} stays off the public path (port ${ORIGIN_PORT} closed). Choose the backup to restore and run again with --db-snapshot <key>"
    on_api_pin host_hold \
      || die "the service or the backup timer on ${NEW} did not stop, so the snapshot's database may still be serving or uploading. Nothing was restored and port ${ORIGIN_PORT} stays closed"
    echo "    footbag.service and footbag-backup.timer stopped on ${NEW}"
    echo "==> Restoring ${REC_BACKUP} onto ${NEW} through scripts/restore-db.sh (it asks for its own APPLY)"
    printf '%s\n' "$SUDO_PASS" \
      | FOOTBAG_KNOWN_HOSTS="$API_PIN" bash "$RESTORE_DB" --target "$TARGET" --snapshot "$REC_BACKUP" \
      || die "the database restore onto ${NEW} did not complete; its own output above says why. ${NEW} stays off the public path (port ${ORIGIN_PORT} closed) with its backups stopped. Run again to retry"
    aws_ls tag-resource --resource-name "$REC_NAME" --tags "key=${TAG_DB},value=${REC_BACKUP}" >/dev/null \
      || die "the database is restored but ${REC_NAME} could not record it; a re-run restores ${REC_BACKUP} again"
    REC_DB="$REC_BACKUP"
  else
    echo "    restored earlier: ${REC_DB}"
  fi
  on_api_pin host_release \
    || die "the backup timer on ${NEW} did not start again, so backups are stopped. Run again to retry"
  echo "    footbag-backup.timer started again on ${NEW}"
fi

# ── Step 8: adoption into Terraform ──────────────────────────────────────────

echo "==> Step 8: adopt ${NEW} into Terraform"
tf_now="$(tf_output lightsail_instance_name)"
if [[ "$tf_now" == "$NEW" ]]; then
  echo "    Terraform already names ${NEW}"
else
  # The values file, written through its link so the link into the private
  # checkout survives, with the change shown first.
  [[ -e "$VALUES_FILE" ]] || die "${VALUES_FILE} does not exist; the private operations checkout must be linked"
  values_tmp="$(tmp_file values)"
  { grep -v -E '^[[:space:]]*lightsail_instance_name[[:space:]]*=' "$VALUES_FILE" || true
    printf 'lightsail_instance_name = "%s"\n' "$NEW"; } > "$values_tmp"
  if cmp -s "$values_tmp" "$VALUES_FILE"; then
    echo "    ${VALUES_FILE} already names ${NEW}"
  else
    echo "    values file change:"
    diff -u "$VALUES_FILE" "$values_tmp" | sed 's/^/      /' || true
    cat "$values_tmp" > "$VALUES_FILE"
    echo "    wrote lightsail_instance_name to ${VALUES_FILE}"
  fi

  state_list="$(tf state list 2>/dev/null)" || die "could not list ${TF_DIR} state"
  if grep -qxF "$TF_INSTANCE" <<< "$state_list"; then
    # Before the old instance leaves state, the tree must already be taking the
    # name from the values file, which shows as a plan to replace the instance
    # with one of the new name. Without that, removing it from state would only
    # make the next plan create an empty instance under the old name.
    pre="$(plan_json)"
    printf '%s' "$pre" | jq -e --arg inst "$TF_INSTANCE" --arg new "$NEW" \
        'any(.resource_changes[]?; .address == $inst and ((.change.actions | index("delete")) != null) and .change.after.name == $new)' >/dev/null \
      || die "${TF_DIR} does not take the instance name from lightsail_instance_name, so the restored host cannot be adopted. Nothing was removed from state. The Terraform change that reads the name from the values file and imports it is needed first."
    check_pre_plan "$pre" || die "stopped with ${TF_INSTANCE} still in state. Resolve that change in ${TF_DIR} and run again."
    check_new_matches "$pre" || die "stopped with ${TF_INSTANCE} still in state."
    forget=("$TF_INSTANCE")
    grep -qxF "$TF_PORTS" <<< "$state_list" && forget+=("$TF_PORTS")
    echo "    removing ${forget[*]} from state (the old instance is not destroyed)"
    tf state rm "${forget[@]}" >/dev/null || die "terraform state rm was refused; state is as it was"
  else
    echo "    ${TF_INSTANCE} is already out of state"
  fi

  json="$(plan_json)"
  check_adoption_plan "$json" || die "stopped before applying. Run again once the plan shows only the adoption."
  echo "    the plan imports ${NEW}, creates its firewall, and changes nothing else"
  echo "==> Applying through scripts/terraform-apply.sh"
  bash "$TF_APPLY" --target "$TARGET" </dev/null || die "the Terraform apply did not complete; run again to resume"
  tf_now="$(tf_output lightsail_instance_name)"
  [[ "$tf_now" == "$NEW" ]] || die "after the apply Terraform still names ${tf_now}, not ${NEW}"
fi
# This workstation's values file must name the restored instance too, or its
# plan replaces it. A restore run elsewhere wrote that line on its own
# workstation, and the commit carrying it is in the private operations checkout.
[[ -e "$VALUES_FILE" ]] || die "${VALUES_FILE} does not exist; the private operations checkout must be linked"
grep -qxE "[[:space:]]*lightsail_instance_name[[:space:]]*=[[:space:]]*\"${NEW}\"[[:space:]]*" "$VALUES_FILE" \
  || die "Terraform names ${NEW}, but ${VALUES_FILE} on this workstation does not record lightsail_instance_name = \"${NEW}\", so a plan here would replace the restored host. Pull the private operations checkout, which carries the restore's values-file commit, and run again."
# Proved, not assumed: a plan now leaves the instance, its firewall and the
# static IP's attachment exactly as they are.
after="$(plan_json)"
printf '%s' "$after" | jq -e --arg inst "$TF_INSTANCE" --arg ports "$TF_PORTS" --arg attach "$TF_ATTACH" '
    all(.resource_changes[]? | select(.address == $inst or .address == $ports or .address == $attach);
        .change.actions == ["no-op"] or .change.actions == ["read"])' >/dev/null \
  || die "a plan still proposes a change to the instance, its firewall or the static IP attachment"
echo "    a plan shows no change to ${NEW}, its firewall or the static IP"
# The apply restored the declared firewall, so the origin port is open now, to
# CloudFront's ranges and not to every address.
final_ports="$(port_states "$NEW")" || die "could not read the firewall of ${NEW}"
printf '%s' "$final_ports" | jq -e --argjson p "$ORIGIN_PORT" \
    'any(.[]; .fromPort <= $p and .toPort >= $p and ((.cidrs | length) > 0))' >/dev/null \
  || die "port ${ORIGIN_PORT} is not open on ${NEW} after the adoption apply, so CloudFront cannot reach the site"
printf '%s' "$final_ports" | jq -e --argjson p "$ORIGIN_PORT" \
    'all(.[] | select(.fromPort <= $p and .toPort >= $p); (.cidrs | index("0.0.0.0/0")) == null and (.ipv6Cidrs | index("::/0")) == null)' >/dev/null \
  || die "port ${ORIGIN_PORT} on ${NEW} admits every address, not only CloudFront's"
echo "    port ${ORIGIN_PORT} is open on ${NEW} to the declared ranges"

# ── Step 9: the host-key pin ─────────────────────────────────────────────────

echo "==> Step 9: host-key pin for ${NEW}"
pin_current() {
  local pin="${FOOTBAG_KNOWN_HOSTS:-$FOOTBAG_KNOWN_HOSTS_DEFAULT}" rows alg pub n=0
  [[ -f "$pin" ]] || return 1
  rows="$(aws_ls get-instance-access-details --instance-name "$NEW" \
    --query 'accessDetails.hostKeys[].[algorithm,publicKey]' --output text)" || die "could not read the host keys of ${NEW}"
  while IFS=$'\t' read -r alg pub; do
    [[ -n "$alg" && -n "$pub" ]] || continue
    grep -qxF -- "${SIP_ADDR} ${alg} ${pub}" "$pin" || return 1
    grep -qxF -- "[${SIP_ADDR}]:2222 ${alg} ${pub}" "$pin" || return 1
    n=$(( n + 1 ))
  done <<< "$rows"
  (( n > 0 ))
}
if pin_current; then
  echo "    the pin already carries ${NEW}'s keys"
else
  bash "$PIN_INSTALLER" --target "$TARGET" </dev/null || die "scripts/install-known-hosts.sh did not complete"
  pin_current || die "the pin does not carry ${NEW}'s host keys after the install. The installer reads the keys of the instance it is told is ${TARGET}'s host; it must read the name Terraform now holds, ${NEW}."
  echo "    pinned and proved against ${NEW}'s keys"
fi

# ── Step 10: the host and the site ───────────────────────────────────────────

verify_restored_host

# ── Step 11: the report ──────────────────────────────────────────────────────

instance_is "$OLD" stopped || die "${OLD} is not stopped; a restore leaves it stopped until --delete-old"
echo ""
echo "== ${TARGET} restored: ${NEW} answers as ${TARGET} and is ready, on the database"
echo "   ${REC_DB:-checked by hand}; ${OLD} is stopped =="
echo "   $(elapsed_line "$STARTED")"
echo ""
echo "Next, in order:"
echo "  1. Commit the values-file change in the private operations checkout."
echo "  2. Once the drill has passed, delete the old instance in its own approved step:"
echo "       < <credential file> bash scripts/restore-host.sh --target ${TARGET} --delete-old"
