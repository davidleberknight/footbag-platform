#!/usr/bin/env bash
# write-zone-mirror-values.sh -- rewrite the legacy mirror in the production values
# file from a fresh capture of the legacy zone.
#
# Until the registrar points at Route 53, the production hosted zone is a copy of
# the legacy webmaster's zone, and the nameserver change is only safe while it is
# an exact copy. He still edits his zone, so each fresh capture can differ from
# what the values file carries. Transcribing the difference by hand means reading
# some eighty records against nine assignments, inside the window where a missed
# name stops resolving the moment delegation moves with no error anywhere. This
# script is that transcription, from the capture alone.
#
# What it does, in order:
#   1. Reads the capture (a complete transfer: SOA first and last) and sorts every
#      record into the assignment that carries it:
#        apex A                          legacy_apex_ipv4
#        apex MX                         legacy_mx_records
#        apex sender-policy TXT          legacy_apex_spf
#        reporting-policy TXT at _dmarc  legacy_dmarc_txt
#        CNAME onto the apex or www      legacy_apex_cname_records
#        any other CNAME                 legacy_mirror_cname_records
#        A                               legacy_mirror_a_records
#        MX                              legacy_mirror_mx_records
#        TXT                             legacy_mirror_txt_records
#      A TXT value the zone serves split into several character strings, as a
#      signing key longer than 255 bytes must be, is carried as one entry with
#      the provider's split marker (an escaped empty quote pair) at each of the
#      zone's own split points, so Route 53 serves the same strings.
#   2. Leaves alone every record another assignment owns: the zone's SOA and NS,
#      www (an alias onto the apex by design, so it must stay a CNAME onto the
#      apex here), the apex's other TXT strings (apex_txt_records), the Google
#      signing key (google_dkim_txt), each name and type the workspace_* maps
#      hold, and the obsolete SPF record type, whose TXT twin is carried. Their
#      values are proved after the re-sync by scripts/verify-zone-mirror.sh.
#   3. Shows the diff, writes the file through its symlink, reads it back, and
#      names the re-sync to run next, with --with-removals when it removed a name.
#
# What it refuses to do:
#   - Run against anything but production, the only tree holding the zone.
#   - Read a capture that is not a complete transfer.
#   - Carry a record no declared resource can hold (an AAAA, an SRV, a delegated
#     child zone, two addresses at one name, an apex sender policy split into
#     several strings, two reporting policies), or a name outside the zone:
#     each needs a Terraform change first.
#   - Write when a record another assignment owns has gone from the capture, or
#     www has changed shape: those are decisions for a person, not a transcription.
#   - Write a values file in which an assignment it owns is missing or repeated.
#   - Touch Route 53. The file changes here; scripts/resync-zone-mirror.sh applies.
#
# Usage:
#   bash scripts/write-zone-mirror-values.sh --target production \
#        --capture footbag_private_repo/evidence/zone-capture/<capture>.zone
#   bash scripts/write-zone-mirror-values.sh --target production --capture <file> --dry-run
#
#   --target    production. Required, with no default.
#   --capture   the fresh RFC-format capture (scripts/capture-legacy-zone.sh). Required.
#   --dry-run   shows the diff and writes nothing.
#
# Exits 0 when the file mirrors the capture, written or already so; 1 on a refusal;
# 2 on a usage error. A re-run on the same capture changes nothing and says so.

set -euo pipefail

TARGET=""
CAPTURE=""
DRY_RUN=0
DOMAIN="footbag.org"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2 || { echo "ERROR: --target requires a value" >&2; exit 2; }
      ;;
    --capture)
      CAPTURE="${2:-}"
      shift 2 || { echo "ERROR: --capture requires a path" >&2; exit 2; }
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      sed -n '2,/^[^#]/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "ERROR: --target is required (production)." >&2
  exit 2
fi
if [[ "$TARGET" != "production" ]]; then
  echo "ERROR: --target must be production: it is the only tree that holds the hosted zone (got '$TARGET')." >&2
  exit 2
fi
if [[ -z "$CAPTURE" ]]; then
  echo "ERROR: --capture is required: the fresh capture of the legacy zone to mirror." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$CAPTURE" != /* ]]; then
  CAPTURE="$(pwd)/$CAPTURE"
