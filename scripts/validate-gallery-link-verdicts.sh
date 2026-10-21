#!/usr/bin/env bash
# scripts/validate-gallery-link-verdicts.sh -- asserts every gallery external
# link in the target database carries a safety verdict.
#
# A gallery's external links are hidden from the public until they are verified:
# the public read shows a link only once it is stamped verified and is not
# quarantined. The curator seed takes those verdicts from the committed verdicts
# file beside the gallery sidecars, and when that file is missing it seeds every
# link unverified, so every gallery launches with all of its external links
# hidden and nothing else notices. This gate refuses such a database, naming the
# count and the galleries, so a production ship cannot carry hidden links.
#
# A quarantined link is a verdict, not a gap: it is hidden on purpose and the
# admin pages surface it. Only a link with neither a verification stamp nor a
# quarantine reason fails here.
#
# Reads FOOTBAG_DB_PATH (default: ./database/footbag.db).

set -euo pipefail
# Streamed to a host and run from a process substitution, $0 is not a file and
# there is no checkout to move into; the database then comes from FOOTBAG_DB_PATH.
if [[ -f "$0" ]]; then
  cd "$(dirname "$0")/.."
fi

DB_FILE="${FOOTBAG_DB_PATH:-./database/footbag.db}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "GATE: GALLERY-LINK-VERDICTS FAIL: DB not found at ${DB_FILE}"
  exit 1
fi

UNVERIFIED_WHERE="validated_at IS NULL AND quarantine_reason IS NULL"
unverified=$(sqlite3 -readonly "${DB_FILE}" "SELECT COUNT(*) FROM gallery_external_links WHERE ${UNVERIFIED_WHERE};")

if [[ "${unverified}" -gt 0 ]]; then
  galleries=$(sqlite3 -readonly "${DB_FILE}" "SELECT GROUP_CONCAT(gallery_id, ', ') FROM (SELECT DISTINCT gallery_id FROM gallery_external_links WHERE ${UNVERIFIED_WHERE} ORDER BY gallery_id);")
  echo "GATE: GALLERY-LINK-VERDICTS FAIL: ${unverified} gallery external link(s) carry no safety verdict and would be hidden from the public (galleries: ${galleries}). Generate curated/galleries/url_verdicts.json with npm run verify:seed-urls -- --galleries-only, commit it, and rebuild the database." >&2
  exit 1
fi

total=$(sqlite3 -readonly "${DB_FILE}" "SELECT COUNT(*) FROM gallery_external_links;")
echo "GATE: GALLERY-LINK-VERDICTS PASS: all ${total} gallery external link(s) carry a verdict"
exit 0
