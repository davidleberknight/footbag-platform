#!/usr/bin/env bash
# terraform-apply.sh
#
# Applies one environment's Terraform tree, for every change that needs nothing
# but a plan read and a confirmation.
#
# WHY THIS EXISTS.
#
# The saved-plan convention is four commands: make a mode-600 temporary file,
# plan into it, apply that exact file, shred it. Typed by hand the last one is
# the step a failure skips, because a failed plan, a failed apply or a Ctrl-C
# never reaches it. What survives in /tmp is a zip holding a full copy of state,
# so every resolved value is in the clear, including the vault-governed ones the
# tfvars split exists to keep out of the repository. Here the shred is on a trap
# for EXIT, INT and TERM, so it runs on all of those paths.
#
# Applying the saved plan rather than replanning at apply time is the other half:
# it makes the reviewed diff the applied diff, and closes the window between
# deciding and acting.
#
# WHAT THIS DOES NOT OWN.
#
# Changes with a real precondition have their own script, because a gate that
# belongs to one change cannot live in a wrapper shared by all of them:
# scripts/apply-snapshot-retention.sh refuses to apply until the promoted backup
# tiers hold history, scripts/arming.sh rewrites an arming flag and sequences the
# deploy behind it, and scripts/activate-notification-feeds.sh brings queues up
# in the one order that is safe. Reach for this script for the rest.
#
# Some runbook steps also carry work around the apply that stays in the runbook,
# because absorbing it here would mean claiming to handle it: the two-pass
# CloudFront bootstrap, and refreshing providers when one is added. Use --init
# for that last one; do the first as the runbook says, then apply through here.
# Importing a resource is not among them either: a resource made outside
# Terraform is declared with an import block beside its definition and taken in
# through this script's plan and apply, never by a hand-typed terraform import,
# and never deleted to be recreated, which for anything holding data destroys
# what it holds.
#
# Steps (referenced by --from-step, so a failure part-way is resumable):
#   1  terraform init, only when asked for
#   2  plan to a shredded file, confirm, apply that exact plan
#
# Usage:
#   scripts/terraform-apply.sh --target staging --dry-run
#   scripts/terraform-apply.sh --target staging
#   scripts/terraform-apply.sh --target production
#   scripts/terraform-apply.sh --target staging --init
#   scripts/terraform-apply.sh --target staging --init-upgrade
#   scripts/terraform-apply.sh --target staging --break-stale-lock
#   scripts/terraform-apply.sh --target staging --break-stale-lock --i-killed-that-run
#   scripts/terraform-apply.sh --target staging --firewall-only --firewall-add 203.0.113.7/32
#   scripts/terraform-apply.sh --target staging --require-empty-plan
#   scripts/terraform-apply.sh --target production --replace random_id.origin_verify_secret
#
# --replace plans with Terraform's -replace for one resource address, through
# the same saved plan, confirmation and shred as any other run. It takes only the
# addresses listed in REPLACEABLE_ADDRESSES below, on staging or production: a
# general passthrough would let any resource be destroyed and recreated by a
# flag. Each address has one caller that owns the steps and the proof around the
# replacement: scripts/rotate-origin-verify-secret.sh for the origin-verify
# secret, scripts/rotate-jwt-signing-key.sh for the JWT signing key.
#
# --firewall-only and --require-empty-plan are for callers that know in advance
# what the plan may contain, on staging only. The first, run by the dev-and-tester
# address path, applies only when the firewall rule set is the whole change; the
# rule set is written in place (see "The firewall, written in place"). The second, run
# when proving the job role, applies nothing and refuses unless there is nothing
# to apply. Either refuses any other change as drift it did not come to apply.
#
# --firewall-only also takes the one SSH address the caller is adding
# (--firewall-add <cidr>) and the one it is removing (--firewall-remove <cidr>),
# at least one of them, and refuses a plan whose SSH ports gain or lose any
# other address. The values file is read from whichever private checkout this
# machine holds, so a stale one would otherwise drop an administrator's address
# from the live firewall while every resource check passed.
#
# --i-killed-that-run waives the staleness floor, and nothing else, for an
# operator who knows the holding process is gone because they stopped it. The
# lock must still name this machine, have been taken by a plan, and find no
# terraform running here, and the typed word is still required. It is spelled as
# a statement rather than as --force so that using it is a claim about what you
# did, not a way past a check you found inconvenient.
#
# The typed APPLY is asked for on production, on the shared tree, which holds
# every environment's state, and on the identity tree, where the plan is what
# every dev-and-tester in this account may do. Staging applies without it:
# its data is meant to be thrown away, and a word typed on every iteration is one
# that stops being read. --break-stale-lock asks on every tree, staging included,
# because what it removes is not staging's disposable data.
#
#   ... --yes   answers the typed confirmation where one is asked and the flag is
#               accepted: the shared tree's apply, and a staging lock break. A
#               production apply refuses it outright, because a confirmation a flag
#               can supply in advance is not one, and so does breaking the lock on
#               production, the shared tree or the roster, because removing a live
#               lock lets two runs write state at once. Kept rather than rejected so
#               that reaching for it in a place it does not carry fails loudly
#               instead of looking like an option nobody happened to implement.
#               --dry-run --yes still works everywhere, since a dry run applies
#               nothing.
#
# --dry-run runs nothing at all: it states what the real run would do.
#
# Test seams (CI only; operators never set these): TERRAFORM_APPLY_BIN points the
# terraform command at a stub, announced loudly when set, because a run that
# silently used a stub would prove nothing about the estate.
# TERRAFORM_APPLY_AWS_BIN does the same for the AWS CLI calls of the in-place
# firewall write.
# TERRAFORM_APPLY_PROC_COUNT stands in for the local terraform process count the
# state-lock report reads, so both of its branches are testable on a machine that
# has no terraform running. TERRAFORM_APPLY_VALUES_FILE names the file the
# job-role values check reads, so both of its branches are testable whether or
# not the machine running the suite has the private checkout linked.
#
# Under the job role (an assumed-role session of FootbagDevTester, as AWS
# reports it) three things differ, and nothing else: terraform is never allowed
# to prompt (-input=false), a missing values link is refused before planning,
# and a plan the role may not apply is refused before applying: any aws_iam_*
# change, because the role holds no IAM write; a replication configuration
# change, because it passes a role, which the role is never granted; and any
# change to the staging firewall, because the addresses it admits are written by
# onboarding and offboarding as footbag-operator, and a values file on a
# dev-and-tester's machine is no authority over an administrator's entry.
set -euo pipefail

TARGET=""
DRY_RUN=0
DO_INIT=0
INIT_UPGRADE=0
FROM_STEP=1
BREAK_LOCK=0
# Set by --i-killed-that-run: the operator attesting that the process holding
# this lock is one they killed themselves. It waives the age floor and nothing
# else, and only where the lock already names this machine and no terraform runs
# here. See the age check for why that combination is safe and the floor is not
# load-bearing there.
KILLED_IT=0
# A lock younger than this is not stale. Half an hour is longer than any plan or
# apply in these trees takes, so a lock still held past it was left by a process
# that is gone rather than one still working.
STALE_LOCK_MIN_AGE_SECS=1800
# What the plan is allowed to contain, for the two callers that know in advance:
# "firewall-only" for a dev-and-tester address change, "empty" for proving the
# job role can plan staging. Empty means no restriction, which is every other run.
PLAN_SHAPE=""
# The resource addresses --replace may name, and the only list of them. Each is
# a value whose rotation is a Terraform replacement by design: the origin-verify
# secret, and the JWT signing key, which the design rotates as a whole new key.
# Anything else rotates by its own script or not by replacement at all.
REPLACE_ADDR=""
REPLACEABLE_ADDRESSES=("random_id.origin_verify_secret" "aws_kms_key.jwt_signing")
# The one resource a dev-and-tester address change may touch.
FIREWALL_ADDRESS="aws_lightsail_instance_public_ports.web"
# Set when the plan replaces the firewall and the replacement is instead written
# in place before the apply; see "The firewall, written in place" below.
FW_INPLACE=0
# The one SSH address a firewall-only apply may add, and the one it may remove.
FIREWALL_ADD=""
FIREWALL_REMOVE=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# confirm_from_tty reads the answer from /dev/tty rather than stdin, refuses when
# no terminal exists and --yes was not given, and honours --yes. Shared so every
# operator script prompts the same way.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# The AWS identity this run uses, supplied and proved rather than inherited from
# whichever shell the operator started from.
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"

