#!/usr/bin/env bash
# verify-zone-mirror.sh -- prove the Route 53 copy answers what the legacy zone answers.
#
# The go-live gate that releases the registrar change asks for a fresh capture
# with every name verified as served from the Route 53 nameservers against it.
# That comparison has been done by hand and its result was never committed, so
# the claim that the mirror is correct rests on a measurement nobody can re-read.
# This script is that measurement, repeatable and dated.
#
# It READS and never writes. Nothing here touches the zone, the registrar or
# Terraform state; it asks the Route 53 nameservers what they would answer and
# compares that against the committed capture of the legacy zone.
#
# Why every VALUE comes from a query rather than from a listing. A listing says
# what Terraform declared. What matters at the switch is what the servers will
# actually answer, which is the thing a resolver gets, and an alias record does
# not appear in a listing as the address it resolves to.
#
# And why the NAME SET nonetheless comes from a listing. The objection above is
# about values, not about which names exist, and that second question is one DNS
# cannot answer at all: Route 53 refuses a zone transfer, so walking the capture
# is the only enumeration available and it can only ever find what the capture
# already holds. A name the mirror serves and the capture lacks -- the preview
# name, the origin name, a certificate-authorisation or validation record --
# would be invisible, and the run that releases the registrar change is the run
# with the most of them. So the listing supplies the names, the queries supply
# every value, and the comparison runs in both directions.
#
# SIX DELIBERATE DEPARTURES, which are not defects. Three are reported in the
# output, name by name: the apex nameserver set, the apex certificate-authorisation
# record, and www. The other three never reach a line of the report, which the
# summary at the end states rather than leaving the reader to infer. Getting any
# of the six wrong in either direction is the failure this script exists to
# prevent: a real difference dismissed as expected, or an expected one raising an
# alarm during a cutover window.
#
#   The zone's own apex NS set and SOA differ by construction. The legacy zone
#   advertises its operator's nameservers; the Route 53 copy advertises its own.
#   The NS set is reported; the SOA is dropped at parse.
#
#   The zone's own apex certificate-authorisation record is ungated and lands with
#   the hosted zone, so it is served here and absent from a capture of another
#   operator's zone. Reported, from the mirror side.
#
#   Every cache lifetime differs, deliberately and downward, so values are
#   compared and lifetimes are not.
#
#   The obsolete sender record type is not carried. Route 53 does not offer it,
#   receivers ignore it, and each one has a text-record twin carrying the
#   identical string, which IS carried and IS compared.
#
#   www changes shape, and three further names change with it. The legacy zone
#   answers www as a canonical name pointing at the apex, so a query of ANY type
#   against www chases to the apex and is answered there -- and v, worlds and
#   worldchampionships are canonical names pointing at www, so they chase the
#   same chain and reach the apex too. The mirror answers www as an address-type
#   alias, which answers only its own type, so mail and text queries against all
#   four return empty afterwards. Two more names, fi and ftp, point straight at
#   the apex and are unaffected, which is why the blast radius is four and not
#   the five that ride the apex and www between them.
#
#   Only www is REPORTED as a departure, and that is correct rather than an
#   omission. The other three carry the same canonical-name record in both zones,
#   so they compare equal and there is nothing to excuse. What changes for them
#   is what a CHASED query returns, and this compares record sets rather than
#   following chains. The behaviour is worth knowing; it is not a difference in
#   the zone, and a reader should not expect four lines in the report.
#
#   The shape is deliberate: the later flip would otherwise be a type change,
#   which Route 53 does as a delete and a create. The provider submits those in
#   one transactional batch, so the ordinary case exposes no gap; what it costs
#   is the failure case, where an apply stopping partway leaves the canonical
#   hostname absent behind a 900-second negative cache, in the flip and again in
#   any rollback.
#
# Usage:
#   bash scripts/verify-zone-mirror.sh --capture <zone-file> --nameserver <ns> \
#        --zone-id <hosted-zone-id> [--out <path>]
#
#   --capture     the committed RFC-format capture of the legacy zone. Required,
#                 with no default: which capture a run compares against is
#                 exactly the thing that must not be inherited from ambient state.
#   --nameserver  one of the zone's Route 53 nameservers. Required, and not
#                 defaulted: asking a resolver answers from cache, which during a
#                 repoint is whichever delegation it last saw. Read the four from
#                 `terraform -chdir=terraform/production output route53_name_servers`.
#                 Every answer is checked for the authoritative flag, so a
#                 resolver named here is refused rather than quietly measured.
#   --zone-id     the Route 53 hosted zone. Required, because the comparison runs
#                 in BOTH directions and DNS cannot answer "what names exist":
#                 Route 53 refuses a zone transfer, so the only way to see a name
#                 the mirror serves and the capture lacks is to list the record
#                 sets. Read it from
#                 `terraform -chdir=terraform/production output route53_zone_id`.
#                 The listing supplies the NAME SET only; every value compared
#                 still comes from a query, because a listing shows an alias as
#                 an alias rather than as the address it answers with.
#   --out         write the artifact here as well as printing it. Put it in the
#                 private operations checkout beside the capture; it records
#                 which names IFPA serves and belongs with the other evidence.
#
# Exits non-zero when any name answers differently in a way this script does not
# recognise as one of the departures above, when a name exists on one side only,
# or when it could not ask.
#
# Test seams: FOOTBAG_DIG_BIN replaces dig and FOOTBAG_AWS_BIN replaces the AWS
# CLI. A run using either says so on stderr, because a stubbed run proves nothing
# about the zone. This script reads and never writes: the listing is a read, and
# nothing here touches the zone, the registrar or Terraform state.

