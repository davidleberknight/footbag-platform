#!/usr/bin/env bash
# verify-delegation.sh -- prove who the .org registry delegates footbag.org to,
# and that the world resolves the zone the same way whichever servers answer.
#
# The nameserver change itself is a click in the registrar's console, and no
# script can make it. Everything around it can be checked from here: the
# registry read, the lock read, the resolver reads, and the convergence time
# the cutover log records, all at the most expensive moment in the go-live
# sequence. A hand check is the one that gets skipped, and one asked of a
# caching resolver answers from cache. So this script asks the registry's own
# servers, every one of them, and judges the rest against the zone's own
# answers.
#
# What it checks, in order:
#   1. RDAP, the registry's own record of the domain: its status and the
#      nameservers it delegates to. With --expect legacy (before the move) an
#      update lock is refused, because the registrar would refuse the change.
#   2. Every .org registry nameserver, asked without recursion, so the answer
#      is the delegation itself and never a cache.
#   3. Three public resolvers. Each is asked for the zone's start-of-authority
#      record, which says whose servers it is reading, and for the apex and www
#      addresses and the apex and my mail routing. Each answer must equal what
#      the expected zone's own first server answers. Both zones carry the same
#      values through the move, so a resolver still reading the other zone
#      answers the same records; a resolver answering DIFFERENT records means
#      something is wrong whichever zone it reads. A resolver still reading the
#      other zone is reported as not yet proved, not as an error: it holds a
#      cached nameserver set for up to the registry's lifetime, or up to about
#      25 hours where it kept the legacy zone's own set.
#   4. The legacy site answers plain HTTP on www and the apex.
#
# --record writes the "Delegation converged" time into the cutover log's
# zone-move section, the time scripts/production-cutover.sh waits 90000 seconds
# from before any stage that validates against the zone. It writes only when
# every registry server and RDAP name the Route 53 set and the run met no
# error, shows the change, and asks for APPLY. A row already holding a time is
# left alone, so a re-run after a stop does no harm.
#
# What it refuses to do:
#   - Change the delegation, the zone or anything in AWS. It reads, apart from
#     the one cutover-log row --record writes.
#   - Read the delegation from a caching resolver, which can hand back a stale
#     set or the zone's own advertised set rather than the registry's.
#   - Read a failed query as an answer. A server that cannot be read is an
#     error, never "delegated" and never "not delegated".
#   - Record a convergence time while any registry server or RDAP still names
#     another set.
#
# Usage:
#   bash scripts/verify-delegation.sh --target production --print-nameservers
#   bash scripts/verify-delegation.sh --target production --expect legacy
#   bash scripts/verify-delegation.sh --target production --expect route53
#   bash scripts/verify-delegation.sh --target production --expect route53 --record
#
#   --target             production. Required, with no default: the zone exists
#                        in one environment only.
#   --print-nameservers  print the four Route 53 nameservers, read from
#                        Terraform's route53_name_servers output, for the
#                        registrar's nameserver dialog, and check nothing else.
#   --expect             route53 (the move has been made) or legacy (before the
#                        move, or after a rollback): dns1.llic.net and
#                        dns2.llic.net.
#   --record             with --expect route53 only: write the convergence time.
#
# Exits 0 when everything expected is proved; 3 (PENDING) when nothing is wrong
# but a registry server or RDAP still names the other set, so the run is
# repeated; 2 when an argument is refused; 1 on any error.
#
# Test seams (CI only; operators never set these), each announced on stderr:
# VERIFY_DELEGATION_DIG_BIN replaces dig, VERIFY_DELEGATION_CURL_BIN replaces
# curl, VERIFY_DELEGATION_LOG replaces the cutover log, and
# VERIFY_DELEGATION_NOW (seconds since the epoch) replaces the clock the
# recorded time is read from. TF_OUTPUT_BIN passes through to the output read
# and announces itself.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=lib/host-env-remote.sh
source "${REPO_ROOT}/scripts/lib/host-env-remote.sh"
# shellcheck source=lib/closing-report.sh
source "${REPO_ROOT}/scripts/lib/closing-report.sh"

