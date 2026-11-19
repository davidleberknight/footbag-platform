#!/usr/bin/env bash
# add-apex-txt-token.sh -- publish a provider's domain-verification token in the
# footbag.org apex TXT set, through Terraform, and prove Route 53 holds it.
#
# Search Console and Postmaster Tools each prove ownership of footbag.org with a
# string in the apex TXT record set. In the production tree one record owns that
# whole set: the SPF string plus every string in apex_txt_records in the values
# file. A token typed into the Route 53 console is destroyed by the next apply of
# that record, and a token typed into the values file by hand skips the check
# that the file still lists every string the zone serves, so the apply that
# publishes it can silently drop another provider's token. This script is the
# whole operation.
#
# What it does, in order:
#   1. Reads the hosted zone id from Terraform's outputs and the apex TXT set
#      from Route 53 itself.
#   2. Compares the strings Route 53 serves, other than SPF, with
#      apex_txt_records in the values file.
#   3. Shows the values-file change, asks for a typed APPLY, and writes it
#      through the symlink.
#   4. Applies through scripts/terraform-apply.sh --dns-records-only, which
#      refuses any change that is not a Route 53 record created or updated in
#      place, and asks for its own typed APPLY.
#   5. Reads the apex TXT set back from Route 53 and passes only when the token
#      is in it.
#
# What it refuses to do:
#   - Run against anything but production, the only tree that holds the zone.
#   - Write anything when the values file and Route 53 disagree about the apex
#     strings: the apply would publish the file's list and drop whatever the
#     zone serves beyond it.
#   - Publish a token that is empty, longer than one TXT string (255
#     characters), carries a quote or a backslash, or is an SPF string; or a
#     Search Console token without Google's google-site-verification= prefix.
#   - Remove or replace a token. Changing which providers are verified is a
#     decision for a person reading their own plan.
#   - Run before footbag.org is delegated to the Route 53 zone. Until then the
#     zone must answer exactly what the legacy zone does, and the mirror check
#     that releases the nameserver change reads an extra apex string as a
#     difference; the provider's own Verify cannot succeed before it either.
#   - Touch the registrar or the delegation.
#
# A re-run with the token already published changes nothing and says so. A re-run
# after a stop between the values-file write and the apply finds the file
# holding exactly the token beyond what Route 53 serves, and applies it.
#
# Usage:
#   bash scripts/add-apex-txt-token.sh --target production \
#        --provider search-console --token "google-site-verification=<value>"
#   bash scripts/add-apex-txt-token.sh --target production \
#        --provider postmaster --token "<the TXT value Postmaster Tools shows>"
#
#   --target    production. Required, with no default.
#   --provider  search-console or postmaster: whose token this is. Required.
#   --token     the whole TXT string the provider shows. Required. A
#               verification token is public, so it may be given on the command
#               line.
#
# Exits 0 when Route 53 serves the token in the apex TXT set. 2 when an argument
# is refused; 1 when a precondition is refused, a confirmation is declined, the
# apply does not complete, or the read-back does not find the token.
#
# Test seams (CI only; operators never set these), each announced on stderr:
# ADD_APEX_TXT_AWS_BIN replaces the AWS CLI for the Route 53 reads,
# ADD_APEX_TXT_DIG_BIN replaces dig for the delegation check,
# ADD_APEX_TXT_TFVARS replaces the values file, and ADD_APEX_TXT_APPLY_CMD
# replaces scripts/terraform-apply.sh. TF_OUTPUT_BIN passes through to the
# output read and announces itself.

set -euo pipefail

TARGET=""
PROVIDER=""
TOKEN=""

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"
# shellcheck source=lib/tfvars-list.sh
source "${REPO_ROOT}/scripts/lib/tfvars-list.sh"

DOMAIN="footbag.org"
LIST_NAME="apex_txt_records"
# One character-string in a TXT record holds at most 255 octets, and the values
# file carries each token as one string.
MAX_TOKEN_LENGTH=255