set -euo pipefail

CAPTURE=""
NAMESERVER=""
ZONE_ID=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --capture)
      CAPTURE="${2:-}"
      shift 2 || { echo "ERROR: --capture requires a path" >&2; exit 2; }
      ;;
    --nameserver)
      NAMESERVER="${2:-}"
      shift 2 || { echo "ERROR: --nameserver requires a hostname" >&2; exit 2; }
      ;;
    --zone-id)
      ZONE_ID="${2:-}"
      shift 2 || { echo "ERROR: --zone-id requires a hosted zone id" >&2; exit 2; }
      ;;
    --out)
      OUT="${2:-}"
      shift 2 || { echo "ERROR: --out requires a path" >&2; exit 2; }
      ;;
    --help|-h)
      # The whole header, found by reading to the first line that is not a
      # comment rather than by a line number. A fixed range silently stops
      # printing the tail of the header the moment the header grows past it, and
      # the tail is where the flags, the exit contract and the test seams are.
      sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "ERROR: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

DIG_BIN="${FOOTBAG_DIG_BIN:-dig}"
[[ -n "${FOOTBAG_DIG_BIN:-}" ]] && echo "NOTE: using a stand-in for dig; this run proves nothing about the zone." >&2
AWS_BIN="${FOOTBAG_AWS_BIN:-aws}"
[[ -n "${FOOTBAG_AWS_BIN:-}" ]] && echo "NOTE: using a stand-in for the AWS CLI; this run proves nothing about the zone." >&2


if [[ -z "$CAPTURE" ]]; then
  echo "ERROR: --capture is required (the committed capture of the legacy zone)." >&2
  echo "       There is deliberately no default: which capture a run compares" >&2
  echo "       against decides what the answer means." >&2
  exit 2
fi
if [[ ! -r "$CAPTURE" ]]; then
  echo "ERROR: cannot read the capture at ${CAPTURE}." >&2
  exit 2
fi

