#!/usr/bin/env bash
# mail-domain-cutover.sh
#
# Moves footbag.org's mail records, and the IFPA list domain's, through the
# changes the mail cutover makes, one stage at a time, each one a values-file
# change and an apply checked to carry nothing else.
#
# WHY THIS IS ONE COMMAND.
#
# Every change here is a production DNS or subscription change, and each was a
# runbook line telling the operator to edit the production values file and
# apply. Done by hand that is an edit, a plan read by eye, and an apply, with
# nothing stopping the plan from carrying something else pending in the tree, or
# the step running in the wrong order. Each stage below owns its whole change:
# the precondition it depends on, the values-file change shown before it is
# written, a saved plan refused unless it carries exactly that change, the apply
# of that plan, and a check of what the zone then serves.
#
# THE STAGES, in the order the cutover runs them.
#
#   ifpa-move     Renames the IFPA list domain's mail routing and text records
#                 from the legacy-mirror maps into the Workspace maps, values
#                 unchanged, so they outlive the launch apply that removes the
#                 mirror. The tree's moved blocks make it a rename in state: the
#                 plan must carry those two moves and nothing else, and no record
#                 changes. Needs no delegation and no token.
#   ifpa-verify   After the zone move: adds Google's verification token for
#                 ifpa.footbag.org to that domain's text records, so the IFPA
#                 secretary can verify it as a Workspace secondary domain. Its
#                 mail still routes to the legacy host.
#   mail-day      T-0, the apply after the web switch: turns on the apex mail
#                 records (Google mail routing, the sender policy naming SES and
#                 Google, the reporting policy, the bounce-domain records), moves
#                 the IFPA list domain's mail routing to Google with a sender
#                 policy naming Google only, and carries every other apex text
#                 string the zone serves into the values file so the apply cannot
#                 delete one. Records when it applied, for the alert stage.
#   ops-alert     No sooner than 3600 seconds after mail-day, so the confirmation
#                 reaches Google rather than a cached route to the legacy host:
#                 subscribes the operations alert group to the critical alarm
#                 topic and the us-west-2 Health topic.
#   revert        Turns the apex mail records off again, restoring the mirrored
#                 legacy mail routing and sender policy. The IFPA list domain stays
#                 on Google and is fixed forward. Refused once the legacy mirror is
#                 off, because then turning the flag off deletes the apex mail
#                 routing and text records outright instead of restoring them.
#
# WHAT IT REFUSES.
#
#   - Any environment but production, the only tree that holds the zone.
#   - A plan carrying anything beyond the stage's own change, or missing part of
#     it. Anything else pending in the tree is refused as drift, so it is not
#     applied under cover of this change.
#   - ifpa-move: a checkout without the two ifpa moved blocks; the IFPA list
#     domain in both kinds of map, in neither, or split between them.
#   - ifpa-verify: a malformed token; the rename not yet done; a registry that
#     does not yet delegate footbag.org to the Route 53 zone; a zone serving the
#     IFPA list domain's records differently from the values file; a different
#     verification token already present.
#   - mail-day: the web switch not yet on; no verification token on the IFPA
#     list domain; footbag.org not delegated to the Route 53 zone; an apex text
#     set the values file cannot carry; no writable cutover directory in the
#     private operations checkout to record the apply time in; the operator not confirming that Gmail is on and the inside
#     tests passed, which this script cannot see.
#   - ops-alert: the mail records not on; no recorded mail-day apply, or fewer
#     than 3600 seconds since it; an alert address already set to another value.
#   - revert: the legacy mirror off.
#   - A confirmation from anywhere but a terminal.
#
# A stop before the apply restores the values file to what it held before this
# run. From the apply on, the values file is left holding the change, and
# re-running the same stage finishes it: an unchanged values file with a plan
# that carries part of the stage's change applies the rest, and an empty plan
# goes straight to the check. A stage already done says so and checks again.
#
# Usage (no credential on standard input; every confirmation is typed at the
# terminal):
#
#   bash scripts/mail-domain-cutover.sh --target production --stage ifpa-move
#   bash scripts/mail-domain-cutover.sh --target production --stage ifpa-verify \
#        --token google-site-verification=<token> --resolver 8.8.8.8
#   bash scripts/mail-domain-cutover.sh --target production --stage mail-day \
#        --resolver 8.8.8.8
#   bash scripts/mail-domain-cutover.sh --target production --stage ops-alert \
#        --address ops-alert@footbag.org
#   bash scripts/mail-domain-cutover.sh --target production --stage revert \
#        --resolver 8.8.8.8
#   bash scripts/mail-domain-cutover.sh --target production --stage <stage> --dry-run
#
#   --resolver  a public resolver to ask as the world does. Required, with no
#               default, by the stages that check what is served.
#   --dry-run   says what the stage would do and touches nothing.
#
# Test seams (CI only; operators never set these). Each says so on stderr when set:
#   MAIL_CUTOVER_TF_BIN, MAIL_CUTOVER_DIG_BIN, MAIL_CUTOVER_VERIFY_CMD (the
#   served-records verdict), MAIL_CUTOVER_TFVARS (a values file in place of the
#   environment's) and MAIL_CUTOVER_RECORD_DIR (where the mail-day apply time
#   is recorded).
set -euo pipefail

TARGET=""
STAGE=""
TOKEN=""
ADDRESS=""
RESOLVER=""
DRY_RUN=0

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/terraform-output.sh
source "${REPO_ROOT}/scripts/lib/terraform-output.sh"
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"

DOMAIN="footbag.org"
IFPA_NAME="ifpa.${DOMAIN}"
GOOGLE_MX="1 smtp.google.com"
IFPA_GOOGLE_SPF="v=spf1 include:_spf.google.com ~all"
# The time the mail-day apply needs before the alert group's confirmation is
# sent: the apex mail routing's TTL, so no resolver still holds the route to the
# legacy host when the confirmation is delivered.
ALERT_WAIT_SECONDS=3600

TF_BIN="${MAIL_CUTOVER_TF_BIN:-terraform}"
TF_OUTPUT_BIN="$TF_BIN"
DIG_BIN="${MAIL_CUTOVER_DIG_BIN:-dig}"
VERIFY_CMD="${MAIL_CUTOVER_VERIFY_CMD:-$REPO_ROOT/scripts/verify-mail-records.sh}"

