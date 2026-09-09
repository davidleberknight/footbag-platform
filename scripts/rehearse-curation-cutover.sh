#!/usr/bin/env bash
# rehearse-curation-cutover.sh
#
# The curation-cutover rehearsal, as one command.
#
# WHAT IT PROVES.
#
# Two things, in order, both on staging and both against the real host:
#
#   1. An admin edit made through the running application survives a code-only
#      deploy, with the live database not replaced and the cutover marker still
#      absent from the host env file. That deploy opts out of the persona
#      refresh, which is on by default on staging and deletes persona-owned
#      rows: a leg that let the deploy mutate the database would be asserting
#      against its own side effect.
#   2. The database-replacing deploy refuses, with a non-zero exit and before
#      any database or media mutation, on a host carrying the post-cutover
#      marker.
#
# WHAT ONLY A REAL RUN PROVES, WHICH IS WHY THIS EXISTS.
#
# The refusal guard's whole truth table is already pinned in the test suite
# against fixtures, and so is its handshake with the destructive remote half.
# What no suite can reach is the host itself:
#
#   - whether sqlite3 is installed. The guard degrades deliberately without it,
#     warning and letting the env line decide alone, because failing closed
#     there would block the disaster rebuild the refusal exists to permit. On a
#     host with no sqlite3 the two-marker protection is one-marker protection,
#     silently.
#   - whether the marker writer is actually on the host, which depends on a
#     deploy from a tree carrying it having landed.
#   - whether the guard resolves the database path the running site actually
#     uses, out of the real env file.
#   - whether a real code-only deploy really does leave an audited in-app edit
#     intact, end to end.
#
# WHAT IT REFUSES.
#
#   - Any target but staging. The run marks the host and then drives a
#     database-replacing deploy at it; neither belongs anywhere near production.
#   - A host whose cutover marker is already set, in either half. A run must
#     never reverse a marker it did not set: the marker may be there because
#     somebody meant it to be.
#   - A host missing sqlite3, the marker writer, or a pty tool, each named.
#     These are reported as findings rather than worked around, because each one
#     is a real weakening of the protection this rehearsal is certifying.
#   - A trick with no audited in-app edit recorded against it, which means the
#     operator has not yet made the edit the first leg is supposed to preserve.
#
# WHY IT ASKS NOTHING.
#
# It runs unattended, and deliberately. This script refuses every target but
# staging, and on staging none of its acts is consequential: a code-only deploy
# is the routine one, the database-replacing deploy it attempts is what a normal
# staging refresh does anyway, and the marker is recorded and reversed inside the
# same run on a host whose database is rebuilt as a matter of course. A typed
# phrase here would be ceremony with no hazard behind it, and the deploys
# themselves ask nothing on staging either: the phrase gates are production-only.
#
# The marker writer's own typed phrases stay exactly as they are. They exist so
# muscle memory cannot carry an operator through a direction they did not mean on
# a host where that matters, and this run answers them on a pty it allocates,
# which is how its terminal check is satisfied rather than weakened. The hazard
# that check defends against, a credential file consumed as the answer, cannot
# arise here: nothing in this script reads stdin.
#
# Usage (the sudo password is read from the operator credential file, whose
# location AWS_OPERATOR_FILE overrides; nothing is redirected in):
#   bash scripts/rehearse-curation-cutover.sh --target staging --trick <slug>
#   bash scripts/rehearse-curation-cutover.sh --target staging --trick <slug> --dry-run
#
# Before running it, edit that trick's prose through /admin/freestyle/tricks/<slug>/edit
# on the staging site and save. That edit is the subject of the first leg.
set -euo pipefail

TARGET=""
TRICK_SLUG=""
SSH_ALIAS=""
DRY_RUN=0

# Must match scripts/cutover-marker.sh. A drift there aborts the marker move
# loudly rather than moving anything, because that script compares the phrase it
# asked for against what it was given.
PHRASE_COMPLETE="RECORD CUTOVER COMPLETE"
PHRASE_REVERSED="REVERSE CUTOVER MARKER"