DOMAIN="footbag.org"
LEGACY_NS=$'dns1.llic.net\ndns2.llic.net'
# Three operators' resolvers, so one operator's cache cannot speak for the world.
RESOLVERS=(8.8.8.8 1.1.1.1 9.9.9.9)
# The answers a resolver is held to: the two web names and the two mail names
# whose loss would be noticed first.
PROBES=("${DOMAIN} A" "www.${DOMAIN} A" "${DOMAIN} MX" "my.${DOMAIN} MX")
RDAP_URL="https://rdap.publicinterestregistry.org/rdap/domain/${DOMAIN}"
LOG_SECTION="4a"
LOG_ROW="Delegation converged"

DIG_BIN="${VERIFY_DELEGATION_DIG_BIN:-dig}"
CURL_BIN="${VERIFY_DELEGATION_CURL_BIN:-curl}"
LOG_PATH="${VERIFY_DELEGATION_LOG:-${REPO_ROOT}/footbag_private_repo/cutover/CUTOVER_LOG.md}"
for seam in VERIFY_DELEGATION_DIG_BIN VERIFY_DELEGATION_CURL_BIN VERIFY_DELEGATION_LOG VERIFY_DELEGATION_NOW; do
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

TARGET=""
EXPECT=""
PRINT_NS=0
RECORD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 || { cr_error "--target requires an argument"; exit 2; } ;;
    --expect) EXPECT="${2:-}"; shift 2 || { cr_error "--expect requires an argument"; exit 2; } ;;
    --print-nameservers) PRINT_NS=1; shift ;;
    --record) RECORD=1; shift ;;
    --help|-h) usage 0 ;;
    *) cr_error "unknown argument '$1'"; exit 2 ;;
  esac
done

require_target "$TARGET" production || exit 2
if (( PRINT_NS )); then
  if [[ -n "$EXPECT" ]] || (( RECORD )); then
    cr_error "--print-nameservers stands alone: it prints the set for the registrar and checks nothing."
    exit 2
  fi
else
  case "$EXPECT" in
    route53|legacy) ;;
    "") cr_error "--expect is required: route53 or legacy."; exit 2 ;;
    *)  cr_error "--expect must be route53 or legacy (got '$EXPECT')."; exit 2 ;;
  esac
  if (( RECORD )) && [[ "$EXPECT" != route53 ]]; then
    cr_error "--record needs --expect route53: the time it writes is when the delegation reached Route 53."
    exit 2
  fi
fi
command -v jq >/dev/null 2>&1 || cr_die "jq is required to read the nameservers and the registry's record."

# One name per line, lower case, without the trailing dot, sorted.
name_set() { sed '/^$/d' | tr '[:upper:]' '[:lower:]' | sed -E 's/\.$//' | LC_ALL=C sort -u; }
on_one_line() { paste -sd ' ' -; }

# shellcheck source=lib/terraform-output.sh
source "$REPO_ROOT/scripts/lib/terraform-output.sh"
TF_DIR="terraform/$TARGET"
if ! tf_output_read "$TF_DIR" route53_name_servers --json; then
  tf_output_explain "$TF_DIR" route53_name_servers
  cr_die "could not read route53_name_servers from $TF_DIR."
fi
ZONE_NS="$(jq -r 'if type == "array" then .[] else empty end' <<<"$TF_OUTPUT_VALUE" | name_set)"
[[ -n "$ZONE_NS" ]] || cr_die "Terraform reports no nameservers for the $DOMAIN zone."

if (( PRINT_NS )); then
  echo "Enter these $(wc -l <<<"$ZONE_NS" | tr -d ' ') nameservers in the registrar's Manage Nameservers dialog,"
  echo "replacing $(on_one_line <<<"$LEGACY_NS"):"
  echo ""
  sed 's/^/  /' <<<"$ZONE_NS"
  echo ""
  cr_proved "the nameservers above are the zone's own, read from Terraform's route53_name_servers output"
  cr_finish
fi

if [[ "$EXPECT" == route53 ]]; then
  EXPECTED_NS="$ZONE_NS"
  OTHER="legacy"
else
  EXPECTED_NS="$LEGACY_NS"
  OTHER="Route 53"
fi
echo "== footbag.org delegation: expecting ${EXPECT} =="
echo "  expected set: $(on_one_line <<<"$EXPECTED_NS")"
echo ""