fi
cd "$REPO_ROOT"

# shellcheck source=lib/closing-report.sh
source "$REPO_ROOT/scripts/lib/closing-report.sh"
# shellcheck source=lib/host-env-remote.sh
source "$REPO_ROOT/scripts/lib/host-env-remote.sh"

if [[ ! -f "$CAPTURE" || ! -r "$CAPTURE" ]]; then
  cr_die "the capture is not a readable file: $CAPTURE"
fi

VALUES_LINK="terraform/$TARGET/terraform.tfvars"
if [[ ! -e "$VALUES_LINK" && ! -L "$VALUES_LINK" ]]; then
  echo "       The production values file lives in the private operations checkout;" >&2
  echo "       link the checkout (scripts/setup_private_repo.sh) first." >&2
  cr_die "no values file at $VALUES_LINK."
fi
if ! VALUES_FILE="$(resolve_tfvars_target "$VALUES_LINK" "$REPO_ROOT")"; then
  cr_die "the values file at $VALUES_LINK cannot be written safely. Nothing has changed."
fi

# The ten assignments this script owns, in the order they are reported.
SCALARS=(legacy_apex_ipv4 legacy_apex_spf legacy_dmarc_txt legacy_mx_records)
MAPS=(legacy_apex_cname_records legacy_mirror_a_records legacy_mirror_cname_records
      legacy_mirror_mx_records legacy_mirror_txt_records)

WORK="$(mktemp -d "${TMPDIR:-/tmp}/footbag-zone-mirror.XXXXXX")"
chmod 700 "$WORK"
cr_cleanup rm -rf "$WORK"

# Each assignment it owns must appear exactly once: Terraform takes the last of
# several, so a rewrite of the first would show one value and apply another.
for var in "${SCALARS[@]}" "${MAPS[@]}"; do
  count="$(grep -cE "^${var}[[:space:]]*=" "$VALUES_FILE" || [[ $? == 1 ]])"
  if [[ "$count" != 1 ]]; then
    cr_error "$var is assigned ${count} times in the values file; it must be assigned exactly once."
  fi