if [[ -z "$NAMESERVER" ]]; then
  echo "ERROR: --nameserver is required." >&2
  echo "       Read the four names with:" >&2
  echo "         terraform -chdir=terraform/production output route53_name_servers" >&2
  echo "       and pass any one of them. This is not defaulted, and not because" >&2
  echo "       nobody got round to it: asking a resolver instead answers from" >&2
  echo "       cache, which during a repoint is whichever delegation that" >&2
  echo "       resolver last happened to see." >&2
  exit 2
fi

if [[ -z "$ZONE_ID" ]]; then
  echo "ERROR: --zone-id is required." >&2
  echo "       Read it with:" >&2
  echo "         terraform -chdir=terraform/production output route53_zone_id" >&2
  echo "       It is what makes this comparison run in both directions. A name" >&2
  echo "       the mirror serves and the capture does not contain is invisible to" >&2
  echo "       a walk of the capture, and DNS cannot be asked which names exist" >&2
  echo "       because Route 53 refuses a zone transfer. The listing supplies the" >&2
  echo "       name set only; every value compared still comes from a query." >&2
  exit 2
fi

# Which identity the listing runs as is settled here rather than inherited from
# whatever profile the shell happens to carry, for the same reason the nameserver
# is named rather than defaulted: a read whose actor is ambient is a read nobody
# can reproduce. After this script's own refusals, so a missing argument is
# answered by the argument message rather than by a credential error. Skipped
# when the CLI is stubbed, because there is no identity to settle and the stub
# note has already said the run proves nothing.
if [[ -z "${FOOTBAG_AWS_BIN:-}" ]]; then
  # shellcheck source=lib/aws-profile.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/aws-profile.sh"
  aws_profile_ensure || exit 1
fi

# A record wrapped across lines in parentheses is ONE record, and every stage
# below assumes it arrives as one line. A long text value is the usual case: a
# signing key is written over three or four lines, and a parser that splits on
# newlines drops the continuation entirely, so the key material is never compared
# and the first line alone reports a difference against a mirror that is right.
#
# Parentheses inside a quoted string are literal, so depth is counted outside
# quotes only.
capture_logical_lines() {
  grep -vE '^[[:space:]]*(;|$)' "$CAPTURE" \
    | awk '
        {
          if (cont) buf = buf " " $0; else buf = $0
          inq = 0
          for (i = 1; i <= length($0); i++) {
            c = substr($0, i, 1)
            if (c == "\"") { inq = 1 - inq; continue }
            if (inq) continue
            if (c == "(") depth++
            else if (c == ")") depth--
          }
          if (depth > 0) { cont = 1; next }
          cont = 0; depth = 0
          gsub(/[()]/, " ", buf)
          print buf
        }'
}

CAPTURE_LOGICAL="$(capture_logical_lines)"

# Parsed from the capture into `name<TAB>type<TAB>value`, one line per value.
#
# Lifetimes are dropped rather than compared, because every one differs by design
# and downward. A record set is compared as a SET, further down: comparing one
# captured line against a whole served answer reports every multi-value set as a
# difference, which is the shape that made the first run unreadable. SOA and the
# obsolete sender type are dropped, because Route 53 offers neither and each
# sender record has a text twin that IS carried and IS compared.
#
# Case is NOT folded here, and that is a correction. It used to be folded over
# every value, on the reasoning that DNS names are case-insensitive and the
# capture carries the provider's upper-case spelling of the Google exchangers.
# True of a name and false of a text value: the apex carries the Google
# site-verification token, which is case-sensitive and is the proof of ownership
# the Workspace recovery path rests on, and a signing key is base64. Folding
# those would have certified a mirror that destroyed one. Folding is applied per
# type below instead.
#
# This parser understands ONE dialect: absolute name, explicit lifetime, explicit
# class, type, value. That is what the committed captures carry. Rather than
# guess at the others, every non-comment line has to parse, and a line that does
# not stops the run -- see the refusal below. A silently skipped line is the
# failure this script exists to prevent.
PARSE_COUNTS="$(
  printf '%s\n' "$CAPTURE_LOGICAL" \
    | grep -vE '^\$' \
    | sed -E 's/[[:space:]]+/\t/g' \
    | awk -F'\t' 'NF >= 5 { parsed++ } NF < 5 && NF > 0 { unparsed++ } END { print parsed + 0 "\t" unparsed + 0 }'
)"
PARSED_LINES="$(printf '%s' "$PARSE_COUNTS" | cut -f1)"
UNPARSED_LINES="$(printf '%s' "$PARSE_COUNTS" | cut -f2)"