PENDING=()

# dig_answer <server> <name> <type> [recurse]
# The answer section in +short form, with dig's own comment lines removed.
# Fails, keeping dig's words in DIG_ERROR, when the server cannot be read.
DIG_ERROR=""
dig_answer() {
  local server="$1" name="$2" type="$3" recurse="${4:-norecurse}" out rc=0
  out="$("$DIG_BIN" +short "+${recurse}" +tries=3 +time=3 "@${server}" "$name" "$type" 2>&1)" || rc=$?
  if (( rc != 0 )); then
    DIG_ERROR="dig exit ${rc}: $(grep -m1 -E '^;;' <<<"$out" || head -n 1 <<<"$out")"
    return 1
  fi
  grep -vE '^[[:space:]]*;' <<<"$out" || [[ $? == 1 ]]
}

# The record data a probe is judged on. An address query through a canonical
# name answers the name first and then the address, and the legacy zone answers
# www that way, so only the addresses are kept; a mail query keeps the
# preference and the exchanger.
probe_values() {
  local type="$1"
  case "$type" in
    A)  grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || [[ $? == 1 ]] ;;
    MX) grep -E '^[0-9]+[[:space:]]+[^[:space:]]+$' || [[ $? == 1 ]] ;;
  esac | tr '[:upper:]' '[:lower:]' | sed -E 's/\.$//; s/[[:space:]]+/ /g' | LC_ALL=C sort -u
}

# ── 1. RDAP ─────────────────────────────────────────────────────────────────
echo "-- the registry's record (RDAP) --"
RDAP=""
rdap_rc=0
RDAP="$("$CURL_BIN" -sS --fail --max-time 20 -H 'Accept: application/rdap+json' "$RDAP_URL" 2>&1)" || rdap_rc=$?
if (( rdap_rc != 0 )) || ! jq -e '.status' >/dev/null 2>&1 <<<"$RDAP"; then
  cr_error "could not read the registry's RDAP record for $DOMAIN (curl exit ${rdap_rc}: $(head -n 1 <<<"$RDAP"))"
else
  RDAP_STATUS="$(jq -r '.status[]' <<<"$RDAP")"
  RDAP_NS="$(jq -r '.nameservers[]?.ldhName' <<<"$RDAP" | name_set)"
  echo "  status:      $(on_one_line <<<"$RDAP_STATUS")"
  echo "  nameservers: $(on_one_line <<<"${RDAP_NS:-none}")"
  if grep -qiE '^(client|server) update prohibited$' <<<"$RDAP_STATUS"; then
    if [[ "$EXPECT" == legacy ]]; then
      cr_error "the domain carries an update lock, so the registrar will refuse a nameserver change until it is removed"
    else
      echo "  an update lock is set: a later nameserver change needs it removed first"
    fi
  fi
  if [[ "$RDAP_NS" == "$EXPECTED_NS" ]]; then
    cr_proved "RDAP names the ${EXPECT} set"
  else
    PENDING+=("RDAP names $(on_one_line <<<"${RDAP_NS:-nothing}")")
  fi
fi
echo ""

# ── 2. Every .org registry server ───────────────────────────────────────────
echo "-- every .org registry nameserver, asked without recursion --"
REGISTRY=""
if ! REGISTRY="$(dig_answer "${RESOLVERS[0]}" org. NS recurse)"; then
  cr_die "could not list the .org registry's nameservers from ${RESOLVERS[0]} (${DIG_ERROR})."
fi
REGISTRY="$(name_set <<<"$REGISTRY")"
[[ -n "$REGISTRY" ]] || cr_die "${RESOLVERS[0]} named no nameservers for the .org registry."
registry_ok=0
registry_total=0
while IFS= read -r server; do
  registry_total=$(( registry_total + 1 ))
  out=""
  rc=0
  # The delegation is a referral, so it arrives in the authority section, which
  # +short does not print; this one query is read in full.
  out="$("$DIG_BIN" +norecurse +noall +authority +tries=3 +time=3 "@${server}" "$DOMAIN" NS 2>&1)" || rc=$?
  if (( rc != 0 )); then
    cr_error "${server} could not be read (dig exit ${rc}: $(head -n 1 <<<"$out"))"
    continue
  fi
  got="$(awk 'toupper($4) == "NS" { print $5 }' <<<"$out" | name_set)"
  if [[ -z "$got" ]]; then
    cr_error "${server} answered no delegation for ${DOMAIN}"
  elif [[ "$got" == "$EXPECTED_NS" ]]; then
    registry_ok=$(( registry_ok + 1 ))
    echo "  ${server}: $(on_one_line <<<"$got")"
  else
    echo "  ${server}: $(on_one_line <<<"$got")   <- not yet the ${EXPECT} set"
    PENDING+=("${server} names $(on_one_line <<<"$got")")
  fi
