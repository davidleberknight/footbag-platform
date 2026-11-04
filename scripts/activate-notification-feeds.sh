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
# a worker that polls the queue. Turning it on is three separate actions that
# must all happen and must happen in order: the tfvars flag, `terraform apply`
# to create the queues, subscribe them and publish their URLs, and a deploy,
# which syncs those URLs onto the host so the running containers hold them and
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
# WHY THERE IS NO SECRET.
#
# Both feeds are read from a queue, and the queue read is authorized by the
# host's own runtime role, so there is no secret to generate, install, rotate or
# leak, and activation is the flag plus the four steps below.
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
#   2  terraform apply (creates or removes the queues, their subscriptions and the
#      parameters that publish their URLs)
#   3  nothing of its own: the deploy in step 4 syncs the URLs. Kept as a number
#      so resuming with --from-step means what the runbooks say it means.
#   4  deploy (code-only), which syncs the URLs so the containers hold them and poll
#   5  verify the host and the live subscriptions
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
#   < ~/AWS/DEV_TESTER_HOST.txt bash scripts/activate-notification-feeds.sh --target staging --status
#   < ~/AWS/DEV_TESTER_HOST.txt bash scripts/activate-notification-feeds.sh --target staging --state on
#   < ~/AWS/AWS_OPERATOR_PRODUCTION.txt bash scripts/activate-notification-feeds.sh --target production --state on
#   < ~/AWS/DEV_TESTER_HOST.txt bash scripts/activate-notification-feeds.sh --target staging --state off
#   scripts/activate-notification-feeds.sh --target production --state on --dry-run
#   ... --yes   accept every confirmation, where no terminal is attached
#   < ~/AWS/DEV_TESTER_HOST.txt bash scripts/activate-notification-feeds.sh --target staging --state on --from-step 3
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
# One closing report for the whole run, the deploy's and the verification's
# problems included, with the exit status following from it. The library owns
# the exit and signal traps, so the temp files below are registered with it.
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# The shared firewall check step 4 runs before it hands off to the deploy. It
# reads live port state and sets a verdict; the question that follows stays here,
# because this script reads its answers from the terminal device and its sibling
# reads them from stdin.
# shellcheck source=lib/egress-allowlist.sh
source "${REPO_ROOT}/scripts/lib/egress-allowlist.sh"

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
require_target "$TARGET" staging production || exit 2

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

# A file that declares no value is the "<absent>" state, so grep finding no line
# is an answer; grep failing to read the file is not, and stops the run.
read_tfvars_flag() {
  grep -E "^[[:space:]]*${TFVAR_NAME}[[:space:]]*=" "$1" | tail -1 \
    | sed -E 's/.*=[[:space:]]*([a-z]+).*/\1/' || [[ $? == 1 ]]
}

# The live side of the picture, so --status answers from the account rather than
# from the declared value alone. A declared flag whose queues do not exist is
# exactly the half-finished state this script is here to prevent. Sets
# LIVE_QUEUES rather than printing, so a failed read is listed in the closing
# report as a warning carrying the tool's own message; inside a command
# substitution the record would be lost with the subshell.
LIVE_QUEUES=""
read_live_queues() {
  local out
  if [[ -z "$AWS_PROFILE_ARG" ]]; then
    LIVE_QUEUES="(no --profile; not read)"
    return 0
  fi
  if out="$(aws sqs list-queues \
      --queue-name-prefix "footbag-${TARGET}" \
      --region "${AWS_REGION:-us-east-1}" \
      --profile "$AWS_PROFILE_ARG" \
      --query 'QueueUrls[?ends_with(@, `-feed`)]' --output text 2>&1)"; then
    LIVE_QUEUES="$out"
  else
    LIVE_QUEUES="<unreadable>"
    cr_warn "the live feed queues could not be listed: $(tail -n 1 <<<"$out")"
  fi
}