if (( PARSED_LINES == 0 )); then
  echo "ERROR: parsed no records at all from ${CAPTURE}." >&2
  echo "       A capture this script cannot read is not a capture that matches." >&2
  exit 2
fi
if (( UNPARSED_LINES > 0 )); then
  echo "ERROR: ${UNPARSED_LINES} line(s) in ${CAPTURE} did not parse." >&2
  echo "       This reads one zone-file dialect: absolute name, explicit TTL," >&2
  echo "       explicit class, type, value. A capture written with a relative" >&2
  echo "       name, an inherited TTL or an omitted class parses to fewer" >&2
  echo "       records than it holds, and the names that vanish are reported as" >&2
  echo "       nothing at all rather than as a difference. Re-take the capture in" >&2
  echo "       the committed form, or teach this parser the dialect deliberately." >&2
  exit 2
fi

CAPTURE_ROWS="$(
  printf '%s\n' "$CAPTURE_LOGICAL" \
    | sed -E 's/[[:space:]]+/\t/g' \
    | awk -F'\t' 'NF >= 5 && $4 != "SOA" && $4 != "SPF" {
        value = $5
        for (i = 6; i <= NF; i++) value = value " " $i
        print tolower($1) "\t" toupper($4) "\t" value
      }'
)"

# The apex is the owner of the start-of-authority record, which is what defines
# it. It used to be taken from the first parsed row, which worked only because
# this capture happens to lead with the apex nameserver set: a capture sorted
# alphabetically would have made the first alias the apex, mis-scoping the
# nameserver departure and sending the www check to a name that does not exist.
APEX="$(
  printf '%s\n' "$CAPTURE_LOGICAL" \
    | sed -E 's/[[:space:]]+/\t/g' \
    | awk -F'\t' '$4 == "SOA" { print tolower($1); exit }'
)"
if [[ -z "$APEX" ]]; then
  echo "ERROR: ${CAPTURE} carries no start-of-authority record, so the zone apex" >&2
  echo "       cannot be established. Every departure this script recognises is" >&2
  echo "       scoped to the apex or to www beneath it, so guessing it would" >&2
  echo "       excuse differences at whatever name came first." >&2
  exit 2
fi

# One entry per name and type, which is the unit a nameserver answers.
CAPTURE_KEYS="$(printf '%s\n' "$CAPTURE_ROWS" | cut -f1,2 | sort -u)"

# Case folding, applied per type rather than over everything.
#
#   A name-valued type is folded: DNS names are case-insensitive, the capture
#   carries the provider's upper-case spelling of the Google exchangers, and the
#   servers answer in lower case.
#
#   A text value is compared byte for byte, and its quoting is normalised
#   instead. A value longer than 255 bytes is SPLIT into several character
#   strings on the wire, Route 53 requires that split, and the pieces concatenate
#   with nothing between them -- so `"ab" "cd"` and `"abcd"` are the same value
#   and must compare equal, while `AB` and `ab` are not the same token and must
#   not.
#
#   Everything else is folded too: an address is written in one case by one side
#   and the other by the other, and none of it is case-bearing.
normalise_values() {
  case "$1" in
    TXT)
      # Trimmed BEFORE the quotes are stripped, not after. A value that arrives
      # with trailing whitespace -- which it does, because a wrapped record's
      # closing parenthesis becomes a space -- leaves the final quote no longer
      # at the end of the string, so the strip misses it and the value compares
      # against one that has none.
      sed -E 's/^[[:space:]]+|[[:space:]]+$//g' \
        | sed -E 's/"[[:space:]]+"//g; s/^"//; s/"$//' \
        | sort -u
      ;;
    *)
      sed -E 's/[[:space:]]+/ /g' \
        | tr 'A-Z' 'a-z' \
        | sed -E 's/^ +| +$//g' \
        | sort -u
      ;;
  esac
}