TF_BIN="${TERRAFORM_APPLY_BIN:-terraform}"
# The AWS CLI the in-place firewall write uses; a stub under test.
AWS_FW_BIN="${TERRAFORM_APPLY_AWS_BIN:-aws}"

# A stranded state lock is the plan failure an operator is least equipped to
# read. The backend reports it as a 412 PreconditionFailed on a PutObject, which
# names neither the lock nor the remedy, and the generic "plan failed" line below
# sends the operator looking for a fault in their own change. Terraform's own
# error block carries everything needed to judge it, so this reads that block
# back and says what it means, before any apply has been offered.
#
# It never breaks the lock. Whether breaking one is safe turns entirely on
# whether the holding process is dead, and only the holder's own machine can
# answer that; a lock broken while a run is live lets two runs write state at
# once. So this reports and stops, and says plainly which of the two cases the
# operator is in.
#
# Parsing is split from reporting because the break mode below has to judge the
# same four facts rather than print them, and two readers of one error block that
# parse it separately are two chances to disagree about what it said.
LOCK_ID="" LOCK_OP="" LOCK_WHO="" LOCK_CREATED="" LOCK_AGE_SECS=-1 LOCK_AGE="" LOCK_RUNNING=0
parse_lock_info() {
  local log="$1" created created_epoch now_epoch
  # Returns non-zero when the failure was something else, so callers know this
  # was not a lock at all.
  grep -q "Error acquiring the state lock" "$log" 2>/dev/null || return 1

  # Two things sit between the start of the line and the field name, and the
  # parser has to survive both. Terraform draws its errors inside a box, so each
  # line of the Lock Info block carries a vertical bar; and it colours that box
  # even when its output is going to a file rather than a terminal, so the real
  # bytes are an escape sequence, the bar, another escape, then the field:
  #
  #   \033[31m│\033[0m \033[0m  Who:       user@host
  #
  # A pattern anchored on leading whitespace matches none of that, and every
  # field comes back empty, which reads as a lock held by nobody. The escapes are
  # stripped here rather than only suppressed at the call site, so the parser
  # cannot be broken again by a caller that forgets -no-color.
  local plain
  plain="$(sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$log")"

  LOCK_ID="$(printf '%s\n' "$plain" | sed -n 's/^[│|[:space:]]*ID:[[:space:]]*//p' | head -1)"
  LOCK_OP="$(printf '%s\n' "$plain" | sed -n 's/^[│|[:space:]]*Operation:[[:space:]]*//p' | head -1)"
  LOCK_WHO="$(printf '%s\n' "$plain" | sed -n 's/^[│|[:space:]]*Who:[[:space:]]*//p' | head -1)"
  created="$(printf '%s\n' "$plain" | sed -n 's/^[│|[:space:]]*Created:[[:space:]]*//p' | head -1)"

  # "2026-09-11 23:58:55.754432017 +0000 UTC" parses once the fractional seconds
  # and the trailing zone name are removed; the numeric offset is what date reads.
  LOCK_CREATED="$(printf '%s' "${created% UTC}" | sed 's/\.[0-9]*//')"
  # Guarded on emptiness first: `date -d ""` does not fail, it returns midnight
  # today, so an unparsed timestamp would otherwise yield a plausible age of a
  # few hours and sail past the staleness floor the negative value exists to
  # enforce.
  created_epoch=""
  if [[ -n "$LOCK_CREATED" ]]; then
    created_epoch="$(date -u -d "$LOCK_CREATED" +%s 2>/dev/null || true)"
  fi
  now_epoch="$(date -u +%s)"
  if [[ -n "$created_epoch" ]]; then
    LOCK_AGE_SECS=$(( now_epoch - created_epoch ))
    LOCK_AGE="$(( LOCK_AGE_SECS / 3600 ))h $(( (LOCK_AGE_SECS % 3600) / 60 ))m ago"
  else
    # An unreadable timestamp is not an old lock. Left negative so the age check
    # in the break mode refuses rather than treating unknown as satisfied.
    LOCK_AGE_SECS=-1
    LOCK_AGE="age unknown"
  fi

  # Seamed so the branches below are testable without a live terraform on the
  # machine running the suite; operators never set it.
  LOCK_RUNNING="${TERRAFORM_APPLY_PROC_COUNT:-$(pgrep -x terraform | wc -l || true)}"
}

report_state_lock() {
  local log="$1" id operation who created_clean age running
  parse_lock_info "$log" || return 1
  id="$LOCK_ID" operation="$LOCK_OP" who="$LOCK_WHO"
  created_clean="$LOCK_CREATED" age="$LOCK_AGE" running="$LOCK_RUNNING"

  echo "" >&2
  echo "  The state is locked, so nothing was planned and nothing was applied." >&2
  echo "  A previous run took the lock and died without releasing it, or a run is" >&2
  echo "  live right now. These two cases have opposite remedies." >&2
  echo "" >&2
  echo "    held by         ${who:-unknown}" >&2
  echo "    operation       ${operation:-unknown}" >&2
  echo "    taken           ${created_clean:-unknown} (${age})" >&2
  echo "    lock id         ${id:-unknown}" >&2
  if (( running > 0 )); then
    echo "    terraform here  ${running} process(es) running on this machine" >&2
  else
    echo "    terraform here  no terraform process running on this machine" >&2
  fi
  echo "" >&2
  if [[ "$who" == *"@$(hostname)" ]]; then
    if (( running > 0 )); then
      echo "  The lock names this machine AND terraform is running here, so another of" >&2
      echo "  your own runs holds it. Wait for that run to finish; do not break it." >&2
    else
      echo "  The lock names this machine and no terraform is running here, so the run" >&2
      echo "  that took it is gone. Clear it and resume:" >&2
      echo "    scripts/terraform-apply.sh --target ${TARGET} --break-stale-lock" >&2
      echo "    scripts/terraform-apply.sh --target ${TARGET} --from-step 2" >&2
    fi
  else
    echo "  The lock names another machine. Ask that operator before breaking it:" >&2
    echo "  only their machine can tell you whether the process is still alive." >&2
  fi
  if [[ "$operation" == *Apply* ]]; then
    echo "" >&2
    echo "  Note: the held operation is an apply, not a plan, so state may be part" >&2
    echo "  written. Read the state before breaking this lock, whoever holds it." >&2
  fi
  echo "" >&2
}

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
    --from-step)
      FROM_STEP="${2:-}"
      shift 2 || { echo "ERROR: --from-step requires a step number" >&2; exit 2; }
      ;;
    --break-stale-lock)
      BREAK_LOCK=1
      shift
      ;;
    --i-killed-that-run)
      KILLED_IT=1
      shift
      ;;
    --init)
      DO_INIT=1
      shift
      ;;
    --init-upgrade)
      DO_INIT=1
      INIT_UPGRADE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --firewall-only)
      PLAN_SHAPE="firewall-only"
      shift
      ;;
    --require-empty-plan)
      PLAN_SHAPE="empty"
      shift
      ;;
    --replace)
      REPLACE_ADDR="${2:-}"
      shift 2 || { echo "ERROR: --replace requires a resource address" >&2; exit 2; }
      ;;
    --firewall-add|--firewall-remove)
      if [[ -z "${2:-}" || "$2" == --* ]]; then
        echo "ERROR: $1 takes an address in CIDR form, e.g. 203.0.113.7/32." >&2
        exit 2
      fi
      if [[ "$1" == "--firewall-add" ]]; then FIREWALL_ADD="$2"; else FIREWALL_REMOVE="$2"; fi
      shift 2
      ;;
    --yes)
      ASSUME_YES="yes"
      shift
      ;;
    --help|-h) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# No default target. Which tree an apply lands on is exactly the decision this
# script must not make for the operator.
#
# `identity` declares what a dev-and-tester may do. It is applied through here
# like any other tree, but only by the directly authenticated identity, which
# is asserted below once a credential has actually been settled: the job role
# is denied every write to its own definition, so a run started under it would
# stop on an access denial partway through an apply rather than at the door,
# having already made some of the changes.
#
# Who the dev-and-testers ARE is not a tree at all. Onboarding and offboarding mint and
# revoke key material that must never enter Terraform state, so
# scripts/onboard-dev-tester.sh and scripts/offboard-dev-tester.sh own that
# instead.
require_target "$TARGET" staging production shared identity || exit 2

