#!/usr/bin/env bash
# set-host-env.sh
#
# Writes the operator-owned, non-secret values in /srv/footbag/env: the proxy
# hop count and the database-snapshot bucket name. Every other value in that
# file already arrives through a script -- the payments activation writes the
# Stripe signing secret, the SES activation writes the feedback key, and the
# deploy's remote halves seed the one-shot values and sync the ones Terraform
# declares. These two had no owner, so they were hand-typed or forgotten, and
# on production they are currently absent.
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
#
# The bucket name is read from the Terraform output rather than typed, so it
# cannot drift from the bucket that actually exists.
#
# Usage:
#   scripts/set-host-env.sh --target production --profile <prod-profile>
#   scripts/set-host-env.sh --target staging --dry-run
#
# --dry-run resolves both values and prints the command plan without touching
# the host.
#
# Synthetic mode (CI tests only; operators never use this):
#   --env-file <path> treats the local file as the host env, skips ssh and
#   terraform entirely, and takes the bucket name from BACKUP_S3_BUCKET_VALUE.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-expectations.sh
source "${REPO_ROOT}/scripts/lib/host-env-expectations.sh"

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
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      sed -n '2,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
fi

echo "== set-host-env: ${TARGET} =="
echo ""
echo "Resolved values:"
echo "  TRUST_PROXY=${TRUST_PROXY_VALUE}    expected for ${TARGET}: $(expected_trust_proxy_note "$TARGET")"
echo "  BACKUP_S3_BUCKET=${BUCKET_VALUE}"
echo ""

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run. Nothing was written. The real run would:"
  if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
    echo "  1. Rewrite ${ENV_FILE_OVERRIDE} in place"
  else
    echo "  1. Stage ${HOST_ENV_PATH} down from ${SSH_ALIAS} (ssh -t + sudo install)"
    echo "  2. Rewrite both assignments locally, collapsing any duplicates"
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
TMP_REMOTE=""

cleanup() {
  rm -f "${OLD_LOCAL:-}" "${NEW_LOCAL:-}" 2>/dev/null || true
  if [[ -n "${TMP_REMOTE:-}" && -z "$ENV_FILE_OVERRIDE" ]]; then
    ssh "$SSH_ALIAS" "rm -f '$TMP_REMOTE'" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

OLD_LOCAL="$(mktemp /tmp/footbag-hostenv-old.XXXXXX)"
NEW_LOCAL="$(mktemp /tmp/footbag-hostenv-new.XXXXXX)"

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$ENV_FILE_OVERRIDE" "$OLD_LOCAL"
else
  TMP_REMOTE="/tmp/footbag-hostenv-stage.$$"
  echo "Staging ${HOST_ENV_PATH} from ${SSH_ALIAS} via sudo install."
  echo "You will be prompted for your sudo password on this terminal."
  echo "The password is typed directly into sudo; it is NOT captured, NOT echoed, and NOT logged."
  echo ""
  if ! ssh -t "$SSH_ALIAS" "OP=\$(whoami); GROUP=\$(id -gn); sudo install -m 0600 -o \"\$OP\" -g \"\$GROUP\" $HOST_ENV_PATH $TMP_REMOTE"; then
    echo "ERROR: could not stage ${HOST_ENV_PATH} from ${SSH_ALIAS}." >&2
    exit 1
  fi
  if ! scp -q "$SSH_ALIAS:$TMP_REMOTE" "$OLD_LOCAL"; then
    echo "ERROR: could not copy the staged env file down." >&2
    exit 1
  fi
fi

# ---- Rewrite ----------------------------------------------------------------

# Replace-or-append, collapsing duplicate assignments so the file's last-wins
# parsing cannot diverge from the diff shown below. Values travel through the
# environment rather than argv, so nothing lands in the process table.
TP_VALUE="$TRUST_PROXY_VALUE" BK_VALUE="$BUCKET_VALUE" awk '
  BEGIN { seen_tp = 0; seen_bk = 0 }
  /^TRUST_PROXY=/ {
    if (!seen_tp) { print "TRUST_PROXY=" ENVIRON["TP_VALUE"]; seen_tp = 1 }
    next
  }
  /^BACKUP_S3_BUCKET=/ {
    if (!seen_bk) { print "BACKUP_S3_BUCKET=" ENVIRON["BK_VALUE"]; seen_bk = 1 }
    next
  }
  { print }
  END {
    if (!seen_tp) print "TRUST_PROXY=" ENVIRON["TP_VALUE"]
    if (!seen_bk) print "BACKUP_S3_BUCKET=" ENVIRON["BK_VALUE"]
  }
' "$OLD_LOCAL" > "$NEW_LOCAL"

if diff -q "$OLD_LOCAL" "$NEW_LOCAL" >/dev/null 2>&1; then
  echo "Both values already read as intended. Nothing to write."
  exit 0
fi

echo "Diff (neither value is a secret, so both are shown in full):"
echo ""
diff -u "$OLD_LOCAL" "$NEW_LOCAL" || true
echo ""

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$NEW_LOCAL" "$ENV_FILE_OVERRIDE"
  echo "Wrote ${ENV_FILE_OVERRIDE}."
  exit 0
fi

read -r -p "Install this on ${SSH_ALIAS}? Type 'yes' to proceed: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted. The host is unchanged."
  exit 1
fi

if ! scp -q "$NEW_LOCAL" "$SSH_ALIAS:$TMP_REMOTE"; then
  echo "ERROR: could not copy the rewritten env file up." >&2
  exit 1
fi
echo "Installing the rewritten env file via sudo..."
if ! ssh -t "$SSH_ALIAS" "sudo bash -c 'install -m 0600 -o root -g root $TMP_REMOTE $HOST_ENV_PATH'"; then
  echo "ERROR: could not install the rewritten env file." >&2
  exit 1
fi

echo ""
echo "Done. ${HOST_ENV_PATH} now carries both values."
echo "The running containers keep their current environment until the next deploy."
echo "Confirm with: scripts/bringup-status.sh --target ${TARGET}${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