# The public resolver the delegation is judged by: it answers as the world does.
RESOLVER="8.8.8.8"

AWS_BIN="${ADD_APEX_TXT_AWS_BIN:-aws}"
DIG_BIN="${ADD_APEX_TXT_DIG_BIN:-dig}"
APPLY_CMD="${ADD_APEX_TXT_APPLY_CMD:-$REPO_ROOT/scripts/terraform-apply.sh}"
for seam in ADD_APEX_TXT_AWS_BIN ADD_APEX_TXT_DIG_BIN ADD_APEX_TXT_TFVARS ADD_APEX_TXT_APPLY_CMD; do
  if [[ -n "${!seam:-}" ]]; then
    echo "SYNTHETIC: ${seam}='${!seam}' -- this run proves nothing about the estate." >&2
  fi
done

usage() {
  # Bounded by the first `set -eu` rather than a line number, so editing the
  # header cannot silently truncate the help text.
  sed -n '2,/^set -eu/{/^set -eu/d;p;}' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)   TARGET="${2:-}";   shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --provider) PROVIDER="${2:-}"; shift 2 || { cr_error "--provider requires an argument"; exit 2; } ;;
    --token)    TOKEN="${2:-}";    shift 2 || { cr_error "--token requires an argument"; exit 2; } ;;
    --help|-h)  usage 0 ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

# Production only, and still named: the zone exists in one environment, and
# saying which one is the operator's act, not a default.
require_target "$TARGET" production || exit 2

case "$PROVIDER" in
  search-console|postmaster) ;;
  "") cr_error "--provider is required: search-console or postmaster."; exit 2 ;;
  *)  cr_error "--provider must be search-console or postmaster (got '$PROVIDER')."; exit 2 ;;
esac

if [[ -z "$TOKEN" ]]; then
  cr_error "--token is required: the whole TXT string the provider shows."
  exit 2