# Removes this run's temp files at exit, interrupt included. A saved plan is an
# opaque archive that can carry live values, so it is shredded, and a shred that
# fails is listed in the closing report rather than silenced.
TFVARS_TMP=""
TF_PLAN=""
feeds_cleanup() {
  if [[ -n "$TF_PLAN" && -e "$TF_PLAN" ]] && ! shred -u "$TF_PLAN"; then
    cr_warn "could not shred the saved plan ${TF_PLAN}; it was deleted without overwriting"
    rm -f -- "$TF_PLAN"
  fi
  if [[ -n "$TFVARS_TMP" && -e "$TFVARS_TMP" ]]; then
    rm -f -- "$TFVARS_TMP"
  fi
}
cr_cleanup feeds_cleanup

TFVARS_PATH="$(resolve_tfvars)"
CURRENT_FLAG="$(read_tfvars_flag "$TFVARS_PATH")"

WANTED_FLAG="true"
[[ "$STATE" == "off" ]] && WANTED_FLAG="false"

if [[ "$MODE" == "status" ]]; then
  echo "== notification feeds: $TARGET =="
  echo ""
  echo "tfvars ($TFVARS_PATH): $TFVAR_NAME = ${CURRENT_FLAG:-<absent>}"
  read_live_queues
  echo "live feed queues: ${LIVE_QUEUES}"
  echo ""
  echo "The host reads each queue's URL from the environment file; the worker"
  echo "polls whichever it holds. For the running host, and everything else in"
  echo "the bring-up sequence:"
  echo "  scripts/bringup-status.sh --target $TARGET${AWS_PROFILE_ARG:+ --profile $AWS_PROFILE_ARG}"
  cr_unproved "the host's view of the feeds: the status read asks the values file and the account only"
  cr_finish
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
  echo "  3. (nothing: the deploy in step 4 syncs the queue URLs Terraform publishes)"
  echo "  4. ./deploy_to_aws.sh --target $TARGET   (code-only; never --all-data; syncs the URLs)"
  echo "  5. scripts/verify-host-env.sh --target $TARGET, and read back the live subscriptions"
  echo ""
  if [[ "$STATE" == "on" ]]; then
    echo "Between step 2 and step 4 the queues collect notifications nothing is"
    echo "reading yet. None are lost: they wait, and the worker drains them when"
    echo "the deploy lands. Do not stop between those two steps."
  fi
  cr_unproved "anything: a dry run changes and checks nothing"
  cr_finish
fi

# Every confirmation below is read from /dev/tty, never from stdin. Stdin is the
# credential pipe: a prompt reading from it would swallow the next line of the
# operator's credential file and echo it back on a failed comparison.
SYNTHETIC=0
[[ -n "$TFVARS_OVERRIDE" ]] && SYNTHETIC=1

if (( ! SYNTHETIC )); then
  require_ssh_alias "$SSH_ALIAS" || exit 1
  require_operator_stdin "scripts/activate-notification-feeds.sh --target ${TARGET} --state ${STATE}" \
    "$SSH_ALIAS" "$TARGET" || exit 1
  # The apply and the queue read both reach the account, and terraform takes no
  # profile of its own, so the identity is settled and proved before step 1
  # rather than in the middle of the sequence.
  # shellcheck source=lib/aws-profile.sh
  source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
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
        cr_die "Aborted: tfvars not changed."
      fi
      printf '\n%s = %s\n' "$TFVAR_NAME" "$WANTED_FLAG" >> "$TFVARS_PATH"
      echo "  $TFVAR_NAME = $WANTED_FLAG appended."
    else
      TFVARS_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-feeds-tfvars.XXXXXX")"
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
      # diff exits 1 when the files differ, which is the point of showing it;
      # only its exit 2, a file it could not read, stops the run.
      diff -u "$TFVARS_PATH" "$TFVARS_TMP" || [[ $? == 1 ]]
      echo ""
      if ! confirm_from_tty "Apply this change to ${TFVARS_PATH}? (yes/no): " "yes"; then
        cr_die "Aborted: tfvars not changed."
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
  echo "  $DEPLOY_CMD --target $TARGET ${DEPLOY_ARGS[*]}   (syncs the queue URLs)"
  echo "  scripts/verify-host-env.sh --target $TARGET"
  cr_unproved "the queues, the deploy and the host: synthetic mode stops after the values file"
  cr_finish
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

  # Run directly, not through cr_run: a plan can print values from the state,
  # and cr_run keeps a copy of everything a command prints on disk.
  if ! terraform -chdir="$TF_DIR" plan -out="$TF_PLAN"; then
    cr_die "terraform plan failed. Nothing was applied. Resume with --from-step 2 once fixed."
  fi
  echo ""
  echo "Read the plan above before answering. It covers this whole environment,"
  echo "not only the feeds: anything else pending in the tree is applied with them."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the plan shown above: " "APPLY"; then
    cr_die "Aborted before terraform apply. The tfvars change is already written; resume with --from-step 2 when ready."
  fi
  if ! terraform -chdir="$TF_DIR" apply "$TF_PLAN"; then
    cr_die "terraform apply failed. Resume with --from-step 2 once fixed."
  fi
  echo ""