for seam in MAIL_CUTOVER_TF_BIN MAIL_CUTOVER_DIG_BIN MAIL_CUTOVER_VERIFY_CMD \
    MAIL_CUTOVER_TFVARS MAIL_CUTOVER_RECORD_DIR; do
  if [[ -n "${!seam:-}" ]]; then
    echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
  fi
done

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0"
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)   TARGET="${2:-}";   shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --stage)    STAGE="${2:-}";    shift 2 || { cr_error "--stage requires an argument"; exit 2; } ;;
    --token)    TOKEN="${2:-}";    shift 2 || { cr_error "--token requires an argument"; exit 2; } ;;
    --address)  ADDRESS="${2:-}";  shift 2 || { cr_error "--address requires an argument"; exit 2; } ;;
    --resolver) RESOLVER="${2:-}"; shift 2 || { cr_error "--resolver requires an argument"; exit 2; } ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --help|-h)  usage 0 ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

# Production only, and still named: the zone exists in one environment, and
# saying which one is the operator's act, not a default.
require_target "$TARGET" production || exit 2

# Each stage takes exactly the flags it uses, so a flag given to the wrong stage
# is refused rather than silently ignored.
case "$STAGE" in
  ifpa-move)   WANTS_TOKEN=0; WANTS_ADDRESS=0; WANTS_RESOLVER=0 ;;
  ifpa-verify) WANTS_TOKEN=1; WANTS_ADDRESS=0; WANTS_RESOLVER=1 ;;
  mail-day)    WANTS_TOKEN=0; WANTS_ADDRESS=0; WANTS_RESOLVER=1 ;;
  ops-alert)   WANTS_TOKEN=0; WANTS_ADDRESS=1; WANTS_RESOLVER=0 ;;
  revert)      WANTS_TOKEN=0; WANTS_ADDRESS=0; WANTS_RESOLVER=1 ;;
  "") cr_error "--stage is required: ifpa-move, ifpa-verify, mail-day, ops-alert or revert."; exit 2 ;;
  *)  cr_error "--stage must be ifpa-move, ifpa-verify, mail-day, ops-alert or revert (got '$STAGE')."; exit 2 ;;
esac
flag_matches_stage() {
  local flag="$1" wanted="$2" value="$3"
  if (( wanted )) && [[ -z "$value" ]]; then
    cr_error "--stage $STAGE requires $flag."
    exit 2
  fi
  if (( ! wanted )) && [[ -n "$value" ]]; then
    cr_error "--stage $STAGE takes no $flag."
    exit 2
  fi
}
flag_matches_stage --token "$WANTS_TOKEN" "$TOKEN"
flag_matches_stage --address "$WANTS_ADDRESS" "$ADDRESS"
flag_matches_stage --resolver "$WANTS_RESOLVER" "$RESOLVER"

# Google's token is a fixed prefix and a base64url value. Anything else would be
# published as a string Google never matches, and the domain would never verify.
if [[ -n "$TOKEN" && ! "$TOKEN" =~ ^google-site-verification=[A-Za-z0-9_-]{20,100}$ ]]; then
  cr_error "--token must be the whole string Google gives, google-site-verification=<value> (got '$TOKEN')."
  exit 2
fi
# The alert group lives on the apex domain, whose mail this cutover moves.
if [[ -n "$ADDRESS" && ! "$ADDRESS" =~ ^[A-Za-z0-9._%+-]+@footbag\.org$ ]]; then
  cr_error "--address must be an address at footbag.org (got '$ADDRESS')."
  exit 2
fi

TF_DIR="$REPO_ROOT/terraform/$TARGET"

if (( DRY_RUN )); then
  echo "== Mail-domain cutover, stage $STAGE: $TARGET (dry run) =="
  case "$STAGE" in
    ifpa-move)   echo "Would move the ifpa entries from the legacy-mirror maps into the Workspace maps, values unchanged, and apply a plan carrying only the two moves." ;;
    ifpa-verify) echo "Would check footbag.org is delegated to the Route 53 zone, add $TOKEN to the ifpa text records, apply that one update and check it is served." ;;
    mail-day)    echo "Would set ses_enable_mail_records = true, route ifpa mail to Google, carry the live apex text strings, apply exactly the mail records and run verify-mail-records.sh --stage mail-day." ;;
    ops-alert)   echo "Would set ops_alert_email = \"$ADDRESS\" no sooner than $ALERT_WAIT_SECONDS seconds after the mail-day apply, and apply the two alert subscriptions." ;;
    revert)      echo "Would set ses_enable_mail_records = false, apply the reversal of the apex mail records and run verify-mail-records.sh --stage rollback." ;;
  esac
  cr_unproved "anything: a dry run checks and changes nothing"
  cr_finish
fi

# ── The values file ─────────────────────────────────────────────────────────
# The values file carries operator CIDR ranges, so what matters is that git
# cannot pick it up. It is written through its symlink, never replaced, so the
# link into the private operations checkout survives.
resolve_tfvars() {
  local link resolved
  link="${MAIL_CUTOVER_TFVARS:-$TF_DIR/terraform.tfvars}"
  if [[ ! -e "$link" ]]; then
    echo "ERROR: $link does not exist; there is no production values file to change." >&2
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

# The last assignment wins in a values file, so the last line is the one read.
# A name the file does not hold reads as empty; a file grep could not read fails.
read_scalar() {
  grep -E "^[[:space:]]*$2[[:space:]]*=" "$1" | tail -1 \
    | sed -E 's/^[^=]*=[[:space:]]*//; s/[[:space:]]*(#.*)?$//; s/^"(.*)"$/\1/' || [[ $? == 1 ]]
}

# The values file's maps are written one entry per key, each either on one line
# or over several lines ending at the closing bracket, inside a block that opens
# with `<map> = {` and closes with `}` at the start of a line. These read and
# rewrite one entry of one map on standard input, and leave every other line as
# it was.

# map_entry <map> <key>: the entry's lines as written; nothing when absent.
map_entry() {
  MAP="$1" KEY="$2" awk '
    BEGIN { map = ENVIRON["MAP"]; key = ENVIRON["KEY"] }
    !inmap && $0 ~ ("^" map "[ \t]*=[ \t]*[{][ \t]*[}]") { next }
    !inmap && $0 ~ ("^" map "[ \t]*=[ \t]*[{]") { inmap = 1; next }
    inmap && /^}/ { inmap = 0; next }
    inmap && !inentry && $0 ~ ("^[ \t]*\"" key "\"[ \t]*=") { inentry = 1 }
    inentry { print; if ($0 ~ /]/) inentry = 0 }
  '
}