# One query, one shape, used everywhere below. +comments is what carries the
# response status and the flags, and both decide whether an empty answer means
# "this name has nothing" or "this server would not tell me".
query() {
  "$DIG_BIN" +noall +comments +answer +tries=3 +time=3 "@${NAMESERVER}" "$1" "$2" 2>&1
}
response_status() {
  printf '%s\n' "$1" | sed -nE 's/.*status: ([A-Z]+).*/\1/p' | head -1
}
answer_records() {
  # `|| true` because a response with no answer section matches nothing, and a
  # no-match grep exits 1, which under pipefail would kill the run inside a
  # command substitution and print no report at all. That failure mode was real:
  # one truncation warning from dig ended a run with a bare exit and no output.
  printf '%s\n' "$1" | { grep -vE '^[[:space:]]*;' || true; }
}

# The authority check, made once against the apex before anything is compared.
#
# The whole reason this script takes a nameserver rather than using a resolver is
# that a resolver answers from cache, which during a repoint is whichever
# delegation it last saw. Nothing enforced that. Pointed at a public resolver
# this script compared the LEGACY zone against a capture of itself, scored better
# than the real run because even the www departure disappears, and printed a
# pass. The only trace was the nameserver line in the artifact, which a reader
# has to already know is wrong.
#
# An authoritative server sets the aa flag. A resolver does not, whatever it is
# serving, so this refuses the whole class rather than the one address somebody
# happened to type.
probe="$(query "$APEX" SOA)" || probe=""
if ! printf '%s\n' "$probe" | grep -qE '^;; flags:[^;]* aa[ ;]'; then
  echo "ERROR: ${NAMESERVER} did not answer authoritatively for ${APEX}." >&2
  echo "       This compares against the zone's own servers on purpose. A" >&2
  echo "       resolver answers from cache, which during a repoint is whichever" >&2
  echo "       delegation it last happened to see -- so a run against one can" >&2
  echo "       compare the old zone against a capture of itself and pass." >&2
  echo "       Read the four authoritative names with:" >&2
  echo "         terraform -chdir=terraform/production output route53_name_servers" >&2
  exit 2
fi

# The other direction. DNS cannot be asked which names a zone holds, so the name
# set comes from a listing and the values still come from queries.
mirror_names="$(
  "$AWS_BIN" route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --query 'ResourceRecordSets[].[Name,Type]' --output text 2>/dev/null
)" || {
  echo "ERROR: could not list the record sets of ${ZONE_ID}." >&2
  echo "       This is a read and it needs credentials that can make it. Without" >&2
  echo "       it the comparison runs one way only, and a name the mirror serves" >&2
  echo "       and the capture does not is invisible." >&2
  exit 2
}
MIRROR_KEYS="$(
  printf '%s\n' "$mirror_names" \
    | awk -F'\t' 'NF >= 2 { name = tolower($1); sub(/\.$/, ".", name); print name "\t" toupper($2) }' \
    | sort -u
)"

identical=0
differing=0
expected=0
unreadable=0
mirror_only=0
report=""

add_line() { report="${report}${1}"$'\n'; }

add_line "Zone mirror comparison"
add_line "  capture:     ${CAPTURE}"
add_line "  capture sha:  $(sha256sum "$CAPTURE" | cut -d' ' -f1)"
add_line "  nameserver:  ${NAMESERVER} (authoritative for ${APEX})"
add_line "  hosted zone: ${ZONE_ID}"
add_line "  measured:    $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
add_line ""
add_line "  A pass here says the mirror matches THIS capture. The gate that releases"
add_line "  the registrar change asks for a capture taken fresh beforehand, so re-take"
add_line "  one and re-run this immediately before the move rather than citing an"
add_line "  older result."
add_line ""