# A replacement is a deliberate destroy-and-recreate, so it takes only an
# address on the list, only on the two runtime trees, and never alongside a
# restricted plan shape or a lock break, which are different operations.
declare -a PLAN_EXTRA_ARGS=()
if [[ -n "$REPLACE_ADDR" ]]; then
  allowed=0
  for addr in "${REPLACEABLE_ADDRESSES[@]}"; do
    [[ "$REPLACE_ADDR" == "$addr" ]] && allowed=1
  done
  if (( ! allowed )); then
    echo "ERROR: --replace takes only: ${REPLACEABLE_ADDRESSES[*]} (got '${REPLACE_ADDR}')." >&2
    exit 2
  fi
  if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
    echo "ERROR: --replace applies to staging or production only." >&2
    exit 2
  fi
  if [[ -n "$PLAN_SHAPE" ]] || (( BREAK_LOCK )); then
    echo "ERROR: --replace does not combine with --firewall-only, --require-empty-plan or --break-stale-lock." >&2
    exit 2
  fi
  PLAN_EXTRA_ARGS=("-replace=${REPLACE_ADDR}")
fi

# Both shapes are staging-only: the dev-and-tester path exists on staging alone,
# and a restriction on the plan is not a reason to apply any other tree.
if [[ -n "$PLAN_SHAPE" && "$TARGET" != "staging" ]]; then
  echo "ERROR: --firewall-only and --require-empty-plan apply to staging only." >&2
  exit 2
fi
if [[ -n "$PLAN_SHAPE" ]] && (( BREAK_LOCK )); then
  echo "ERROR: --firewall-only and --require-empty-plan do not combine with --break-stale-lock." >&2
  exit 2
fi
# A firewall-only apply names the address it changes, so the plan can be held to
# exactly that. Without one, nothing would say which addresses it may drop.
if [[ "$PLAN_SHAPE" == "firewall-only" && -z "$FIREWALL_ADD" && -z "$FIREWALL_REMOVE" ]]; then
  echo "ERROR: --firewall-only needs --firewall-add <cidr>, --firewall-remove <cidr>, or both." >&2
  exit 2
fi
if [[ "$PLAN_SHAPE" != "firewall-only" && ( -n "$FIREWALL_ADD" || -n "$FIREWALL_REMOVE" ) ]]; then
  echo "ERROR: --firewall-add and --firewall-remove go with --firewall-only." >&2
  exit 2
fi