# map_strings <map> <key>: the entry's strings, one per line, in order.
map_strings() {
  local entry
  entry="$(map_entry "$1" "$2")"
  [[ -n "$entry" ]] || return 0
  printf '%s\n' "$entry" | sed '1s/^[^=]*=//' \
    | { grep -oE '"[^"]*"' || [[ $? == 1 ]]; } | sed 's/^"//; s/"$//'
}

# map_put <map> <key> <line>: the entry replaced by <line>, or added before the
# map's closing brace, or the map added at the end; an empty <line> removes it.
map_put() {
  MAP="$1" KEY="$2" LINE="$3" awk '
    BEGIN { map = ENVIRON["MAP"]; key = ENVIRON["KEY"]; line = ENVIRON["LINE"] }
    !inmap && $0 ~ ("^" map "[ \t]*=[ \t]*[{][ \t]*[}]") {
      found = 1
      if (line != "") { print map " = {"; print line; print "}" } else print
      next
    }
    !inmap && $0 ~ ("^" map "[ \t]*=[ \t]*[{]") { inmap = 1; found = 1; print; next }
    inmap && !inentry && /^}/ {
      if (!placed && line != "") print line
      placed = 1; inmap = 0; print; next
    }
    inmap && !inentry && $0 ~ ("^[ \t]*\"" key "\"[ \t]*=") {
      inentry = 1
      if (line != "") print line
      placed = 1
    }
    inentry { if ($0 ~ /]/) inentry = 0; next }
    { print }
    END { if (!found && line != "") { print ""; print map " = {"; print line; print "}" } }
  '
}

# set_assignment <name> <value>: every top-level `<name> = ...` assignment, one
# line or a list over several, replaced by `<name> = <value>`, or the line added
# at the end when the file has none.
set_assignment() {
  NAME="$1" VALUE="$2" awk '
    BEGIN { name = ENVIRON["NAME"]; value = ENVIRON["VALUE"] }
    skipping { if ($0 ~ /]/) skipping = 0; next }
    $0 ~ ("^[ \t]*" name "[ \t]*=") {
      i = index($0, "=")
      print substr($0, 1, i) " " value
      done = 1
      rest = substr($0, i + 1)
      if (rest ~ /\[/ && rest !~ /]/) skipping = 1
      next
    }
    { print }
    END { if (!done) print name " = " value }
  '
}

# top_strings <name>: the strings of a top-level list assignment, one per line.
top_strings() {
  local entry
  entry="$(NAME="$1" awk '
    BEGIN { name = ENVIRON["NAME"] }
    !inside && $0 ~ ("^[ \t]*" name "[ \t]*=") { inside = 1 }
    inside { print; if ($0 ~ /]/) exit }
  ')"
  [[ -n "$entry" ]] || return 0
  printf '%s\n' "$entry" | sed '1s/^[^=]*=//' \
    | { grep -oE '"[^"]*"' || [[ $? == 1 ]]; } | sed 's/^"//; s/"$//'
}

# render_list: the strings on standard input as one HCL list.
render_list() {
  local out="" s
  while IFS= read -r s; do
    [[ -n "$s" ]] || continue
    out="${out:+${out}, }\"${s}\""
  done
  printf '[%s]' "$out"
}

# A string that would break out of its quotes is never written: every string
# here is a DNS value, and none legitimately carries a quote or a backslash.
writable_strings() {
  ! grep -q '["\\]' <<< "$1"
}

# One sorted set per list, so two lists compare whatever order they were written in.
as_set() { printf '%s\n' "$1" | sed '/^$/d' | LC_ALL=C sort -u; }
mx_set() { printf '%s\n' "$1" | sed '/^$/d' | tr '[:upper:]' '[:lower:]' | sed -E 's/\.?$/./' | LC_ALL=C sort -u; }
ns_set() { printf '%s\n' "$1" | sed '/^$/d' | tr '[:upper:]' '[:lower:]' | sed -E 's/\.$//' | LC_ALL=C sort -u; }
last_line() { grep -v '^[[:space:]]*$' <<< "$1" | tail -n 1 || [[ $? == 1 ]]; }

TFVARS_PATH="$(resolve_tfvars)" || cr_die "there is no production values file this run can change (the reason is printed above)"

echo "== Mail-domain cutover, stage $STAGE: $TARGET =="
echo ""
echo "values file: $TFVARS_PATH"
echo ""

# Every check below reads JSON. Without a parser they would read as empty, and an
# empty answer must never pass for a clean one.
if ! command -v jq >/dev/null 2>&1; then
  cr_error "REFUSING: jq is not installed, so the plan cannot be checked."
  exit 1
fi
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
aws_profile_ensure || cr_die "no AWS identity to plan and apply production with (the reason is printed above)"

VALUES_TMP=""
VALUES_BACKUP=""
VALUES_CHANGED=0
TF_PLAN=""
APPLY_STARTED=0
PLAN_EMPTY=0
SETTLED=0

# A values file left holding a stage's change after a stop before its apply
# would be applied by the next routine apply, unchecked. So this run's own write
# is undone, and only this run's: from the apply on, the change is on AWS and
# the values file must keep saying so.
settle() {
  SETTLED=1
  if (( ! APPLY_STARTED )) && [[ -n "$VALUES_BACKUP" && -f "$VALUES_BACKUP" ]]; then
    cat "$VALUES_BACKUP" > "$TFVARS_PATH"
    echo "" >&2
    echo "The values file is restored to what it held before this run. Nothing was applied." >&2
  elif (( APPLY_STARTED )); then
    echo "" >&2
    echo "The apply had started, so the values file keeps the change. Re-run the same" >&2
    echo "stage to finish it: it applies what is left and checks again." >&2
  fi
}

# stop: the run's error is already recorded; settle and end.
stop() {
  settle
  exit 1
}

# Any run that ends non-zero without having settled: an interrupt, or a command
# failing under errexit. Registered after cleanup_files, so it runs first, while
# the backup it restores from still exists.
on_unfinished_exit() {
  local status
  status="$(cr_exit_status)"
  (( status != 0 && ! SETTLED )) || return 0
  [[ -n "$VALUES_BACKUP" ]] || (( APPLY_STARTED )) || return 0
  settle
}
cleanup_files() {
  if [[ -n "$TF_PLAN" && -e "$TF_PLAN" ]]; then shred -u "$TF_PLAN" 2>/dev/null || rm -f "$TF_PLAN"; fi
  rm -f "${VALUES_TMP:-}" "${VALUES_BACKUP:-}"
}
cr_cleanup cleanup_files
cr_cleanup on_unfinished_exit