done <<<"$REGISTRY"
if (( registry_ok == registry_total )); then
  cr_proved "all ${registry_total} .org registry nameservers delegate ${DOMAIN} to the ${EXPECT} set"
fi
echo ""

# ── 3. Public resolvers against the expected zone's own answers ─────────────
echo "-- public resolvers, against the expected zone's own answers --"
AUTH="$(head -n 1 <<<"$EXPECTED_NS")"
declare -A AUTH_ANSWER=()
for probe in "${PROBES[@]}"; do
  read -r name type <<<"$probe"
  if ans="$(dig_answer "$AUTH" "$name" "$type")"; then
    AUTH_ANSWER["$probe"]="$(probe_values "$type" <<<"$ans")"
    if [[ -z "${AUTH_ANSWER[$probe]}" ]]; then
      cr_error "${AUTH} answers nothing for ${name} ${type}, which the zone has always carried"
    fi
  else
    cr_error "${AUTH} could not be read for ${name} ${type} (${DIG_ERROR})"
  fi
done
for resolver in "${RESOLVERS[@]}"; do
  if ! soa="$(dig_answer "$resolver" "$DOMAIN" SOA recurse)"; then
    cr_error "${resolver} could not be read (${DIG_ERROR})"
    continue
  fi
  mname="$(awk 'NF >= 7 { print $1; exit }' <<<"$soa" | name_set)"
  if [[ -z "$mname" ]]; then
    cr_error "${resolver} answered no start-of-authority record for ${DOMAIN}"
    continue
  fi
  if grep -qxF -- "$mname" <<<"$EXPECTED_NS"; then
    reading="$EXPECT"
  else
    reading="$OTHER"
    cr_unproved "that ${resolver} reads the ${EXPECT} zone: it still reads ${mname}, from a cached nameserver set"
  fi
  bad=0
  for probe in "${PROBES[@]}"; do
    [[ -n "${AUTH_ANSWER[$probe]:-}" ]] || continue
    read -r name type <<<"$probe"
    if ! ans="$(dig_answer "$resolver" "$name" "$type" recurse)"; then
      cr_error "${resolver} could not be read for ${name} ${type} (${DIG_ERROR})"
      bad=1
      continue
    fi
    got="$(probe_values "$type" <<<"$ans")"
    if [[ "$got" != "${AUTH_ANSWER[$probe]}" ]]; then
      cr_error "${resolver} answers ${name} ${type} as $(on_one_line <<<"${got:-nothing}"); the ${EXPECT} zone answers $(on_one_line <<<"${AUTH_ANSWER[$probe]}")"
      bad=1
    fi
  done
  if (( ! bad )); then
    echo "  ${resolver}: reads the ${reading} zone (${mname}); every probe answers as the ${EXPECT} zone does"
  fi
done
echo ""

# ── 4. The legacy site over plain HTTP ──────────────────────────────────────
echo "-- the site over plain HTTP --"
http_ok=1
for host in "www.${DOMAIN}" "$DOMAIN"; do
  code=""
  rc=0
  code="$("$CURL_BIN" -sS -o /dev/null --max-time 20 -w '%{http_code}' "http://${host}/" 2>&1)" || rc=$?
  if (( rc == 0 )) && [[ "$code" =~ ^[23][0-9][0-9]$ ]]; then
    echo "  http://${host}/: ${code}"
  else
    http_ok=0
    cr_error "http://${host}/ did not answer (curl exit ${rc}, status '${code}')"
  fi
done
(( http_ok )) && cr_proved "www and the apex answer plain HTTP"
echo ""