fi

# ── Step 3: nothing of its own ──────────────────────────────────────────────
# The apply in step 2 published the queue URLs as parameters, and the deploy in
# step 4 syncs them onto the host with every other published value.
if (( FROM_STEP <= 3 )); then
  echo "-- step 3: host env -- written by the deploy in step 4, which syncs the queue URLs"
  echo ""
fi

# ── Step 4: the deploy that starts the polling ───────────────────────────────
if (( FROM_STEP <= 4 )); then
  echo "-- step 4: deploy --"
  echo ""
  # SSH to the host is restricted to the operator source ranges the firewall
  # carries. A travelling workstation's address changes, and a rotation between
  # the apply and the deploy strands the deploy part-way through its remote half.
  #
  # Asked of the live firewall rather than of the values file. This script used to
  # ask the values file with an unanchored pattern, so 1.2.3.4 matched an entry
  # for 51.2.3.4/32 by substring and an uncovered address read as covered.
  #
  # A lookup that fails answers "unknown", never "covered", and unknown asks.
  egress_allowlist_check "$TARGET" "$SSH_ALIAS"
  printf '%s\n' "$EGRESS_DETAIL" | sed 's/^/  /'
  if [[ "$EGRESS_VERDICT" != "covered" ]]; then
    if ! confirm_from_tty "  Is this address covered? (yes/no): " "yes"; then
      echo "Aborted before the deploy. Put today's address on the allow-list with" >&2
      echo "  bash scripts/authorize-operator-address.sh --target ${TARGET} \\" >&2
      echo "    --address <your-cidr> --for '<your_account>; <where>'" >&2
      echo "which appends rather than replacing, applies, and proves it against" >&2
      echo "the live firewall. Then resume with --from-step 4." >&2
      exit 1
    fi
  fi
  echo "  Running a CODE-ONLY deploy. Expect 15-25 seconds of degraded service."
  echo ""
  # Run directly, not through cr_run: the deploy may ask on the terminal. Its own
  # problems reach this run's closing report through the library's nested mode.
  if ! "$DEPLOY_CMD" --target "$TARGET" "${DEPLOY_ARGS[@]}"; then
    cr_die "the deploy failed: the queues exist and are collecting but the host is not polling them yet. Resume with --from-step 4."
  fi
  echo ""
fi

# ── Step 5: prove it ─────────────────────────────────────────────────────────
echo "-- step 5: verify --"
echo ""
# The verification is the step that proves the outcome, so its failure is an
# error on this run, not a warning: the host env check exits non-zero only when
# a critical invariant fails, and a run that printed the feeds live over a
# failed check would be claiming what nothing showed. Its FAIL and WARN rows are
# read into the closing report either way.
verify_host_env() {
  printf '%s\n' "$SUDO_PASS" | bash "$REPO_ROOT/scripts/verify-host-env.sh" --target "$TARGET"
}
VERIFIED=1
cr_run_marked --errors "$FOOTBAG_FAILURE_GRAMMAR" --warnings "$FOOTBAG_NOTICE_GRAMMAR" \
  "host env verification on ${TARGET}" -- verify_host_env || VERIFIED=0
echo ""
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  read_live_queues
  echo "Live feed queues: ${LIVE_QUEUES}"
  echo ""
fi
if (( ! VERIFIED )); then
  cr_unproved "the feeds ${STATE} on ${TARGET}'s host: the host env verification failed; resume with --from-step 5 once fixed"
  cr_finish
fi
cr_proved "the host env on ${TARGET} passed its critical checks after the feeds were turned ${STATE}"
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
cr_finish
