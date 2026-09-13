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
# CloudFront bootstrap, importing a console-created resource before the first
# apply, and refreshing providers when one is added. Use --init for that last
# one; do the other two as the runbook says, then apply through here.
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
#
# The typed APPLY is asked for on production and on the shared tree, which holds
# every environment's state. Staging applies without it: its data is meant to be
# thrown away, and a word typed on every iteration is one that stops being read.
# --break-stale-lock asks in every environment, staging included, because what it
# removes is not staging's disposable data.
#
#   ... --yes   accepted and unnecessary everywhere it is accepted: production is
#               the only environment that stops for a typed confirmation, and a
#               production apply is refused with this flag, because a
#               confirmation a flag can supply in advance is not one. Kept so
#               that reaching for it against production fails loudly rather than
#               looking like an option nobody happened to implement.
#               --dry-run --yes still works against production, since a dry run
#               applies nothing.
#
# --dry-run runs nothing at all: it states what the real run would do.
#
# Test seams (CI only; operators never set these): TERRAFORM_APPLY_BIN points the
# terraform command at a stub, announced loudly when set, because a run that
# silently used a stub would prove nothing about the estate.
# TERRAFORM_APPLY_PROC_COUNT stands in for the local terraform process count the
# state-lock report reads, so both of its branches are testable on a machine that
# has no terraform running.
set -euo pipefail

TARGET=""
DRY_RUN=0
DO_INIT=0
INIT_UPGRADE=0
FROM_STEP=1
BREAK_LOCK=0
# A lock younger than this is not stale. Half an hour is longer than any plan or
# apply in these trees takes, so a lock still held past it was left by a process
# that is gone rather than one still working.
STALE_LOCK_MIN_AGE_SECS=1800

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# confirm_from_tty reads the answer from /dev/tty rather than stdin, refuses when
# no terminal exists and --yes was not given, and honours --yes. Shared so every
# operator script prompts the same way.
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"

TF_BIN="${TERRAFORM_APPLY_BIN:-terraform}"

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

  LOCK_ID="$(sed -n 's/^[[:space:]]*ID:[[:space:]]*//p' "$log" | head -1)"
  LOCK_OP="$(sed -n 's/^[[:space:]]*Operation:[[:space:]]*//p' "$log" | head -1)"
  LOCK_WHO="$(sed -n 's/^[[:space:]]*Who:[[:space:]]*//p' "$log" | head -1)"
  created="$(sed -n 's/^[[:space:]]*Created:[[:space:]]*//p' "$log" | head -1)"

  # "2026-09-11 23:58:55.754432017 +0000 UTC" parses once the fractional seconds
  # and the trailing zone name are removed; the numeric offset is what date reads.
  LOCK_CREATED="$(printf '%s' "${created% UTC}" | sed 's/\.[0-9]*//')"
  created_epoch="$(date -u -d "$LOCK_CREATED" +%s 2>/dev/null || true)"
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
    --yes)
      ASSUME_YES="yes"
      shift
      ;;
    --help|-h) usage 0 ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# No default target. Which environment an apply lands on is exactly the decision
# this script must not make for the operator.
case "$TARGET" in
  staging|production|shared) ;;
  '') echo "ERROR: --target is required ('staging', 'production' or 'shared')" >&2; exit 2 ;;
  *) echo "ERROR: --target must be 'staging', 'production' or 'shared' (got '$TARGET')" >&2; exit 2 ;;
esac

if [[ ! "$FROM_STEP" =~ ^[1-2]$ ]]; then
  echo "ERROR: --from-step takes a step number from 1 to 2 (got '$FROM_STEP')." >&2
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"
if [[ ! -d "$TF_DIR" ]]; then
  echo "ERROR: no Terraform tree at terraform/$TARGET." >&2
  exit 1
fi