if (( ${#PENDING[@]} > 0 )); then
  for p in "${PENDING[@]}"; do echo "  pending: $p"; done
  cr_unproved "that the registry delegates ${DOMAIN} to the ${EXPECT} set everywhere; re-run in a few minutes"
fi

if (( ! RECORD )); then
  if (( ${#CR_ERRORS[@]} == 0 && ${#PENDING[@]} > 0 )); then
    cr_finish_with 3 PENDING
  fi
  cr_finish
fi

# ── --record: the convergence time ──────────────────────────────────────────
if (( ${#CR_ERRORS[@]} > 0 )); then
  cr_die "the convergence time is not recorded while the run has an error."
fi
if (( ${#PENDING[@]} > 0 )); then
  cr_unproved "the convergence time: it is recorded only once every registry server and RDAP name the Route 53 set"
  cr_finish_with 3 PENDING
fi
[[ -f "$LOG_PATH" ]] \
  || cr_die "no cutover log at ${LOG_PATH}: the private operations checkout is not linked here."

# The row's value cell, the second, as scripts/production-cutover.sh reads it.
current="$(awk -v want="$LOG_ROW" -v head="### ${LOG_SECTION}." '
  index($0, head) == 1 { inside = 1; next }
  inside && /^#/ { inside = 0 }
  inside && /^[|]/ {
    split($0, cell, "|")
    r = cell[2]; gsub(/^[ \t]+|[ \t]+$/, "", r)
    if (index(r, want) == 1) { v = cell[3]; gsub(/^[ \t]+|[ \t]+$/, "", v); print v; found = 1; exit }
  }
  END { if (!found) exit 1 }
' "$LOG_PATH")" || cr_die "the cutover log's zone-move section has no '${LOG_ROW}' row to write."

if [[ "$current" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?Z$ ]]; then
  echo "The cutover log already records the delegation converged at ${current}; it is left as it is."
  cr_proved "the cutover log records the convergence time (${current})"
  cr_finish
fi
if [[ -n "$current" ]]; then
  cr_die "the cutover log's '${LOG_ROW}' row already reads '${current}', which is not a UTC time; correct it by hand rather than have this run overwrite it."
fi

NOW="${VERIFY_DELEGATION_NOW:-$(date -u +%s)}"
STAMP="$(date -u -d "@${NOW}" +%Y-%m-%dT%H:%MZ)"
NEW_LOG="$(mktemp "${TMPDIR:-/tmp}/footbag-cutover-log.XXXXXX")"
cr_cleanup rm -f "$NEW_LOG"
awk -v want="$LOG_ROW" -v head="### ${LOG_SECTION}." -v stamp="$STAMP" '
  index($0, head) == 1 { inside = 1; print; next }
  inside && /^#/ { inside = 0 }
  inside && /^[|]/ && !done {
    split($0, cell, "|")
    r = cell[2]; gsub(/^[ \t]+|[ \t]+$/, "", r)
    if (index(r, want) == 1) {
      note = cell[5]; gsub(/^[ \t]+|[ \t]+$/, "", note)
      if (note == "") note = "scripts/verify-delegation.sh --expect route53 --record"
      printf "| %s | %s | %s | %s |\n", r, stamp, stamp, note
      done = 1
      next
    }
  }
  { print }
' "$LOG_PATH" > "$NEW_LOG"

echo "-- the cutover log --"
diff -u "$LOG_PATH" "$NEW_LOG" || [[ $? == 1 ]] \
  || cr_die "the change to the cutover log could not be shown, so it is not confirmed. Nothing has changed."
echo ""
echo "This records ${STAMP} as the moment the delegation reached Route 53. The custom-domain"
echo "and sender-domain stages wait 25 hours from it."
echo ""
if ! confirm_from_tty "Type 'APPLY' to write this time into the cutover log: " "APPLY"; then
  cr_error "Aborted: the cutover log is unchanged."
  exit 1
fi
cat "$NEW_LOG" > "$LOG_PATH"
cmp -s "$LOG_PATH" "$NEW_LOG" || cr_die "the cutover log does not read back as written: $LOG_PATH"
echo "  Recorded: ${LOG_ROW} ${STAMP}"
cr_proved "the cutover log records the delegation converged at ${STAMP}"
cr_finish