# Named test seams. The companion test drives the script through these; a run
# using either says so on stderr, because a seamed run proves nothing about the
# estate.
SSH_BIN="${FOOTBAG_REHEARSAL_SSH:-ssh}"
DEPLOY_CMD="${FOOTBAG_REHEARSAL_DEPLOY_CMD:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires an argument" >&2; exit 2; }
      ;;
    --trick)
      TRICK_SLUG="${2:-}"
      shift 2 || { echo "ERROR: --trick requires an argument" >&2; exit 2; }
      ;;
    --ssh-alias)
      SSH_ALIAS="${2:-}"
      shift 2 || { echo "ERROR: --ssh-alias requires an argument" >&2; exit 2; }
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      # Bounded by the first `set -eu` rather than a line number, so editing the
      # header cannot silently truncate the help text.
      sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
      exit 0
      ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

# No default target. Which environment a run lands on is never inherited from
# ambient state, and this one marks the host it lands on.
case "$TARGET" in
  staging) ;;
  production)
    echo "ERROR: this rehearsal is refused on production." >&2
    echo "       It records the cutover marker and then drives a database-replacing" >&2
    echo "       deploy at the host. Both are cutover acts, not rehearsals, there." >&2
    exit 2
    ;;
  "")
    echo "ERROR: --target is required and has no default (only 'staging' is accepted)." >&2
    exit 2
    ;;
  *) echo "ERROR: --target must be 'staging' (got '$TARGET')" >&2; exit 2 ;;
esac

# Validated rather than quoted downstream: the slug reaches a SQL literal in the
# root-side body, and a pattern that admits only lowercase, digits and
# underscores cannot carry a quote out of it.
if [[ ! "$TRICK_SLUG" =~ ^[a-z0-9_]+$ ]]; then
  echo "ERROR: --trick must be a trick slug (lowercase, digits, underscores); got '${TRICK_SLUG}'" >&2
  exit 2
fi

SSH_ALIAS="${SSH_ALIAS:-footbag-$TARGET}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HALF="${SCRIPT_DIR}/internal/rehearse-curation-cutover-remote.sh"

if (( DRY_RUN )); then
  echo "== dry run: curation-cutover rehearsal on $TARGET (ssh alias: $SSH_ALIAS) =="
  echo ""
  echo "Would run, in order:"
  echo "  1. Probe the host: sqlite3, the marker writer, a pty tool, both marker"
  echo "     halves, the database inode, and the audited state of trick '${TRICK_SLUG}'"
  echo "  2. Refuse unless every one of those is in the state a rehearsal needs"
  echo "  3. Code-only deploy, with the persona refresh opted out, then re-probe"
  echo "     and assert the edit survived untouched"
  echo "  4. Record the cutover marker, both halves, through the host's own writer"
  echo "  5. Attempt the database-replacing deploy and assert it is refused"
  echo "  6. Reverse the marker, on a trap, whatever the outcome"
  echo "  7. Print an evidence block for the rehearsal card"
  echo ""
  echo "The marker is reversed on exit, interrupt and terminate, and only when"
  echo "this run is what set it."
  exit 0
fi

# shellcheck source=lib/host-env-remote.sh
source "${SCRIPT_DIR}/lib/host-env-remote.sh"

# The credential is resolved here rather than redirected in, which is what the
# deploy this script drives already does, and it removes the one invocation
# mistake the secret-transport rule warns about by name: handing an operator a
# `< credfile bash <script>` form feeds the password into the first prompt that
# reads stdin. Nothing here reads stdin now, and the value never reaches argv.
AWS_OPERATOR_FILE="${AWS_OPERATOR_FILE:-$HOME/AWS/AWS_OPERATOR.txt}"
if [[ ! -r "$AWS_OPERATOR_FILE" ]]; then
  echo "ERROR: operator credential source unavailable." >&2
  echo "       Verify the configured credential location is readable." >&2
  exit 1