VALUES_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-mail-cutover-tfvars.XXXXXX")"
chmod 600 "$VALUES_TMP"

# propose_values: VALUES_TMP holds the stage's values file. Shows the change,
# asks for it, and writes it through the symlink, keeping a backup for a stop.
propose_values() {
  local what="$1"
  if cmp -s "$TFVARS_PATH" "$VALUES_TMP"; then
    echo "  The values file already holds this change; leaving it alone."
    VALUES_CHANGED=0
    return 0
  fi
  VALUES_CHANGED=1
  echo ""
  # diff exits 1 for a difference, which is the case here; 2 is trouble.
  diff -u "$TFVARS_PATH" "$VALUES_TMP" || [[ $? == 1 ]] \
    || cr_die "the values-file change could not be shown, so it is not confirmed; nothing changed."
  echo ""
  echo "$what"
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to write this change to the values file: " "APPLY"; then
    cr_error "Aborted: nothing changed."
    exit 1
  fi
  # Mode 600, like the file it copies: the values file carries operator CIDRs.
  VALUES_BACKUP="$(mktemp "${TMPDIR:-/tmp}/footbag-mail-cutover-backup.XXXXXX")"
  chmod 600 "$VALUES_BACKUP"
  cat "$TFVARS_PATH" > "$VALUES_BACKUP"
  cat "$VALUES_TMP" > "$TFVARS_PATH"
  echo "  Values file written."
}

# plan_and_apply <expected changes> <expected moves> <what the apply does>
#
# Each expected change is "<address> <actions>", each move "<from> -> <to>", one
# per line. A plan carrying anything else is refused. A plan missing part of the
# stage's change is refused when this run wrote the values file; when the values
# file already held the change, the remainder of an apply that stopped part way
# is accepted, so a re-run finishes the work. An empty plan applies nothing.
plan_and_apply() {
  local want_changes="$1" want_moves="$2" what="$3" plan_json changes moves
  local unexpected missing
  echo ""
  echo "-- terraform plan --"
  # A saved plan, so what is applied is what was checked and shown. Mode 600,
  # shredded on every exit path, in a literal directory the caller's environment
  # cannot redirect into a checkout: a saved plan is an archive that can carry
  # live values.
  TF_PLAN="$(mktemp /tmp/footbag-mail-cutover-plan.XXXXXX)"
  chmod 600 "$TF_PLAN"
  if ! "$TF_BIN" -chdir="$TF_DIR" plan -input=false -out="$TF_PLAN"; then
    cr_error "terraform plan failed (its own lines above say why). Nothing was applied."
    stop
  fi
  plan_json=""
  if ! plan_json="$("$TF_BIN" -chdir="$TF_DIR" show -json "$TF_PLAN" 2>&1)"; then
    # The JSON is withheld from the report: a plan can carry live values.
    cr_error "REFUSING: could not read the plan as JSON, so it cannot be checked. Nothing was applied."
    stop
  fi
  if ! changes="$(printf '%s' "$plan_json" | jq -r '
      .resource_changes[]?
      | select(.change.actions != ["no-op"] and .change.actions != ["read"])
      | "\(.address) \(.change.actions | join(","))"')" \
     || ! moves="$(printf '%s' "$plan_json" | jq -r '
      .resource_changes[]?
      | select(.previous_address != null)
      | "\(.previous_address) -> \(.address)"')"; then
    cr_error "REFUSING: the plan JSON did not parse, so it cannot be checked. Nothing was applied."
    stop
  fi
  changes="$(as_set "$changes")"
  moves="$(as_set "$moves")"

  unexpected="$(LC_ALL=C comm -23 <(printf '%s\n' "$changes" | sed '/^$/d') <(as_set "$want_changes"))
$(LC_ALL=C comm -23 <(printf '%s\n' "$moves" | sed '/^$/d') <(as_set "$want_moves"))"
  missing="$(LC_ALL=C comm -13 <(printf '%s\n' "$changes" | sed '/^$/d') <(as_set "$want_changes"))
$(LC_ALL=C comm -13 <(printf '%s\n' "$moves" | sed '/^$/d') <(as_set "$want_moves"))"
  unexpected="$(as_set "$unexpected")"
  missing="$(as_set "$missing")"

  if [[ -n "$unexpected" ]]; then
    cr_error "REFUSING: the plan carries changes beyond stage $STAGE: $(paste -sd ',' - <<< "$unexpected" | sed 's/,/, /g')"
    printf '%s\n' "$unexpected" | sed 's/^/  /' >&2
    echo "  Apply those on their own first, through scripts/terraform-apply.sh. Nothing was applied." >&2
    stop
  fi
  if [[ -z "$changes" && -z "$moves" ]]; then
    if (( VALUES_CHANGED )); then
      cr_error "REFUSING: the values change produced an empty plan, so this tree does not carry stage $STAGE. Nothing was applied."
      stop
    fi
    PLAN_EMPTY=1
    echo "  The plan is empty: Terraform already holds this change."
    return 0
  fi
  if [[ -n "$missing" ]] && (( VALUES_CHANGED )); then
    cr_error "REFUSING: the plan does not carry all of stage $STAGE; missing: $(paste -sd ',' - <<< "$missing" | sed 's/,/, /g')"
    printf '%s\n' "$missing" | sed 's/^/  /' >&2
    echo "  Check the values file and the tree. Nothing was applied." >&2
    stop
  fi
  echo ""
  echo "$what"
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to apply this plan: " "APPLY"; then
    cr_error "Aborted before the apply."
    stop
  fi
  APPLY_STARTED=1
  if ! "$TF_BIN" -chdir="$TF_DIR" apply -input=false "$TF_PLAN"; then
    cr_error "terraform apply failed (its own lines above say why)."
    stop
  fi
}