done
if (( ${#CR_ERRORS[@]} > 0 )); then
  cr_die "the values file is not in the shape this script rewrites. Nothing has changed."
fi

# The workspace maps' names, read with their record type: each name and type there
# belongs to the Google Workspace tenant, not to the legacy mirror.
awk '
  /^workspace_mx_records[[:space:]]*=/    { t = "MX";    inmap = 1; next }
  /^workspace_txt_records[[:space:]]*=/   { t = "TXT";   inmap = 1; next }
  /^workspace_cname_records[[:space:]]*=/ { t = "CNAME"; inmap = 1; next }
  inmap && /^}/ { inmap = 0; next }
  inmap && match($0, /^[[:space:]]*"[^"]+"[[:space:]]*=/) {
    key = substr($0, RSTART, RLENGTH); sub(/^[[:space:]]*"/, "", key); sub(/"[[:space:]]*=$/, "", key)
    print tolower(key) " " t
  }
' "$VALUES_FILE" | LC_ALL=C sort -u > "$WORK/owned-workspace"

# Step 1 and 2: one line per record, "kind<TAB>name<TAB>value", or a refusal.
# Names are relative labels; "@" is the apex.
awk -v domain="$DOMAIN" -v owned="$WORK/owned-workspace" -v out="$WORK/records" -v bad="$WORK/refusals" -v seen_owned="$WORK/owned-seen" '
  BEGIN {
    while ((getline line < owned) > 0) ws[line] = 1
    suffix = "." domain "."
  }
  /^[[:space:]]*$/ || /^[[:space:]]*;/ { next }
  {
    n++
    name = tolower($1); class = $3; type = toupper($4)
    if (class != "IN") { print "record " n " is not class IN: " $0 > bad; next }
    if (n == 1 && type != "SOA") { first_not_soa = 1 }
    last_type = type
    value = $0
    # Drop the first four fields and the whitespace after them, keeping the value
    # exactly as served.
    for (i = 1; i <= 4; i++) sub(/^[^[:space:]]+[[:space:]]+/, "", value)
    sub(/[[:space:]]+$/, "", value)

    if (name == domain ".") label = "@"
    else if (length(name) > length(suffix) && substr(name, length(name) - length(suffix) + 1) == suffix)
      label = substr(name, 1, length(name) - length(suffix))
    else { print "a name outside the zone: " $1 > bad; next }

    if (type == "SOA") next
    if (type == "SPF") next
    if (label == "@" && type == "NS") next
    if (type == "NS") { print "a delegated child zone at " label ": no resource carries it" > bad; next }

    if (type == "TXT") {
      txt = value
      if (txt !~ /^".*"$/) { print "an unquoted TXT at " label ": " value > bad; next }
      multi = (txt ~ /"[[:space:]]+"/)
      txt = substr(txt, 2, length(txt) - 2)
      # The provider splits a value at an empty quote pair, so a value the zone
      # serves as several strings keeps the split points the zone uses.
      if (multi) gsub(/"[[:space:]]+"/, "\"\"", txt)
    }

    if ((label " " type) in ws) { print label " " type > seen_owned; next }
    if (label == "google._domainkey" && type == "TXT") { print label " " type > seen_owned; next }
    if (label == "www") {
      if (type == "CNAME" && tolower(value) == domain ".") { print "www CNAME" > seen_owned; next }
      print "www is now " type " " value ": the mirror holds www as an alias onto the apex, so this needs a person and a Terraform change" > bad; next
    }
    if (label == "@" && type == "TXT" && txt !~ /^v=spf1[[:space:]]/) { print "@ TXT-OTHER " txt > seen_owned; next }

    if (type == "TXT" && multi && label == "@") { print "an apex sender policy split into several strings: legacy_apex_spf carries one" > bad; next }
    if (label == "_dmarc" && type == "TXT") { print "DMARC\t_dmarc\t" txt > out; next }

    if (label == "@") {
      if (type == "A")   { print "APEX_A\t@\t" value > out; next }
      if (type == "MX")  { print "APEX_MX\t@\t" value > out; next }
      if (type == "TXT") { print "APEX_SPF\t@\t" txt > out; next }
      print "an apex " type " record: no resource carries it" > bad; next
    }
    if (type == "CNAME") {
      t = tolower(value)
      if (t == domain "." || t == "www." domain ".") print "APEX_CNAME\t" label "\t" value > out
      else print "CNAME\t" label "\t" value > out
      next
    }
    if (type == "A")   { print "A\t" label "\t" value > out; next }
    if (type == "MX")  { print "MX\t" label "\t" value > out; next }
    if (type == "TXT") { print "TXT\t" label "\t" txt > out; next }
    print "a " type " record at " label ": no resource carries it" > bad
  }
  END {
    if (n == 0 || first_not_soa || last_type != "SOA")
      print "the capture is not a complete transfer: it must open and close with the SOA record" > bad
    close(out); close(bad); close(seen_owned)
  }
' "$CAPTURE"
touch "$WORK/records" "$WORK/refusals" "$WORK/owned-seen"
LC_ALL=C sort -u -o "$WORK/records" "$WORK/records"

while IFS= read -r line; do
  cr_error "$line"
done < "$WORK/refusals"

# One value per name where the resource holds one.
for kind in APEX_A APEX_SPF DMARC A CNAME APEX_CNAME; do
  dups="$(awk -F'\t' -v k="$kind" '$1 == k { c[$2]++ } END { for (n in c) if (c[n] > 1) print n }' "$WORK/records")"
  for name in $dups; do
    cr_error "$name carries more than one $kind record: the resource holds one value per name."
  done
done
for kind in APEX_A APEX_SPF APEX_MX; do
  if ! grep -q "^${kind}	" "$WORK/records"; then
    cr_error "the capture holds no apex ${kind#APEX_} record: the mirror needs one, and a legacy apex without one is a decision for a person."
  fi
done

# A record another assignment owns that has gone from the capture would leave the
# mirror serving what the legacy zone no longer does.
while IFS= read -r pair; do
  [[ -z "$pair" ]] && continue
  if ! grep -qxF "$pair" "$WORK/owned-seen"; then
    cr_error "the capture no longer holds ${pair}, which a workspace map carries: removing it is the IFPA secretary's ruling, not a transcription."
  fi
done < "$WORK/owned-workspace"
if ! grep -qxF "www CNAME" "$WORK/owned-seen" && ! grep -q "^www is now" "$WORK/refusals"; then
  cr_error "the capture holds no www record: the mirror serves www as an alias onto the apex, so this needs a person."
fi

if (( ${#CR_ERRORS[@]} > 0 )); then
  cr_die "the capture cannot be mirrored as it stands. Nothing has changed."
fi

# HCL string escaping for a value read from the zone.
hcl() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '"%s"' "$s"
}

# Render one owned assignment's value, as the text after "= ".
render() {
  local var="$1" kind width
  case "$var" in
    legacy_apex_ipv4) hcl "$(awk -F'\t' '$1 == "APEX_A" { print $3 }' "$WORK/records")" ;;
    legacy_apex_spf)  hcl "$(awk -F'\t' '$1 == "APEX_SPF" { print $3 }' "$WORK/records")" ;;
    legacy_dmarc_txt) hcl "$(awk -F'\t' '$1 == "DMARC" { print $3 }' "$WORK/records")" ;;
    legacy_mx_records)
      awk -F'\t' '$1 == "APEX_MX" { print $3 }' "$WORK/records" | LC_ALL=C sort -n -k1,1 -k2,2 \
        | awk 'BEGIN { printf "[" } { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); printf "%s\"%s\"", (NR > 1 ? ", " : ""), $0 } END { printf "]" }'
      ;;
    *)
      case "$var" in
        legacy_apex_cname_records)   kind=APEX_CNAME ;;
        legacy_mirror_a_records)     kind=A ;;
        legacy_mirror_cname_records) kind=CNAME ;;
        legacy_mirror_mx_records)    kind=MX ;;
        legacy_mirror_txt_records)   kind=TXT ;;
      esac
      awk -F'\t' -v k="$kind" '
        $1 == k { names[$2] = 1; vals[$2] = vals[$2] SUBSEP $3; if (length($2) + 2 > w) w = length($2) + 2 }
        END {
          count = 0
          for (n in names) order[++count] = n
          if (count == 0) { printf "{}"; exit }
          # Byte order, so a re-run on the same capture renders the same text.
          for (i = 2; i <= count; i++) { v = order[i]; j = i - 1; while (j > 0 && order[j] > v) { order[j + 1] = order[j]; j-- } order[j + 1] = v }
          printf "{\n"
          for (i = 1; i <= count; i++) {
            n = order[i]
            np = split(substr(vals[n], 2), parts, SUBSEP)
            out = ""
            for (p = 1; p <= np; p++) { s = parts[p]; gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); parts[p] = "\"" s "\"" }
            if (k == "MX" || k == "TXT") {
              # A list per name, sorted so the order the transfer happened to use
              # never shows as a change.
              for (a = 2; a <= np; a++) { v = parts[a]; b = a - 1; while (b > 0 && parts[b] > v) { parts[b + 1] = parts[b]; b-- } parts[b + 1] = v }
              out = "["; for (p = 1; p <= np; p++) out = out (p > 1 ? ", " : "") parts[p]; out = out "]"
            } else out = parts[1]
            printf ("  %-" w "s = %s\n"), "\"" n "\"", out
          }
          printf "}"
        }' "$WORK/records"
      ;;
  esac
}