fi
# Same bar the deploy applies. A readable-by-others credential file must be
# assumed to have been read, so this refuses rather than trusting the mode.
_cred_mode="$(stat -c '%a' "$AWS_OPERATOR_FILE" 2>/dev/null || echo "")"
if [[ "$_cred_mode" != "600" && "$_cred_mode" != "400" ]]; then
  echo "ERROR: operator credential file has mode ${_cred_mode:-unknown}; expected 600 (or 400)." >&2
  echo "       Restrict it to its owner, then rotate the password it holds." >&2
  exit 1
fi
IFS= read -r SUDO_PASS < "$AWS_OPERATOR_FILE" || true
if [[ -z "$SUDO_PASS" ]]; then
  echo "ERROR: the credential file's first line is empty; expected the host sudo password." >&2
  exit 1
fi

require_ssh_alias "$SSH_ALIAS" || exit 1
require_host_ssh_opts || exit 1
[[ -r "$REMOTE_HALF" ]] || { echo "ERROR: missing remote half: $REMOTE_HALF" >&2; exit 1; }

if [[ "$SSH_BIN" != "ssh" || -n "$DEPLOY_CMD" ]]; then
  echo "NOTE: a test seam is in use; this run proves nothing about the estate." >&2
fi
DEPLOY_CMD="${DEPLOY_CMD:-bash deploy_to_aws.sh}"
# Split once into an argv array rather than relying on word splitting at each
# call site, so a seam carrying flags cannot reassemble differently in the two
# places it is used.
read -ra DEPLOY_ARGV <<< "$DEPLOY_CMD"

# ── Host actions ────────────────────────────────────────────────────────────

remote_action() {
  local action="$1" phrase="${2:-}"
  {
    printf '%s\n' "$SUDO_PASS"
    printf 'REHEARSAL_ACTION=%q\n'     "$action"
    printf 'REHEARSAL_TRICK_SLUG=%q\n' "$TRICK_SLUG"
    printf 'MARKER_PHRASE=%q\n'        "$phrase"
    cat "$REMOTE_HALF"
  } | $SSH_BIN "${HOST_SSH_OPTS[@]}" "$SSH_ALIAS" 'sudo -k -S -p "" bash'
}

# Run a deploy and, on a non-zero exit, name the two preconditions that fail in
# ways that read as unrelated to this rehearsal. A schema drift between the
# committed schema and the deployed one asks a yes-or-no question and hard-exits
# where there is no terminal, which is exactly what this script hands it; and the
# mandatory post-deploy smoke hard-exits when it cannot resolve the environment's
# address from Terraform. Neither says anything about the cutover.
deploy_or_explain() {
  if "${DEPLOY_ARGV[@]}" "$@"; then
    return 0
  fi
  echo "" >&2
  echo "ERROR: the deploy exited non-zero, so this leg proved nothing." >&2
  echo "       Two causes look nothing like a cutover problem:" >&2
  echo "         - committed schema differs from the deployed one. That check asks a" >&2
  echo "           question and refuses without a terminal; this run has none." >&2
  echo "           Resolve the drift, or set FOOTBAG_SKIP_SCHEMA_DRIFT_CHECK=1 once" >&2
  echo "           you have read what differs." >&2
  echo "         - the post-deploy smoke could not resolve the environment address" >&2
  echo "           from Terraform. Set SMOKE_BASE_URL, or initialise that tree." >&2
  return 1
}

# Pull one REHEARSAL_* value out of a captured probe.
probe_value() {
  printf '%s\n' "$1" | grep -E "^$2=" | tail -1 | cut -d= -f2-
}

MARKER_SET_BY_THIS_RUN=0
ATTEMPT_LOG=""