# ── DNS reads ───────────────────────────────────────────────────────────────
# ask_dns <server> <name> <type> <authoritative 0|1>: sets DNS_ANSWER to the
# answer's values, one per line, or DNS_SAID to why it could not be asked. A
# variable rather than printed output, so the reason survives the call.
DNS_ANSWER=""
DNS_SAID=""
ask_dns() {
  local server="$1" name="$2" rtype="$3" authoritative="$4" out status=0 rec="+rec"
  DNS_ANSWER=""
  DNS_SAID=""
  # The nameserver is asked without recursion, so it answers from its own zone,
  # and must say the answer is authoritative; a resolver is asked as the world
  # asks it.
  (( authoritative )) && rec="+norec"
  out="$("$DIG_BIN" "$rec" +noall +comments +answer +tries=3 +time=3 "@${server}" "$name" "$rtype" 2>&1)" || status=$?
  if (( status != 0 )); then
    DNS_SAID="dig exit ${status}: $(last_line "$out")"
    return 1
  fi
  if (( authoritative )) && ! grep -qE 'flags:[^;]* aa' <<< "$out"; then
    DNS_SAID="${server} did not answer ${name} ${rtype} authoritatively"
    return 1
  fi
  DNS_ANSWER="$(printf '%s\n' "$out" | sed -E '/^[[:space:]]*;/d; /^[[:space:]]*$/d; s/[[:space:]]+/ /g' | cut -d' ' -f5-)"
}
# A TXT answer's value, its quoted chunks joined, one string per line.
txt_values() { printf '%s\n' "$1" | sed '/^$/d' | sed -E 's/" "//g; s/^"//; s/"$//'; }

ZONE_NAMESERVERS=""
NAMESERVER=""
read_zone_nameservers() {
  if ! tf_output_read "$TF_DIR" route53_name_servers --json; then
    cr_error "REFUSING: could not read the zone's name servers from Terraform: ${TF_OUTPUT_ERROR}"
    exit 1
  fi
  ZONE_NAMESERVERS="$(ns_set "$(jq -r '.[]?' <<< "$TF_OUTPUT_VALUE" 2>/dev/null || true)")"
  if [[ -z "$ZONE_NAMESERVERS" ]]; then
    cr_error "REFUSING: Terraform reports no name servers for the $DOMAIN zone."
    exit 1
  fi
  NAMESERVER="$(head -n 1 <<< "$ZONE_NAMESERVERS")"
}

# The registry delegates the domain to the zone when the world, asking a public
# resolver, is handed exactly the zone's own name servers.
require_delegation() {
  if ! ask_dns "$RESOLVER" "$DOMAIN" NS 0; then
    cr_error "REFUSING: could not ask $RESOLVER who serves $DOMAIN: ${DNS_SAID}. Nothing was changed."
    exit 1
  fi
  if [[ "$(ns_set "$DNS_ANSWER")" != "$ZONE_NAMESERVERS" ]]; then
    cr_error "REFUSING: $DOMAIN is not yet delegated to the Route 53 zone; $RESOLVER names $(ns_set "$DNS_ANSWER" | paste -sd ' ' -). Nothing was changed."
    exit 1
  fi
  echo "  $DOMAIN is delegated to the Route 53 zone ($RESOLVER agrees)."
}