for var in "${SCALARS[@]}" "${MAPS[@]}"; do
  render "$var" > "$WORK/value.$var"
done

# Rewrite: each owned assignment keeps its own line's prefix (name and alignment)
# and takes the rendered value; a map's old body, up to its closing brace at the
# start of a line, is dropped. Everything else, comments included, passes through.
OWNED_LIST="$(printf '%s\n' "${SCALARS[@]}" "${MAPS[@]}")" WORK_DIR="$WORK" awk '
  BEGIN { n = split(ENVIRON["OWNED_LIST"], v, "\n"); for (i = 1; i <= n; i++) if (v[i] != "") owned[v[i]] = 1 }
  skipping { if ($0 ~ /^}[[:space:]]*$/) skipping = 0; next }
  {
    if (match($0, /^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[[:space:]]*/)) {
      head = substr($0, 1, RLENGTH); name = head; sub(/[[:space:]]*=.*/, "", name)
      if (name in owned) {
        rest = substr($0, RLENGTH + 1)
        if (rest ~ /^\[/ && rest !~ /][[:space:]]*$/) {
          print "ERROR: " name " is a list written over several lines; write it on one line first." > "/dev/stderr"
          exit 3
        }
        if (rest ~ /^\{/ && rest !~ /}[[:space:]]*$/) skipping = 1
        file = ENVIRON["WORK_DIR"] "/value." name
        value = ""; while ((getline l < file) > 0) value = value (value == "" ? "" : "\n") l; close(file)
        print head value
        next
      }
    }
    print
  }