cleanup() {
  local rc=$?
  # Kept on a failure, because the failure messages name it and it is the only
  # record of what the refused deploy actually said; removed on success, where
  # the evidence block carries everything worth keeping.
  if [[ -n "$ATTEMPT_LOG" && "$rc" -eq 0 ]]; then
    rm -f "$ATTEMPT_LOG"
  elif [[ -n "$ATTEMPT_LOG" ]]; then
    echo "" >&2
    echo "NOTE: the deploy attempt's output is kept at ${ATTEMPT_LOG}" >&2
  fi
  if (( MARKER_SET_BY_THIS_RUN )); then
    echo "" >&2
    echo "==> reversing the cutover marker this run recorded" >&2
    if remote_action marker-reverse "$PHRASE_REVERSED" >&2; then
      MARKER_SET_BY_THIS_RUN=0
      echo "==> marker reversed; the host is back to pre-cutover" >&2
    else
      echo "" >&2
      echo "ERROR: the marker could NOT be reversed and the host is still marked." >&2
      echo "       The destructive rebuild deploy will refuse this host until it is." >&2
      echo "       Reverse it by hand, on the host, as root:" >&2
      echo "         sudo /srv/footbag/scripts/cutover-marker.sh --set reversed" >&2
      rc=1
    fi
  fi
  exit "$rc"
}
trap cleanup EXIT INT TERM

# ── Preflight ───────────────────────────────────────────────────────────────

echo "== curation-cutover rehearsal on $TARGET (ssh alias: $SSH_ALIAS, trick: $TRICK_SLUG) =="
echo ""
echo "==> probing the host"
BEFORE="$(remote_action probe)"