# ── When the mail-day apply happened ────────────────────────────────────────
# Recorded beside the cutover log in the private operations checkout, one file
# per apply, so a later apply after a revert never overwrites an earlier one.
RECORD_DIR="${MAIL_CUTOVER_RECORD_DIR:-$REPO_ROOT/footbag_private_repo/cutover}"
# The newest record's epoch seconds, or nothing when none exists.
mail_day_applied_epoch() {
  local files=() newest
  if [[ -d "$RECORD_DIR" ]]; then
    shopt -s nullglob
    files=("$RECORD_DIR"/mail-day-applied.*.txt)
    shopt -u nullglob
  fi
  (( ${#files[@]} > 0 )) || return 0
  newest="${files[${#files[@]}-1]}"
  sed -nE 's/^applied_at_epoch=([0-9]+)$/\1/p' "$newest" | tail -n 1
}
record_mail_day_applied() {
  local epoch iso name
  # One clock read for all three, so the name, the time and the epoch agree.
  read -r epoch iso name < <(date -u '+%s %Y-%m-%dT%H:%M:%SZ %Y-%m-%dT%H%M%SZ')
  printf 'applied_at=%s\napplied_at_epoch=%s\n' "$iso" "$epoch" \
    > "$RECORD_DIR/mail-day-applied.${name}.txt"
}

# The served-records verdict, with this run's dig in front when a seam names one.
run_verifier() {
  if [[ -n "${MAIL_CUTOVER_DIG_BIN:-}" ]]; then
    FOOTBAG_DIG_BIN="$DIG_BIN" bash "$VERIFY_CMD" "$@"
  else
    bash "$VERIFY_CMD" "$@"
  fi
}

IFPA_IN_LEGACY_MX="$(map_entry legacy_mirror_mx_records ifpa < "$TFVARS_PATH")"
IFPA_IN_LEGACY_TXT="$(map_entry legacy_mirror_txt_records ifpa < "$TFVARS_PATH")"
IFPA_IN_WORKSPACE_MX="$(map_entry workspace_mx_records ifpa < "$TFVARS_PATH")"
IFPA_IN_WORKSPACE_TXT="$(map_entry workspace_txt_records ifpa < "$TFVARS_PATH")"

require_ifpa_moved() {
  if [[ -n "$IFPA_IN_LEGACY_MX$IFPA_IN_LEGACY_TXT" || -z "$IFPA_IN_WORKSPACE_MX" || -z "$IFPA_IN_WORKSPACE_TXT" ]]; then
    cr_error "REFUSING: the ifpa records are not yet in the Workspace maps alone. Run --stage ifpa-move first. Nothing was changed."
    exit 1
  fi
}

# ── Stages ──────────────────────────────────────────────────────────────────
stage_ifpa_move() {
  local route53="$TF_DIR/route53.tf" mx txt
  # The rename is a move in state only because the tree declares it; without the
  # blocks the plan would delete the records and create them again.
  if ! grep -qF 'from = aws_route53_record.legacy_mirror_mx["ifpa"]' "$route53" \
     || ! grep -qF 'from = aws_route53_record.legacy_mirror_txt["ifpa"]' "$route53"; then
    cr_error "REFUSING: $route53 does not carry the two ifpa moved blocks, so this checkout cannot rename the records in state. Update the checkout. Nothing was changed."
    exit 1
  fi
  if [[ -n "$IFPA_IN_LEGACY_MX$IFPA_IN_LEGACY_TXT" && -n "$IFPA_IN_WORKSPACE_MX$IFPA_IN_WORKSPACE_TXT" ]]; then
    cr_error "REFUSING: the values file declares ifpa in both the legacy-mirror and the Workspace maps, so the records would be declared twice. Nothing was changed."
    exit 1
  fi
  if [[ -z "$IFPA_IN_LEGACY_MX$IFPA_IN_LEGACY_TXT$IFPA_IN_WORKSPACE_MX$IFPA_IN_WORKSPACE_TXT" ]]; then
    cr_error "REFUSING: the values file declares no ifpa mail records in either map, so there is nothing to move and the domain's mail routing would be missing. Nothing was changed."
    exit 1
  fi
  if [[ -n "$IFPA_IN_LEGACY_MX$IFPA_IN_LEGACY_TXT" ]]; then
    if [[ -z "$IFPA_IN_LEGACY_MX" || -z "$IFPA_IN_LEGACY_TXT" ]]; then
      cr_error "REFUSING: the values file declares only one of the ifpa mail routing and text records in the legacy-mirror maps. Nothing was changed."
      exit 1
    fi
    mx="$(map_strings legacy_mirror_mx_records ifpa < "$TFVARS_PATH")"
    txt="$(map_strings legacy_mirror_txt_records ifpa < "$TFVARS_PATH")"
    if [[ -z "$mx" || -z "$txt" ]]; then
      cr_error "REFUSING: an ifpa entry in the legacy-mirror maps lists no records. Nothing was changed."
      exit 1
    fi
    map_put legacy_mirror_mx_records ifpa "" < "$TFVARS_PATH" \
      | map_put legacy_mirror_txt_records ifpa "" \
      | map_put workspace_mx_records ifpa "  \"ifpa\" = $(render_list <<< "$mx")" \
      | map_put workspace_txt_records ifpa "  \"ifpa\" = $(render_list <<< "$txt")" \
      > "$VALUES_TMP"
  else
    if [[ -z "$IFPA_IN_WORKSPACE_MX" || -z "$IFPA_IN_WORKSPACE_TXT" ]]; then
      cr_error "REFUSING: the values file declares only one of the ifpa mail routing and text records in the Workspace maps. Nothing was changed."
      exit 1
    fi
    cat "$TFVARS_PATH" > "$VALUES_TMP"
  fi
  propose_values "This moves the ifpa mail routing and text records into the Workspace maps, values unchanged, so the launch apply that clears the legacy mirror leaves them."
  plan_and_apply "" \
    $'aws_route53_record.legacy_mirror_mx["ifpa"] -> aws_route53_record.workspace_mx["ifpa"]\naws_route53_record.legacy_mirror_txt["ifpa"] -> aws_route53_record.workspace_txt["ifpa"]' \
    "The plan renames the two ifpa records in state. No record changes."
  if (( PLAN_EMPTY )); then
    echo ""
    echo "Already done: the values file and Terraform's state hold the ifpa records in the Workspace maps. Nothing was changed."
    cr_proved "the ifpa mail routing and text records are in the Workspace maps, in the values file and in state"
  else
    cr_proved "the ifpa mail routing and text records moved into the Workspace maps by a rename in state, with no record changed"
  fi
}

stage_ifpa_verify() {
  local mx txt server served want_mx failed=0
  require_ifpa_moved
  read_zone_nameservers
  require_delegation
  mx="$(map_strings workspace_mx_records ifpa < "$TFVARS_PATH")"
  txt="$(map_strings workspace_txt_records ifpa < "$TFVARS_PATH")"
  if [[ "$(mx_set "$mx")" == "$(mx_set "$GOOGLE_MX")" ]]; then
    cr_error "REFUSING: the ifpa mail already routes to Google, so the mail-day stage has run; the verification token belongs before it. Nothing was changed."
    exit 1
  fi
  # The zone must serve what the values file says, or the apply would also
  # change something the operator has not seen.
  if ! ask_dns "$NAMESERVER" "$IFPA_NAME" MX 1; then
    cr_error "REFUSING: could not read $IFPA_NAME MX from $NAMESERVER: ${DNS_SAID}. Nothing was changed."
    exit 1
  fi
  if [[ "$(mx_set "$DNS_ANSWER")" != "$(mx_set "$mx")" ]]; then
    cr_error "REFUSING: $NAMESERVER serves $IFPA_NAME MX as '$(mx_set "$DNS_ANSWER" | paste -sd ',' -)' but the values file holds '$(mx_set "$mx" | paste -sd ',' -)'. Nothing was changed."
    exit 1
  fi
  if ! ask_dns "$NAMESERVER" "$IFPA_NAME" TXT 1; then
    cr_error "REFUSING: could not read $IFPA_NAME TXT from $NAMESERVER: ${DNS_SAID}. Nothing was changed."
    exit 1
  fi
  if [[ "$(as_set "$(txt_values "$DNS_ANSWER")")" != "$(as_set "$txt")" ]]; then
    cr_error "REFUSING: $NAMESERVER serves $IFPA_NAME TXT differently from the values file. Nothing was changed."
    txt_values "$DNS_ANSWER" | sed 's/^/  served:      /' >&2
    printf '%s\n' "$txt" | sed 's/^/  values file: /' >&2
    exit 1
  fi
  echo "  $NAMESERVER serves the ifpa records the values file holds."

  if grep -qxF "$TOKEN" <<< "$txt"; then
    cat "$TFVARS_PATH" > "$VALUES_TMP"
  elif grep -q '^google-site-verification=' <<< "$txt"; then
    cr_error "REFUSING: the ifpa text records already carry a different verification token. Remove it on Google's word, not here. Nothing was changed."
    exit 1
  else
    map_put workspace_txt_records ifpa "  \"ifpa\" = $(printf '%s\n%s\n' "$txt" "$TOKEN" | render_list)" \
      < "$TFVARS_PATH" > "$VALUES_TMP"
  fi
  propose_values "This adds Google's verification token to the ifpa text records. Its mail still routes to the legacy host."
  plan_and_apply 'aws_route53_record.workspace_txt["ifpa"] update' "" \
    "The plan updates the ifpa text records, adding the token. Nothing else."
  (( PLAN_EMPTY )) && echo "Already applied; checking what is served."

  echo ""
  echo "-- what is served --"
  want_mx="$(mx_set "$mx")"
  for server in "$NAMESERVER" "$RESOLVER"; do
    local authoritative=0
    [[ "$server" == "$NAMESERVER" ]] && authoritative=1
    if ! ask_dns "$server" "$IFPA_NAME" TXT "$authoritative"; then
      cr_error "could not read $IFPA_NAME TXT from $server: ${DNS_SAID}"
      failed=1
      continue
    fi
    served="$(txt_values "$DNS_ANSWER")"
    if ! grep -qxF "$TOKEN" <<< "$served"; then
      cr_error "$server does not serve the verification token at $IFPA_NAME yet. If the nameserver passed, this is propagation: re-run this stage later, which applies nothing more and checks again."
      failed=1
    fi
    if ! ask_dns "$server" "$IFPA_NAME" MX "$authoritative"; then
      cr_error "could not read $IFPA_NAME MX from $server: ${DNS_SAID}"
      failed=1
      continue
    fi
    if [[ "$(mx_set "$DNS_ANSWER")" != "$want_mx" ]]; then
      cr_error "$server does not route $IFPA_NAME mail to the legacy host as the values file holds."
      failed=1
    fi
  done
  if (( ! failed )); then
    cr_proved "$NAMESERVER and $RESOLVER serve the verification token at $IFPA_NAME, with its mail still routed to the legacy host"
    echo ""
    echo "Next: the IFPA secretary verifies ifpa.footbag.org in the Google Admin console."
  fi
}

stage_mail_day() {
  local alias_flag txt tokens token live_other current_other
  alias_flag="$(read_scalar "$TFVARS_PATH" enable_apex_alias_records)" \
    || cr_die "could not read enable_apex_alias_records from $TFVARS_PATH"
  # The mail apply is the next apply after the web switch, never the same one:
  # the switch must already be in the values file, and the plan check refuses it
  # if it is not yet applied.
  if [[ "$alias_flag" != "true" ]]; then
    cr_error "REFUSING: enable_apex_alias_records is '${alias_flag:-<absent>}', so the web switch has not run. The mail apply follows it, in a later apply. Nothing was changed."
    exit 1
  fi
  require_ifpa_moved
  txt="$(map_strings workspace_txt_records ifpa < "$TFVARS_PATH")"
  tokens="$(grep '^google-site-verification=' <<< "$txt" || [[ $? == 1 ]])"
  if [[ -z "$tokens" || "$(wc -l <<< "$tokens")" -ne 1 ]]; then
    cr_error "REFUSING: the ifpa text records must carry exactly one verification token, which --stage ifpa-verify adds. Nothing was changed."
    exit 1
  fi
  token="$tokens"
  read_zone_nameservers
  require_delegation
  if [[ ! -d "$RECORD_DIR" || ! -w "$RECORD_DIR" ]]; then
    cr_error "REFUSING: there is no writable cutover directory at $RECORD_DIR to record the apply time in, which the alert stage waits on. Nothing was changed."
    exit 1
  fi

  # Every apex text string the zone serves besides the sender policy, because the
  # apply rewrites the whole set and deletes any string it is not told about.
  if ! ask_dns "$NAMESERVER" "$DOMAIN" TXT 1; then
    cr_error "REFUSING: could not read the apex text records from $NAMESERVER: ${DNS_SAID}. Nothing was changed."
    exit 1
  fi
  live_other="$(txt_values "$DNS_ANSWER" | { grep -v '^v=spf1' || [[ $? == 1 ]]; })"
  if [[ -z "$live_other" ]]; then
    cr_error "REFUSING: the apex serves no text string besides its sender policy, not even the domain verification token; read the zone before the mail apply. Nothing was changed."
    exit 1
  fi
  if ! writable_strings "$live_other"; then
    cr_error "REFUSING: an apex text string carries a quote or a backslash, which this script will not write. Nothing was changed."
    exit 1
  fi
  current_other="$(top_strings apex_txt_records < "$TFVARS_PATH")"

  {
    if [[ "$(as_set "$live_other")" == "$(as_set "$current_other")" ]]; then
      cat "$TFVARS_PATH"
    else
      set_assignment apex_txt_records "$(render_list <<< "$live_other")" < "$TFVARS_PATH"
    fi
  } | set_assignment ses_enable_mail_records true \
    | map_put workspace_mx_records ifpa "  \"ifpa\" = $(render_list <<< "$GOOGLE_MX")" \
    | map_put workspace_txt_records ifpa "  \"ifpa\" = $(printf '%s\n%s\n' "$token" "$IFPA_GOOGLE_SPF" | render_list)" \
    > "$VALUES_TMP"

  if ! cmp -s "$TFVARS_PATH" "$VALUES_TMP"; then
    echo ""
    echo "Before the mail records move: Gmail must be on for footbag.org and"
    echo "ifpa.footbag.org, every inside test must have arrived on Google, and the"
    echo "admin@ certificate test must have bounced with no reader receiving it."
    echo "This script cannot see any of those."
    if ! confirm_from_tty "Type 'APPLY' if all three passed and are in the cutover log: " "APPLY"; then
      cr_error "Aborted: the inside checks are not confirmed. Nothing changed."
      exit 1
    fi
  fi
  propose_values "This turns on the apex mail records and routes the IFPA list domain to Google. Inbound mail moves to Google in the apply."
  plan_and_apply \
    $'aws_ses_domain_mail_from.main[0] create\naws_route53_record.ses_mail_from_mx[0] create\naws_route53_record.ses_mail_from_spf[0] create\naws_route53_record.dmarc[0] create\naws_route53_record.spf[0] update\naws_route53_record.mx[0] update\naws_route53_record.workspace_mx["ifpa"] update\naws_route53_record.workspace_txt["ifpa"] update' \
    "" \
    "The plan publishes the mail-day records: the apex mail routing to Google, the sender policy naming SES and Google, the reporting policy, the bounce-domain records, and the IFPA list domain's routing and sender policy. Nothing else."
  if (( ! PLAN_EMPTY )); then
    record_mail_day_applied
    cr_proved "the mail-day records are applied, and the apply time is recorded in $RECORD_DIR"
  elif [[ -z "$(mail_day_applied_epoch)" ]]; then
    # An apply this script cannot date is recorded as now, which can only make
    # the alert stage wait longer than it needs to, never less.
    record_mail_day_applied
    echo "  No record of when the mail-day apply ran; recorded now, so the alert stage waits from now."
  fi

  echo ""
  echo "-- what is served --"
  if run_verifier --stage mail-day --nameserver "$NAMESERVER" --resolver "$RESOLVER" --tfvars "$TFVARS_PATH"; then
    cr_proved "verify-mail-records.sh --stage mail-day passed on $NAMESERVER and $RESOLVER"
    echo ""
    echo "Next, no sooner than $ALERT_WAIT_SECONDS seconds after the apply: the outside tests, and"
    echo "  bash scripts/mail-domain-cutover.sh --target production --stage ops-alert --address ops-alert@footbag.org"
  else
    cr_error "the served mail records do not all pass yet. If only the resolver failed, that is propagation: re-run this stage later, which applies nothing more and checks again."
  fi
}

stage_ops_alert() {
  local mail_flag current applied now elapsed
  mail_flag="$(read_scalar "$TFVARS_PATH" ses_enable_mail_records)" \
    || cr_die "could not read ses_enable_mail_records from $TFVARS_PATH"
  if [[ "$mail_flag" != "true" ]]; then
    cr_error "REFUSING: ses_enable_mail_records is '${mail_flag:-<absent>}', so mail to $ADDRESS still goes to the legacy host and its confirmation would never arrive. Run --stage mail-day first. Nothing was changed."
    exit 1
  fi
  current="$(read_scalar "$TFVARS_PATH" ops_alert_email)" \
    || cr_die "could not read ops_alert_email from $TFVARS_PATH"
  if [[ -n "$current" && "$current" != "$ADDRESS" ]]; then
    cr_error "REFUSING: ops_alert_email is already set to '$current'. This stage sets it once; it does not change it. Nothing was changed."
    exit 1
  fi
  if [[ "$current" != "$ADDRESS" ]]; then
    applied="$(mail_day_applied_epoch)"
    if [[ -z "$applied" ]]; then
      cr_error "REFUSING: there is no record in $RECORD_DIR of when the mail-day apply ran, so the wait cannot be counted. Re-run --stage mail-day, which records it. Nothing was changed."
      exit 1
    fi
    now="$(date -u +%s)"
    elapsed=$(( now - applied ))
    if (( elapsed < ALERT_WAIT_SECONDS )); then
      cr_error "REFUSING: the mail-day apply ran $elapsed seconds ago; $(( ALERT_WAIT_SECONDS - elapsed )) seconds remain before a confirmation is sure to reach Google. Nothing was changed."
      exit 1
    fi
    echo "  The mail-day apply ran $elapsed seconds ago."
  fi
  set_assignment ops_alert_email "\"$ADDRESS\"" < "$TFVARS_PATH" > "$VALUES_TMP"
  propose_values "This subscribes $ADDRESS to the critical alarm topic and the us-west-2 Health topic. Each subscription sends it a confirmation email."
  plan_and_apply \
    $'aws_sns_topic_subscription.alarm_ops_alert[0] create\naws_sns_topic_subscription.alarm_ops_alert_us_west_2[0] create' \
    "" \
    "The plan creates the alert group's two subscriptions. Nothing else."
  if (( PLAN_EMPTY )); then
    cr_proved "$ADDRESS is already subscribed in the values file and in Terraform's state"
  else
    cr_proved "$ADDRESS is subscribed to the critical and us-west-2 topics, pending its confirmations"
  fi
  echo ""
  echo "Next: confirm each subscription with the link from its confirmation email, then"
  echo "send one test alarm to each topic and record every watcher's receipt:"
  echo "  bash scripts/confirm-alarm-subscription.sh --target production"
  echo "  bash scripts/send-test-alarm.sh --target production --alarm <critical alarm name>"
  echo "  bash scripts/send-test-alarm.sh --target production --region us-west-2 \\"
  echo "    --alarm footbag-production-snapshots-hourly-replication-stopped"
}

stage_revert() {
  local mirror_flag alert
  mirror_flag="$(read_scalar "$TFVARS_PATH" enable_legacy_mirror_records)" \
    || cr_die "could not read enable_legacy_mirror_records from $TFVARS_PATH"
  # With the mirror off there is nothing to restore: turning the mail flag off
  # then deletes the apex mail routing and text records outright.
  if [[ "$mirror_flag" != "true" ]]; then
    cr_error "REFUSING: enable_legacy_mirror_records is '${mirror_flag:-<absent>}', so turning the mail records off would delete the apex mail routing and text records instead of restoring the legacy ones. Fix forward on Google. Nothing was changed."
    exit 1
  fi
  read_zone_nameservers
  set_assignment ses_enable_mail_records false < "$TFVARS_PATH" > "$VALUES_TMP"
  propose_values "This turns the apex mail records off, restoring the legacy mail routing and sender policy. The IFPA list domain stays on Google."
  plan_and_apply \
    $'aws_ses_domain_mail_from.main[0] delete\naws_route53_record.ses_mail_from_mx[0] delete\naws_route53_record.ses_mail_from_spf[0] delete\naws_route53_record.dmarc[0] delete\naws_route53_record.spf[0] update\naws_route53_record.mx[0] update' \
    "" \
    "The plan restores the legacy apex mail routing and sender policy, and removes the reporting policy and the bounce-domain records. Nothing else."
  (( PLAN_EMPTY )) && echo "Already reverted; checking what is served."
  echo ""
  echo "-- what is served --"
  if run_verifier --stage rollback --nameserver "$NAMESERVER" --resolver "$RESOLVER" --tfvars "$TFVARS_PATH"; then
    cr_proved "verify-mail-records.sh --stage rollback passed on $NAMESERVER and $RESOLVER"
  else
    cr_error "the served records do not show the revert yet. If only the resolver failed, that is propagation: re-run this stage later, which applies nothing more and checks again."
  fi
  alert="$(read_scalar "$TFVARS_PATH" ops_alert_email)" || alert=""
  if [[ -n "$alert" ]]; then
    cr_warn "ops_alert_email is $alert, whose mail now goes to the legacy host, so the alert group receives no alarm mail until the mail records move forward again; the account mailbox still receives every alarm"
  fi
  echo ""
  echo "The IFPA secretary sets the group reply setting back to Reply to author on"
  echo "the groups the go-live plan names, while mail is on the legacy host."
}

case "$STAGE" in
  ifpa-move)   stage_ifpa_move ;;
  ifpa-verify) stage_ifpa_verify ;;
  mail-day)    stage_mail_day ;;
  ops-alert)   stage_ops_alert ;;
  revert)      stage_revert ;;
esac
SETTLED=1
cr_finish
