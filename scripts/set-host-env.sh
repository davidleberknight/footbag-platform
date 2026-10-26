#!/usr/bin/env bash
# set-host-env.sh
#
# Writes the host's record of which environment it is, FOOTBAG_ENV, into
# /srv/footbag/env. That record is the one value in the file nothing else may
# write: every deploy and host script asks the host which environment it is and
# refuses a host that records none or the other one, and a deploy that wrote the
# record itself would stamp whatever the workstation sent onto whichever host it
# reached. So it is written once, by this bring-up step, and only checked after.
#
# Every other value in that file has an owner that runs on every deploy, as the
# catalogue in scripts/lib/host-values.sh declares: Terraform publishes the
# identifiers and the site's base address and the deploy syncs them; the
# committed docker/env/<target>.env carries the host constants; the deploy
# generates the host-only secrets. None of them is this script's.
#
# Usage (the sudo password is read from stdin, line 1).
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
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/set-host-env.sh --target production
#   < ~/AWS/DEV_TESTER_HOST.txt bash scripts/set-host-env.sh --target staging --yes
#   scripts/set-host-env.sh --target staging --dry-run
#
# --dry-run prints the record it would write and the command plan without
# touching the host, and needs no credential file because it opens no session.
#
# --yes accepts the install confirmation instead of asking for it, the same way
# the deploy wrapper's -y does, so this can run where there is no terminal to
# type into. The diff is still printed.
#
# It refuses a host that already records the other environment, and changes
# nothing there: overwriting that record would turn the other environment's host
# into this one by label, and every later guard would agree with the mistake.
#
# Synthetic mode (CI tests only; operators never use this):
#   --env-file <path> treats the local file as the host env and skips ssh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

# No default target. Which environment a run lands on is exactly the decision
# this script must not make for the operator: the credential on stdin belongs to
# one host, and a defaulted target would send it at the other.
TARGET=""
ENV_FILE_OVERRIDE=""
DRY_RUN=0
HOST_ENV_PATH="/srv/footbag/env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --env-file)
      ENV_FILE_OVERRIDE="${2:-}"
      shift 2 || { echo "ERROR: --env-file requires an argument" >&2; exit 2; }
      ;;
    --preview)
      # Named rather than left to the unknown-argument branch, because runbooks
      # carried this step: the window's base address is now Terraform's, decided
      # by the notice flag and synced by every deploy.
      echo "ERROR: --preview is no longer a step. The site's base address is published by" >&2
      echo "       Terraform from the cutover-notice flag and synced by every deploy: apply" >&2
      echo "       the notice flag, then deploy." >&2
      exit 2
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

if [[ -z "$TARGET" ]]; then
  echo "ERROR: --target is required ('staging' or 'production')" >&2
  exit 2
fi
if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2
  exit 2
fi
if [[ -n "$ENV_FILE_OVERRIDE" && ! -f "$ENV_FILE_OVERRIDE" ]]; then
  echo "ERROR: --env-file path '$ENV_FILE_OVERRIDE' does not exist" >&2
  exit 2
fi

SSH_ALIAS="footbag-${TARGET}"

echo "== set-host-env: ${TARGET} =="
echo ""
echo "Record to write:"
echo "  FOOTBAG_ENV=${TARGET}    (the host's record of which environment it is; never changed once set)"
echo ""

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Dry run. Nothing was written. The real run would:"
  if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
    echo "  1. Rewrite ${ENV_FILE_OVERRIDE} in place"
  else
    echo "  1. Read ${HOST_ENV_PATH} down from ${SSH_ALIAS} over the shared wire"
    echo "  2. Refuse if it records the other environment"
    echo "  3. Show the diff and ask for confirmation"
    echo "  4. Install the result back as root:root mode 0600, leaving no backup"
  fi
  exit 0
fi

# ---- Stage the current file down -------------------------------------------