fail_precondition() {
  echo "" >&2
  echo "ERROR: $1" >&2
  shift
  while [[ $# -gt 0 ]]; do echo "       $1" >&2; shift; done
  exit 1
}

[[ "$(probe_value "$BEFORE" REHEARSAL_SQLITE3)" == "present" ]] || fail_precondition \
  "sqlite3 is absent on ${SSH_ALIAS}." \
  "This is a finding, not an inconvenience: without it the deploy's cutover" \
  "guard reads the env line alone, so the two-marker protection this rehearsal" \
  "certifies is one-marker protection. Install sqlite3 on the host and re-run."

[[ "$(probe_value "$BEFORE" REHEARSAL_MARKER_SCRIPT)" == "present" ]] || fail_precondition \
  "the cutover marker writer is absent from the host." \
  "It ships with the deploy rsync, so no deploy from a tree carrying it has" \
  "landed here. Deploy code first, then re-run."

[[ "$(probe_value "$BEFORE" REHEARSAL_PTY_TOOL)" == "present" ]] || fail_precondition \
  "util-linux 'script' is absent on the host." \
  "The marker writer requires a terminal for its typed confirmation, and this" \
  "run supplies one with a pty rather than by weakening that check."

[[ "$(probe_value "$BEFORE" REHEARSAL_DB_STATE)" == "readable" ]] || fail_precondition \
  "the host database is missing or unreadable." \
  "The rehearsal asserts against its contents, so there is nothing to compare."

BEFORE_ENV_MARKER="$(probe_value "$BEFORE" REHEARSAL_ENV_MARKER)"
BEFORE_DB_MARKER="$(probe_value "$BEFORE" REHEARSAL_DB_MARKER)"
if [[ "$BEFORE_ENV_MARKER" != "absent" || "$BEFORE_DB_MARKER" != "absent" ]]; then
  fail_precondition \
    "the host already carries a cutover marker (env: ${BEFORE_ENV_MARKER}, database: ${BEFORE_DB_MARKER})." \
    "This run will not reverse a marker it did not set: it may be there because" \
    "somebody meant it to be. Resolve it deliberately, then re-run."
fi

[[ "$(probe_value "$BEFORE" REHEARSAL_TRICK_FOUND)" != "0" ]] || fail_precondition \
  "no trick '${TRICK_SLUG}' exists on the host."

BEFORE_TRICK_AUDITS="$(probe_value "$BEFORE" REHEARSAL_TRICK_AUDIT_COUNT)"
[[ "$BEFORE_TRICK_AUDITS" != "0" ]] || fail_precondition \
  "trick '${TRICK_SLUG}' carries no audited edit." \
  "The first leg proves an in-app admin edit survives a code-only deploy, so" \
  "make that edit through /admin/freestyle/tricks/${TRICK_SLUG}/edit first."

BEFORE_PROSE="$(probe_value "$BEFORE" REHEARSAL_PROSE_SHA)"
BEFORE_INODE="$(probe_value "$BEFORE" REHEARSAL_DB_INODE)"
BEFORE_AUDIT_TOTAL="$(probe_value "$BEFORE" REHEARSAL_AUDIT_TOTAL)"

echo "    sqlite3 present, marker writer present, both markers absent"
echo "    trick '${TRICK_SLUG}': ${BEFORE_TRICK_AUDITS} audited edit(s), prose ${BEFORE_PROSE:0:12}"
echo ""

echo "Running two deploys against ${SSH_ALIAS}: a code-only deploy, then a"
echo "database-replacing deploy that is expected to be refused. The marker is"
echo "recorded between them and reversed on the way out."
echo ""

# ── Leg one: the code-only deploy preserves the edit ─────────────────────────

echo ""
echo "==> leg 1: code-only deploy"
# --no-refresh-personas is not optional here. A code-only staging deploy rebuilds
# the test personas by default, and that rebuild deletes persona-owned rows. This
# leg exists to show the live database untouched, so a run that let the deploy
# mutate it would be asserting against its own side effect.
deploy_or_explain -k --no-refresh-personas

echo ""
echo "==> leg 1: re-probing"
AFTER_CODE="$(remote_action probe)"

assert_same() {
  local label="$1" before="$2" after="$3"
  if [[ "$before" != "$after" ]]; then
    echo "" >&2
    echo "FAILED: ${label} changed across the code-only deploy (${before} -> ${after})." >&2
    exit 1
  fi
  echo "    unchanged: ${label}"
}

# The audit total is the one value that legitimately moves. Several services
# write audit rows from background work rather than from a request: payment
# reconciliation, Active Player expiry, mail-feedback intake, and the
# operational-error recorder, which a deploy's container restart can trip. So
# equality would fail runs that proved nothing wrong. What a replaced database
# shows is the count going backwards, to whatever the shipped file holds, and
# that is what this refuses.
assert_not_lost() {
  local label="$1" before="$2" after="$3"
  if (( after < before )); then
    echo "" >&2
    echo "FAILED: ${label} went backwards (${before} -> ${after}), which is what a" >&2
    echo "        replaced database looks like." >&2
    exit 1
  fi
  if (( after > before )); then
    echo "    not lost: ${label} (${before} -> ${after}, background writes)"
  else
    echo "    unchanged: ${label}"
  fi
}

assert_same "the database file identity"  "$BEFORE_INODE"        "$(probe_value "$AFTER_CODE" REHEARSAL_DB_INODE)"
assert_same "the trick's editorial prose" "$BEFORE_PROSE"        "$(probe_value "$AFTER_CODE" REHEARSAL_PROSE_SHA)"
assert_same "the trick's audit count"     "$BEFORE_TRICK_AUDITS" "$(probe_value "$AFTER_CODE" REHEARSAL_TRICK_AUDIT_COUNT)"
assert_not_lost "the total audit count"   "$BEFORE_AUDIT_TOTAL"  "$(probe_value "$AFTER_CODE" REHEARSAL_AUDIT_TOTAL)"
assert_same "the cutover marker (env)"    "absent"               "$(probe_value "$AFTER_CODE" REHEARSAL_ENV_MARKER)"

echo "    leg 1 holds: the in-app edit survived a code-only deploy"

# ── Leg two: the destructive deploy is refused on a marked host ──────────────

echo ""
echo "==> leg 2: recording the cutover marker"
remote_action marker-set "$PHRASE_COMPLETE"
MARKER_SET_BY_THIS_RUN=1

MARKED="$(remote_action probe)"
if [[ "$(probe_value "$MARKED" REHEARSAL_ENV_MARKER)" != "1" \
   || "$(probe_value "$MARKED" REHEARSAL_DB_MARKER)" != "1" ]]; then
  echo "" >&2
  echo "FAILED: the marker did not land in both halves; the rehearsal cannot proceed." >&2
  exit 1
fi
echo "    both marker halves now read complete"

echo ""
echo "==> leg 2: attempting the database-replacing deploy, which must be refused"
# Created with mktemp and owned by the trap that is already installed, which
# removes it on a clean run and names it on a failed one.
ATTEMPT_LOG="$(mktemp)"

REFUSED=0
# The failure of this command is the expected outcome, so it is tolerated here
# explicitly and the run is judged on the refusal, never on this exit status.
if "${DEPLOY_ARGV[@]}" -r >"$ATTEMPT_LOG" 2>&1; then
  REFUSED=0
else
  REFUSED=1
fi

if (( ! REFUSED )); then
  echo "" >&2
  echo "FAILED: the database-replacing deploy was NOT refused on a marked host." >&2
  echo "        This is the failure the rehearsal exists to catch. The live" >&2
  echo "        database may have been replaced. Stop and investigate." >&2
  echo "        Attempt log: ${ATTEMPT_LOG}" >&2
  exit 1
fi

if ! grep -qi "cutover" "$ATTEMPT_LOG"; then
  echo "" >&2
  echo "FAILED: the deploy exited non-zero but its output does not name the cutover" >&2
  echo "        marker, so it was refused for some other reason and this proves" >&2
  echo "        nothing. Attempt log: ${ATTEMPT_LOG}" >&2
  exit 1
fi
echo "    refused, naming the cutover marker"

AFTER_ATTEMPT="$(remote_action probe)"
assert_untouched() {
  local label="$1" before="$2" after="$3"
  if [[ "$before" != "$after" ]]; then
    echo "" >&2
    echo "FAILED: ${label} changed during a deploy that was supposed to refuse" >&2
    echo "        before touching anything (${before} -> ${after})." >&2
    exit 1
  fi
  echo "    untouched: ${label}"
}
assert_untouched "the database file identity"  "$BEFORE_INODE"        "$(probe_value "$AFTER_ATTEMPT" REHEARSAL_DB_INODE)"
assert_untouched "the trick's editorial prose" "$BEFORE_PROSE"        "$(probe_value "$AFTER_ATTEMPT" REHEARSAL_PROSE_SHA)"
assert_not_lost  "the total audit count"       "$BEFORE_AUDIT_TOTAL"  "$(probe_value "$AFTER_ATTEMPT" REHEARSAL_AUDIT_TOTAL)"

echo "    leg 2 holds: the destructive deploy refused before mutating anything"

# ── Evidence ────────────────────────────────────────────────────────────────

cat <<EVIDENCE

== rehearsal evidence ==

Run:         scripts/rehearse-curation-cutover.sh --target ${TARGET} --trick ${TRICK_SLUG}
Host:        ${SSH_ALIAS}
Database:    $(probe_value "$BEFORE" REHEARSAL_DB_PATH) (inode ${BEFORE_INODE}, unchanged throughout)

Leg 1, code-only deploy: an audited in-app edit to '${TRICK_SLUG}' survived intact.
  editorial prose hash ${BEFORE_PROSE}, unchanged
  ${BEFORE_TRICK_AUDITS} audit entries on the trick and ${BEFORE_AUDIT_TOTAL} in total, unchanged
  cutover marker absent before and after

Leg 2, database-replacing deploy on a marked host: refused, non-zero exit, output
naming the cutover marker, with the database identity, the trick's prose and the
total audit count all unchanged afterwards.

The marker was recorded and reversed by this run through the host's own writer.
EVIDENCE

echo ""
echo "== rehearsal complete =="