if [[ ! "$FROM_STEP" =~ ^[1-2]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 2 (got '$FROM_STEP')." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"
if [[ ! -d "$TF_DIR" ]]; then
  echo "ERROR: no Terraform tree at terraform/$TARGET." >&2
  exit 1
fi

# What an operator needs in this directory before a plan will run, and what to do
# when it is not there. Two values files, both reached by a gitignored symlink into
# the maintainers' private operations checkout, and they are not equally available.
#
# terraform.tfvars is committed in that checkout, so a clone carries it and wiring
# the symlink is the whole job. secrets.auto.tfvars is gitignored on both sides and
# carries the one variable the staging and production trees declare sensitive, the
# CloudWatch alarm destination, which is the AWS account's operations mailbox rather
# than an ordinary contact address. No clone carries that file. Each operator creates
# it in the private checkout at mode 600 and writes the single assignment, taking the
# address from the credential vault's operations-mailbox entry; the vault holds no
# entry for the file itself, by an explicit ruling, so there is nothing to restore.
#
# Create it before wiring the link: the wiring script skips a secrets link whose
# file is absent, so a file created afterwards is linked only by running the
# wiring again (setup-operator-workstation.sh creates it first). Terraform loads any *.auto.tfvars in the working directory on its own, so a dangling
# link fails on the unreadable path and an absent one falls through to a complaint
# about a variable with no value. Neither failure names the file as something the
# operator was supposed to author, which is why it is stated here. The shared tree
# has a secrets file of its own, reached the same way: it carries the account's
# billing, operations and security alternate contacts, which that tree declares
# sensitive. Each defaults to null, so the shared tree still plans without the file
# while the contacts stay unset behind enable_account_alternate_contacts.

if [[ -n "${TERRAFORM_APPLY_BIN:-}" ]]; then
  echo "SYNTHETIC: terraform='$TF_BIN' -- this run proves nothing about the estate." >&2
fi
if [[ -n "${TERRAFORM_APPLY_AWS_BIN:-}" ]]; then
  echo "SYNTHETIC: aws='$AWS_FW_BIN' -- this run proves nothing about the estate." >&2
fi

echo "== terraform apply: $TARGET =="
echo ""

if (( DRY_RUN )); then
  echo "Would run, in order:"
  if (( DO_INIT )); then
    echo "  1. terraform -chdir=terraform/$TARGET init${INIT_UPGRADE:+ -upgrade}"
  else
    echo "  1. (skipped: pass --init when a provider or backend has changed)"
  fi
  if (( BREAK_LOCK )); then
    echo "  2. terraform -chdir=terraform/$TARGET plan, to prove the state is locked"
    echo "     right now, then refuse unless the lock names this machine, was taken by"
    echo "     a plan, is older than $(( STALE_LOCK_MIN_AGE_SECS / 60 )) minutes, and no terraform is running here."
    echo "     Then a typed APPLY, then force-unlock, then a read proving it is gone."
  elif [[ "$TARGET" == "production" || "$TARGET" == "shared" || "$TARGET" == "identity" ]]; then
    echo "  2. terraform -chdir=terraform/$TARGET plan into a mode-600 file shredded on"
    echo "     every exit path, show it, take a typed APPLY, then apply that exact plan."
  else
    echo "  2. terraform -chdir=terraform/$TARGET plan into a mode-600 file shredded on"
    echo "     every exit path, show it, then apply that exact plan. No typed"
    echo "     confirmation: staging is the tree whose data is meant to be thrown away."
  fi
  echo ""
  echo "The plan covers the whole environment, not only the change you have in mind:"
  echo "anything else pending in the tree is applied with it. That is the reason the"
  echo "plan is always shown."
  exit 0
fi

# --yes does not carry breaking the lock on production or the shared tree.
#
# Separate from the apply refusal below, and placed here for a reason: the
# stale-lock block exits on its own, so everything under it is unreachable from a
# lock-breaking run. `--break-stale-lock --i-killed-that-run --yes` therefore
# reached the typed word with the flag still set, the helper answered it, and
# force-unlock ran against production state with nothing typed by anyone.
#
# The shared tree is included because production's own state lives in it. Removing
# a lock while a run is genuinely live lets two runs write state at once, which is
# the outcome this mode's four checks exist to prevent, and a flag passed in
# advance is not the operator's judgement that the holding run is gone.
#
# The identity tree is here for the same reason it takes a typed APPLY: its
# state is the record of what every dev-and-tester may do, so two runs writing
# it at once can leave a grant standing that was being removed. Staging is the only
# tree that keeps --yes here. Its lock prompt is the one place staging still
# stops, and an explicitly typed flag is entitled to answer it; the tree's data
# is disposable and its state is not shared with anything that is not.
if (( BREAK_LOCK )) && [[ "$ASSUME_YES" == "yes" ]] \
   && [[ "$TARGET" == "production" || "$TARGET" == "shared" || "$TARGET" == "identity" ]]; then
  echo "ERROR: --yes does not carry breaking the ${TARGET} state lock." >&2
  echo "       Removing a lock while a run is genuinely live lets two runs write" >&2
  echo "       state at once, so the word is typed rather than passed in advance." >&2
  echo "       Re-run without --yes, read the four checks, and answer them." >&2
  exit 2
fi

# Every path below this reaches the state backend, so the identity is settled and
# proved here, once, rather than discovered by terraform. Placed after the
# argument refusals and the dry run, which need no credential at all: a run that
# was only going to print what it would do should not fail for want of one.
aws_profile_ensure || exit 1

# The identity tree declares the job role's own definition, and that role is
# denied every write to it. Asserted here rather than left to AWS because the
# denial lands mid-apply: terraform would create some resources, refuse on the
# role itself, and leave the tree half applied with a state file that says so.
# This invariant used to live in the separate script that owned this tree; it
# lives on the apply path now so there is one way in and one place that checks.
#
# The IAM user is named as a literal rather than taken from the profile name
# the library owns. They happen to agree today, and a check that reads the name
# from the same place the credential came from is not a check.
if [[ "$TARGET" == "identity" ]]; then
  aws_identity_require_direct_user "footbag-operator" || exit 1
fi

# Whether this run is a session of the job role, decided from the identity AWS
# just reported and never from a profile name. Everything keyed on it below
# applies to that session only; a run as the directly authenticated identity
# keeps exactly the arguments and output it always had.
JOB_ROLE=0
case "${AWS_IDENTITY_ARN:-}" in
  *":assumed-role/${FOOTBAG_DEV_TESTER_ROLE}/"*) JOB_ROLE=1 ;;
esac

# A job-role session never answers a terraform prompt. A variable with no value
# would otherwise make terraform stop and ask, which in a wrapped run reads as a
# hang; refusing to ask turns it into an error naming the variable.
declare -a TF_INPUT_ARGS=()
(( JOB_ROLE )) && TF_INPUT_ARGS=(-input=false)

# The values file is a link into the maintainers' private operations checkout,
# which a dev-and-tester is not required to have: deploying and testing staging
# need no apply. Without it terraform fails on a missing variable partway into a
# plan, in words that do not name the file, so the job role is refused here,
# before any state is touched.
VALUES_FILE="${TERRAFORM_APPLY_VALUES_FILE:-${TF_DIR}/terraform.tfvars}"
if [[ -n "${TERRAFORM_APPLY_VALUES_FILE:-}" ]]; then
  echo "SYNTHETIC: values file='${VALUES_FILE}' -- the job-role check reads a stand-in." >&2
fi
if (( JOB_ROLE )) && [[ ! -r "$VALUES_FILE" ]]; then
  echo "ERROR: terraform/${TARGET}/terraform.tfvars is missing or unreadable." >&2
  echo "       It is a link into the private operations checkout, which this" >&2
  echo "       workstation does not have wired. A dev-and-tester deploys and tests" >&2
  echo "       staging without applying Terraform; an apply needs the checkout," >&2
  echo "       linked with: bash scripts/setup_private_repo.sh" >&2
  echo "       Nothing was planned or applied." >&2
  exit 1
fi

# ── Breaking a stale state lock ──────────────────────────────────────────────
#
# A plan or apply that is killed rather than interrupted leaves its lock behind,
# and the tree is then refused to everyone until someone removes it. Terraform's
# own force-unlock does that unconditionally, which is the wrong tool on its own:
# a lock broken while a run is genuinely live lets two runs write state at once,
# and the operator most likely to reach for it is the one who has just been
# blocked and is least placed to know which case they are in.
#
# So the four things that decide it live here rather than in the operator's head,
# and the run refuses on any one of them. The word is typed in every environment,
# staging included, because this mode's subject is destroying something rather
# than applying a plan, and staging's silence is a statement about disposable
# data, which a lock is not.
if (( BREAK_LOCK )); then
  echo "-- breaking a stale state lock: $TARGET --"
  echo ""
  TF_PLAN="$(mktemp "/tmp/footbag-${TARGET}-lockprobe.XXXXXX")"
  chmod 600 "$TF_PLAN"
  TF_PLAN_LOG="$(mktemp "/tmp/footbag-${TARGET}-lockprobelog.XXXXXX")"
  chmod 600 "$TF_PLAN_LOG"
  trap 'for f in "${TF_PLAN:-}" "${TF_PLAN_LOG:-}"; do if [ -n "$f" ] && [ -e "$f" ]; then shred -u "$f" 2>/dev/null || true; fi; rm -f "$f"; done' EXIT INT TERM

  # Check 1: the lock is held right now. A plan is the probe rather than a read of
  # the backend's object layout, because terraform is the authority on its own
  # locking and its error carries the only description of the holder there is.
  # -lock-timeout=0 so a held lock fails immediately instead of waiting.
  echo "Probing: a plan that fails on lock acquisition is the proof the lock is live."
  PROBE_STATUS=0
  # -no-color because this output is parsed, not read: terraform colours its
  # error box even when writing to a file. The parser strips escapes anyway, so
  # this is the belt to that braces rather than the only defence.
  "$TF_BIN" -chdir="$TF_DIR" plan ${TF_INPUT_ARGS[@]+"${TF_INPUT_ARGS[@]}"} -no-color -lock-timeout=0 -out="$TF_PLAN" > "$TF_PLAN_LOG" 2>&1 || PROBE_STATUS=$?

  if (( PROBE_STATUS == 0 )); then
    echo "ERROR: the state is not locked, so there is nothing to break." >&2
    echo "       The plan just ran to completion. Re-run without --break-stale-lock." >&2
    exit 2
  fi
  if ! parse_lock_info "$TF_PLAN_LOG"; then
    echo "ERROR: the plan failed, but not on the state lock, so this mode has nothing" >&2
    echo "       to act on. The output follows." >&2
    cat "$TF_PLAN_LOG" >&2
    exit 1
  fi

  echo ""
  echo "    held by         ${LOCK_WHO:-unknown}"
  echo "    operation       ${LOCK_OP:-unknown}"
  echo "    taken           ${LOCK_CREATED:-unknown} (${LOCK_AGE})"
  echo "    lock id         ${LOCK_ID:-unknown}"
  echo "    terraform here  ${LOCK_RUNNING} process(es) running on this machine"
  echo ""

  # Check 2: this machine holds it. Whether a lock is safe to break turns on the
  # holding process being dead, and only the holder's own machine can establish
  # that. Someone else's lock is a conversation, not a command.
  if [[ "$LOCK_WHO" != *"@$(hostname)" ]]; then
    echo "REFUSED: the lock names ${LOCK_WHO}, not this machine ($(hostname))." >&2
    echo "         Only that machine can tell whether the run holding it is still" >&2
    echo "         alive. Ask that operator; do not break it from here." >&2
    exit 2
  fi

  # Check 3: a plan, not an apply. An apply killed part-way may have written some
  # of its changes into state, and that wants reading before anything else.
  if [[ "$LOCK_OP" != *Plan* ]]; then
    echo "REFUSED: the lock was taken by ${LOCK_OP}, not a plan." >&2
    echo "         An apply killed part-way may have left state partly written, so" >&2
    echo "         read the state and reconcile it before removing the lock." >&2
    exit 2
  fi

  # Check 4: old enough, and nothing running here. Either alone is weak: a young
  # lock may be a live run whose process list this check missed, and an idle
  # process list may simply mean the run has not started its plan yet.
  if (( LOCK_AGE_SECS < 0 )); then
    echo "REFUSED: the lock's timestamp could not be read, so its age is unknown." >&2
    echo "         An unreadable timestamp is not an old lock." >&2
    exit 2
  fi
  # The floor exists because a young lock is more likely a run still working. It
  # is waivable, and only here, because by this point two stronger checks have
  # already passed: the lock names THIS machine, and no terraform is running on
  # it. A run cannot be alive under those two unless the process check missed it
  # — a terraform inside a container, or one renamed — and neither of those would
  # be recorded under this host's name in the first place, because terraform
  # writes the lock's Who from the user and hostname it sees.
  #
  # So the floor is guarding a case the earlier checks have already excluded, and
  # the operator who killed their own run holds a fact the script cannot: that
  # the process is gone. They attest to it by name rather than by a flag that
  # reads like a convenience. The typed word is still required afterwards.
  if (( LOCK_AGE_SECS < STALE_LOCK_MIN_AGE_SECS )); then
    if (( KILLED_IT )); then
      echo "The lock is $(( LOCK_AGE_SECS / 60 )) minutes old, under the $(( STALE_LOCK_MIN_AGE_SECS / 60 ))-minute floor, and you have"
      echo "attested that you killed the run that took it. Accepted, because the lock"
      echo "names this machine and no terraform is running on it: the only way it could"
      echo "still be live is a process those two checks cannot see."
      echo ""
    else
      echo "REFUSED: the lock is $(( LOCK_AGE_SECS / 60 )) minutes old, under the $(( STALE_LOCK_MIN_AGE_SECS / 60 ))-minute floor." >&2
      echo "         A lock this young is more likely a run still working than one that" >&2
      echo "         died. Wait, then try again." >&2
      echo "" >&2
      echo "         If you killed that run yourself, say so and this check is waived:" >&2
      echo "             --break-stale-lock --i-killed-that-run" >&2
      echo "         It waives the age floor only. The lock must still name this machine," >&2
      echo "         have been taken by a plan, and find no terraform running here." >&2
      exit 2
    fi
  fi
  if (( LOCK_RUNNING > 0 )); then
    echo "REFUSED: ${LOCK_RUNNING} terraform process(es) are running on this machine, so a run" >&2
    echo "         of your own may hold it. Wait for that run to finish." >&2
    exit 2
  fi

  # Said accurately rather than uniformly: a waived floor is three checks and an
  # attestation, not four checks, and a message claiming otherwise would be the
  # same class of defect as the age this parser used to invent.
  if (( KILLED_IT && LOCK_AGE_SECS < STALE_LOCK_MIN_AGE_SECS )); then
    echo "Three checks pass: this machine's lock, taken by a plan, with no terraform"
    echo "running here. The age floor is waived on your attestation that you killed"
    echo "the run that took it."
  else
    echo "All four checks pass: this machine's lock, taken by a plan, older than"
    echo "$(( STALE_LOCK_MIN_AGE_SECS / 60 )) minutes, with no terraform running here. The run that took it is gone."
  fi
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to remove lock ${LOCK_ID}: " "APPLY"; then
    echo "Aborted. The lock is untouched." >&2
    exit 1
  fi

  # -force because terraform's own prompt reads stdin, which this script's
  # callers may have pointed at a credential, and the typed answer above is the
  # confirmation. The run is already past every check that prompt would ask about.
  if ! "$TF_BIN" -chdir="$TF_DIR" force-unlock -force "$LOCK_ID"; then
    echo "ERROR: force-unlock failed. The lock is still held." >&2
    exit 1
  fi

  # The outcome, not the invocation: force-unlock exiting zero is not the lock
  # being gone. Plan again and see whether the tree is reachable.
  echo ""
  echo "Verifying the lock is gone rather than trusting the exit status."
  VERIFY_STATUS=0
  "$TF_BIN" -chdir="$TF_DIR" plan ${TF_INPUT_ARGS[@]+"${TF_INPUT_ARGS[@]}"} -no-color -lock-timeout=0 -out="$TF_PLAN" > "$TF_PLAN_LOG" 2>&1 || VERIFY_STATUS=$?
  if parse_lock_info "$TF_PLAN_LOG"; then
    echo "ERROR: the state is still locked, now by ${LOCK_WHO} (${LOCK_ID})." >&2
    echo "       Something re-took it, or the unlock did not take effect." >&2
    exit 1
  fi
  if (( VERIFY_STATUS != 0 )); then
    echo "Lock removed. The verifying plan then failed for an unrelated reason:" >&2
    cat "$TF_PLAN_LOG" >&2
  fi
  echo ""
  echo "Lock removed and the tree plans again. Resume with:"
  echo "  scripts/terraform-apply.sh --target $TARGET --from-step 2"
  exit 0
fi

# --yes does not carry a production apply.
#
# The confirmation below is what stands between a typed decision and replacing
# what the public is served, and a flag that supplies it in advance is not a
# confirmation at all: it makes an unattended production apply possible from a
# scheduled job, a wrapper, or an agent session, none of which can read the plan
# it is accepting. The plan is the whole environment rather than the change the
# operator came for, so what gets waved through is not knowable in advance.
#
# Refused here rather than at the prompt, so the run stops before a plan file
# holding a full copy of state in the clear has been written at all. A dry run is
# deliberately above this line: it applies nothing, so the flag costs nothing
# there. The shared tree stops for the typed word too, but accepts the flag in
# answer to it: it changes about once a year, it serves nobody directly, and the
# lock-breaking refusal above already covers the operation on it that is
# irreversible. Every other environment applies without a confirmation at all, so
# the flag is simply unnecessary there rather than doing anything.
if [[ "$TARGET" == "production" && "$ASSUME_YES" == "yes" ]]; then
  echo "ERROR: --yes does not carry a production apply." >&2
  echo "       This plan reaches what the public is served, so the confirmation is" >&2
  echo "       typed every time and is never supplied in advance by a flag." >&2
  echo "       Re-run without --yes, read the plan, and answer it." >&2
  echo "       Use --dry-run --yes to see what the run would do, changing nothing." >&2
  exit 2
fi

# ── Step 1: init, only when asked ────────────────────────────────────────────
if (( FROM_STEP <= 1 )) && (( DO_INIT )); then
  echo "-- step 1: terraform init --"
  echo ""
  INIT_ARGS=(init)
  (( INIT_UPGRADE )) && INIT_ARGS+=(-upgrade)
  if ! "$TF_BIN" -chdir="$TF_DIR" "${INIT_ARGS[@]}"; then
    echo "ERROR: terraform init failed. Nothing was applied." >&2
    exit 1
  fi
  echo ""
fi

# ── Step 2: plan, confirm, apply that plan ───────────────────────────────────
echo "-- step 2: terraform apply --"
echo ""
# The plan file is created mode 600 under a literal /tmp path and shredded by a
# trap on EXIT, INT and TERM, so the shred runs on a failed plan, a failed apply
# and an interrupt alike. The directory is literal rather than TMPDIR-relative so
# the caller's environment cannot redirect the archive into a checkout, where a
# single ignore rule would be all that stood between it and a stray commit.
TF_PLAN="$(mktemp "/tmp/footbag-${TARGET}-apply.XXXXXX")"
chmod 600 "$TF_PLAN"
# The plan's output is captured as well as shown, because a state-lock failure
# carries the only description of the lock anyone gets: who holds it, which
# operation, and when it was taken. Reading it back is what turns a raw 412 into
# a diagnosis. Same mode and same trap as the plan file, since the capture holds
# resource names and is shredded on every exit path.
TF_PLAN_LOG="$(mktemp "/tmp/footbag-${TARGET}-planlog.XXXXXX")"
chmod 600 "$TF_PLAN_LOG"
# TF_SHOW_ERR is created later, only on the jq path, and is swept here too: it
# holds terraform's diagnostics, which can quote resource values.
TF_SHOW_ERR=""
trap 'for f in "${TF_PLAN:-}" "${TF_PLAN_LOG:-}" "${TF_SHOW_ERR:-}"; do if [ -n "$f" ] && [ -e "$f" ]; then shred -u "$f" 2>/dev/null || true; fi; rm -f "$f"; done' EXIT INT TERM

# `|| PLAN_STATUS=$?` rather than an `if`, because `set -e` with `pipefail` would
# otherwise abort the script on the failing plan before the report below runs,
# which is the one failure this whole branch exists to explain.
PLAN_STATUS=0
# -no-color because this output is both shown and captured to a file that the
# DNS check below greps when jq is unavailable. Terraform's colour escapes land
# between the start of a line and its +/-/~ marker, which defeats an anchored
# pattern and makes that check silently match nothing.
"$TF_BIN" -chdir="$TF_DIR" plan ${TF_INPUT_ARGS[@]+"${TF_INPUT_ARGS[@]}"} ${PLAN_EXTRA_ARGS[@]+"${PLAN_EXTRA_ARGS[@]}"} -no-color -out="$TF_PLAN" 2>&1 | tee "$TF_PLAN_LOG" || PLAN_STATUS=$?
if (( PLAN_STATUS != 0 )); then
  echo "ERROR: terraform plan failed. Nothing was applied." >&2
  if ! report_state_lock "$TF_PLAN_LOG"; then
    echo "       Resume with --from-step 2 once fixed." >&2
  fi
  exit 1
fi
echo ""

# ── DNS changes are approved by a human, on every tree, always ───────────────
#
# The zone move has not happened. The registry still delegates footbag.org to the
# legacy provider, the site the public sees is still served from there, and a
# record changed early does not fail: it succeeds, and the failure surfaces as
# visitors reaching the wrong place, or mail stopping, with nothing in the deploy
# log to connect it to.
#
# The gate is on the CHANGE, not on the environment, which is why it is separate
# from the confirmation below rather than folded into it. Staging has no domain
# and no hosted zone, so its route53 resources are commented out or gated off and
# nothing here fires on an ordinary staging apply. That is the point: this costs
# nothing until a plan genuinely moves a record, and then it stops, whichever
# tree it is and whatever that tree's usual confirmation posture is. Scoping it
# to production instead would have left the gap open the day a zone is wired
# anywhere else.
#
# It ignores --yes, because an approval a flag can supply in advance is not the
# human approval this is asking for.
#
# FAILS CLOSED, on both reads. Each used to swallow its own failure and yield an
# empty answer, which this block cannot distinguish from "no DNS in the plan" --
# so a `show -json` that errored, or an unreadable plan text, silently skipped the
# gate on exactly the plans it exists for. A gate that cannot read the plan must
# stop, not wave it through.
#
# Failing closed cuts both ways, so the reads have to be precise about what a
# failure IS. The JSON read captures stdout and stderr separately, because a
# warning terraform prints on a SUCCESSFUL run is not a failure and must not be
# parsed as though it were the plan. The text read distinguishes grep's "no match"
# from its "could not read the file", because only the second is a failure.
DNS_CHANGES=""
DNS_READ_OK=0

if command -v jq >/dev/null 2>&1; then
  PLAN_JSON=""
  # stdout and stderr are captured SEPARATELY, and the separation is the point.
  # Merging them put terraform's diagnostics into the text handed to jq, and
  # terraform writes there on runs that succeed: a provider deprecation notice, or
  # the development-overrides warning that prints on every command when a
  # workstation has a dev_overrides block. jq then fails on text that is not JSON,
  # and because this gate fails closed the tree could not be applied at all until
  # whoever owned that warning removed it. Resuming took the same path.
  #
  # The merge existed so the refusal below could show terraform's own words. That
  # still works: stderr goes to a temp file, swept by the same trap as the plan.
  TF_SHOW_ERR="$(mktemp "/tmp/footbag-${TARGET}-tfshow.XXXXXX")"
  chmod 600 "$TF_SHOW_ERR"
  if PLAN_JSON="$("$TF_BIN" -chdir="$TF_DIR" show -json "$TF_PLAN" 2>"$TF_SHOW_ERR")"; then
    if DNS_CHANGES="$(printf '%s' "$PLAN_JSON" | jq -r '
        .resource_changes[]?
        | select(.change.actions != ["no-op"] and .change.actions != ["read"])
        | select(.type | startswith("aws_route53"))
        | "  \(.change.actions | join("+"))  \(.address)"
      ')"; then
      DNS_READ_OK=1
    fi
  fi
  if (( ! DNS_READ_OK )); then
    echo "ERROR: could not read the saved plan to check it for DNS changes." >&2
    if [[ -s "${TF_SHOW_ERR:-}" ]]; then
      tail -5 "$TF_SHOW_ERR" | sed 's/^/         /' >&2
    else
      echo "         terraform wrote nothing to its error stream, so the plan it" >&2
      echo "         produced could not be parsed as JSON. A provider or CLI" >&2
      echo "         warning on stdout would do that." >&2
    fi
    echo "" >&2
    echo "       Nothing has been applied. This check is not optional and does" >&2
    echo "       not fail open: a plan it cannot read is a plan whose DNS" >&2
    echo "       changes it cannot see, and those are the ones that do not" >&2
    echo "       announce themselves. Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
else
  # Without jq, fall back to the human-readable plan captured above. It is
  # written with -no-color, because terraform colours its output when it is not
  # writing to a terminal here and the escape sequence lands between the line
  # start and the +/-/~ marker, so an anchored pattern matches nothing at all.
  # That is the under-match this fallback previously had, and it is worse than
  # over-matching: it reads as "no DNS in this plan".
  # grep exits 0 on a match, 1 on no match, and 2 when it could not read the file
  # at all. `|| true` collapsed all three into an empty result, which this block
  # reads as "no DNS in this plan" and applies -- so an unreadable or swept plan
  # log waved through exactly the changes this gate exists to stop. Only the jq
  # read above was made fail-closed; this one was not, while the comment at the
  # top of the block claimed both were.
  DNS_GREP_STATUS=0
  DNS_CHANGES="$(grep -E '^[[:space:]]*[#~+-].*aws_route53' "$TF_PLAN_LOG")" || DNS_GREP_STATUS=$?
  if (( DNS_GREP_STATUS > 1 )); then
    echo "ERROR: could not read the plan text to check it for DNS changes." >&2
    echo "       Nothing has been applied. This check does not fail open: a plan" >&2
    echo "       it cannot read is a plan whose DNS changes it cannot see, and" >&2
    echo "       those are the ones that do not announce themselves." >&2
    echo "       Resume with --from-step 2 once fixed." >&2
    exit 1
  fi
  echo "NOTE: jq is not installed, so the DNS check is reading the text plan" >&2
  echo "      rather than its JSON. It over-matches deliberately; confirm any" >&2
  echo "      prompt it raises against the plan above." >&2
fi

# ── Changes that are the directly authenticated identity's to apply ──────────
#
# The job role holds no IAM write and no iam:PassRole, so a plan that changes any
# aws_iam_* resource, or a replication configuration (which passes the
# replication role to S3), would be refused by AWS partway through the apply,
# after the resources ahead of it had already changed. The staging firewall is
# refused for a different reason: AWS would allow it, but the addresses it admits
# belong to the administrators' values file and to each dev-and-tester's own
# parameter, and a values file on this machine is no authority over either.
# Refused here instead, before anything is applied, and failing closed like the
# DNS read: a plan this cannot read is refused too.
if (( JOB_ROLE )); then
  ROLE_REFUSED=""
  if command -v jq >/dev/null 2>&1; then
    if ! ROLE_REFUSED="$(printf '%s' "${PLAN_JSON:-}" | jq -r --arg fw "$FIREWALL_ADDRESS" '
        .resource_changes[]?
        | select(.change.actions != ["no-op"] and .change.actions != ["read"])
        | select((.type | startswith("aws_iam"))
                 or .type == "aws_s3_bucket_replication_configuration"
                 or .address == $fw)
        | "  \(.change.actions | join("+"))  \(.address)"
      ')"; then
      echo "ERROR: could not read the saved plan to check it for changes the job role may not apply." >&2
      echo "       Nothing has been applied." >&2
      exit 1
    fi
  else
    ROLE_GREP_STATUS=0
    ROLE_REFUSED="$(grep -E '^[[:space:]]*[#~+-].*(aws_iam_|aws_s3_bucket_replication_configuration|aws_lightsail_instance_public_ports)' "$TF_PLAN_LOG")" || ROLE_GREP_STATUS=$?
    if (( ROLE_GREP_STATUS > 1 )); then
      echo "ERROR: could not read the plan text to check it for changes the job role may not apply." >&2
      echo "       Nothing has been applied." >&2
      exit 1
    fi
  fi
  if [[ -n "$ROLE_REFUSED" ]]; then
    echo "ERROR: this plan changes what the job role may not apply:" >&2
    printf '%s\n' "$ROLE_REFUSED" >&2
    echo "       IAM and replication would be refused by AWS partway through, after" >&2
    echo "       the changes ahead of them had landed; the staging firewall's" >&2
    echo "       addresses are not this machine's to decide. Nothing has been" >&2
    echo "       applied. A footbag-operator holder applies this one, as the" >&2
    echo "       directly authenticated identity." >&2
    exit 1
  fi
fi

# ── The firewall, written in place ───────────────────────────────────────────
#
# The provider can only create and delete the instance firewall, never update
# it, so any change to its port list plans as delete-then-create, and every port
# (SSH, and the site through CloudFront) is closed between the two. Address
# changes make that a monthly outage. Instead, when the plan replaces the
# firewall, the reviewed port list is written in place with Lightsail's
# put-instance-public-ports, which sets the whole list in one call, and the tree
# is planned again: the provider reads the live port list, so the firewall then
# plans as no change and only the rest of the reviewed plan is applied.
#
# The write happens after the confirmation, never before, and uses the list from
# the plan that was reviewed. The second plan must match the first in every
# other change, or nothing more is applied. It is guarded so it can never write a
# list that locks anyone out: every value known at plan time, exactly the three
# ports this firewall carries (SSH on 22 and 2222, the site on 80, all tcp), a
# source list on each, and the browser console's lightsail-connect alias kept on
# 22. A plan outside those bounds, or a run without jq, takes the ordinary
# replacement instead and says the ports will close.
FW_PLANNED=""
FW_INSTANCE=""
FW_REGION=""
if [[ -n "${PLAN_JSON:-}" ]] && command -v jq >/dev/null 2>&1 \
   && printf '%s' "$PLAN_JSON" | jq -e --arg fw "$FIREWALL_ADDRESS" \
        'any(.resource_changes[]?; .address == $fw and (.change.actions | index("delete")) and (.change.actions | index("create")))' >/dev/null 2>&1; then
  fw_reason=""
  # Only the values this step writes must be known. The plan always reports the
  # new resource's id, and the optional ipv6 and alias lists of a port that sets
  # none, as unknown until apply; none of those is written, so none of them
  # stops the in-place path. An unknown address list or instance name does.
  if ! printf '%s' "$PLAN_JSON" | jq -e --arg fw "$FIREWALL_ADDRESS" '
       ([.resource_changes[] | select(.address == $fw)][0].change.after_unknown // {}) as $u
       | ($u.instance_name // false) != true
         and ((($u.port_info // []) | if type == "array" then . else [{cidrs: .}] end)
              | all(.[]; ((.cidrs // false) | if type == "array" then any else . end) | not))' >/dev/null 2>&1; then
    fw_reason="part of the new port list is not known until apply"
  elif ! printf '%s' "$PLAN_JSON" | jq -e --arg fw "$FIREWALL_ADDRESS" '
        [.resource_changes[] | select(.address == $fw)][0].change.after as $a
        | ($a.port_info | map(.from_port) | sort) == [22, 80, 2222]
          and all($a.port_info[]; .protocol == "tcp" and .from_port == .to_port and ((.cidrs // []) | length > 0))
          and any($a.port_info[]; .from_port == 22 and ((.cidr_list_aliases // []) | index("lightsail-connect")))
          and ($a.instance_name | type == "string" and length > 0)' >/dev/null 2>&1; then
    fw_reason="the new port list is not the three-port shape this step is allowed to write"
  else
    FW_PLANNED="$(printf '%s' "$PLAN_JSON" | jq -c --arg fw "$FIREWALL_ADDRESS" '
      [.resource_changes[] | select(.address == $fw)][0].change.after.port_info
      | map({fromPort: .from_port, toPort: .to_port, protocol: .protocol, cidrs: (.cidrs // [])}
            + (if ((.cidr_list_aliases // []) | length) > 0 then {cidrListAliases: .cidr_list_aliases} else {} end)
            + (if ((.ipv6_cidrs // []) | length) > 0 then {ipv6Cidrs: .ipv6_cidrs} else {} end))')"
    FW_INSTANCE="$(printf '%s' "$PLAN_JSON" | jq -r --arg fw "$FIREWALL_ADDRESS" \
      '[.resource_changes[] | select(.address == $fw)][0].change.after.instance_name')"
    FW_REGION="$(printf '%s' "$PLAN_JSON" | jq -r '.variables.aws_region.value // empty')"
    [[ -n "$FW_REGION" ]] || fw_reason="the plan does not name the region"
  fi
  if [[ -z "$fw_reason" ]]; then
    FW_INPLACE=1
    echo "The firewall's port list changes. It will be written in place after you"
    echo "confirm, so no port closes; the firewall then plans as no change and the"
    echo "rest of this plan is applied only if a second plan matches it."
    echo ""
  else
    echo "NOTE: the firewall is replaced the ordinary way, because ${fw_reason}."
    echo "      Every port on ${TARGET}, SSH and the site alike, closes for a few"
    echo "      seconds while it is rewritten."
    echo ""
  fi
fi

# ── A caller that knows what the plan may contain ────────────────────────────
#
# A dev-and-tester address change touches the firewall resource and nothing
# else, and proving the job role can plan staging touches nothing at all. In
# either case anything else in the plan is drift somebody did not come here to
# apply, so it is refused rather than carried along. Read from the plan's JSON
# only: the text fallback over-matches by design, which is right for a warning
# and wrong for a refusal, so without jq these modes do not run.
if [[ -n "$PLAN_SHAPE" ]]; then
  if ! command -v jq >/dev/null 2>&1 || [[ -z "${PLAN_JSON:-}" ]]; then
    echo "ERROR: --${PLAN_SHAPE/empty/require-empty-plan} needs the plan read as JSON, and jq is not installed." >&2
    echo "       Nothing has been applied." >&2
    exit 1
  fi
  if ! PLANNED_CHANGES="$(printf '%s' "$PLAN_JSON" | jq -r '
      .resource_changes[]?
      | select(.change.actions != ["no-op"] and .change.actions != ["read"])
      | .address
    ')"; then
    echo "ERROR: could not read the saved plan to check what it changes. Nothing has been applied." >&2
    exit 1
  fi
  OTHER_CHANGES="$(printf '%s\n' "$PLANNED_CHANGES" | grep -vxF -e "$FIREWALL_ADDRESS" -e '' || true)"
  if [[ "$PLAN_SHAPE" == "empty" ]]; then
    if [[ -n "$PLANNED_CHANGES" ]]; then
      echo "ERROR: the plan was required to be empty, and it changes:" >&2
      printf '%s\n' "$PLANNED_CHANGES" | sed 's/^/  /' >&2
      echo "       Nothing has been applied. A footbag-operator holder applies or" >&2
      echo "       resolves that drift first." >&2
      exit 1
    fi
    echo "The plan is empty, as required. Nothing to apply."
    exit 0
  fi
  if [[ -n "$OTHER_CHANGES" ]]; then
    echo "ERROR: this firewall-only apply would also change:" >&2
    printf '%s\n' "$OTHER_CHANGES" | sed 's/^/  /' >&2
    echo "       That is drift this run did not come to apply. Nothing has been" >&2
    echo "       applied; a footbag-operator holder applies staging first." >&2
    exit 1
  fi
  if [[ -z "$PLANNED_CHANGES" ]]; then
    echo "The staging firewall already admits exactly these addresses. Nothing to apply."
    exit 0
  fi
  # The resource being the whole change says nothing about which addresses it
  # carries. Compare the SSH ports' addresses before and after: anything gained
  # or lost beyond the one address this run names is an administrator's entry,
  # or another dev-and-tester's, that this run has no business changing. An
  # after-state the plan does not know reads as every address lost, so this
  # fails closed.
  if ! SSH_DIFF="$(printf '%s' "$PLAN_JSON" | jq -r --arg fw "$FIREWALL_ADDRESS" '
      def ssh(x): [(x // {}).port_info[]? | select(.from_port == 22 or .from_port == 2222) | .cidrs[]?] | unique;
      [.resource_changes[]? | select(.address == $fw)][0].change as $c
      | (ssh($c.before)) as $b | (ssh($c.after)) as $a
      | (($b - $a)[] | "removed \(.)"), (($a - $b)[] | "added \(.)")
    ')"; then
    echo "ERROR: could not read the firewall's addresses out of the saved plan. Nothing has been applied." >&2
    exit 1
  fi
  UNNAMED="$(printf '%s\n' "$SSH_DIFF" | grep -vxF -e '' \
    ${FIREWALL_ADD:+-e "added ${FIREWALL_ADD}"} \
    ${FIREWALL_REMOVE:+-e "removed ${FIREWALL_REMOVE}"} || true)"
  if [[ -n "$UNNAMED" ]]; then
    echo "ERROR: this firewall-only apply would change SSH addresses it was not asked to:" >&2
    printf '%s\n' "$UNNAMED" | sed 's/^/  /' >&2
    echo "       Asked for: ${FIREWALL_ADD:+added ${FIREWALL_ADD}}${FIREWALL_ADD:+${FIREWALL_REMOVE:+, }}${FIREWALL_REMOVE:+removed ${FIREWALL_REMOVE}}." >&2
    echo "       This machine's values file disagrees with the live firewall, so" >&2
    echo "       applying would drop or add somebody else's access. Nothing has been" >&2
    echo "       applied. Update the private checkout, or a footbag-operator holder" >&2
    echo "       applies staging first." >&2
    exit 1
  fi
  if (( ! FW_INPLACE )); then
    echo "This apply replaces the staging firewall rule set (${FIREWALL_ADDRESS})."
    echo "Every staging port, SSH and the site alike, closes for a few seconds while"
    echo "the rules are rewritten, then reopens with the new list. Production is not"
    echo "touched."
    echo ""
  fi
fi

if [[ -n "$DNS_CHANGES" ]]; then
  echo ""
  echo "=============================================================="
  echo " THIS PLAN CHANGES DNS."
  echo "=============================================================="
  printf '%s\n' "$DNS_CHANGES"
  echo ""
  echo "DNS is not ours to change without a person deciding to. A record applied"
  echo "early does not error; it succeeds, and what surfaces later is visitors"
  echo "landing somewhere wrong or mail going quiet, with nothing tying it back"
  echo "to this run. The zone move is also still ahead of us, so a record written"
  echo "now is written into a delegation the registry does not yet point at."
  echo ""
  echo "If this is not the change you came for, stop. Anything else pending in the"
  echo "tree is applied along with it."
  echo ""
  # --yes does not answer this one. Cleared around the prompt rather than
  # checked, so there is no path where an exported or passed flag stands in for
  # the person.
  DNS_ASSUME_YES_WAS="$ASSUME_YES"
  ASSUME_YES="no"
  if ! confirm_from_tty "Type 'APPLY' to change DNS: " "APPLY"; then
    ASSUME_YES="$DNS_ASSUME_YES_WAS"
    echo "Aborted before terraform apply. Nothing was changed; resume with --from-step 2." >&2
    exit 1
  fi
  ASSUME_YES="$DNS_ASSUME_YES_WAS"
  echo ""
fi

# Staging is the only tree that applies without the typed word. The confirmation
# is not a receipt that a plan was read; it is the thing that stands between a
# decision and replacing what the public is served, and staging serves nobody and
# holds data that is meant to be thrown away. Making the operator type it on
# every staging iteration is what teaches them to answer prompts without reading
# them, so the word means less on the trees where it has to mean something.
#
# The shared tree asks, because it holds every environment's Terraform state,
# production's included. The reasoning that excuses staging is that its data is
# disposable and it exists to be iterated on, and neither is true of the state
# bucket the other two trees need in order to exist at all. It also costs
# nothing: the shared tree changes about once a year.
#
# The identity tree asks for a different reason: its plan is what every
# dev-and-tester in this account is permitted to do. A widened statement hands
# everybody something, a narrowed one takes it away mid-incident; neither is a
# change to skim past, and the diff is short enough that reading it costs
# nothing. It is also the one tree whose plan the reader cannot sanity-check
# against a running system afterwards, because a policy that is too broad looks
# exactly like one that is correct until somebody uses it.
#
# The plan is still printed in full on every tree, and the warning below still
# says what to look for, because the reading is the part that matters and it is
# not what the prompt was buying.
if [[ "$TARGET" == "production" || "$TARGET" == "shared" || "$TARGET" == "identity" ]]; then
  echo "Read the plan above before answering. It covers this whole environment, not only"
  echo "the change you came for: anything else pending in the tree is applied with it."
  echo "A destroy or a replacement you did not expect is a reason to stop, not to confirm."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply the plan shown above: " "APPLY"; then
    echo "Aborted before terraform apply. Nothing was changed; resume with --from-step 2." >&2
    exit 1
  fi
else
  echo "Applying the plan above without a confirmation, which is deliberate for"
  echo "${TARGET}: it is the one tree that does not stop for a typed word, because"
  echo "its data is disposable and a word typed on every iteration stops being read."
  echo "The plan covers this whole environment, not only the change you came for."
  echo ""
fi

# The firewall, written in place (see the block above that decided it). Any
# failure here stops the run with nothing further applied and prints the live
# port list. A re-run is safe: the provider reads the live list, so it plans
# from wherever this left the firewall.
if (( FW_INPLACE )); then
  fw_live() {
    "$AWS_FW_BIN" lightsail get-instance-port-states --instance-name "$FW_INSTANCE" --region "$FW_REGION" \
      --output json </dev/null 2>/dev/null
  }
  fw_stop() {
    echo "ERROR: $1" >&2
    echo "       Nothing else in the plan was applied. The firewall as it stands now:" >&2
    fw_live | jq -c '.portStates[]? | {fromPort, protocol, cidrs, cidrListAliases}' 2>/dev/null | sed 's/^/         /' >&2 || true
    echo "       Re-run this script: the next plan starts from the live firewall." >&2
    exit 1
  }
  echo "==> Writing the firewall's port list in place on ${FW_INSTANCE}"
  FW_OP="$("$AWS_FW_BIN" lightsail put-instance-public-ports --instance-name "$FW_INSTANCE" --region "$FW_REGION" \
      --port-infos "$FW_PLANNED" --query 'operation.id' --output text </dev/null)" \
    || fw_stop "put-instance-public-ports was refused"
  fw_status=""
  for (( i = 1; i <= 30; i++ )); do
    fw_status="$("$AWS_FW_BIN" lightsail get-operation --operation-id "$FW_OP" --region "$FW_REGION" \
      --query 'operation.status' --output text </dev/null 2>/dev/null)" || fw_status=""
    [[ "$fw_status" == "Succeeded" || "$fw_status" == "Failed" ]] && break
    (( i < 30 )) && sleep 2
  done
  [[ "$fw_status" == "Succeeded" ]] || fw_stop "the port-list write did not succeed (operation status '${fw_status:-unknown}')"

  # Read back and compare as sets: the outcome, not the call's exit status.
  fw_norm='map({fromPort, toPort, protocol, cidrs: ((.cidrs // []) | sort), cidrListAliases: ((.cidrListAliases // []) | sort)}) | sort_by(.fromPort)'
  fw_want="$(printf '%s' "$FW_PLANNED" | jq -c "$fw_norm")"
  fw_have="$(fw_live | jq -c ".portStates | $fw_norm" 2>/dev/null)" || fw_have=""
  [[ -n "$fw_have" && "$fw_have" == "$fw_want" ]] \
    || fw_stop "the live firewall does not read back as the reviewed port list"
  echo "    the live firewall matches the reviewed port list"

  # Plan again. The firewall must now be a no-op, and every other change must be
  # the one that was reviewed; anything different is a plan nobody has read.
  echo "==> Planning again against the live firewall"
  shred -u "$TF_PLAN" 2>/dev/null || rm -f "$TF_PLAN"
  : > "$TF_PLAN"
  chmod 600 "$TF_PLAN"
  "$TF_BIN" -chdir="$TF_DIR" plan ${TF_INPUT_ARGS[@]+"${TF_INPUT_ARGS[@]}"} ${PLAN_EXTRA_ARGS[@]+"${PLAN_EXTRA_ARGS[@]}"} \
      -no-color -out="$TF_PLAN" > "$TF_PLAN_LOG" 2>&1 \
    || fw_stop "the second plan failed"
  PLAN2_JSON="$("$TF_BIN" -chdir="$TF_DIR" show -json "$TF_PLAN" 2>/dev/null)" || fw_stop "could not read the second plan"
  fw_changes() {
    jq -c --arg fw "$FIREWALL_ADDRESS" '
      [.resource_changes[]? | select(.change.actions != ["no-op"] and .change.actions != ["read"])
       | select(.address != $fw) | {address, actions: .change.actions, after: .change.after}] | sort_by(.address)'
  }
  printf '%s' "$PLAN2_JSON" | jq -e --arg fw "$FIREWALL_ADDRESS" \
      'all(.resource_changes[]?; .address != $fw or .change.actions == ["no-op"] or .change.actions == ["read"])' >/dev/null 2>&1 \
    || fw_stop "the firewall still plans a change after the in-place write"
  [[ "$(printf '%s' "$PLAN_JSON" | fw_changes)" == "$(printf '%s' "$PLAN2_JSON" | fw_changes)" ]] \
    || fw_stop "the second plan differs from the one reviewed (something changed in between). Its firewall write matched what you reviewed"
  echo "    the second plan is the reviewed plan, less the firewall"
  echo ""
fi

if ! "$TF_BIN" -chdir="$TF_DIR" apply ${TF_INPUT_ARGS[@]+"${TF_INPUT_ARGS[@]}"} "$TF_PLAN"; then
  echo "ERROR: terraform apply failed. Resume with --from-step 2 once fixed." >&2
  exit 1
fi
echo ""
echo "Applied. Confirm the resources you expected are present before relying on them:"
echo "  terraform -chdir=terraform/$TARGET output"