while IFS=$'\t' read -r name rtype; do
  [[ -n "$name" && -n "$rtype" ]] || continue

  # The apex nameserver set is the zone's own and differs by construction.
  if [[ "$rtype" == "NS" && "$name" == "$APEX" ]]; then
    expected=$((expected + 1))
    add_line "EXPECTED  ${name} ${rtype}  the zone advertises its own nameservers"
    continue
  fi

  want="$(
    printf '%s\n' "$CAPTURE_ROWS" \
      | awk -F'\t' -v n="$name" -v t="$rtype" '$1 == n && $2 == t { print $3 }' \
      | normalise_values "$rtype" | tr '\n' '; '
  )"

  # +tries and +time are set rather than left at the default, because a single
  # dropped packet against one of sixty names would otherwise fail the whole run
  # and send the operator looking for a zone defect that is not there.
  answer="$(query "$name" "$rtype")" || answer="__UNREADABLE__"

  # A lookup that could not complete is not an empty answer, and must never be
  # compared as one. Three shapes of failure, and only the first was recognised
  # before: dig reports a timeout as a comment line rather than as a non-zero
  # exit; a REFUSED or SERVFAIL answer exits zero with an empty answer section,
  # which is indistinguishable from "this name holds nothing" unless the status
  # is read; and a response carrying no status at all is not an answer either.
  #
  # NXDOMAIN is a real answer and stays comparable: a name the capture holds and
  # the mirror does not is exactly the difference this script exists to report.
  lookup_failed() {
    [[ "$1" == "__UNREADABLE__" ]] && return 0
    printf '%s' "$1" | grep -qiE 'timed out|communications error|no servers could be reached|connection refused' && return 0
    local st
    st="$(response_status "$1")"
    [[ -z "$st" ]] && return 0
    [[ "$st" != "NOERROR" && "$st" != "NXDOMAIN" ]]
  }

  # One whole second attempt before giving up. dig's own retries share a single
  # short deadline, and across sixty names a run that fails on one dropped packet
  # gets re-run out of habit rather than read, which is how a real difference
  # ends up dismissed as flakiness.
  if lookup_failed "$answer"; then
    answer="$(query "$name" "$rtype")" || answer="__UNREADABLE__"
  fi

  if lookup_failed "$answer"; then
    unreadable=$((unreadable + 1))
    add_line "UNREADABLE ${name} ${rtype}  status $(response_status "$answer"), not an absence"
    continue
  fi

  served="$(
    answer_records "$answer" \
      | sed -E 's/[[:space:]]+/\t/g' \
      | awk -F'\t' 'NF >= 5 { value = $5; for (i = 6; i <= NF; i++) value = value " " $i; print value }' \
      | normalise_values "$rtype" | tr '\n' '; '
  )"

  if [[ "$served" == "$want" ]]; then
    identical=$((identical + 1))
    # Named rather than counted. This is an evidence artifact, and "59 identical"
    # tells a reader nothing about WHICH names were verified: a capture that
    # silently lost ten names still says pass, with the count moving and nothing
    # naming what went. Verbosity is the point of the file.
    add_line "IDENTICAL ${name} ${rtype}"
    continue
  fi

  # www answers only its own type in the mirror, by design.
  if [[ "$name" == "www.${APEX}" && "$rtype" != "A" && "$rtype" != "AAAA" ]]; then
    expected=$((expected + 1))
    add_line "EXPECTED  ${name} ${rtype}  www is an address alias in the mirror and answers only its own type"
    continue
  fi

  differing=$((differing + 1))
  add_line "DIFFERS   ${name} ${rtype}"
  add_line "            capture: ${want}"
  add_line "            served:  ${served:-<empty>}"