' "$VALUES_FILE" > "$WORK/new.tfvars" || cr_die "the values file could not be rewritten (above). Nothing has changed."

# What the rewrite removes, by assignment and name, so the re-sync is told to
# expect each removal rather than meeting it in a plan.
old_keys() {
  awk -v var="$2" '
    $0 ~ "^" var "[[:space:]]*=" { inmap = ($0 !~ /}[[:space:]]*$/); next }
    inmap && /^}/ { inmap = 0; next }
    inmap && match($0, /^[[:space:]]*"[^"]+"[[:space:]]*=/) {
      key = substr($0, RSTART, RLENGTH); sub(/^[[:space:]]*"/, "", key); sub(/"[[:space:]]*=$/, "", key); print key
    }' "$1" | LC_ALL=C sort -u
}
REMOVED=()
for var in "${MAPS[@]}"; do
  while IFS= read -r key; do
    [[ -n "$key" ]] && REMOVED+=("${var}[\"${key}\"]")
  done < <(LC_ALL=C comm -23 <(old_keys "$VALUES_FILE" "$var") <(old_keys "$WORK/new.tfvars" "$var"))
done

RESYNC="bash scripts/resync-zone-mirror.sh --target $TARGET --capture $CAPTURE"
(( ${#REMOVED[@]} > 0 )) && RESYNC="$RESYNC --with-removals"

echo "== write zone mirror values: $TARGET =="
echo "  capture:      $CAPTURE"
echo "  values file:  $VALUES_FILE"
echo "  records:      $(wc -l < "$WORK/records" | tr -d ' ') mirrored, $(wc -l < "$WORK/owned-seen" | tr -d ' ') left to their owners"
echo ""

if cmp -s "$VALUES_FILE" "$WORK/new.tfvars"; then
  echo "The values file already mirrors this capture. Nothing to write."
  echo "Next, if Route 53 has not yet been re-synced to it:"
  echo "  $RESYNC"
  cr_proved "the values file mirrors the capture (no change needed)"
  cr_unproved "that Route 53 serves it: the re-sync above applies and checks"
  cr_finish
fi

echo "-- The change to the values file --"
diff -u --label "values file (now)" --label "values file (from the capture)" \
  "$VALUES_FILE" "$WORK/new.tfvars" || [[ $? == 1 ]]
echo ""
if (( ${#REMOVED[@]} > 0 )); then
  echo "Names the capture no longer holds, removed from the mirror:"
  printf '  %s\n' "${REMOVED[@]}"
  echo ""
fi

if (( DRY_RUN )); then
  cr_unproved "the rewrite (a dry run writes nothing)"
  cr_finish
fi

# Through the symlink's target, in place, so the link into the private checkout
# survives and the file keeps its mode.
cat "$WORK/new.tfvars" > "$VALUES_FILE"
if ! cmp -s "$VALUES_FILE" "$WORK/new.tfvars"; then
  cr_die "the values file does not read back as written: $VALUES_FILE"
fi
echo "Written: $VALUES_FILE"
echo "Next, in a terminal (it asks for APPLY twice):"
echo "  $RESYNC"
cr_proved "the values file mirrors the capture (written and read back)"
if (( ${#REMOVED[@]} > 0 )); then
  cr_unproved "that Route 53 serves it: the re-sync above, with --with-removals for the ${#REMOVED[@]} removed name(s)"
else
  cr_unproved "that Route 53 serves it: the re-sync above applies and checks"
fi
cr_finish
