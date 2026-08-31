#!/usr/bin/env bash
# activate-notification-feeds.sh
#
# Brings up the queues the worker reads bounce, complaint and alarm
# notifications from, on one environment, end to end and in the one order that
# is safe.
#
# WHAT A FEED IS, AND WHY THE ORDER MATTERS.
#
# Each feed is a topic the provider publishes to, a queue subscribed to it, and
# a worker that polls the queue. Turning it on is four separate actions that
# must all happen and must happen in order: the tfvars flag, `terraform apply`
# to create the queues and subscribe them, `set-host-env.sh` to put the queue
# URLs on the host, and a deploy so the running containers hold those URLs and
# start polling.
#
# The order is load-bearing in one direction. A queue begins collecting the
# moment it is subscribed, so between the apply and the deploy notifications
# accumulate unread. Nothing is lost while that lasts: the queue holds them for
# two weeks and the worker drains them when it starts. But a half-finished
# activation is invisible from the outside, which is why this is one command
# rather than four remembered ones, and why the last step verifies rather than
# assuming.
#
# WHAT IT REPLACES.
#
# Both feeds previously arrived as pushes to a public endpoint authenticated by
# a secret carried in the URL. Activating one then meant generating that secret,
# installing it, writing it into a values file and confirming a subscription by
# hand. None of that exists now: the queue read is authorized by the host's own
# runtime role, so there is no secret to generate, install, rotate or leak, and
# activation is the flag plus the four steps below.
#
# REVERSING IT.
#
# Set the flag back and apply: the queues, their dead-letter queues and their
# subscriptions are all counted on it, so they go together. Do that only with
# the deploy that stops the worker polling, or the host keeps reading a queue
# that is being deleted underneath it. `--state off` runs that direction.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  rewrite the flag in the environment tfvars
#   2  terraform apply (creates or removes the queues and their subscriptions)
#   3  set-host-env.sh (writes the queue URLs onto the host)
#   4  deploy (code-only), so the containers hold the URLs and poll
#   5  verify the host and the live subscriptions
#
# Usage (the sudo password is read from stdin, line 1):
#   < <operator credential file> bash scripts/activate-notification-feeds.sh --target staging --status
#   < <operator credential file> bash scripts/activate-notification-feeds.sh --target staging --state on
#   < <operator credential file> bash scripts/activate-notification-feeds.sh --target production --state on
#   < <operator credential file> bash scripts/activate-notification-feeds.sh --target staging --state off
#   scripts/activate-notification-feeds.sh --target production --state on --dry-run
#   ... --yes   accept every confirmation, where no terminal is attached
#   < <operator credential file> bash scripts/activate-notification-feeds.sh --target staging --state on --from-step 3
#
# --status and --dry-run open no ssh session and need no credential file.
#
# Synthetic mode (CI tests only; operators never use this):
#   --tfvars <path> points the rewrite at a local file and stops after step 1,
#   printing the remaining steps instead of running terraform or a deploy.
set -euo pipefail

TARGET=""
STATE=""
MODE=""
DRY_RUN=0
FROM_STEP=1
TFVARS_OVERRIDE=""
AWS_PROFILE_ARG=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TFVAR_NAME="enable_feed_queues"

# The deploy command and its flags live in one place so the preview printed in
# synthetic mode and the command actually run in step 4 cannot drift apart. The
# -k is load-bearing: a bare wrapper invocation treats schema drift as an
# invitation to rebuild and offers to replace the deployed database on a prompt
# that defaults to yes. Activating a feed must never be able to become a
# database replace, whatever is answered.
DEPLOY_CMD="${FEEDS_DEPLOY_CMD:-$REPO_ROOT/deploy_to_aws.sh}"
DEPLOY_ARGS=(-k)

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
    --state)
      MODE="set"
      STATE="${2:-}"
      shift 2 || { echo "ERROR: --state requires 'on' or 'off'" >&2; exit 2; }
      ;;
    --status)
      MODE="status"
      shift
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
    --yes)
      # Accepts every confirmation, matching the deploy wrapper's -y and the
      # pause scripts' --yes, so this can run where no terminal is attached.
      # Every diff is still printed.
      ASSUME_YES="yes"
      shift
      ;;
    --help|-h) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# No default target. Which environment a feed is brought up on is exactly the
# decision this script must not make for the operator.
case "$TARGET" in
  staging|production) ;;
  '') echo "ERROR: --target is required ('staging' or 'production')" >&2; exit 2 ;;
  *) echo "ERROR: --target must be 'staging' or 'production' (got '$TARGET')" >&2; exit 2 ;;
esac