done <<< "$CAPTURE_KEYS"

# The other direction: a name and type the mirror holds that the capture does
# not. Walking the capture cannot see these by construction, and they are not a
# theoretical worry -- the production tree declares the preview name, the origin
# name, the apex and www address records, the apex certificate-authorisation
# record and the validation records, none of which appears in a capture of the
# legacy zone. Most sit behind flags that are off at the run releasing the
# registrar change, so a run that meets one has been run at the wrong moment and
# should fail here. The apex authorisation record is the exception: it is ungated
# and lands with the hosted zone, so it is declared as a departure below rather
# than reported as a defect.
#
# Reported under their own heading rather than as differences. A record the
# design adds deliberately is not a mirror defect; a record nobody can account
# for is, and the operator is the one who can tell them apart.
add_line ""
while IFS=$'\t' read -r name rtype; do
  [[ -n "$name" && -n "$rtype" ]] || continue
  # SOA and the apex nameserver set are the zone's own by construction, and the
  # capture-side walk already reports them as departures. www's address record is
  # the fourth departure seen from this side: the capture carries www as a
  # canonical name, so the mirror's address record for it is present here and
  # absent there by design, and the explicit check further down is what proves it
  # actually answers rather than merely being declared.
  if [[ "$rtype" == "SOA" ]] || [[ "$rtype" == "NS" && "$name" == "$APEX" ]]; then
    continue
  fi
  # The apex certificate-authorisation record is the zone's own and is ungated: it
  # lands with the hosted zone, so it is present here and absent from a capture of
  # another operator's zone by construction, exactly as the apex nameserver set
  # is. Reported by name rather than passed over silently, because an expected
  # departure nobody can see in the report is indistinguishable from one the
  # script failed to notice.
  if [[ "$rtype" == "CAA" && "$name" == "$APEX" ]]; then
    expected=$((expected + 1))
    add_line "EXPECTED  ${name} ${rtype}  the zone publishes its own issuance authorisation"
    continue
  fi
  if [[ "$name" == "www.${APEX}" && ( "$rtype" == "A" || "$rtype" == "AAAA" ) ]]; then
    continue
  fi
  if printf '%s\n' "$CAPTURE_KEYS" | grep -qxF "${name}"$'\t'"${rtype}"; then
    continue
  fi
  mirror_only=$((mirror_only + 1))
  add_line "MIRROR-ONLY ${name} ${rtype}  served here, absent from the capture"
done <<< "$MIRROR_KEYS"

if (( mirror_only == 0 )); then
  add_line "  No name is served that the capture does not carry."
fi

# www is the one name the capture cannot verify on its own. The legacy zone
# carries it as a canonical name and no address record, so nothing in the loop
# above ever asks the mirror for www's address -- and the departure branch marks
# the CNAME mismatch EXPECTED whether the mirror serves an alias or serves
# nothing at all. A mirror missing www entirely produced the same output as a
# correct one. www is in the design's served set, so it gets an explicit check.
www_a="$("$DIG_BIN" +noall +answer +tries=3 +time=3 "@${NAMESERVER}" "www.${APEX}" A 2>&1 | grep -vE '^[[:space:]]*;' || true)"
www_aaaa="$("$DIG_BIN" +noall +answer +tries=3 +time=3 "@${NAMESERVER}" "www.${APEX}" AAAA 2>&1 | grep -vE '^[[:space:]]*;' || true)"
if [[ -z "${www_a//[[:space:]]/}" && -z "${www_aaaa//[[:space:]]/}" ]]; then
  differing=$((differing + 1))
  add_line "DIFFERS   www.${APEX} A/AAAA"
  add_line "            the mirror answers no address for www, so the shape change"
  add_line "            this script treats as expected has not actually happened"
else
  add_line "CHECKED   www.${APEX} answers an address, which is the shape the mirror is meant to carry"