umask 077
OLD_LOCAL=""
NEW_LOCAL=""
# The digest the host's copy carried when this run read it, which the install
# compares against before overwriting. Empty until a read has happened, so a
# path that reached the install without one is refused by name rather than
# dying on an unbound variable.
HOST_ENV_SHA_AT_READ=""

# Only local temp files need cleaning up: the wire leaves nothing on the host.
cleanup() {
  # shred, not rm: both copies are the host's entire secret set, not just the
  # one value this script writes.
  shred -u "${OLD_LOCAL:-}" "${NEW_LOCAL:-}" 2>/dev/null \
    || rm -f "${OLD_LOCAL:-}" "${NEW_LOCAL:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

OLD_LOCAL="$(mktemp /tmp/footbag-hostenv-old.XXXXXX)"
NEW_LOCAL="$(mktemp /tmp/footbag-hostenv-new.XXXXXX)"

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
  cp "$ENV_FILE_OVERRIDE" "$OLD_LOCAL"
else
  require_operator_stdin "scripts/set-host-env.sh --target $TARGET" \
    "$SSH_ALIAS" "$TARGET" || exit 1
  require_ssh_alias "$SSH_ALIAS" || exit 1
  echo "Reading ${HOST_ENV_PATH} from ${SSH_ALIAS}."
  echo ""
  host_env_fetch "$SSH_ALIAS" "$OLD_LOCAL" "" "$HOST_ENV_PATH" || exit 1
  # Captured here rather than taken from the library's variable at install time,
  # so a second read added between these two points cannot quietly become the
  # thing the install compares against.
  HOST_ENV_SHA_AT_READ="$HOST_ENV_FETCHED_SHA256"
fi

# ---- The host's record of which environment it is ---------------------------
#
# Every other script that touches a host asks it this first, through
# require_host_is, and refuses a host with no answer. This is the step that
# writes the answer, so it cannot ask in the same way: on a new host there is
# nothing recorded yet. It applies the same rule where the value is written
# instead. A recorded value naming the other environment is refused; a missing
# one is recorded as this run's target.
RECORDED_ENV="$(awk -F= '$1=="FOOTBAG_ENV" {sub(/^[^=]*=/,""); print}' "$OLD_LOCAL" | tail -1)"
if [[ -n "$RECORDED_ENV" && "$RECORDED_ENV" != "$TARGET" ]]; then
  echo "ERROR: ${SSH_ALIAS} records FOOTBAG_ENV=${RECORDED_ENV}, but this run is --target ${TARGET}." >&2
  echo "       Nothing was changed. Check the HostName for ${SSH_ALIAS} in ~/.ssh/config." >&2
  exit 1
fi

# ---- Rewrite ----------------------------------------------------------------

# Already checked to be this target or absent, so writing the target only
# collapses duplicates or appends the missing record; it never changes which
# environment a host says it is.
EV_VALUE="$TARGET" awk '
  BEGIN { seen = 0 }
  /^FOOTBAG_ENV=/ { if (!seen) { print "FOOTBAG_ENV=" ENVIRON["EV_VALUE"]; seen = 1 } next }
  { print }
  END { if (!seen) print "FOOTBAG_ENV=" ENVIRON["EV_VALUE"] }
' "$OLD_LOCAL" > "$NEW_LOCAL"

if diff -q "$OLD_LOCAL" "$NEW_LOCAL" >/dev/null 2>&1; then
  echo "The host already records FOOTBAG_ENV=${TARGET}. Nothing to write."
  exit 0
fi

# The value written is not a secret and is shown in full. The file around it is:
# diff prints unchanged neighbour lines, and an append prints the file's tail.
echo "Diff (the record is shown in full; other secrets in the context are masked):"
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
host_env_install "$SSH_ALIAS" "$NEW_LOCAL" "$HOST_ENV_PATH" "$HOST_ENV_SHA_AT_READ" || exit 1

echo ""
echo "Done. ${SSH_ALIAS} now records FOOTBAG_ENV=${TARGET}."
echo "Every other value in ${HOST_ENV_PATH} is written by the next deploy."