if [[ -n "${TERRAFORM_APPLY_BIN:-}" ]]; then
  echo "SYNTHETIC: terraform='$TF_BIN' -- this run proves nothing about the estate." >&2
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
  elif [[ "$TARGET" == "production" || "$TARGET" == "shared" ]]; then
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
  trap 'for f in "${TF_PLAN:-}" "${TF_PLAN_LOG:-}"; do if [ -n "$f" ] && [ -e "$f" ]; then shred -u "$f"; fi; rm -f "$f"; done' EXIT INT TERM

  # Check 1: the lock is held right now. A plan is the probe rather than a read of
  # the backend's object layout, because terraform is the authority on its own
  # locking and its error carries the only description of the holder there is.
  # -lock-timeout=0 so a held lock fails immediately instead of waiting.
  echo "Probing: a plan that fails on lock acquisition is the proof the lock is live."
  PROBE_STATUS=0
  "$TF_BIN" -chdir="$TF_DIR" plan -lock-timeout=0 -out="$TF_PLAN" > "$TF_PLAN_LOG" 2>&1 || PROBE_STATUS=$?

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
  if (( LOCK_AGE_SECS < STALE_LOCK_MIN_AGE_SECS )); then
    echo "REFUSED: the lock is $(( LOCK_AGE_SECS / 60 )) minutes old, under the $(( STALE_LOCK_MIN_AGE_SECS / 60 ))-minute floor." >&2
    echo "         A lock this young is more likely a run still working than one that" >&2
    echo "         died. Wait, then try again." >&2
    exit 2
  fi
  if (( LOCK_RUNNING > 0 )); then
    echo "REFUSED: ${LOCK_RUNNING} terraform process(es) are running on this machine, so a run" >&2
    echo "         of your own may hold it. Wait for that run to finish." >&2
    exit 2
  fi

  echo "All four checks pass: this machine's lock, taken by a plan, older than"
  echo "$(( STALE_LOCK_MIN_AGE_SECS / 60 )) minutes, with no terraform running here. The run that took it is gone."
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
  "$TF_BIN" -chdir="$TF_DIR" plan -lock-timeout=0 -out="$TF_PLAN" > "$TF_PLAN_LOG" 2>&1 || VERIFY_STATUS=$?
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
# there. Every other environment applies without a confirmation at all, so the
# flag is simply unnecessary there rather than doing anything.
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
trap 'for f in "${TF_PLAN:-}" "${TF_PLAN_LOG:-}"; do if [ -n "$f" ] && [ -e "$f" ]; then shred -u "$f"; fi; rm -f "$f"; done' EXIT INT TERM

# `|| PLAN_STATUS=$?` rather than an `if`, because `set -e` with `pipefail` would
# otherwise abort the script on the failing plan before the report below runs,
# which is the one failure this whole branch exists to explain.
PLAN_STATUS=0
"$TF_BIN" -chdir="$TF_DIR" plan -out="$TF_PLAN" 2>&1 | tee "$TF_PLAN_LOG" || PLAN_STATUS=$?
if (( PLAN_STATUS != 0 )); then
  echo "ERROR: terraform plan failed. Nothing was applied." >&2
  if ! report_state_lock "$TF_PLAN_LOG"; then
    echo "       Resume with --from-step 2 once fixed." >&2
  fi
  exit 1
fi
echo ""
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
# The plan is still printed in full on every environment, and the warning below
# still says what to look for, because the reading is the part that matters and
# it is not what the prompt was buying.
if [[ "$TARGET" == "production" || "$TARGET" == "shared" ]]; then
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
  echo "${TARGET}: production is the environment that stops for a typed word."
  echo "The plan covers this whole environment, not only the change you came for."
  echo ""
fi
if ! "$TF_BIN" -chdir="$TF_DIR" apply "$TF_PLAN"; then
  echo "ERROR: terraform apply failed. Resume with --from-step 2 once fixed." >&2
  exit 1
fi
echo ""
echo "Applied. Confirm the resources you expected are present before relying on them:"
echo "  terraform -chdir=terraform/$TARGET output"