fi

# The apex certificate-authorisation record is the other record the capture
# cannot vouch for: the legacy zone has none, so the loops above only ever see it
# if the listing happens to hold it, and its absence passed silently. The design
# requires it served from the zone move onward, before the registrar is touched,
# because from delegation it is the only bound on which authority may issue for
# a footbag.org name. So it gets an explicit check of the values it must carry.
apex_caa="$("$DIG_BIN" +noall +answer +tries=3 +time=3 "@${NAMESERVER}" "${APEX}" CAA 2>&1 | grep -vE '^[[:space:]]*;' || true)"
if printf '%s\n' "$apex_caa" | grep -qF '0 issue "amazon.com"' \
   && printf '%s\n' "$apex_caa" | grep -qF '0 issuewild ";"'; then
  add_line "CHECKED   ${APEX} CAA permits only Amazon's authority and refuses wildcards"
else
  differing=$((differing + 1))
  add_line "DIFFERS   ${APEX} CAA"
  add_line "            the apex certificate-authorisation record is not served as"
  add_line "            declared; apply the zone through scripts/terraform-apply.sh"
  add_line "            before the registrar is touched"
fi

dropped_soa="$(grep -cE '[[:space:]]SOA[[:space:]]' "$CAPTURE" || true)"
dropped_spf="$(grep -cE '[[:space:]]SPF[[:space:]]' "$CAPTURE" || true)"

add_line ""
add_line "  names compared:       $(printf '%s\n' "$CAPTURE_KEYS" | cut -f1 | sort -u | grep -c . || true)"
add_line "  name+type sets:       $(printf '%s\n' "$CAPTURE_KEYS" | grep -c . || true)"
add_line "  identical: ${identical}"
add_line "  expected departures: ${expected}"
add_line "  differing: ${differing}"
add_line "  unreadable: ${unreadable}"
add_line "  served here only: ${mirror_only}"
add_line ""
add_line "  Both counts are given because they differ and a reader will otherwise"
add_line "  reconcile them wrongly: the go-live gate counts NAMES, this script"
add_line "  compares name-and-type SETS, and one name carries several. Identical"
add_line "  means identical IN VALUE; every cache lifetime differs by design."
add_line ""
add_line "  Not compared, by design and not by omission:"
add_line "    cache lifetimes on every record, which differ deliberately and downward"
add_line "    ${dropped_soa} start-of-authority record(s): the mirror has its own"
add_line "    ${dropped_spf} obsolete sender-type record(s): Route 53 does not offer the type, receivers"
add_line "      ignore it, and each one's text twin IS carried and IS compared above"
add_line ""
add_line "  This compares in both directions: every name and type in the capture is"
add_line "  asked of the mirror, and every one the mirror holds is checked back"
add_line "  against the capture. Values are read from the zone's own servers; the"
add_line "  listing supplies the name set only, because a listing shows an alias as"
add_line "  an alias rather than as the address it answers with."

printf '%s' "$report"

if [[ -n "$OUT" ]]; then
  printf '%s' "$report" > "$OUT"
  echo "artifact written to ${OUT}" >&2
fi

if (( unreadable > 0 )); then
  echo "FAIL: ${unreadable} name(s) could not be looked up. An unreadable answer is not a match." >&2
  exit 1
fi
if (( differing > 0 )); then
  echo "FAIL: ${differing} name(s) answer differently and are not one of the known departures." >&2
  exit 1
fi
if (( mirror_only > 0 )); then
  echo "FAIL: ${mirror_only} name(s) are served that the capture does not carry." >&2
  echo "      Each is either a record the design adds deliberately, in which case" >&2
  echo "      re-run once the capture is taken after it exists, or a record nobody" >&2
  echo "      declared. This does not judge which; it refuses to pass over either." >&2
  exit 1
fi

echo "[zone-mirror] pass (${identical} identical in value, ${expected} expected departures, none served here only)"