fi
if (( ${#TOKEN} > MAX_TOKEN_LENGTH )); then
  cr_error "--token is ${#TOKEN} characters; one TXT string holds at most $MAX_TOKEN_LENGTH."
  exit 2
fi
if ! writable_strings "$TOKEN"; then
  cr_error "--token carries a quote or a backslash, which no provider token does."
  exit 2
fi
if [[ "$TOKEN" =~ [[:cntrl:]] ]]; then
  cr_error "--token carries a control character, which no provider token does."
  exit 2
fi
if [[ "$TOKEN" =~ ^[[:space:]] || "$TOKEN" =~ [[:space:]]$ ]]; then
  cr_error "--token starts or ends with a space; copy the provider's string exactly."
  exit 2
fi
# The SPF string is built by the record itself; a second one in the list would
# give the domain two SPF policies, which receivers treat as no policy at all.
if [[ "${TOKEN,,}" == v=spf1* ]]; then
  cr_error "--token is an SPF string; the apex SPF is owned by the record, not by this list."
  exit 2
fi
# Google's token is a fixed prefix and a base64url value. Anything else would be
# published as a string Google never matches, and the domain would never verify.
if [[ "$PROVIDER" == "search-console" \
      && ! "$TOKEN" =~ ^google-site-verification=[A-Za-z0-9_-]{20,100}$ ]]; then
  cr_error "--token must be the whole string Search Console gives, google-site-verification=<value> (got '$TOKEN')."
  exit 2
fi

# Every read below parses JSON. Without a parser they would read as empty, and an
# empty answer must never pass for a clean one.
if ! command -v jq >/dev/null 2>&1; then
  cr_die "jq is required to read the Route 53 answer. Nothing has changed."
fi

TF_DIR="terraform/$TARGET"

# ── The values file ─────────────────────────────────────────────────────────
TFVARS_LINK="${ADD_APEX_TXT_TFVARS:-$TF_DIR/terraform.tfvars}"
# The shared resolver creates a missing file, which suits a script adding its
# first key. Here a missing file means the private checkout is not linked, and
# an empty list written into a new file would drop every string the zone serves.
if [[ ! -e "$TFVARS_LINK" ]]; then
  cr_die "$TFVARS_LINK does not exist; link the private checkout (scripts/setup_private_repo.sh) first. Nothing has changed."
fi
TFVARS_PATH="$(resolve_tfvars_target "$TFVARS_LINK" "$REPO_ROOT")" \
  || cr_die "there is no production values file this run can change (the reason is printed above). Nothing has changed."

# ── The AWS identity and the zone ───────────────────────────────────────────
# shellcheck source=lib/aws-profile.sh
source "${REPO_ROOT}/scripts/lib/aws-profile.sh"
aws_profile_ensure || cr_die "no AWS identity to read Route 53 and apply production with (the reason is printed above)"

# shellcheck source=lib/terraform-output.sh
source "${REPO_ROOT}/scripts/lib/terraform-output.sh"
if ! tf_output_read "$TF_DIR" route53_zone_id || [[ -z "$TF_OUTPUT_VALUE" ]]; then
  tf_output_explain "$TF_DIR" route53_zone_id
  cr_die "could not read route53_zone_id from $TF_DIR. Nothing has changed."
fi
ZONE_ID="$TF_OUTPUT_VALUE"

# ── The delegation ──────────────────────────────────────────────────────────
# One name server per line, lower case, without the trailing dot, sorted.
ns_set() { printf '%s\n' "$1" | sed '/^$/d' | tr '[:upper:]' '[:lower:]' | sed -E 's/\.$//' | LC_ALL=C sort -u; }

if ! tf_output_read "$TF_DIR" route53_name_servers --json; then
  tf_output_explain "$TF_DIR" route53_name_servers
  cr_die "could not read route53_name_servers from $TF_DIR. Nothing has changed."
fi
# jq's own complaint, if the output is not JSON, is shown on stderr; the empty
# set it leaves is then refused below.
ZONE_NS="$(ns_set "$(jq -r 'if type == "array" then .[] else empty end' <<< "$TF_OUTPUT_VALUE")")"
[[ -n "$ZONE_NS" ]] || cr_die "Terraform reports no name servers for the $DOMAIN zone. Nothing has changed."

# The world is delegated to the zone when a public resolver hands out exactly
# the zone's own name servers. A failed query is never read as delegated.
delegated_ns=""
delegated_ns="$("$DIG_BIN" +short +tries=3 +time=3 "@${RESOLVER}" "$DOMAIN" NS)" \
  || cr_die "could not ask $RESOLVER who serves $DOMAIN (dig's own words are above). Nothing has changed."
if [[ "$(ns_set "$delegated_ns")" != "$ZONE_NS" ]]; then
  echo "  $RESOLVER names: $(ns_set "$delegated_ns" | paste -sd ' ' -)" >&2
  echo "  the zone's own:  $(paste -sd ' ' - <<< "$ZONE_NS")" >&2
  echo "" >&2
  echo "       Until the nameserver move the zone must answer exactly what the legacy" >&2
  echo "       zone does, and an extra apex string fails the mirror check that releases" >&2
  echo "       the move. Run this once the delegation has converged and that check passed." >&2
  cr_die "REFUSING: $DOMAIN is not yet delegated to the Route 53 zone. Nothing has changed."
fi
echo "  $DOMAIN is delegated to the Route 53 zone ($RESOLVER agrees)."

# read_live_strings: the apex TXT strings Route 53 holds, one per line, each
# string's 255-octet chunks joined. The listing starts at the apex TXT set and
# answers the next set in the zone when there is none, so the name and type are
# matched rather than trusted. Fails, with the CLI's own words on stderr, when
# Route 53 cannot be read.
read_live_strings() {
  local answer
  answer="$("$AWS_BIN" route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --start-record-name "$DOMAIN" --start-record-type TXT --max-items 1 --output json)" \
    || return 1
  printf '%s' "$answer" \
    | jq -r --arg name "${DOMAIN}." \
        '.ResourceRecordSets[] | select(.Name == $name and .Type == "TXT") | .ResourceRecords[].Value' \
    | sed 's/" "//g; s/^"//; s/"$//'
}

# The strings other than SPF: the ones apex_txt_records must list.
non_spf() { { grep -viE '^v=spf1( |$)' <<< "$1" || [[ $? == 1 ]]; } | sed '/^$/d'; }

LIVE="" LIVE_OTHER="" FILE_LIST=""
LIVE="$(read_live_strings)" \
  || cr_die "could not read the apex TXT set from Route 53 (the CLI's own words are above). Nothing has changed."
if [[ -z "$LIVE" ]]; then
  cr_die "Route 53 holds no TXT set at $DOMAIN in zone $ZONE_ID, so the record that owns it is not applied. Nothing has changed."
fi
LIVE_OTHER="$(non_spf "$LIVE")"
FILE_LIST="$(top_strings "$LIST_NAME" < "$TFVARS_PATH")"

echo "== add apex TXT token: $PROVIDER on $TARGET =="
echo "  hosted zone:  $ZONE_ID"
echo "  values file:  $TFVARS_PATH"
echo "  token:        $TOKEN"
echo ""

FILE_SET="$(as_set "$FILE_LIST")"
LIVE_SET="$(as_set "$LIVE_OTHER")"
WANT_SET="$(as_set "$(printf '%s\n%s\n' "$LIVE_OTHER" "$TOKEN")")"

if [[ "$LIVE_SET" == "$WANT_SET" && "$FILE_SET" == "$WANT_SET" ]]; then
  echo "Route 53 already serves this token and the values file lists it; nothing to do."
  cr_proved "Route 53 serves the token in the $DOMAIN apex TXT set"
  cr_unproved "that $PROVIDER has verified it (its own check reads public DNS, which reaches this zone only after the nameserver move)"
  cr_finish
fi

WRITE_FILE=1
if [[ "$FILE_SET" == "$WANT_SET" ]]; then
  # A stop between the values-file write and the apply: finish the work.
  echo "The values file already lists this token beyond what Route 53 serves; applying it."
  WRITE_FILE=0
elif [[ "$FILE_SET" != "$LIVE_SET" ]]; then
  echo "Strings Route 53 serves, other than SPF:" >&2
  printf '%s\n' "$LIVE_SET" | sed 's/^/    /' >&2
  echo "Strings $LIST_NAME lists in the values file:" >&2
  printf '%s\n' "$FILE_SET" | sed '/^$/d; s/^/    /' >&2
  echo "" >&2
  echo "       An apply now would publish the values file's list and drop what the" >&2
  echo "       zone serves beyond it. Bring $LIST_NAME in line with the zone first." >&2
  cr_die "REFUSING: the values file and Route 53 disagree about the apex TXT strings. Nothing has changed."
fi

VALUES_TMP=""
VALUES_BACKUP=""
APPLY_STARTED=0
SETTLED=0

# A values file left holding the token after a stop before the apply would be
# published by the next routine apply, unchecked. So this run's own write is
# undone, and only this run's; from the apply on, what Route 53 holds decides.
restore_values() {
  if [[ -n "$VALUES_BACKUP" && -f "$VALUES_BACKUP" ]]; then
    cat "$VALUES_BACKUP" > "$TFVARS_PATH"
    echo "The values file is restored to what it held before this run." >&2
  fi
}
on_unfinished_exit() {
  local status
  status="$(cr_exit_status)"
  (( status != 0 && ! SETTLED )) || return 0
  if (( ! APPLY_STARTED )); then
    restore_values
  else
    echo "The apply had started, so the values file keeps the token. Re-run the same" >&2
    echo "command: it applies what is left and reads the result back." >&2
  fi
}
cleanup_files() {
  rm -f "${VALUES_TMP:-}" "${VALUES_BACKUP:-}"
}
cr_cleanup cleanup_files
cr_cleanup on_unfinished_exit

if (( WRITE_FILE )); then
  VALUES_TMP="$(mktemp "${TMPDIR:-/tmp}/footbag-apex-token-tfvars.XXXXXX")"
  chmod 600 "$VALUES_TMP"
  set_assignment "$LIST_NAME" \
    "$(printf '%s\n%s\n' "$FILE_LIST" "$TOKEN" | render_list)" \
    < "$TFVARS_PATH" > "$VALUES_TMP"

  echo "-- Step 1 of 3: the values file --"
  # diff exits 1 for a difference, which is the case here; 2 is trouble.
  diff -u "$TFVARS_PATH" "$VALUES_TMP" || [[ $? == 1 ]] \
    || cr_die "the values-file change could not be shown, so it is not confirmed. Nothing has changed."
  echo ""
  echo "This adds the $PROVIDER token to $LIST_NAME, keeping every string Route 53"
  echo "already serves. The apply that publishes it follows, with its own plan."
  echo ""
  if ! confirm_from_tty "Type 'APPLY' to write this change to the values file: " "APPLY"; then
    SETTLED=1
    cr_error "Aborted: nothing changed."
    exit 1
  fi
  # Mode 600, like the file it copies: the values file carries operator CIDRs.
  VALUES_BACKUP="$(mktemp "${TMPDIR:-/tmp}/footbag-apex-token-backup.XXXXXX")"
  chmod 600 "$VALUES_BACKUP"
  cat "$TFVARS_PATH" > "$VALUES_BACKUP"
  cat "$VALUES_TMP" > "$TFVARS_PATH"
  echo "  Values file written."
fi

echo ""
echo "-- Step 2 of 3: apply the record change --"
APPLY_STARTED=1
apply_rc=0
# Run directly, never through a pipe: the apply asks for its typed APPLY on this
# terminal, and hands its own errors and warnings to this run's report.
bash "$APPLY_CMD" --target "$TARGET" --dns-records-only || apply_rc=$?

echo ""
echo "-- Step 3 of 3: read the apex TXT set back from Route 53 --"
AFTER=""
if ! AFTER="$(read_live_strings)"; then
  SETTLED=1
  cr_error "could not read the apex TXT set back from Route 53 (the CLI's own words are above)."
  cr_unproved "that Route 53 serves the token; re-run the same command to read it again"
  exit 1
fi

if grep -qxF -- "$TOKEN" <<< "$AFTER"; then
  SETTLED=1
  if (( apply_rc != 0 )); then
    cr_warn "the apply ended with exit $apply_rc, but Route 53 serves the token; read the apply's report above."
  fi
  echo "PASS: Route 53 serves the $PROVIDER token in the $DOMAIN apex TXT set."
  cr_proved "Route 53 serves the token in the $DOMAIN apex TXT set"
  cr_unproved "that $PROVIDER has verified it (its own check reads public DNS, which reaches this zone only after the nameserver move)"
  cr_finish
fi

# The token is not served. When this run wrote the values file and Route 53
# still answers exactly what it did before, the apply changed nothing, so the
# write is undone and the two agree again.
SETTLED=1
if (( WRITE_FILE )) && [[ "$(as_set "$(non_spf "$AFTER")")" == "$LIVE_SET" ]]; then
  restore_values
else
  echo "The values file keeps the token. Re-run the same command to apply it." >&2
fi
if (( apply_rc != 0 )); then
  cr_error "the apply did not complete (exit $apply_rc), and Route 53 does not serve the token."
else
  cr_error "FAIL: the apply completed but Route 53 does not serve the token."
fi
exit 1