if [[ -z "$MODE" ]]; then
  echo "ERROR: one of --status or --state on|off is required." >&2
  exit 2
fi

if [[ "$MODE" == "set" && "$STATE" != "on" && "$STATE" != "off" ]]; then
  echo "ERROR: --state takes 'on' or 'off' (got '$STATE')." >&2
  exit 2
fi

if [[ ! "$FROM_STEP" =~ ^[1-5]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 5 (got '$FROM_STEP')." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"
SSH_ALIAS="footbag-$TARGET"

# The values file carries operator CIDR ranges, so what matters is that git
# cannot pick it up. Some machines symlink it into a separate operations
# checkout; that is followed where it exists and never required.
resolve_tfvars() {
  local link resolved
  link="${TFVARS_OVERRIDE:-$TF_DIR/terraform.tfvars}"
  if [[ ! -e "$link" ]]; then
    echo "ERROR: $link does not exist. Create the environment's values file, or pass" >&2
    echo "       --tfvars with a path that does." >&2
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

read_tfvars_flag() {
  grep -E "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$1" | tail -1 \
    | sed -E 's/.*=[[:space:]]*([a-z]+).*/\1/' || true
}

# The live side of the picture, so --status answers from the account rather than
# from the declared value alone. A declared flag whose queues do not exist is
# exactly the half-finished state this script is here to prevent.
read_live_queues() {
  [[ -z "$AWS_PROFILE_ARG" ]] && { echo "(no --profile; not read)"; return 0; }
  aws sqs list-queues \
    --queue-name-prefix "footbag-${TARGET}" \
    --region "${AWS_REGION:-us-east-1}" \
    --profile "$AWS_PROFILE_ARG" \
    --query 'QueueUrls[?ends_with(@, `-feed`)]' --output text 2>/dev/null \
    || echo "<unreadable>"
}

TFVARS_PATH="$(resolve_tfvars)"
CURRENT_FLAG="$(read_tfvars_flag "$TFVARS_PATH")"

WANTED_FLAG="true"
[[ "$STATE" == "off" ]] && WANTED_FLAG="false"

if [[ "$MODE" == "status" ]]; then
  echo "== notification feeds: $TARGET =="
  echo ""
  echo "tfvars ($TFVARS_PATH): $TFVAR_NAME = ${CURRENT_FLAG:-<absent>}"
  echo "live feed queues: $(read_live_queues)"
  echo ""
  echo "The host reads each queue's URL from the environment file; the worker"
  echo "polls whichever it holds. For the running host, and everything else in"
  echo "the bring-up sequence:"
  echo "  scripts/bringup-status.sh --target $TARGET${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
  exit 0
fi

echo "== notification feeds: $TARGET -> $STATE =="
echo ""
echo "tfvars: $TFVARS_PATH"
echo "  $TFVAR_NAME currently reads: ${CURRENT_FLAG:-<absent>}"
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  echo "  1. Rewrite $TFVAR_NAME = $WANTED_FLAG in $TFVARS_PATH (diff shown, confirmed)"
  echo "  2. terraform -chdir=$TF_DIR apply"
  if [[ "$STATE" == "on" ]]; then
    echo "     creates each feed's queue, its dead-letter queue, the queue policy"
    echo "     admitting only its own topic, the subscription, the runtime role's"
    echo "     poll grant, and the alarms on dead-letter depth and unread age"
  else
    echo "     REMOVES those queues and their subscriptions. Anything still"
    echo "     waiting on a queue goes with it."
  fi
  echo "  3. scripts/set-host-env.sh --target $TARGET (writes the queue URLs onto the host)"
  echo "  4. DEPLOY_TARGET=$SSH_ALIAS ./deploy_to_aws.sh   (code-only; never --all-data)"
  echo "  5. scripts/verify-host-env.sh --target $TARGET, and read back the live subscriptions"
  echo ""
  if [[ "$STATE" == "on" ]]; then
    echo "Between step 2 and step 4 the queues collect notifications nothing is"
    echo "reading yet. None are lost: they wait, and the worker drains them when"
    echo "the deploy lands. Do not stop between those two steps."
  fi
  exit 0
fi

# Every confirmation below is read from /dev/tty, never from stdin. Stdin is the
# credential pipe: a prompt reading from it would swallow the next line of the
# operator's credential file and echo it back on a failed comparison.
SYNTHETIC=0
[[ -n "$TFVARS_OVERRIDE" ]] && SYNTHETIC=1

if (( ! SYNTHETIC )); then
  require_ssh_alias "$SSH_ALIAS" || exit 1
  require_operator_stdin "scripts/activate-notification-feeds.sh --target ${TARGET} --state ${STATE}" || exit 1
fi

# ── Step 1: the declared value ───────────────────────────────────────────────
if (( FROM_STEP <= 1 )); then
  echo "-- step 1: tfvars --"
  if [[ "$CURRENT_FLAG" == "$WANTED_FLAG" ]]; then
    echo "  $TFVAR_NAME is already $WANTED_FLAG; leaving the file alone."
  else
    if ! grep -qE "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$TFVARS_PATH"; then
      # Appending is correct here rather than an error: this flag is new to an
      # environment the first time a feed is brought up on it, and demanding the
      # operator hand-add a line before the script will run reintroduces exactly
      # the manual step this exists to remove.
      #
      # It is still shown and still confirmed, like the rewrite below. The first
      # activation on an environment is precisely when an operator has least
      # idea what the file already says, and an unshown, unasked-for edit to a
      # values file is the one change here that survives an abort: the apply can
      # be declined, but the line stays written.
      echo ""
      echo "  + $TFVAR_NAME = $WANTED_FLAG    (appended; the file declares no value today)"
      echo ""
      if ! confirm_from_tty "Append this line to ${TFVARS_PATH}? (yes/no): " "yes"; then
        echo "Aborted: tfvars not changed." >&2
        exit 1
      fi
      printf '\n%s = %s\n' "$TFVAR_NAME" "$WANTED_FLAG" >> "$TFVARS_PATH"
      echo "  $TFVAR_NAME = $WANTED_FLAG appended."
    else
      TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-feeds-tfvars.XXXXXX")"
      trap 'rm -f "${TFVARS_TMP:-}"' EXIT INT TERM
      FLAG_VALUE="$WANTED_FLAG" VAR_NAME="$TFVAR_NAME" awk '
        BEGIN { pattern = "^[ \t]*" ENVIRON["VAR_NAME"] "[ \t]*=" }
        $0 ~ pattern && !done {
          match($0, pattern "[ \t]*")
          printf "%s%s\n", substr($0, 1, RLENGTH), ENVIRON["FLAG_VALUE"]
          done = 1
          next
        }
        { print }
      ' "$TFVARS_PATH" > "$TFVARS_TMP"

      echo ""
      diff -u "$TFVARS_PATH" "$TFVARS_TMP" || true
      echo ""
      if ! confirm_from_tty "Apply this change to ${TFVARS_PATH}? (yes/no): " "yes"; then
        echo "Aborted: tfvars not changed." >&2
        exit 1
      fi
      cat "$TFVARS_TMP" > "$TFVARS_PATH"
      echo "  $TFVAR_NAME = $WANTED_FLAG written."
    fi
  fi
  echo ""
fi

if (( SYNTHETIC )); then
  echo "-- synthetic mode: stopping before terraform, host-env and deploy --"
  echo "Would next run:"
  echo "  terraform -chdir=$TF_DIR plan -out=<temp>, then apply that plan"
  echo "  scripts/set-host-env.sh --target $TARGET"
  echo "  DEPLOY_TARGET=$SSH_ALIAS $DEPLOY_CMD ${DEPLOY_ARGS[*]}"
  echo "  scripts/verify-host-env.sh --target $TARGET"
  exit 0
fi

# ── Step 2: create or remove the queues ──────────────────────────────────────
if (( FROM_STEP <= 2 )); then
  echo "-- step 2: terraform apply --"
  echo ""
  if [[ "$STATE" == "on" ]]; then
    echo "This creates each feed's queue and dead-letter queue, the policy that"
    echo "admits only its own topic, the subscription, the runtime role's poll"
    echo "grant, and the alarms on dead-letter depth and unread age."
    echo ""
    echo "From this point the queues collect. Nothing reads them until step 4,"
    echo "and nothing is lost in between."
  else
    echo "This REMOVES the feed queues and their subscriptions. Anything still"
    echo "waiting on one is destroyed with it, so run --status first if you have"
    echo "any reason to think the worker has not kept up."
  fi
  echo ""
  # Plan to a file, confirm, then apply that exact plan. terraform is never
  # asked to prompt.
  #
  # A bare `terraform apply` reads its approval from standard input, which here
  # belongs to the operator credential file: the sudo password is taken off line
  # one at startup into a variable so nothing later drains it, and the file is
  # one line, so terraform reads end of file and cancels. Handing it /dev/tty
  # instead trades that for a subtler failure, because the terminal it is handed
  # is the same one the confirmation above just read a line from, and whatever
  # remains buffered there is consumed as the answer -- an apply cancelled while
  # the operator's "yes" echoes on screen unread.
  #
  # Applying a saved plan removes the prompt entirely, and removes the window
  # between deciding and acting: what gets applied is what was shown, not a
  # freshly recomputed plan that may have moved. The single typed gate below is
  # the approval, which is what an operator reading this script would expect it
  # to be.
  #
  # The plan file is mode 600 and shredded on every exit path. A saved plan is
  # an opaque archive that can carry live values, so it never lands anywhere
  # durable and never anywhere a credential scan cannot see into. The directory
  # is literal rather than TMPDIR-relative, so the caller's environment cannot
  # redirect the archive into a checkout.
  TF_PLAN="$(mktemp /tmp/footbag-feeds-plan.XXXXXX)"
  chmod 600 "$TF_PLAN"
  trap 'if [ -n "${TF_PLAN:-}" ] && [ -e "${TF_PLAN}" ]; then shred -u "${TF_PLAN}"; fi; rm -f "${TF_PLAN:-}" "${TFVARS_TMP:-}"' EXIT INT TERM

  if ! terraform -chdir="$TF_DIR" plan -out="$TF_PLAN"; then
    echo "ERROR: terraform plan failed. Nothing was applied." >&2
    echo "       Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
  echo ""
  echo "Read the plan above before answering. It covers this whole environment,"
  echo "not only the feeds: anything else pending in the tree is applied with them."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the plan shown above: " "APPLY"; then
    echo "Aborted before terraform apply. The tfvars change is already written;" >&2
    echo "resume with --from-step 2 when ready." >&2
    exit 1
  fi
  if ! terraform -chdir="$TF_DIR" apply "$TF_PLAN"; then
    echo "ERROR: terraform apply failed. Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 3: the URLs onto the host ───────────────────────────────────────────
if (( FROM_STEP <= 3 )); then
  echo "-- step 3: host env --"
  echo ""
  echo "Writing the queue URLs from the Terraform outputs onto the host."
  echo ""
  # The credential file this script is reading is the same one set-host-env
  # needs, and a single stdin cannot serve two readers, so the password is
  # passed on rather than the operator being asked to run it again themselves.
  if ! printf '%s\n' "$SUDO_PASS" | bash "$REPO_ROOT/scripts/set-host-env.sh" \
      --target "$TARGET" ${AWS_PROFILE_ARG:+--profile "$AWS_PROFILE_ARG"} --yes; then
    echo "ERROR: writing the host env failed. The queues exist and are collecting;" >&2
    echo "       resume with --from-step 3." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 4: the deploy that starts the polling ───────────────────────────────
if (( FROM_STEP <= 4 )); then
  echo "-- step 4: deploy --"
  echo ""
  # SSH to the host is restricted to the operator CIDRs in this environment's
  # tfvars. A travelling workstation's address changes, and a rotation between
  # the apply and the deploy strands the deploy part-way through its remote half.
  EGRESS_IP="$(curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]')" || EGRESS_IP=""
  if [[ -n "$EGRESS_IP" ]] && ! grep -q "$EGRESS_IP/32" "$TFVARS_PATH"; then
    echo "  $EGRESS_IP/32 is not listed verbatim in operator_cidrs; it may still fall"
    echo "  inside a configured range."
    if ! confirm_from_tty "  Is this address covered? (yes/no): " "yes"; then
      echo "Aborted before the deploy. Add today's address to operator_cidrs (add," >&2
      echo "never replace), terraform apply, then resume with --from-step 4." >&2
      exit 1
    fi
  fi
  echo "  Running a CODE-ONLY deploy. Expect 15-25 seconds of degraded service."
  echo ""
  if ! DEPLOY_TARGET="$SSH_ALIAS" "$DEPLOY_CMD" "${DEPLOY_ARGS[@]}"; then
    echo "ERROR: the deploy failed. The queues exist and are collecting but the" >&2
    echo "       host is not polling them yet. Resume with --from-step 4." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 5: prove it ─────────────────────────────────────────────────────────
echo "-- step 5: verify --"
echo ""
printf '%s\n' "$SUDO_PASS" | bash "$REPO_ROOT/scripts/verify-host-env.sh" --target "$TARGET" || true
echo ""
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  echo "Live feed queues: $(read_live_queues)"
  echo ""
fi
if [[ "$STATE" == "on" ]]; then
  echo "Confirm above that the feed rows read green. The feeds are live from the"
  echo "moment the containers came up: a bounce or an alarm published now is"
  echo "polled within twenty seconds. Anything published between the apply and"
  echo "the deploy was waiting and has been drained."
else
  echo "The feed queues are gone. Alarms still reach the operator mailbox, which"
  echo "is a separate subscription and was not touched. Bounces and complaints"
  echo "are no longer recorded anywhere until a feed is brought back up."
fi
